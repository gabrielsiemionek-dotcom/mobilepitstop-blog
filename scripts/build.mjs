#!/usr/bin/env node
// Build the static blog into dist/ from content/posts/<slug>/ (post.json + body.html + images).
// Only posts with "status": "published" (and a publish date that has arrived) go live.
// INCLUDE_DRAFTS=1 builds drafts too, for previews.

import { mkdir, readFile, writeFile, readdir, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = path.join(ROOT, 'content', 'posts');
const INCLUDE_DRAFTS = process.env.INCLUDE_DRAFTS === '1';
const REDIRECTS_FILE = path.join(ROOT, 'content', 'redirects.json');
const OUT = path.join(ROOT, 'dist');

const SITE = config.siteUrl.replace(/\/+$/, '');

// Google Tag Manager + cookie banner only on the real live site: never in drafts, previews or local builds,
// so test pages don't end up in Google Analytics.
const TRACKING =
  Boolean(config.gtmId) && !INCLUDE_DRAFTS && process.env.NO_TRACKING !== '1' && SITE === 'https://blog.mobilepitstop.uk';
const TRACKING_HEAD = TRACKING
  ? (await readFile(path.join(ROOT, 'partials', 'consent-head.html'), 'utf8')).replace('{{GTM_ID}}', config.gtmId)
  : '';
const TRACKING_BODY = TRACKING ? await readFile(path.join(ROOT, 'partials', 'consent-banner.html'), 'utf8') : '';
const DEFAULT_LANG = config.defaultLanguage.toLowerCase();
const YEAR = new Date().getFullYear();

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const css = await readFile(path.join(ROOT, 'assets', 'blog.css'), 'utf8');
const cssHref = `/assets/blog.css?v=${createHash('sha1').update(css).digest('hex').slice(0, 10)}`;
await out('assets/blog.css', css);
for (const f of await readdir(path.join(ROOT, 'assets'))) {
  if (f !== 'blog.css') await copyFile(path.join(ROOT, 'assets', f), path.join(OUT, 'assets', f));
}

const articles = await loadArticles();
const byLang = groupBy(articles, (a) => a.langDir);
const langDirs = [...byLang.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
if (!byLang.has('')) byLang.set('', []), langDirs.unshift('');

for (const dir of langDirs) {
  const list = byLang.get(dir);
  await buildIndexPages(dir, list);
  for (const a of list) await buildArticle(a, list);
}

await buildRedirects();
await buildSitemap();
await buildFeed(byLang.get(''));
await buildJsonFeed();
await out('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
if (config.indexNowKey) await out(`${config.indexNowKey}.txt`, config.indexNowKey);
await out('404.html', layout({
  lang: DEFAULT_LANG,
  title: `Page not found | ${config.blogName}`,
  description: config.blogDescription,
  canonical: null,
  noindex: true,
  body: `<main id="main" class="narrow" style="padding-top:64px;padding-bottom:80px">
  <p class="eyebrow">404</p>
  <h1 style="font-size:clamp(30px,6vw,44px);font-weight:900;letter-spacing:-.03em;margin:0 0 12px">That page isn't here</h1>
  <p style="color:var(--dim);margin:0 0 24px">It may have moved. Have a look at the latest articles instead.</p>
  <a class="btn" href="/">Go to the blog</a>
</main>`,
}));

console.log(`Built ${articles.length} article(s) into dist/ for ${SITE}`);

// ---------------------------------------------------------------------------
// Loading

async function loadArticles() {
  const list = [];
  const seen = new Set();
  if (!existsSync(POSTS_DIR)) return list;
  const now = Date.now();

  for (const entry of await readdir(POSTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(POSTS_DIR, entry.name);
    if (!existsSync(path.join(dir, 'post.json'))) continue;

    let meta;
    try {
      meta = JSON.parse(await readFile(path.join(dir, 'post.json'), 'utf8'));
    } catch (err) {
      throw new Error(`content/posts/${entry.name}/post.json is not valid JSON: ${err.message}`);
    }
    const date = parseDate(meta.publishedAt);
    const isLive = meta.status === 'published' && (!date || date.getTime() <= now);
    if (!isLive && !INCLUDE_DRAFTS) continue;

    const body = existsSync(path.join(dir, 'body.html')) ? await readFile(path.join(dir, 'body.html'), 'utf8') : '';
    const lang = String(meta.language || DEFAULT_LANG).toLowerCase();
    const isDefault = lang.split('-')[0] === DEFAULT_LANG.split('-')[0];
    const langDir = isDefault ? '' : lang;
    const slug = entry.name;
    const urlPath = `/${langDir ? langDir + '/' : ''}${slug}/`;
    if (seen.has(urlPath)) {
      console.warn(`::warning::Skipping ${slug}: ${urlPath} is already used`);
      continue;
    }
    seen.add(urlPath);

    const heroSrc = meta.hero?.src || '';
    const heroUrl = !heroSrc ? '' : /^(https?:)?\//.test(heroSrc) ? heroSrc : urlPath + heroSrc;
    const socialSrc = meta.social?.src || '';
    const socialUrl = !socialSrc ? heroUrl : /^(https?:)?\//.test(socialSrc) ? socialSrc : urlPath + socialSrc;
    const textOnly = stripTags(body);
    const prepared = prepareContent(body, meta.title || '', heroUrl);
    const updated = parseDate(meta.updatedAt);

    list.push({
      ...meta,
      sourceDir: dir,
      isDraft: !isLive,
      lang,
      langDir,
      slug,
      urlPath,
      url: SITE + urlPath,
      date,
      dateIso: date ? date.toISOString() : '',
      dateDisplay: date ? formatDate(date) : '',
      modifiedIso: updated ? updated.toISOString() : '',
      readMins: Math.max(1, Math.round(textOnly.split(/\s+/).filter(Boolean).length / 200)),
      description: truncate(meta.meta_description || meta.excerpt || textOnly, 160),
      excerptText: truncate(meta.excerpt || meta.meta_description || textOnly, 220),
      hero_image_url: heroUrl,
      social_image_url: socialUrl,
      imageAlt: meta.hero?.alt || meta.title || '',
      faq: Array.isArray(meta.faq) ? meta.faq.filter((f) => f && f.q && f.a) : [],
      html: prepared.html,
      showHero: Boolean(heroUrl) && !prepared.containsHero,
    });
  }
  return list.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0) || a.slug.localeCompare(b.slug));
}

// Clean up the article body: no scripts or inline handlers, one <h1> (ours),
// lazy images and scrollable tables.
function prepareContent(html, title, heroUrl) {
  let h = html;
  h = h.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<script\b[^>]*\/?>/gi, '');
  h = h.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  h = h.replace(/<\/?(?:html|head|body)\b[^>]*>/gi, '').replace(/<meta\b[^>]*>/gi, '').replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '');
  h = h.replace(/<[a-zA-Z][^>]*>/g, (tag) =>
    tag
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, ' $1="#"')
  );

  // Drop a leading <h1> that repeats the title; demote any other <h1>.
  const firstH1 = h.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (firstH1 && norm(stripTags(firstH1[1])) === norm(title)) h = h.replace(firstH1[0], '');
  h = h.replace(/<h1\b/gi, '<h2').replace(/<\/h1>/gi, '</h2>');

  h = h.replace(/<img\b(?![^>]*\bloading=)/gi, '<img loading="lazy" decoding="async"');
  h = h.replace(/<table\b/gi, '<div class="table-wrap"><table').replace(/<\/table>/gi, '</table></div>');

  const heroKey = heroUrl ? heroUrl.split('?')[0] : '';
  return { html: h.trim(), containsHero: Boolean(heroKey) && h.includes(heroKey) };
}

