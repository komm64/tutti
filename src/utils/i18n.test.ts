import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTuttiLocale, toChromeLocaleDir, TUTTI_LOCALES } from './i18n';

describe('localization initialization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('makes concurrent callers wait for the same settings and locale load', async () => {
    vi.resetModules();
    let resolveSettings!: (value: unknown) => void;
    const get = vi.fn(() => new Promise((resolve) => { resolveSettings = resolve; }));
    const addListener = vi.fn();
    vi.stubGlobal('chrome', {
      storage: { sync: { get }, onChanged: { addListener } },
      runtime: { getURL: (path: string) => path },
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ hello: { message: 'Bonjour' } }),
    })));
    const { initI18n, t } = await import('./i18n');
    const first = initI18n();
    const second = initI18n();
    let secondDone = false;
    void second.then(() => { secondDone = true; });
    await Promise.resolve();
    expect(secondDone).toBe(false);

    resolveSettings({ settings: { uiLanguage: 'fr' } });
    await Promise.all([first, second]);
    expect(t('hello')).toBe('Bonjour');
    expect(get).toHaveBeenCalledOnce();
    expect(addListener).toHaveBeenCalledOnce();
  });

  it('loads English once when it is both the selected and fallback locale', async () => {
    vi.resetModules();
    vi.stubGlobal('chrome', {
      storage: { sync: { get: async () => ({ settings: { uiLanguage: 'en' } }) } },
      runtime: { getURL: (path: string) => path },
    });
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetch);
    const { initI18n } = await import('./i18n');

    await initI18n();

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('_locales/en/messages.json');
  });
});

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
