const menuBtn = document.getElementById('menuBtn');
const nav = document.getElementById('siteNav');
if (menuBtn) menuBtn.addEventListener('click', ()=>{
  const open = nav.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', String(open));
});
if (nav) nav.querySelectorAll('a').forEach(a=>a.addEventListener('click', ()=>{
  nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded','false');
}));
const head = document.getElementById('siteHead');
addEventListener('scroll', ()=>{ head.classList.toggle('scrolled', scrollY > 10); }, {passive:true});

/* ---- inquiry form: submits to /api/inquiry; on failure shows mailto / WhatsApp handoff ---- */
function wireDemoForm(formId, noteId, subject){
  const M = window.I18N_MSG || {};
  const form = document.getElementById(formId);
  if (!form) return;
  const note = document.getElementById(noteId);
  const h3 = note.querySelector('h3'), p = note.querySelector('p'), small = note.querySelector('small');
  const orig = { h3: h3.textContent, p: p.innerHTML, small: small ? small.textContent : '' };
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    data.append('_page', location.pathname);
    data.append('_subject', subject);
    let lines = [];
    for (const [k,v] of data.entries()){
      if (v && typeof v === 'string' && k !== 'company_website' && k.charAt(0) !== '_') lines.push(k + ': ' + v);
    }
    const body = encodeURIComponent(lines.join('\n'));
    const mail = note.querySelector('.demo-mail');
    mail.href = 'mailto:steffy@huayienviron.com?subject=' + encodeURIComponent(subject) + '&body=' + body;
    const wa = note.querySelector('.demo-wa');
    wa.href = 'https://wa.me/8613360213795?text=' + encodeURIComponent('[Website inquiry]\n' + lines.join('\n'));
    const btn = form.querySelector('[type="submit"], button:not([type])');
    if (btn){ btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = M.sending || 'Sending\u2026'; }
    let sent = false;
    try {
      const res = await fetch('/api/inquiry', { method: 'POST', body: data });
      sent = res.ok;
    } catch (err) { sent = false; }
    if (btn){ btn.disabled = false; btn.textContent = btn.dataset.label; }
    if (sent){
      h3.textContent = M.sent_h3 || 'Inquiry sent \u2014 thank you';
      p.innerHTML = M.sent_p || 'Your inquiry has been delivered to our team at <strong>steffy@huayienviron.com</strong>. We reply within 24 hours. You may also send a copy via the buttons below.';
      if (small) small.textContent = M.sent_small || 'A copy of what you entered is prefilled in the email / WhatsApp buttons.';
      form.reset();
    } else {
      h3.textContent = orig.h3; p.innerHTML = orig.p; if (small) small.textContent = orig.small;
    }
    note.classList.add('show');
    note.scrollIntoView({behavior:'smooth', block:'center'});
  });
}
/* ---- certificate modal ---- */
const certModal = document.getElementById('certModal');
if (certModal){
  const modalName = document.getElementById('certModalName');
  const modalImg = document.getElementById('certModalImg');
  let lastFocus = null;
  function openCert(name, src, trigger){
    lastFocus = trigger || null;
    modalName.textContent = name;
    modalImg.src = src; modalImg.alt = name + ' certificate';
    certModal.hidden = false;
    document.getElementById('certClose').focus();
  }
  document.querySelectorAll('[data-cert-src]').forEach(el=>{
    el.addEventListener('click', ()=> openCert(el.dataset.cert, el.dataset.certSrc, el));
  });
  function closeModal(){ certModal.hidden = true; if(lastFocus) lastFocus.focus(); }
  document.getElementById('certClose').addEventListener('click', closeModal);
  certModal.addEventListener('click', e=>{ if(e.target === certModal) closeModal(); });
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && !certModal.hidden) closeModal(); });
}