// ---------------------------------------------------------------------------
// Pages

async function buildIndexPages(dir, list) {
  const per = config.postsPerPage;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const lang = dir || DEFAULT_LANG;
  const base = dir ? `/${dir}/` : '/';

  for (let p = 1; p <= pages; p++) {
    const slice = list.slice((p - 1) * per, p * per);
    const pagePath = p === 1 ? base : `${base}page/${p}/`;
    const prev = p > 1 ? (p === 2 ? base : `${base}page/${p - 1}/`) : null;
    const next = p < pages ? `${base}page/${p + 1}/` : null;

    let cards = '';
    if (!list.length) {
      cards = `<div class="empty"><p style="margin:0">No articles yet. The first one is on its way.</p></div>`;
    } else {
      const [first, ...rest] = slice;
      cards =
        (p === 1 ? card(first, { featured: true, headingTag: 'h2' }) : '') +
        `<div class="grid">${(p === 1 ? rest : slice).map((a) => card(a, { headingTag: 'h2' })).join('')}</div>`;
    }

    const pager =
      pages > 1
        ? `<nav class="pager" aria-label="Pages">
  ${prev ? `<a class="btn btn-ghost" href="${prev}" rel="prev">← Newer</a>` : '<span></span>'}
  <span class="count">Page ${p} of ${pages}</span>
  ${next ? `<a class="btn btn-ghost" href="${next}" rel="next">Older →</a>` : '<span></span>'}
</nav>`
        : '<div style="height:40px"></div>';

    const blogLd = {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      '@id': `${SITE}/#blog`,
      name: config.blogName,
      description: config.blogDescription,
      url: `${SITE}/`,
      inLanguage: lang,
      publisher: publisherLd(),
    };

    await out(
      path.join(pagePath, 'index.html'),
      layout({
        lang,
        title: p === 1 ? `${config.blogName} | Car care advice` : `${config.blogName} | Page ${p}`,
        description: config.blogDescription,
        canonical: SITE + pagePath,
        image: abs(list[0]?.hero_image_url),
        headExtra:
          (prev ? `<link rel="prev" href="${SITE + prev}">\n` : '') +
          (next ? `<link rel="next" href="${SITE + next}">\n` : '') +
          ldScript(blogLd),
        body: `<main id="main">
  <section class="intro wrap">
    <p class="eyebrow">${esc(config.business.shortName)} Blog</p>
    <h1>${esc(config.indexHeading)}</h1>
    <p class="intro-text">${esc(config.blogDescription)}</p>
  </section>
  <section class="wrap" aria-label="Articles">
    ${cards}
    ${pager}
  </section>
</main>`,
      })
    );
  }
}

