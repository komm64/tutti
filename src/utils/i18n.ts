/**
 * Tutti UI 翻訳 wrapper (v0.5.2〜)。
 *
 * 通常の Chrome extension i18n は browser locale 固定 (chrome.i18n.getUILanguage
 * の値で _locales/<lang>/messages.json を選択)。 user が「browser は en だけど
 * Tutti は ja で使いたい」 のような override を求める場合、 これを実装する API は
 * Chrome 標準には無い。
 *
 * 解決策: 自前の t() wrapper を介して全 UI translation を取る。
 * - `Settings.uiLanguage === 'auto'` → 標準の chrome.i18n.getMessage を使う
 * - それ以外 → 指定 locale の messages.json を fetch + memory cache、 そこから lookup。
 *   key が無ければ 'en' (default_locale) に fallback、 さらに無ければ key 文字列。
 *
 * 全 svelte / TS file は `import { t } from '~/utils/i18n'` で参照する。
 * `t()` は同期、 init は popup / sidepanel / options entry で main.ts から
 * 起動時に `initI18n()` を await して messages を pre-load しておく。
 *
 * production build 注意: WXT は dev mode でしか `browser` global を inject しない。
 * production では `chrome.*` を使う必要がある。 v0.5.3 で `globalThis.browser` 経由
 * の lookup が全失敗して raw key 表示になる事故が発生したため、 全 API access を
 * `chrome.* ?? browser.*` の二段にする (v0.5.4〜)。
 */

type MessageEntry = { message: string; placeholders?: Record<string, { content: string }> };
type LocaleMessages = Record<string, MessageEntry>;

