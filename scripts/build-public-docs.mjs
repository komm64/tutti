#!/usr/bin/env node
// Build docs/{index,privacy,support}.html — Vellie-style single-file pages.
// All 31 locale translations are baked into each HTML as a JS object.
// Language is detected from localStorage > navigator.language > 'en'.
// Run: node scripts/build-public-docs.mjs

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STRINGS_DIR = join(ROOT, 'docs', '_strings');
const OUT_DIR = join(ROOT, 'docs');

const LOCALES = JSON.parse(await readFile(join(ROOT, 'config', 'locales.json'), 'utf8'));

async function loadTranslations() {
  const files = (await readdir(STRINGS_DIR)).filter((f) => f.endsWith('.json'));
  const T = {};
  for (const file of files) {
    const code = file.replace('.json', '');
    T[code] = JSON.parse(await readFile(join(STRINGS_DIR, file), 'utf8'));
  }
  return T;
}

const CSS = `
  :root {
    --fg: #1f2937; --muted: #6b7280; --brand: #0d9488;
    --bg: #ffffff; --line: #e5e7eb; --accent-bg: #f0fdfa;
  }
  html { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans",
    "Noto Sans CJK JP", "Noto Sans CJK SC", "Noto Sans CJK TC", "Noto Sans CJK KR",
    "Noto Sans Thai", "Noto Sans Arabic", "Noto Sans Devanagari", sans-serif;
    color: var(--fg); }
  body { max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem 4rem; line-height: 1.7; }
  header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .icon { width: 48px; height: 48px; border-radius: 8px; background: var(--brand);
    display: grid; place-items: center; color: white; font-weight: 700;
    font-size: 1.25rem; flex-shrink: 0; }
  .header-text { flex: 1; min-width: 0; }
  h1 { font-size: 1.75rem; margin: 0; }
  .tagline { color: var(--muted); margin: 0.25rem 0 0; font-size: 0.95rem; }
  select#lang { padding: 0.4rem 0.75rem; font-size: 0.9rem; border: 1.5px solid var(--line);
    border-radius: 8px; background: #fafafa; cursor: pointer; outline: none; margin-left: auto; }
  select#lang:focus { border-color: var(--brand); }
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
  .callout { background: var(--accent-bg); border-left: 3px solid var(--brand);
    padding: 0.75rem 1rem; margin: 1rem 0; border-radius: 4px; }
  .callout p { margin: 0.25rem 0; }
  a { color: var(--brand); }
  .cws-btn {
    display: inline-flex; align-items: center; gap: 0.5rem;
    background: var(--brand); color: #fff; font-weight: 600;
    padding: 0.65rem 1.25rem; border-radius: 8px; text-decoration: none;
    font-size: 1rem; margin: 1.25rem 0 0.5rem; transition: opacity 0.15s;
  }
  .cws-btn:hover { opacity: 0.88; color: #fff; }
  .cws-btn svg { width: 20px; height: 20px; flex-shrink: 0; }
  footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--line);
    color: var(--muted); font-size: 0.85rem; }
`;

// Escapes </script so it can't accidentally close the script tag when baked into HTML.
function safeJson(obj) {
  return JSON.stringify(obj).replace(/<\/script/gi, '<\\/script');
}

function langsJs() {
  const items = LOCALES.map(({ code, nativeName }) => `["${code}","${nativeName}"]`);
  return `const LANGS=[${items.join(',')}];`;
}

// Common JS: setLang / detectLang / select population (shared across all 3 pages)
const COMMON_JS = `
function setLang(c){try{localStorage.setItem('tutti_lang',c)}catch(e){}render(c);document.getElementById('lang').value=c;}
function detectLang(){
  try{var s=localStorage.getItem('tutti_lang');if(s&&T[s])return s;}catch(e){}
  var n=(navigator.language||'en').toLowerCase();
  for(var i=0;i<LANGS.length;i++){if(n===LANGS[i][0].toLowerCase())return LANGS[i][0];}
  for(var i=0;i<LANGS.length;i++){if(n.startsWith(LANGS[i][0].split('-')[0].toLowerCase()))return LANGS[i][0];}
  return 'en';
}
(function(){var sel=document.getElementById('lang');for(var i=0;i<LANGS.length;i++){var o=document.createElement('option');o.value=LANGS[i][0];o.textContent=LANGS[i][1];sel.appendChild(o);}})();
var _l=detectLang();document.getElementById('lang').value=_l;render(_l);
`;