async function buildArticle(a, sameLang) {
  const related = sameLang.filter((x) => x !== a).slice(0, 3);
  const home = a.langDir ? `/${a.langDir}/` : '/';
  const cta = { ...config.cta, ...(a.cta || {}) };

  // Copy the post's own images next to its page.
  for (const f of await readdir(a.sourceDir)) {
    if (/\.(webp|png|jpe?g|gif|svg|avif)$/i.test(f)) {
      await mkdir(path.join(OUT, a.urlPath), { recursive: true });
      await copyFile(path.join(a.sourceDir, f), path.join(OUT, a.urlPath, f));
    }
  }

  const faqHtml = a.faq.length
    ? `<h2 id="faqs">Common questions</h2>\n` +
      a.faq.map((f) => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n')
    : '';

  const head = [
    a.isDraft ? '<meta name="robots" content="noindex">' : '',
    `<meta property="article:published_time" content="${esc(a.dateIso)}">`,
    a.modifiedIso ? `<meta property="article:modified_time" content="${esc(a.modifiedIso)}">` : '',
    ...(a.keywords || []).slice(0, 10).map((k) => `<meta property="article:tag" content="${esc(String(k))}">`),
    ...articleLd(a).map(ldScript),
  ].join('\n');

  const meta = [a.dateDisplay && `<time datetime="${esc(a.dateIso)}">${esc(a.dateDisplay)}</time>`, `${a.readMins} min read`]
    .filter(Boolean)
    .join('<span class="dot" aria-hidden="true">·</span>');

  const body = `<main id="main">
  ${a.isDraft ? '<p class="draft-flag">Draft preview · not published</p>' : ''}
  <article>
    <header class="post-head narrow">
      <a class="back" href="${home}">← All articles</a>
      <h1>${esc(a.title)}</h1>
      ${a.meta_description ? `<p class="lede">${esc(a.meta_description)}</p>` : ''}
      <p class="meta">${meta}</p>
    </header>
    ${a.showHero ? `<figure class="hero"><img src="${esc(a.hero_image_url)}" alt="${esc(a.imageAlt)}" width="1600" height="900" fetchpriority="high" decoding="async"></figure>` : ''}
    <div class="prose narrow">
${a.html || `<p>${esc(a.excerptText)}</p>`}
${faqHtml}
    </div>
    <div class="narrow">
      <aside class="cta-box" aria-label="Book MobilePitStop">
        <h2>${esc(cta.heading)}</h2>
        <p>${esc(cta.text)}</p>
        <div class="cta-actions">
          <a class="btn" href="${esc(cta.buttonUrl)}">${esc(cta.buttonLabel)}</a>
          <a class="btn btn-ghost" href="tel:${esc(config.business.phoneTel)}">Call ${esc(config.business.phoneDisplay)}</a>
        </div>
      </aside>
    </div>
  </article>
  ${
    related.length
      ? `<section class="more"><div class="wrap"><h2>More from the blog</h2><div class="grid">${related.map((r) => card(r, { headingTag: 'h3' })).join('')}</div></div></section>`
      : '<div style="height:56px"></div>'
  }
</main>`;

  await out(
    path.join(a.urlPath, 'index.html'),
    layout({
      lang: a.lang,
      title: `${a.title} | ${config.business.shortName}`,
      description: a.description,
      canonical: a.url,
      image: abs(a.social_image_url || a.hero_image_url),
      ogType: 'article',
      headExtra: head,
      body,
    })
  );
}

function card(a, { featured = false, headingTag = 'h2' } = {}) {
  const img = a.hero_image_url
    ? `<figure class="card-img"><img src="${esc(a.hero_image_url)}" alt="" loading="${featured ? 'eager' : 'lazy'}" decoding="async" width="800" height="450"></figure>`
    : `<figure class="card-img placeholder" aria-hidden="true"><span>MPS</span></figure>`;
  const meta = [a.dateDisplay && `<time datetime="${esc(a.dateIso)}">${esc(a.dateDisplay)}</time>`, `${a.readMins} min read`]
    .filter(Boolean)
    .join('<span class="dot" aria-hidden="true">·</span>');
  return `<a class="card${featured ? ' featured' : ''}" href="${a.urlPath}">
  ${img}
  <div class="card-body">
    <p class="meta">${meta}</p>
    <${headingTag}>${esc(a.title)}</${headingTag}>
    <p class="excerpt">${esc(a.excerptText)}</p>
    <span class="read-more" aria-hidden="true">Read article →</span>
  </div>
</a>`;
}

function layout({ lang, title, description, canonical, image, ogType = 'website', headExtra = '', body, noindex = false }) {
  const b = config.business;
  const langLinks = langDirs.filter(Boolean);
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
${TRACKING_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta name="theme-color" content="#000000">
<meta property="og:site_name" content="${esc(config.blogName)}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta property="og:locale" content="${esc(config.locale)}">
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<link rel="icon" href="/assets/logo.webp">
<link rel="alternate" type="application/rss+xml" title="${esc(config.blogName)}" href="${SITE}/feed.xml">
<link rel="stylesheet" href="${cssHref}">
${headExtra}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/" aria-label="${esc(config.blogName)} home">
      <img src="/assets/logo.webp" alt="${esc(b.shortName)}" width="73" height="34">
      <span class="brand-tag">Blog</span>
    </a>
    <nav class="site-nav" aria-label="Main">
      ${config.nav.map((n) => `<a class="link" href="${esc(n.url)}">${esc(n.label)}</a>`).join('\n      ')}
      <a class="btn" href="${esc(config.cta.buttonUrl)}">${esc(config.cta.buttonLabel)}</a>
    </nav>
  </div>
</header>
${body}
<footer class="site-footer">
  <div class="wrap">
    <div>
      <strong>${esc(b.name)}</strong>
      <p>Mobile valeting and detailing across ${esc(b.areas)}.</p>
      <p>${esc(b.address)}</p>
      <p><a href="tel:${esc(b.phoneTel)}">${esc(b.phoneDisplay)}</a> · <a href="mailto:${esc(b.email)}">${esc(b.email)}</a></p>
    </div>
    <ul class="footer-links">
      ${config.footerLinks.map((l) => `<li><a href="${esc(l.url)}">${esc(l.label)}</a></li>`).join('\n      ')}
      <li><a href="/feed.xml">RSS feed</a></li>
      ${TRACKING ? '<li><a href="#cookie-settings">Cookie settings</a></li>' : ''}
      ${langLinks.map((d) => `<li><a href="/${d}/" hreflang="${esc(d)}">${esc(languageName(d))}</a></li>`).join('\n      ')}
    </ul>
    <p class="copyright">© ${YEAR} ${esc(b.name)}</p>
  </div>
</footer>
${TRACKING_BODY}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Structured data

function articleLd(a) {
  const blocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: a.title,
      description: a.description,
      ...(a.hero_image_url ? { image: abs(a.hero_image_url) } : {}),
      ...(a.dateIso ? { datePublished: a.dateIso } : {}),
      ...(a.modifiedIso ? { dateModified: a.modifiedIso } : a.dateIso ? { dateModified: a.dateIso } : {}),
      inLanguage: a.lang,
      mainEntityOfPage: { '@type': 'WebPage', '@id': a.url },
      url: a.url,
      ...(a.keywords?.length ? { keywords: a.keywords.join(', ') } : {}),
      author: config.author
        ? { '@type': 'Person', name: config.author.name, ...(config.author.jobTitle ? { jobTitle: config.author.jobTitle } : {}), worksFor: { '@id': 'https://mobilepitstop.uk/#business' } }
        : { '@type': 'Organization', name: config.business.name, url: config.business.url },
      publisher: publisherLd(),
      about: { '@id': 'https://mobilepitstop.uk/#business' },
    },
  ];
  if (a.faq.length) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: a.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }
  blocks.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: config.blogName, item: `${SITE}${a.langDir ? `/${a.langDir}` : ''}/` },
      { '@type': 'ListItem', position: 2, name: a.title, item: a.url },
    ],
  });
  return blocks;
}

