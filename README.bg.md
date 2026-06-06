# Tutti

> Цялата мъка от крос-постване, решена — едно разширение за Chrome, единадесет мрежи.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti ви позволява да напишете веднъж и да излъчите една и съща публикация във всичките си социални мрежи с едно кликване (поддържат се 11 мрежи). Текстът, превишаващ лимита, се разделя автоматично (X използва правилна верига от отговори, така че да се превърне в thread); изображенията се преоразмеряват автоматично към ограниченията на всяка платформа; видеата се проверяват за продължителност / размер, а прекалено големите клипове се транскодират в движение с `ffmpeg.wasm`.

**Съдържанието на вашите публикации никога не докосва сървър на трета страна.**

🔒 [Политика за поверителност](https://tutti.komm64.com/privacy.html)

## Функции

- 📤 **Мрежово излъчване** — напишете веднъж, кликнете веднъж, публикувайте във всяка избрана мрежа (11 мрежи)
- ✂️ **Автоматично разделяне за надвишен текст** — номерирани като `(1/N)`, публикувани последователно. В X се свързват като **верига от отговори (thread)**, в други мрежи се публикуват независимо
- Границите на `#hashtag` се запазват през разделянията / Bluesky получава правилни **rich-text facets** (кликаеми тагове + URL annotations)
- 🖼️ **До 4 изображения + автоматично преоразмеряване** — автоматично се вписва в строги лимити като тавана от 1 MB на Bluesky
- 🎬 **Публикуване на видео + автоматична компресия** — клипове с надвишен лимит се прекодират на място от `ffmpeg.wasm` (в offscreen документ)
- 🔌 **Опционален път през официален API** — за Bluesky / Mastodon / Misskey регистрирайте пълномощия в Настройки и Tutti публикува през публичния API вместо DOM скриптинг (устойчив на промени в UI на SNS)
- 📊 **Прогрес на живо** — вижте статуса на всяка мрежа в реално време
- 🪪 **Показване на влязъл акаунт** — popup показва от кой акаунт ще публикува всяка мрежа (помага за предотвратяване на инциденти)
- 🛡️ **Превключвател autoPost** — изключен по подразбиране. Режимът по подразбиране отваря всяка страница за съставяне, попълва тялото + прикачените файлове и **спира точно преди натискане на бутона за публикуване** (режим "преглед"), за да можете да забележите грешки
- 📜 **История на публикации** — последните 20 записа запазени локално
- 💾 **Автоматично запазени чернови** — текстът ви оцелява затварянето на popup
- ⌨️ **Ctrl/Cmd + Enter за публикуване**
- ⚙️ **Превключване на инстанции Mastodon / Misskey** — посочете към която и да е инстанция от Настройки
- 🩹 **Hot-fix на селектори** — когато DOM на SNS се промени и счупи път, Tutti може да изтегли пач `selectors.json`, така че да не се налага да чакате следващото издание на разширението
- 🐞 **Бутон за докладване на бъгове** — едно кликване от popup подава GitHub issue с редактирана DOM снимка (auto-triage конвейерът го превръща в PR на селектор)
- 🌐 **Локализирано** — 31 езика (popup + опции)

## Поддържани мрежи

11 мрежи. "Stable" означава, че реалното публикуване е проверено end-to-end; "Experimental" означава, че адаптерът е свързан, но реалното публикуване с autoPost все още не е напълно валидирано. За Experimental започнете в режим за преглед (autoPost ИЗКЛ).

### Stable (реално публикуване проверено)

| Мрежа | text | image | shortVideo | longVideo | Път |
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

### Experimental (само адаптер; реално публикуване с autoPost все още не проверено)

| Мрежа | text | image | shortVideo | longVideo | Път |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti автоматизира уеб UI за съставяне на SNS (по-чувствителен към анти-бот промени)
- **DOM + API**: Ако запазите пълномощия в Настройки, Tutti преминава към официалния API. При неуспех на API Tutti **не се връща тихо към DOM** — ще видите явна грешка. Без пълномощия се изпълнява само пътят DOM.
- **multi-step**: За модални прозорци в стил wizard през няколко стъпки (рамка: `executeMultiStepFlow`)

## Инсталация

### Chrome Web Store

Публикувано (Unlisted): [Tutti в Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Разопакована / dev сборка

Изтеглете най-новия zip от [Releases](https://github.com/komm64/tutti/releases), след това:

1. Разопаковайте го
2. Отворете `chrome://extensions/` (или `brave://extensions/` в Brave)
3. Включете "Режим за разработчици"
4. Кликнете "Зареждане на разопакован" и изберете разопакованата папка

## Поддръжка

Въпроси, доклади за грешки, заявки за функции: **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

Или пишете на **contact@komm64.com**.

## Поверителност

Текстът на публикациите, изображенията и видеото се обработват **изцяло във вашия браузър** — никога не се изпращат на сървър на трета страна. За подробности вижте [политиката за поверителност](https://tutti.komm64.com/privacy.html).

## Лиценз

[Всички права запазени](./LICENSE) — © 2026 komm64

Изходният код е публикуван с цел прозрачност. Преразпространение, повторна употреба или модификация не са позволени.

---

## Разработка

Документация за разработчици (Stack, Commands, Layout) е на английски в [README.md](./README.md).