type WebExtGlobals = {
  chrome?: {
    i18n?: { getMessage: (k: string, s?: string[]) => string };
    runtime?: { getURL: (p: string) => string };
    storage?: {
      sync?: { get: (k: string) => Promise<Record<string, unknown>> };
      onChanged?: { addListener: (fn: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => void };
    };
  };
  browser?: {
    i18n?: { getMessage: (k: string, s?: string[]) => string };
    runtime?: { getURL: (p: string) => string };
    storage?: {
      sync?: { get: (k: string) => Promise<Record<string, unknown>> };
      onChanged?: { addListener: (fn: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => void };
    };
  };
};

/** prod (Chrome) では `chrome.*`、 firefox では `browser.*`、 dev WXT polyfill では `browser.*` も生える。 */
function webExt(): NonNullable<WebExtGlobals['chrome']> | undefined {
  const g = globalThis as unknown as WebExtGlobals;
  return g.chrome ?? g.browser;
}

const cache = new Map<string, LocaleMessages>();
let currentLocale = 'auto';
let initialized = false;

async function loadLocale(locale: string): Promise<LocaleMessages> {
  const cached = cache.get(locale);
  if (cached) return cached;
  try {
    const api = webExt();
    const url = api?.runtime?.getURL?.(`_locales/${locale}/messages.json`)
      ?? `/_locales/${locale}/messages.json`;
    const res = await fetch(url);
    if (!res.ok) {
      cache.set(locale, {});
      return {};
    }
    const data = (await res.json()) as LocaleMessages;
    cache.set(locale, data);
    return data;
  } catch {
    cache.set(locale, {});
    return {};
  }
}

/**
 * popup / sidepanel / options の main.ts から起動時に await で呼ぶ。
 * Settings.uiLanguage を読んで messages を pre-load する。
 */
export async function initI18n(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const api = webExt();
    const stored = await api?.storage?.sync?.get?.('settings');
    const settings = stored?.['settings'] as { uiLanguage?: string } | undefined;
    currentLocale = settings?.uiLanguage ?? 'auto';
  } catch {
    currentLocale = 'auto';
  }
  if (currentLocale !== 'auto') {
    // pre-load 指定 locale + en (fallback)
    await Promise.all([loadLocale(currentLocale), loadLocale('en')]);
  }
  // Settings 変更時に reload
  webExt()?.storage?.onChanged?.addListener?.((changes, area) => {
    if (area !== 'sync' || !changes['settings']) return;
    const newSettings = changes['settings'].newValue as { uiLanguage?: string } | undefined;
    const next = newSettings?.uiLanguage ?? 'auto';
    if (next !== currentLocale) {
      currentLocale = next;
      if (next !== 'auto') void Promise.all([loadLocale(next), loadLocale('en')]);
    }
  });
}

function applyPlaceholders(entry: MessageEntry, subs: string[]): string {
  let s = entry.message;
  if (entry.placeholders) {
    for (const [name, info] of Object.entries(entry.placeholders)) {
      s = s.split(`$${name}$`).join(info.content);
    }
  }
  return s.replace(/\$(\d+)/g, (_, n) => subs[parseInt(n, 10) - 1] ?? '');
}

/**
 * key を翻訳。 placeholders ありの場合は subs を順番に当てる。
 * - currentLocale === 'auto' → chrome.i18n.getMessage (browser locale)
 * - そうでなければ cache の指定 locale → en fallback → key
 */
export function t(key: string, ...subs: (string | number)[]): string {
  const subStrs = subs.map(String);
  if (currentLocale === 'auto' || currentLocale === '') {
    const v = webExt()?.i18n?.getMessage?.(key, subStrs);
    if (v) return v;
    return key;
  }
  // override mode
  const localeMsgs = cache.get(currentLocale);
  const enMsgs = cache.get('en');
  const entry = localeMsgs?.[key] ?? enMsgs?.[key];
  if (entry) return applyPlaceholders(entry, subStrs);
  // 最終 fallback (init 前に呼ばれた等)
  return webExt()?.i18n?.getMessage?.(key, subStrs) || key;
}

/**
 * 31 言語の locale 定義。 Steam 言語ランキング上位 30 + Esperanto。
 * 表示は native script で (= 各言語 user が自分の言語を識別しやすい)。
 */
export const TUTTI_LOCALES: Array<{ code: string; nativeName: string; englishName: string }> = [
  { code: 'auto', nativeName: 'Auto', englishName: 'Auto (browser default)' },
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'zh_CN', nativeName: '简体中文', englishName: 'Simplified Chinese' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish (Spain)' },
  { code: 'es_419', nativeName: 'Español (Latinoamérica)', englishName: 'Spanish (Latin America)' },
  { code: 'pt_BR', nativeName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'fr', nativeName: 'Français', englishName: 'French' },
  { code: 'pl', nativeName: 'Polski', englishName: 'Polish' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese' },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean' },
  { code: 'zh_TW', nativeName: '繁體中文', englishName: 'Traditional Chinese' },
  { code: 'cs', nativeName: 'Čeština', englishName: 'Czech' },
  { code: 'uk', nativeName: 'Українська', englishName: 'Ukrainian' },
  { code: 'hu', nativeName: 'Magyar', englishName: 'Hungarian' },
  { code: 'th', nativeName: 'ไทย', englishName: 'Thai' },
  { code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese' },
  { code: 'pt_PT', nativeName: 'Português (Portugal)', englishName: 'Portuguese (Portugal)' },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch' },
  { code: 'sv', nativeName: 'Svenska', englishName: 'Swedish' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic' },
  { code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian' },
  { code: 'fi', nativeName: 'Suomi', englishName: 'Finnish' },
  { code: 'el', nativeName: 'Ελληνικά', englishName: 'Greek' },
  { code: 'bg', nativeName: 'Български', englishName: 'Bulgarian' },
  { code: 'no', nativeName: 'Norsk', englishName: 'Norwegian' },
  { code: 'ro', nativeName: 'Română', englishName: 'Romanian' },
  { code: 'da', nativeName: 'Dansk', englishName: 'Danish' },
  { code: 'eo', nativeName: 'Esperanto', englishName: 'Esperanto' },
];
