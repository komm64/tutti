import { describe, expect, it } from 'vitest';
import { resolveTuttiLocale, toChromeLocaleDir, TUTTI_LOCALES } from './i18n';

describe('locale adapters', () => {
  it.each([
    'zh_CN',
    'zh-TW',
    'es',
    'es_419',
    'pt_BR',
    'pt_PT',
  ])('rejects non-canonical code %s', (locale) => {
    expect(resolveTuttiLocale(locale)).toBe('auto');
  });

  it.each([
    ['zh-Hans', 'zh_CN'],
    ['zh-Hant', 'zh_TW'],
    ['es-ES', 'es'],
    ['es-419', 'es_419'],
    ['pt-BR', 'pt_BR'],
    ['pt-PT', 'pt_PT'],
    ['ja', 'ja'],
  ])('maps canonical %s to Chrome locale directory %s', (canonical, chromeDir) => {
    expect(toChromeLocaleDir(canonical)).toBe(chromeDir);
  });

  it('falls back unknown codes to auto', () => {
    expect(resolveTuttiLocale('not-a-locale')).toBe('auto');
  });
});

describe('TUTTI_LOCALES', () => {
  it('matches the canonical k64-locale order', () => {
    expect(TUTTI_LOCALES.slice(1).map(({ code }) => code)).toEqual([
      'eo', 'en', 'zh-Hans', 'ru', 'es-ES', 'pt-BR', 'de', 'ko', 'ja', 'fr',
      'pl', 'zh-Hant', 'tr', 'th', 'es-419', 'uk', 'it', 'cs', 'hu', 'sv',
      'nl', 'vi', 'id', 'ro', 'el', 'pt-PT', 'ar', 'fi', 'bg', 'no', 'da',
    ]);
  });
});
