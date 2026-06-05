#!/usr/bin/env node
// Build docs/{index,privacy,support}.<locale>.html from docs/_strings/<locale>.json.
// Run: node scripts/build-public-docs.mjs

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TUTTI_LOCALES as LOCALES } from './locale-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STRINGS_DIR = join(ROOT, 'docs', '_strings');
const OUT_DIR = join(ROOT, 'docs');

const RTL = new Set(['ar']);

const SHARED_STYLE = `
  :root {
    --fg: #1f2937;
    --muted: #6b7280;
    --brand: #0d9488;
    --bg: #ffffff;
    --line: #e5e7eb;
    --accent-bg: #f0fdfa;
  }
  html { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "Noto Sans CJK JP", "Noto Sans CJK SC", "Noto Sans CJK TC", "Noto Sans CJK KR", "Noto Sans Thai", "Noto Sans Arabic", "Noto Sans Devanagari", sans-serif; color: var(--fg); }
  body { max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem 4rem; line-height: 1.7; }
  header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
  h1 { font-size: 1.75rem; margin: 0; }
  .tagline { color: var(--muted); margin: 0.25rem 0 1.5rem; }
  .icon { width: 48px; height: 48px; border-radius: 8px; background: var(--brand); display: grid; place-items: center; color: white; font-weight: 700; font-size: 1.25rem; flex-shrink: 0; }
  nav { font-size: 0.9rem; color: var(--muted); margin-bottom: 2rem; }
  nav a { color: var(--brand); text-decoration: none; margin-right: 1rem; }
  nav a:hover { text-decoration: underline; }
  h2 { font-size: 1.2rem; margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--line); }
  h3 { font-size: 1rem; margin-top: 1.5rem; }
  ul, ol { padding-left: 1.5rem; }
  code { background: #f3f4f6; padding: 0.1em 0.4em; border-radius: 4px; font-size: 0.9em; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-weight: 600; }
  .callout {
    background: var(--accent-bg);
    border-left: 3px solid var(--brand);
    padding: 0.75rem 1rem;
    margin: 1rem 0;
    border-radius: 4px;
  }
  .callout p { margin: 0.25rem 0; }
  a { color: var(--brand); }
  .lang-switch { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--line); font-size: 0.85rem; color: var(--muted); }
  .lang-switch a { color: var(--brand); text-decoration: none; margin-right: 0.75rem; display: inline-block; margin-bottom: 0.25rem; }
  .lang-switch a.current { color: var(--fg); font-weight: 600; }
  footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.85rem; }
`;

function fileName(doc, locale) {
  // en is the canonical (no suffix). Others get .<locale> suffix.
  if (locale === 'en') return `${doc}.html`;
  return `${doc}.${locale}.html`;
}

function langSwitch(currentLocale, doc) {
  const items = LOCALES.map(({ code, native }) => {
    const href = fileName(doc, code);
    const cls = code === currentLocale ? ' class="current"' : '';
    return `<a href="./${href}"${cls}>${native}</a>`;
  });
  return `<div class="lang-switch">${items.join('')}</div>`;
}

function buildIndex(locale, s) {
  const c = s.common;
  const i = s.index;
  return `<!doctype html>
<html lang="${s.lang}"${RTL.has(s.lang) ? ' dir="rtl"' : ''}>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${i.title}</title>
<style>${SHARED_STYLE}</style>
</head>
<body>

<header>
  <div class="icon">T</div>
  <div>
    <h1>${c.appName}</h1>
    <p class="tagline">${i.headerTagline}</p>
  </div>
</header>

<nav>
  <a href="https://github.com/komm64/tutti">${c.navGitHub}</a>
  <a href="./${fileName('support', locale)}">${c.navSupport}</a>
  <a href="./${fileName('privacy', locale)}">${c.navPrivacy}</a>
</nav>

<section id="overview">
<h2>${i.h2Overview}</h2>
<p>${i.overviewBody}</p>
</section>

<section id="privacy-summary">
<h2>${i.h2PrivacySummary}</h2>
<p>${i.privacySummaryBody}</p>
<p>${i.privacyFullPolicy} <a href="./${fileName('privacy', locale)}">privacy.html</a></p>
</section>

${langSwitch(locale, 'index')}

<footer>
  ${c.footerCopy}
</footer>
</body>
</html>
`;
}

