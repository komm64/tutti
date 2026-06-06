#!/usr/bin/env node
// Build README.<locale>.md for each docs/_strings/readme/<locale>.json.
// Generates condensed user-facing README (links to README.md for dev section).
// en is canonical at README.md; ja existing file is preserved.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TUTTI_LOCALES as LOCALES } from './locale-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STRINGS_DIR = join(ROOT, 'docs', '_strings', 'readme');
const OUT_DIR = ROOT;

function fileName(locale) {
  // en is canonical README.md (we skip writing it from this script to preserve dev section).
  // ja keeps its existing README.ja.md (also skipped to avoid clobbering manual version).
  return `README.${locale}.md`;
}

function langSwitcher(currentLocale) {
  const items = LOCALES
    .filter(({ code }) => code !== currentLocale)
    .map(({ code, native }) => `[${native}](./${code === 'en' ? 'README.md' : fileName(code)})`);
  return items.join(' &middot; ');
}

function buildReadme(locale, s) {
  return `# ${s.title}

> ${s.tagline}

${langSwitcher(locale)}

${s.intro}

**${s.noBackendBold}**

🔒 [${s.privacyPolicyLink}](https://tutti.komm64.com/privacy.html)

## ${s.h2Features}

- 📤 ${s.feat1}
- ✂️ ${s.feat2}
- ${s.feat3}
- 🖼️ ${s.feat4}
- 🎬 ${s.feat5}
- 🔌 ${s.feat6}
- 📊 ${s.feat7}
- 🪪 ${s.feat8}
- 🛡️ ${s.feat9}
- 📜 ${s.feat10}
- 💾 ${s.feat11}
- ⌨️ ${s.feat12}
- ⚙️ ${s.feat13}
- 🩹 ${s.feat14}
- 🐞 ${s.feat15}
- 🌐 ${s.feat16}

## ${s.h2Networks}

${s.networksIntro}

### ${s.h3Stable}

| ${s.tableNetwork} | text | image | shortVideo | longVideo | ${s.tablePath} |
|---|:---:|:---:|:---:|:---:|---|
| X | ✅ | ✅ | ✅ | ✅ | DOM |
| Bluesky | ✅ | ✅ | ✅ | — | DOM + API |
| Threads | ✅ | ✅ | ✅ | ✅ | DOM |
| Mastodon | ✅ | ✅ | ✅ | ✅ | DOM + API |
| Misskey | ✅ | ✅ | ✅ | ✅ | DOM + API |
| Tumblr | ✅ | ✅ | ✅ | ✅ | DOM |
| Pixiv | — | ✅ | — | — | DOM (multi-step) |
| TikTok | — | — | ✅ | — | DOM (multi-step) |
| YouTube (Shorts) | — | — | ✅ | — | DOM (multi-step) |
| Instagram | — | ✅ | ✅ | — | DOM (multi-step) |

### ${s.h3Experimental}

| ${s.tableNetwork} | text | image | shortVideo | longVideo | ${s.tablePath} |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- ${s.pathDom}
- ${s.pathDomApi}
- ${s.pathMultiStep}

## ${s.h2Install}

### ${s.h3Cws}

${s.cwsBody}

### ${s.h3Unpacked}

${s.unpackedIntro}

1. ${s.unpackedStep1}
2. ${s.unpackedStep2}
3. ${s.unpackedStep3}
4. ${s.unpackedStep4}

## ${s.h2Support}

${s.supportBody}

## ${s.h2Privacy}

${s.privacyBody}

## ${s.h2License}

${s.licenseBody}

---

## ${s.devNoticeHeading}

${s.devNoticeBody}
`;
}

async function main() {
  const entries = await readdir(STRINGS_DIR);
  const localeFiles = entries.filter((e) => e.endsWith('.json'));
  let written = 0;
  for (const file of localeFiles) {
    const locale = file.replace(/\.json$/, '');
    // Skip en (canonical README.md is hand-maintained with dev section).
    // Skip ja (existing README.ja.md is hand-maintained with full dev section).
    if (locale === 'en' || locale === 'ja') continue;
    const data = JSON.parse(await readFile(join(STRINGS_DIR, file), 'utf8'));
    const md = buildReadme(locale, data);
    await writeFile(join(OUT_DIR, fileName(locale)), md, 'utf8');
    written += 1;
    process.stdout.write(`  ${locale}\n`);
  }
  console.log(`\nDone. ${written} README files written.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
