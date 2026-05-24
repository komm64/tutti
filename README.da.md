# Tutti

> Alt besværet med krydspostning, klaret — én Chrome-udvidelse, elleve netværk.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Italiano](./README.it.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Nederlands](./README.nl.md) &middot; [Svenska](./README.sv.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Română](./README.ro.md) &middot; [Esperanto](./README.eo.md)

Tutti lader dig skrive én gang og sende det samme opslag til alle dine sociale netværk med ét enkelt klik (11 netværk understøttet). Tekst, der overskrider grænsen, opdeles automatisk (X bruger en ordentlig svar-kæde, så det bliver en thread); billeder størrelsesændres automatisk til hver platforms begrænsninger; videoer inspiceres for varighed / størrelse, og overstore klip transkodes på stedet med `ffmpeg.wasm`.

**Dit opslagsindhold rører aldrig nogen tredjepartsserver.**

🔒 [Privatlivspolitik](https://komm64.github.io/tutti/)

## Funktioner

- 📤 **Multinetværksudsendelse** — skriv én gang, klik én gang, post til hvert netværk du har valgt (11 netværk)
- ✂️ **Automatisk opdeling af tekst over grænsen** — nummereret som `(1/N)`, postet sekventielt. På X forbindes de som en **svar-kæde (thread)**, på andre netværk postes de uafhængigt
- `#hashtag`-grænser bevares på tværs af opdelinger / Bluesky får ordentlige **rich-text facets** (klikbare tags + URL annotations)
- 🖼️ **Op til 4 billeder + automatisk størrelsesændring** — passer automatisk ind i stramme grænser som Blueskys 1 MB-loft
- 🎬 **Videoopslag + automatisk komprimering** — overgrænse-klip genkodes på stedet af `ffmpeg.wasm` (i et offscreen-dokument)
- 🔌 **Valgfri officiel API-sti** — for Bluesky / Mastodon / Misskey, registrer legitimationsoplysninger i Indstillinger og Tutti poster via det offentlige API i stedet for DOM-scripting (modstandsdygtigt over for SNS UI-ændringer)
- 📊 **Live fremgang** — se hvert netværks status i realtid
- 🪪 **Visning af loggetind konto** — popupen viser, fra hvilken konto hvert netværk vil poste (hjælper med at forhindre uheld)
- 🛡️ **autoPost-skifter** — slået fra som standard. Standardtilstanden åbner hver komposititionsside, udfylder krop + vedhæftninger og **stopper lige før klik på postknappen** ("forhåndsvisning"-tilstand), så du kan spotte fejl
- 📜 **Opslagshistorik** — sidste 20 poster gemt lokalt
- 💾 **Autogemte kladder** — din tekst overlever lukning af popupen
- ⌨️ **Ctrl/Cmd + Enter for at poste**
- ⚙️ **Mastodon / Misskey-instansskift** — peg på enhver instans fra Indstillinger
- 🩹 **Selector-hotfix** — når en SNS-DOM ændres og bryder en sti, kan Tutti hente en `selectors.json`-patch, så du ikke behøver vente på næste udvidelsesudgivelse
- 🐞 **Bug-rapporteringsknap** — ét klik fra popupen indsender en GitHub-issue med et redigeret DOM-snapshot (auto-triage-pipelinen omdanner det til en selector-PR)
- 🌐 **Lokaliseret** — 31 sprog (popup + indstillinger)

## Understøttede netværk

11 netværk. "Stable" betyder, at egentlig posting er verificeret ende-til-ende; "Experimental" betyder, at adapteren er tilsluttet, men egentlig posting med autoPost endnu ikke er fuldt valideret. For Experimental, start i forhåndsvisningstilstand (autoPost FRA).

### Stable (egentlig posting verificeret)

| Netværk | text | image | shortVideo | longVideo | Sti |
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

### Experimental (kun adapter; egentlig posting med autoPost endnu ikke verificeret)

| Netværk | text | image | shortVideo | longVideo | Sti |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti automatiserer SNS'ets web-UI til komposition (mere følsom over for anti-bot-ændringer)
- **DOM + API**: Hvis du gemmer legitimationsoplysninger i Indstillinger, skifter Tutti til det officielle API. Ved API-fejl **falder Tutti ikke tavst tilbage til DOM** — du vil se en eksplicit fejl. Uden legitimationsoplysninger køres kun DOM-stien.
- **multi-step**: Til guide-stilmodaler over flere trin (ramme: `executeMultiStepFlow`)

## Installation

### Chrome Web Store

Udgivet (Unlisted): [Tutti i Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Udpakket / udviklingsbuild

Download den nyeste zip fra [Releases](https://github.com/komm64/tutti/releases), så:

1. Pak den ud
2. Åbn `chrome://extensions/` (eller `brave://extensions/` i Brave)
3. Slå "Udviklertilstand" til
4. Klik på "Indlæs udpakket" og vælg den udpakkede mappe

## Support

Spørgsmål, fejlrapporter, funktionsanmodninger: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

Eller mail til **contact@komm64.com**.

## Privatliv

Opslagstekst, billeder og video behandles **helt inden i din browser** — de sendes aldrig til nogen tredjepartsserver. Se [privatlivspolitikken](https://komm64.github.io/tutti/) for detaljer.

## Licens

[Alle rettigheder forbeholdes](./LICENSE) — © 2026 komm64

Kildekoden offentliggøres for gennemsigtighed. Videredistribution, genbrug eller modifikation er ikke tilladt.

---

## Udvikling

Udviklingsdokumentation (Stack, Commands, Layout) er på engelsk i [README.md](./README.md).
