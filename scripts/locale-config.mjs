import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** k64-locale LANGUAGES.md aligned canonical BCP 47 list. */
export const TUTTI_LOCALES = JSON.parse(
  readFileSync(join(__dirname, '..', 'config', 'locales.json'), 'utf8'),
);

/** Chrome extension `_locales` names are converted only at the output boundary. */
export function toChromeLocaleDir(locale) {
  return TUTTI_LOCALES.find(({ code }) => code === locale)?.chromeLocale ?? locale;
}