const CWS_URL = 'https://chromewebstore.google.com/detail/mcjfgdcffjfhkcepfpnifcpknlddmbpe';
const CHROME_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 2c1.93 0 3.72.6 5.2 1.62L12 12 6.8 5.62A7.96 7.96 0 0 1 12 4zM4 12a8 8 0 0 1 2.07-5.34L12 14.5l5.93-7.84A8 8 0 1 1 4 12z"/></svg>';

// Render function for index.html (uses string concat, no template literals)
const INDEX_RENDER = `
var CWS_URL='${CWS_URL}';
function render(code){
  var t=T[code]||T['en'],c=t.common,i=t.index;
  document.title=i.title;
  document.documentElement.lang=code;
  document.documentElement.dir=code==='ar'?'rtl':'';
  document.getElementById('tagline').textContent=i.headerTagline;
  document.getElementById('nav').innerHTML=
    '<a href="'+CWS_URL+'" target="_blank" rel="noopener">Chrome Web Store</a>'+
    '<a href="https://github.com/komm64/tutti">'+c.navGitHub+'</a>'+
    '<a href="./support.html">'+c.navSupport+'</a>'+
    '<a href="./privacy.html">'+c.navPrivacy+'</a>';
  document.getElementById('content').innerHTML=
    '<a class="cws-btn" href="'+CWS_URL+'" target="_blank" rel="noopener">'+
    '${CHROME_ICON} Add to Chrome — Free</a>'+
    '<h2>'+i.h2Overview+'</h2><p>'+i.overviewBody+'</p>'+
    '<h2>'+i.h2PrivacySummary+'</h2>'+
    '<p>'+i.privacySummaryBody+'</p>'+
    '<p>'+i.privacyFullPolicy+' <a href="./privacy.html">Privacy Policy</a></p>';
  document.getElementById('footer').innerHTML=c.footerCopy;
}
`;

// Render function for privacy.html
const PRIVACY_RENDER = `
function render(code){
  var t=T[code]||T['en'],c=t.common,p=t.privacy;
  document.title=p.title;
  document.documentElement.lang=code;
  document.documentElement.dir=code==='ar'?'rtl':'';
  document.getElementById('tagline').textContent=p.headerTagline;
  document.getElementById('nav').innerHTML=
    '<a href="./index.html">'+c.navHome+'</a>'+
    '<a href="https://github.com/komm64/tutti">'+c.navGitHub+'</a>'+
    '<a href="./support.html">'+c.navSupport+'</a>';
  document.getElementById('content').innerHTML=
    '<p>'+p.lastUpdated+'</p>'+
    '<h2>'+p.h2Data+'</h2>'+
    '<p>'+p.dataIntro+'</p>'+
    '<ul><li>'+p.dataLi1+'</li><li>'+p.dataLi2+'</li><li>'+p.dataLi3+'</li><li>'+p.dataLi4+'</li></ul>'+
    '<h3>'+p.h3Report+'</h3>'+
    '<p>'+p.reportIntro+'</p>'+
    '<ul><li>'+p.reportLi1+'</li><li>'+p.reportLi2+'</li><li>'+p.reportLi3+'</li></ul>'+
    '<p>'+p.reportOutro+'</p>'+
    '<h2>'+p.h2Local+'</h2>'+
    '<p>'+p.localIntro+'</p>'+
    '<ul><li>'+p.localSettings+'</li><li>'+p.localDrafts+'</li><li>'+p.localSelected+'</li>'+
    '<li>'+p.localUsers+'</li><li>'+p.localHistory+'</li><li>'+p.localCreds+'</li>'+
    '<li>'+p.localSelectors+'</li><li>'+p.localVideoCap+'</li></ul>'+
    '<p>'+p.localWipe+'</p>'+
    '<h2>'+p.h2Perms+'</h2>'+
    '<table><tr><th>'+p.permsThead1+'</th><th>'+p.permsThead2+'</th></tr>'+
    '<tr><td><code>storage</code></td><td>'+p.permsStorage+'</td></tr>'+
    '<tr><td><code>offscreen</code></td><td>'+p.permsOffscreen+'</td></tr>'+
    '<tr><td><code>sidePanel</code></td><td>'+p.permsSidePanel+'</td></tr>'+
    '<tr><td><code>host_permissions</code></td><td>'+p.permsHost+'</td></tr>'+
    '<tr><td><code>optional_host_permissions</code></td><td>'+p.permsOptHost+'</td></tr>'+
    '</table>'+
    '<h2>'+p.h2Relationship+'</h2>'+
    '<p>'+p.relationshipBody+'</p>'+
    '<h2>'+p.h2Contact+'</h2>'+
    '<p>'+p.contactGitHub+' <a href="https://github.com/komm64/tutti/issues">github.com/komm64/tutti/issues</a><br>'+
    p.contactEmail+' <a href="mailto:contact@komm64.com">contact@komm64.com</a></p>'+
    '<h2>'+p.h2Changes+'</h2>'+
    '<p>'+p.changesBody+'</p>';
  document.getElementById('footer').innerHTML=c.footerCopy;
}
`;

