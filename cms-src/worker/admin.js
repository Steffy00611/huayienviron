// Admin panel: server-rendered UI + form-post actions. All routes require a
// valid session except /admin/login and /admin/setup.
import { esc, html, json, redirect, getCookie, slugify } from './util.js';
import { hashPassword, verifyPassword, createSession, sessionCookie, clearCookie,
         currentAdmin, destroySession } from './auth.js';

const CSS = `
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

export function adminPage(title, inner, active = '', opts = {}) {
  const nav = opts.bare ? '' : `<div class="topbar">
  <b>华一网站后台</b>
  <a href="/admin" class="${active === 'dash' ? 'on' : ''}">总览</a>
  <a href="/admin/products" class="${active === 'products' ? 'on' : ''}">产品</a>
  <a href="/admin/blog" class="${active === 'blog' ? 'on' : ''}">博客</a>
  <a href="/admin/inquiries" class="${active === 'inquiries' ? 'on' : ''}">询盘</a>
  <a href="/admin/analytics" class="${active === 'analytics' ? 'on' : ''}">访客</a>
  <a href="/admin/settings" class="${active === 'settings' ? 'on' : ''}">设置</a>
  <span class="sp"></span>
  <a href="/" target="_blank">查看网站 ↗</a>
  <a href="/admin/logout">退出登录</a>
</div>`;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · 网站后台</title>
<style>${CSS}</style>
${opts.quill ? '<link rel="stylesheet" href="/assets/admin/quill.snow.css">' : ''}
</head><body>${nav}<div class="wrap">${inner}</div>
${opts.quill ? '<script src="/assets/admin/quill.min.js"></script>' : ''}
</body></html>`;
}

const flash = (msg, err) => msg ? `<div class="flash${err ? ' err' : ''}">${esc(msg)}</div>` : '';

function statusTag(s) {
  const map = { new: ['待处理', 'orange'], following: ['跟进中', 'blue'], done: ['已处理', 'green'],
                on: ['已上架', 'green'], off: ['已下架', 'gray'],
                draft: ['草稿', 'gray'], published: ['已发布', 'green'] };
  const [t, c] = map[s] || [s, 'gray'];
  return `<span class="tag ${c}">${t}</span>`;
}

/* ---------------- login / setup ---------------- */

export function loginPage(msg) {
  return adminPage('登录', `<div class="login-box"><div class="card">
<h1>后台登录</h1>${flash(msg, true)}
<form method="post" action="/admin/login">
<label>用户名</label><input type="text" name="username" required autocomplete="username">
<label>密码</label><input type="password" name="password" required autocomplete="current-password">
<p style="margin-top:16px"><button class="btn" style="width:100%">登录</button></p>
</form></div></div>`, '', { bare: true });
}

export function setupPage(msg, token) {
  return adminPage('初始化管理员', `<div class="login-box"><div class="card">
<h1>创建第一个管理员</h1>
<p class="muted">此页面只在还没有任何管理员时可用，并需要一次性初始化令牌。创建完成后请妥善保管账号密码。</p>
${flash(msg, true)}
<form method="post" action="/admin/setup">
<label>一次性令牌</label><input type="text" name="token" value="${esc(token || '')}" required autocomplete="off">
<label>用户名</label><input type="text" name="username" required autocomplete="off">
<label>密码（至少10位，含字母和数字）</label><input type="password" name="password" required minlength="10" autocomplete="new-password">
<label>确认密码</label><input type="password" name="password2" required minlength="10" autocomplete="new-password">
<p style="margin-top:16px"><button class="btn" style="width:100%">创建管理员</button></p>
</form></div></div>`, '', { bare: true });
}

