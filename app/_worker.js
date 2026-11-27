var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// cms-src/worker/util.js
var util_exports = {};
__export(util_exports, {
  esc: () => esc,
  getCookie: () => getCookie,
  html: () => html,
  isTestData: () => isTestData,
  json: () => json,
  redirect: () => redirect,
  slugify: () => slugify
});
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });
}
function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers }
  });
}
function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
function redirect(to, status = 302) {
  return new Response(null, { status, headers: { location: to } });
}
function getCookie(request, name) {
  const c = request.headers.get("cookie") || "";
  for (const part of c.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
function isTestData(text) {
  return /\[test\]|test-/i.test(text || "");
}
var init_util = __esm({
  "cms-src/worker/util.js"() {
  }
});

// cms-src/worker/auth.js
var auth_exports = {};
__export(auth_exports, {
  clearCookie: () => clearCookie,
  createSession: () => createSession,
  currentAdmin: () => currentAdmin,
  destroySession: () => destroySession,
  hashPassword: () => hashPassword,
  sessionCookie: () => sessionCookie,
  verifyPassword: () => verifyPassword
});
function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password, saltHex) {
  const salt = saltHex ? new Uint8Array(saltHex.match(/.{2}/g).map((b) => parseInt(b, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" },
    key,
    256
  );
  return { hash: toHex(bits), salt: toHex(salt) };
}
async function verifyPassword(password, saltHex, expectedHash) {
  const { hash } = await hashPassword(password, saltHex);
  if (hash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}
async function createSession(db, adminId) {
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + 7 * 864e5).toISOString();
  await db.prepare("INSERT INTO sessions (token, admin_id, expires_at) VALUES (?,?,?)").bind(token, adminId, expires).run();
  return { token, expires };
}
function sessionCookie(token, expires) {
  return `huayi_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${new Date(expires).toUTCString()}`;
}
function clearCookie() {
  return "huayi_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}
async function currentAdmin(request, db) {
  const { getCookie: getCookie2 } = await Promise.resolve().then(() => (init_util(), util_exports));
  const token = getCookie2(request, "huayi_admin");
  if (!token) return null;
  const row = await db.prepare(
    `SELECT a.id, a.username FROM sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();
  return row || null;
}
async function destroySession(db, request) {
  const { getCookie: getCookie2 } = await Promise.resolve().then(() => (init_util(), util_exports));
  const token = getCookie2(request, "huayi_admin");
  if (token) await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}
var enc;
var init_auth = __esm({
  "cms-src/worker/auth.js"() {
    enc = new TextEncoder();
  }
});

// cms-src/worker/index.js
init_util();
init_auth();

// cms-src/worker/inquiry.js
init_util();
var TO = "steffy@huayienviron.com";
var FROM = "Huayi Website <onboarding@resend.dev>";
var ALLOWED_FILE = /^(image\/(jpeg|png)|application\/(pdf|zip|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)))$/;
var ALLOWED_EXT = /\.(jpe?g|png|pdf|zip|docx?|xlsx?)$/i;
function esc2(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}
async function handleInquiry(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }
  const fields = {};
  let attachment = null;
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") {
      fields[k] = v.trim();
    } else if (v && typeof v === "object" && v.name && v.size > 0) {
      if (v.size > 5 * 1024 * 1024) return json({ ok: false, error: "file_too_large" }, 413);
      if (!ALLOWED_EXT.test(v.name) || !ALLOWED_FILE.test(v.type || "")) {
        return json({ ok: false, error: "file_type_not_allowed" }, 415);
      }
      attachment = v;
    }
  }
  if (fields["company_website"]) return json({ ok: true });
  const lower = {};
  for (const [k, v] of Object.entries(fields)) lower[k.toLowerCase()] = v;
  const pick = (...keys) => {
    for (const k of keys) {
      if (lower[k]) return lower[k];
    }
    return "";
  };
  const name = pick("name").slice(0, 120);
  const email = pick("email").slice(0, 200);
  const wa = pick("whatsapp or mobile", "whatsapp").slice(0, 60);
  if (!name || !email && !wa) return json({ ok: false, error: "missing_contact" }, 422);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "bad_email" }, 422);
  }
  const skip = /* @__PURE__ */ new Set(["company_website", "_page", "_subject"]);
  const rows = Object.entries(fields).filter(([k, v]) => v && !skip.has(k.toLowerCase()));
  const fieldsJson = Object.fromEntries(rows.map(([k, v]) => [k, v.slice(0, 2e3)]));
  const testFlag = isTestData(name) || isTestData(pick("message")) || isTestData(pick("other requirements"));
  let attachment_key = "";
  if (attachment && env.MEDIA) {
    const ext = (attachment.name.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
    attachment_key = "inquiry/" + crypto.randomUUID() + ext;
    await env.MEDIA.put(attachment_key, attachment.stream(), {
      httpMetadata: { contentType: attachment.type }
    });
  }
  const page = (fields["_page"] || "").slice(0, 120);
  const subject = (fields["_subject"] || "Website inquiry").slice(0, 120);
  const ins = await env.DB.prepare(
    `INSERT INTO inquiries (page, subject, name, email, whatsapp, country, equip_type, message,
       fields_json, attachment_key, attachment_name, email_status, is_test)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    page,
    subject,
    name,
    email,
    wa,
    pick("country").slice(0, 80),
    pick("equipment type", "type").slice(0, 120),
    pick("message", "other requirements").slice(0, 4e3),
    JSON.stringify(fieldsJson),
    attachment_key,
    attachment ? attachment.name.slice(0, 100) : "",
    "pending",
    testFlag ? 1 : 0
  ).run();
  const inquiryId = ins.meta.last_row_id;
  let emailStatus = "skipped";
  if (env.RESEND_API_KEY) {
    try {
      const textBody = `New inquiry #${inquiryId} from the website` + (page ? ` (page: ${page})` : "") + "\nSubmitted: " + (/* @__PURE__ */ new Date()).toISOString() + "\n\n" + rows.map(([k, v]) => k + ": " + v.slice(0, 2e3)).join("\n") + "\n" + (attachment ? `
Attachment: ${attachment.name} (stored in the admin panel, inquiry #${inquiryId})
` : "");
      const htmlBody = '<h2 style="font-family:sans-serif">New website inquiry #' + inquiryId + "</h2>" + (page ? '<p style="color:#666;font-family:sans-serif">Page: ' + esc2(page) + "</p>" : "") + '<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">' + rows.map(([k, v]) => '<tr><td style="border:1px solid #ddd;padding:6px 10px;font-weight:600;vertical-align:top">' + esc2(k) + '</td><td style="border:1px solid #ddd;padding:6px 10px;white-space:pre-wrap">' + esc2(v.slice(0, 2e3)) + "</td></tr>").join("") + "</table>" + (attachment ? '<p style="font-family:sans-serif;color:#666">Attachment stored in the admin panel (inquiry #' + inquiryId + ").</p>" : "");
      const payload = {
        from: FROM,
        to: [TO],
        subject: ("[Huayi Site] " + subject + " \u2014 " + name).slice(0, 200),
        text: textBody,
        html: htmlBody
      };
      if (email) payload.reply_to = email;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "authorization": "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      emailStatus = res.ok ? "sent" : "failed";
    } catch {
      emailStatus = "failed";
    }
  }
  await env.DB.prepare("UPDATE inquiries SET email_status = ? WHERE id = ?").bind(emailStatus, inquiryId).run();
  return json({ ok: true, id: inquiryId });
}

// cms-src/worker/analytics.js
var SE_BOTS = /googlebot|bingbot|baiduspider|yandex(bot|images)|duckduckbot|slurp|sogou|exabot|applebot/i;
var OTHER_BOTS = /bot|crawler|spider|scraper|curl|wget|python-requests|httpclient|headlesschrome|phantomjs|lighthouse|pingdom|uptime/i;
function classify(ua) {
  if (!ua) return "bot";
  if (SE_BOTS.test(ua)) return "se-bot";
  if (OTHER_BOTS.test(ua)) return "bot";
  return "human";
}
function logPageView(ctx, env, request, path) {
  const ua = request.headers.get("user-agent") || "";
  const ref = request.headers.get("referer") || "";
  const country = request.cf && request.cf.country || "";
  const bot = classify(ua);
  const test = /\[test\]|test-visit/i.test(ref) ? 1 : 0;
  const stmt = env.DB.prepare(
    "INSERT INTO page_views (path, referrer, ua, country, bot_type, is_test) VALUES (?,?,?,?,?,?)"
  ).bind(path.slice(0, 200), ref.slice(0, 300), ua.slice(0, 300), country, bot, test);
  ctx.waitUntil(stmt.run().catch(() => {
  }));
}

// cms-src/worker/chunks.js
var HEADER = '<header class="site-head" id="siteHead">\n  <a class="brand" href="/"><strong>Innovation Huayi</strong><span>Environmental Engineering</span></a>\n  <button class="menu-btn" id="menuBtn" type="button" aria-expanded="false" aria-controls="siteNav"><span></span><span></span><span></span><em>Menu</em></button>\n  <nav class="site-nav" id="siteNav" aria-label="Main"><div class="nav-item"><a href="/products">Products</a><div class="nav-drop"><a href="/products-wastewater-treatment">Wastewater Treatment</a><a href="/products-solid-liquid-separation">Solid-Liquid Separation</a><a href="/products-waste-incineration">Waste Incineration</a><a href="/products">All Products \u2192</a></div></div><div class="nav-item plain"><a href="/get-a-solution">Get a Solution</a></div><div class="nav-item plain"><a href="/services">Services</a></div><div class="nav-item plain"><a href="/case-studies">Case Studies</a></div><div class="nav-item plain"><a href="/factory">Factory</a></div><div class="nav-item plain"><a href="/about-us">About Us</a></div><div class="nav-item plain"><a href="/contact-us">Contact</a></div></nav>\n  <a class="head-cta" href="/#inquiry">Get a Quote</a>\n</header>';
var FOOTER = '<footer class="site-foot">\n  <p class="foot-company">Shandong Innovation Huayi Environmental Engineering Co., Ltd.</p>\n  <p class="foot-addr">Mizhou Industrial Avenue, Zhucheng, Shandong, China \uFF5C <a href="mailto:steffy@huayienviron.com">steffy@huayienviron.com</a> \uFF5C <a href="https://wa.me/8613360213795" target="_blank" rel="noopener">+86 13360213795</a></p>\n  <nav class="foot-nav" aria-label="Footer">\n    <a href="/products">Products</a><a href="/services">Services</a>\n    <a href="/case-studies">Case Studies</a><a href="/factory">Factory</a>\n    <a href="/certifications">Certifications</a><a href="/faq">FAQ</a>\n    <a href="/blog">Blog</a><a href="/privacy-policy">Privacy Policy</a>\n    <a href="/terms-of-use">Terms of Use</a><a href="/cookie-policy">Cookie Policy</a>\n  </nav>\n  <p class="foot-copy">\xA9 2026 Shandong Innovation Huayi Environmental Engineering Co., Ltd.</p>\n</footer>\n<a class="wa-float" href="https://wa.me/8613360213795" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">\n  <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.6.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.5-1.2a.6.6 0 0 0 0-.5c0-.1-.6-1.4-.8-1.9s-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.1 5 5 0 0 0 1 2.7 11.4 11.4 0 0 0 4.4 3.9 5 5 0 0 0 3 .9 2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .1-1.2c0-.1-.3-.2-.6-.3z"/></svg>\n</a>\n<div class="toast" id="toast" role="status"></div>\n<div class="cert-modal" id="certModal" role="dialog" aria-modal="true" aria-label="Certificate preview" hidden>\n  <div class="cert-modal-box">\n    <button class="cert-modal-close" id="certClose" type="button" aria-label="Close">\xD7</button>\n    <div class="cert-modal-img"><img id="certModalImg" alt="Certificate scan"></div>\n    <p class="cert-modal-name" id="certModalName"></p>\n  </div>\n</div>\n';
var CTA = '<section class="cta-band">\n  <div class="wrap">\n    <h2>Tell us your water conditions.</h2>\n    <p>Get a technical proposal within 24 hours.</p>\n    <a class="btn" href="/get-a-solution">Get a Free Proposal</a>\n    <a class="btn ghost" href="https://wa.me/8613360213795" target="_blank" rel="noopener">WhatsApp Us</a>\n  </div>\n</section>';
var FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Mulish:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">';
var INDEX_PART1 = '<main id="top">\n  <!-- \u2460 Hero -->\n  <section class="hero" id="hero">\n    <img class="ph-hero" src="assets/hero.jpg" alt="Aerial view of the Innovation Huayi factory in Zhucheng, Shandong" loading="lazy">\n    <div class="hero-inner">\n      <p class="eyebrow">Building Sustainable Solutions for Cleaner Water</p>\n      <h1>Wastewater Treatment, Built to Order</h1>\n      <p class="hero-sub">We manufacture solid-liquid separation and wastewater treatment equipment for EPC contractors, distributors and industrial plants, exported to 50+ countries.</p>\n      <p class="trust-line"><span>17+ Years</span><span>ISO 9001 &amp; CE Certified</span><span>40+ Patents</span></p>\n      <a class="cta" href="/get-a-solution">Get a Free Proposal</a>\n    </div>\n  </section>\n\n  <!-- \u2461 Featured Products -->\n  ';
var INDEX_PART2A = '\n\n  <!-- \u2462 Who We Serve -->\n  <section class="serve dark" id="serve">\n    <header class="sec-head"><span class="sec-num">03</span><h2>Who We Work With</h2></header>\n    <ul class="serve-list"><li>EPC Contractors & Engineering Firms</li><li>Distributors & Agents (OEM & ODM)</li><li>Municipal Wastewater Plants</li><li>Food & Beverage Processors</li><li>Textile Dyeing, Pulp & Paper Mills</li><li>Mining & Metallurgy</li><li>Livestock & Dairy Farms</li><li>Sludge Treatment Centers</li></ul>\n    <p class="serve-note">Products sold across 30+ provinces in China and exported to Russia, Iran, Vietnam, Bangladesh, Jordan, Peru, Saudi Arabia, Mexico, Brazil, Kenya and 40+ other countries.</p>\n  </section>\n\n  <!-- \u2463 By the Numbers -->\n  <section class="numbers band" id="numbers"><div class="stats"><div class="stat"><span class="stat-num">17+</span><span class="stat-label">Years in operation since 2009</span></div><div class="stat"><span class="stat-num">39,656 m\xB2</span><span class="stat-label">Workshop</span></div><div class="stat"><span class="stat-num">200+</span><span class="stat-label">Employees</span></div><div class="stat"><span class="stat-num">30+</span><span class="stat-label">R&D Engineers</span></div><div class="stat"><span class="stat-num">40+</span><span class="stat-label">Patents</span></div><div class="stat"><span class="stat-num">50+</span><span class="stat-label">Export Countries</span></div></div></section>\n\n  <!-- \u2464 Certifications -->\n  <section class="certs band" id="certs">\n    <header class="sec-head"><span class="sec-num">05</span><h2>Certificates &amp; Qualifications</h2></header>\n    <div class="cert-grid"><button class="cert" type="button" data-cert="ISO 9001:2015" data-cert-src="assets/cert-iso9001.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-iso9001.jpg" alt="ISO 9001  certificate" loading="lazy"><span class="cert-name">ISO 9001:2015</span><span class="cert-meta">Quality Management \xB7 SEATONE \xB7 valid to March 2029</span></button><button class="cert" type="button" data-cert="ISO 14001:2015" data-cert-src="assets/cert-iso14001.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-iso14001.jpg" alt="ISO 14001  certificate" loading="lazy"><span class="cert-name">ISO 14001:2015</span><span class="cert-meta">Environmental Management \xB7 SEATONE \xB7 valid to March 2029</span></button><button class="cert" type="button" data-cert="ISO 45001:2018" data-cert-src="assets/cert-iso45001.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-iso45001.jpg" alt="ISO 45001  certificate" loading="lazy"><span class="cert-name">ISO 45001:2018</span><span class="cert-meta">Occupational Health & Safety \xB7 SEATONE \xB7 valid to March 2029</span></button><button class="cert" type="button" data-cert="CE \u2014 Water Treatment Equipment" data-cert-src="assets/cert-ce-water.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-ce-water.jpg" alt="CE \u6C34\u5904\u7406\u8BBE\u5907 certificate" loading="lazy"><span class="cert-name">CE \u2014 Water Treatment Equipment</span><span class="cert-meta">Machinery Directive 2006/42/EC \xB7 UDEM \xB7 valid to June 2031</span></button><button class="cert" type="button" data-cert="CE \u2014 Incinerators" data-cert-src="assets/cert-ce-incinerator.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-ce-incinerator.jpg" alt="CE \u711A\u70E7\u7089 certificate" loading="lazy"><span class="cert-name">CE \u2014 Incinerators</span><span class="cert-meta">MD 2006/42/EC & EN 746-1 \xB7 valid to October 2031</span></button><button class="cert" type="button" data-cert="Five-Star After-Sales Service" data-cert-src="assets/cert-fivestar.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-fivestar.jpg" alt="\u4E94\u661F\u552E\u540E\u670D\u52A1\u8BA4\u8BC1 certificate" loading="lazy"><span class="cert-name">Five-Star After-Sales Service</span><span class="cert-meta">GB/T 27922 \xB7 valid to March 2027</span></button></div>\n  </section>\n\n  <!-- \u2465 Inside the Factory -->\n  <section class="factory" id="factory">\n    <header class="sec-head"><span class="sec-num">06</span><h2>Inside the Factory</h2></header>\n    <div class="factory-grid"><figure class="fphoto"><img class="ph-factory" src="assets/factory-workshop.jpg" alt="Production workshop with overhead cranes" loading="lazy"></figure><figure class="fphoto"><img class="ph-factory" src="assets/factory-assembly.jpg" alt="Assembly area with overhead crane" loading="lazy"></figure><figure class="fphoto"><img class="ph-factory" src="assets/factory-workers.jpg" alt="Workers fabricating equipment in the workshop" loading="lazy"></figure><figure class="fphoto"><img class="ph-factory" src="assets/factory-lathe.jpg" alt="Lathe machining close-up" loading="lazy"></figure><figure class="fphoto"><img class="ph-factory" src="assets/factory-aerial.jpg" alt="Factory entrance and office building, aerial view" loading="lazy"></figure></div>\n  </section>\n\n  <!-- \u2466 Factory Tour Video -->\n  <section class="video dark" id="video">\n    <header class="sec-head"><span class="sec-num">07</span><h2>Watch the Factory at Work</h2></header>\n    <div class="video-wrap">\n      <video class="ph-video" style="aspect-ratio:16/9" src="assets/factory-tour.mp4" controls preload="none" playsinline poster="assets/video-poster.jpg"></video>\n      <div class="video-side">\n        <p>Filmed on our production floor: laser cutting, bending, lathe machining, welding, filter press assembly and the in-house laboratory.</p>\n        <a class="cta" href="https://wa.me/8613360213795" target="_blank" rel="noopener">Book a Live Video Factory Tour</a>\n      </div>\n    </div>\n  </section>\n\n  <!-- \u2468 Performance & Patents -->\n  <section class="performance" id="performance">\n    <header class="sec-head"><span class="sec-num">09</span><h2>Field Performance and Patented Design</h2></header>\n    <div class="perf-grid">\n      <figure class="perf-main"><img class="ph-perf" src="assets/perf-before-after.jpg" alt="Water samples before and after CXPF dissolved air flotation treatment" loading="lazy"><figcaption>Before &amp; after treatment \u2014 CXPF</figcaption></figure>\n      <figure class="perf-side"><img class="ph-perf" src="assets/site-pakistan.jpg" alt="Filter press installation at a coal slime dewatering site, Pakistan (60 t/d)" loading="lazy"></figure>\n      <figure class="perf-side"><img class="ph-perf" src="assets/site-zambia.jpg" alt="Belt filter press dewatering copper tailings, Zambia (300 m\xB3/d)" loading="lazy"></figure>\n    </div>\n    <p class="patents-line">Patented products \u2014 DAF: 201720174028.6 / 201720174147.1 \uFF5C Belt filter press: 201720174005.5 \uFF5C Integrated & MBR plants: 201720174014.4 \uFF5C Thin-layer high-dry filter press: 201720174031.8</p>\n  </section>\n\n  <!-- \u2469 Quality Assurance -->\n  <section class="quality band" id="quality">\n    <header class="sec-head"><span class="sec-num">10</span><h2>How We Control Quality</h2></header>\n    <ol class="quality-list"><li><span class="q-num">1</span><p>Production runs under an ISO 9001:2015 certified management system; every machine is inspected at the factory before dispatch.</p></li><li><span class="q-num">2</span><p>We test influent and treated water in our own laboratory before finalizing a process design.</p></li><li><span class="q-num">3</span><p>Buyers are welcome to arrange third-party inspection (SGS, BV or T\xDCV) before shipment.</p></li><li><span class="q-num">4</span><p>Warranty: 12 months. Response within 8 hours; online video support within 24\u201348 hours; lifetime maintenance.</p></li></ol>\n  </section>\n\n  <!-- \u246A FAQ -->\n  <section class="faq" id="faq">\n    <header class="sec-head"><span class="sec-num">11</span><h2>FAQ</h2></header>\n    <details class="faq-item"><summary>Minimum order?<span class="faq-ico" aria-hidden="true"></span></summary><div class="faq-a"><p>One set.</p></div></details><details class="faq-item"><summary>Lead time?<span class="faq-ico" aria-hidden="true"></span></summary><div class="faq-a"><p>Stock machines ship in about 5 days; standard models in about 30 days; custom systems in 45\u201360 days.</p></div></details><details class="faq-item"><summary>Payment and trade terms?<span class="faq-ico" aria-hidden="true"></span></summary><div class="faq-a"><p>T/T, Western Union, PayPal. EXW, FOB, C&F or CIF from Qingdao, Shanghai, Guangzhou or Shenzhen.</p></div></details><details class="faq-item"><summary>What do you need to quote a custom system?<span class="faq-ico" aria-hidden="true"></span></summary><div class="faq-a"><p>Influent water report, required effluent standard, hourly flow rate, local voltage and frequency, and site conditions. Our engineers reply with a proposal within 24 hours.</p></div></details>\n    <p class="faq-more"><a class="text-link" href="/faq">View all FAQ</a></p>\n  </section>\n\n  <!-- \u246B From the Blog -->\n  <section class="blog" id="blog">\n    <header class="sec-head"><span class="sec-num">12</span><h2>From the Blog</h2></header>\n    <div class="posts">';
var INDEX_PART2B = '<p class="blog-more"><a class="text-link" href="/blog">View all articles</a></p>\n  </section>\n\n  <!-- \u246C Bottom Inquiry -->\n  <section class="inquiry dark" id="inquiry">\n    <header class="sec-head"><span class="sec-num">13</span><h2>Send an Inquiry</h2></header>\n    <div class="inquiry-grid">\n      <form class="inq-form" id="inqForm" novalidate>\n      <input type="text" name="company_website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">\n        <div class="field"><label for="f-name">Name *</label><input id="f-name" name="name" type="text" required autocomplete="name"></div>\n        <div class="field"><label for="f-email">Email *</label><input id="f-email" name="email" type="email" required autocomplete="email"></div>\n        <div class="field"><label for="f-wa">WhatsApp or Mobile *</label><input id="f-wa" name="whatsapp" type="tel" required autocomplete="tel"></div>\n        <div class="field"><label for="f-country">Country *</label><input id="f-country" name="country" type="text" required autocomplete="country-name"></div>\n        <div class="field"><label for="f-type">Equipment Type *</label>\n          <select id="f-type" name="type" required>\n            <option value="" selected disabled>Select\u2026</option>\n            <option>Wastewater Treatment Equipment</option>\n            <option>Solid-Liquid Separation Equipment</option>\n            <option>Waste Incineration Equipment</option>\n            <option>Other / Not sure</option>\n          </select></div>\n        <div class="field field-full"><label for="f-msg">Message *</label><textarea id="f-msg" name="message" rows="4" required></textarea></div>\n        <div class="field field-full"><label for="f-file">File Upload <i>(optional \u2014 influent report, water or sludge data)</i></label><input id="f-file" name="file" type="file"></div>\n        <p class="form-err" id="formErr" role="alert" hidden>Please fill in all required fields.</p>\n        <div class="demo-note" id="inqNote">\n          <h3>Connection problem \u2014 nothing has been sent</h3>\n          <p>The form could not reach our server, so your data was <strong>not</strong> submitted. To send this inquiry now, use one of the buttons below \u2014 your entries are carried over.</p>\n          <div class="row">\n            <a class="btn demo-mail" href="#">Send via Email</a>\n            <a class="btn ghost demo-wa" style="border-color:var(--acc);color:var(--acc)" href="#" target="_blank" rel="noopener">Send via WhatsApp</a>\n          </div>\n          <small>You can also email us directly at steffy@huayienviron.com \u2014 we reply within 24 hours.</small>\n        </div>\n        <button class="cta submit" type="submit">Send Inquiry \u2014 Reply within 24 Hours</button>\n      </form>\n      <aside class="inq-side">\n        <h3>Direct contacts</h3>\n        <p><span>Email</span><a href="mailto:steffy@huayienviron.com">steffy@huayienviron.com</a></p>\n        <p><span>WhatsApp</span><a href="https://wa.me/8613360213795" target="_blank" rel="noopener">+86 13360213795</a></p>\n        <p><span>Address</span>Mizhou Industrial Avenue, Zhucheng, Shandong, China</p>\n        <div class="side-links">\n          <a href="/catalog">Download Catalog</a>\n          <a href="/get-a-solution">Get a Free Proposal</a>\n        </div>\n      </aside>\n    </div>\n  </section>\n</main>';
var PRODUCTS_PRE = '<main>\n\n<div class="wrap">\n  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><b>Products</b></nav>\n  <div class="page-hero">\n    <div class="eyebrow">Products</div>\n    <h1>Wastewater Treatment, Sludge Dewatering and Incineration Equipment</h1>\n    <p class="lede">We design and manufacture the three groups of equipment below at our 39,656 m\xB2 factory in Zhucheng, Shandong. Most models are in stock or on short lead time. For non-standard jobs, we size the equipment from your water or sludge data \u2014 send it through <a href="/get-a-solution" style="color:var(--acc)">Get a Solution</a>.</p>\n  </div>\n  \n  ';
var PRODUCTS_POST = '<div class="note-strip" style="margin:34px 0 60px">Can\u2019t find your equipment type? <a href="/get-a-solution" style="color:var(--acc);font-weight:600">Ask an engineer</a>.</div>\n</div>\n</main>';
var CATS = { "wastewater-treatment": '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/products">Products</a><span>/</span><b>Wastewater Treatment Equipment</b></nav>\n  <div class="page-hero">\n    <div class="eyebrow">Products</div>\n    <h1>Wastewater Treatment Equipment</h1>\n    <p class="lede">Pretreatment, flotation, sedimentation and packaged plants for municipal and industrial wastewater. Standard models are CE marked under Machinery Directive 2006/42/EC.</p>\n  ', "solid-liquid-separation": '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/products">Products</a><span>/</span><b>Solid-Liquid Separation Equipment</b></nav>\n  <div class="page-hero">\n    <div class="eyebrow">Products</div>\n    <h1>Solid-Liquid Separation Equipment</h1>\n    <p class="lede">Machines for municipal sludge, industrial sludge, mine tailings and farm manure. Tell us the material type, flow rate, feed concentration and pH \u2014 we select the machine and the conditioning chemicals from that data.</p>\n  ', "waste-incineration": '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/products">Products</a><span>/</span><b>Waste Incineration Equipment</b></nav>\n  <div class="page-hero">\n    <div class="eyebrow">Products</div>\n    <h1>Waste Incineration Equipment</h1>\n    <p class="lede">CXWSL series incinerators for medical waste, industrial hazardous waste and municipal solid waste, sized by material type, hourly capacity, fuel and the local emission standard. Designed and manufactured in compliance with Machinery Directive 2006/42/EC and EN 746-1; third-party conformity verification held, valid until October 2031. Tell us your emission limit \u2014 we configure combustion chamber, burner and scrubber accordingly.</p>\n  ' };
var BLOG_PRE = '<main>\n\n<div class="wrap">\n  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><b>Blog</b></nav>\n  <div class="page-hero">\n    <div class="eyebrow">Blog</div>\n    <h1>Equipment Guides and Selection Notes</h1>\n  </div>\n  ';
var BLOG_POST = "</div>\n</main>";
var INDEX_PRODUCTS = '<section class="products" id="products">\n    <header class="sec-head"><span class="sec-num">02</span><h2>What We Manufacture</h2></header>\n    <div class="cards"><article class="card"><div class="card-idx">01</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxwsz.jpg" alt="Integrated sewage treatment plant (CXWSZ / CXMBR)" loading="lazy"><div class="card-body"><h3>Integrated Sewage Treatment Plant</h3><p class="model">CXWSZ / CXMBR</p><p class="card-desc">Buried and containerized plants from 0.5 to 500 m\xB3/d, designed for unmanned operation.</p><p class="patent">Patent 201720174014.4</p><a class="text-link" href="/product-integrated-sewage-treatment-plant">Learn more</a></div></article><article class="card"><div class="card-idx">02</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxpf.jpg" alt="Horizontal flow dissolved air flotation unit (CXPF)" loading="lazy"><div class="card-body"><h3>Horizontal Flow DAF</h3><p class="model">CXPF</p><p class="card-desc">Patented two-in-one flotation and clarification unit, 4\u2013300 m\xB3/h.</p><p class="patent">Patent 201720174028.6 / 201720174147.1</p><a class="text-link" href="/product-dissolved-air-flotation">Learn more</a></div></article><article class="card"><div class="card-idx">03</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxbc.jpg" alt="Thin-layer high-dry filter press (CXBC)" loading="lazy"><div class="card-body"><h3>Thin-Layer High-Dry Filter Press</h3><p class="model">CXBC</p><p class="card-desc">Cake dryness 40\u201350% without lime or ash; 30\u201360 min cycle.</p><a class="text-link" href="/product-chamber-filter-press">Learn more</a></div></article><article class="card"><div class="card-idx">04</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxdl.jpg" alt="Screw press sludge dewatering machine (CXDL)" loading="lazy"><div class="card-body"><h3>Screw Press Sludge Dewatering Machine</h3><p class="model">CXDL</p><p class="card-desc">Dewatering starts at 2,000 mg/L feed concentration; fully automatic.</p><a class="text-link" href="/product-screw-press-sludge-dewatering">Learn more</a></div></article><article class="card"><div class="card-idx">05</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxzb.jpg" alt="Peripheral drive mud scraper (CXZB)" loading="lazy"><div class="card-body"><h3>Peripheral Drive Mud Scraper</h3><p class="model">CXZB</p><p class="card-desc">For 20\u2013100 m diameter clarifiers, with bottom scraping and surface scum removal.</p><a class="text-link" href="/product-sludge-scraper">Learn more</a></div></article><article class="card"><div class="card-idx">06</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxbk.jpg" alt="Chamber filter press (CXBK)" loading="lazy"><div class="card-body"><h3>Chamber Filter Press</h3><p class="model">CXBK</p><p class="card-desc">PP or stainless steel plates, 5\u2013500 m\xB2 filtration area.</p><p class="patent">Patent 201720174031.8</p><a class="text-link" href="/product-chamber-filter-press">Learn more</a></div></article><article class="card"><div class="card-idx">07</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxlml.jpg" alt="Lamella sedimentation tank (CXLML)" loading="lazy"><div class="card-body"><h3>Lamella Sedimentation Tank</h3><p class="model">CXLML</p><p class="card-desc">60\xB0 inclined plates, 10\u2013100 m\xB3/h in a footprint about half that of a conventional sedimentation tank.</p><a class="text-link" href="/product-lamella-clarifier">Learn more</a></div></article></div>\n  </section>';

// cms-src/worker/chunks-i18n.js
var HEADER_I18N = {
  "ru": '<header class="site-head" id="siteHead">\n  <a class="brand" href="/ru/"><strong>Innovation Huayi</strong><span>Environmental Engineering</span></a>\n  <button class="menu-btn" id="menuBtn" type="button" aria-expanded="false" aria-controls="siteNav"><span></span><span></span><span></span><em>\u041C\u0435\u043D\u044E</em></button>\n  <nav class="site-nav" id="siteNav" aria-label="Main"><div class="nav-item"><a href="/ru/products">\u041F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F</a><div class="nav-drop"><a href="/ru/products-wastewater-treatment">\u041E\u0447\u0438\u0441\u0442\u043A\u0430 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434</a><a href="/ru/products-solid-liquid-separation">\u0421\u0435\u043F\u0430\u0440\u0430\u0446\u0438\u044F \u0442\u0432\u0451\u0440\u0434\u043E\u0439 \u0438 \u0436\u0438\u0434\u043A\u043E\u0439 \u0444\u0430\u0437</a><a href="/ru/products-waste-incineration">\u0421\u0436\u0438\u0433\u0430\u043D\u0438\u0435 \u043E\u0442\u0445\u043E\u0434\u043E\u0432</a><a href="/ru/products">\u0412\u0441\u044F \u043F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F \u2192</a></div></div><div class="nav-item plain"><a href="/ru/get-a-solution">\u041F\u043E\u0434\u0431\u043E\u0440 \u0440\u0435\u0448\u0435\u043D\u0438\u044F</a></div><div class="nav-item plain"><a href="/services">\u0423\u0441\u043B\u0443\u0433\u0438</a></div><div class="nav-item plain"><a href="/case-studies">\u041F\u0440\u043E\u0435\u043A\u0442\u044B</a></div><div class="nav-item plain"><a href="/factory">\u0417\u0430\u0432\u043E\u0434</a></div><div class="nav-item plain"><a href="/about-us">\u041E \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438</a></div><div class="nav-item plain"><a href="/ru/contact-us">\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u044B</a></div></nav>\n  __SWITCH__\n  <a class="head-cta" href="/ru/#inquiry">\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0446\u0435\u043D\u0443</a>\n</header>',
  "es": '<header class="site-head" id="siteHead">\n  <a class="brand" href="/es/"><strong>Innovation Huayi</strong><span>Environmental Engineering</span></a>\n  <button class="menu-btn" id="menuBtn" type="button" aria-expanded="false" aria-controls="siteNav"><span></span><span></span><span></span><em>Men\xFA</em></button>\n  <nav class="site-nav" id="siteNav" aria-label="Main"><div class="nav-item"><a href="/es/products">Productos</a><div class="nav-drop"><a href="/es/products-wastewater-treatment">Tratamiento de aguas residuales</a><a href="/es/products-solid-liquid-separation">Separaci\xF3n s\xF3lido-l\xEDquido</a><a href="/es/products-waste-incineration">Incineraci\xF3n de residuos</a><a href="/es/products">Todos los productos \u2192</a></div></div><div class="nav-item plain"><a href="/es/get-a-solution">Obtener una soluci\xF3n</a></div><div class="nav-item plain"><a href="/services">Servicios</a></div><div class="nav-item plain"><a href="/case-studies">Casos</a></div><div class="nav-item plain"><a href="/factory">F\xE1brica</a></div><div class="nav-item plain"><a href="/about-us">Nosotros</a></div><div class="nav-item plain"><a href="/es/contact-us">Contacto</a></div></nav>\n  __SWITCH__\n  <a class="head-cta" href="/es/#inquiry">Solicitar cotizaci\xF3n</a>\n</header>'
};
var FOOTER_I18N = {
  "ru": '<footer class="site-foot">\n  <p class="foot-company">Shandong Innovation Huayi Environmental Engineering Co., Ltd.</p>\n  <p class="foot-addr">Mizhou Industrial Avenue, Zhucheng, Shandong, China \uFF5C <a href="mailto:steffy@huayienviron.com">steffy@huayienviron.com</a> \uFF5C <a href="https://wa.me/8613360213795" target="_blank" rel="noopener">+86 13360213795</a></p>\n  <nav class="foot-nav" aria-label="Footer">\n    <a href="/ru/products">\u041F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F</a><a href="/services">\u0423\u0441\u043B\u0443\u0433\u0438</a>\n    <a href="/case-studies">\u041F\u0440\u043E\u0435\u043A\u0442\u044B</a><a href="/factory">\u0417\u0430\u0432\u043E\u0434</a>\n    <a href="/certifications">\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u044B</a><a href="/faq">FAQ</a>\n    <a href="/blog">\u0411\u043B\u043E\u0433</a><a href="/privacy-policy">\u041A\u043E\u043D\u0444\u0438\u0434\u0435\u043D\u0446\u0438\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u044C</a>\n    <a href="/terms-of-use">\u0423\u0441\u043B\u043E\u0432\u0438\u044F \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u044F</a><a href="/cookie-policy">\u041F\u043E\u043B\u0438\u0442\u0438\u043A\u0430 Cookie</a>\n  </nav>\n  <p class="foot-copy">\xA9 2026 Shandong Innovation Huayi Environmental Engineering Co., Ltd.</p>\n</footer>\n<a class="wa-float" href="https://wa.me/8613360213795" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">\n  <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.6.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.5-1.2a.6.6 0 0 0 0-.5c0-.1-.6-1.4-.8-1.9s-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.1 5 5 0 0 0 1 2.7 11.4 11.4 0 0 0 4.4 3.9 5 5 0 0 0 3 .9 2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .1-1.2c0-.1-.3-.2-.6-.3z"/></svg>\n</a>\n<div class="toast" id="toast" role="status"></div>\n<div class="cert-modal" id="certModal" role="dialog" aria-modal="true" aria-label="Certificate preview" hidden>\n  <div class="cert-modal-box">\n    <button class="cert-modal-close" id="certClose" type="button" aria-label="Close">\xD7</button>\n    <div class="cert-modal-img"><img id="certModalImg" alt="Certificate scan"></div>\n    <p class="cert-modal-name" id="certModalName"></p>\n  </div>\n</div>',
  "es": '<footer class="site-foot">\n  <p class="foot-company">Shandong Innovation Huayi Environmental Engineering Co., Ltd.</p>\n  <p class="foot-addr">Mizhou Industrial Avenue, Zhucheng, Shandong, China \uFF5C <a href="mailto:steffy@huayienviron.com">steffy@huayienviron.com</a> \uFF5C <a href="https://wa.me/8613360213795" target="_blank" rel="noopener">+86 13360213795</a></p>\n  <nav class="foot-nav" aria-label="Footer">\n    <a href="/es/products">Productos</a><a href="/services">Servicios</a>\n    <a href="/case-studies">Casos</a><a href="/factory">F\xE1brica</a>\n    <a href="/certifications">Certificados</a><a href="/faq">FAQ</a>\n    <a href="/blog">Blog</a><a href="/privacy-policy">Privacidad</a>\n    <a href="/terms-of-use">Condiciones de uso</a><a href="/cookie-policy">Pol\xEDtica de cookies</a>\n  </nav>\n  <p class="foot-copy">\xA9 2026 Shandong Innovation Huayi Environmental Engineering Co., Ltd.</p>\n</footer>\n<a class="wa-float" href="https://wa.me/8613360213795" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">\n  <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.6.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.5-1.2a.6.6 0 0 0 0-.5c0-.1-.6-1.4-.8-1.9s-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.1 5 5 0 0 0 1 2.7 11.4 11.4 0 0 0 4.4 3.9 5 5 0 0 0 3 .9 2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .1-1.2c0-.1-.3-.2-.6-.3z"/></svg>\n</a>\n<div class="toast" id="toast" role="status"></div>\n<div class="cert-modal" id="certModal" role="dialog" aria-modal="true" aria-label="Certificate preview" hidden>\n  <div class="cert-modal-box">\n    <button class="cert-modal-close" id="certClose" type="button" aria-label="Close">\xD7</button>\n    <div class="cert-modal-img"><img id="certModalImg" alt="Certificate scan"></div>\n    <p class="cert-modal-name" id="certModalName"></p>\n  </div>\n</div>'
};
var CTA_I18N = {
  "ru": '<section class="cta-band">\n  <div class="wrap">\n    <h2>\u0420\u0430\u0441\u0441\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u0430\u043C \u043E \u0432\u0430\u0448\u0435\u0439 \u0432\u043E\u0434\u0435.</h2>\n    <p>\u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 24 \u0447\u0430\u0441\u043E\u0432.</p>\n    <a class="btn" href="/ru/get-a-solution">\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u043E\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435</a>\n    <a class="btn ghost" href="https://wa.me/8613360213795" target="_blank" rel="noopener">\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0432 WhatsApp</a>\n  </div>\n</section>',
  "es": '<section class="cta-band">\n  <div class="wrap">\n    <h2>Cu\xE9ntenos las condiciones de su agua.</h2>\n    <p>Propuesta t\xE9cnica en 24 horas.</p>\n    <a class="btn" href="/es/get-a-solution">Solicite una propuesta gratuita</a>\n    <a class="btn ghost" href="https://wa.me/8613360213795" target="_blank" rel="noopener">Escr\xEDbanos por WhatsApp</a>\n  </div>\n</section>'
};
var HOME_P1 = {
  "ru": '<main id="top">\n  <!-- \u2460 Hero -->\n  <section class="hero" id="hero">\n    <img class="ph-hero" src="assets/hero.jpg" alt="\u0412\u0438\u0434 \u0441 \u0432\u044B\u0441\u043E\u0442\u044B \u043D\u0430 \u0437\u0430\u0432\u043E\u0434 Innovation Huayi \u0432 \u0427\u0436\u0443\u0447\u044D\u043D\u0435, \u0428\u0430\u043D\u044C\u0434\u0443\u043D" loading="lazy">\n    <div class="hero-inner">\n      <p class="eyebrow">\u0421\u043E\u0437\u0434\u0430\u0451\u043C \u0440\u0435\u0448\u0435\u043D\u0438\u044F \u0434\u043B\u044F \u0447\u0438\u0441\u0442\u043E\u0439 \u0432\u043E\u0434\u044B</p>\n      <h1>\u041E\u0447\u0438\u0441\u0442\u043A\u0430 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434 \u2014 \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u043E\u0434 \u0437\u0430\u043A\u0430\u0437</h1>\n      <p class="hero-sub">\u041F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u043C \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u0435\u043F\u0430\u0440\u0430\u0446\u0438\u0438 \u0442\u0432\u0451\u0440\u0434\u043E\u0439 \u0438 \u0436\u0438\u0434\u043A\u043E\u0439 \u0444\u0430\u0437 \u0438 \u043E\u0447\u0438\u0441\u0442\u043A\u0438 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434 \u0434\u043B\u044F EPC-\u043F\u043E\u0434\u0440\u044F\u0434\u0447\u0438\u043A\u043E\u0432, \u0434\u0438\u0441\u0442\u0440\u0438\u0431\u044C\u044E\u0442\u043E\u0440\u043E\u0432 \u0438 \u043F\u0440\u043E\u043C\u044B\u0448\u043B\u0435\u043D\u043D\u044B\u0445 \u043F\u0440\u0435\u0434\u043F\u0440\u0438\u044F\u0442\u0438\u0439. \u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0432 50+ \u0441\u0442\u0440\u0430\u043D.</p>\n      <p class="trust-line"><span>17+ \u043B\u0435\u0442</span><span>\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u044B ISO 9001 \u0438 CE</span><span>40+ \u043F\u0430\u0442\u0435\u043D\u0442\u043E\u0432</span></p>\n      <a class="cta" href="/ru/get-a-solution">\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u043E\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435</a>\n    </div>\n  </section>\n\n  <!-- \u2461 Featured Products -->\n  ',
  "es": '<main id="top">\n  <!-- \u2460 Hero -->\n  <section class="hero" id="hero">\n    <img class="ph-hero" src="assets/hero.jpg" alt="Vista a\xE9rea de la f\xE1brica de Innovation Huayi en Zhucheng, Shandong" loading="lazy">\n    <div class="hero-inner">\n      <p class="eyebrow">Soluciones sostenibles para un agua m\xE1s limpia</p>\n      <h1>Tratamiento de aguas residuales, hecho a medida</h1>\n      <p class="hero-sub">Fabricamos equipos de separaci\xF3n s\xF3lido-l\xEDquido y tratamiento de aguas residuales para contratistas EPC, distribuidores y plantas industriales. Exportamos a m\xE1s de 50 pa\xEDses.</p>\n      <p class="trust-line"><span>M\xE1s de 17 a\xF1os</span><span>Certificados ISO 9001 y CE</span><span>M\xE1s de 40 patentes</span></p>\n      <a class="cta" href="/es/get-a-solution">Solicite una propuesta gratuita</a>\n    </div>\n  </section>\n\n  <!-- \u2461 Featured Products -->\n  '
};
var HOME_PRODUCTS = {
  "ru": '<section class="products" id="products">\n    <header class="sec-head"><span class="sec-num">02</span><h2>\u0427\u0442\u043E \u043C\u044B \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u043C</h2></header>\n    <div class="cards"><article class="card"><div class="card-idx">01</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxwsz.jpg" alt="\u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0435 \u043E\u0447\u0438\u0441\u0442\u043D\u044B\u0435 \u0441\u043E\u043E\u0440\u0443\u0436\u0435\u043D\u0438\u044F (CXWSZ / CXMBR)" loading="lazy"><div class="card-body"><h3>\u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0435 \u043E\u0447\u0438\u0441\u0442\u043D\u044B\u0435 \u0441\u043E\u043E\u0440\u0443\u0436\u0435\u043D\u0438\u044F</h3><p class="model">CXWSZ / CXMBR</p><p class="card-desc">\u0417\u0430\u0433\u043B\u0443\u0431\u043B\u0435\u043D\u043D\u044B\u0435 \u0438 \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440\u043D\u044B\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u043E\u0442 0,5 \u0434\u043E 500 \u043C\xB3/\u0441\u0443\u0442, \u0434\u043B\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u044D\u043A\u0441\u043F\u043B\u0443\u0430\u0442\u0430\u0446\u0438\u0438.</p><p class="patent">\u041F\u0430\u0442\u0435\u043D\u0442 201720174014.4</p><a class="text-link" href="/ru/product-integrated-sewage-treatment-plant">\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435</a></div></article><article class="card"><div class="card-idx">02</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxpf.jpg" alt="\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u044C\u043D\u044B\u0439 \u043D\u0430\u043F\u043E\u0440\u043D\u044B\u0439 \u0444\u043B\u043E\u0442\u0430\u0442\u043E\u0440 (CXPF)" loading="lazy"><div class="card-body"><h3>\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u044C\u043D\u044B\u0439 \u0444\u043B\u043E\u0442\u0430\u0442\u043E\u0440</h3><p class="model">CXPF</p><p class="card-desc">\u0417\u0430\u043F\u0430\u0442\u0435\u043D\u0442\u043E\u0432\u0430\u043D\u043D\u0430\u044F \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430 \xAB\u0434\u0432\u0430 \u0432 \u043E\u0434\u043D\u043E\u043C\xBB \u0434\u043B\u044F \u0444\u043B\u043E\u0442\u0430\u0446\u0438\u0438 \u0438 \u043E\u0441\u0432\u0435\u0442\u043B\u0435\u043D\u0438\u044F, 4\u2013300 \u043C\xB3/\u0447.</p><p class="patent">\u041F\u0430\u0442\u0435\u043D\u0442 201720174028.6 / 201720174147.1</p><a class="text-link" href="/ru/product-dissolved-air-flotation">\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435</a></div></article><article class="card"><div class="card-idx">03</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxbc.jpg" alt="\u0422\u043E\u043D\u043A\u043E\u0441\u043B\u043E\u0439\u043D\u044B\u0439 \u0444\u0438\u043B\u044C\u0442\u0440-\u043F\u0440\u0435\u0441\u0441 \u0432\u044B\u0441\u043E\u043A\u043E\u0439 \u0441\u0443\u0445\u043E\u0441\u0442\u0438 (CXBC)" loading="lazy"><div class="card-body"><h3>\u0422\u043E\u043D\u043A\u043E\u0441\u043B\u043E\u0439\u043D\u044B\u0439 \u0444\u0438\u043B\u044C\u0442\u0440-\u043F\u0440\u0435\u0441\u0441 \u0432\u044B\u0441\u043E\u043A\u043E\u0439 \u0441\u0443\u0445\u043E\u0441\u0442\u0438</h3><p class="model">CXBC</p><p class="card-desc">\u0421\u0443\u0445\u043E\u0441\u0442\u044C \u043A\u0435\u043A\u0430 40\u201350% \u0431\u0435\u0437 \u0438\u0437\u0432\u0435\u0441\u0442\u0438 \u0438 \u0437\u043E\u043B\u044B; \u0446\u0438\u043A\u043B 30\u201360 \u043C\u0438\u043D\u0443\u0442.</p><a class="text-link" href="/ru/product-chamber-filter-press">\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435</a></div></article><article class="card"><div class="card-idx">04</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxdl.jpg" alt="\u0428\u043D\u0435\u043A\u043E\u0432\u044B\u0439 \u043F\u0440\u0435\u0441\u0441 \u043E\u0431\u0435\u0437\u0432\u043E\u0436\u0438\u0432\u0430\u043D\u0438\u044F \u043E\u0441\u0430\u0434\u043A\u0430 (CXDL)" loading="lazy"><div class="card-body"><h3>\u0428\u043D\u0435\u043A\u043E\u0432\u044B\u0439 \u043F\u0440\u0435\u0441\u0441 \u043E\u0431\u0435\u0437\u0432\u043E\u0436\u0438\u0432\u0430\u043D\u0438\u044F \u043E\u0441\u0430\u0434\u043A\u0430</h3><p class="model">CXDL</p><p class="card-desc">\u041E\u0431\u0435\u0437\u0432\u043E\u0436\u0438\u0432\u0430\u043D\u0438\u0435 \u0443\u0436\u0435 \u043E\u0442 \u043A\u043E\u043D\u0446\u0435\u043D\u0442\u0440\u0430\u0446\u0438\u0438 \u0432\u0445\u043E\u0434\u0430 2 000 \u043C\u0433/\u043B; \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439.</p><a class="text-link" href="/ru/product-screw-press-sludge-dewatering">\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435</a></div></article><article class="card"><div class="card-idx">05</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxzb.jpg" alt="\u0418\u043B\u043E\u0441\u043A\u0440\u0435\u0431 \u0441 \u043F\u0435\u0440\u0438\u0444\u0435\u0440\u0438\u0439\u043D\u044B\u043C \u043F\u0440\u0438\u0432\u043E\u0434\u043E\u043C (CXZB)" loading="lazy"><div class="card-body"><h3>\u0418\u043B\u043E\u0441\u043A\u0440\u0435\u0431 \u0441 \u043F\u0435\u0440\u0438\u0444\u0435\u0440\u0438\u0439\u043D\u044B\u043C \u043F\u0440\u0438\u0432\u043E\u0434\u043E\u043C</h3><p class="model">CXZB</p><p class="card-desc">\u0414\u043B\u044F \u043E\u0442\u0441\u0442\u043E\u0439\u043D\u0438\u043A\u043E\u0432 \u0434\u0438\u0430\u043C\u0435\u0442\u0440\u043E\u043C 20\u2013100 \u043C; \u0441\u043E\u0441\u043A\u043E\u0431 \u043E\u0441\u0430\u0434\u043A\u0430 \u043F\u043E \u0434\u043D\u0443 \u0438 \u0441\u0431\u043E\u0440 \u043F\u043B\u0430\u0432\u0430\u044E\u0449\u0438\u0445 \u0437\u0430\u0433\u0440\u044F\u0437\u043D\u0435\u043D\u0438\u0439.</p><a class="text-link" href="/ru/product-sludge-scraper">\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435</a></div></article><article class="card"><div class="card-idx">06</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxbk.jpg" alt="\u041A\u0430\u043C\u0435\u0440\u043D\u044B\u0439 \u0444\u0438\u043B\u044C\u0442\u0440-\u043F\u0440\u0435\u0441\u0441 (CXBK)" loading="lazy"><div class="card-body"><h3>\u041A\u0430\u043C\u0435\u0440\u043D\u044B\u0439 \u0444\u0438\u043B\u044C\u0442\u0440-\u043F\u0440\u0435\u0441\u0441</h3><p class="model">CXBK</p><p class="card-desc">\u041F\u043B\u0438\u0442\u044B \u0438\u0437 \u041F\u041F \u0438\u043B\u0438 \u043D\u0435\u0440\u0436\u0430\u0432\u0435\u044E\u0449\u0435\u0439 \u0441\u0442\u0430\u043B\u0438, \u043F\u043B\u043E\u0449\u0430\u0434\u044C \u0444\u0438\u043B\u044C\u0442\u0440\u0430\u0446\u0438\u0438 5\u2013500 \u043C\xB2.</p><p class="patent">\u041F\u0430\u0442\u0435\u043D\u0442 201720174031.8</p><a class="text-link" href="/ru/product-chamber-filter-press">\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435</a></div></article><article class="card"><div class="card-idx">07</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxlml.jpg" alt="\u0422\u043E\u043D\u043A\u043E\u0441\u043B\u043E\u0439\u043D\u044B\u0439 \u043E\u0442\u0441\u0442\u043E\u0439\u043D\u0438\u043A (CXLML)" loading="lazy"><div class="card-body"><h3>\u0422\u043E\u043D\u043A\u043E\u0441\u043B\u043E\u0439\u043D\u044B\u0439 \u043E\u0442\u0441\u0442\u043E\u0439\u043D\u0438\u043A</h3><p class="model">CXLML</p><p class="card-desc">\u041D\u0430\u043A\u043B\u043E\u043D\u043D\u044B\u0435 \u043F\u043B\u0430\u0441\u0442\u0438\u043D\u044B 60\xB0, 10\u2013100 \u043C\xB3/\u0447 \u2014 \u043F\u0440\u0438\u043C\u0435\u0440\u043D\u043E \u0432\u0434\u0432\u043E\u0435 \u043C\u0435\u043D\u044C\u0448\u0435 \u043F\u043B\u043E\u0449\u0430\u0434\u044C \u043E\u0431\u044B\u0447\u043D\u043E\u0433\u043E \u043E\u0442\u0441\u0442\u043E\u0439\u043D\u0438\u043A\u0430.</p><a class="text-link" href="/ru/product-lamella-clarifier">\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435</a></div></article></div>\n  </section>',
  "es": '<section class="products" id="products">\n    <header class="sec-head"><span class="sec-num">02</span><h2>Qu\xE9 fabricamos</h2></header>\n    <div class="cards"><article class="card"><div class="card-idx">01</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxwsz.jpg" alt="Planta compacta de tratamiento (CXWSZ / CXMBR)" loading="lazy"><div class="card-body"><h3>Planta compacta de tratamiento</h3><p class="model">CXWSZ / CXMBR</p><p class="card-desc">Plantas enterradas y en contenedor de 0,5 a 500 m\xB3/d, para operaci\xF3n sin personal.</p><p class="patent">Patente 201720174014.4</p><a class="text-link" href="/es/product-integrated-sewage-treatment-plant">M\xE1s informaci\xF3n</a></div></article><article class="card"><div class="card-idx">02</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxpf.jpg" alt="Unidad DAF de flujo horizontal (CXPF)" loading="lazy"><div class="card-body"><h3>DAF de flujo horizontal</h3><p class="model">CXPF</p><p class="card-desc">Unidad patentada dos en uno de flotaci\xF3n y clarificaci\xF3n, 4\u2013300 m\xB3/h.</p><p class="patent">Patente 201720174028.6 / 201720174147.1</p><a class="text-link" href="/es/product-dissolved-air-flotation">M\xE1s informaci\xF3n</a></div></article><article class="card"><div class="card-idx">03</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxbc.jpg" alt="Filtro prensa de capa fina (CXBC)" loading="lazy"><div class="card-body"><h3>Filtro prensa de capa fina y alta sequedad</h3><p class="model">CXBC</p><p class="card-desc">Sequedad de torta del 40\u201350% sin cal ni ceniza; ciclo de 30\u201360 minutos.</p><a class="text-link" href="/es/product-chamber-filter-press">M\xE1s informaci\xF3n</a></div></article><article class="card"><div class="card-idx">04</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxdl.jpg" alt="Prensa de tornillo para lodos (CXDL)" loading="lazy"><div class="card-body"><h3>Prensa de tornillo para lodos</h3><p class="model">CXDL</p><p class="card-desc">Deshidrata desde una concentraci\xF3n de alimentaci\xF3n de 2.000 mg/L; totalmente autom\xE1tica.</p><a class="text-link" href="/es/product-screw-press-sludge-dewatering">M\xE1s informaci\xF3n</a></div></article><article class="card"><div class="card-idx">05</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxzb.jpg" alt="Rascador de lodos perif\xE9rico (CXZB)" loading="lazy"><div class="card-body"><h3>Rascador de lodos perif\xE9rico</h3><p class="model">CXZB</p><p class="card-desc">Para clarificadores de 20\u2013100 m de di\xE1metro, con rascado de fondo y eliminaci\xF3n de espumas.</p><a class="text-link" href="/es/product-sludge-scraper">M\xE1s informaci\xF3n</a></div></article><article class="card"><div class="card-idx">06</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxbk.jpg" alt="Filtro prensa de c\xE1mara (CXBK)" loading="lazy"><div class="card-body"><h3>Filtro prensa de c\xE1mara</h3><p class="model">CXBK</p><p class="card-desc">Placas de PP o acero inoxidable, \xE1rea de filtraci\xF3n de 5\u2013500 m\xB2.</p><p class="patent">Patente 201720174031.8</p><a class="text-link" href="/es/product-chamber-filter-press">M\xE1s informaci\xF3n</a></div></article><article class="card"><div class="card-idx">07</div><img class="ph-card" style="aspect-ratio:4/3" src="assets/prod-cxlml.jpg" alt="Tanque de sedimentaci\xF3n lamelar (CXLML)" loading="lazy"><div class="card-body"><h3>Tanque de sedimentaci\xF3n lamelar</h3><p class="model">CXLML</p><p class="card-desc">Placas inclinadas a 60\xB0, 10\u2013100 m\xB3/h, con cerca de la mitad de la superficie de un tanque convencional.</p><a class="text-link" href="/es/product-lamella-clarifier">M\xE1s informaci\xF3n</a></div></article></div>\n  </section>'
};
var HOME_P2A = {
  "ru": '\n\n  <!-- \u2462 Who We Serve -->\n  <section class="serve dark" id="serve">\n    <header class="sec-head"><span class="sec-num">03</span><h2>\u0421 \u043A\u0435\u043C \u043C\u044B \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u043C</h2></header>\n    <ul class="serve-list"><li>EPC-\u043F\u043E\u0434\u0440\u044F\u0434\u0447\u0438\u043A\u0438 \u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u043D\u044B\u0435 \u0438\u043D\u0441\u0442\u0438\u0442\u0443\u0442\u044B</li><li>\u0414\u0438\u0441\u0442\u0440\u0438\u0431\u044C\u044E\u0442\u043E\u0440\u044B \u0438 \u0430\u0433\u0435\u043D\u0442\u044B (OEM \u0438 ODM)</li><li>\u041C\u0443\u043D\u0438\u0446\u0438\u043F\u0430\u043B\u044C\u043D\u044B\u0435 \u043E\u0447\u0438\u0441\u0442\u043D\u044B\u0435 \u0441\u043E\u043E\u0440\u0443\u0436\u0435\u043D\u0438\u044F</li><li>\u041F\u0438\u0449\u0435\u0432\u044B\u0435 \u0438 \u043F\u0435\u0440\u0435\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u044E\u0449\u0438\u0435 \u043F\u0440\u0435\u0434\u043F\u0440\u0438\u044F\u0442\u0438\u044F</li><li>\u0422\u0435\u043A\u0441\u0442\u0438\u043B\u044C\u043D\u044B\u0435, \u043A\u0440\u0430\u0441\u0438\u043B\u044C\u043D\u044B\u0435, \u0446\u0435\u043B\u043B\u044E\u043B\u043E\u0437\u043D\u043E-\u0431\u0443\u043C\u0430\u0436\u043D\u044B\u0435 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0441\u0442\u0432\u0430</li><li>\u0413\u043E\u0440\u043D\u043E\u0434\u043E\u0431\u044B\u0447\u0430 \u0438 \u043C\u0435\u0442\u0430\u043B\u043B\u0443\u0440\u0433\u0438\u044F</li><li>\u0416\u0438\u0432\u043E\u0442\u043D\u043E\u0432\u043E\u0434\u0447\u0435\u0441\u043A\u0438\u0435 \u0438 \u043C\u043E\u043B\u043E\u0447\u043D\u044B\u0435 \u0444\u0435\u0440\u043C\u044B</li><li>\u0426\u0435\u043D\u0442\u0440\u044B \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438 \u043E\u0441\u0430\u0434\u043A\u0430</li></ul>\n    <p class="serve-note">\u041F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F \u043F\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0432 30+ \u043F\u0440\u043E\u0432\u0438\u043D\u0446\u0438\u0439 \u041A\u0438\u0442\u0430\u044F \u0438 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u0432 \u0420\u043E\u0441\u0441\u0438\u044E, \u0418\u0440\u0430\u043D, \u0412\u044C\u0435\u0442\u043D\u0430\u043C, \u0411\u0430\u043D\u0433\u043B\u0430\u0434\u0435\u0448, \u0418\u043E\u0440\u0434\u0430\u043D\u0438\u044E, \u041F\u0435\u0440\u0443, \u0421\u0430\u0443\u0434\u043E\u0432\u0441\u043A\u0443\u044E \u0410\u0440\u0430\u0432\u0438\u044E, \u041C\u0435\u043A\u0441\u0438\u043A\u0443, \u0411\u0440\u0430\u0437\u0438\u043B\u0438\u044E, \u041A\u0435\u043D\u0438\u044E \u0438 \u0435\u0449\u0451 \u0431\u043E\u043B\u0435\u0435 \u0447\u0435\u043C 40 \u0441\u0442\u0440\u0430\u043D.</p>\n  </section>\n\n  <!-- \u2463 By the Numbers -->\n  <section class="numbers band" id="numbers"><div class="stats"><div class="stat"><span class="stat-num">17+</span><span class="stat-label">\u041B\u0435\u0442 \u043D\u0430 \u0440\u044B\u043D\u043A\u0435 \u2014 \u0441 2009 \u0433\u043E\u0434\u0430</span></div><div class="stat"><span class="stat-num">39 656 \u043C\xB2</span><span class="stat-label">\u041F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0446\u0435\u0445</span></div><div class="stat"><span class="stat-num">200+</span><span class="stat-label">\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432</span></div><div class="stat"><span class="stat-num">30+</span><span class="stat-label">\u0418\u043D\u0436\u0435\u043D\u0435\u0440\u043E\u0432-\u043A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0442\u043E\u0440\u043E\u0432</span></div><div class="stat"><span class="stat-num">40+</span><span class="stat-label">\u041F\u0430\u0442\u0435\u043D\u0442\u043E\u0432</span></div><div class="stat"><span class="stat-num">50+</span><span class="stat-label">\u0421\u0442\u0440\u0430\u043D \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0430</span></div></div></section>\n\n  <!-- \u2464 Certifications -->\n  <section class="certs band" id="certs">\n    <header class="sec-head"><span class="sec-num">05</span><h2>\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u044B \u0438 \u043A\u0432\u0430\u043B\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u0438</h2></header>\n    <div class="cert-grid"><button class="cert" type="button" data-cert="ISO 9001:2015" data-cert-src="assets/cert-iso9001.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-iso9001.jpg" alt="\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442 ISO 9001" loading="lazy"><span class="cert-name">ISO 9001:2015</span><span class="cert-meta">\u041C\u0435\u043D\u0435\u0434\u0436\u043C\u0435\u043D\u0442 \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0430 \xB7 SEATONE \xB7 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D \u0434\u043E \u043C\u0430\u0440\u0442\u0430 2029</span></button><button class="cert" type="button" data-cert="ISO 14001:2015" data-cert-src="assets/cert-iso14001.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-iso14001.jpg" alt="\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442 ISO 14001" loading="lazy"><span class="cert-name">ISO 14001:2015</span><span class="cert-meta">\u042D\u043A\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043C\u0435\u043D\u0435\u0434\u0436\u043C\u0435\u043D\u0442 \xB7 SEATONE \xB7 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D \u0434\u043E \u043C\u0430\u0440\u0442\u0430 2029</span></button><button class="cert" type="button" data-cert="ISO 45001:2018" data-cert-src="assets/cert-iso45001.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-iso45001.jpg" alt="\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442 ISO 45001" loading="lazy"><span class="cert-name">ISO 45001:2018</span><span class="cert-meta">\u041E\u0445\u0440\u0430\u043D\u0430 \u0442\u0440\u0443\u0434\u0430 \u0438 \u043F\u0440\u043E\u043C\u044B\u0448\u043B\u0435\u043D\u043D\u0430\u044F \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0441\u0442\u044C \xB7 SEATONE \xB7 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D \u0434\u043E \u043C\u0430\u0440\u0442\u0430 2029</span></button><button class="cert" type="button" data-cert="CE \u2014 Water Treatment Equipment" data-cert-src="assets/cert-ce-water.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-ce-water.jpg" alt="\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442 CE \u043D\u0430 \u0432\u043E\u0434\u043E\u043E\u0447\u0438\u0441\u0442\u043D\u043E\u0435 \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435" loading="lazy"><span class="cert-name">CE \u2014 \u0412\u043E\u0434\u043E\u043E\u0447\u0438\u0441\u0442\u043D\u043E\u0435 \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435</span><span class="cert-meta">\u0414\u0438\u0440\u0435\u043A\u0442\u0438\u0432\u0430 2006/42/EC \xB7 UDEM \xB7 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D \u0434\u043E \u0438\u044E\u043D\u044F 2031</span></button><button class="cert" type="button" data-cert="CE \u2014 Incinerators" data-cert-src="assets/cert-ce-incinerator.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-ce-incinerator.jpg" alt="\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442 CE \u043D\u0430 \u043F\u0435\u0447\u0438 \u0434\u043B\u044F \u0441\u0436\u0438\u0433\u0430\u043D\u0438\u044F" loading="lazy"><span class="cert-name">CE \u2014 \u041F\u0435\u0447\u0438 \u0434\u043B\u044F \u0441\u0436\u0438\u0433\u0430\u043D\u0438\u044F</span><span class="cert-meta">MD 2006/42/EC \u0438 EN 746-1 \xB7 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D \u0434\u043E \u043E\u043A\u0442\u044F\u0431\u0440\u044F 2031</span></button><button class="cert" type="button" data-cert="Five-Star After-Sales Service" data-cert-src="assets/cert-fivestar.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-fivestar.jpg" alt="\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442 \u043F\u044F\u0442\u0438\u0437\u0432\u0451\u0437\u0434\u043E\u0447\u043D\u043E\u0433\u043E \u043F\u043E\u0441\u043B\u0435\u043F\u0440\u043E\u0434\u0430\u0436\u043D\u043E\u0433\u043E \u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u044F" loading="lazy"><span class="cert-name">\u041F\u044F\u0442\u0438\u0437\u0432\u0451\u0437\u0434\u043E\u0447\u043D\u044B\u0439 \u0441\u0435\u0440\u0432\u0438\u0441</span><span class="cert-meta">GB/T 27922 \xB7 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D \u0434\u043E \u043C\u0430\u0440\u0442\u0430 2027</span></button></div>\n  </section>\n\n  <!-- \u2465 Inside the Factory -->\n  <section class="factory" id="factory">\n    <header class="sec-head"><span class="sec-num">06</span><h2>\u0412\u043D\u0443\u0442\u0440\u0438 \u0437\u0430\u0432\u043E\u0434\u0430</h2></header>\n    <div class="factory-grid"><figure class="fphoto"><img class="ph-factory" src="assets/factory-workshop.jpg" alt="\u041F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0446\u0435\u0445 \u0441 \u043C\u043E\u0441\u0442\u043E\u0432\u044B\u043C\u0438 \u043A\u0440\u0430\u043D\u0430\u043C\u0438" loading="lazy"></figure><figure class="fphoto"><img class="ph-factory" src="assets/factory-assembly.jpg" alt="\u0421\u0431\u043E\u0440\u043E\u0447\u043D\u0430\u044F \u043F\u043B\u043E\u0449\u0430\u0434\u043A\u0430 \u0441 \u043C\u043E\u0441\u0442\u043E\u0432\u044B\u043C \u043A\u0440\u0430\u043D\u043E\u043C" loading="lazy"></figure><figure class="fphoto"><img class="ph-factory" src="assets/factory-workers.jpg" alt="\u0420\u0430\u0431\u043E\u0447\u0438\u0435 \u0438\u0437\u0433\u043E\u0442\u0430\u0432\u043B\u0438\u0432\u0430\u044E\u0442 \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0432 \u0446\u0435\u0445\u0435" loading="lazy"></figure><figure class="fphoto"><img class="ph-factory" src="assets/factory-lathe.jpg" alt="\u0422\u043E\u043A\u0430\u0440\u043D\u0430\u044F \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430 \u043A\u0440\u0443\u043F\u043D\u044B\u043C \u043F\u043B\u0430\u043D\u043E\u043C" loading="lazy"></figure><figure class="fphoto"><img class="ph-factory" src="assets/factory-aerial.jpg" alt="\u0412\u0445\u043E\u0434 \u043D\u0430 \u0437\u0430\u0432\u043E\u0434 \u0438 \u043E\u0444\u0438\u0441\u043D\u043E\u0435 \u0437\u0434\u0430\u043D\u0438\u0435, \u0432\u0438\u0434 \u0441 \u0432\u044B\u0441\u043E\u0442\u044B" loading="lazy"></figure></div>\n  </section>\n\n  <!-- \u2466 Factory Tour Video -->\n  <section class="video dark" id="video">\n    <header class="sec-head"><span class="sec-num">07</span><h2>\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0438\u0442\u0435 \u0437\u0430\u0432\u043E\u0434 \u0432 \u0440\u0430\u0431\u043E\u0442\u0435</h2></header>\n    <div class="video-wrap">\n      <video class="ph-video" style="aspect-ratio:16/9" src="assets/factory-tour.mp4" controls preload="none" playsinline poster="assets/video-poster.jpg"></video>\n      <div class="video-side">\n        <p>\u0421\u043D\u044F\u0442\u043E \u043D\u0430 \u043D\u0430\u0448\u0435\u043C \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0441\u0442\u0432\u0435: \u043B\u0430\u0437\u0435\u0440\u043D\u0430\u044F \u0440\u0435\u0437\u043A\u0430, \u0433\u0438\u0431\u043A\u0430, \u0442\u043E\u043A\u0430\u0440\u043D\u0430\u044F \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430, \u0441\u0432\u0430\u0440\u043A\u0430, \u0441\u0431\u043E\u0440\u043A\u0430 \u0444\u0438\u043B\u044C\u0442\u0440-\u043F\u0440\u0435\u0441\u0441\u043E\u0432 \u0438 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0430\u044F \u043B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u0438\u044F.</p>\n        <a class="cta" href="https://wa.me/8613360213795" target="_blank" rel="noopener">\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u0432\u0438\u0434\u0435\u043E\u0442\u0443\u0440 \u043F\u043E \u0437\u0430\u0432\u043E\u0434\u0443</a>\n      </div>\n    </div>\n  </section>\n\n  <!-- \u2468 Performance & Patents -->\n  <section class="performance" id="performance">\n    <header class="sec-head"><span class="sec-num">09</span><h2>\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u0432 \u043F\u043E\u043B\u0435 \u0438 \u0437\u0430\u043F\u0430\u0442\u0435\u043D\u0442\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u044F</h2></header>\n    <div class="perf-grid">\n      <figure class="perf-main"><img class="ph-perf" src="assets/perf-before-after.jpg" alt="\u041F\u0440\u043E\u0431\u044B \u0432\u043E\u0434\u044B \u0434\u043E \u0438 \u043F\u043E\u0441\u043B\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438 \u043D\u0430 \u0444\u043B\u043E\u0442\u0430\u0442\u043E\u0440\u0435 CXPF" loading="lazy"><figcaption>\u0414\u043E \u0438 \u043F\u043E\u0441\u043B\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438 \u2014 CXPF</figcaption></figure>\n      <figure class="perf-side"><img class="ph-perf" src="assets/site-pakistan.jpg" alt="\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430 \u0444\u0438\u043B\u044C\u0442\u0440-\u043F\u0440\u0435\u0441\u0441\u0430 \u043D\u0430 \u043E\u0431\u0435\u0437\u0432\u043E\u0436\u0438\u0432\u0430\u043D\u0438\u0438 \u0443\u0433\u043E\u043B\u044C\u043D\u043E\u0433\u043E \u0448\u043B\u0430\u043C\u0430, \u041F\u0430\u043A\u0438\u0441\u0442\u0430\u043D (60 \u0442/\u0441\u0443\u0442)" loading="lazy"></figure>\n      <figure class="perf-side"><img class="ph-perf" src="assets/site-zambia.jpg" alt="\u041B\u0435\u043D\u0442\u043E\u0447\u043D\u044B\u0439 \u0444\u0438\u043B\u044C\u0442\u0440-\u043F\u0440\u0435\u0441\u0441 \u043E\u0431\u0435\u0437\u0432\u043E\u0436\u0438\u0432\u0430\u0435\u0442 \u043C\u0435\u0434\u043D\u044B\u0435 \u0445\u0432\u043E\u0441\u0442\u044B, \u0417\u0430\u043C\u0431\u0438\u044F (300 \u043C\xB3/\u0441\u0443\u0442)" loading="lazy"></figure>\n    </div>\n    <p class="patents-line">\u0417\u0430\u043F\u0430\u0442\u0435\u043D\u0442\u043E\u0432\u0430\u043D\u043D\u0430\u044F \u043F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F \u2014 \u0444\u043B\u043E\u0442\u0430\u0442\u043E\u0440\u044B: 201720174028.6 / 201720174147.1 \uFF5C \u043B\u0435\u043D\u0442\u043E\u0447\u043D\u044B\u0439 \u0444\u0438\u043B\u044C\u0442\u0440-\u043F\u0440\u0435\u0441\u0441: 201720174005.5 \uFF5C \u043A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0435 \u0438 MBR-\u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438: 201720174014.4 \uFF5C \u0442\u043E\u043D\u043A\u043E\u0441\u043B\u043E\u0439\u043D\u044B\u0439 \u0444\u0438\u043B\u044C\u0442\u0440-\u043F\u0440\u0435\u0441\u0441 \u0432\u044B\u0441\u043E\u043A\u043E\u0439 \u0441\u0443\u0445\u043E\u0441\u0442\u0438: 201720174031.8</p>\n  </section>\n\n  <!-- \u2469 Quality Assurance -->\n  <section class="quality band" id="quality">\n    <header class="sec-head"><span class="sec-num">10</span><h2>\u041A\u0430\u043A \u043C\u044B \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u0438\u0440\u0443\u0435\u043C \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u043E</h2></header>\n    <ol class="quality-list"><li><span class="q-num">1</span><p>\u041F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0441\u0442\u0432\u043E \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u043F\u043E \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0439 \u0441\u0438\u0441\u0442\u0435\u043C\u0435 \u043C\u0435\u043D\u0435\u0434\u0436\u043C\u0435\u043D\u0442\u0430 ISO 9001:2015; \u043A\u0430\u0436\u0434\u0430\u044F \u043C\u0430\u0448\u0438\u043D\u0430 \u043F\u0440\u043E\u0445\u043E\u0434\u0438\u0442 \u0437\u0430\u0432\u043E\u0434\u0441\u043A\u0443\u044E \u043F\u0440\u0438\u0451\u043C\u043A\u0443 \u043F\u0435\u0440\u0435\u0434 \u043E\u0442\u0433\u0440\u0443\u0437\u043A\u043E\u0439.</p></li><li><span class="q-num">2</span><p>\u041F\u0435\u0440\u0435\u0434 \u043E\u043A\u043E\u043D\u0447\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u043C \u0432\u044B\u0431\u043E\u0440\u043E\u043C \u0442\u0435\u0445\u043D\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0441\u0445\u0435\u043C\u044B \u043C\u044B \u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0435\u043C \u0438\u0441\u0445\u043E\u0434\u043D\u0443\u044E \u0438 \u043E\u0447\u0438\u0449\u0435\u043D\u043D\u0443\u044E \u0432\u043E\u0434\u0443 \u0432 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0439 \u043B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u0438\u0438.</p></li><li><span class="q-num">3</span><p>\u041F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u0438 \u043C\u043E\u0433\u0443\u0442 \u0437\u0430\u043A\u0430\u0437\u0430\u0442\u044C \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u0443\u044E \u0438\u043D\u0441\u043F\u0435\u043A\u0446\u0438\u044E (SGS, BV \u0438\u043B\u0438 T\xDCV) \u043F\u0435\u0440\u0435\u0434 \u043E\u0442\u0433\u0440\u0443\u0437\u043A\u043E\u0439.</p></li><li><span class="q-num">4</span><p>\u0413\u0430\u0440\u0430\u043D\u0442\u0438\u044F: 12 \u043C\u0435\u0441\u044F\u0446\u0435\u0432. \u041E\u0442\u0432\u0435\u0442 \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 8 \u0447\u0430\u0441\u043E\u0432; \u043E\u043D\u043B\u0430\u0439\u043D-\u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430 \u043F\u043E \u0432\u0438\u0434\u0435\u043E \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 24\u201348 \u0447\u0430\u0441\u043E\u0432; \u043F\u043E\u0436\u0438\u0437\u043D\u0435\u043D\u043D\u043E\u0435 \u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435.</p></li></ol>\n  </section>\n\n  <!-- \u246A FAQ -->\n  <section class="faq" id="faq">\n    <header class="sec-head"><span class="sec-num">11</span><h2>\u0412\u043E\u043F\u0440\u043E\u0441\u044B \u0438 \u043E\u0442\u0432\u0435\u0442\u044B</h2></header>\n    <details class="faq-item"><summary>\u041C\u0438\u043D\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u0437\u0430\u043A\u0430\u0437?<span class="faq-ico" aria-hidden="true"></span></summary><div class="faq-a"><p>\u041E\u0434\u043D\u0430 \u0435\u0434\u0438\u043D\u0438\u0446\u0430.</p></div></details><details class="faq-item"><summary>\u0421\u0440\u043E\u043A\u0438 \u043F\u043E\u0441\u0442\u0430\u0432\u043A\u0438?<span class="faq-ico" aria-hidden="true"></span></summary><div class="faq-a"><p>\u0421\u043A\u043B\u0430\u0434\u0441\u043A\u0438\u0435 \u043C\u0430\u0448\u0438\u043D\u044B \u043E\u0442\u0433\u0440\u0443\u0436\u0430\u044E\u0442\u0441\u044F \u043F\u0440\u0438\u043C\u0435\u0440\u043D\u043E \u0437\u0430 5 \u0434\u043D\u0435\u0439; \u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u2014 \u043E\u043A\u043E\u043B\u043E 30 \u0434\u043D\u0435\u0439; \u043D\u0435\u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0435 \u0441\u0438\u0441\u0442\u0435\u043C\u044B \u2014 45\u201360 \u0434\u043D\u0435\u0439.</p></div></details><details class="faq-item"><summary>\u041E\u043F\u043B\u0430\u0442\u0430 \u0438 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u043F\u043E\u0441\u0442\u0430\u0432\u043A\u0438?<span class="faq-ico" aria-hidden="true"></span></summary><div class="faq-a"><p>T/T, Western Union, PayPal. EXW, FOB, C&amp;F \u0438\u043B\u0438 CIF \u0438\u0437 \u0426\u0438\u043D\u0434\u0430\u043E, \u0428\u0430\u043D\u0445\u0430\u044F, \u0413\u0443\u0430\u043D\u0447\u0436\u043E\u0443 \u0438\u043B\u0438 \u0428\u044D\u043D\u044C\u0447\u0436\u044D\u043D\u044F.</p></div></details><details class="faq-item"><summary>\u0427\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0434\u043B\u044F \u0440\u0430\u0441\u0447\u0451\u0442\u0430 \u043D\u0435\u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u043E\u0439 \u0441\u0438\u0441\u0442\u0435\u043C\u044B?<span class="faq-ico" aria-hidden="true"></span></summary><div class="faq-a"><p>\u0410\u043D\u0430\u043B\u0438\u0437 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u0432\u043E\u0434\u044B, \u0442\u0440\u0435\u0431\u0443\u0435\u043C\u044B\u0439 \u043D\u043E\u0440\u043C\u0430\u0442\u0438\u0432 \u043E\u0447\u0438\u0449\u0435\u043D\u043D\u043E\u0439 \u0432\u043E\u0434\u044B, \u0447\u0430\u0441\u043E\u0432\u043E\u0439 \u0440\u0430\u0441\u0445\u043E\u0434, \u043C\u0435\u0441\u0442\u043D\u044B\u0435 \u043D\u0430\u043F\u0440\u044F\u0436\u0435\u043D\u0438\u0435 \u0438 \u0447\u0430\u0441\u0442\u043E\u0442\u0430 \u0441\u0435\u0442\u0438, \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u043F\u043B\u043E\u0449\u0430\u0434\u043A\u0438. \u041D\u0430\u0448\u0438 \u0438\u043D\u0436\u0435\u043D\u0435\u0440\u044B \u043E\u0442\u0432\u0435\u0447\u0430\u044E\u0442 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435\u043C \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 24 \u0447\u0430\u0441\u043E\u0432.</p></div></details>\n    <p class="faq-more"><a class="text-link" href="/faq">\u0412\u0441\u0435 \u0432\u043E\u043F\u0440\u043E\u0441\u044B \u0438 \u043E\u0442\u0432\u0435\u0442\u044B</a></p>\n  </section>\n\n  <!-- \u246B From the Blog -->\n  <section class="blog" id="blog">\n    <header class="sec-head"><span class="sec-num">12</span><h2>\u0418\u0437 \u0431\u043B\u043E\u0433\u0430</h2></header>\n    <div class="posts">',
  "es": '\n\n  <!-- \u2462 Who We Serve -->\n  <section class="serve dark" id="serve">\n    <header class="sec-head"><span class="sec-num">03</span><h2>Con qui\xE9n trabajamos</h2></header>\n    <ul class="serve-list"><li>Contratistas EPC y empresas de ingenier\xEDa</li><li>Distribuidores y agentes (OEM y ODM)</li><li>Plantas municipales de aguas residuales</li><li>Procesadores de alimentos y bebidas</li><li>Tintura textil, f\xE1bricas de pulpa y papel</li><li>Miner\xEDa y metalurgia</li><li>Granjas ganaderas y lecheras</li><li>Centros de tratamiento de lodos</li></ul>\n    <p class="serve-note">Productos vendidos en m\xE1s de 30 provincias de China y exportados a Rusia, Ir\xE1n, Vietnam, Banglad\xE9s, Jordania, Per\xFA, Arabia Saudita, M\xE9xico, Brasil, Kenia y m\xE1s de 40 pa\xEDses.</p>\n  </section>\n\n  <!-- \u2463 By the Numbers -->\n  <section class="numbers band" id="numbers"><div class="stats"><div class="stat"><span class="stat-num">17+</span><span class="stat-label">A\xF1os en operaci\xF3n desde 2009</span></div><div class="stat"><span class="stat-num">39.656 m\xB2</span><span class="stat-label">Taller</span></div><div class="stat"><span class="stat-num">200+</span><span class="stat-label">Empleados</span></div><div class="stat"><span class="stat-num">30+</span><span class="stat-label">Ingenieros de I+D</span></div><div class="stat"><span class="stat-num">40+</span><span class="stat-label">Patentes</span></div><div class="stat"><span class="stat-num">50+</span><span class="stat-label">Pa\xEDses de exportaci\xF3n</span></div></div></section>\n\n  <!-- \u2464 Certifications -->\n  <section class="certs band" id="certs">\n    <header class="sec-head"><span class="sec-num">05</span><h2>Certificados y calificaciones</h2></header>\n    <div class="cert-grid"><button class="cert" type="button" data-cert="ISO 9001:2015" data-cert-src="assets/cert-iso9001.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-iso9001.jpg" alt="Certificado ISO 9001" loading="lazy"><span class="cert-name">ISO 9001:2015</span><span class="cert-meta">Gesti\xF3n de calidad \xB7 SEATONE \xB7 v\xE1lido hasta marzo de 2029</span></button><button class="cert" type="button" data-cert="ISO 14001:2015" data-cert-src="assets/cert-iso14001.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-iso14001.jpg" alt="Certificado ISO 14001" loading="lazy"><span class="cert-name">ISO 14001:2015</span><span class="cert-meta">Gesti\xF3n ambiental \xB7 SEATONE \xB7 v\xE1lido hasta marzo de 2029</span></button><button class="cert" type="button" data-cert="ISO 45001:2018" data-cert-src="assets/cert-iso45001.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-iso45001.jpg" alt="Certificado ISO 45001" loading="lazy"><span class="cert-name">ISO 45001:2018</span><span class="cert-meta">Seguridad y salud ocupacional \xB7 SEATONE \xB7 v\xE1lido hasta marzo de 2029</span></button><button class="cert" type="button" data-cert="CE \u2014 Water Treatment Equipment" data-cert-src="assets/cert-ce-water.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-ce-water.jpg" alt="Certificado CE de equipos de tratamiento de agua" loading="lazy"><span class="cert-name">CE \u2014 Equipos de tratamiento de agua</span><span class="cert-meta">Directiva de M\xE1quinas 2006/42/CE \xB7 UDEM \xB7 v\xE1lido hasta junio de 2031</span></button><button class="cert" type="button" data-cert="CE \u2014 Incinerators" data-cert-src="assets/cert-ce-incinerator.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-ce-incinerator.jpg" alt="Certificado CE de incineradores" loading="lazy"><span class="cert-name">CE \u2014 Incineradores</span><span class="cert-meta">MD 2006/42/CE y EN 746-1 \xB7 v\xE1lido hasta octubre de 2031</span></button><button class="cert" type="button" data-cert="Five-Star After-Sales Service" data-cert-src="assets/cert-fivestar.jpg"><img class="ph-cert" style="aspect-ratio:3/4" src="assets/cert-fivestar.jpg" alt="Certificado de servicio posventa cinco estrellas" loading="lazy"><span class="cert-name">Servicio posventa cinco estrellas</span><span class="cert-meta">GB/T 27922 \xB7 v\xE1lido hasta marzo de 2027</span></button></div>\n  </section>\n\n  <!-- \u2465 Inside the Factory -->\n  <section class="factory" id="factory">\n    <header class="sec-head"><span class="sec-num">06</span><h2>Dentro de la f\xE1brica</h2></header>\n    <div class="factory-grid"><figure class="fphoto"><img class="ph-factory" src="assets/factory-workshop.jpg" alt="Taller de producci\xF3n con puentes gr\xFAa" loading="lazy"></figure><figure class="fphoto"><img class="ph-factory" src="assets/factory-assembly.jpg" alt="\xC1rea de montaje con puente gr\xFAa" loading="lazy"></figure><figure class="fphoto"><img class="ph-factory" src="assets/factory-workers.jpg" alt="Trabajadores fabricando equipos en el taller" loading="lazy"></figure><figure class="fphoto"><img class="ph-factory" src="assets/factory-lathe.jpg" alt="Primer plano de mecanizado en torno" loading="lazy"></figure><figure class="fphoto"><img class="ph-factory" src="assets/factory-aerial.jpg" alt="Entrada de la f\xE1brica y edificio de oficinas, vista a\xE9rea" loading="lazy"></figure></div>\n  </section>\n\n  <!-- \u2466 Factory Tour Video -->\n  <section class="video dark" id="video">\n    <header class="sec-head"><span class="sec-num">07</span><h2>Vea la f\xE1brica en funcionamiento</h2></header>\n    <div class="video-wrap">\n      <video class="ph-video" style="aspect-ratio:16/9" src="assets/factory-tour.mp4" controls preload="none" playsinline poster="assets/video-poster.jpg"></video>\n      <div class="video-side">\n        <p>Filmado en nuestra planta de producci\xF3n: corte l\xE1ser, plegado, mecanizado en torno, soldadura, montaje de filtros prensa y laboratorio propio.</p>\n        <a class="cta" href="https://wa.me/8613360213795" target="_blank" rel="noopener">Reserve una visita por video en directo</a>\n      </div>\n    </div>\n  </section>\n\n  <!-- \u2468 Performance & Patents -->\n  <section class="performance" id="performance">\n    <header class="sec-head"><span class="sec-num">09</span><h2>Rendimiento en campo y dise\xF1o patentado</h2></header>\n    <div class="perf-grid">\n      <figure class="perf-main"><img class="ph-perf" src="assets/perf-before-after.jpg" alt="Muestras de agua antes y despu\xE9s del tratamiento con flotaci\xF3n CXPF" loading="lazy"><figcaption>Antes y despu\xE9s del tratamiento \u2014 CXPF</figcaption></figure>\n      <figure class="perf-side"><img class="ph-perf" src="assets/site-pakistan.jpg" alt="Instalaci\xF3n de filtro prensa en deshidrataci\xF3n de lodos de carb\xF3n, Pakist\xE1n (60 t/d)" loading="lazy"></figure>\n      <figure class="perf-side"><img class="ph-perf" src="assets/site-zambia.jpg" alt="Filtro prensa de banda deshidratando relaves de cobre, Zambia (300 m\xB3/d)" loading="lazy"></figure>\n    </div>\n    <p class="patents-line">Productos patentados \u2014 DAF: 201720174028.6 / 201720174147.1 \uFF5C filtro prensa de banda: 201720174005.5 \uFF5C plantas compactas y MBR: 201720174014.4 \uFF5C filtro prensa de capa fina y alta sequedad: 201720174031.8</p>\n  </section>\n\n  <!-- \u2469 Quality Assurance -->\n  <section class="quality band" id="quality">\n    <header class="sec-head"><span class="sec-num">10</span><h2>C\xF3mo controlamos la calidad</h2></header>\n    <ol class="quality-list"><li><span class="q-num">1</span><p>La producci\xF3n opera bajo un sistema de gesti\xF3n certificado ISO 9001:2015; cada m\xE1quina se inspecciona en f\xE1brica antes del env\xEDo.</p></li><li><span class="q-num">2</span><p>Analizamos el agua de entrada y la tratada en nuestro propio laboratorio antes de finalizar el dise\xF1o del proceso.</p></li><li><span class="q-num">3</span><p>Los compradores pueden organizar una inspecci\xF3n independiente (SGS, BV o T\xDCV) antes del env\xEDo.</p></li><li><span class="q-num">4</span><p>Garant\xEDa: 12 meses. Respuesta en 8 horas; soporte en l\xEDnea por video en 24\u201348 horas; mantenimiento de por vida.</p></li></ol>\n  </section>\n\n  <!-- \u246A FAQ -->\n  <section class="faq" id="faq">\n    <header class="sec-head"><span class="sec-num">11</span><h2>Preguntas frecuentes</h2></header>\n    <details class="faq-item"><summary>\xBFPedido m\xEDnimo?<span class="faq-ico" aria-hidden="true"></span></summary><div class="faq-a"><p>Una unidad.</p></div></details><details class="faq-item"><summary>\xBFPlazo de entrega?<span class="faq-ico" aria-hidden="true"></span></summary><div class="faq-a"><p>Las m\xE1quinas en stock se env\xEDan en unos 5 d\xEDas; los modelos est\xE1ndar en unos 30 d\xEDas; los sistemas personalizados en 45\u201360 d\xEDas.</p></div></details><details class="faq-item"><summary>\xBFPago y condiciones comerciales?<span class="faq-ico" aria-hidden="true"></span></summary><div class="faq-a"><p>T/T, Western Union, PayPal. EXW, FOB, C&amp;F o CIF desde Qingdao, Shangh\xE1i, Cant\xF3n o Shenzhen.</p></div></details><details class="faq-item"><summary>\xBFQu\xE9 necesitan para cotizar un sistema a medida?<span class="faq-ico" aria-hidden="true"></span></summary><div class="faq-a"><p>An\xE1lisis del agua de entrada, norma de efluente requerida, caudal por hora, voltaje y frecuencia locales y condiciones del sitio. Nuestros ingenieros responden con una propuesta en 24 horas.</p></div></details>\n    <p class="faq-more"><a class="text-link" href="/faq">Ver todas las preguntas</a></p>\n  </section>\n\n  <!-- \u246B From the Blog -->\n  <section class="blog" id="blog">\n    <header class="sec-head"><span class="sec-num">12</span><h2>Del blog</h2></header>\n    <div class="posts">'
};
var HOME_P2B = {
  "ru": '<p class="blog-more"><a class="text-link" href="/blog">\u0412\u0441\u0435 \u0441\u0442\u0430\u0442\u044C\u0438</a></p>\n  </section>\n\n  <!-- \u246C Bottom Inquiry -->\n  <section class="inquiry dark" id="inquiry">\n    <header class="sec-head"><span class="sec-num">13</span><h2>\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441</h2></header>\n    <div class="inquiry-grid">\n      <form class="inq-form" id="inqForm" novalidate>\n      <input type="text" name="company_website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">\n        <div class="field"><label for="f-name">\u0418\u043C\u044F *</label><input id="f-name" name="name" type="text" required autocomplete="name"></div>\n        <div class="field"><label for="f-email">\u042D\u043B. \u043F\u043E\u0447\u0442\u0430 *</label><input id="f-email" name="email" type="email" required autocomplete="email"></div>\n        <div class="field"><label for="f-wa">WhatsApp \u0438\u043B\u0438 \u0442\u0435\u043B\u0435\u0444\u043E\u043D *</label><input id="f-wa" name="whatsapp" type="tel" required autocomplete="tel"></div>\n        <div class="field"><label for="f-country">\u0421\u0442\u0440\u0430\u043D\u0430 *</label><input id="f-country" name="country" type="text" required autocomplete="country-name"></div>\n        <div class="field"><label for="f-type">\u0422\u0438\u043F \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u044F *</label>\n          <select id="f-type" name="type" required>\n            <option value="" selected disabled>\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435\u2026</option>\n            <option>\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u043E\u0447\u0438\u0441\u0442\u043A\u0438 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434</option>\n            <option>\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u0435\u043F\u0430\u0440\u0430\u0446\u0438\u0438 \u0442\u0432\u0451\u0440\u0434\u043E\u0439 \u0438 \u0436\u0438\u0434\u043A\u043E\u0439 \u0444\u0430\u0437</option>\n            <option>\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u0436\u0438\u0433\u0430\u043D\u0438\u044F \u043E\u0442\u0445\u043E\u0434\u043E\u0432</option>\n            <option>\u0414\u0440\u0443\u0433\u043E\u0435 / \u043D\u0435 \u0443\u0432\u0435\u0440\u0435\u043D</option>\n          </select></div>\n        <div class="field field-full"><label for="f-msg">\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 *</label><textarea id="f-msg" name="message" rows="4" required></textarea></div>\n        <div class="field field-full"><label for="f-file">\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0444\u0430\u0439\u043B\u0430 <i>(\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u2014 \u0430\u043D\u0430\u043B\u0438\u0437 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u0432\u043E\u0434\u044B, \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E \u0432\u043E\u0434\u0435 \u0438\u043B\u0438 \u043E\u0441\u0430\u0434\u043A\u0443)</i></label><input id="f-file" name="file" type="file"></div>\n        <p class="form-err" id="formErr" role="alert" hidden>\u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0432\u0441\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u043B\u044F.</p>\n        <div class="demo-note" id="inqNote">\n          <h3>\u041D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E</h3>\n          <p>\u0424\u043E\u0440\u043C\u0430 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u043B\u0430\u0441\u044C (\u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430). \u0414\u0430\u043D\u043D\u044B\u0435 \u043D\u0435 \u043F\u043E\u0442\u0435\u0440\u044F\u043D\u044B \u2014 \u043E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0438\u0445 \u043E\u0434\u043D\u043E\u0439 \u0438\u0437 \u043A\u043D\u043E\u043F\u043E\u043A \u043D\u0438\u0436\u0435, \u043E\u043D\u0438 \u0443\u0436\u0435 \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u044B.</p>\n          <div class="row">\n            <a class="btn demo-mail" href="#">\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043F\u043E \u043F\u043E\u0447\u0442\u0435</a>\n            <a class="btn ghost demo-wa" style="border-color:var(--acc);color:var(--acc)" href="#" target="_blank" rel="noopener">\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0432 WhatsApp</a>\n          </div>\n          <small>\u0418\u043B\u0438 \u043D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043D\u0430\u043C \u043D\u0430\u043F\u0440\u044F\u043C\u0443\u044E: steffy@huayienviron.com \u2014 \u043E\u0442\u0432\u0435\u0447\u0430\u0435\u043C \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 24 \u0447\u0430\u0441\u043E\u0432.</small>\n        </div>\n        <button class="cta submit" type="submit">\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441 \u2014 \u043E\u0442\u0432\u0435\u0442 \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 24 \u0447\u0430\u0441\u043E\u0432</button>\n      </form>\n      <aside class="inq-side">\n        <h3>\u041F\u0440\u044F\u043C\u044B\u0435 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u044B</h3>\n        <p><span>Email</span><a href="mailto:steffy@huayienviron.com">steffy@huayienviron.com</a></p>\n        <p><span>WhatsApp</span><a href="https://wa.me/8613360213795" target="_blank" rel="noopener">+86 13360213795</a></p>\n        <p><span>\u0410\u0434\u0440\u0435\u0441</span>Mizhou Industrial Avenue, Zhucheng, Shandong, China</p>\n        <div class="side-links">\n          <a href="/catalog">\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043A\u0430\u0442\u0430\u043B\u043E\u0433</a>\n          <a href="/ru/get-a-solution">\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435</a>\n        </div>\n      </aside>\n    </div>\n  </section>\n</main>',
  "es": '<p class="blog-more"><a class="text-link" href="/blog">Ver todos los art\xEDculos</a></p>\n  </section>\n\n  <!-- \u246C Bottom Inquiry -->\n  <section class="inquiry dark" id="inquiry">\n    <header class="sec-head"><span class="sec-num">13</span><h2>Enviar una consulta</h2></header>\n    <div class="inquiry-grid">\n      <form class="inq-form" id="inqForm" novalidate>\n      <input type="text" name="company_website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">\n        <div class="field"><label for="f-name">Nombre *</label><input id="f-name" name="name" type="text" required autocomplete="name"></div>\n        <div class="field"><label for="f-email">Correo electr\xF3nico *</label><input id="f-email" name="email" type="email" required autocomplete="email"></div>\n        <div class="field"><label for="f-wa">WhatsApp o m\xF3vil *</label><input id="f-wa" name="whatsapp" type="tel" required autocomplete="tel"></div>\n        <div class="field"><label for="f-country">Pa\xEDs *</label><input id="f-country" name="country" type="text" required autocomplete="country-name"></div>\n        <div class="field"><label for="f-type">Tipo de equipo *</label>\n          <select id="f-type" name="type" required>\n            <option value="" selected disabled>Seleccione\u2026</option>\n            <option>Equipos de tratamiento de aguas residuales</option>\n            <option>Equipos de separaci\xF3n s\xF3lido-l\xEDquido</option>\n            <option>Equipos de incineraci\xF3n de residuos</option>\n            <option>Otro / no estoy seguro</option>\n          </select></div>\n        <div class="field field-full"><label for="f-msg">Mensaje *</label><textarea id="f-msg" name="message" rows="4" required></textarea></div>\n        <div class="field field-full"><label for="f-file">Adjuntar archivo <i>(opcional \u2014 an\xE1lisis de agua de entrada, datos de agua o lodo)</i></label><input id="f-file" name="file" type="file"></div>\n        <p class="form-err" id="formErr" role="alert" hidden>Por favor, complete todos los campos obligatorios.</p>\n        <div class="demo-note" id="inqNote">\n          <h3>No se ha enviado</h3>\n          <p>El formulario no se pudo enviar por un error t\xE9cnico. Sus datos no se pierden: env\xEDelos con uno de los botones de abajo, ya est\xE1n preparados.</p>\n          <div class="row">\n            <a class="btn demo-mail" href="#">Enviar por correo</a>\n            <a class="btn ghost demo-wa" style="border-color:var(--acc);color:var(--acc)" href="#" target="_blank" rel="noopener">Enviar por WhatsApp</a>\n          </div>\n          <small>O escr\xEDbanos directamente: steffy@huayienviron.com \u2014 respondemos en 24 horas.</small>\n        </div>\n        <button class="cta submit" type="submit">Enviar consulta \u2014 respuesta en 24 horas</button>\n      </form>\n      <aside class="inq-side">\n        <h3>Contactos directos</h3>\n        <p><span>Email</span><a href="mailto:steffy@huayienviron.com">steffy@huayienviron.com</a></p>\n        <p><span>WhatsApp</span><a href="https://wa.me/8613360213795" target="_blank" rel="noopener">+86 13360213795</a></p>\n        <p><span>Direcci\xF3n</span>Mizhou Industrial Avenue, Zhucheng, Shandong, China</p>\n        <div class="side-links">\n          <a href="/catalog">Descargar cat\xE1logo</a>\n          <a href="/es/get-a-solution">Solicitar propuesta gratuita</a>\n        </div>\n      </aside>\n    </div>\n  </section>\n</main>'
};
var PRODUCTS_PRE_T = {
  "ru": '<main>\n\n<div class="wrap">\n  <nav class="crumbs" aria-label="Breadcrumb"><a href="/ru/">\u0413\u043B\u0430\u0432\u043D\u0430\u044F</a><span>/</span><b>\u041F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F</b></nav>\n  <div class="page-hero">\n    <div class="eyebrow">\u041F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F</div>\n    <h1>\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u043E\u0447\u0438\u0441\u0442\u043A\u0438 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434, \u043E\u0431\u0435\u0437\u0432\u043E\u0436\u0438\u0432\u0430\u043D\u0438\u044F \u043E\u0441\u0430\u0434\u043A\u0430 \u0438 \u0441\u0436\u0438\u0433\u0430\u043D\u0438\u044F \u043E\u0442\u0445\u043E\u0434\u043E\u0432</h1>\n    <p class="lede">\u041C\u044B \u043F\u0440\u043E\u0435\u043A\u0442\u0438\u0440\u0443\u0435\u043C \u0438 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u043C \u0442\u0440\u0438 \u0433\u0440\u0443\u043F\u043F\u044B \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u044F, \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u043D\u0438\u0436\u0435, \u043D\u0430 \u043D\u0430\u0448\u0435\u043C \u0437\u0430\u0432\u043E\u0434\u0435 \u043F\u043B\u043E\u0449\u0430\u0434\u044C\u044E 39 656 \u043C\xB2 \u0432 \u0427\u0436\u0443\u0447\u044D\u043D\u0435, \u043F\u0440\u043E\u0432\u0438\u043D\u0446\u0438\u044F \u0428\u0430\u043D\u044C\u0434\u0443\u043D. \u0411\u043E\u043B\u044C\u0448\u0438\u043D\u0441\u0442\u0432\u043E \u043C\u043E\u0434\u0435\u043B\u0435\u0439 \u2014 \u0432 \u043D\u0430\u043B\u0438\u0447\u0438\u0438 \u0438\u043B\u0438 \u0441 \u043A\u043E\u0440\u043E\u0442\u043A\u0438\u043C \u0441\u0440\u043E\u043A\u043E\u043C \u043F\u043E\u0441\u0442\u0430\u0432\u043A\u0438. \u0414\u043B\u044F \u043D\u0435\u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447 \u043C\u044B \u043F\u043E\u0434\u0431\u0438\u0440\u0430\u0435\u043C \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u043E \u0432\u0430\u0448\u0438\u043C \u0434\u0430\u043D\u043D\u044B\u043C \u043E \u0432\u043E\u0434\u0435 \u0438\u043B\u0438 \u043E\u0441\u0430\u0434\u043A\u0435 \u2014 \u043E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0438\u0445 \u0447\u0435\u0440\u0435\u0437 <a href="/ru/get-a-solution" style="color:var(--acc)">\xAB\u041F\u043E\u0434\u0431\u043E\u0440 \u0440\u0435\u0448\u0435\u043D\u0438\u044F\xBB</a>.</p>\n  </div>\n\n  ',
  "es": '<main>\n\n<div class="wrap">\n  <nav class="crumbs" aria-label="Breadcrumb"><a href="/es/">Inicio</a><span>/</span><b>Productos</b></nav>\n  <div class="page-hero">\n    <div class="eyebrow">Productos</div>\n    <h1>Equipos de tratamiento de aguas residuales, deshidrataci\xF3n de lodos e incineraci\xF3n de residuos</h1>\n    <p class="lede">Dise\xF1amos y fabricamos los tres grupos de equipos siguientes en nuestra f\xE1brica de 39 656 m\xB2 en Zhucheng, Shandong. La mayor\xEDa de los modelos est\xE1n en stock o con plazo de entrega corto. Para trabajos no est\xE1ndar, dimensionamos el equipo a partir de sus datos de agua o lodo \u2014 env\xEDelos a trav\xE9s de <a href="/es/get-a-solution" style="color:var(--acc)">Obtener una soluci\xF3n</a>.</p>\n  </div>\n\n  '
};
var PRODUCTS_POST_T = {
  "ru": '<div class="note-strip" style="margin:34px 0 60px">\u041D\u0435 \u043D\u0430\u0448\u043B\u0438 \u043D\u0443\u0436\u043D\u044B\u0439 \u0442\u0438\u043F \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u044F? <a href="/ru/get-a-solution" style="color:var(--acc);font-weight:600">\u0421\u043F\u0440\u043E\u0441\u0438\u0442\u0435 \u0438\u043D\u0436\u0435\u043D\u0435\u0440\u0430</a>.</div>\n</div>\n</main>',
  "es": '<div class="note-strip" style="margin:34px 0 60px">\xBFNo encuentra su tipo de equipo? <a href="/es/get-a-solution" style="color:var(--acc);font-weight:600">Consulte a un ingeniero</a>.</div>\n</div>\n</main>'
};
var CATS_T = {
  "ru": {
    "wastewater-treatment": '<nav class="crumbs" aria-label="Breadcrumb"><a href="/ru/">\u0413\u043B\u0430\u0432\u043D\u0430\u044F</a><span>/</span><a href="/ru/products">\u041F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F</a><span>/</span><b>\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u043E\u0447\u0438\u0441\u0442\u043A\u0438 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434</b></nav>\n  <div class="page-hero">\n    <div class="eyebrow">\u041F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F</div>\n    <h1>\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u043E\u0447\u0438\u0441\u0442\u043A\u0438 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434</h1>\n    <p class="lede">\u041F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u043E\u0447\u0438\u0441\u0442\u043A\u0430, \u0444\u043B\u043E\u0442\u0430\u0446\u0438\u044F, \u0441\u0435\u0434\u0438\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F \u0438 \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0441\u043D\u044B\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u0434\u043B\u044F \u0433\u043E\u0440\u043E\u0434\u0441\u043A\u0438\u0445 \u0438 \u043F\u0440\u043E\u043C\u044B\u0448\u043B\u0435\u043D\u043D\u044B\u0445 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434. \u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438\u043C\u0435\u044E\u0442 \u043C\u0430\u0440\u043A\u0438\u0440\u043E\u0432\u043A\u0443 CE \u043F\u043E \u0414\u0438\u0440\u0435\u043A\u0442\u0438\u0432\u0435 \u043E \u043C\u0430\u0448\u0438\u043D\u043D\u043E\u043C \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0438 2006/42/EC.</p>\n  ',
    "solid-liquid-separation": '<nav class="crumbs" aria-label="Breadcrumb"><a href="/ru/">\u0413\u043B\u0430\u0432\u043D\u0430\u044F</a><span>/</span><a href="/ru/products">\u041F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F</a><span>/</span><b>\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u0435\u043F\u0430\u0440\u0430\u0446\u0438\u0438 \u0442\u0432\u0451\u0440\u0434\u043E\u0439 \u0438 \u0436\u0438\u0434\u043A\u043E\u0439 \u0444\u0430\u0437</b></nav>\n  <div class="page-hero">\n    <div class="eyebrow">\u041F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F</div>\n    <h1>\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u0435\u043F\u0430\u0440\u0430\u0446\u0438\u0438 \u0442\u0432\u0451\u0440\u0434\u043E\u0439 \u0438 \u0436\u0438\u0434\u043A\u043E\u0439 \u0444\u0430\u0437</h1>\n    <p class="lede">\u041C\u0430\u0448\u0438\u043D\u044B \u0434\u043B\u044F \u0433\u043E\u0440\u043E\u0434\u0441\u043A\u043E\u0433\u043E \u0438 \u043F\u0440\u043E\u043C\u044B\u0448\u043B\u0435\u043D\u043D\u043E\u0433\u043E \u043E\u0441\u0430\u0434\u043A\u0430, \u0445\u0432\u043E\u0441\u0442\u043E\u0432 \u043E\u0431\u043E\u0433\u0430\u0449\u0435\u043D\u0438\u044F \u0438 \u043D\u0430\u0432\u043E\u0437\u0430. \u0421\u043E\u043E\u0431\u0449\u0438\u0442\u0435 \u043D\u0430\u043C \u0442\u0438\u043F \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0430, \u0440\u0430\u0441\u0445\u043E\u0434, \u043A\u043E\u043D\u0446\u0435\u043D\u0442\u0440\u0430\u0446\u0438\u044E \u043D\u0430 \u0432\u0445\u043E\u0434\u0435 \u0438 pH \u2014 \u043F\u043E \u044D\u0442\u0438\u043C \u0434\u0430\u043D\u043D\u044B\u043C \u043C\u044B \u043F\u043E\u0434\u0431\u0435\u0440\u0451\u043C \u043C\u0430\u0448\u0438\u043D\u0443 \u0438 \u0440\u0435\u0430\u0433\u0435\u043D\u0442\u044B \u0434\u043B\u044F \u043A\u043E\u043D\u0434\u0438\u0446\u0438\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F.</p>\n  ',
    "waste-incineration": '<nav class="crumbs" aria-label="Breadcrumb"><a href="/ru/">\u0413\u043B\u0430\u0432\u043D\u0430\u044F</a><span>/</span><a href="/ru/products">\u041F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F</a><span>/</span><b>\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u0436\u0438\u0433\u0430\u043D\u0438\u044F \u043E\u0442\u0445\u043E\u0434\u043E\u0432</b></nav>\n  <div class="page-hero">\n    <div class="eyebrow">\u041F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F</div>\n    <h1>\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u0436\u0438\u0433\u0430\u043D\u0438\u044F \u043E\u0442\u0445\u043E\u0434\u043E\u0432</h1>\n    <p class="lede">\u0418\u043D\u0441\u0438\u043D\u0435\u0440\u0430\u0442\u043E\u0440\u044B \u0441\u0435\u0440\u0438\u0438 CXWSL \u0434\u043B\u044F \u043C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u0438\u0445 \u043E\u0442\u0445\u043E\u0434\u043E\u0432, \u043F\u0440\u043E\u043C\u044B\u0448\u043B\u0435\u043D\u043D\u044B\u0445 \u043E\u043F\u0430\u0441\u043D\u044B\u0445 \u043E\u0442\u0445\u043E\u0434\u043E\u0432 \u0438 \u0422\u0411\u041E, \u043F\u043E\u0434\u0431\u0438\u0440\u0430\u0435\u043C\u044B\u0435 \u043F\u043E \u0442\u0438\u043F\u0443 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0430, \u0447\u0430\u0441\u043E\u0432\u043E\u0439 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u0438, \u0442\u043E\u043F\u043B\u0438\u0432\u0443 \u0438 \u043C\u0435\u0441\u0442\u043D\u044B\u043C \u043D\u043E\u0440\u043C\u0430\u043C \u0432\u044B\u0431\u0440\u043E\u0441\u043E\u0432. \u0421\u043F\u0440\u043E\u0435\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u044B \u0438 \u0438\u0437\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u044B \u0432 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0438 \u0441 \u0414\u0438\u0440\u0435\u043A\u0442\u0438\u0432\u043E\u0439 \u043E \u043C\u0430\u0448\u0438\u043D\u043D\u043E\u043C \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0438 2006/42/EC \u0438 EN 746-1; \u0438\u043C\u0435\u0435\u0442\u0441\u044F \u0441\u0442\u043E\u0440\u043E\u043D\u043D\u0435\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044F, \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0434\u043E \u043E\u043A\u0442\u044F\u0431\u0440\u044F 2031 \u0433. \u0421\u043E\u043E\u0431\u0449\u0438\u0442\u0435 \u0432\u0430\u0448 \u043B\u0438\u043C\u0438\u0442 \u0432\u044B\u0431\u0440\u043E\u0441\u043E\u0432 \u2014 \u043C\u044B \u0441\u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0438\u0440\u0443\u0435\u043C \u043A\u0430\u043C\u0435\u0440\u0443 \u0441\u0433\u043E\u0440\u0430\u043D\u0438\u044F, \u0433\u043E\u0440\u0435\u043B\u043A\u0443 \u0438 \u0441\u043A\u0440\u0443\u0431\u0431\u0435\u0440 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u043C \u043E\u0431\u0440\u0430\u0437\u043E\u043C.</p>\n  '
  },
  "es": {
    "wastewater-treatment": '<nav class="crumbs" aria-label="Breadcrumb"><a href="/es/">Inicio</a><span>/</span><a href="/es/products">Productos</a><span>/</span><b>Equipos de tratamiento de aguas residuales</b></nav>\n  <div class="page-hero">\n    <div class="eyebrow">Productos</div>\n    <h1>Equipos de tratamiento de aguas residuales</h1>\n    <p class="lede">Pretratamiento, flotaci\xF3n, sedimentaci\xF3n y plantas compactas para aguas residuales municipales e industriales. Los modelos est\xE1ndar llevan marcado CE seg\xFAn la Directiva de M\xE1quinas 2006/42/EC.</p>\n  ',
    "solid-liquid-separation": '<nav class="crumbs" aria-label="Breadcrumb"><a href="/es/">Inicio</a><span>/</span><a href="/es/products">Productos</a><span>/</span><b>Equipos de separaci\xF3n s\xF3lido-l\xEDquido</b></nav>\n  <div class="page-hero">\n    <div class="eyebrow">Productos</div>\n    <h1>Equipos de separaci\xF3n s\xF3lido-l\xEDquido</h1>\n    <p class="lede">M\xE1quinas para lodos municipales, lodos industriales, relaves mineros y esti\xE9rcol ganadero. Ind\xEDquenos el tipo de material, el caudal, la concentraci\xF3n de entrada y el pH \u2014 con esos datos seleccionamos la m\xE1quina y los productos qu\xEDmicos de acondicionamiento.</p>\n  ',
    "waste-incineration": '<nav class="crumbs" aria-label="Breadcrumb"><a href="/es/">Inicio</a><span>/</span><a href="/es/products">Productos</a><span>/</span><b>Equipos de incineraci\xF3n de residuos</b></nav>\n  <div class="page-hero">\n    <div class="eyebrow">Productos</div>\n    <h1>Equipos de incineraci\xF3n de residuos</h1>\n    <p class="lede">Incineradores serie CXWSL para residuos m\xE9dicos, residuos industriales peligrosos y residuos s\xF3lidos urbanos, dimensionados seg\xFAn el tipo de material, la capacidad horaria, el combustible y la norma local de emisiones. Dise\xF1ados y fabricados conforme a la Directiva de M\xE1quinas 2006/42/EC y EN 746-1; verificaci\xF3n de conformidad por terceros vigente hasta octubre de 2031. Ind\xEDquenos su l\xEDmite de emisiones \u2014 configuramos la c\xE1mara de combusti\xF3n, el quemador y el depurador en consecuencia.</p>\n  '
  }
};
var CAT_INFO_T = {
  "ru": {
    "ww": { "name": "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u043E\u0447\u0438\u0441\u0442\u043A\u0438 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434", "blurb": "\u0424\u043B\u043E\u0442\u0430\u0442\u043E\u0440\u044B DAF, \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0441\u043D\u044B\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u043E\u0447\u0438\u0441\u0442\u043A\u0438 (CXWSZ/CXMBR), \u0441\u0442\u0430\u043D\u0446\u0438\u0438 \u0434\u043E\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F, \u043B\u0430\u043C\u0435\u043B\u043B\u044F\u0440\u043D\u044B\u0435 \u043E\u0442\u0441\u0442\u043E\u0439\u043D\u0438\u043A\u0438, \u0440\u0435\u0448\u0451\u0442\u043A\u0438 \u0438 \u0441\u043A\u0440\u0435\u0431\u043A\u0438." },
    "sl": { "name": "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u0435\u043F\u0430\u0440\u0430\u0446\u0438\u0438 \u0442\u0432\u0451\u0440\u0434\u043E\u0439 \u0438 \u0436\u0438\u0434\u043A\u043E\u0439 \u0444\u0430\u0437", "blurb": "\u041B\u0435\u043D\u0442\u043E\u0447\u043D\u044B\u0435 \u0444\u0438\u043B\u044C\u0442\u0440-\u043F\u0440\u0435\u0441\u0441\u044B, \u0448\u043D\u0435\u043A\u043E\u0432\u044B\u0435 \u043F\u0440\u0435\u0441\u0441\u044B, \u043A\u0430\u043C\u0435\u0440\u043D\u044B\u0435 \u0444\u0438\u043B\u044C\u0442\u0440-\u043F\u0440\u0435\u0441\u0441\u044B, \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u043E\u0431\u0435\u0437\u0432\u043E\u0436\u0438\u0432\u0430\u043D\u0438\u044F \u043D\u0430\u0432\u043E\u0437\u0430, \u0432\u0430\u043A\u0443\u0443\u043C-\u0444\u0438\u043B\u044C\u0442\u0440\u044B." },
    "wi": { "name": "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u0436\u0438\u0433\u0430\u043D\u0438\u044F \u043E\u0442\u0445\u043E\u0434\u043E\u0432", "sub": "\u0421\u0435\u0440\u0438\u044F CXWSL", "blurb": "\u0418\u043D\u0441\u0438\u043D\u0435\u0440\u0430\u0442\u043E\u0440\u044B \u0441\u0435\u0440\u0438\u0438 CXWSL, \u0438\u0437\u0433\u043E\u0442\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u043C\u044B\u0435 \u043F\u043E\u0434 \u043C\u0435\u0441\u0442\u043D\u044B\u0435 \u043D\u043E\u0440\u043C\u044B \u0432\u044B\u0431\u0440\u043E\u0441\u043E\u0432." }
  },
  "es": {
    "ww": { "name": "Equipos de tratamiento de aguas residuales", "blurb": "Unidades DAF, plantas integradas de tratamiento (CXWSZ/CXMBR), unidades de dosificaci\xF3n, tanques lamelares, rejillas y rascadores." },
    "sl": { "name": "Equipos de separaci\xF3n s\xF3lido-l\xEDquido", "blurb": "Filtros prensa de banda, prensas de tornillo, filtros prensa de c\xE1mara, m\xE1quinas de deshidrataci\xF3n de esti\xE9rcol, filtros de vac\xEDo." },
    "wi": { "name": "Equipos de incineraci\xF3n de residuos", "sub": "Serie CXWSL", "blurb": "Incineradores serie CXWSL fabricados conforme a las normas locales de emisiones." }
  }
};
var STRINGS = {
  "ru": {
    "home": "\u0413\u043B\u0430\u0432\u043D\u0430\u044F",
    "products": "\u041F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F",
    "blog": "\u0411\u043B\u043E\u0433",
    "learn_more": "\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435",
    "view": "\u0421\u043C\u043E\u0442\u0440\u0435\u0442\u044C",
    "read_more": "\u0427\u0438\u0442\u0430\u0442\u044C \u0434\u0430\u043B\u0435\u0435",
    "read": "\u0427\u0438\u0442\u0430\u0442\u044C",
    "get_proposal": "\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435",
    "more_in": "\u0415\u0449\u0451 \u0432 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438",
    "more_articles": "\u0414\u0440\u0443\u0433\u0438\u0435 \u0441\u0442\u0430\u0442\u044C\u0438",
    "spec_default": "\u041F\u0440\u0438\u043C\u0435\u0440\u044B \u043C\u043E\u0434\u0435\u043B\u0435\u0439",
    "no_products": "\u0412 \u044D\u0442\u043E\u0439 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u043F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u0438.",
    "view_all": "\u0412\u0441\u0435 \u0441\u0442\u0430\u0442\u044C\u0438",
    "company_suffix": "| Innovation Huayi Environmental Engineering"
  },
  "es": {
    "home": "Inicio",
    "products": "Productos",
    "blog": "Blog",
    "learn_more": "M\xE1s informaci\xF3n",
    "view": "Ver",
    "read_more": "Leer m\xE1s",
    "read": "Leer",
    "get_proposal": "Solicitar una propuesta",
    "more_in": "M\xE1s en",
    "more_articles": "M\xE1s art\xEDculos",
    "spec_default": "Ejemplos de modelos",
    "no_products": "No hay productos en esta categor\xEDa por el momento.",
    "view_all": "Ver todos los art\xEDculos",
    "company_suffix": "| Innovation Huayi Environmental Engineering"
  }
};
var META_T = {
  "ru": {
    "home": { "title": "Innovation Huayi \u2014 \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u043E\u0447\u0438\u0441\u0442\u043A\u0438 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434 \u0438 \u0441\u0435\u043F\u0430\u0440\u0430\u0446\u0438\u0438 | \u0417\u0430\u0432\u043E\u0434 \u0432 \u041A\u0438\u0442\u0430\u0435", "desc": "\u041F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044C \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u0434\u043B\u044F \u043E\u0447\u0438\u0441\u0442\u043A\u0438 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434 \u0438 \u0441\u0435\u043F\u0430\u0440\u0430\u0446\u0438\u0438 \u0442\u0432\u0451\u0440\u0434\u043E\u0439 \u0438 \u0436\u0438\u0434\u043A\u043E\u0439 \u0444\u0430\u0437. 17+ \u043B\u0435\u0442, \u0446\u0435\u0445 39 656 \u043C\xB2, \u044D\u043A\u0441\u043F\u043E\u0440\u0442 \u0432 50+ \u0441\u0442\u0440\u0430\u043D." },
    "products": { "title": "\u041F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u044F | Innovation Huayi", "desc": "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u043E\u0447\u0438\u0441\u0442\u043A\u0438 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434, \u043E\u0431\u0435\u0437\u0432\u043E\u0436\u0438\u0432\u0430\u043D\u0438\u044F \u043E\u0441\u0430\u0434\u043A\u0430 \u0438 \u0441\u0436\u0438\u0433\u0430\u043D\u0438\u044F \u043E\u0442\u0445\u043E\u0434\u043E\u0432 \u2014 \u043F\u0440\u043E\u0435\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0438 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0441\u0442\u0432\u043E \u0432 \u0427\u0436\u0443\u0447\u044D\u043D\u0435, \u0428\u0430\u043D\u044C\u0434\u0443\u043D." },
    "wastewater-treatment": { "title": "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u043E\u0447\u0438\u0441\u0442\u043A\u0438 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434 | Innovation Huayi", "desc": "\u041F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u043E\u0447\u0438\u0441\u0442\u043A\u0430, \u0444\u043B\u043E\u0442\u0430\u0446\u0438\u044F, \u0441\u0435\u0434\u0438\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F \u0438 \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0441\u043D\u044B\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u0434\u043B\u044F \u0433\u043E\u0440\u043E\u0434\u0441\u043A\u0438\u0445 \u0438 \u043F\u0440\u043E\u043C\u044B\u0448\u043B\u0435\u043D\u043D\u044B\u0445 \u0441\u0442\u043E\u0447\u043D\u044B\u0445 \u0432\u043E\u0434. \u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438\u043C\u0435\u044E\u0442 \u043C\u0430\u0440\u043A\u0438\u0440\u043E\u0432\u043A\u0443 CE \u043F\u043E \u0414\u0438\u0440\u0435\u043A\u0442\u0438\u0432\u0435 \u043E \u043C\u0430\u0448\u0438\u043D\u043D\u043E\u043C \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0438 2006/42/EC." },
    "solid-liquid-separation": { "title": "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u0435\u043F\u0430\u0440\u0430\u0446\u0438\u0438 \u0442\u0432\u0451\u0440\u0434\u043E\u0439 \u0438 \u0436\u0438\u0434\u043A\u043E\u0439 \u0444\u0430\u0437 | Innovation Huayi", "desc": "\u041C\u0430\u0448\u0438\u043D\u044B \u0434\u043B\u044F \u0433\u043E\u0440\u043E\u0434\u0441\u043A\u043E\u0433\u043E \u0438 \u043F\u0440\u043E\u043C\u044B\u0448\u043B\u0435\u043D\u043D\u043E\u0433\u043E \u043E\u0441\u0430\u0434\u043A\u0430, \u0445\u0432\u043E\u0441\u0442\u043E\u0432 \u043E\u0431\u043E\u0433\u0430\u0449\u0435\u043D\u0438\u044F \u0438 \u043D\u0430\u0432\u043E\u0437\u0430. \u0421\u043E\u043E\u0431\u0449\u0438\u0442\u0435 \u043D\u0430\u043C \u0442\u0438\u043F \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0430, \u0440\u0430\u0441\u0445\u043E\u0434, \u043A\u043E\u043D\u0446\u0435\u043D\u0442\u0440\u0430\u0446\u0438\u044E \u043D\u0430 \u0432\u0445\u043E\u0434\u0435 \u0438 pH \u2014 \u043F\u043E \u044D\u0442\u0438\u043C \u0434\u0430\u043D\u043D\u044B\u043C \u043C\u044B \u043F\u043E\u0434\u0431\u0435\u0440\u0451\u043C \u043C\u0430\u0448\u0438\u043D\u0443 \u0438 \u0440\u0435\u0430\u0433\u0435\u043D\u0442\u044B \u0434\u043B\u044F \u043A\u043E\u043D\u0434\u0438\u0446\u0438\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F." },
    "waste-incineration": { "title": "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u0436\u0438\u0433\u0430\u043D\u0438\u044F \u043E\u0442\u0445\u043E\u0434\u043E\u0432 | Innovation Huayi", "desc": "\u0418\u043D\u0441\u0438\u043D\u0435\u0440\u0430\u0442\u043E\u0440\u044B \u0441\u0435\u0440\u0438\u0438 CXWSL \u0434\u043B\u044F \u043C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u0438\u0445 \u043E\u0442\u0445\u043E\u0434\u043E\u0432, \u043F\u0440\u043E\u043C\u044B\u0448\u043B\u0435\u043D\u043D\u044B\u0445 \u043E\u043F\u0430\u0441\u043D\u044B\u0445 \u043E\u0442\u0445\u043E\u0434\u043E\u0432 \u0438 \u0422\u0411\u041E, \u043F\u043E\u0434\u0431\u0438\u0440\u0430\u0435\u043C\u044B\u0435 \u043F\u043E \u0442\u0438\u043F\u0443 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0430, \u0447\u0430\u0441\u043E\u0432\u043E\u0439 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u0438, \u0442\u043E\u043F\u043B\u0438\u0432\u0443 \u0438 \u043C\u0435\u0441\u0442\u043D\u044B\u043C \u043D\u043E\u0440\u043C\u0430\u043C \u0432\u044B\u0431\u0440\u043E\u0441\u043E\u0432. \u0421\u043F\u0440\u043E\u0435\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u044B \u0438 \u0438\u0437\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u044B \u0432 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0438 \u0441 \u0414\u0438\u0440\u0435\u043A\u0442\u0438\u0432\u043E\u0439 \u043E \u043C\u0430\u0448\u0438\u043D\u043D\u043E\u043C \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0438 2006/42/EC \u0438 EN 746-1; \u0438\u043C\u0435\u0435\u0442\u0441\u044F \u0441\u0442\u043E\u0440\u043E\u043D\u043D\u0435\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044F, \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0434\u043E \u043E\u043A\u0442\u044F\u0431\u0440\u044F 2031 \u0433. \u0421\u043E\u043E\u0431\u0449\u0438\u0442\u0435 \u0432\u0430\u0448 \u043B\u0438\u043C\u0438\u0442 \u0432\u044B\u0431\u0440\u043E\u0441\u043E\u0432 \u2014 \u043C\u044B \u0441\u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0438\u0440\u0443\u0435\u043C \u043A\u0430\u043C\u0435\u0440\u0443 \u0441\u0433\u043E\u0440\u0430\u043D\u0438\u044F, \u0433\u043E\u0440\u0435\u043B\u043A\u0443 \u0438 \u0441\u043A\u0440\u0443\u0431\u0431\u0435\u0440 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u043C \u043E\u0431\u0440\u0430\u0437\u043E\u043C." }
  },
  "es": {
    "home": { "title": "Innovation Huayi \u2014 equipos de tratamiento de aguas residuales y separaci\xF3n | F\xE1brica en China", "desc": "Fabricante de equipos de tratamiento de aguas residuales y separaci\xF3n s\xF3lido-l\xEDquido. M\xE1s de 17 a\xF1os, planta de 39 656 m\xB2, exportaci\xF3n a m\xE1s de 50 pa\xEDses." },
    "products": { "title": "Productos | Innovation Huayi", "desc": "Equipos de tratamiento de aguas residuales, deshidrataci\xF3n de lodos e incineraci\xF3n de residuos, dise\xF1ados y fabricados en Zhucheng, Shandong." },
    "wastewater-treatment": { "title": "Equipos de tratamiento de aguas residuales | Innovation Huayi", "desc": "Pretratamiento, flotaci\xF3n, sedimentaci\xF3n y plantas compactas para aguas residuales municipales e industriales. Los modelos est\xE1ndar llevan marcado CE seg\xFAn la Directiva de M\xE1quinas 2006/42/EC." },
    "solid-liquid-separation": { "title": "Equipos de separaci\xF3n s\xF3lido-l\xEDquido | Innovation Huayi", "desc": "M\xE1quinas para lodos municipales, lodos industriales, relaves mineros y esti\xE9rcol ganadero. Ind\xEDquenos el tipo de material, el caudal, la concentraci\xF3n de entrada y el pH \u2014 con esos datos seleccionamos la m\xE1quina y los productos qu\xEDmicos de acondicionamiento." },
    "waste-incineration": { "title": "Equipos de incineraci\xF3n de residuos | Innovation Huayi", "desc": "Incineradores serie CXWSL para residuos m\xE9dicos, residuos industriales peligrosos y residuos s\xF3lidos urbanos, dimensionados seg\xFAn el tipo de material, la capacidad horaria, el combustible y la norma local de emisiones. Dise\xF1ados y fabricados conforme a la Directiva de M\xE1quinas 2006/42/EC y EN 746-1; verificaci\xF3n de conformidad por terceros vigente hasta octubre de 2031. Ind\xEDquenos su l\xEDmite de emisiones \u2014 configuramos la c\xE1mara de combusti\xF3n, el quemador y el depurador en consecuencia." }
  }
};
var I18N_MSG = {
  "ru": {
    "sending": "\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430\u2026",
    "sent_h3": "\u0417\u0430\u043F\u0440\u043E\u0441 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u2014 \u0441\u043F\u0430\u0441\u0438\u0431\u043E",
    "sent_p": "\u0412\u0430\u0448 \u0437\u0430\u043F\u0440\u043E\u0441 \u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D \u043D\u0430\u0448\u0435\u0439 \u043A\u043E\u043C\u0430\u043D\u0434\u0435 \u043D\u0430 <strong>steffy@huayienviron.com</strong>. \u041C\u044B \u043E\u0442\u0432\u0435\u0447\u0430\u0435\u043C \u0432 \u0442\u0435\u0447\u0435\u043D\u0438\u0435 24 \u0447\u0430\u0441\u043E\u0432. \u0412\u044B \u0442\u0430\u043A\u0436\u0435 \u043C\u043E\u0436\u0435\u0442\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043A\u043E\u043F\u0438\u044E \u043A\u043D\u043E\u043F\u043A\u0430\u043C\u0438 \u043D\u0438\u0436\u0435.",
    "sent_small": "\u0412\u0432\u0435\u0434\u0451\u043D\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0443\u0436\u0435 \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u044B \u0432 \u043F\u0438\u0441\u044C\u043C\u043E / \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 WhatsApp."
  },
  "es": {
    "sending": "Enviando\u2026",
    "sent_h3": "Consulta enviada \u2014 gracias",
    "sent_p": "Su consulta ha llegado a nuestro equipo en <strong>steffy@huayienviron.com</strong>. Respondemos en 24 horas. Tambi\xE9n puede enviar una copia con los botones de abajo.",
    "sent_small": "Lo que escribi\xF3 ya est\xE1 preparado en los botones de correo / WhatsApp."
  }
};

// cms-src/worker/templates.js
init_util();
var SITE = "https://www.huayienviron.com";
var LANGS = ["en", "ru", "es"];
function prefix(lang, p) {
  if (lang === "en") return p;
  return "/" + lang + (p === "/" ? "/" : p);
}
function enPathOf(lang, path) {
  if (lang === "en") return path;
  const s = path.slice(3);
  return s === "" || s === "/" ? "/" : s;
}
function switcher(lang, enPath, translated = true) {
  const st = "font:600 12px 'IBM Plex Mono',monospace;letter-spacing:.08em;white-space:nowrap";
  const sep = '<span style="color:#555;margin:0 7px">\xB7</span>';
  const tgt = (l) => {
    if (l === "en") return enPath;
    if (!translated) return `/${l}/`;
    return `/${l}` + (enPath === "/" ? "/" : enPath);
  };
  const parts = [["en", "EN"], ["ru", "\u0420\u0423"], ["es", "ES"]].map(([code, label]) => code === lang ? `<b style="color:#fff;font-weight:700">${label}</b>` : `<a href="${tgt(code)}" hreflang="${code}" lang="${code}" style="color:#9a9a9a;text-decoration:none">${label}</a>`);
  return `<span class="lang-switch" style="${st}">${parts.join(sep)}</span>`;
}
function headerFor(lang, enPath, translated) {
  if (lang === "en") {
    return HEADER.replace('  <a class="head-cta"', `  ${switcher("en", enPath, translated)}
  <a class="head-cta"`);
  }
  return HEADER_I18N[lang].replace("__SWITCH__", switcher(lang, enPath, translated));
}
function footerFor(lang) {
  return lang === "en" ? FOOTER : FOOTER_I18N[lang];
}
function layout({ title, desc, path, body, initJs = "", lang = "en", alternates = true }) {
  const enPath = enPathOf(lang, path);
  const alt = alternates ? LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${prefix(l, enPath)}">`).join("\n") + `
<link rel="alternate" hreflang="x-default" href="${SITE}${enPath}">` : "";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${path}">
${alt}
${FONTS}
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
${headerFor(lang, enPath, alternates)}
${body}
${footerFor(lang)}
<script src="/assets/site.js"><\/script>
${initJs ? `<script>${initJs}<\/script>` : ""}
</body>
</html>`;
}
function imgSrc(image) {
  if (!image) return "";
  return image.startsWith("r2:") ? "/media/" + image.slice(3) : "/" + image;
}
var S = (lang) => STRINGS[lang] || null;
function catName(lang, cat) {
  return lang === "en" ? CAT_INFO[cat].name : CAT_INFO_T[lang][cat].name;
}
function productCard(p, lang) {
  const learn = lang === "en" ? "Learn more" : S(lang).learn_more;
  return `<a class="c-card" href="${prefix(lang, "/product-" + esc(p.slug))}"><div class="c-img"><img src="${esc(imgSrc(p.image))}" alt="${esc(p.image_alt || p.name)}" loading="lazy"></div><div class="c-body"><h3>${esc(p.name)}</h3><p>${esc(p.short_desc)}</p><span class="go">${learn}</span></div></a>`;
}
var CAT_INFO = {
  ww: {
    slug: "wastewater-treatment",
    name: "Wastewater Treatment Equipment",
    img: "assets/prod-cxpf.jpg",
    blurb: "DAF units, integrated sewage plants (CXWSZ/CXMBR), dosing units, lamella tanks, screens and scrapers."
  },
  sl: {
    slug: "solid-liquid-separation",
    name: "Solid-Liquid Separation Equipment",
    img: "assets/prod-cxdl.jpg",
    blurb: "Belt filter presses, screw presses, chamber presses, manure dewatering machines, vacuum filters."
  },
  wi: {
    slug: "waste-incineration",
    name: "Waste Incineration Equipment",
    img: "assets/prod-cxwsl.jpg",
    sub: "CXWSL series",
    blurb: "CXWSL series incinerators built to local emission rules."
  }
};
function homePage(posts, lang = "en") {
  const readMore = lang === "en" ? "Read more" : S(lang).read_more;
  const teasers = posts.map((p) => `<article class="post"><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p><a class="text-link" href="/blog-${esc(p.slug)}">${readMore}</a></article>`).join("");
  let body, title, desc, initJs;
  if (lang === "en") {
    body = INDEX_PART1 + INDEX_PRODUCTS + INDEX_PART2A + teasers + INDEX_PART2B;
    title = "Innovation Huayi Environmental Engineering | Wastewater Treatment & Solid-Liquid Separation Equipment";
    desc = "Wastewater treatment and solid-liquid separation equipment manufacturer. 17+ years, 39,656 m\xB2 workshop, exported to 50+ countries.";
    initJs = "wireDemoForm('inqForm','inqNote','Website inquiry (homepage)');";
  } else {
    body = HOME_P1[lang] + HOME_PRODUCTS[lang] + HOME_P2A[lang] + teasers + HOME_P2B[lang];
    title = META_T[lang].home.title;
    desc = META_T[lang].home.desc;
    initJs = `window.I18N_MSG=${JSON.stringify(I18N_MSG[lang])};wireDemoForm('inqForm','inqNote','Website inquiry (homepage, ${lang})');`;
  }
  return layout({ title, desc, path: prefix(lang, "/"), body, initJs, lang });
}
function productsPage(counts, lang = "en") {
  let cards, body, title, desc;
  if (lang === "en") {
    cards = Object.values(CAT_INFO).map((c) => `<a class="c-card" href="/products-${c.slug}">
      <div class="c-img"><img src="/${c.img}" alt="${esc(c.name)}" loading="lazy"></div>
      <div class="c-body"><div class="c-sub">${c.sub || `${counts[c.slug] || 0} product line${(counts[c.slug] || 0) === 1 ? "" : "s"}`}</div><h3>${esc(c.name)}</h3>
      <p>${esc(c.blurb)}</p><span class="go">Browse</span></div></a>`).join("\n    ");
    body = PRODUCTS_PRE + `<div class="card-grid">
    ${cards}
  </div>
  ` + PRODUCTS_POST;
    title = "Products | Innovation Huayi Environmental Engineering";
    desc = "Wastewater treatment, sludge dewatering and waste incineration equipment designed and manufactured in Zhucheng, Shandong.";
  } else {
    const t = STRINGS[lang];
    cards = ["ww", "sl", "wi"].map((cat) => {
      const ci = CAT_INFO_T[lang][cat];
      const slug = CAT_INFO[cat].slug;
      const n = counts[slug] || 0;
      let sub = ci.sub;
      if (!sub) {
        sub = lang === "es" ? `${n} ${n === 1 ? "l\xEDnea de productos" : "l\xEDneas de productos"}` : `${n} ${pluralRu(n)}`;
      }
      return `<a class="c-card" href="${prefix(lang, "/products-" + slug)}">
      <div class="c-img"><img src="/${CAT_INFO[cat].img}" alt="${esc(ci.name)}" loading="lazy"></div>
      <div class="c-body"><div class="c-sub">${esc(sub)}</div><h3>${esc(ci.name)}</h3>
      <p>${esc(ci.blurb)}</p><span class="go">${t.view}</span></div></a>`;
    }).join("\n    ");
    body = PRODUCTS_PRE_T[lang] + `<div class="card-grid">
    ${cards}
  </div>
  ` + PRODUCTS_POST_T[lang];
    title = META_T[lang].products.title;
    desc = META_T[lang].products.desc;
  }
  return layout({ title, desc, path: prefix(lang, "/products"), body, lang });
}
function pluralRu(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "\u043B\u0438\u043D\u0438\u044F \u043F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u0438";
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return "\u043B\u0438\u043D\u0438\u0438 \u043F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u0438";
  return "\u043B\u0438\u043D\u0438\u0439 \u043F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u0438";
}
function categoryPage(catSlug, products, lang = "en") {
  const info = Object.values(CAT_INFO).find((c) => c.slug === catSlug);
  const hero = lang === "en" ? CATS[catSlug] : CATS_T[lang][catSlug];
  const empty = lang === "en" ? '<p style="color:#666">No products listed in this category at the moment.</p>' : `<p style="color:#666">${esc(S(lang).no_products)}</p>`;
  const grid = products.length ? products.map((p) => productCard(p, lang)).join("") : empty;
  const body = `<main>

<div class="wrap">
  ${hero}</div>
  <div class="card-grid" style="margin-bottom:56px">${grid}</div>

</div>
${lang === "en" ? CTA : CTA_I18N[lang]}
</main>`;
  const title = lang === "en" ? `${info.name} | Innovation Huayi Environmental Engineering` : META_T[lang][catSlug].title;
  const desc = lang === "en" ? info.blurb : META_T[lang][catSlug].desc;
  return layout({ title, desc, path: prefix(lang, `/products-${catSlug}`), body, lang });
}
function productPage(p, related, lang = "en") {
  const catSlug = CATS_SLUG(p.category);
  const badges = JSON.parse(p.badges_json || "[]");
  const specs = JSON.parse(p.specs_json || "[]");
  const specRows = specs.map(([m, d]) => `<tr><th>${esc(m)}</th><td>${esc(d)}</td></tr>`).join("");
  const t = lang === "en" ? null : S(lang);
  const cName = catName(lang, p.category);
  const sHome = t ? t.home : "Home";
  const sProducts = t ? t.products : "Products";
  const sProposal = t ? t.get_proposal : "Get a proposal";
  const sSpec = p.spec_title || (t ? t.spec_default : "Model examples");
  const moreIn = t ? `${t.more_in} ${cName}` : `More in ${cName}`;
  const sView = t ? t.view : "View";
  const body = `<main>

<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${prefix(lang, "/")}">${sHome}</a><span>/</span><a href="${prefix(lang, "/products")}">${sProducts}</a><span>/</span><a href="${prefix(lang, "/products-" + catSlug)}">${esc(cName)}</a><span>/</span><b>${esc(p.name)}</b></nav>
  <div class="page-hero">
    <div class="eyebrow">${esc(cName)}</div>
    <h1>${esc(p.name)}</h1>
    <p class="lede">${esc(p.short_desc)}</p>
  </div>
  <div class="split" style="margin-bottom:56px">
    <div class="media">${p.image ? `<img class="ph-card" style="aspect-ratio:4/3" src="${esc(imgSrc(p.image))}" alt="${esc(p.image_alt || p.name)}" loading="lazy">` : ""}</div>
    <div>
      ${badges.length ? `<div style="margin-bottom:14px">${badges.map((b) => `<span class="badge${/ce/i.test(b) ? " ce" : ""}">${esc(b)}</span>`).join("")}</div>` : ""}
      ${p.ce_note ? `<p style="font-size:13px;color:#666">${esc(p.ce_note)}</p>` : ""}
      <div class="prose">${p.body_html}</div>
      ${specRows ? `<h2>${esc(sSpec)}</h2><table class="spec">${specRows}</table>` : ""}
      ${p.spec_note ? `<p style="font-size:13px;color:#666">${esc(p.spec_note)}</p>` : ""}
      <a class="btn" href="${prefix(lang, "/get-a-solution")}">${sProposal}</a>
    </div>
  </div>
</div>
${lang === "en" ? CTA : CTA_I18N[lang]}
${related.length ? `<div class="wrap sect">
  <h2 class="sect-head2"><span class="n">\u2192</span>${esc(moreIn)}</h2>
  <div class="card-grid">${related.map((r) => `<a class="c-card" href="${prefix(lang, "/product-" + esc(r.slug))}"><div class="c-body"><h3>${esc(r.name)}</h3><p>${esc(r.short_desc)}</p><span class="go">${sView}</span></div></a>`).join("")}</div>
</div>` : ""}
</main>`;
  return layout({
    title: `${p.name} ${t ? "| Innovation Huayi" : "| Innovation Huayi Environmental Engineering"}`,
    desc: p.short_desc,
    path: prefix(lang, `/product-${p.slug}`),
    body,
    lang
  });
}
function CATS_SLUG(c) {
  return CAT_INFO[c] ? CAT_INFO[c].slug : "wastewater-treatment";
}
function blogListPage(posts) {
  const list = posts.length ? posts.map((p) => `<article class="post">
  <h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p>
  <a class="text-link" href="/blog-${esc(p.slug)}">Read more</a>
</article>`).join("") : '<p style="color:#666">No articles published yet.</p>';
  const body = BLOG_PRE + `<div class="posts post-list" style="grid-template-columns:1fr;max-width:820px;margin-bottom:60px">${list}</div>` + BLOG_POST;
  return layout({
    title: "Blog | Innovation Huayi Environmental Engineering",
    desc: "Equipment guides and selection notes for wastewater treatment and sludge dewatering.",
    path: "/blog",
    body,
    alternates: false
  });
}
function blogPostPage(p, morePosts = []) {
  const more = morePosts.length ? `<div class="wrap sect">
  <h2 class="sect-head2"><span class="n">\u2192</span>More articles</h2>
  <div class="card-grid cols2">${morePosts.map((m) => `<a class="c-card" href="/blog-${esc(m.slug)}"><div class="c-body"><h3>${esc(m.title)}</h3><span class="go">Read</span></div></a>`).join("")}</div>
</div>` : "";
  const body = `<main>

<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/blog">Blog</a><span>/</span><b>${esc(p.title)}</b></nav>
  <div class="page-hero" style="border-bottom:0;margin-bottom:0;padding-bottom:0">
    <div class="eyebrow">Blog</div>
    <h1>${esc(p.title)}</h1>
  </div>
  ${p.cover_image ? `<div class="post-hero"><img src="${esc(imgSrc(p.cover_image))}" alt="${esc(p.title)}"></div>` : ""}
  <div class="prose" style="margin-bottom:30px">${p.body_html}</div>
  <p style="margin-bottom:60px">${p.extra_cta_label && p.extra_cta_href ? `<a class="btn" href="${esc(p.extra_cta_href)}">${esc(p.extra_cta_label)}</a>
  ` : ""}<a class="btn ghost" style="border-color:var(--ink);color:var(--ink)" href="/get-a-solution">Get a proposal</a></p>
</div>
${CTA}
${more}
</main>`;
  return layout({
    title: `${p.title} | Innovation Huayi Environmental Engineering`,
    desc: p.excerpt,
    path: `/blog-${p.slug}`,
    body,
    alternates: false
  });
}
function sitemapXml(products, posts) {
  const i18nPages = [
    "",
    "products",
    "products-wastewater-treatment",
    "products-solid-liquid-separation",
    "products-waste-incineration",
    "get-a-solution",
    "contact-us"
  ];
  const enOnlyPages = [
    "services",
    "case-studies",
    "incineration-project-guide",
    "factory",
    "certifications",
    "oem-odm",
    "catalog",
    "shipping-payment",
    "about-us",
    "faq",
    "blog",
    "privacy-policy",
    "terms-of-use",
    "cookie-policy"
  ];
  const langs = [["en", ""], ["ru", "/ru"], ["es", "/es"]];
  const altLinks = (enP) => langs.map(([code, pre]) => `    <xhtml:link rel="alternate" hreflang="${code}" href="${SITE}${pre}${enP}"/>`).join("\n") + `
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${enP}"/>`;
  const urls = [];
  const pushI18n = (enP) => {
    for (const [, pre] of langs) {
      urls.push(`  <url>
    <loc>${SITE}${pre}${enP}</loc>
${altLinks(enP)}
  </url>`);
    }
  };
  for (const p of i18nPages) pushI18n(p ? `/${p}` : "/");
  for (const p of products) pushI18n(`/product-${esc(p.slug)}`);
  for (const p of enOnlyPages) urls.push(`  <url><loc>${SITE}/${p}</loc></url>`);
  for (const b of posts) urls.push(`  <url><loc>${SITE}/blog-${esc(b.slug)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>`;
}

// cms-src/worker/admin.js
init_util();
init_auth();
var CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font:14px/1.6 -apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif;background:#f4f4f2;color:#262626}
a{color:#c2410c;text-decoration:none}
.topbar{background:#1a1a1a;color:#fff;padding:0 22px;height:52px;display:flex;align-items:center;gap:22px;position:sticky;top:0;z-index:9}
.topbar b{font-size:15px}
.topbar a{color:#d6d6d6;font-size:13px}
.topbar a.on,.topbar a:hover{color:#fff}
.topbar .sp{flex:1}
.wrap{max-width:1080px;margin:26px auto;padding:0 18px}
.card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:20px 22px;margin-bottom:18px}
h1{font-size:20px;margin-bottom:14px}
h2{font-size:16px;margin:18px 0 10px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{border-bottom:1px solid #e5e5e5;padding:9px 10px;text-align:left;vertical-align:top}
th{color:#777;font-weight:600;white-space:nowrap}
tr:hover td{background:#fafaf8}
.btn{display:inline-block;background:#c2410c;color:#fff!important;border:0;border-radius:6px;padding:8px 16px;font-size:13.5px;cursor:pointer}
.btn.gray{background:#6b7280}
.btn.line{background:#fff;color:#c2410c!important;border:1px solid #c2410c}
.btn.sm{padding:4px 10px;font-size:12.5px}
input[type=text],input[type=password],input[type=email],input[type=number],select,textarea{width:100%;border:1px solid #ccc;border-radius:6px;padding:8px 10px;font-size:14px;font-family:inherit}
textarea{min-height:90px}
label{display:block;font-size:13px;font-weight:600;color:#444;margin:12px 0 4px}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.tag{display:inline-block;border-radius:4px;padding:1px 8px;font-size:12px;font-weight:600}
.tag.green{background:#dcfce7;color:#166534}.tag.gray{background:#e5e7eb;color:#4b5563}.tag.orange{background:#ffedd5;color:#9a3412}.tag.red{background:#fee2e2;color:#991b1b}.tag.blue{background:#dbeafe;color:#1e40af}
.muted{color:#888;font-size:12.5px}
.flash{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:6px;padding:10px 14px;margin-bottom:16px}
.flash.err{background:#fef2f2;border-color:#fecaca;color:#991b1b}
.login-box{max-width:380px;margin:9vh auto}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}
.kpi{background:#fff;border:1px solid #ddd;border-radius:8px;padding:16px}
.kpi b{display:block;font-size:26px}
.kpi span{color:#777;font-size:12.5px}
.spec-row{display:grid;grid-template-columns:1fr 2fr auto;gap:8px;margin-bottom:8px}
.ql-editor{min-height:220px;background:#fff}
.editor-wrap{border:1px solid #ccc;border-radius:6px;background:#fff}
.bar{display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
.bar .sp{flex:1}
img.thumb{width:74px;height:56px;object-fit:cover;border:1px solid #ddd;border-radius:4px}
details{margin:10px 0}
summary{cursor:pointer;font-weight:600;color:#444}
@media(max-width:760px){.kpis{grid-template-columns:repeat(2,1fr)}.field-row{grid-template-columns:1fr}.topbar{flex-wrap:wrap;height:auto;padding:10px 14px}}
`;
function adminPage(title, inner, active = "", opts = {}) {
  const nav = opts.bare ? "" : `<div class="topbar">
  <b>\u534E\u4E00\u7F51\u7AD9\u540E\u53F0</b>
  <a href="/admin" class="${active === "dash" ? "on" : ""}">\u603B\u89C8</a>
  <a href="/admin/products" class="${active === "products" ? "on" : ""}">\u4EA7\u54C1</a>
  <a href="/admin/blog" class="${active === "blog" ? "on" : ""}">\u535A\u5BA2</a>
  <a href="/admin/inquiries" class="${active === "inquiries" ? "on" : ""}">\u8BE2\u76D8</a>
  <a href="/admin/analytics" class="${active === "analytics" ? "on" : ""}">\u8BBF\u5BA2</a>
  <a href="/admin/settings" class="${active === "settings" ? "on" : ""}">\u8BBE\u7F6E</a>
  <span class="sp"></span>
  <a href="/" target="_blank">\u67E5\u770B\u7F51\u7AD9 \u2197</a>
  <a href="/admin/logout">\u9000\u51FA\u767B\u5F55</a>
</div>`;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} \xB7 \u7F51\u7AD9\u540E\u53F0</title>
<style>${CSS}</style>
${opts.quill ? '<link rel="stylesheet" href="/assets/admin/quill.snow.css">' : ""}
</head><body>${nav}<div class="wrap">${inner}</div>
${opts.quill ? '<script src="/assets/admin/quill.min.js"><\/script>' : ""}
</body></html>`;
}
var flash = (msg, err) => msg ? `<div class="flash${err ? " err" : ""}">${esc(msg)}</div>` : "";
function statusTag(s) {
  const map = {
    new: ["\u5F85\u5904\u7406", "orange"],
    following: ["\u8DDF\u8FDB\u4E2D", "blue"],
    done: ["\u5DF2\u5904\u7406", "green"],
    on: ["\u5DF2\u4E0A\u67B6", "green"],
    off: ["\u5DF2\u4E0B\u67B6", "gray"],
    draft: ["\u8349\u7A3F", "gray"],
    published: ["\u5DF2\u53D1\u5E03", "green"]
  };
  const [t, c] = map[s] || [s, "gray"];
  return `<span class="tag ${c}">${t}</span>`;
}
function loginPage(msg) {
  return adminPage("\u767B\u5F55", `<div class="login-box"><div class="card">
<h1>\u540E\u53F0\u767B\u5F55</h1>${flash(msg, true)}
<form method="post" action="/admin/login">
<label>\u7528\u6237\u540D</label><input type="text" name="username" required autocomplete="username">
<label>\u5BC6\u7801</label><input type="password" name="password" required autocomplete="current-password">
<p style="margin-top:16px"><button class="btn" style="width:100%">\u767B\u5F55</button></p>
</form></div></div>`, "", { bare: true });
}
function setupPage(msg, token) {
  return adminPage("\u521D\u59CB\u5316\u7BA1\u7406\u5458", `<div class="login-box"><div class="card">
<h1>\u521B\u5EFA\u7B2C\u4E00\u4E2A\u7BA1\u7406\u5458</h1>
<p class="muted">\u6B64\u9875\u9762\u53EA\u5728\u8FD8\u6CA1\u6709\u4EFB\u4F55\u7BA1\u7406\u5458\u65F6\u53EF\u7528\uFF0C\u5E76\u9700\u8981\u4E00\u6B21\u6027\u521D\u59CB\u5316\u4EE4\u724C\u3002\u521B\u5EFA\u5B8C\u6210\u540E\u8BF7\u59A5\u5584\u4FDD\u7BA1\u8D26\u53F7\u5BC6\u7801\u3002</p>
${flash(msg, true)}
<form method="post" action="/admin/setup">
<label>\u4E00\u6B21\u6027\u4EE4\u724C</label><input type="text" name="token" value="${esc(token || "")}" required autocomplete="off">
<label>\u7528\u6237\u540D</label><input type="text" name="username" required autocomplete="off">
<label>\u5BC6\u7801\uFF08\u81F3\u5C1110\u4F4D\uFF0C\u542B\u5B57\u6BCD\u548C\u6570\u5B57\uFF09</label><input type="password" name="password" required minlength="10" autocomplete="new-password">
<label>\u786E\u8BA4\u5BC6\u7801</label><input type="password" name="password2" required minlength="10" autocomplete="new-password">
<p style="margin-top:16px"><button class="btn" style="width:100%">\u521B\u5EFA\u7BA1\u7406\u5458</button></p>
</form></div></div>`, "", { bare: true });
}
async function handleLogin(request, env) {
  const form = await request.formData();
  const username = String(form.get("username") || "").slice(0, 60);
  const password = String(form.get("password") || "");
  const fails = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM login_attempts WHERE username = ? AND ok = 0
     AND ts > datetime('now', '-10 minutes')`
  ).bind(username).first();
  if (fails && fails.c >= 5) {
    return html(loginPage("\u5931\u8D25\u6B21\u6570\u8FC7\u591A\uFF0C\u8BF710\u5206\u949F\u540E\u518D\u8BD5\u3002"), 429);
  }
  const admin = await env.DB.prepare("SELECT * FROM admins WHERE username = ?").bind(username).first();
  const ok = admin && await verifyPassword(password, admin.salt, admin.pass_hash);
  await env.DB.prepare("INSERT INTO login_attempts (username, ok) VALUES (?,?)").bind(username, ok ? 1 : 0).run();
  if (!ok) {
    await new Promise((r) => setTimeout(r, 1200));
    return html(loginPage("\u7528\u6237\u540D\u6216\u5BC6\u7801\u4E0D\u6B63\u786E\u3002"), 401);
  }
  const { token, expires } = await createSession(env.DB, admin.id);
  return new Response(null, {
    status: 302,
    headers: { location: "/admin", "set-cookie": sessionCookie(token, expires) }
  });
}
async function handleSetup(request, env) {
  const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM admins").first();
  if (count.c > 0) return html(setupPage("\u5DF2\u5B58\u5728\u7BA1\u7406\u5458\uFF0C\u521D\u59CB\u5316\u901A\u9053\u5DF2\u5173\u95ED\u3002"), 403);
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const username = String(form.get("username") || "").trim().slice(0, 60);
  const p1 = String(form.get("password") || "");
  const p2 = String(form.get("password2") || "");
  if (!env.INIT_TOKEN || token !== env.INIT_TOKEN) return html(setupPage("\u4EE4\u724C\u4E0D\u6B63\u786E\u3002"), 403);
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) return html(setupPage("\u7528\u6237\u540D\u9700\u4E3A3-30\u4F4D\u5B57\u6BCD\u6570\u5B57\u3002"), 422);
  if (p1.length < 10 || !/[a-zA-Z]/.test(p1) || !/[0-9]/.test(p1)) return html(setupPage("\u5BC6\u7801\u81F3\u5C1110\u4F4D\u4E14\u542B\u5B57\u6BCD\u548C\u6570\u5B57\u3002"), 422);
  if (p1 !== p2) return html(setupPage("\u4E24\u6B21\u5BC6\u7801\u4E0D\u4E00\u81F4\u3002"), 422);
  const { hash, salt } = await hashPassword(p1);
  await env.DB.prepare("INSERT INTO admins (username, pass_hash, salt) VALUES (?,?,?)").bind(username, hash, salt).run();
  return redirect("/admin/login");
}
async function dashboard(env) {
  const [newInq, prodOn, prodOff, posts, views7, bot7] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) c FROM inquiries WHERE status='new' AND is_test=0").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM products WHERE status='on' AND is_test=0").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM products WHERE status='off' AND is_test=0").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM posts WHERE status='published' AND is_test=0").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM page_views WHERE ts > datetime('now','-7 days') AND is_test=0").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM page_views WHERE ts > datetime('now','-7 days') AND bot_type='human' AND is_test=0").first()
  ]);
  const recent = await env.DB.prepare(
    "SELECT * FROM inquiries WHERE is_test=0 ORDER BY id DESC LIMIT 8"
  ).all();
  const rows = recent.results.map((i) => `<tr>
<td class="muted">${esc(i.created_at)}</td><td>${esc(i.name)}${i.is_test ? ' <span class="tag gray">\u6D4B\u8BD5</span>' : ""}</td>
<td>${esc(i.email || i.whatsapp)}</td><td>${esc(i.equip_type || i.subject)}</td>
<td>${statusTag(i.status)}${i.email_status === "failed" ? ' <span class="tag red">\u90AE\u4EF6\u672A\u9001\u8FBE</span>' : ""}</td>
<td><a href="/admin/inquiries/${i.id}">\u67E5\u770B</a></td></tr>`).join("");
  return adminPage("\u603B\u89C8", `
<h1>\u603B\u89C8</h1>
<div class="kpis">
  <div class="kpi"><b>${newInq.c}</b><span>\u5F85\u5904\u7406\u8BE2\u76D8</span></div>
  <div class="kpi"><b>${prodOn.c} <span class="muted">/ ${prodOff.c} \u4E0B\u67B6</span></b><span>\u5DF2\u4E0A\u67B6\u4EA7\u54C1</span></div>
  <div class="kpi"><b>${posts.c}</b><span>\u5DF2\u53D1\u5E03\u535A\u5BA2</span></div>
  <div class="kpi"><b>${views7.c} <span class="muted">/ \u771F\u4EBA ${bot7.c}</span></b><span>\u8FD17\u5929\u9875\u9762\u6D4F\u89C8\u91CF</span></div>
</div>
<div class="card"><h2 style="margin-top:0">\u6700\u65B0\u8BE2\u76D8</h2>
${rows ? `<table><tr><th>\u65F6\u95F4</th><th>\u8054\u7CFB\u4EBA</th><th>\u8054\u7CFB\u65B9\u5F0F</th><th>\u610F\u5411</th><th>\u72B6\u6001</th><th></th></tr>${rows}</table>` : '<p class="muted">\u8FD8\u6CA1\u6709\u8BE2\u76D8\u3002</p>'}
</div>`, "dash");
}
async function productsList(env, url) {
  const showTest = url.searchParams.get("test") === "1";
  const rows = await env.DB.prepare(
    `SELECT * FROM products ${showTest ? "" : "WHERE is_test = 0"} ORDER BY category, sort_order`
  ).all();
  const trs = rows.results.map((p) => `<tr>
<td>${p.image ? `<img class="thumb" src="${p.image.startsWith("r2:") ? "/media/" + p.image.slice(3) : "/" + p.image}">` : '<span class="muted">\u65E0\u56FE</span>'}</td>
<td><b>${esc(p.name)}</b><br><span class="muted">/product-${esc(p.slug)}</span></td>
<td>${{ ww: "\u5E9F\u6C34\u5904\u7406", sl: "\u56FA\u6DB2\u5206\u79BB", wi: "\u711A\u70E7" }[p.category] || p.category}</td>
<td>${statusTag(p.status)}${p.is_test ? ' <span class="tag gray">\u6D4B\u8BD5</span>' : ""}</td>
<td>
  <a class="btn sm line" href="/admin/products/${p.id}">\u7F16\u8F91</a>
  <a class="btn sm line" href="/admin/products/${p.id}/i18n">\u7FFB\u8BD1</a>
  <form method="post" action="/admin/products/toggle" style="display:inline"><input type="hidden" name="id" value="${p.id}"><button class="btn sm gray">${p.status === "on" ? "\u4E0B\u67B6" : "\u4E0A\u67B6"}</button></form>
  <form method="post" action="/admin/products/delete" style="display:inline" onsubmit="return confirm('\u786E\u5B9A\u5220\u9664\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D')"><input type="hidden" name="id" value="${p.id}"><button class="btn sm gray">\u5220\u9664</button></form>
</td></tr>`).join("");
  return adminPage("\u4EA7\u54C1\u7BA1\u7406", `
<div class="bar"><h1 style="margin:0">\u4EA7\u54C1\u7BA1\u7406</h1><span class="sp"></span>
<a class="btn line sm" href="/admin/products${showTest ? "" : "?test=1"}">${showTest ? "\u9690\u85CF\u6D4B\u8BD5\u6570\u636E" : "\u663E\u793A\u6D4B\u8BD5\u6570\u636E"}</a>
<a class="btn" href="/admin/products/new">+ \u65B0\u589E\u4EA7\u54C1</a></div>
<div class="card"><table>
<tr><th>\u56FE</th><th>\u540D\u79F0 / \u5730\u5740</th><th>\u5206\u7C7B</th><th>\u72B6\u6001</th><th>\u64CD\u4F5C</th></tr>
${trs}</table></div>`, "products");
}
var QUILL_INIT = `
const quill = new Quill('#editor', {theme:'snow', placeholder:'\u6B63\u6587\u5185\u5BB9\u2026',
  modules:{toolbar:[[{header:[2,3,false]}],['bold','italic','link'],[{'list':'ordered'},{'list':'bullet'}],['image'],['clean']]}});
quill.on('text-change', ()=>{ document.getElementById('body_html').value = quill.root.innerHTML; });
// \u63D2\u56FE\u4E0A\u4F20\u5230\u672C\u7AD9\u56FE\u5E93
quill.getModule('toolbar').addHandler('image', () => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    if (f.size > 5*1024*1024) { alert('\u56FE\u7247\u8D85\u8FC75MB'); return; }
    const fd = new FormData(); fd.append('image', f);
    const res = await fetch('/api/admin/upload', {method:'POST', body:fd});
    const data = await res.json();
    if (data.ok) {
      const range = quill.getSelection(true);
      quill.insertEmbed(range.index, 'image', data.url);
    } else { alert('\u4E0A\u4F20\u5931\u8D25\uFF1A' + (data.error || res.status)); }
  };
  input.click();
});
`;
async function productEdit(env, id, msg) {
  const p = id ? await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first() : null;
  if (id && !p) return html(adminPage("\u672A\u627E\u5230", '<div class="card">\u4EA7\u54C1\u4E0D\u5B58\u5728\u3002</div>', "products"), 404);
  const specs = p ? JSON.parse(p.specs_json || "[]") : [];
  const badges = p ? JSON.parse(p.badges_json || "[]") : [];
  const specRows = specs.map(([m, d], i) => `<div class="spec-row"><input type="text" name="spec_model" value="${esc(m)}" placeholder="\u578B\u53F7\uFF0C\u5982 CXPF-20"><input type="text" name="spec_desc" value="${esc(d)}" placeholder="\u53C2\u6570\u8BF4\u660E"><button class="btn sm gray" type="button" onclick="this.parentElement.remove()">\u5220</button></div>`).join("");
  const body = `
<h1>${p ? "\u7F16\u8F91\u4EA7\u54C1" : "\u65B0\u589E\u4EA7\u54C1"}</h1>${flash(msg)}
<form method="post" action="/admin/products/save" enctype="multipart/form-data">
${p ? `<input type="hidden" name="id" value="${p.id}">` : ""}
<div class="card">
<div class="field-row">
  <div><label>\u4EA7\u54C1\u540D\u79F0\uFF08\u82F1\u6587\uFF0C\u542B\u578B\u53F7\u62EC\u6CE8\uFF09</label><input type="text" name="name" value="${esc(p?.name || "")}" required></div>
  <div><label>\u7F51\u5740\u522B\u540D\uFF08slug\uFF0C\u81EA\u52A8\u751F\u6210\u53EF\u6539\uFF09</label><input type="text" name="slug" value="${esc(p?.slug || "")}" placeholder="\u7559\u7A7A\u81EA\u52A8\u751F\u6210"></div>
</div>
<div class="field-row">
  <div><label>\u5206\u7C7B</label><select name="category">
    <option value="ww" ${p?.category === "ww" ? "selected" : ""}>\u5E9F\u6C34\u5904\u7406\u8BBE\u5907</option>
    <option value="sl" ${p?.category === "sl" ? "selected" : ""}>\u56FA\u6DB2\u5206\u79BB\u8BBE\u5907</option>
    <option value="wi" ${p?.category === "wi" ? "selected" : ""}>\u711A\u70E7\u8BBE\u5907</option>
  </select></div>
  <div><label>\u6392\u5E8F\uFF08\u8D8A\u5C0F\u8D8A\u9760\u524D\uFF09</label><input type="number" name="sort_order" value="${p?.sort_order ?? 100}"></div>
</div>
<label>\u4E00\u53E5\u8BDD\u7B80\u4ECB\uFF08\u82F1\u6587\uFF0C\u663E\u793A\u5728\u5361\u7247\u548C\u6807\u9898\u4E0B\uFF09</label><input type="text" name="short_desc" value="${esc(p?.short_desc || "")}">
<label>\u5FBD\u6807\uFF08\u6BCF\u884C\u4E00\u4E2A\uFF0C\u5982 CE Marked / Patent 2017\u2026\uFF09</label><textarea name="badges" rows="2">${esc(badges.join("\n"))}</textarea>
<label>CE/\u8BA4\u8BC1\u8865\u5145\u8BF4\u660E\uFF08\u82F1\u6587\uFF0C\u53EF\u7559\u7A7A\uFF09</label><input type="text" name="ce_note" value="${esc(p?.ce_note || "")}">
</div>
<div class="card">
<label>\u4EA7\u54C1\u4E3B\u56FE</label>
${p?.image ? `<p><img class="thumb" style="width:180px;height:135px" src="${p.image.startsWith("r2:") ? "/media/" + p.image.slice(3) : "/" + p.image}"> <span class="muted">${esc(p.image)}</span></p>` : ""}
<input type="file" name="image" accept="image/jpeg,image/png,image/webp">
<p class="muted">\u53EA\u63A5\u53D7 jpg/png/webp\uFF0C\u6700\u59275MB\u3002\u4E0D\u4E0A\u4F20\u5219\u4FDD\u6301\u539F\u56FE\u3002</p>
<label>\u4E3B\u56FE\u66FF\u4EE3\u6587\u5B57\uFF08\u82F1\u6587 alt\uFF0C\u53EF\u7559\u7A7A\u5219\u81EA\u52A8\u7528\u4EA7\u54C1\u540D\uFF09</label><input type="text" name="image_alt" value="${esc(p?.image_alt || "")}">
</div>
<div class="card">
<label>\u6B63\u6587\uFF08\u82F1\u6587\uFF0C\u53EF\u89C6\u5316\u7F16\u8F91\uFF09</label>
<div class="editor-wrap"><div id="editor"></div></div>
<input type="hidden" name="body_html" id="body_html">
<label>\u89C4\u683C\u8868\u6807\u9898</label><input type="text" name="spec_title" value="${esc(p?.spec_title || "Model examples")}">
<label>\u89C4\u683C\u8868\uFF08\u578B\u53F7 + \u53C2\u6570\uFF09</label>
<div id="specs">${specRows}</div>
<p><button class="btn sm line" type="button" onclick="document.getElementById('specs').insertAdjacentHTML('beforeend','<div class=&quot;spec-row&quot;><input type=&quot;text&quot; name=&quot;spec_model&quot; placeholder=&quot;\u578B\u53F7&quot;><input type=&quot;text&quot; name=&quot;spec_desc&quot; placeholder=&quot;\u53C2\u6570\u8BF4\u660E&quot;><button class=&quot;btn sm gray&quot; type=&quot;button&quot; onclick=&quot;this.parentElement.remove()&quot;>\u5220</button></div>')">+ \u52A0\u4E00\u884C</button></p>
<label>\u89C4\u683C\u8868\u4E0B\u65B9\u5907\u6CE8\uFF08\u82F1\u6587\uFF0C\u53EF\u7559\u7A7A\uFF09</label><input type="text" name="spec_note" value="${esc(p?.spec_note || "")}">
</div>
<div class="card">
<label>\u72B6\u6001</label><select name="status">
  <option value="on" ${p?.status !== "off" ? "selected" : ""}>\u4E0A\u67B6\uFF08\u7F51\u7AD9\u53EF\u89C1\uFF09</option>
  <option value="off" ${p?.status === "off" ? "selected" : ""}>\u4E0B\u67B6\uFF08\u7F51\u7AD9\u9690\u85CF\uFF09</option>
</select>
<p style="margin-top:16px"><button class="btn">\u4FDD\u5B58</button>
${p ? ` <a class="btn line" href="/product-${esc(p.slug)}" target="_blank">\u67E5\u770B\u524D\u53F0\u9875\u9762</a> <a class="btn line" href="/admin/products/${p.id}/i18n">\u7F16\u8F91\u7FFB\u8BD1</a>` : ""}</p>
</div>
</form>
<script>
${QUILL_INIT}
quill.root.innerHTML = ${JSON.stringify(p?.body_html || "")};
document.querySelector('form').addEventListener('submit', ()=>{ document.getElementById('body_html').value = quill.root.innerHTML; });
<\/script>`;
  return adminPage(p ? "\u7F16\u8F91\u4EA7\u54C1" : "\u65B0\u589E\u4EA7\u54C1", body, "products", { quill: true });
}
async function productSave(request, env) {
  const form = await request.formData();
  const id = String(form.get("id") || "");
  const name = String(form.get("name") || "").trim().slice(0, 200);
  if (!name) return redirect("/admin/products?msg=" + encodeURIComponent("\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A"));
  let slug = slugify(String(form.get("slug") || "")) || slugify(name.replace(/\s*\([^)]*\)/g, ""));
  if (slug.startsWith("product-")) slug = slug.slice(8);
  const category = ["ww", "sl", "wi"].includes(form.get("category")) ? form.get("category") : "ww";
  const badges = String(form.get("badges") || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6);
  const models = form.getAll("spec_model"), descs = form.getAll("spec_desc");
  const specs = models.map((m, i) => [String(m).trim().slice(0, 80), String(descs[i] || "").trim().slice(0, 300)]).filter(([m, d]) => m || d).slice(0, 60);
  let image;
  const file = form.get("image");
  if (file && typeof file === "object" && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) return redirect("/admin/products?msg=" + encodeURIComponent("\u56FE\u7247\u8D85\u8FC75MB"));
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return redirect("/admin/products?msg=" + encodeURIComponent("\u56FE\u7247\u53EA\u63A5\u53D7jpg/png/webp"));
    if (env.MEDIA) {
      const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[file.type];
      const key = "product/" + crypto.randomUUID() + ext;
      await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      image = "r2:" + key;
    }
  }
  const vals = {
    slug,
    category,
    name,
    short_desc: String(form.get("short_desc") || "").slice(0, 300),
    body_html: sanitizeHtml(String(form.get("body_html") || "")),
    spec_title: String(form.get("spec_title") || "").slice(0, 120),
    specs_json: JSON.stringify(specs),
    spec_note: String(form.get("spec_note") || "").slice(0, 300),
    badges_json: JSON.stringify(badges),
    ce_note: String(form.get("ce_note") || "").slice(0, 300),
    image_alt: String(form.get("image_alt") || "").slice(0, 200),
    status: form.get("status") === "off" ? "off" : "on",
    sort_order: parseInt(form.get("sort_order")) || 100
  };
  if (id) {
    const sets = Object.keys(vals).map((k) => `${k} = ?`).join(", ");
    const binds = [...Object.values(vals)];
    let sql = `UPDATE products SET ${sets}, updated_at = datetime('now')`;
    if (image) {
      sql += ", image = ?";
      binds.push(image);
    }
    sql += " WHERE id = ?";
    binds.push(id);
    try {
      await env.DB.prepare(sql).bind(...binds).run();
    } catch (e) {
      return redirect("/admin/products?msg=" + encodeURIComponent("\u4FDD\u5B58\u5931\u8D25\uFF1A\u522B\u540D\u53EF\u80FD\u91CD\u590D"));
    }
  } else {
    const keys = Object.keys(vals).join(", ");
    const marks = Object.keys(vals).map(() => "?").join(",");
    const isTest = isTestMarker(vals.name);
    try {
      await env.DB.prepare(
        `INSERT INTO products (${keys}, image, is_test) VALUES (${marks}, ?, ?)`
      ).bind(...Object.values(vals), image || "", isTest ? 1 : 0).run();
    } catch (e) {
      return redirect("/admin/products?msg=" + encodeURIComponent("\u4FDD\u5B58\u5931\u8D25\uFF1A\u522B\u540D\u53EF\u80FD\u91CD\u590D"));
    }
  }
  return redirect("/admin/products?msg=" + encodeURIComponent("\u5DF2\u4FDD\u5B58"));
}
function isTestMarker(s) {
  return /\[test\]|test-/i.test(s || "");
}
var I18N_LANGS = { ru: "\u4FC4\u8BED", es: "\u897F\u73ED\u7259\u8BED" };
async function productI18n(env, id, url, msg) {
  const p = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  if (!p) return html(adminPage("\u672A\u627E\u5230", '<div class="card">\u4EA7\u54C1\u4E0D\u5B58\u5728\u3002</div>', "products"), 404);
  const lang = I18N_LANGS[url.searchParams.get("lang")] ? url.searchParams.get("lang") : "ru";
  const t = await env.DB.prepare("SELECT * FROM product_i18n WHERE product_id=? AND lang=?").bind(id, lang).first();
  const specs = t?.specs_json ? JSON.parse(t.specs_json) : [];
  const specRows = specs.map(([m, d]) => `<div class="spec-row"><input type="text" name="spec_model" value="${esc(m)}" placeholder="\u578B\u53F7\uFF0C\u5982 CXPF-20"><input type="text" name="spec_desc" value="${esc(d)}" placeholder="\u53C2\u6570\u8BF4\u660E"><button class="btn sm gray" type="button" onclick="this.parentElement.remove()">\u5220</button></div>`).join("");
  const tabs = Object.entries(I18N_LANGS).map(([code, label]) => `<a class="btn sm ${code === lang ? "" : "line"}" href="/admin/products/${p.id}/i18n?lang=${code}">${label}${code === lang ? "\uFF08\u7F16\u8F91\u4E2D\uFF09" : ""}</a>`).join(" ");
  const body = `
<h1>\u4EA7\u54C1\u7FFB\u8BD1\uFF1A${esc(p.name)}</h1>${flash(msg)}
<div class="card"><p style="margin-bottom:10px">${tabs}</p>
<p class="muted">\u6B63\u5728\u7F16\u8F91 <b>${I18N_LANGS[lang]}</b> \u7248\u672C\u3002\u7559\u7A7A\u7684\u5B57\u6BB5\u4F1A\u5728\u524D\u53F0\u81EA\u52A8\u56DE\u9000\u5230\u82F1\u6587\u5185\u5BB9\u3002\u4FDD\u5B58\u540E\u5373\u65F6\u751F\u6548\u3002</p>
<p class="muted">\u524D\u53F0\u5730\u5740\uFF1A<a href="/${lang}/product-${esc(p.slug)}" target="_blank">/${lang}/product-${esc(p.slug)}</a></p></div>
<form method="post" action="/admin/products/i18n/save">
<input type="hidden" name="product_id" value="${p.id}">
<input type="hidden" name="lang" value="${lang}">
<div class="card">
<label>\u4EA7\u54C1\u540D\u79F0\uFF08${I18N_LANGS[lang]}\uFF09</label><input type="text" name="name" value="${esc(t?.name || "")}" placeholder="${esc(p.name)}">
<label>\u4E00\u53E5\u8BDD\u7B80\u4ECB\uFF08${I18N_LANGS[lang]}\uFF09</label><input type="text" name="short_desc" value="${esc(t?.short_desc || "")}" placeholder="${esc(p.short_desc || "")}">
<label>\u4E3B\u56FE\u66FF\u4EE3\u6587\u5B57\uFF08alt\uFF0C${I18N_LANGS[lang]}\uFF09</label><input type="text" name="image_alt" value="${esc(t?.image_alt || "")}" placeholder="${esc(p.image_alt || p.name)}">
<label>CE/\u8BA4\u8BC1\u8865\u5145\u8BF4\u660E\uFF08${I18N_LANGS[lang]}\uFF0C\u53EF\u7559\u7A7A\uFF09</label><input type="text" name="ce_note" value="${esc(t?.ce_note || "")}" placeholder="${esc(p.ce_note || "")}">
</div>
<div class="card">
<label>\u6B63\u6587\uFF08${I18N_LANGS[lang]}\uFF0C\u53EF\u89C6\u5316\u7F16\u8F91\uFF09</label>
<div class="editor-wrap"><div id="editor"></div></div>
<input type="hidden" name="body_html" id="body_html">
<label>\u89C4\u683C\u8868\u6807\u9898</label><input type="text" name="spec_title" value="${esc(t?.spec_title || "")}" placeholder="${esc(p.spec_title || "Model examples")}">
<label>\u89C4\u683C\u8868\uFF08\u578B\u53F7 + \u53C2\u6570\uFF09</label>
<div id="specs">${specRows}</div>
<p><button class="btn sm line" type="button" onclick="document.getElementById('specs').insertAdjacentHTML('beforeend','<div class=&quot;spec-row&quot;><input type=&quot;text&quot; name=&quot;spec_model&quot; placeholder=&quot;\u578B\u53F7&quot;><input type=&quot;text&quot; name=&quot;spec_desc&quot; placeholder=&quot;\u53C2\u6570\u8BF4\u660E&quot;><button class=&quot;btn sm gray&quot; type=&quot;button&quot; onclick=&quot;this.parentElement.remove()&quot;>\u5220</button></div>')">+ \u52A0\u4E00\u884C</button></p>
<label>\u89C4\u683C\u8868\u4E0B\u65B9\u5907\u6CE8\uFF08${I18N_LANGS[lang]}\uFF0C\u53EF\u7559\u7A7A\uFF09</label><input type="text" name="spec_note" value="${esc(t?.spec_note || "")}" placeholder="${esc(p.spec_note || "")}">
</div>
<div class="card">
<p><button class="btn">\u4FDD\u5B58\u7FFB\u8BD1</button> <a class="btn line" href="/admin/products/${p.id}">\u8FD4\u56DE\u4EA7\u54C1\u7F16\u8F91</a></p>
</div>
</form>
<script>
${QUILL_INIT}
quill.root.innerHTML = ${JSON.stringify(t?.body_html || p.body_html || "")};
document.querySelector('form').addEventListener('submit', ()=>{ document.getElementById('body_html').value = quill.root.innerHTML; });
<\/script>`;
  return adminPage("\u4EA7\u54C1\u7FFB\u8BD1", body, "products", { quill: true });
}
async function productI18nSave(request, env) {
  const form = await request.formData();
  const pid = String(form.get("product_id") || "");
  const lang = I18N_LANGS[form.get("lang")] ? String(form.get("lang")) : "ru";
  const p = await env.DB.prepare("SELECT id FROM products WHERE id=?").bind(pid).first();
  if (!p) return redirect("/admin/products?msg=" + encodeURIComponent("\u4EA7\u54C1\u4E0D\u5B58\u5728"));
  const models = form.getAll("spec_model"), descs = form.getAll("spec_desc");
  const specs = models.map((m, i) => [String(m).trim().slice(0, 80), String(descs[i] || "").trim().slice(0, 300)]).filter(([m, d]) => m || d).slice(0, 60);
  const vals = [
    String(form.get("name") || "").trim().slice(0, 200),
    String(form.get("short_desc") || "").slice(0, 300),
    sanitizeHtml(String(form.get("body_html") || "")),
    String(form.get("spec_title") || "").slice(0, 120),
    JSON.stringify(specs),
    String(form.get("spec_note") || "").slice(0, 300),
    String(form.get("ce_note") || "").slice(0, 300),
    String(form.get("image_alt") || "").slice(0, 200)
  ];
  await env.DB.prepare(
    `INSERT INTO product_i18n (product_id, lang, name, short_desc, body_html, spec_title, specs_json, spec_note, ce_note, image_alt, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now'))
     ON CONFLICT(product_id, lang) DO UPDATE SET
       name=excluded.name, short_desc=excluded.short_desc, body_html=excluded.body_html,
       spec_title=excluded.spec_title, specs_json=excluded.specs_json, spec_note=excluded.spec_note,
       ce_note=excluded.ce_note, image_alt=excluded.image_alt, updated_at=excluded.updated_at`
  ).bind(pid, lang, ...vals).run();
  return redirect(`/admin/products/${pid}/i18n?lang=${lang}&msg=` + encodeURIComponent("\u7FFB\u8BD1\u5DF2\u4FDD\u5B58"));
}
function sanitizeHtml(src) {
  let s = String(src || "");
  s = s.replace(/<\s*(script|style|iframe|object|embed|form|input|button|meta|link)[^>]*>.*?<\s*\/\s*\1\s*>/gis, "");
  s = s.replace(/<\s*(script|style|iframe|object|embed|form|input|button|meta|link)[^>]*\/?>/gis, "");
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  s = s.replace(/javascript\s*:/gi, "");
  return s.slice(0, 6e4);
}
async function blogList(env, url) {
  const showTest = url.searchParams.get("test") === "1";
  const rows = await env.DB.prepare(
    `SELECT * FROM posts ${showTest ? "" : "WHERE is_test = 0"} ORDER BY COALESCE(published_at, created_at) DESC`
  ).all();
  const trs = rows.results.map((p) => `<tr>
<td><b>${esc(p.title)}</b><br><span class="muted">/blog-${esc(p.slug)}</span></td>
<td>${statusTag(p.status)}${p.is_test ? ' <span class="tag gray">\u6D4B\u8BD5</span>' : ""}</td>
<td class="muted">${esc(p.published_at || p.created_at)}</td>
<td>
  <a class="btn sm line" href="/admin/blog/${p.id}">\u7F16\u8F91</a>
  ${p.status === "published" ? `<a class="btn sm gray" href="/blog-${esc(p.slug)}" target="_blank">\u67E5\u770B</a>` : ""}
  <form method="post" action="/admin/blog/delete" style="display:inline" onsubmit="return confirm('\u786E\u5B9A\u5220\u9664\uFF1F')"><input type="hidden" name="id" value="${p.id}"><button class="btn sm gray">\u5220\u9664</button></form>
</td></tr>`).join("");
  return adminPage("\u535A\u5BA2\u7BA1\u7406", `
<div class="bar"><h1 style="margin:0">\u535A\u5BA2\u7BA1\u7406</h1><span class="sp"></span>
<a class="btn line sm" href="/admin/blog${showTest ? "" : "?test=1"}">${showTest ? "\u9690\u85CF\u6D4B\u8BD5\u6570\u636E" : "\u663E\u793A\u6D4B\u8BD5\u6570\u636E"}</a>
<a class="btn" href="/admin/blog/new">+ \u5199\u6587\u7AE0</a></div>
<div class="card"><table>
<tr><th>\u6807\u9898 / \u5730\u5740</th><th>\u72B6\u6001</th><th>\u53D1\u5E03\u65F6\u95F4</th><th>\u64CD\u4F5C</th></tr>
${trs || '<tr><td colspan="4" class="muted">\u8FD8\u6CA1\u6709\u6587\u7AE0</td></tr>'}</table></div>`, "blog");
}
async function postEdit(env, id, msg) {
  const p = id ? await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first() : null;
  if (id && !p) return html(adminPage("\u672A\u627E\u5230", '<div class="card">\u6587\u7AE0\u4E0D\u5B58\u5728\u3002</div>', "blog"), 404);
  const body = `
<h1>${p ? "\u7F16\u8F91\u6587\u7AE0" : "\u5199\u6587\u7AE0"}</h1>${flash(msg)}
<form method="post" action="/admin/blog/save" enctype="multipart/form-data">
${p ? `<input type="hidden" name="id" value="${p.id}">` : ""}
<div class="card">
<label>\u6807\u9898\uFF08\u82F1\u6587\uFF09</label><input type="text" name="title" value="${esc(p?.title || "")}" required>
<div class="field-row">
  <div><label>\u7F51\u5740\u522B\u540D\uFF08slug\uFF0C\u7559\u7A7A\u81EA\u52A8\u751F\u6210\uFF09</label><input type="text" name="slug" value="${esc(p?.slug || "")}"></div>
  <div><label>\u72B6\u6001</label><select name="status">
    <option value="draft" ${p?.status !== "published" ? "selected" : ""}>\u8349\u7A3F\uFF08\u7F51\u7AD9\u4E0D\u53EF\u89C1\uFF09</option>
    <option value="published" ${p?.status === "published" ? "selected" : ""}>\u53D1\u5E03</option>
  </select></div>
</div>
<label>\u6458\u8981\uFF08\u82F1\u6587\uFF0C\u663E\u793A\u5728\u5217\u8868\u548C\u9996\u9875\uFF09</label><textarea name="excerpt" rows="2">${esc(p?.excerpt || "")}</textarea>
<div class="field-row">
  <div><label>\u6587\u672B\u4EA7\u54C1\u6309\u94AE\u6587\u5B57\uFF08\u82F1\u6587\uFF0C\u53EF\u7559\u7A7A\uFF09</label><input type="text" name="extra_cta_label" value="${esc(p?.extra_cta_label || "")}" placeholder="\u5982 Compare the DAF models"></div>
  <div><label>\u6587\u672B\u4EA7\u54C1\u6309\u94AE\u94FE\u63A5</label><input type="text" name="extra_cta_href" value="${esc(p?.extra_cta_href || "")}" placeholder="/product-xxx"></div>
</div>
<label>\u5C01\u9762\u56FE</label>
${p?.cover_image ? `<p><img class="thumb" style="width:180px;height:auto" src="${p.cover_image.startsWith("r2:") ? "/media/" + p.cover_image.slice(3) : "/" + p.cover_image}"></p>` : ""}
<input type="file" name="cover" accept="image/jpeg,image/png,image/webp">
<p class="muted">\u53EA\u63A5\u53D7 jpg/png/webp\uFF0C\u6700\u59275MB\u3002\u6B63\u6587\u63D2\u56FE\u7528\u7F16\u8F91\u5668\u5DE5\u5177\u680F\u7684\u56FE\u7247\u6309\u94AE\u3002</p>
</div>
<div class="card">
<label>\u6B63\u6587</label>
<div class="editor-wrap"><div id="editor"></div></div>
<input type="hidden" name="body_html" id="body_html">
</div>
<p><button class="btn">\u4FDD\u5B58</button>
${p?.status === "published" ? ` <a class="btn line" href="/blog-${esc(p.slug)}" target="_blank">\u67E5\u770B\u524D\u53F0\u9875\u9762</a>` : ""}
${p && p.status !== "published" ? ` <a class="btn line" href="/admin/blog/${p.id}/preview" target="_blank">\u9884\u89C8\u8349\u7A3F</a>` : ""}</p>
</form>
<script>
${QUILL_INIT}
quill.root.innerHTML = ${JSON.stringify(p?.body_html || "")};
document.querySelector('form').addEventListener('submit', ()=>{ document.getElementById('body_html').value = quill.root.innerHTML; });
<\/script>`;
  return adminPage(p ? "\u7F16\u8F91\u6587\u7AE0" : "\u5199\u6587\u7AE0", body, "blog", { quill: true });
}
async function postSave(request, env) {
  const form = await request.formData();
  const id = String(form.get("id") || "");
  const title = String(form.get("title") || "").trim().slice(0, 200);
  if (!title) return redirect("/admin/blog?msg=" + encodeURIComponent("\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A"));
  const slug = slugify(String(form.get("slug") || "")) || slugify(title);
  const status = form.get("status") === "published" ? "published" : "draft";
  let cover;
  const file = form.get("cover");
  if (file && typeof file === "object" && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) return redirect("/admin/blog?msg=" + encodeURIComponent("\u56FE\u7247\u8D85\u8FC75MB"));
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return redirect("/admin/blog?msg=" + encodeURIComponent("\u56FE\u7247\u53EA\u63A5\u53D7jpg/png/webp"));
    if (env.MEDIA) {
      const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[file.type];
      const key = "blog/" + crypto.randomUUID() + ext;
      await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      cover = "r2:" + key;
    }
  }
  const extraHref = String(form.get("extra_cta_href") || "").slice(0, 200);
  const vals = {
    slug,
    title,
    excerpt: String(form.get("excerpt") || "").slice(0, 500),
    body_html: sanitizeHtml(String(form.get("body_html") || "")),
    extra_cta_label: String(form.get("extra_cta_label") || "").slice(0, 120),
    extra_cta_href: /^(\/|https?:\/\/)/.test(extraHref) ? extraHref : "",
    status
  };
  if (id) {
    const old = await env.DB.prepare("SELECT published_at FROM posts WHERE id = ?").bind(id).first();
    const sets = Object.keys(vals).map((k) => `${k} = ?`).join(", ");
    const binds = [...Object.values(vals)];
    let sql = `UPDATE posts SET ${sets}, updated_at = datetime('now')`;
    if (cover) {
      sql += ", cover_image = ?";
      binds.push(cover);
    }
    if (status === "published" && !old?.published_at) {
      sql += ", published_at = datetime('now')";
    }
    sql += " WHERE id = ?";
    binds.push(id);
    try {
      await env.DB.prepare(sql).bind(...binds).run();
    } catch {
      return redirect("/admin/blog?msg=" + encodeURIComponent("\u4FDD\u5B58\u5931\u8D25\uFF1A\u522B\u540D\u91CD\u590D"));
    }
    return redirect("/admin/blog/" + id + "?msg=" + encodeURIComponent("\u5DF2\u4FDD\u5B58"));
  }
  const keys = Object.keys(vals).join(", ");
  const marks = Object.keys(vals).map(() => "?").join(",");
  const isTest = isTestMarker(title);
  try {
    const r = await env.DB.prepare(
      `INSERT INTO posts (${keys}, cover_image, is_test${status === "published" ? ", published_at" : ""})
       VALUES (${marks}, ?, ?${status === "published" ? ", datetime('now')" : ""})`
    ).bind(...Object.values(vals), cover || "", isTest ? 1 : 0).run();
    return redirect("/admin/blog/" + r.meta.last_row_id + "?msg=" + encodeURIComponent("\u5DF2\u4FDD\u5B58"));
  } catch {
    return redirect("/admin/blog?msg=" + encodeURIComponent("\u4FDD\u5B58\u5931\u8D25\uFF1A\u522B\u540D\u91CD\u590D"));
  }
}
async function inquiryList(env, url) {
  const showTest = url.searchParams.get("test") === "1";
  const status = url.searchParams.get("status") || "";
  let sql = "SELECT * FROM inquiries";
  const conds = [], binds = [];
  if (!showTest) conds.push("is_test = 0");
  if (status) {
    conds.push("status = ?");
    binds.push(status);
  }
  if (conds.length) sql += " WHERE " + conds.join(" AND ");
  sql += " ORDER BY id DESC LIMIT 300";
  const rows = await env.DB.prepare(sql).bind(...binds).all();
  const trs = rows.results.map((i) => `<tr>
<td class="muted">${esc(i.created_at)}</td>
<td><b>${esc(i.name)}</b>${i.is_test ? ' <span class="tag gray">\u6D4B\u8BD5</span>' : ""}</td>
<td>${esc(i.email)}<br>${esc(i.whatsapp)}</td>
<td>${esc(i.country)}</td>
<td>${esc(i.equip_type || i.subject)}</td>
<td>${statusTag(i.status)}<br>${i.email_status === "failed" ? '<span class="tag red">\u90AE\u4EF6\u672A\u9001\u8FBE</span>' : i.email_status === "sent" ? '<span class="tag green">\u5DF2\u901A\u77E5</span>' : ""}</td>
<td><a href="/admin/inquiries/${i.id}">\u67E5\u770B</a></td></tr>`).join("");
  return adminPage("\u8BE2\u76D8\u7BA1\u7406", `
<div class="bar"><h1 style="margin:0">\u8BE2\u76D8\u7BA1\u7406</h1><span class="sp"></span>
<a class="btn line sm" href="/admin/inquiries?status=new">\u5F85\u5904\u7406</a>
<a class="btn line sm" href="/admin/inquiries?status=following">\u8DDF\u8FDB\u4E2D</a>
<a class="btn line sm" href="/admin/inquiries?status=done">\u5DF2\u5904\u7406</a>
<a class="btn line sm" href="/admin/inquiries">\u5168\u90E8</a>
<a class="btn line sm" href="/admin/inquiries${showTest ? "" : "?test=1"}">${showTest ? "\u9690\u85CF\u6D4B\u8BD5\u6570\u636E" : "\u663E\u793A\u6D4B\u8BD5\u6570\u636E"}</a>
</div>
<div class="card"><table>
<tr><th>\u65F6\u95F4(UTC)</th><th>\u8054\u7CFB\u4EBA</th><th>\u90AE\u7BB1 / WhatsApp</th><th>\u56FD\u5BB6</th><th>\u610F\u5411</th><th>\u72B6\u6001</th><th></th></tr>
${trs || '<tr><td colspan="7" class="muted">\u6682\u65E0\u8BE2\u76D8</td></tr>'}</table></div>`, "inquiries");
}
async function inquiryDetail(env, id, msg) {
  const i = await env.DB.prepare("SELECT * FROM inquiries WHERE id = ?").bind(id).first();
  if (!i) return html(adminPage("\u672A\u627E\u5230", '<div class="card">\u8BE2\u76D8\u4E0D\u5B58\u5728\u3002</div>', "inquiries"), 404);
  const fields = JSON.parse(i.fields_json || "{}");
  const frows = Object.entries(fields).map(([k, v]) => `<tr><th style="width:180px">${esc(k)}</th><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join("");
  return adminPage("\u8BE2\u76D8\u8BE6\u60C5", `
<h1>\u8BE2\u76D8 #${i.id} ${i.is_test ? '<span class="tag gray">\u6D4B\u8BD5</span>' : ""}</h1>${flash(msg)}
<div class="card">
<table>
<tr><th style="width:180px">\u63D0\u4EA4\u65F6\u95F4(UTC)</th><td>${esc(i.created_at)}</td></tr>
<tr><th>\u6765\u6E90\u9875\u9762</th><td>${esc(i.page)}</td></tr>
<tr><th>\u90AE\u4EF6\u901A\u77E5</th><td>${i.email_status === "sent" ? '<span class="tag green">\u5DF2\u53D1\u9001\u5230 steffy@huayienviron.com</span>' : i.email_status === "failed" ? '<span class="tag red">\u53D1\u9001\u5931\u8D25\uFF08\u8BB0\u5F55\u5DF2\u4FDD\u5B58\uFF0C\u8BF7\u76F4\u63A5\u8054\u7CFB\u5BA2\u6237\uFF09</span>' : '<span class="tag gray">\u672A\u914D\u7F6E</span>'}</td></tr>
<tr><th>\u9644\u4EF6</th><td>${i.attachment_key ? `<a href="/file/${esc(i.attachment_key)}">${esc(i.attachment_name || "\u4E0B\u8F7D\u9644\u4EF6")}</a>` : "\u65E0"}</td></tr>
</table>
<h2>\u8868\u5355\u5185\u5BB9</h2>
<table>${frows}</table>
</div>
<div class="card">
<form method="post" action="/admin/inquiries/update">
<input type="hidden" name="id" value="${i.id}">
<label>\u72B6\u6001</label><select name="status">
  <option value="new" ${i.status === "new" ? "selected" : ""}>\u5F85\u5904\u7406</option>
  <option value="following" ${i.status === "following" ? "selected" : ""}>\u8DDF\u8FDB\u4E2D</option>
  <option value="done" ${i.status === "done" ? "selected" : ""}>\u5DF2\u5904\u7406</option>
</select>
<label>\u8DDF\u8FDB\u5907\u6CE8\uFF08\u5185\u90E8\u53EF\u89C1\uFF09</label><textarea name="notes">${esc(i.notes)}</textarea>
<p style="margin-top:14px"><button class="btn">\u4FDD\u5B58</button></p>
</form>
</div>`, "inquiries");
}
async function analyticsPage(env) {
  const days = await env.DB.prepare(`
    SELECT substr(ts,1,10) d,
      SUM(CASE WHEN bot_type='human' THEN 1 ELSE 0 END) human,
      SUM(CASE WHEN bot_type='se-bot' THEN 1 ELSE 0 END) se,
      SUM(CASE WHEN bot_type='bot' THEN 1 ELSE 0 END) bot
    FROM page_views WHERE ts > datetime('now','-30 days') AND is_test=0
    GROUP BY d ORDER BY d DESC`).all();
  const topPages = await env.DB.prepare(`
    SELECT path, COUNT(*) c FROM page_views
    WHERE ts > datetime('now','-30 days') AND bot_type='human' AND is_test=0
    GROUP BY path ORDER BY c DESC LIMIT 15`).all();
  const topRef = await env.DB.prepare(`
    SELECT CASE WHEN referrer='' THEN '(\u76F4\u63A5\u8BBF\u95EE)' ELSE referrer END r, COUNT(*) c FROM page_views
    WHERE ts > datetime('now','-30 days') AND bot_type='human' AND is_test=0
    GROUP BY r ORDER BY c DESC LIMIT 10`).all();
  const topCountry = await env.DB.prepare(`
    SELECT CASE WHEN country='' THEN '(\u672A\u77E5)' ELSE country END co, COUNT(*) c FROM page_views
    WHERE ts > datetime('now','-30 days') AND bot_type='human' AND is_test=0
    GROUP BY co ORDER BY c DESC LIMIT 15`).all();
  const t = (rows) => rows.map(([label, c]) => `<tr><td>${esc(label)}</td><td><b>${c}</b></td></tr>`).join("");
  return adminPage("\u8BBF\u5BA2\u7EDF\u8BA1", `
<h1>\u8BBF\u5BA2\u7EDF\u8BA1\uFF08\u8FD130\u5929\uFF09</h1>
<div class="card">
<p class="muted">\u8BF4\u660E\uFF1A\u8FD9\u91CC\u7EDF\u8BA1\u7684\u662F<b>\u9875\u9762\u6D4F\u89C8\u91CF</b>\uFF08\u540C\u4E00\u8BBF\u5BA2\u591A\u6B21\u8BBF\u95EE\u4F1A\u91CD\u590D\u8BA1\u6570\uFF09\uFF0C\u4E0D\u662F\u72EC\u7ACB\u8BBF\u5BA2\u4EBA\u6570\u3002
\u771F\u4EBA/\u673A\u5668\u4EBA\u6309\u6D4F\u89C8\u5668\u81EA\u62A5\u8EAB\u4EFD\uFF08User-Agent\uFF09\u533A\u5206\uFF1A\u81EA\u62A5\u5BB6\u95E8\u7684\u641C\u7D22\u5F15\u64CE\u5355\u5217\uFF1B\u4F2A\u88C5\u6210\u666E\u901A\u6D4F\u89C8\u5668\u7684\u673A\u5668\u4EBA\u65E0\u6CD5\u8BC6\u522B\uFF0C
\u6570\u5B57\u53EA\u4F5C\u8D8B\u52BF\u53C2\u8003\u3002\u4E0D\u8BB0\u5F55 IP\uFF0C\u5730\u533A\u53EA\u5230\u56FD\u5BB6\u7EA7\uFF08\u7531 Cloudflare \u7F51\u7EDC\u5C42\u63D0\u4F9B\uFF09\u3002\u6570\u636E\u4FDD\u755912\u4E2A\u6708\u540E\u81EA\u52A8\u6E05\u9664\u3002</p>
</div>
<div class="card"><h2 style="margin-top:0">\u6309\u5929\u7EDF\u8BA1</h2>
<table><tr><th>\u65E5\u671F</th><th>\u771F\u4EBA\u6D4F\u89C8\u91CF</th><th>\u641C\u7D22\u5F15\u64CE</th><th>\u5176\u4ED6\u673A\u5668\u4EBA</th></tr>
${days.results.map((r) => `<tr><td>${esc(r.d)}</td><td><b>${r.human}</b></td><td>${r.se}</td><td>${r.bot}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">\u6682\u65E0\u6570\u636E</td></tr>'}
</table></div>
<div class="card"><h2 style="margin-top:0">\u70ED\u95E8\u9875\u9762\uFF08\u771F\u4EBA\uFF09</h2>
<table><tr><th>\u9875\u9762</th><th>\u6D4F\u89C8\u91CF</th></tr>${t(topPages.results.map((r) => [r.path, r.c])) || '<tr><td colspan="2" class="muted">\u6682\u65E0</td></tr>'}</table></div>
<div class="card"><h2 style="margin-top:0">\u6765\u6E90\uFF08\u771F\u4EBA\uFF09</h2>
<table><tr><th>\u6765\u6E90</th><th>\u6B21\u6570</th></tr>${t(topRef.results.map((r) => [r.r, r.c])) || '<tr><td colspan="2" class="muted">\u6682\u65E0</td></tr>'}</table></div>
<div class="card"><h2 style="margin-top:0">\u56FD\u5BB6/\u5730\u533A\uFF08\u771F\u4EBA\uFF09</h2>
<table><tr><th>\u56FD\u5BB6\u4EE3\u7801</th><th>\u6D4F\u89C8\u91CF</th></tr>${t(topCountry.results.map((r) => [r.co, r.c])) || '<tr><td colspan="2" class="muted">\u6682\u65E0</td></tr>'}</table></div>
`, "analytics");
}
async function settingsPage(env, admin, msg) {
  const admins = await env.DB.prepare("SELECT id, username, created_at FROM admins").all();
  const arows = admins.results.map((a) => `<tr><td>${esc(a.username)}</td><td class="muted">${esc(a.created_at)}</td>
<td>${admins.results.length > 1 && a.id !== admin.id ? `<form method="post" action="/admin/settings/del-admin" style="display:inline" onsubmit="return confirm('\u5220\u9664\u8BE5\u7BA1\u7406\u5458\uFF1F')"><input type="hidden" name="id" value="${a.id}"><button class="btn sm gray">\u5220\u9664</button></form>` : '<span class="muted">\uFF08\u5F53\u524D/\u552F\u4E00\uFF09</span>'}</td></tr>`).join("");
  return adminPage("\u8BBE\u7F6E", `
<h1>\u8BBE\u7F6E</h1>${flash(msg)}
<div class="card"><h2 style="margin-top:0">\u4FEE\u6539\u6211\u7684\u5BC6\u7801</h2>
<form method="post" action="/admin/settings/password">
<label>\u5F53\u524D\u5BC6\u7801</label><input type="password" name="old" required autocomplete="current-password">
<label>\u65B0\u5BC6\u7801\uFF08\u81F3\u5C1110\u4F4D\uFF0C\u542B\u5B57\u6BCD\u548C\u6570\u5B57\uFF09</label><input type="password" name="p1" required minlength="10" autocomplete="new-password">
<label>\u786E\u8BA4\u65B0\u5BC6\u7801</label><input type="password" name="p2" required minlength="10" autocomplete="new-password">
<p style="margin-top:12px"><button class="btn">\u4FEE\u6539\u5BC6\u7801</button></p></form></div>
<div class="card"><h2 style="margin-top:0">\u7BA1\u7406\u5458\u8D26\u53F7</h2>
<table><tr><th>\u7528\u6237\u540D</th><th>\u521B\u5EFA\u65F6\u95F4</th><th></th></tr>${arows}</table>
<details><summary>\u6DFB\u52A0\u7BA1\u7406\u5458</summary>
<form method="post" action="/admin/settings/add-admin">
<label>\u7528\u6237\u540D</label><input type="text" name="username" required>
<label>\u5BC6\u7801\uFF08\u81F3\u5C1110\u4F4D\uFF0C\u542B\u5B57\u6BCD\u548C\u6570\u5B57\uFF09</label><input type="password" name="password" required minlength="10" autocomplete="new-password">
<p style="margin-top:12px"><button class="btn">\u6DFB\u52A0</button></p></form></details></div>
<div class="card"><h2 style="margin-top:0">\u5907\u4EFD</h2>
<p class="muted">\u4E0B\u8F7D\u6570\u636E\u5E93\u5B8C\u6574\u5907\u4EFD\uFF08SQL \u6587\u4EF6\uFF0C\u542B\u4EA7\u54C1\u3001\u535A\u5BA2\u3001\u8BE2\u76D8\u3001\u8BBF\u5BA2\u8BB0\u5F55\uFF09\u3002\u9644\u4EF6\u6587\u4EF6\u5B58\u4E8E Cloudflare R2\uFF0C\u6062\u590D\u65B9\u6CD5\u89C1\u4F7F\u7528\u8BF4\u660E\u3002</p>
<p><a class="btn" href="/admin/backup">\u4E0B\u8F7D\u6570\u636E\u5E93\u5907\u4EFD</a></p></div>
<div class="card"><h2 style="margin-top:0">\u6D4B\u8BD5\u6570\u636E</h2>
<p class="muted">\u540D\u79F0/\u5185\u5BB9\u4E2D\u5E26 [TEST] \u6216 TEST- \u6807\u8BB0\u7684\u8BB0\u5F55\u4F1A\u88AB\u81EA\u52A8\u6807\u8BB0\u4E3A\u6D4B\u8BD5\u6570\u636E\u3002\u6B64\u64CD\u4F5C\u5220\u9664\u6240\u6709\u6D4B\u8BD5\u6807\u8BB0\u7684\u4EA7\u54C1\u3001\u535A\u5BA2\u3001\u8BE2\u76D8\u548C\u8BBF\u5BA2\u8BB0\u5F55\u3002</p>
<form method="post" action="/admin/settings/clear-test" onsubmit="return confirm('\u786E\u5B9A\u5220\u9664\u6240\u6709\u6D4B\u8BD5\u6570\u636E\uFF1F')">
<button class="btn gray">\u6E05\u9664\u5168\u90E8\u6D4B\u8BD5\u6570\u636E</button></form></div>
`, "settings");
}
async function backupSql(env) {
  const tables = ["products", "posts", "inquiries", "page_views", "admins"];
  let out = `-- Huayi CMS backup ${(/* @__PURE__ */ new Date()).toISOString()}
`;
  for (const t of tables) {
    const rows = await env.DB.prepare(`SELECT * FROM ${t}`).all();
    for (const r of rows.results) {
      const cols = Object.keys(r).join(", ");
      const vals = Object.values(r).map((v) => v === null ? "NULL" : typeof v === "number" ? v : "'" + String(v).replace(/'/g, "''") + "'").join(", ");
      out += `INSERT INTO ${t} (${cols}) VALUES (${vals});
`;
    }
  }
  return new Response(out, {
    headers: {
      "content-type": "application/sql; charset=utf-8",
      "content-disposition": `attachment; filename="huayi-cms-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.sql"`
    }
  });
}

// cms-src/worker/index.js
var CAT_SLUGS = ["wastewater-treatment", "solid-liquid-separation", "waste-incineration"];
var DYNAMIC_HTML = /* @__PURE__ */ new Set([
  "/index.html",
  "/products.html",
  "/blog.html",
  "/products-wastewater-treatment.html",
  "/products-solid-liquid-separation.html",
  "/products-waste-incineration.html"
]);
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/api/inquiry") return await handleInquiry(request, env);
      if (path === "/api/admin/upload" && request.method === "POST") {
        const a = await currentAdmin(request, env.DB);
        if (!a) return json({ ok: false, error: "unauthorized" }, 401);
        return await handleUpload(request, env);
      }
      if (path === "/admin/login") {
        if (request.method === "POST") return await handleLogin(request, env);
        return html(loginPage());
      }
      if (path === "/admin/setup") {
        const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM admins").first();
        if (count.c > 0) return html(setupPage("\u521D\u59CB\u5316\u901A\u9053\u5DF2\u5173\u95ED\u3002"), 403);
        if (request.method === "POST") return await handleSetup(request, env);
        return html(setupPage(null, url.searchParams.get("token") || ""));
      }
      if (path === "/admin/logout") {
        await destroySession(env.DB, request);
        return new Response(null, {
          status: 302,
          headers: {
            location: "/admin/login",
            "set-cookie": "huayi_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
          }
        });
      }
      if (path === "/admin" || path.startsWith("/admin/")) {
        return await adminRoutes(request, env, url, path);
      }
      if (path.startsWith("/media/")) {
        return await serveMedia(env, path.slice(7), false);
      }
      if (path.startsWith("/file/")) {
        const a = await currentAdmin(request, env.DB);
        if (!a) return redirect("/admin/login");
        return await serveMedia(env, path.slice(6), true);
      }
      const res = await publicRoutes(request, env, url, path);
      if (res) {
        if (request.method === "GET") logPageView(ctx, env, request, path);
        return res;
      }
      if (DYNAMIC_HTML.has(path) || /^\/product-[a-z0-9-]+\.html$/.test(path) || /^\/blog-[a-z0-9-]+\.html$/.test(path)) {
        return redirect(path.replace(/index\.html$/, "").replace(/\.html$/, "") || "/", 301);
      }
      const plm = path.match(/^\/(ru|es)(\/.*)\.html$/);
      if (plm) return redirect(`/${plm[1]}${plm[2].replace(/\/index$/, "")}`, 301);
      const resp = await env.ASSETS.fetch(request);
      if (request.method === "GET" && (resp.headers.get("content-type") || "").includes("text/html")) {
        logPageView(ctx, env, request, path);
      }
      return resp;
    } catch (err) {
      return html('<h1 style="font-family:sans-serif;margin:40px">Something went wrong. Please try again later.</h1>', 500);
    }
  }
};
async function adminRoutes(request, env, url, path) {
  const a = await currentAdmin(request, env.DB);
  if (!a) return redirect("/admin/login");
  const msg = url.searchParams.get("msg");
  const m = request.method;
  if (path === "/admin") return html(await dashboard(env));
  if (path === "/admin/products") return html(await productsList(env, url));
  if (path === "/admin/products/new") return html(await productEdit(env, null, msg));
  if (path === "/admin/products/save" && m === "POST") return await productSave(request, env);
  if (path === "/admin/products/toggle" && m === "POST") {
    const f = await request.formData();
    await env.DB.prepare("UPDATE products SET status = CASE WHEN status='on' THEN 'off' ELSE 'on' END, updated_at=datetime('now') WHERE id=?").bind(String(f.get("id"))).run();
    return redirect("/admin/products?msg=" + encodeURIComponent("\u72B6\u6001\u5DF2\u5207\u6362"));
  }
  if (path === "/admin/products/delete" && m === "POST") {
    const f = await request.formData();
    await env.DB.prepare("DELETE FROM products WHERE id=?").bind(String(f.get("id"))).run();
    return redirect("/admin/products?msg=" + encodeURIComponent("\u5DF2\u5220\u9664"));
  }
  let mm = path.match(/^\/admin\/products\/(\d+)\/i18n$/);
  if (mm) return html(await productI18n(env, mm[1], url, msg));
  if (path === "/admin/products/i18n/save" && m === "POST") return await productI18nSave(request, env);
  mm = path.match(/^\/admin\/products\/(\d+)$/);
  if (mm) return html(await productEdit(env, mm[1], msg));
  if (path === "/admin/blog") return html(await blogList(env, url));
  if (path === "/admin/blog/new") return html(await postEdit(env, null, msg));
  if (path === "/admin/blog/save" && m === "POST") return await postSave(request, env);
  if (path === "/admin/blog/delete" && m === "POST") {
    const f = await request.formData();
    await env.DB.prepare("DELETE FROM posts WHERE id=?").bind(String(f.get("id"))).run();
    return redirect("/admin/blog?msg=" + encodeURIComponent("\u5DF2\u5220\u9664"));
  }
  mm = path.match(/^\/admin\/blog\/(\d+)$/);
  if (mm) return html(await postEdit(env, mm[1], msg));
  mm = path.match(/^\/admin\/blog\/(\d+)\/preview$/);
  if (mm) {
    const p = await env.DB.prepare("SELECT * FROM posts WHERE id=?").bind(mm[1]).first();
    if (!p) return html("not found", 404);
    return html(blogPostPage(p));
  }
  if (path === "/admin/inquiries") return html(await inquiryList(env, url));
  mm = path.match(/^\/admin\/inquiries\/(\d+)$/);
  if (mm) return html(await inquiryDetail(env, mm[1], msg));
  if (path === "/admin/inquiries/update" && m === "POST") {
    const f = await request.formData();
    const st = ["new", "following", "done"].includes(f.get("status")) ? f.get("status") : "new";
    await env.DB.prepare("UPDATE inquiries SET status=?, notes=? WHERE id=?").bind(st, String(f.get("notes") || "").slice(0, 2e3), String(f.get("id"))).run();
    return redirect("/admin/inquiries/" + f.get("id") + "?msg=" + encodeURIComponent("\u5DF2\u4FDD\u5B58"));
  }
  if (path === "/admin/analytics") return html(await analyticsPage(env));
  if (path === "/admin/settings") return html(await settingsPage(env, a, msg));
  if (path === "/admin/settings/password" && m === "POST") {
    const f = await request.formData();
    const row = await env.DB.prepare("SELECT * FROM admins WHERE id=?").bind(a.id).first();
    const { verifyPassword: verifyPassword2, hashPassword: hashPassword2 } = await Promise.resolve().then(() => (init_auth(), auth_exports));
    if (!await verifyPassword2(String(f.get("old") || ""), row.salt, row.pass_hash)) {
      return redirect("/admin/settings?msg=" + encodeURIComponent("\u5F53\u524D\u5BC6\u7801\u4E0D\u6B63\u786E"));
    }
    const p1 = String(f.get("p1") || ""), p2 = String(f.get("p2") || "");
    if (p1.length < 10 || !/[a-zA-Z]/.test(p1) || !/[0-9]/.test(p1) || p1 !== p2) {
      return redirect("/admin/settings?msg=" + encodeURIComponent("\u65B0\u5BC6\u7801\u4E0D\u7B26\u5408\u8981\u6C42\u6216\u4E24\u6B21\u4E0D\u4E00\u81F4"));
    }
    const { hash, salt } = await hashPassword2(p1);
    await env.DB.prepare("UPDATE admins SET pass_hash=?, salt=? WHERE id=?").bind(hash, salt, a.id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE admin_id=?").bind(a.id).run();
    return new Response(null, { status: 302, headers: {
      location: "/admin/login",
      "set-cookie": "huayi_admin=; Path=/; HttpOnly; Secure; Max-Age=0"
    } });
  }
  if (path === "/admin/settings/add-admin" && m === "POST") {
    const f = await request.formData();
    const username = String(f.get("username") || "").trim();
    const p1 = String(f.get("password") || "");
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username) || p1.length < 10 || !/[a-zA-Z]/.test(p1) || !/[0-9]/.test(p1)) {
      return redirect("/admin/settings?msg=" + encodeURIComponent("\u7528\u6237\u540D\u6216\u5BC6\u7801\u4E0D\u7B26\u5408\u8981\u6C42"));
    }
    const { hashPassword: hashPassword2 } = await Promise.resolve().then(() => (init_auth(), auth_exports));
    const { hash, salt } = await hashPassword2(p1);
    try {
      await env.DB.prepare("INSERT INTO admins (username, pass_hash, salt) VALUES (?,?,?)").bind(username, hash, salt).run();
    } catch {
      return redirect("/admin/settings?msg=" + encodeURIComponent("\u7528\u6237\u540D\u5DF2\u5B58\u5728"));
    }
    return redirect("/admin/settings?msg=" + encodeURIComponent("\u5DF2\u6DFB\u52A0\u7BA1\u7406\u5458"));
  }
  if (path === "/admin/settings/del-admin" && m === "POST") {
    const f = await request.formData();
    const id = parseInt(f.get("id"));
    const count = await env.DB.prepare("SELECT COUNT(*) c FROM admins").first();
    if (count.c > 1 && id !== a.id) {
      await env.DB.prepare("DELETE FROM admins WHERE id=?").bind(id).run();
    }
    return redirect("/admin/settings?msg=" + encodeURIComponent("\u5DF2\u5220\u9664"));
  }
  if (path === "/admin/settings/clear-test" && m === "POST") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM products WHERE is_test=1"),
      env.DB.prepare("DELETE FROM posts WHERE is_test=1"),
      env.DB.prepare("DELETE FROM inquiries WHERE is_test=1"),
      env.DB.prepare("DELETE FROM page_views WHERE is_test=1")
    ]);
    return redirect("/admin/settings?msg=" + encodeURIComponent("\u6D4B\u8BD5\u6570\u636E\u5DF2\u6E05\u9664"));
  }
  if (path === "/admin/backup") return await backupSql(env);
  return html(adminPage("404", '<div class="card">\u9875\u9762\u4E0D\u5B58\u5728\u3002</div>'), 404);
}
function applyTr(p) {
  if (!p) return p;
  if (p.t_name) p.name = p.t_name;
  if (p.t_short) p.short_desc = p.t_short;
  if (p.t_body) p.body_html = p.t_body;
  if (p.t_stitle) p.spec_title = p.t_stitle;
  if (p.t_specs) p.specs_json = p.t_specs;
  if (p.t_snote) p.spec_note = p.t_snote;
  if (p.t_ce) p.ce_note = p.t_ce;
  if (p.t_alt) p.image_alt = p.t_alt;
  return p;
}
var TR_SELECT = `p.*, t.name t_name, t.short_desc t_short, t.body_html t_body, t.spec_title t_stitle,
  t.specs_json t_specs, t.spec_note t_snote, t.ce_note t_ce, t.image_alt t_alt`;
var TR_JOIN = `FROM products p LEFT JOIN product_i18n t ON t.product_id = p.id AND t.lang = ?`;
async function publicRoutes(request, env, url, path) {
  if (request.method !== "GET") return null;
  let lang = "en", sub = path;
  const lm = path.match(/^\/(ru|es)(\/.*)?$/);
  if (lm) {
    lang = lm[1];
    sub = lm[2] || "/";
  }
  if (sub === "/" || sub === "/index.html") {
    const posts = await env.DB.prepare(
      "SELECT * FROM posts WHERE status='published' ORDER BY published_at DESC, id DESC LIMIT 3"
    ).all();
    return html(homePage(posts.results, lang));
  }
  if (sub === "/products") {
    const rows = await env.DB.prepare(
      "SELECT category, COUNT(*) c FROM products WHERE status='on' GROUP BY category"
    ).all();
    const counts = {};
    for (const r of rows.results) {
      const slug = { ww: "wastewater-treatment", sl: "solid-liquid-separation", wi: "waste-incineration" }[r.category];
      if (slug) counts[slug] = r.c;
    }
    return html(productsPage(counts, lang));
  }
  let mm = sub.match(/^\/products-([a-z-]+)$/);
  if (mm && CAT_SLUGS.includes(mm[1])) {
    const cat = { "wastewater-treatment": "ww", "solid-liquid-separation": "sl", "waste-incineration": "wi" }[mm[1]];
    const products = lang === "en" ? await env.DB.prepare(
      "SELECT * FROM products WHERE status='on' AND category=? ORDER BY sort_order, id"
    ).bind(cat).all() : await env.DB.prepare(
      `SELECT ${TR_SELECT} ${TR_JOIN} WHERE p.status='on' AND p.category=? ORDER BY p.sort_order, p.id`
    ).bind(lang, cat).all();
    return html(categoryPage(mm[1], products.results.map(applyTr), lang));
  }
  mm = sub.match(/^\/product-([a-z0-9-]+)$/);
  if (mm) {
    const p = lang === "en" ? await env.DB.prepare("SELECT * FROM products WHERE slug=? AND status='on'").bind(mm[1]).first() : await env.DB.prepare(
      `SELECT ${TR_SELECT} ${TR_JOIN} WHERE p.slug=? AND p.status='on'`
    ).bind(lang, mm[1]).first();
    if (!p) return null;
    applyTr(p);
    const related = lang === "en" ? await env.DB.prepare(
      "SELECT slug,name,short_desc FROM products WHERE status='on' AND category=? AND id!=? ORDER BY sort_order LIMIT 3"
    ).bind(p.category, p.id).all() : await env.DB.prepare(
      `SELECT p.slug, COALESCE(t.name,p.name) name, COALESCE(t.short_desc,p.short_desc) short_desc
           FROM products p LEFT JOIN product_i18n t ON t.product_id=p.id AND t.lang=?
           WHERE p.status='on' AND p.category=? AND p.id!=? ORDER BY p.sort_order LIMIT 3`
    ).bind(lang, p.category, p.id).all();
    return html(productPage(p, related.results, lang));
  }
  if (lang !== "en" && (sub === "/blog" || sub.startsWith("/blog-"))) {
    return redirect(sub, 301);
  }
  if (sub === "/blog" && lang === "en") {
    const posts = await env.DB.prepare(
      "SELECT * FROM posts WHERE status='published' ORDER BY published_at DESC LIMIT 50"
    ).all();
    return html(blogListPage(posts.results));
  }
  mm = sub.match(/^\/blog-([a-z0-9-]+)$/);
  if (mm) {
    const p = await env.DB.prepare("SELECT * FROM posts WHERE slug=? AND status='published'").bind(mm[1]).first();
    if (!p) return null;
    const more = await env.DB.prepare(
      "SELECT slug, title FROM posts WHERE status='published' AND id!=? ORDER BY published_at DESC, id DESC LIMIT 2"
    ).bind(p.id).all();
    return html(blogPostPage(p, more.results));
  }
  if (path === "/sitemap.xml") {
    const products = await env.DB.prepare("SELECT slug FROM products WHERE status='on'").all();
    const posts = await env.DB.prepare("SELECT slug FROM posts WHERE status='published'").all();
    return new Response(
      sitemapXml(products.results, posts.results),
      { headers: { "content-type": "application/xml; charset=utf-8" } }
    );
  }
  return null;
}
async function serveMedia(env, key, isFile) {
  if (!env.MEDIA) return new Response("storage not configured", { status: 503 });
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response("not found", { status: 404 });
  const headers = new Headers();
  headers.set("content-type", obj.httpMetadata?.contentType || "application/octet-stream");
  headers.set("cache-control", isFile ? "private, no-store" : "public, max-age=86400");
  if (isFile) headers.set("content-disposition", "attachment");
  return new Response(obj.body, { headers });
}
async function handleUpload(request, env) {
  if (!env.MEDIA) return json({ ok: false, error: "storage_not_configured" }, 503);
  const form = await request.formData();
  const file = form.get("image") || form.get("file");
  if (!file || typeof file !== "object" || !file.size) return json({ ok: false, error: "no_file" }, 400);
  if (file.size > 5 * 1024 * 1024) return json({ ok: false, error: "file_too_large" }, 413);
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpg = head[0] === 255 && head[1] === 216;
  const isPng = head[0] === 137 && head[1] === 80;
  const isWebp = head[8] === 87 && head[9] === 69;
  if (!isJpg && !isPng && !isWebp) return json({ ok: false, error: "not_an_image" }, 415);
  const ext = isJpg ? ".jpg" : isPng ? ".png" : ".webp";
  const key = "upload/" + crypto.randomUUID() + ext;
  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: isJpg ? "image/jpeg" : isPng ? "image/png" : "image/webp" }
  });
  return json({ ok: true, url: "/media/" + key });
}
export {
  index_default as default
};