// Render function for support.html
const SUPPORT_RENDER = `
function render(code){
  var t=T[code]||T['en'],c=t.common,u=t.support;
  document.title=u.title;
  document.documentElement.lang=code;
  document.documentElement.dir=code==='ar'?'rtl':'';
  document.getElementById('tagline').textContent=u.headerTagline;
  document.getElementById('nav').innerHTML=
    '<a href="./index.html">'+c.navHome+'</a>'+
    '<a href="https://github.com/komm64/tutti">'+c.navGitHub+'</a>'+
    '<a href="./privacy.html">'+c.navPrivacy+'</a>';
  document.getElementById('content').innerHTML=
    '<h2>'+u.h2Help+'</h2>'+
    '<h3>'+u.h3Failed+'</h3><p>'+u.failedBody+'</p>'+
    '<div class="callout"><p><strong>'+u.calloutTitle+'</strong></p><p>'+u.calloutBody+'</p></div>'+
    '<h3>'+u.h3General+'</h3><p>'+u.generalBody+'</p>'+
    '<h3>'+u.h3Install+'</h3><p>'+u.installBody+'</p>'+
    '<h2>'+u.h2Faq+'</h2>'+
    '<h3>'+u.q1+'</h3><p>'+u.a1+'</p>'+
    '<h3>'+u.q2+'</h3><p>'+u.a2+'</p>'+
    '<h3>'+u.q3+'</h3><p>'+u.a3+'</p>'+
    '<h3>'+u.q4+'</h3><p>'+u.a4+'</p>'+
    '<h3>'+u.q5+'</h3><p>'+u.a5+'</p>'+
    '<h3>'+u.q6+'</h3><p>'+u.a6+'</p>';
  document.getElementById('footer').innerHTML=c.footerContact;
}
`;

function buildHtml(renderFn, T) {
  const tJson = safeJson(T);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Tutti</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <a href="./index.html" style="display:flex;align-items:center;gap:0.75rem;text-decoration:none;color:inherit;flex:1;min-width:0;">
    <div class="icon">T</div>
    <div class="header-text">
      <h1>Tutti</h1>
      <p id="tagline" class="tagline"></p>
    </div>
  </a>
  <select id="lang" onchange="setLang(this.value)"></select>
</header>
<nav id="nav"></nav>
<main id="content"></main>
<footer id="footer"></footer>
<script>
${langsJs()}
const T=${tJson};
${renderFn}
${COMMON_JS}
</script>
</body>
</html>
`;
}

async function main() {
  const T = await loadTranslations();
  await writeFile(join(OUT_DIR, 'index.html'), buildHtml(INDEX_RENDER, T), 'utf8');
  await writeFile(join(OUT_DIR, 'privacy.html'), buildHtml(PRIVACY_RENDER, T), 'utf8');
  await writeFile(join(OUT_DIR, 'support.html'), buildHtml(SUPPORT_RENDER, T), 'utf8');
  console.log('Done. Generated index.html, privacy.html, support.html');
}

main().catch((e) => { console.error(e); process.exit(1); });
