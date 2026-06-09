# Tutti

> Allt krångel med korspostande, hanterat — ett Chrome-tillägg, elva nätverk.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti låter dig skriva en gång och sända samma inlägg till alla dina sociala nätverk med ett enda klick (11 nätverk som stöds). Text som överskrider gränsen delas automatiskt (X använder en korrekt svarskedja så att det blir en thread); bilder ändras automatiskt i storlek för varje plattforms begränsningar; videor inspekteras för längd / storlek, och överstora klipp transkoderas i farten med `ffmpeg.wasm`.

**Ditt inläggsinnehåll rör aldrig någon tredjepartsserver.**

🔒 [Integritetspolicy](https://tutti.komm64.com/privacy.html)

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

Frågor, buggrapporter, funktionsförfrågningar: **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

Eller mejla **contact@komm64.com**.

## Integritet

Inläggstext, bilder och video bearbetas **helt inom din webbläsare** — de skickas aldrig till någon tredjepartsserver. Se [integritetspolicyn](https://tutti.komm64.com/privacy.html) för detaljer.

## Responsible Use and Disclaimer

Tutti assists posting actions that you initiate. You remain responsible for your content, selected accounts, and compliance with each platform's terms, rules, posting limits, community guidelines, and applicable laws. Automation, repeated or duplicate content, unauthorized content, or insufficient sensitive-content labeling can result in platform enforcement. Tutti is provided as is, without warranties, and liability is limited to the maximum extent permitted by law. Full terms: https://tutti.komm64.com/terms.html

## Licens

[Alla rättigheter förbehållna](./LICENSE) — © 2026 komm64

Källkoden publiceras för transparens. Återdistribution, återanvändning eller modifiering är inte tillåten.

---

## Utveckling

Utvecklingsdokumentation (Stack, Commands, Layout) är på engelska i [README.md](./README.md).
