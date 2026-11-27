// Entry point: routing for the public site, the API, and the admin panel.
import { json, html, redirect, getCookie } from './util.js';
import { currentAdmin, destroySession } from './auth.js';
import { handleInquiry } from './inquiry.js';
import { logPageView } from './analytics.js';
import * as tpl from './templates.js';
import * as admin from './admin.js';

const CAT_SLUGS = ['wastewater-treatment', 'solid-liquid-separation', 'waste-incineration'];
// Paths now rendered from the database.
const DYNAMIC_HTML = new Set([
  '/index.html', '/products.html', '/blog.html',
  '/products-wastewater-treatment.html', '/products-solid-liquid-separation.html',
  '/products-waste-incineration.html',
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      // ---------- API ----------
      if (path === '/api/inquiry') return await handleInquiry(request, env);
      if (path === '/api/admin/upload' && request.method === 'POST') {
        const a = await currentAdmin(request, env.DB);
        if (!a) return json({ ok: false, error: 'unauthorized' }, 401);
        return await handleUpload(request, env);
      }

      // ---------- admin panel ----------
      if (path === '/admin/login') {
        if (request.method === 'POST') return await admin.handleLogin(request, env);
        return html(admin.loginPage());
      }
      if (path === '/admin/setup') {
        const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM admins').first();
        if (count.c > 0) return html(admin.setupPage('初始化通道已关闭。'), 403);
        if (request.method === 'POST') return await admin.handleSetup(request, env);
        return html(admin.setupPage(null, url.searchParams.get('token') || ''));
      }
      if (path === '/admin/logout') {
        await destroySession(env.DB, request);
        return new Response(null, { status: 302,
          headers: { location: '/admin/login',
            'set-cookie': 'huayi_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' } });
      }
      if (path === '/admin' || path.startsWith('/admin/')) {
        return await adminRoutes(request, env, url, path);
      }

      // ---------- media / files ----------
      if (path.startsWith('/media/')) {
        return await serveMedia(env, path.slice(7), false);
      }
      if (path.startsWith('/file/')) {
        const a = await currentAdmin(request, env.DB);
        if (!a) return redirect('/admin/login');
        return await serveMedia(env, path.slice(6), true);
      }

      // ---------- dynamic public pages ----------
      const res = await publicRoutes(request, env, url, path);
      if (res) {
        if (request.method === 'GET') logPageView(ctx, env, request, path);
        return res;
      }

      // redirect legacy .html URLs of dynamic pages to the clean version
      if (DYNAMIC_HTML.has(path) || /^\/product-[a-z0-9-]+\.html$/.test(path) || /^\/blog-[a-z0-9-]+\.html$/.test(path)) {
        return redirect(path.replace(/index\.html$/, '').replace(/\.html$/, '') || '/', 301);
      }
      // localized legacy .html URLs (/ru/products.html -> /ru/products)
      const plm = path.match(/^\/(ru|es)(\/.*)\.html$/);
      if (plm) return redirect(`/${plm[1]}${plm[2].replace(/\/index$/, '')}`, 301);

      // ---------- static assets ----------
      const resp = await env.ASSETS.fetch(request);
      if (request.method === 'GET' && (resp.headers.get('content-type') || '').includes('text/html')) {
        logPageView(ctx, env, request, path);
      }
      return resp;
    } catch (err) {
      return html('<h1 style="font-family:sans-serif;margin:40px">Something went wrong. Please try again later.</h1>', 500);
    }
  },
};

/* ---------------- admin router (auth required) ---------------- */