export async function handleLogin(request, env) {
  const form = await request.formData();
  const username = String(form.get('username') || '').slice(0, 60);
  const password = String(form.get('password') || '');
  // naive lockout: >5 failures for this username in 10 min -> refuse
  const fails = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM login_attempts WHERE username = ? AND ok = 0
     AND ts > datetime('now', '-10 minutes')`).bind(username).first();
  if (fails && fails.c >= 5) {
    return html(loginPage('失败次数过多，请10分钟后再试。'), 429);
  }
  const admin = await env.DB.prepare('SELECT * FROM admins WHERE username = ?').bind(username).first();
  const ok = admin && await verifyPassword(password, admin.salt, admin.pass_hash);
  await env.DB.prepare('INSERT INTO login_attempts (username, ok) VALUES (?,?)')
    .bind(username, ok ? 1 : 0).run();
  if (!ok) {
    await new Promise(r => setTimeout(r, 1200));
    return html(loginPage('用户名或密码不正确。'), 401);
  }
  const { token, expires } = await createSession(env.DB, admin.id);
  return new Response(null, { status: 302,
    headers: { location: '/admin', 'set-cookie': sessionCookie(token, expires) } });
}

export async function handleSetup(request, env) {
  const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM admins').first();
  if (count.c > 0) return html(setupPage('已存在管理员，初始化通道已关闭。'), 403);
  const form = await request.formData();
  const token = String(form.get('token') || '');
  const username = String(form.get('username') || '').trim().slice(0, 60);
  const p1 = String(form.get('password') || '');
  const p2 = String(form.get('password2') || '');
  if (!env.INIT_TOKEN || token !== env.INIT_TOKEN) return html(setupPage('令牌不正确。'), 403);
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) return html(setupPage('用户名需为3-30位字母数字。'), 422);
  if (p1.length < 10 || !/[a-zA-Z]/.test(p1) || !/[0-9]/.test(p1)) return html(setupPage('密码至少10位且含字母和数字。'), 422);
  if (p1 !== p2) return html(setupPage('两次密码不一致。'), 422);
  const { hash, salt } = await hashPassword(p1);
  await env.DB.prepare('INSERT INTO admins (username, pass_hash, salt) VALUES (?,?,?)')
    .bind(username, hash, salt).run();
  return redirect('/admin/login');
}

/* ---------------- dashboard ---------------- */

export async function dashboard(env) {
  const [newInq, prodOn, prodOff, posts, views7, bot7] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) c FROM inquiries WHERE status='new' AND is_test=0").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM products WHERE status='on' AND is_test=0").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM products WHERE status='off' AND is_test=0").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM posts WHERE status='published' AND is_test=0").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM page_views WHERE ts > datetime('now','-7 days') AND is_test=0").first(),
    env.DB.prepare("SELECT COUNT(*) c FROM page_views WHERE ts > datetime('now','-7 days') AND bot_type='human' AND is_test=0").first(),
  ]);
  const recent = await env.DB.prepare(
    'SELECT * FROM inquiries WHERE is_test=0 ORDER BY id DESC LIMIT 8').all();
  const rows = recent.results.map(i => `<tr>
<td class="muted">${esc(i.created_at)}</td><td>${esc(i.name)}${i.is_test ? ' <span class="tag gray">测试</span>' : ''}</td>
<td>${esc(i.email || i.whatsapp)}</td><td>${esc(i.equip_type || i.subject)}</td>
<td>${statusTag(i.status)}${i.email_status === 'failed' ? ' <span class="tag red">邮件未送达</span>' : ''}</td>
<td><a href="/admin/inquiries/${i.id}">查看</a></td></tr>`).join('');
  return adminPage('总览', `
<h1>总览</h1>
<div class="kpis">
  <div class="kpi"><b>${newInq.c}</b><span>待处理询盘</span></div>
  <div class="kpi"><b>${prodOn.c} <span class="muted">/ ${prodOff.c} 下架</span></b><span>已上架产品</span></div>
  <div class="kpi"><b>${posts.c}</b><span>已发布博客</span></div>
  <div class="kpi"><b>${views7.c} <span class="muted">/ 真人 ${bot7.c}</span></b><span>近7天页面浏览量</span></div>
</div>
<div class="card"><h2 style="margin-top:0">最新询盘</h2>
${rows ? `<table><tr><th>时间</th><th>联系人</th><th>联系方式</th><th>意向</th><th>状态</th><th></th></tr>${rows}</table>` : '<p class="muted">还没有询盘。</p>'}
</div>`, 'dash');
}

/* ---------------- products ---------------- */

export async function productsList(env, url) {
  const showTest = url.searchParams.get('test') === '1';
  const rows = await env.DB.prepare(
    `SELECT * FROM products ${showTest ? '' : 'WHERE is_test = 0'} ORDER BY category, sort_order`).all();
  const trs = rows.results.map(p => `<tr>
<td>${p.image ? `<img class="thumb" src="${p.image.startsWith('r2:') ? '/media/' + p.image.slice(3) : '/' + p.image}">` : '<span class="muted">无图</span>'}</td>
<td><b>${esc(p.name)}</b><br><span class="muted">/product-${esc(p.slug)}</span></td>
<td>${{ ww: '废水处理', sl: '固液分离', wi: '焚烧' }[p.category] || p.category}</td>
<td>${statusTag(p.status)}${p.is_test ? ' <span class="tag gray">测试</span>' : ''}</td>
<td>
  <a class="btn sm line" href="/admin/products/${p.id}">编辑</a>
  <a class="btn sm line" href="/admin/products/${p.id}/i18n">翻译</a>
  <form method="post" action="/admin/products/toggle" style="display:inline"><input type="hidden" name="id" value="${p.id}"><button class="btn sm gray">${p.status === 'on' ? '下架' : '上架'}</button></form>
  <form method="post" action="/admin/products/delete" style="display:inline" onsubmit="return confirm('确定删除？此操作不可恢复')"><input type="hidden" name="id" value="${p.id}"><button class="btn sm gray">删除</button></form>
</td></tr>`).join('');
  return adminPage('产品管理', `
<div class="bar"><h1 style="margin:0">产品管理</h1><span class="sp"></span>
<a class="btn line sm" href="/admin/products${showTest ? '' : '?test=1'}">${showTest ? '隐藏测试数据' : '显示测试数据'}</a>
<a class="btn" href="/admin/products/new">+ 新增产品</a></div>
<div class="card"><table>
<tr><th>图</th><th>名称 / 地址</th><th>分类</th><th>状态</th><th>操作</th></tr>
${trs}</table></div>`, 'products');
}

const QUILL_INIT = `
const quill = new Quill('#editor', {theme:'snow', placeholder:'正文内容…',
  modules:{toolbar:[[{header:[2,3,false]}],['bold','italic','link'],[{'list':'ordered'},{'list':'bullet'}],['image'],['clean']]}});
quill.on('text-change', ()=>{ document.getElementById('body_html').value = quill.root.innerHTML; });
// 插图上传到本站图库
quill.getModule('toolbar').addHandler('image', () => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    if (f.size > 5*1024*1024) { alert('图片超过5MB'); return; }
    const fd = new FormData(); fd.append('image', f);
    const res = await fetch('/api/admin/upload', {method:'POST', body:fd});
    const data = await res.json();
    if (data.ok) {
      const range = quill.getSelection(true);
      quill.insertEmbed(range.index, 'image', data.url);
    } else { alert('上传失败：' + (data.error || res.status)); }
  };
  input.click();
});
`;

export async function productEdit(env, id, msg) {
  const p = id ? await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first() : null;
  if (id && !p) return html(adminPage('未找到', '<div class="card">产品不存在。</div>', 'products'), 404);
  const specs = p ? JSON.parse(p.specs_json || '[]') : [];
  const badges = p ? JSON.parse(p.badges_json || '[]') : [];
  const specRows = specs.map(([m, d], i) => `<div class="spec-row"><input type="text" name="spec_model" value="${esc(m)}" placeholder="型号，如 CXPF-20"><input type="text" name="spec_desc" value="${esc(d)}" placeholder="参数说明"><button class="btn sm gray" type="button" onclick="this.parentElement.remove()">删</button></div>`).join('');
  const body = `