function publisherLd() {
  return {
    '@type': 'Organization',
    '@id': 'https://mobilepitstop.uk/#business',
    name: config.business.name,
    url: config.business.url,
    logo: { '@type': 'ImageObject', url: config.business.logoUrl },
  };
}

function ldScript(obj) {
  const json = JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return `<script type="application/ld+json">${json}</script>`;
}

// ---------------------------------------------------------------------------
// Redirects, sitemap, feeds

async function buildRedirects() {
  let redirects = {};
  try {
    redirects = JSON.parse(await readFile(REDIRECTS_FILE, 'utf8'));
  } catch {}
  const live = new Map(articles.map((a) => [`${a.lang}/${a.slug}`, a]));
  for (const [from, to] of Object.entries(redirects)) {
    const target = live.get(to);
    if (!target) continue;
    const [lang, slug] = from.split('/');
    const isDefault = lang.split('-')[0] === DEFAULT_LANG.split('-')[0];
    const fromPath = `/${isDefault ? '' : lang + '/'}${slug}/`;
    if (articles.some((a) => a.urlPath === fromPath)) continue; // a real article lives there now
    await out(
      path.join(fromPath, 'index.html'),
      `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><title>Moved</title>` +
        `<link rel="canonical" href="${esc(target.url)}"><meta name="robots" content="noindex">` +
        `<meta http-equiv="refresh" content="0; url=${esc(target.urlPath)}"></head>` +
        `<body><p>This article has moved to <a href="${esc(target.urlPath)}">${esc(target.title)}</a>.</p></body></html>\n`
    );
  }
}

