# Tutti

> Veškeré starosti s křížovým publikováním vyřešeny — jedno rozšíření Chrome, jedenáct sítí.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Italiano](./README.it.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Nederlands](./README.nl.md) &middot; [Svenska](./README.sv.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Română](./README.ro.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

Tutti vám umožní napsat jednou a rozeslat stejný příspěvek do všech vašich sociálních sítí jediným kliknutím (podporováno 11 sítí). Text překračující limit je automaticky rozdělen (X používá řádný řetězec odpovědí, takže se stane thread); obrázky jsou automaticky přizpůsobeny omezením každé platformy; videa jsou zkontrolována z hlediska délky / velikosti a příliš velké klipy jsou transkódovány za běhu pomocí `ffmpeg.wasm`.

**Obsah vašich příspěvků se nikdy nedotkne žádného serveru třetí strany.**

🔒 [Zásady ochrany soukromí](https://komm64.github.io/tutti/)

## Funkce

- 📤 **Vícesíťové vysílání** — napište jednou, klikněte jednou, publikujte do každé vybrané sítě (11 sítí)
- ✂️ **Automatické dělení pro text nad limitem** — očíslováno jako `(1/N)`, publikováno sekvenčně. Na X jsou spojeny jako **řetězec odpovědí (thread)**, v jiných sítích jsou publikovány nezávisle
- Hranice `#hashtag` jsou zachovány napříč děleními / Bluesky dostává řádné **rich-text facets** (klikatelné tagy + URL annotations)
- 🖼️ **Až 4 obrázky + automatická změna velikosti** — automaticky se vejde do těsných limitů, jako je strop 1 MB Bluesky
- 🎬 **Publikování videa + automatická komprese** — klipy nad limitem jsou znovu kódovány na místě pomocí `ffmpeg.wasm` (v offscreen dokumentu)
- 🔌 **Volitelná cesta oficiálního API** — pro Bluesky / Mastodon / Misskey registrujte přihlašovací údaje v Nastavení a Tutti publikuje přes veřejné API místo skriptování DOM (odolné vůči změnám UI SNS)
- 📊 **Živý průběh** — sledujte stav každé sítě v reálném čase
- 🪪 **Zobrazení přihlášeného účtu** — popup ukazuje, ze kterého účtu bude každá síť publikovat (pomáhá předcházet nehodám)
- 🛡️ **Přepínač autoPost** — ve výchozím nastavení vypnut. Výchozí režim otevře každou stránku vytváření, vyplní tělo + přílohy a **zastaví těsně před kliknutím na tlačítko publikace** (režim "náhledu"), abyste mohli zachytit chyby
- 📜 **Historie příspěvků** — posledních 20 záznamů uloženo lokálně
- 💾 **Automaticky ukládané koncepty** — váš text přežije zavření popup
- ⌨️ **Ctrl/Cmd + Enter pro publikaci**
- ⚙️ **Přepínání instancí Mastodon / Misskey** — ukažte na libovolnou instanci z Nastavení
- 🩹 **Hot-fix selektorů** — když se DOM SNS změní a rozbije cestu, Tutti může načíst patch `selectors.json`, takže nemusíte čekat na další vydání rozšíření
- 🐞 **Tlačítko hlášení chyb** — jedním kliknutím z popup podá GitHub issue s redigovaným DOM snapshotem (potrubí auto-triage to promění v PR selektoru)
- 🌐 **Lokalizováno** — 31 jazyků (popup + možnosti)

## Podporované sítě

11 sítí. "Stable" znamená, že skutečné publikování bylo ověřeno end-to-end; "Experimental" znamená, že adaptér je propojen, ale skutečné publikování s autoPost ještě nebylo plně validováno. Pro Experimental začněte v režimu náhledu (autoPost VYP).

### Stable (skutečné publikování ověřeno)

| Síť | text | image | shortVideo | longVideo | Cesta |
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

### Experimental (pouze adaptér; skutečné publikování s autoPost ještě neověřeno)

| Síť | text | image | shortVideo | longVideo | Cesta |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti automatizuje webové UI vytváření SNS (citlivější na anti-bot změny)
- **DOM + API**: Pokud uložíte přihlašovací údaje v Nastavení, Tutti přepne na oficiální API. Při selhání API se Tutti **tiše nevrací k DOM** — uvidíte explicitní chybu. Bez přihlašovacích údajů se spouští pouze cesta DOM.
- **multi-step**: Pro modální okna ve stylu průvodce přes několik kroků (framework: `executeMultiStepFlow`)

## Instalace

### Chrome Web Store

Publikováno (Unlisted): [Tutti ve Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Rozbalená / vývojová sestava

Stáhněte nejnovější zip z [Releases](https://github.com/komm64/tutti/releases), poté:

1. Rozbalte ji
2. Otevřete `chrome://extensions/` (nebo `brave://extensions/` v Brave)
3. Zapněte "Vývojářský režim"
4. Klikněte na "Načíst rozbalené" a vyberte rozbalenou složku

## Podpora

Dotazy, hlášení chyb, požadavky na funkce: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

Nebo pište na **contact@komm64.com**.

## Soukromí

Text příspěvků, obrázky a video jsou zpracovávány **zcela uvnitř vašeho prohlížeče** — nikdy nejsou odesílány na žádný server třetí strany. Podrobnosti viz [zásady ochrany soukromí](https://komm64.github.io/tutti/).

## Licence

[Všechna práva vyhrazena](./LICENSE) — © 2026 komm64

Zdrojový kód je publikován z důvodu transparentnosti. Redistribuce, opětovné použití nebo úprava není povolena.

---

## Vývoj

Dokumentace pro vývojáře (Stack, Commands, Layout) je v angličtině v [README.md](./README.md).