function buildPrivacy(locale, s) {
  const c = s.common;
  const p = s.privacy;
  return `<!doctype html>
<html lang="${s.lang}"${RTL.has(s.lang) ? ' dir="rtl"' : ''}>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${p.title}</title>
<style>${SHARED_STYLE}</style>
</head>
<body>

<header>
  <div class="icon">T</div>
  <div>
    <h1>${p.title}</h1>
    <p class="tagline">${p.headerTagline}</p>
  </div>
</header>

<nav>
  <a href="./${fileName('index', locale)}">${c.navHome}</a>
  <a href="https://github.com/komm64/tutti">${c.navGitHub}</a>
  <a href="./${fileName('support', locale)}">${c.navSupport}</a>
</nav>

<p>${p.lastUpdated}</p>

<h2>${p.h2Data}</h2>

<p>${p.dataIntro}</p>

<ul>
<li>${p.dataLi1}</li>
<li>${p.dataLi2}</li>
<li>${p.dataLi3}</li>
<li>${p.dataLi4}</li>
</ul>

<h3>${p.h3Report}</h3>

<p>${p.reportIntro}</p>

<ul>
<li>${p.reportLi1}</li>
<li>${p.reportLi2}</li>
<li>${p.reportLi3}</li>
</ul>

<p>${p.reportOutro}</p>

<h2>${p.h2Local}</h2>

<p>${p.localIntro}</p>

<ul>
<li>${p.localSettings}</li>
<li>${p.localDrafts}</li>
<li>${p.localSelected}</li>
<li>${p.localUsers}</li>
<li>${p.localHistory}</li>
<li>${p.localCreds}</li>
<li>${p.localSelectors}</li>
<li>${p.localVideoCap}</li>
</ul>

<p>${p.localWipe}</p>

<h2>${p.h2Perms}</h2>

<table>
<tr><th>${p.permsThead1}</th><th>${p.permsThead2}</th></tr>
<tr><td><code>storage</code></td><td>${p.permsStorage}</td></tr>
<tr><td><code>offscreen</code></td><td>${p.permsOffscreen}</td></tr>
<tr><td><code>sidePanel</code></td><td>${p.permsSidePanel}</td></tr>
<tr><td><code>host_permissions</code></td><td>${p.permsHost}</td></tr>
<tr><td><code>optional_host_permissions: https://*/*</code></td><td>${p.permsOptHost}</td></tr>
</table>

<h2>${p.h2Relationship}</h2>

<p>${p.relationshipBody}</p>

<h2>${p.h2Contact}</h2>

<p>
${p.contactGitHub} <a href="https://github.com/komm64/tutti/issues">https://github.com/komm64/tutti/issues</a><br />
${p.contactEmail} <a href="mailto:contact@komm64.com">contact@komm64.com</a>
</p>

<h2>${p.h2Changes}</h2>

<p>${p.changesBody}</p>

${langSwitch(locale, 'privacy')}

<footer>
  &copy; komm64 &mdash; Tutti
</footer>

</body>
</html>
`;
}

function buildSupport(locale, s) {
  const c = s.common;
  const u = s.support;
  return `<!doctype html>
<html lang="${s.lang}"${RTL.has(s.lang) ? ' dir="rtl"' : ''}>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${u.title}</title>
<style>${SHARED_STYLE}</style>
</head>
<body>
<header>
  <div class="icon">T</div>
  <div>
    <h1>${u.title}</h1>
    <p class="tagline">${u.headerTagline}</p>
  </div>
</header>

<nav>
  <a href="./${fileName('index', locale)}">${c.navHome}</a>
  <a href="https://github.com/komm64/tutti">${c.navGitHub}</a>
  <a href="./${fileName('privacy', locale)}">${c.navPrivacy}</a>
</nav>

<h2>${u.h2Help}</h2>

<h3>${u.h3Failed}</h3>
<p>${u.failedBody}</p>

<div class="callout">
<p><strong>${u.calloutTitle}</strong></p>
<p>${u.calloutBody}</p>
</div>

<h3>${u.h3General}</h3>
<p>${u.generalBody}</p>

<h3>${u.h3Install}</h3>
<p>${u.installBody}</p>

<h2>${u.h2Faq}</h2>

<h3>${u.q1}</h3>
<p>${u.a1}</p>

<h3>${u.q2}</h3>
<p>${u.a2}</p>

<h3>${u.q3}</h3>
<p>${u.a3}</p>

<h3>${u.q4}</h3>
<p>${u.a4}</p>

<h3>${u.q5}</h3>
<p>${u.a5}</p>

<h3>${u.q6}</h3>
<p>${u.a6}</p>

${langSwitch(locale, 'support')}

<footer>
  ${c.footerContact}
</footer>

</body>
</html>
`;
}

async function main() {
  const entries = await readdir(STRINGS_DIR);
  const localeFiles = entries.filter((e) => e.endsWith('.json'));
  let written = 0;
  for (const file of localeFiles) {
    const locale = file.replace(/\.json$/, '');
    const data = JSON.parse(await readFile(join(STRINGS_DIR, file), 'utf8'));
    const indexHtml = buildIndex(locale, data);
    const privacyHtml = buildPrivacy(locale, data);
    const supportHtml = buildSupport(locale, data);
    await writeFile(join(OUT_DIR, fileName('index', locale)), indexHtml, 'utf8');
    await writeFile(join(OUT_DIR, fileName('privacy', locale)), privacyHtml, 'utf8');
    await writeFile(join(OUT_DIR, fileName('support', locale)), supportHtml, 'utf8');
    written += 3;
    process.stdout.write(`  ${locale}: index, privacy, support\n`);
  }
  console.log(`\nDone. ${written} HTML files written across ${localeFiles.length} locales.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