async function adminRoutes(request, env, url, path) {
  const a = await currentAdmin(request, env.DB);
  if (!a) return redirect('/admin/login');
  const msg = url.searchParams.get('msg');
  const m = request.method;

  if (path === '/admin') return html(await admin.dashboard(env));

  if (path === '/admin/products') return html(await admin.productsList(env, url));
  if (path === '/admin/products/new') return html(await admin.productEdit(env, null, msg));
  if (path === '/admin/products/save' && m === 'POST') return await admin.productSave(request, env);
  if (path === '/admin/products/toggle' && m === 'POST') {
    const f = await request.formData();
    await env.DB.prepare("UPDATE products SET status = CASE WHEN status='on' THEN 'off' ELSE 'on' END, updated_at=datetime('now') WHERE id=?")
      .bind(String(f.get('id'))).run();
    return redirect('/admin/products?msg=' + encodeURIComponent('状态已切换'));
  }
  if (path === '/admin/products/delete' && m === 'POST') {
    const f = await request.formData();
    await env.DB.prepare('DELETE FROM products WHERE id=?').bind(String(f.get('id'))).run();
    return redirect('/admin/products?msg=' + encodeURIComponent('已删除'));
  }
  let mm = path.match(/^\/admin\/products\/(\d+)\/i18n$/);
  if (mm) return html(await admin.productI18n(env, mm[1], url, msg));
  if (path === '/admin/products/i18n/save' && m === 'POST') return await admin.productI18nSave(request, env);
  mm = path.match(/^\/admin\/products\/(\d+)$/);
  if (mm) return html(await admin.productEdit(env, mm[1], msg));

  if (path === '/admin/blog') return html(await admin.blogList(env, url));
  if (path === '/admin/blog/new') return html(await admin.postEdit(env, null, msg));
  if (path === '/admin/blog/save' && m === 'POST') return await admin.postSave(request, env);
  if (path === '/admin/blog/delete' && m === 'POST') {
    const f = await request.formData();
    await env.DB.prepare('DELETE FROM posts WHERE id=?').bind(String(f.get('id'))).run();
    return redirect('/admin/blog?msg=' + encodeURIComponent('已删除'));
  }
  mm = path.match(/^\/admin\/blog\/(\d+)$/);
  if (mm) return html(await admin.postEdit(env, mm[1], msg));
  mm = path.match(/^\/admin\/blog\/(\d+)\/preview$/);
  if (mm) {
    const p = await env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(mm[1]).first();
    if (!p) return html('not found', 404);
    return html(tpl.blogPostPage(p));
  }

  if (path === '/admin/inquiries') return html(await admin.inquiryList(env, url));
  mm = path.match(/^\/admin\/inquiries\/(\d+)$/);
  if (mm) return html(await admin.inquiryDetail(env, mm[1], msg));
  if (path === '/admin/inquiries/update' && m === 'POST') {
    const f = await request.formData();
    const st = ['new', 'following', 'done'].includes(f.get('status')) ? f.get('status') : 'new';
    await env.DB.prepare('UPDATE inquiries SET status=?, notes=? WHERE id=?')
      .bind(st, String(f.get('notes') || '').slice(0, 2000), String(f.get('id'))).run();
    return redirect('/admin/inquiries/' + f.get('id') + '?msg=' + encodeURIComponent('已保存'));
  }

  if (path === '/admin/analytics') return html(await admin.analyticsPage(env));

  if (path === '/admin/settings') return html(await admin.settingsPage(env, a, msg));
  if (path === '/admin/settings/password' && m === 'POST') {
    const f = await request.formData();
    const row = await env.DB.prepare('SELECT * FROM admins WHERE id=?').bind(a.id).first();
    const { verifyPassword, hashPassword } = await import('./auth.js');
    if (!await verifyPassword(String(f.get('old') || ''), row.salt, row.pass_hash)) {
      return redirect('/admin/settings?msg=' + encodeURIComponent('当前密码不正确'));
    }
    const p1 = String(f.get('p1') || ''), p2 = String(f.get('p2') || '');
    if (p1.length < 10 || !/[a-zA-Z]/.test(p1) || !/[0-9]/.test(p1) || p1 !== p2) {
      return redirect('/admin/settings?msg=' + encodeURIComponent('新密码不符合要求或两次不一致'));
    }
    const { hash, salt } = await hashPassword(p1);
    await env.DB.prepare('UPDATE admins SET pass_hash=?, salt=? WHERE id=?').bind(hash, salt, a.id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE admin_id=?').bind(a.id).run();
    return new Response(null, { status: 302, headers: { location: '/admin/login',
      'set-cookie': 'huayi_admin=; Path=/; HttpOnly; Secure; Max-Age=0' } });
  }
  if (path === '/admin/settings/add-admin' && m === 'POST') {
    const f = await request.formData();
    const username = String(f.get('username') || '').trim();
    const p1 = String(f.get('password') || '');
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username) || p1.length < 10 || !/[a-zA-Z]/.test(p1) || !/[0-9]/.test(p1)) {
      return redirect('/admin/settings?msg=' + encodeURIComponent('用户名或密码不符合要求'));
    }
    const { hashPassword } = await import('./auth.js');
    const { hash, salt } = await hashPassword(p1);
    try {
      await env.DB.prepare('INSERT INTO admins (username, pass_hash, salt) VALUES (?,?,?)').bind(username, hash, salt).run();
    } catch { return redirect('/admin/settings?msg=' + encodeURIComponent('用户名已存在')); }
    return redirect('/admin/settings?msg=' + encodeURIComponent('已添加管理员'));
  }
  if (path === '/admin/settings/del-admin' && m === 'POST') {
    const f = await request.formData();
    const id = parseInt(f.get('id'));
    const count = await env.DB.prepare('SELECT COUNT(*) c FROM admins').first();
    if (count.c > 1 && id !== a.id) {
      await env.DB.prepare('DELETE FROM admins WHERE id=?').bind(id).run();
    }
    return redirect('/admin/settings?msg=' + encodeURIComponent('已删除'));
  }
  if (path === '/admin/settings/clear-test' && m === 'POST') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM products WHERE is_test=1'),
      env.DB.prepare('DELETE FROM posts WHERE is_test=1'),
      env.DB.prepare('DELETE FROM inquiries WHERE is_test=1'),
      env.DB.prepare('DELETE FROM page_views WHERE is_test=1'),
    ]);
    return redirect('/admin/settings?msg=' + encodeURIComponent('测试数据已清除'));
  }
  if (path === '/admin/backup') return await admin.backupSql(env);

  return html(admin.adminPage('404', '<div class="card">页面不存在。</div>'), 404);
}