<h1>${p ? '编辑产品' : '新增产品'}</h1>${flash(msg)}
<form method="post" action="/admin/products/save" enctype="multipart/form-data">
${p ? `<input type="hidden" name="id" value="${p.id}">` : ''}
<div class="card">
<div class="field-row">
  <div><label>产品名称（英文，含型号括注）</label><input type="text" name="name" value="${esc(p?.name || '')}" required></div>
  <div><label>网址别名（slug，自动生成可改）</label><input type="text" name="slug" value="${esc(p?.slug || '')}" placeholder="留空自动生成"></div>
</div>
<div class="field-row">
  <div><label>分类</label><select name="category">
    <option value="ww" ${p?.category === 'ww' ? 'selected' : ''}>废水处理设备</option>
    <option value="sl" ${p?.category === 'sl' ? 'selected' : ''}>固液分离设备</option>
    <option value="wi" ${p?.category === 'wi' ? 'selected' : ''}>焚烧设备</option>
  </select></div>
  <div><label>排序（越小越靠前）</label><input type="number" name="sort_order" value="${p?.sort_order ?? 100}"></div>
</div>
<label>一句话简介（英文，显示在卡片和标题下）</label><input type="text" name="short_desc" value="${esc(p?.short_desc || '')}">
<label>徽标（每行一个，如 CE Marked / Patent 2017…）</label><textarea name="badges" rows="2">${esc(badges.join('\n'))}</textarea>
<label>CE/认证补充说明（英文，可留空）</label><input type="text" name="ce_note" value="${esc(p?.ce_note || '')}">
</div>
<div class="card">
<label>产品主图</label>
${p?.image ? `<p><img class="thumb" style="width:180px;height:135px" src="${p.image.startsWith('r2:') ? '/media/' + p.image.slice(3) : '/' + p.image}"> <span class="muted">${esc(p.image)}</span></p>` : ''}
<input type="file" name="image" accept="image/jpeg,image/png,image/webp">
<p class="muted">只接受 jpg/png/webp，最大5MB。不上传则保持原图。</p>
<label>主图替代文字（英文 alt，可留空则自动用产品名）</label><input type="text" name="image_alt" value="${esc(p?.image_alt || '')}">
</div>
<div class="card">
<label>正文（英文，可视化编辑）</label>
<div class="editor-wrap"><div id="editor"></div></div>
<input type="hidden" name="body_html" id="body_html">
<label>规格表标题</label><input type="text" name="spec_title" value="${esc(p?.spec_title || 'Model examples')}">
<label>规格表（型号 + 参数）</label>
<div id="specs">${specRows}</div>
<p><button class="btn sm line" type="button" onclick="document.getElementById('specs').insertAdjacentHTML('beforeend','<div class=&quot;spec-row&quot;><input type=&quot;text&quot; name=&quot;spec_model&quot; placeholder=&quot;型号&quot;><input type=&quot;text&quot; name=&quot;spec_desc&quot; placeholder=&quot;参数说明&quot;><button class=&quot;btn sm gray&quot; type=&quot;button&quot; onclick=&quot;this.parentElement.remove()&quot;>删</button></div>')">+ 加一行</button></p>
<label>规格表下方备注（英文，可留空）</label><input type="text" name="spec_note" value="${esc(p?.spec_note || '')}">
</div>
<div class="card">
<label>状态</label><select name="status">
  <option value="on" ${p?.status !== 'off' ? 'selected' : ''}>上架（网站可见）</option>
  <option value="off" ${p?.status === 'off' ? 'selected' : ''}>下架（网站隐藏）</option>
