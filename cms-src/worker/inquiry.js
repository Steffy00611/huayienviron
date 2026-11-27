// Inquiry intake: save to D1 FIRST (source of truth), then try the email
// notification. If email fails, the record is still safe and flagged.
import { json, isTestData } from './util.js';

const TO = 'steffy@huayienviron.com';
const FROM = 'Huayi Website <onboarding@resend.dev>';

const ALLOWED_FILE = /^(image\/(jpeg|png)|application\/(pdf|zip|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)))$/;
const ALLOWED_EXT = /\.(jpe?g|png|pdf|zip|docx?|xlsx?)$/i;

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

export async function handleInquiry(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  let form;
  try { form = await request.formData(); }
  catch { return json({ ok: false, error: 'bad_request' }, 400); }

  const fields = {};
  let attachment = null;
  for (const [k, v] of form.entries()) {
    if (typeof v === 'string') {
      fields[k] = v.trim();
    } else if (v && typeof v === 'object' && v.name && v.size > 0) {
      if (v.size > 5 * 1024 * 1024) return json({ ok: false, error: 'file_too_large' }, 413);
      if (!ALLOWED_EXT.test(v.name) || !ALLOWED_FILE.test(v.type || '')) {
        return json({ ok: false, error: 'file_type_not_allowed' }, 415);
      }
      attachment = v;
    }
  }

  // Honeypot: hidden field must stay empty. Bots that fill it get a silent OK.
  if (fields['company_website']) return json({ ok: true });

  const lower = {};
  for (const [k, v] of Object.entries(fields)) lower[k.toLowerCase()] = v;
  const pick = (...keys) => { for (const k of keys) { if (lower[k]) return lower[k]; } return ''; };

  const name = pick('name').slice(0, 120);
  const email = pick('email').slice(0, 200);
  const wa = pick('whatsapp or mobile', 'whatsapp').slice(0, 60);
  if (!name || (!email && !wa)) return json({ ok: false, error: 'missing_contact' }, 422);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'bad_email' }, 422);
  }

  // 1) Persist first.
  const skip = new Set(['company_website', '_page', '_subject']);
  const rows = Object.entries(fields).filter(([k, v]) => v && !skip.has(k.toLowerCase()));
  const fieldsJson = Object.fromEntries(rows.map(([k, v]) => [k, v.slice(0, 2000)]));
  const testFlag = isTestData(name) || isTestData(pick('message')) || isTestData(pick('other requirements'));

  let attachment_key = '';
  if (attachment && env.MEDIA) {
    const ext = (attachment.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    attachment_key = 'inquiry/' + crypto.randomUUID() + ext;
    await env.MEDIA.put(attachment_key, attachment.stream(), {
      httpMetadata: { contentType: attachment.type },
    });
  }

  const page = (fields['_page'] || '').slice(0, 120);
  const subject = (fields['_subject'] || 'Website inquiry').slice(0, 120);
  const ins = await env.DB.prepare(
    `INSERT INTO inquiries (page, subject, name, email, whatsapp, country, equip_type, message,
       fields_json, attachment_key, attachment_name, email_status, is_test)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(page, subject, name, email, wa, pick('country').slice(0, 80),
      pick('equipment type', 'type').slice(0, 120),
      pick('message', 'other requirements').slice(0, 4000),
      JSON.stringify(fieldsJson), attachment_key,
      attachment ? attachment.name.slice(0, 100) : '', 'pending', testFlag ? 1 : 0)
    .run();
  const inquiryId = ins.meta.last_row_id;

  // 2) Then try the email notification.
  let emailStatus = 'skipped';
  if (env.RESEND_API_KEY) {
    try {
      const textBody = `New inquiry #${inquiryId} from the website` + (page ? ` (page: ${page})` : '') +
        '\nSubmitted: ' + new Date().toISOString() + '\n\n' +
        rows.map(([k, v]) => k + ': ' + v.slice(0, 2000)).join('\n') + '\n' +
        (attachment ? `\nAttachment: ${attachment.name} (stored in the admin panel, inquiry #${inquiryId})\n` : '');
      const htmlBody =
        '<h2 style="font-family:sans-serif">New website inquiry #' + inquiryId + '</h2>' +
        (page ? '<p style="color:#666;font-family:sans-serif">Page: ' + esc(page) + '</p>' : '') +
        '<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">' +
        rows.map(([k, v]) =>
          '<tr><td style="border:1px solid #ddd;padding:6px 10px;font-weight:600;vertical-align:top">' +
          esc(k) + '</td><td style="border:1px solid #ddd;padding:6px 10px;white-space:pre-wrap">' +
          esc(v.slice(0, 2000)) + '</td></tr>').join('') +
        '</table>' +
        (attachment ? '<p style="font-family:sans-serif;color:#666">Attachment stored in the admin panel (inquiry #' + inquiryId + ').</p>' : '');
      const payload = {
        from: FROM, to: [TO],
        subject: ('[Huayi Site] ' + subject + ' — ' + name).slice(0, 200),
        text: textBody, html: htmlBody,
      };
      if (email) payload.reply_to = email;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'authorization': 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      emailStatus = res.ok ? 'sent' : 'failed';
    } catch {
      emailStatus = 'failed';
    }
  }
  await env.DB.prepare('UPDATE inquiries SET email_status = ? WHERE id = ?')
    .bind(emailStatus, inquiryId).run();

  return json({ ok: true, id: inquiryId });
}
