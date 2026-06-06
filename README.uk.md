# Tutti

> Усі клопоти крос-постингу вирішено — одне розширення Chrome, одинадцять мереж.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti дозволяє написати один раз і розіслати той самий допис у всі ваші соцмережі одним кліком (підтримується 11 мереж). Текст, що перевищує ліміт, автоматично розбивається (X використовує правильний ланцюг відповідей, тож це стає thread); зображення автоматично змінюються під обмеження кожної платформи; відео перевіряються за тривалістю / розміром, а завеликі кліпи перекодуються на льоту за допомогою `ffmpeg.wasm`.

**Вміст ваших дописів ніколи не торкається жодного стороннього сервера.**

🔒 [Політика конфіденційності](https://tutti.komm64.com/privacy.html)

## Можливості

- 📤 **Розсилка по багатьох мережах** — напишіть один раз, клацніть один раз, опублікуйте в кожну вибрану мережу (11 мереж)
- ✂️ **Автоматичне розділення тексту понад ліміт** — пронумеровані як `(1/N)`, публікуються послідовно. На X вони з'єднуються як **ланцюг відповідей (thread)**, в інших мережах публікуються незалежно
- Межі `#hashtag` зберігаються при розділенні / Bluesky отримує правильні **rich-text facets** (клікабельні теги + URL annotations)
- 🖼️ **До 4 зображень + автоматична зміна розміру** — автоматично вписується у суворі обмеження, такі як ліміт 1 МБ Bluesky
- 🎬 **Публікація відео + автоматичне стискання** — кліпи понад ліміт перекодуються на місці `ffmpeg.wasm` (в офскрин-документі)
- 🔌 **Опціональний шлях через офіційний API** — для Bluesky / Mastodon / Misskey зареєструйте облікові дані в Налаштуваннях, і Tutti публікує через публічний API замість DOM-скриптингу (стійкий до змін UI SNS)
- 📊 **Прогрес у реальному часі** — бачите статус кожної мережі в реальному часі
- 🪪 **Відображення увійшовшого облікового запису** — popup показує, з якого облікового запису публікуватиметься кожна мережа (допомагає запобігти випадковостям)
- 🛡️ **Перемикач autoPost** — вимкнено за замовчуванням. Режим за замовчуванням відкриває кожну сторінку створення, заповнює тіло + вкладення і **зупиняється прямо перед натисканням кнопки публікації** (режим "попереднього перегляду"), щоб ви могли помітити помилки
- 📜 **Історія дописів** — останні 20 записів збережено локально
- 💾 **Автозбережені чернетки** — ваш текст переживає закриття popup
- ⌨️ **Ctrl/Cmd + Enter для публікації**
- ⚙️ **Перемикання інстансів Mastodon / Misskey** — вкажіть на будь-який інстанс з Налаштувань
- 🩹 **Hot-fix селекторів** — коли DOM SNS змінюється і ламає шлях, Tutti може отримати патч `selectors.json`, щоб вам не потрібно було чекати наступного релізу розширення
- 🐞 **Кнопка звіту про помилки** — один клік з popup надсилає GitHub issue з відредагованим DOM-знімком (auto-triage конвеєр перетворює це на PR селектора)
- 🌐 **Локалізований** — 31 мова (popup + опції)

## Підтримувані мережі

11 мереж. "Stable" означає, що справжню публікацію перевірено end-to-end; "Experimental" означає, що адаптер підключений, але справжню публікацію з autoPost ще не повністю валідовано. Для Experimental починайте в режимі попереднього перегляду (autoPost ВИМК).

### Stable (справжня публікація перевірена)

| Мережа | text | image | shortVideo | longVideo | Шлях |
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

### Experimental (лише адаптер; справжня публікація з autoPost ще не перевірена)

| Мережа | text | image | shortVideo | longVideo | Шлях |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti автоматизує веб-UI створення SNS (більш чутливий до анти-бот змін)
- **DOM + API**: Якщо ви збережете облікові дані в Налаштуваннях, Tutti перемкнеться на офіційний API. При збої API Tutti **не повертається тихо до DOM** — ви побачите явну помилку. Без облікових даних запускається лише DOM-шлях.
- **multi-step**: Для модальних вікон у стилі майстра на кількох кроках (фреймворк: `executeMultiStepFlow`)

## Встановлення

### Chrome Web Store

Опубліковано (Unlisted): [Tutti у Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Розпакована / dev-збірка

Завантажте останній zip з [Releases](https://github.com/komm64/tutti/releases), потім:

1. Розпакуйте його
2. Відкрийте `chrome://extensions/` (або `brave://extensions/` у Brave)
3. Увімкніть "Режим розробника"
4. Натисніть "Завантажити розпаковане розширення" і виберіть розпаковану папку

## Підтримка

Питання, звіти про помилки, запити функцій: **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

Або надішліть email на **contact@komm64.com**.

## Конфіденційність

Текст дописів, зображення та відео обробляються **повністю всередині вашого браузера** — вони ніколи не надсилаються на жоден сторонній сервер. Див. [політику конфіденційності](https://tutti.komm64.com/privacy.html) для деталей.

## Ліцензія

[Усі права захищені](./LICENSE) — © 2026 komm64

Вихідний код опубліковано для прозорості. Перерозповсюдження, повторне використання або модифікація не дозволені.

---

## Розробка

Документація для розробників (Stack, Commands, Layout) англійською в [README.md](./README.md).
