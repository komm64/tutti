# Tutti

> Allt krångel med korspostande, hanterat — ett Chrome-tillägg, elva nätverk.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Italiano](./README.it.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Nederlands](./README.nl.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Română](./README.ro.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

Tutti låter dig skriva en gång och sända samma inlägg till alla dina sociala nätverk med ett enda klick (11 nätverk som stöds). Text som överskrider gränsen delas automatiskt (X använder en korrekt svarskedja så att det blir en thread); bilder ändras automatiskt i storlek för varje plattforms begränsningar; videor inspekteras för längd / storlek, och överstora klipp transkoderas i farten med `ffmpeg.wasm`.

**Ditt inläggsinnehåll rör aldrig någon tredjepartsserver.**

🔒 [Integritetspolicy](https://komm64.github.io/tutti/)

## Funktioner

- 📤 **Multinätverkssändning** — skriv en gång, klicka en gång, posta till varje nätverk du valt (11 nätverk)
- ✂️ **Automatisk uppdelning för text över gräns** — numrerade som `(1/N)`, postade i sekvens. På X kopplas de som en **svarskedja (thread)**, på andra nätverk postas de oberoende
- `#hashtag`-gränser bevaras över uppdelningar / Bluesky får korrekta **rich-text facets** (klickbara taggar + URL annotations)
- 🖼️ **Upp till 4 bilder + automatisk storleksändring** — passar automatiskt in i strama gränser som Bluesys 1 MB-tak
- 🎬 **Videoinläggning + automatisk komprimering** — klipp över gränsen omkodas på plats av `ffmpeg.wasm` (i ett offscreen-dokument)
- 🔌 **Valfri officiell API-väg** — för Bluesky / Mastodon / Misskey, registrera autentiseringsuppgifter i Inställningar och Tutti postar via det publika API:et istället för DOM-skript (motståndskraftigt mot SNS UI-ändringar)
- 📊 **Direktfortskridning** — se varje nätverks status i realtid
- 🪪 **Visning av inloggat konto** — popupen visar från vilket konto varje nätverk kommer att posta (hjälper till att förhindra olyckor)
- 🛡️ **autoPost-omkopplare** — av som standard. Standardläget öppnar varje skapelsessida, fyller i kropp + bilagor, och **stannar precis innan postknappen klickas** ("förhandsgranskning"-läge) så att du kan upptäcka misstag
- 📜 **Inläggshistorik** — senaste 20 posterna sparas lokalt
- 💾 **Autosparade utkast** — din text överlever stängningen av popupen
- ⌨️ **Ctrl/Cmd + Enter för att posta**
- ⚙️ **Växling av Mastodon / Misskey-instanser** — peka på vilken instans som helst från Inställningar
- 🩹 **Selector-hotfix** — när ett SNS-DOM ändras och bryter en sökväg kan Tutti hämta en `selectors.json`-patch så att du inte behöver vänta på nästa tilläggsutgåva
- 🐞 **Bug-rapportknapp** — ett klick från popupen skickar in en GitHub-issue med en redigerad DOM-ögonblicksbild (auto-triage-pipelinen omvandlar det till en selector-PR)
- 🌐 **Lokaliserat** — 31 språk (popup + alternativ)

## Nätverk som stöds

11 nätverk. "Stable" betyder att verklig postning har verifierats från ände till ände; "Experimental" betyder att adaptern är ansluten men verklig postning med autoPost ännu inte är helt validerad. För Experimentella, börja i förhandsgranskningsläge (autoPost AV).

### Stable (verklig postning verifierad)

| Nätverk | text | image | shortVideo | longVideo | Sökväg |
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

### Experimental (endast adapter; verklig postning med autoPost ännu inte verifierad)

| Nätverk | text | image | shortVideo | longVideo | Sökväg |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti automatiserar SNS:ets webb-UI för skapande (mer känsligt för anti-bot-ändringar)
- **DOM + API**: Om du sparar autentiseringsuppgifter i Inställningar byter Tutti till det officiella API:et. Vid API-fel **återgår Tutti inte tyst till DOM** — du ser ett uttryckligt fel. Utan autentiseringsuppgifter körs endast DOM-vägen.
- **multi-step**: För modaler i guide-stil över flera steg (ramverk: `executeMultiStepFlow`)

## Installation

### Chrome Web Store

Publicerad (Unlisted): [Tutti i Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Uppackad / utvecklingsbyggnad

Ladda ner senaste zip-filen från [Releases](https://github.com/komm64/tutti/releases), sedan:

1. Packa upp den
2. Öppna `chrome://extensions/` (eller `brave://extensions/` i Brave)
3. Slå på "Utvecklarläge"
4. Klicka på "Läs in uppackat" och välj den uppackade mappen

## Support

Frågor, buggrapporter, funktionsförfrågningar: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

Eller mejla **contact@komm64.com**.

## Integritet

Inläggstext, bilder och video bearbetas **helt inom din webbläsare** — de skickas aldrig till någon tredjepartsserver. Se [integritetspolicyn](https://komm64.github.io/tutti/) för detaljer.

## Licens

[Alla rättigheter förbehållna](./LICENSE) — © 2026 komm64

Källkoden publiceras för transparens. Återdistribution, återanvändning eller modifiering är inte tillåten.

---

## Utveckling

Utvecklingsdokumentation (Stack, Commands, Layout) är på engelska i [README.md](./README.md).