</select>
<p style="margin-top:16px"><button class="btn">保存</button>
${p ? ` <a class="btn line" href="/product-${esc(p.slug)}" target="_blank">查看前台页面</a> <a class="btn line" href="/admin/products/${p.id}/i18n">编辑翻译</a>` : ''}</p>
</div>
</form>
<script>
${QUILL_INIT}
quill.root.innerHTML = ${JSON.stringify(p?.body_html || '')};
document.querySelector('form').addEventListener('submit', ()=>{ document.getElementById('body_html').value = quill.root.innerHTML; });
</script>`;
  return adminPage(p ? '编辑产品' : '新增产品', body, 'products', { quill: true });
}

export async function productSave(request, env) {
  const form = await request.formData();
  const id = String(form.get('id') || '');
  const name = String(form.get('name') || '').trim().slice(0, 200);
  if (!name) return redirect('/admin/products?msg=' + encodeURIComponent('名称不能为空'));
  let slug = slugify(String(form.get('slug') || '')) || slugify(name.replace(/\s*\([^)]*\)/g, ''));
  if (slug.startsWith('product-')) slug = slug.slice(8);
  const category = ['ww', 'sl', 'wi'].includes(form.get('category')) ? form.get('category') : 'ww';
  const badges = String(form.get('badges') || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6);
  const models = form.getAll('spec_model'), descs = form.getAll('spec_desc');
  const specs = models.map((m, i) => [String(m).trim().slice(0, 80), String(descs[i] || '').trim().slice(0, 300)])
    .filter(([m, d]) => m || d).slice(0, 60);
  // image upload (optional)
  let image;
  const file = form.get('image');
  if (file && typeof file === 'object' && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) return redirect('/admin/products?msg=' + encodeURIComponent('图片超过5MB'));
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return redirect('/admin/products?msg=' + encodeURIComponent('图片只接受jpg/png/webp'));
    if (env.MEDIA) {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.type];
      const key = 'product/' + crypto.randomUUID() + ext;
      await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      image = 'r2:' + key;
    }
  }
  const vals = {
    slug, category, name,
    short_desc: String(form.get('short_desc') || '').slice(0, 300),
    body_html: sanitizeHtml(String(form.get('body_html') || '')),
    spec_title: String(form.get('spec_title') || '').slice(0, 120),
    specs_json: JSON.stringify(specs),
    spec_note: String(form.get('spec_note') || '').slice(0, 300),
    badges_json: JSON.stringify(badges),
    ce_note: String(form.get('ce_note') || '').slice(0, 300),
    image_alt: String(form.get('image_alt') || '').slice(0, 200),
    status: form.get('status') === 'off' ? 'off' : 'on',
    sort_order: parseInt(form.get('sort_order')) || 100,
  };
  if (id) {
    const sets = Object.keys(vals).map(k => `${k} = ?`).join(', ');
    const binds = [...Object.values(vals)];
    let sql = `UPDATE products SET ${sets}, updated_at = datetime('now')`;
    if (image) { sql += ', image = ?'; binds.push(image); }
    sql += ' WHERE id = ?'; binds.push(id);
    try { await env.DB.prepare(sql).bind(...binds).run(); }
    catch (e) { return redirect('/admin/products?msg=' + encodeURIComponent('保存失败：别名可能重复')); }
  } else {
    const keys = Object.keys(vals).join(', ');
    const marks = Object.keys(vals).map(() => '?').join(',');
    const isTest = isTestMarker(vals.name);
    try {
      await env.DB.prepare(
        `INSERT INTO products (${keys}, image, is_test) VALUES (${marks}, ?, ?)`)
        .bind(...Object.values(vals), image || '', isTest ? 1 : 0).run();
    } catch (e) { return redirect('/admin/products?msg=' + encodeURIComponent('保存失败：别名可能重复')); }
  }
  return redirect('/admin/products?msg=' + encodeURIComponent('已保存'));
}

function isTestMarker(s) { return /\[test\]|test-/i.test(s || ''); }

/* ---------------- product translations (ru/es) ---------------- */

const I18N_LANGS = { ru: '俄语', es: '西班牙语' };

export async function productI18n(env, id, url, msg) {
  const p = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
  if (!p) return html(adminPage('未找到', '<div class="card">产品不存在。</div>', 'products'), 404);
  const lang = I18N_LANGS[url.searchParams.get('lang')] ? url.searchParams.get('lang') : 'ru';
  const t = await env.DB.prepare('SELECT * FROM product_i18n WHERE product_id=? AND lang=?').bind(id, lang).first();
  const specs = t?.specs_json ? JSON.parse(t.specs_json) : [];
  const specRows = specs.map(([m, d]) => `<div class="spec-row"><input type="text" name="spec_model" value="${esc(m)}" placeholder="型号，如 CXPF-20"><input type="text" name="spec_desc" value="${esc(d)}" placeholder="参数说明"><button class="btn sm gray" type="button" onclick="this.parentElement.remove()">删</button></div>`).join('');
  const tabs = Object.entries(I18N_LANGS).map(([code, label]) =>
    `<a class="btn sm ${code === lang ? '' : 'line'}" href="/admin/products/${p.id}/i18n?lang=${code}">${label}${code === lang ? '（编辑中）' : ''}</a>`).join(' ');
  const body = `
