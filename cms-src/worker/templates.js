// Public page templates. Static chunks come from the confirmed pages (chunks.js);
// only the dynamic regions are assembled from the database.
// Multilingual: English at /, Russian at /ru/, Spanish at /es/.
// Translated chunks/strings live in chunks-i18n.js; product copy comes from product_i18n.
import { HEADER, FOOTER, FONTS, CTA, INDEX_PART1, INDEX_PRODUCTS, INDEX_PART2A, INDEX_PART2B,
         PRODUCTS_PRE, PRODUCTS_POST, CATS, BLOG_PRE, BLOG_POST } from './chunks.js';
import { HEADER_I18N, FOOTER_I18N, CTA_I18N, HOME_P1, HOME_PRODUCTS, HOME_P2A, HOME_P2B,
         PRODUCTS_PRE_T, PRODUCTS_POST_T, CATS_T, CAT_INFO_T, STRINGS, META_T, I18N_MSG } from './chunks-i18n.js';
import { esc } from './util.js';

const SITE = 'https://www.huayienviron.com';
export const LANGS = ['en', 'ru', 'es'];

export function prefix(lang, p) {
  if (lang === 'en') return p;
  return '/' + lang + (p === '/' ? '/' : p);
}
// canonical English path for a localized path ("/ru/products" -> "/products")
function enPathOf(lang, path) {
  if (lang === 'en') return path;
  const s = path.slice(3); // strip "/ru" | "/es"
  return s === '' || s === '/' ? '/' : s;
}

function switcher(lang, enPath, translated = true) {
  const st = "font:600 12px 'IBM Plex Mono',monospace;letter-spacing:.08em;white-space:nowrap";
  const sep = '<span style="color:#555;margin:0 7px">·</span>';
  const tgt = (l) => {
    if (l === 'en') return enPath;
    if (!translated) return `/${l}/`;
    return `/${l}` + (enPath === '/' ? '/' : enPath);
  };
  const parts = [['en', 'EN'], ['ru', 'РУ'], ['es', 'ES']].map(([code, label]) =>
    code === lang
      ? `<b style="color:#fff;font-weight:700">${label}</b>`
      : `<a href="${tgt(code)}" hreflang="${code}" lang="${code}" style="color:#9a9a9a;text-decoration:none">${label}</a>`);
  return `<span class="lang-switch" style="${st}">${parts.join(sep)}</span>`;
}

function headerFor(lang, enPath, translated) {
  if (lang === 'en') {
    return HEADER.replace('  <a class="head-cta"', `  ${switcher('en', enPath, translated)}\n  <a class="head-cta"`);
  }
  return HEADER_I18N[lang].replace('__SWITCH__', switcher(lang, enPath, translated));
}
function footerFor(lang) { return lang === 'en' ? FOOTER : FOOTER_I18N[lang]; }