/* ---------------- public dynamic routes ---------------- */

// Overlay translated fields from a product_i18n LEFT JOIN (t_* aliases) onto a product row.
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
const TR_SELECT = `p.*, t.name t_name, t.short_desc t_short, t.body_html t_body, t.spec_title t_stitle,
  t.specs_json t_specs, t.spec_note t_snote, t.ce_note t_ce, t.image_alt t_alt`;
const TR_JOIN = `FROM products p LEFT JOIN product_i18n t ON t.product_id = p.id AND t.lang = ?`;

async function publicRoutes(request, env, url, path) {
  if (request.method !== 'GET') return null;

  // language prefix: /ru/... or /es/... (English has no prefix)
  let lang = 'en', sub = path;
  const lm = path.match(/^\/(ru|es)(\/.*)?$/);
  if (lm) { lang = lm[1]; sub = lm[2] || '/'; }

  if (sub === '/' || sub === '/index.html') {
    const posts = await env.DB.prepare(
      "SELECT * FROM posts WHERE status='published' ORDER BY published_at DESC, id DESC LIMIT 3").all();
    return html(tpl.homePage(posts.results, lang));
  }
  if (sub === '/products') {
    const rows = await env.DB.prepare(
      "SELECT category, COUNT(*) c FROM products WHERE status='on' GROUP BY category").all();
    const counts = {};
    for (const r of rows.results) {
      const slug = { ww: 'wastewater-treatment', sl: 'solid-liquid-separation', wi: 'waste-incineration' }[r.category];
      if (slug) counts[slug] = r.c;
    }
    return html(tpl.productsPage(counts, lang));
  }
  let mm = sub.match(/^\/products-([a-z-]+)$/);
  if (mm && CAT_SLUGS.includes(mm[1])) {
    const cat = { 'wastewater-treatment': 'ww', 'solid-liquid-separation': 'sl', 'waste-incineration': 'wi' }[mm[1]];
    const products = lang === 'en'
      ? await env.DB.prepare(
          "SELECT * FROM products WHERE status='on' AND category=? ORDER BY sort_order, id").bind(cat).all()
      : await env.DB.prepare(
          `SELECT ${TR_SELECT} ${TR_JOIN} WHERE p.status='on' AND p.category=? ORDER BY p.sort_order, p.id`)
          .bind(lang, cat).all();
    return html(tpl.categoryPage(mm[1], products.results.map(applyTr), lang));
  }
  mm = sub.match(/^\/product-([a-z0-9-]+)$/);
  if (mm) {
    const p = lang === 'en'
      ? await env.DB.prepare("SELECT * FROM products WHERE slug=? AND status='on'").bind(mm[1]).first()
      : await env.DB.prepare(
          `SELECT ${TR_SELECT} ${TR_JOIN} WHERE p.slug=? AND p.status='on'`).bind(lang, mm[1]).first();
    if (!p) return null; // fall through to static 404
    applyTr(p);
    const related = lang === 'en'
      ? await env.DB.prepare(
          "SELECT slug,name,short_desc FROM products WHERE status='on' AND category=? AND id!=? ORDER BY sort_order LIMIT 3")
          .bind(p.category, p.id).all()
      : await env.DB.prepare(
          `SELECT p.slug, COALESCE(t.name,p.name) name, COALESCE(t.short_desc,p.short_desc) short_desc
           FROM products p LEFT JOIN product_i18n t ON t.product_id=p.id AND t.lang=?
           WHERE p.status='on' AND p.category=? AND p.id!=? ORDER BY p.sort_order LIMIT 3`)
          .bind(lang, p.category, p.id).all();
    return html(tpl.productPage(p, related.results, lang));
  }
  // blog is English-only: bounce localized blog URLs to the English version
  if (lang !== 'en' && (sub === '/blog' || sub.startsWith('/blog-'))) {
    return redirect(sub, 301);
  }
  if (sub === '/blog' && lang === 'en') {
    const posts = await env.DB.prepare(
      "SELECT * FROM posts WHERE status='published' ORDER BY published_at DESC LIMIT 50").all();
    return html(tpl.blogListPage(posts.results));
  }
  mm = sub.match(/^\/blog-([a-z0-9-]+)$/);
  if (mm) {
    const p = await env.DB.prepare("SELECT * FROM posts WHERE slug=? AND status='published'").bind(mm[1]).first();
    if (!p) return null;
    const more = await env.DB.prepare(
      "SELECT slug, title FROM posts WHERE status='published' AND id!=? ORDER BY published_at DESC, id DESC LIMIT 2")
      .bind(p.id).all();
    return html(tpl.blogPostPage(p, more.results));
  }
  if (path === '/sitemap.xml') {
    const products = await env.DB.prepare("SELECT slug FROM products WHERE status='on'").all();
    const posts = await env.DB.prepare("SELECT slug FROM posts WHERE status='published'").all();
    return new Response(tpl.sitemapXml(products.results, posts.results),
      { headers: { 'content-type': 'application/xml; charset=utf-8' } });
  }
  return null;
}