<h1>产品翻译：${esc(p.name)}</h1>${flash(msg)}
<div class="card"><p style="margin-bottom:10px">${tabs}</p>
<p class="muted">正在编辑 <b>${I18N_LANGS[lang]}</b> 版本。留空的字段会在前台自动回退到英文内容。保存后即时生效。</p>
<p class="muted">前台地址：<a href="/${lang}/product-${esc(p.slug)}" target="_blank">/${lang}/product-${esc(p.slug)}</a></p></div>
<form method="post" action="/admin/products/i18n/save">
<input type="hidden" name="product_id" value="${p.id}">
<input type="hidden" name="lang" value="${lang}">
<div class="card">
<label>产品名称（${I18N_LANGS[lang]}）</label><input type="text" name="name" value="${esc(t?.name || '')}" placeholder="${esc(p.name)}">
<label>一句话简介（${I18N_LANGS[lang]}）</label><input type="text" name="short_desc" value="${esc(t?.short_desc || '')}" placeholder="${esc(p.short_desc || '')}">
<label>主图替代文字（alt，${I18N_LANGS[lang]}）</label><input type="text" name="image_alt" value="${esc(t?.image_alt || '')}" placeholder="${esc(p.image_alt || p.name)}">
<label>CE/认证补充说明（${I18N_LANGS[lang]}，可留空）</label><input type="text" name="ce_note" value="${esc(t?.ce_note || '')}" placeholder="${esc(p.ce_note || '')}">
</div>
<div class="card">
<label>正文（${I18N_LANGS[lang]}，可视化编辑）</label>
<div class="editor-wrap"><div id="editor"></div></div>
<input type="hidden" name="body_html" id="body_html">
<label>规格表标题</label><input type="text" name="spec_title" value="${esc(t?.spec_title || '')}" placeholder="${esc(p.spec_title || 'Model examples')}">
<label>规格表（型号 + 参数）</label>
<div id="specs">${specRows}</div>
<p><button class="btn sm line" type="button" onclick="document.getElementById('specs').insertAdjacentHTML('beforeend','<div class=&quot;spec-row&quot;><input type=&quot;text&quot; name=&quot;spec_model&quot; placeholder=&quot;型号&quot;><input type=&quot;text&quot; name=&quot;spec_desc&quot; placeholder=&quot;参数说明&quot;><button class=&quot;btn sm gray&quot; type=&quot;button&quot; onclick=&quot;this.parentElement.remove()&quot;>删</button></div>')">+ 加一行</button></p>
<label>规格表下方备注（${I18N_LANGS[lang]}，可留空）</label><input type="text" name="spec_note" value="${esc(t?.spec_note || '')}" placeholder="${esc(p.spec_note || '')}">
</div>
<div class="card">
<p><button class="btn">保存翻译</button> <a class="btn line" href="/admin/products/${p.id}">返回产品编辑</a></p>
</div>
</form>
<script>
${QUILL_INIT}
quill.root.innerHTML = ${JSON.stringify(t?.body_html || p.body_html || '')};
document.querySelector('form').addEventListener('submit', ()=>{ document.getElementById('body_html').value = quill.root.innerHTML; });
</script>`;
  return adminPage('产品翻译', body, 'products', { quill: true });
}

export async function productI18nSave(request, env) {
  const form = await request.formData();
  const pid = String(form.get('product_id') || '');
  const lang = I18N_LANGS[form.get('lang')] ? String(form.get('lang')) : 'ru';
  const p = await env.DB.prepare('SELECT id FROM products WHERE id=?').bind(pid).first();
  if (!p) return redirect('/admin/products?msg=' + encodeURIComponent('产品不存在'));
  const models = form.getAll('spec_model'), descs = form.getAll('spec_desc');
  const specs = models.map((m, i) => [String(m).trim().slice(0, 80), String(descs[i] || '').trim().slice(0, 300)])
    .filter(([m, d]) => m || d).slice(0, 60);
  const vals = [
    String(form.get('name') || '').trim().slice(0, 200),
    String(form.get('short_desc') || '').slice(0, 300),
    sanitizeHtml(String(form.get('body_html') || '')),
    String(form.get('spec_title') || '').slice(0, 120),
    JSON.stringify(specs),
    String(form.get('spec_note') || '').slice(0, 300),
    String(form.get('ce_note') || '').slice(0, 300),
    String(form.get('image_alt') || '').slice(0, 200),
  ];
  await env.DB.prepare(
    `INSERT INTO product_i18n (product_id, lang, name, short_desc, body_html, spec_title, specs_json, spec_note, ce_note, image_alt, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now'))
     ON CONFLICT(product_id, lang) DO UPDATE SET
       name=excluded.name, short_desc=excluded.short_desc, body_html=excluded.body_html,
       spec_title=excluded.spec_title, specs_json=excluded.specs_json, spec_note=excluded.spec_note,
       ce_note=excluded.ce_note, image_alt=excluded.image_alt, updated_at=excluded.updated_at`)
    .bind(pid, lang, ...vals).run();
  return redirect(`/admin/products/${pid}/i18n?lang=${lang}&msg=` + encodeURIComponent('翻译已保存'));
}

// Allow a safe subset of tags from the rich-text editor.
export function sanitizeHtml(src) {
  let s = String(src || '');
  s = s.replace(/<\s*(script|style|iframe|object|embed|form|input|button|meta|link)[^>]*>.*?<\s*\/\s*\1\s*>/gis, '');
  s = s.replace(/<\s*(script|style|iframe|object|embed|form|input|button|meta|link)[^>]*\/?>/gis, '');
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  s = s.replace(/javascript\s*:/gi, '');
  return s.slice(0, 60000);
}

/* ---------------- blog ---------------- */

export async function blogList(env, url) {
  const showTest = url.searchParams.get('test') === '1';
  const rows = await env.DB.prepare(
    `SELECT * FROM posts ${showTest ? '' : 'WHERE is_test = 0'} ORDER BY COALESCE(published_at, created_at) DESC`).all();
  const trs = rows.results.map(p => `<tr>
<td><b>${esc(p.title)}</b><br><span class="muted">/blog-${esc(p.slug)}</span></td>
<td>${statusTag(p.status)}${p.is_test ? ' <span class="tag gray">测试</span>' : ''}</td>
<td class="muted">${esc(p.published_at || p.created_at)}</td>
<td>
  <a class="btn sm line" href="/admin/blog/${p.id}">编辑</a>
  ${p.status === 'published' ? `<a class="btn sm gray" href="/blog-${esc(p.slug)}" target="_blank">查看</a>` : ''}
  <form method="post" action="/admin/blog/delete" style="display:inline" onsubmit="return confirm('确定删除？')"><input type="hidden" name="id" value="${p.id}"><button class="btn sm gray">删除</button></form>
</td></tr>`).join('');
  return adminPage('博客管理', `
<div class="bar"><h1 style="margin:0">博客管理</h1><span class="sp"></span>
<a class="btn line sm" href="/admin/blog${showTest ? '' : '?test=1'}">${showTest ? '隐藏测试数据' : '显示测试数据'}</a>
<a class="btn" href="/admin/blog/new">+ 写文章</a></div>
<div class="card"><table>
<tr><th>标题 / 地址</th><th>状态</th><th>发布时间</th><th>操作</th></tr>
${trs || '<tr><td colspan="4" class="muted">还没有文章</td></tr>'}</table></div>`, 'blog');
}

export async function postEdit(env, id, msg) {
  const p = id ? await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first() : null;
  if (id && !p) return html(adminPage('未找到', '<div class="card">文章不存在。</div>', 'blog'), 404);
  const body = `
<h1>${p ? '编辑文章' : '写文章'}</h1>${flash(msg)}
<form method="post" action="/admin/blog/save" enctype="multipart/form-data">
${p ? `<input type="hidden" name="id" value="${p.id}">` : ''}
<div class="card">
<label>标题（英文）</label><input type="text" name="title" value="${esc(p?.title || '')}" required>
<div class="field-row">
  <div><label>网址别名（slug，留空自动生成）</label><input type="text" name="slug" value="${esc(p?.slug || '')}"></div>
  <div><label>状态</label><select name="status">
    <option value="draft" ${p?.status !== 'published' ? 'selected' : ''}>草稿（网站不可见）</option>
    <option value="published" ${p?.status === 'published' ? 'selected' : ''}>发布</option>
  </select></div>
</div>
<label>摘要（英文，显示在列表和首页）</label><textarea name="excerpt" rows="2">${esc(p?.excerpt || '')}</textarea>
<div class="field-row">
  <div><label>文末产品按钮文字（英文，可留空）</label><input type="text" name="extra_cta_label" value="${esc(p?.extra_cta_label || '')}" placeholder="如 Compare the DAF models"></div>
  <div><label>文末产品按钮链接</label><input type="text" name="extra_cta_href" value="${esc(p?.extra_cta_href || '')}" placeholder="/product-xxx"></div>
</div>
<label>封面图</label>
${p?.cover_image ? `<p><img class="thumb" style="width:180px;height:auto" src="${p.cover_image.startsWith('r2:') ? '/media/' + p.cover_image.slice(3) : '/' + p.cover_image}"></p>` : ''}
<input type="file" name="cover" accept="image/jpeg,image/png,image/webp">
<p class="muted">只接受 jpg/png/webp，最大5MB。正文插图用编辑器工具栏的图片按钮。</p>
</div>
<div class="card">
<label>正文</label>
<div class="editor-wrap"><div id="editor"></div></div>
<input type="hidden" name="body_html" id="body_html">
</div>
<p><button class="btn">保存</button>
${p?.status === 'published' ? ` <a class="btn line" href="/blog-${esc(p.slug)}" target="_blank">查看前台页面</a>` : ''}
${p && p.status !== 'published' ? ` <a class="btn line" href="/admin/blog/${p.id}/preview" target="_blank">预览草稿</a>` : ''}</p>
</form>
<script>
${QUILL_INIT}
quill.root.innerHTML = ${JSON.stringify(p?.body_html || '')};
document.querySelector('form').addEventListener('submit', ()=>{ document.getElementById('body_html').value = quill.root.innerHTML; });
</script>`;
  return adminPage(p ? '编辑文章' : '写文章', body, 'blog', { quill: true });
}

export async function postSave(request, env) {
  const form = await request.formData();
  const id = String(form.get('id') || '');
  const title = String(form.get('title') || '').trim().slice(0, 200);
  if (!title) return redirect('/admin/blog?msg=' + encodeURIComponent('标题不能为空'));
  const slug = slugify(String(form.get('slug') || '')) || slugify(title);
  const status = form.get('status') === 'published' ? 'published' : 'draft';
  let cover;
  const file = form.get('cover');
  if (file && typeof file === 'object' && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) return redirect('/admin/blog?msg=' + encodeURIComponent('图片超过5MB'));
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return redirect('/admin/blog?msg=' + encodeURIComponent('图片只接受jpg/png/webp'));
    if (env.MEDIA) {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.type];
      const key = 'blog/' + crypto.randomUUID() + ext;
      await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      cover = 'r2:' + key;
    }
  }
  const extraHref = String(form.get('extra_cta_href') || '').slice(0, 200);
  const vals = {
    slug, title,
    excerpt: String(form.get('excerpt') || '').slice(0, 500),
    body_html: sanitizeHtml(String(form.get('body_html') || '')),
    extra_cta_label: String(form.get('extra_cta_label') || '').slice(0, 120),
    extra_cta_href: /^(\/|https?:\/\/)/.test(extraHref) ? extraHref : '',
    status,
  };
  if (id) {
    const old = await env.DB.prepare('SELECT published_at FROM posts WHERE id = ?').bind(id).first();
    const sets = Object.keys(vals).map(k => `${k} = ?`).join(', ');
    const binds = [...Object.values(vals)];
    let sql = `UPDATE posts SET ${sets}, updated_at = datetime('now')`;
    if (cover) { sql += ', cover_image = ?'; binds.push(cover); }
    if (status === 'published' && !old?.published_at) { sql += ", published_at = datetime('now')"; }
    sql += ' WHERE id = ?'; binds.push(id);
    try { await env.DB.prepare(sql).bind(...binds).run(); }
    catch { return redirect('/admin/blog?msg=' + encodeURIComponent('保存失败：别名重复')); }
    return redirect('/admin/blog/' + id + '?msg=' + encodeURIComponent('已保存'));
  }
  const keys = Object.keys(vals).join(', ');
  const marks = Object.keys(vals).map(() => '?').join(',');
  const isTest = isTestMarker(title);
  try {
    const r = await env.DB.prepare(
      `INSERT INTO posts (${keys}, cover_image, is_test${status === 'published' ? ", published_at" : ''})
       VALUES (${marks}, ?, ?${status === 'published' ? ", datetime('now')" : ''})`)
      .bind(...Object.values(vals), cover || '', isTest ? 1 : 0).run();
    return redirect('/admin/blog/' + r.meta.last_row_id + '?msg=' + encodeURIComponent('已保存'));
  } catch { return redirect('/admin/blog?msg=' + encodeURIComponent('保存失败：别名重复')); }
}

/* ---------------- inquiries ---------------- */

export async function inquiryList(env, url) {
  const showTest = url.searchParams.get('test') === '1';
  const status = url.searchParams.get('status') || '';
  let sql = 'SELECT * FROM inquiries';
  const conds = [], binds = [];
  if (!showTest) conds.push('is_test = 0');
  if (status) { conds.push('status = ?'); binds.push(status); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY id DESC LIMIT 300';
  const rows = await env.DB.prepare(sql).bind(...binds).all();
  const trs = rows.results.map(i => `<tr>
<td class="muted">${esc(i.created_at)}</td>
<td><b>${esc(i.name)}</b>${i.is_test ? ' <span class="tag gray">测试</span>' : ''}</td>
<td>${esc(i.email)}<br>${esc(i.whatsapp)}</td>
<td>${esc(i.country)}</td>
<td>${esc(i.equip_type || i.subject)}</td>
<td>${statusTag(i.status)}<br>${i.email_status === 'failed' ? '<span class="tag red">邮件未送达</span>' : i.email_status === 'sent' ? '<span class="tag green">已通知</span>' : ''}</td>
<td><a href="/admin/inquiries/${i.id}">查看</a></td></tr>`).join('');
  return adminPage('询盘管理', `
<div class="bar"><h1 style="margin:0">询盘管理</h1><span class="sp"></span>
<a class="btn line sm" href="/admin/inquiries?status=new">待处理</a>
<a class="btn line sm" href="/admin/inquiries?status=following">跟进中</a>
<a class="btn line sm" href="/admin/inquiries?status=done">已处理</a>
<a class="btn line sm" href="/admin/inquiries">全部</a>
<a class="btn line sm" href="/admin/inquiries${showTest ? '' : '?test=1'}">${showTest ? '隐藏测试数据' : '显示测试数据'}</a>
</div>
<div class="card"><table>
<tr><th>时间(UTC)</th><th>联系人</th><th>邮箱 / WhatsApp</th><th>国家</th><th>意向</th><th>状态</th><th></th></tr>
${trs || '<tr><td colspan="7" class="muted">暂无询盘</td></tr>'}</table></div>`, 'inquiries');
}

export async function inquiryDetail(env, id, msg) {
  const i = await env.DB.prepare('SELECT * FROM inquiries WHERE id = ?').bind(id).first();
  if (!i) return html(adminPage('未找到', '<div class="card">询盘不存在。</div>', 'inquiries'), 404);
  const fields = JSON.parse(i.fields_json || '{}');
  const frows = Object.entries(fields).map(([k, v]) =>
    `<tr><th style="width:180px">${esc(k)}</th><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('');
  return adminPage('询盘详情', `
<h1>询盘 #${i.id} ${i.is_test ? '<span class="tag gray">测试</span>' : ''}</h1>${flash(msg)}
<div class="card">
<table>
<tr><th style="width:180px">提交时间(UTC)</th><td>${esc(i.created_at)}</td></tr>
<tr><th>来源页面</th><td>${esc(i.page)}</td></tr>
<tr><th>邮件通知</th><td>${i.email_status === 'sent' ? '<span class="tag green">已发送到 steffy@huayienviron.com</span>' : i.email_status === 'failed' ? '<span class="tag red">发送失败（记录已保存，请直接联系客户）</span>' : '<span class="tag gray">未配置</span>'}</td></tr>
<tr><th>附件</th><td>${i.attachment_key ? `<a href="/file/${esc(i.attachment_key)}">${esc(i.attachment_name || '下载附件')}</a>` : '无'}</td></tr>
</table>
<h2>表单内容</h2>
<table>${frows}</table>
</div>
<div class="card">
<form method="post" action="/admin/inquiries/update">
<input type="hidden" name="id" value="${i.id}">
<label>状态</label><select name="status">
  <option value="new" ${i.status === 'new' ? 'selected' : ''}>待处理</option>
  <option value="following" ${i.status === 'following' ? 'selected' : ''}>跟进中</option>
  <option value="done" ${i.status === 'done' ? 'selected' : ''}>已处理</option>
</select>
<label>跟进备注（内部可见）</label><textarea name="notes">${esc(i.notes)}</textarea>
<p style="margin-top:14px"><button class="btn">保存</button></p>
</form>
</div>`, 'inquiries');
}