async function buildSitemap() {
  const urls = [];
  for (const dir of langDirs) {
    const list = byLang.get(dir);
    const base = dir ? `/${dir}/` : '/';
    urls.push({ loc: SITE + base, lastmod: list[0]?.dateIso });
    const pages = Math.ceil(list.length / config.postsPerPage);
    for (let p = 2; p <= pages; p++) urls.push({ loc: `${SITE}${base}page/${p}/` });
    for (const a of list) urls.push({ loc: a.url, lastmod: a.modifiedIso || a.dateIso });
  }
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((u) => `  <url><loc>${xmlEsc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ''}</url>`)
      .join('\n') +
    `\n</urlset>\n`;
  await out('sitemap.xml', xml);
}

async function buildFeed(list) {
  const items = list
    .slice(0, 30)
    .map(
      (a) => `    <item>
      <title>${xmlEsc(a.title)}</title>
      <link>${xmlEsc(a.url)}</link>
      <guid isPermaLink="true">${xmlEsc(a.url)}</guid>
      ${a.date ? `<pubDate>${a.date.toUTCString()}</pubDate>` : ''}
      <description>${xmlEsc(a.description)}</description>
    </item>`
    )
    .join('\n');
  await out(
    'feed.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEsc(config.blogName)}</title>
    <link>${SITE}/</link>
    <description>${xmlEsc(config.blogDescription)}</description>
    <language>${xmlEsc(DEFAULT_LANG)}</language>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
  );
}

// Small public list of articles, handy for a "Latest from the blog" block on the main site.
async function buildJsonFeed() {
  const data = articles.map((a) => ({
    title: a.title,
    url: a.url,
    language: a.lang,
    published: a.dateIso,
    updated: a.modifiedIso || a.dateIso,
    image: abs(a.hero_image_url) || null,
    excerpt: a.excerptText,
  }));
  await out('articles.json', JSON.stringify(data, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Helpers

async function out(rel, content) {
  const file = path.join(OUT, rel.replace(/^\/+/, ''));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function abs(u) {
  if (!u) return '';
  return /^https?:\/\//.test(u) ? u : SITE + (u.startsWith('/') ? '' : '/') + u;
}

function xmlEsc(s) {
  return esc(s);
}

function stripTags(html) {
  return String(html)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s, n) {
  s = stripTags(s || '');
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), n * 0.6)).replace(/[\s,.;:–-]+$/, '') + '…';
}

function norm(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(d) {
  return new Intl.DateTimeFormat(config.dateLocale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }).format(d);
}

function languageName(code) {
  try {
    const name = new Intl.DisplayNames([config.dateLocale], { type: 'language' }).of(code);
    return name ? `${name} articles` : code;
  } catch {
    return code;
  }
}

function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}
