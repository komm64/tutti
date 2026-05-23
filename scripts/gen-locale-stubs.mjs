/**
 * 31 言語対応 (v0.5.2) のための _locales/<code>/messages.json stub generator。
 *
 * 各 locale dir に最低限の翻訳を入れる:
 * - appName (universally "Tutti", proper noun)
 * - appDescription (CWS listing で出る短い説明)
 * - appTagline
 * - 主要 UI 20 strings (popup/options で最も visible なもの)
 *
 * 残り ~200 keys は en に fallback (Chrome i18n の default_locale が en なので)
 * 未翻訳でも user は機能を使える、 community が PR で各 locale 補完する流れ。
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// (code, appDescription, appTagline) per locale。 残りは下の SHARED_KEYS で。
const LOCALES = [
  ['zh_CN', '一键将文本、图片、视频同时跨平台发布到多个社交网络的 Chrome 扩展。', '一键跨平台发布。'],
  ['es', 'Una extensión de Chrome que se encarga de la molestia de publicar en varias redes sociales a la vez.', 'Publicación cruzada, sin complicaciones.'],
  ['es_419', 'Una extensión de Chrome que se encarga de la molestia de publicar en varias redes sociales a la vez.', 'Publicación cruzada, sin complicaciones.'],
  ['pt_BR', 'Uma extensão do Chrome que tira o trabalho de publicar em várias redes sociais ao mesmo tempo.', 'Postagem cruzada, sem complicação.'],
  ['pt_PT', 'Uma extensão do Chrome que trata da maçada de publicar em várias redes sociais em simultâneo.', 'Publicação cruzada, sem complicações.'],
  ['ru', 'Расширение Chrome, избавляющее от хлопот при кросспостинге в несколько социальных сетей.', 'Кросспостинг без хлопот.'],
  ['de', 'Eine Chrome-Erweiterung, die das Cross-Posting in mehrere soziale Netzwerke übernimmt.', 'Cross-Posting, ganz ohne Aufwand.'],
  ['fr', 'Une extension Chrome qui prend en charge la publication croisée sur plusieurs réseaux sociaux.', 'Publication multi-réseaux, sans souci.'],
  ['pl', 'Rozszerzenie Chrome, które przejmuje trudy publikowania w wielu sieciach społecznościowych jednocześnie.', 'Crossposting bez kłopotów.'],
  ['tr', 'Birden fazla sosyal ağa aynı anda paylaşım yapmanın derdini üstlenen bir Chrome eklentisi.', 'Çapraz paylaşım, dertsiz.'],
  ['it', "Un'estensione Chrome che si occupa di pubblicare su più social network contemporaneamente.", 'Cross-posting senza fatica.'],
  ['ko', '여러 소셜 네트워크에 동시에 게시하는 번거로움을 대신 처리하는 Chrome 확장 프로그램입니다.', '크로스 포스팅의 번거로움, 한 번에 해결.'],
  ['zh_TW', '一鍵將文字、圖片、影片同時跨平台發布到多個社群網路的 Chrome 擴充功能。', '一鍵跨平台發布。'],
  ['cs', 'Rozšíření Chrome, které vás zbaví starostí s publikováním na více sociálních sítích současně.', 'Sdílení na více sítí bez starostí.'],
  ['uk', 'Розширення Chrome, що позбавляє клопоту з кросспостингу в кілька соціальних мереж.', 'Кросспостинг без клопоту.'],
  ['hu', 'Chrome-bővítmény, amely átveszi a több közösségi hálózatra történő egyidejű posztolás gondját.', 'Keresztposztolás gond nélkül.'],
  ['th', 'ส่วนขยาย Chrome ที่จัดการความวุ่นวายในการโพสต์ไปยังโซเชียลเน็ตเวิร์กหลายแห่งพร้อมกัน', 'โพสต์ข้ามแพลตฟอร์ม แบบไม่ยุ่งยาก'],
  ['vi', 'Tiện ích mở rộng Chrome xử lý mọi rắc rối khi đăng bài lên nhiều mạng xã hội cùng lúc.', 'Đăng chéo, không phiền hà.'],
  ['nl', 'Een Chrome-extensie die het gedoe van crossposten naar meerdere sociale netwerken voor je regelt.', 'Crossposten zonder gedoe.'],
  ['sv', 'Ett Chrome-tillägg som tar hand om besväret med att korsposta till flera sociala nätverk.', 'Korspostande utan krångel.'],
  ['ar', 'إضافة Chrome تتولى عناء النشر المتقاطع على شبكات التواصل الاجتماعي المتعددة في وقت واحد.', 'النشر المتقاطع بدون متاعب.'],
  ['id', 'Ekstensi Chrome yang menangani kerumitan posting ke beberapa jejaring sosial sekaligus.', 'Posting silang, tanpa repot.'],
  ['fi', 'Chrome-laajennus, joka hoitaa puolestasi useaan sosiaaliseen verkostoon julkaisemisen vaivan.', 'Ristijulkaisu vaivatta.'],
  ['el', 'Επέκταση Chrome που αναλαμβάνει τον κόπο της ταυτόχρονης δημοσίευσης σε πολλά κοινωνικά δίκτυα.', 'Διασταυρούμενες δημοσιεύσεις, χωρίς κόπο.'],
  ['bg', 'Разширение за Chrome, което поема грижата за публикуване в множество социални мрежи едновременно.', 'Кръстосано публикуване без главоболия.'],
  ['no', 'En Chrome-utvidelse som tar seg av bryderiet med å krysspostere til flere sosiale nettverk.', 'Krysspostering uten styr.'],
  ['ro', 'O extensie Chrome care se ocupă de bătaia de cap de a publica simultan pe mai multe rețele sociale.', 'Cross-posting fără bătăi de cap.'],
  ['da', 'En Chrome-udvidelse, der tager besværet ud af at krydsposte til flere sociale netværk.', 'Krydsposting uden besvær.'],
  ['eo', 'Chrome-etendaĵo, kiu transprenas la ĉagrenon de samtempa afiŝado al pluraj sociaj retoj.', 'Trans-afiŝado, sen ĉagreno.'],
];

// Major UI strings translated per locale. Mapping per key.
// Format: { key: { locale: translation } }
const UI_TRANSLATIONS = {
  appTagline: {
    // value already in appTagline argument above, this is for runtime UI (same)
  },
  textareaPlaceholder: {
    zh_CN: '撰写你的帖子...', es: 'Escribe tu publicación...', es_419: 'Escribe tu publicación...',
    pt_BR: 'Escreva seu post...', pt_PT: 'Escreva a sua publicação...',
    ru: 'Напишите свой пост...', de: 'Schreibe deinen Beitrag...',
    fr: 'Écris ton message...', pl: 'Napisz swój post...', tr: 'Gönderini yaz...',
    it: 'Scrivi il tuo post...', ko: '게시물을 작성하세요...',
    zh_TW: '撰寫你的貼文...', cs: 'Napiš svůj příspěvek...',
    uk: 'Напишіть свій пост...', hu: 'Írd be a bejegyzésed...',
    th: 'เขียนโพสต์ของคุณ...', vi: 'Viết bài đăng của bạn...',
    nl: 'Schrijf je bericht...', sv: 'Skriv ditt inlägg...',
    ar: 'اكتب منشورك...', id: 'Tulis postinganmu...',
    fi: 'Kirjoita julkaisusi...', el: 'Γράψε την ανάρτησή σου...',
    bg: 'Напиши публикацията си...', no: 'Skriv innlegget ditt...',
    ro: 'Scrie postarea ta...', da: 'Skriv dit opslag...',
    eo: 'Skribu vian afiŝon...',
  },
  headerHistory: {
    zh_CN: '历史', es: 'Historial', es_419: 'Historial',
    pt_BR: 'Histórico', pt_PT: 'Histórico',
    ru: 'История', de: 'Verlauf', fr: 'Historique', pl: 'Historia',
    tr: 'Geçmiş', it: 'Cronologia', ko: '기록',
    zh_TW: '歷史', cs: 'Historie', uk: 'Історія', hu: 'Előzmények',
    th: 'ประวัติ', vi: 'Lịch sử', nl: 'Geschiedenis', sv: 'Historik',
    ar: 'السجل', id: 'Riwayat', fi: 'Historia', el: 'Ιστορικό',
    bg: 'История', no: 'Historikk', ro: 'Istoric', da: 'Historik',
    eo: 'Historio',
  },
  headerSettings: {
    zh_CN: '设置', es: 'Configuración', es_419: 'Configuración',
    pt_BR: 'Configurações', pt_PT: 'Definições',
    ru: 'Настройки', de: 'Einstellungen', fr: 'Paramètres', pl: 'Ustawienia',
    tr: 'Ayarlar', it: 'Impostazioni', ko: '설정',
    zh_TW: '設定', cs: 'Nastavení', uk: 'Налаштування', hu: 'Beállítások',
    th: 'การตั้งค่า', vi: 'Cài đặt', nl: 'Instellingen', sv: 'Inställningar',
    ar: 'الإعدادات', id: 'Pengaturan', fi: 'Asetukset', el: 'Ρυθμίσεις',
    bg: 'Настройки', no: 'Innstillinger', ro: 'Setări', da: 'Indstillinger',
    eo: 'Agordoj',
  },
  posting: {
    zh_CN: '发布中...', es: 'Publicando...', es_419: 'Publicando...',
    pt_BR: 'Postando...', pt_PT: 'A publicar...',
    ru: 'Публикация...', de: 'Wird gepostet...', fr: 'Publication...',
    pl: 'Publikowanie...', tr: 'Gönderiliyor...', it: 'Pubblicazione...',
    ko: '게시 중...', zh_TW: '發布中...', cs: 'Publikování...',
    uk: 'Публікація...', hu: 'Posztolás...', th: 'กำลังโพสต์...',
    vi: 'Đang đăng...', nl: 'Plaatsen...', sv: 'Publicerar...',
    ar: 'جارٍ النشر...', id: 'Memposting...', fi: 'Julkaistaan...',
    el: 'Δημοσίευση...', bg: 'Публикуване...', no: 'Publiserer...',
    ro: 'Se postează...', da: 'Sender...', eo: 'Afiŝante...',
  },
  previewing: {
    zh_CN: '预览中...', es: 'Vista previa...', es_419: 'Vista previa...',
    pt_BR: 'Visualizando...', pt_PT: 'A pré-visualizar...',
    ru: 'Предпросмотр...', de: 'Vorschau...', fr: 'Aperçu...',
    pl: 'Podgląd...', tr: 'Önizleniyor...', it: 'Anteprima...',
    ko: '미리보기...', zh_TW: '預覽中...', cs: 'Náhled...',
    uk: 'Перегляд...', hu: 'Előnézet...', th: 'กำลังแสดงตัวอย่าง...',
    vi: 'Đang xem trước...', nl: 'Voorbeeld...', sv: 'Förhandsgranskar...',
    ar: 'جارٍ المعاينة...', id: 'Pratinjau...', fi: 'Esikatselu...',
    el: 'Προεπισκόπηση...', bg: 'Преглед...', no: 'Forhåndsviser...',
    ro: 'Previzualizare...', da: 'Forhåndsviser...', eo: 'Antaŭmontrante...',
  },
  save: {
    zh_CN: '保存', es: 'Guardar', es_419: 'Guardar', pt_BR: 'Salvar',
    pt_PT: 'Guardar', ru: 'Сохранить', de: 'Speichern', fr: 'Enregistrer',
    pl: 'Zapisz', tr: 'Kaydet', it: 'Salva', ko: '저장',
    zh_TW: '儲存', cs: 'Uložit', uk: 'Зберегти', hu: 'Mentés',
    th: 'บันทึก', vi: 'Lưu', nl: 'Opslaan', sv: 'Spara',
    ar: 'حفظ', id: 'Simpan', fi: 'Tallenna', el: 'Αποθήκευση',
    bg: 'Запиши', no: 'Lagre', ro: 'Salvează', da: 'Gem',
    eo: 'Konservi',
  },
  saved: {
    zh_CN: '已保存', es: 'Guardado', es_419: 'Guardado', pt_BR: 'Salvo',
    pt_PT: 'Guardado', ru: 'Сохранено', de: 'Gespeichert',
    fr: 'Enregistré', pl: 'Zapisano', tr: 'Kaydedildi', it: 'Salvato',
    ko: '저장됨', zh_TW: '已儲存', cs: 'Uloženo', uk: 'Збережено',
    hu: 'Mentve', th: 'บันทึกแล้ว', vi: 'Đã lưu', nl: 'Opgeslagen',
    sv: 'Sparat', ar: 'تم الحفظ', id: 'Tersimpan', fi: 'Tallennettu',
    el: 'Αποθηκεύτηκε', bg: 'Записано', no: 'Lagret', ro: 'Salvat',
    da: 'Gemt', eo: 'Konservita',
  },
  uiLanguageTitle: {
    zh_CN: 'Tutti UI 语言', es: 'Idioma de Tutti', es_419: 'Idioma de Tutti',
    pt_BR: 'Idioma do Tutti', pt_PT: 'Idioma do Tutti',
    ru: 'Язык Tutti', de: 'Tutti-Sprache', fr: 'Langue de Tutti',
    pl: 'Język Tutti', tr: 'Tutti dili', it: 'Lingua di Tutti',
    ko: 'Tutti UI 언어', zh_TW: 'Tutti UI 語言', cs: 'Jazyk Tutti',
    uk: 'Мова Tutti', hu: 'Tutti nyelve', th: 'ภาษา Tutti',
    vi: 'Ngôn ngữ Tutti', nl: 'Tutti-taal', sv: 'Tutti-språk',
    ar: 'لغة Tutti', id: 'Bahasa Tutti', fi: 'Tutti-kieli',
    el: 'Γλώσσα Tutti', bg: 'Език на Tutti', no: 'Tutti-språk',
    ro: 'Limbă Tutti', da: 'Tutti-sprog', eo: 'Tutti-lingvo',
  },
  uiLanguageAuto: {
    zh_CN: '自动 (浏览器默认)', es: 'Automático (predeterminado del navegador)',
    es_419: 'Automático (predeterminado del navegador)',
    pt_BR: 'Automático (padrão do navegador)', pt_PT: 'Automático (padrão do navegador)',
    ru: 'Авто (по умолчанию браузера)', de: 'Automatisch (Browser-Standard)',
    fr: 'Auto (langue du navigateur)', pl: 'Automatycznie (domyślny język przeglądarki)',
    tr: 'Otomatik (tarayıcı varsayılanı)', it: 'Automatico (predefinito del browser)',
    ko: '자동 (브라우저 기본)', zh_TW: '自動 (瀏覽器預設)',
    cs: 'Automaticky (výchozí pro prohlížeč)', uk: 'Авто (за замовчуванням браузера)',
    hu: 'Automatikus (böngésző alapértelmezett)', th: 'อัตโนมัติ (ค่าเริ่มต้นของเบราว์เซอร์)',
    vi: 'Tự động (mặc định của trình duyệt)', nl: 'Automatisch (browser-standaard)',
    sv: 'Automatiskt (webbläsarens standard)', ar: 'تلقائي (افتراضي المتصفح)',
    id: 'Otomatis (default browser)', fi: 'Automaattinen (selaimen oletus)',
    el: 'Αυτόματη (προεπιλογή προγράμματος περιήγησης)', bg: 'Автоматично (по подразбиране на браузъра)',
    no: 'Automatisk (nettleserens standard)', ro: 'Automat (implicit browser)',
    da: 'Automatisk (browser-standard)', eo: 'Aŭtomata (defaŭlta de retumilo)',
  },
};

const ROOT = process.cwd();
const LOCALES_DIR = join(ROOT, 'public/_locales');

for (const [code, appDescription, appTagline] of LOCALES) {
  const dir = join(LOCALES_DIR, code);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'messages.json');
  if (existsSync(path)) {
    console.log(`skip ${code} (exists)`);
    continue;
  }
  const entries = {
    appName: { message: 'Tutti' },
    appDescription: { message: appDescription },
    appTagline: { message: appTagline },
  };
  for (const [key, perLocale] of Object.entries(UI_TRANSLATIONS)) {
    if (perLocale[code]) entries[key] = { message: perLocale[code] };
  }
  writeFileSync(path, JSON.stringify(entries, null, 2) + '\n');
  console.log(`generated ${code} (${Object.keys(entries).length} keys)`);
}