/* ---------------- analytics ---------------- */

export async function analyticsPage(env) {
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
    SELECT CASE WHEN referrer='' THEN '(直接访问)' ELSE referrer END r, COUNT(*) c FROM page_views
    WHERE ts > datetime('now','-30 days') AND bot_type='human' AND is_test=0
    GROUP BY r ORDER BY c DESC LIMIT 10`).all();
  const topCountry = await env.DB.prepare(`
    SELECT CASE WHEN country='' THEN '(未知)' ELSE country END co, COUNT(*) c FROM page_views
    WHERE ts > datetime('now','-30 days') AND bot_type='human' AND is_test=0
    GROUP BY co ORDER BY c DESC LIMIT 15`).all();
  const t = (rows) => rows.map(([label, c]) =>
    `<tr><td>${esc(label)}</td><td><b>${c}</b></td></tr>`).join('');
  return adminPage('访客统计', `
<h1>访客统计（近30天）</h1>
<div class="card">
<p class="muted">说明：这里统计的是<b>页面浏览量</b>（同一访客多次访问会重复计数），不是独立访客人数。
真人/机器人按浏览器自报身份（User-Agent）区分：自报家门的搜索引擎单列；伪装成普通浏览器的机器人无法识别，
数字只作趋势参考。不记录 IP，地区只到国家级（由 Cloudflare 网络层提供）。数据保留12个月后自动清除。</p>
</div>
<div class="card"><h2 style="margin-top:0">按天统计</h2>
<table><tr><th>日期</th><th>真人浏览量</th><th>搜索引擎</th><th>其他机器人</th></tr>
${days.results.map(r => `<tr><td>${esc(r.d)}</td><td><b>${r.human}</b></td><td>${r.se}</td><td>${r.bot}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">暂无数据</td></tr>'}
</table></div>
<div class="card"><h2 style="margin-top:0">热门页面（真人）</h2>
<table><tr><th>页面</th><th>浏览量</th></tr>${t(topPages.results.map(r => [r.path, r.c])) || '<tr><td colspan="2" class="muted">暂无</td></tr>'}</table></div>
<div class="card"><h2 style="margin-top:0">来源（真人）</h2>
<table><tr><th>来源</th><th>次数</th></tr>${t(topRef.results.map(r => [r.r, r.c])) || '<tr><td colspan="2" class="muted">暂无</td></tr>'}</table></div>
<div class="card"><h2 style="margin-top:0">国家/地区（真人）</h2>
<table><tr><th>国家代码</th><th>浏览量</th></tr>${t(topCountry.results.map(r => [r.co, r.c])) || '<tr><td colspan="2" class="muted">暂无</td></tr>'}</table></div>
`, 'analytics');
}

/* ---------------- settings / backup ---------------- */

export async function settingsPage(env, admin, msg) {
  const admins = await env.DB.prepare('SELECT id, username, created_at FROM admins').all();
  const arows = admins.results.map(a => `<tr><td>${esc(a.username)}</td><td class="muted">${esc(a.created_at)}</td>
<td>${admins.results.length > 1 && a.id !== admin.id
  ? `<form method="post" action="/admin/settings/del-admin" style="display:inline" onsubmit="return confirm('删除该管理员？')"><input type="hidden" name="id" value="${a.id}"><button class="btn sm gray">删除</button></form>`
  : '<span class="muted">（当前/唯一）</span>'}</td></tr>`).join('');
  return adminPage('设置', `
<h1>设置</h1>${flash(msg)}
<div class="card"><h2 style="margin-top:0">修改我的密码</h2>
<form method="post" action="/admin/settings/password">
<label>当前密码</label><input type="password" name="old" required autocomplete="current-password">
<label>新密码（至少10位，含字母和数字）</label><input type="password" name="p1" required minlength="10" autocomplete="new-password">
<label>确认新密码</label><input type="password" name="p2" required minlength="10" autocomplete="new-password">
<p style="margin-top:12px"><button class="btn">修改密码</button></p></form></div>
<div class="card"><h2 style="margin-top:0">管理员账号</h2>
<table><tr><th>用户名</th><th>创建时间</th><th></th></tr>${arows}</table>
<details><summary>添加管理员</summary>
<form method="post" action="/admin/settings/add-admin">
<label>用户名</label><input type="text" name="username" required>
<label>密码（至少10位，含字母和数字）</label><input type="password" name="password" required minlength="10" autocomplete="new-password">
<p style="margin-top:12px"><button class="btn">添加</button></p></form></details></div>
<div class="card"><h2 style="margin-top:0">备份</h2>
<p class="muted">下载数据库完整备份（SQL 文件，含产品、博客、询盘、访客记录）。附件文件存于 Cloudflare R2，恢复方法见使用说明。</p>
<p><a class="btn" href="/admin/backup">下载数据库备份</a></p></div>
<div class="card"><h2 style="margin-top:0">测试数据</h2>
<p class="muted">名称/内容中带 [TEST] 或 TEST- 标记的记录会被自动标记为测试数据。此操作删除所有测试标记的产品、博客、询盘和访客记录。</p>
<form method="post" action="/admin/settings/clear-test" onsubmit="return confirm('确定删除所有测试数据？')">
<button class="btn gray">清除全部测试数据</button></form></div>
`, 'settings');
}

export async function backupSql(env) {
  const tables = ['products', 'posts', 'inquiries', 'page_views', 'admins'];
  let out = `-- Huayi CMS backup ${new Date().toISOString()}\n`;
  for (const t of tables) {
    const rows = await env.DB.prepare(`SELECT * FROM ${t}`).all();
    for (const r of rows.results) {
      const cols = Object.keys(r).join(', ');
      const vals = Object.values(r).map(v =>
        v === null ? 'NULL' : typeof v === 'number' ? v : "'" + String(v).replace(/'/g, "''") + "'").join(', ');
      out += `INSERT INTO ${t} (${cols}) VALUES (${vals});\n`;
    }
  }
  return new Response(out, {
    headers: {
      'content-type': 'application/sql; charset=utf-8',
      'content-disposition': `attachment; filename="huayi-cms-backup-${new Date().toISOString().slice(0, 10)}.sql"`,
    },
  });
}