/* ---------------- media ---------------- */

async function serveMedia(env, key, isFile) {
  if (!env.MEDIA) return new Response('storage not configured', { status: 503 });
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('not found', { status: 404 });
  const headers = new Headers();
  headers.set('content-type', obj.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('cache-control', isFile ? 'private, no-store' : 'public, max-age=86400');
  if (isFile) headers.set('content-disposition', 'attachment');
  return new Response(obj.body, { headers });
}

/* ---------------- image upload (admin) ---------------- */

async function handleUpload(request, env) {
  if (!env.MEDIA) return json({ ok: false, error: 'storage_not_configured' }, 503);
  const form = await request.formData();
  const file = form.get('image') || form.get('file');
  if (!file || typeof file !== 'object' || !file.size) return json({ ok: false, error: 'no_file' }, 400);
  if (file.size > 5 * 1024 * 1024) return json({ ok: false, error: 'file_too_large' }, 413);
  // verify real content, not just extension
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpg = head[0] === 0xFF && head[1] === 0xD8;
  const isPng = head[0] === 0x89 && head[1] === 0x50;
  const isWebp = head[8] === 0x57 && head[9] === 0x45; // 'WE' in WEBP
  if (!isJpg && !isPng && !isWebp) return json({ ok: false, error: 'not_an_image' }, 415);
  const ext = isJpg ? '.jpg' : isPng ? '.png' : '.webp';
  const key = 'upload/' + crypto.randomUUID() + ext;
  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: isJpg ? 'image/jpeg' : isPng ? 'image/png' : 'image/webp' },
  });
  return json({ ok: true, url: '/media/' + key });
}