export function layout({ title, desc, path, body, initJs = '', lang = 'en', alternates = true }) {
  const enPath = enPathOf(lang, path);
  const alt = alternates
    ? LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${SITE}${prefix(l, enPath)}">`).join('\n') +
      `\n<link rel="alternate" hreflang="x-default" href="${SITE}${enPath}">`
    : '';
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
<script src="/assets/site.js"></script>
${initJs ? `<script>${initJs}</script>` : ''}
</body>
</html>`;
}

function imgSrc(image) {
  if (!image) return '';
  return image.startsWith('r2:') ? '/media/' + image.slice(3) : '/' + image;
}

const S = (lang) => STRINGS[lang] || null;
function catName(lang, cat) {
  return lang === 'en' ? CAT_INFO[cat].name : CAT_INFO_T[lang][cat].name;
}

function productCard(p, lang) {
  const learn = lang === 'en' ? 'Learn more' : S(lang).learn_more;
  return `<a class="c-card" href="${prefix(lang, '/product-' + esc(p.slug))}"><div class="c-img"><img src="${esc(imgSrc(p.image))}" alt="${esc(p.image_alt || p.name)}" loading="lazy"></div><div class="c-body"><h3>${esc(p.name)}</h3><p>${esc(p.short_desc)}</p><span class="go">${learn}</span></div></a>`;
}

const CAT_INFO = {
  ww: { slug: 'wastewater-treatment', name: 'Wastewater Treatment Equipment',
        img: 'assets/prod-cxpf.jpg',
        blurb: 'DAF units, integrated sewage plants (CXWSZ/CXMBR), dosing units, lamella tanks, screens and scrapers.' },
  sl: { slug: 'solid-liquid-separation', name: 'Solid-Liquid Separation Equipment',
        img: 'assets/prod-cxdl.jpg',
        blurb: 'Belt filter presses, screw presses, chamber presses, manure dewatering machines, vacuum filters.' },
  wi: { slug: 'waste-incineration', name: 'Waste Incineration Equipment',
        img: 'assets/prod-cxwsl.jpg', sub: 'CXWSL series',
        blurb: 'CXWSL series incinerators built to local emission rules.' },
};

export function homePage(posts, lang = 'en') {
  // Featured-products section is curated editorial copy (custom short names/descriptions
  // that differ from catalog names), so it stays a fixed chunk from the confirmed homepage.
  const readMore = lang === 'en' ? 'Read more' : S(lang).read_more;
  const teasers = posts.map(p =>
    `<article class="post"><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p><a class="text-link" href="/blog-${esc(p.slug)}">${readMore}</a></article>`).join('');
  let body, title, desc, initJs;
  if (lang === 'en') {
    body = INDEX_PART1 + INDEX_PRODUCTS + INDEX_PART2A + teasers + INDEX_PART2B;
    title = 'Innovation Huayi Environmental Engineering | Wastewater Treatment & Solid-Liquid Separation Equipment';
    desc = 'Wastewater treatment and solid-liquid separation equipment manufacturer. 17+ years, 39,656 m² workshop, exported to 50+ countries.';
    initJs = "wireDemoForm('inqForm','inqNote','Website inquiry (homepage)');";
  } else {
    body = HOME_P1[lang] + HOME_PRODUCTS[lang] + HOME_P2A[lang] + teasers + HOME_P2B[lang];
    title = META_T[lang].home.title;
    desc = META_T[lang].home.desc;
    initJs = `window.I18N_MSG=${JSON.stringify(I18N_MSG[lang])};wireDemoForm('inqForm','inqNote','Website inquiry (homepage, ${lang})');`;
  }
  return layout({ title, desc, path: prefix(lang, '/'), body, initJs, lang });
}

export function productsPage(counts, lang = 'en') {
  let cards, body, title, desc;
  if (lang === 'en') {
    cards = Object.values(CAT_INFO).map(c =>
      `<a class="c-card" href="/products-${c.slug}">
      <div class="c-img"><img src="/${c.img}" alt="${esc(c.name)}" loading="lazy"></div>
      <div class="c-body"><div class="c-sub">${c.sub || `${counts[c.slug] || 0} product line${(counts[c.slug] || 0) === 1 ? '' : 's'}`}</div><h3>${esc(c.name)}</h3>
      <p>${esc(c.blurb)}</p><span class="go">Browse</span></div></a>`).join('\n    ');
    body = PRODUCTS_PRE + `<div class="card-grid">
    ${cards}
  </div>
  ` + PRODUCTS_POST;
    title = 'Products | Innovation Huayi Environmental Engineering';
    desc = 'Wastewater treatment, sludge dewatering and waste incineration equipment designed and manufactured in Zhucheng, Shandong.';
  } else {
    const t = STRINGS[lang];
    cards = ['ww', 'sl', 'wi'].map(cat => {
      const ci = CAT_INFO_T[lang][cat];
      const slug = CAT_INFO[cat].slug;
      const n = counts[slug] || 0;
      let sub = ci.sub;
      if (!sub) {
        sub = lang === 'es'
          ? `${n} ${n === 1 ? 'línea de productos' : 'líneas de productos'}`
          : `${n} ${pluralRu(n)}`;
      }
      return `<a class="c-card" href="${prefix(lang, '/products-' + slug)}">
      <div class="c-img"><img src="/${CAT_INFO[cat].img}" alt="${esc(ci.name)}" loading="lazy"></div>
      <div class="c-body"><div class="c-sub">${esc(sub)}</div><h3>${esc(ci.name)}</h3>
      <p>${esc(ci.blurb)}</p><span class="go">${t.view}</span></div></a>`;
    }).join('\n    ');
    body = PRODUCTS_PRE_T[lang] + `<div class="card-grid">
    ${cards}
  </div>
  ` + PRODUCTS_POST_T[lang];
    title = META_T[lang].products.title;
    desc = META_T[lang].products.desc;
  }
  return layout({ title, desc, path: prefix(lang, '/products'), body, lang });
}

function pluralRu(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'линия продукции';
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return 'линии продукции';
  return 'линий продукции';
}

export function categoryPage(catSlug, products, lang = 'en') {
  const info = Object.values(CAT_INFO).find(c => c.slug === catSlug);
  const hero = lang === 'en' ? CATS[catSlug] : CATS_T[lang][catSlug];
  const empty = lang === 'en'
    ? '<p style="color:#666">No products listed in this category at the moment.</p>'
    : `<p style="color:#666">${esc(S(lang).no_products)}</p>`;
  const grid = products.length
    ? products.map(p => productCard(p, lang)).join('')
    : empty;
  const body = `<main>

<div class="wrap">
  ${hero}</div>
  <div class="card-grid" style="margin-bottom:56px">${grid}</div>

</div>
${lang === 'en' ? CTA : CTA_I18N[lang]}
</main>`;
  const title = lang === 'en'
    ? `${info.name} | Innovation Huayi Environmental Engineering`
    : META_T[lang][catSlug].title;
  const desc = lang === 'en' ? info.blurb : META_T[lang][catSlug].desc;
  return layout({ title, desc, path: prefix(lang, `/products-${catSlug}`), body, lang });
}

export function productPage(p, related, lang = 'en') {
  const catSlug = CATS_SLUG(p.category);
  const badges = JSON.parse(p.badges_json || '[]');
  const specs = JSON.parse(p.specs_json || '[]');
  const specRows = specs.map(([m, d]) => `<tr><th>${esc(m)}</th><td>${esc(d)}</td></tr>`).join('');
  const t = lang === 'en' ? null : S(lang);
  const cName = catName(lang, p.category);
  const sHome = t ? t.home : 'Home';
  const sProducts = t ? t.products : 'Products';
  const sProposal = t ? t.get_proposal : 'Get a proposal';
  const sSpec = p.spec_title || (t ? t.spec_default : 'Model examples');
  const moreIn = t ? `${t.more_in} ${cName}` : `More in ${cName}`;
  const sView = t ? t.view : 'View';
  const body = `<main>

<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${prefix(lang, '/')}">${sHome}</a><span>/</span><a href="${prefix(lang, '/products')}">${sProducts}</a><span>/</span><a href="${prefix(lang, '/products-' + catSlug)}">${esc(cName)}</a><span>/</span><b>${esc(p.name)}</b></nav>
  <div class="page-hero">
    <div class="eyebrow">${esc(cName)}</div>
    <h1>${esc(p.name)}</h1>
    <p class="lede">${esc(p.short_desc)}</p>
  </div>
  <div class="split" style="margin-bottom:56px">
    <div class="media">${p.image ? `<img class="ph-card" style="aspect-ratio:4/3" src="${esc(imgSrc(p.image))}" alt="${esc(p.image_alt || p.name)}" loading="lazy">` : ''}</div>
    <div>
      ${badges.length ? `<div style="margin-bottom:14px">${badges.map(b => `<span class="badge${/ce/i.test(b) ? ' ce' : ''}">${esc(b)}</span>`).join('')}</div>` : ''}
      ${p.ce_note ? `<p style="font-size:13px;color:#666">${esc(p.ce_note)}</p>` : ''}
      <div class="prose">${p.body_html}</div>
      ${specRows ? `<h2>${esc(sSpec)}</h2><table class="spec">${specRows}</table>` : ''}
      ${p.spec_note ? `<p style="font-size:13px;color:#666">${esc(p.spec_note)}</p>` : ''}
      <a class="btn" href="${prefix(lang, '/get-a-solution')}">${sProposal}</a>
    </div>
  </div>
</div>
${lang === 'en' ? CTA : CTA_I18N[lang]}
${related.length ? `<div class="wrap sect">
  <h2 class="sect-head2"><span class="n">→</span>${esc(moreIn)}</h2>
  <div class="card-grid">${related.map(r => `<a class="c-card" href="${prefix(lang, '/product-' + esc(r.slug))}"><div class="c-body"><h3>${esc(r.name)}</h3><p>${esc(r.short_desc)}</p><span class="go">${sView}</span></div></a>`).join('')}</div>
</div>` : ''}
</main>`;
  return layout({
    title: `${p.name} ${t ? '| Innovation Huayi' : '| Innovation Huayi Environmental Engineering'}`,
    desc: p.short_desc,
    path: prefix(lang, `/product-${p.slug}`),
    body,
    lang,
  });
}

function CATS_SLUG(c) { return CAT_INFO[c] ? CAT_INFO[c].slug : 'wastewater-treatment'; }

export function blogListPage(posts) {
  const list = posts.length
    ? posts.map(p => `<article class="post">
  <h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p>
  <a class="text-link" href="/blog-${esc(p.slug)}">Read more</a>
</article>`).join('')
    : '<p style="color:#666">No articles published yet.</p>';
  const body = BLOG_PRE + `<div class="posts post-list" style="grid-template-columns:1fr;max-width:820px;margin-bottom:60px">${list}</div>` + BLOG_POST;
  return layout({
    title: 'Blog | Innovation Huayi Environmental Engineering',
    desc: 'Equipment guides and selection notes for wastewater treatment and sludge dewatering.',
    path: '/blog',
    body,
    alternates: false,
  });
}

export function blogPostPage(p, morePosts = []) {
  const more = morePosts.length ? `<div class="wrap sect">
  <h2 class="sect-head2"><span class="n">→</span>More articles</h2>
  <div class="card-grid cols2">${morePosts.map(m => `<a class="c-card" href="/blog-${esc(m.slug)}"><div class="c-body"><h3>${esc(m.title)}</h3><span class="go">Read</span></div></a>`).join('')}</div>
</div>` : '';
  const body = `<main>

<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/blog">Blog</a><span>/</span><b>${esc(p.title)}</b></nav>
  <div class="page-hero" style="border-bottom:0;margin-bottom:0;padding-bottom:0">
    <div class="eyebrow">Blog</div>
    <h1>${esc(p.title)}</h1>
  </div>
  ${p.cover_image ? `<div class="post-hero"><img src="${esc(imgSrc(p.cover_image))}" alt="${esc(p.title)}"></div>` : ''}
  <div class="prose" style="margin-bottom:30px">${p.body_html}</div>
  <p style="margin-bottom:60px">${p.extra_cta_label && p.extra_cta_href ? `<a class="btn" href="${esc(p.extra_cta_href)}">${esc(p.extra_cta_label)}</a>\n  ` : ''}<a class="btn ghost" style="border-color:var(--ink);color:var(--ink)" href="/get-a-solution">Get a proposal</a></p>
</div>
${CTA}
${more}
</main>`;
  return layout({
    title: `${p.title} | Innovation Huayi Environmental Engineering`,
    desc: p.excerpt,
    path: `/blog-${p.slug}`,
    body,
    alternates: false,
  });
}

export function sitemapXml(products, posts) {
  // pages that exist in all three languages
  const i18nPages = ['', 'products', 'products-wastewater-treatment', 'products-solid-liquid-separation',
    'products-waste-incineration', 'get-a-solution', 'contact-us'];
  const enOnlyPages = ['services', 'case-studies', 'incineration-project-guide',
    'factory', 'certifications', 'oem-odm', 'catalog', 'shipping-payment', 'about-us',
    'faq', 'blog', 'privacy-policy', 'terms-of-use', 'cookie-policy'];
  const langs = [['en', ''], ['ru', '/ru'], ['es', '/es']];
  const altLinks = (enP) => langs.map(([code, pre]) =>
    `    <xhtml:link rel="alternate" hreflang="${code}" href="${SITE}${pre}${enP}"/>`).join('\n') +
    `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${enP}"/>`;
  const urls = [];
  const pushI18n = (enP) => {
    for (const [, pre] of langs) {
      urls.push(`  <url>\n    <loc>${SITE}${pre}${enP}</loc>\n${altLinks(enP)}\n  </url>`);
    }
  };
  for (const p of i18nPages) pushI18n(p ? `/${p}` : '/');
  for (const p of products) pushI18n(`/product-${esc(p.slug)}`);
  for (const p of enOnlyPages) urls.push(`  <url><loc>${SITE}/${p}</loc></url>`);
  for (const b of posts) urls.push(`  <url><loc>${SITE}/blog-${esc(b.slug)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>`;
}
