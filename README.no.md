# Tutti

> Alt bryet med krysspost, håndtert — én Chrome-utvidelse, elleve nettverk.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Italiano](./README.it.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Nederlands](./README.nl.md) &middot; [Svenska](./README.sv.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Română](./README.ro.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

Tutti lar deg skrive én gang og kringkaste det samme innlegget til alle dine sosiale nettverk med ett enkelt klikk (11 nettverk støttet). Tekst som overskrider grensen deles automatisk (X bruker en ordentlig svarkjede slik at det blir en thread); bilder endres automatisk i størrelse til hver plattforms begrensninger; videoer inspiseres for varighet / størrelse, og for store klipp transkodes på sparket med `ffmpeg.wasm`.

**Innleggsinnholdet ditt berører aldri noen tredjepartsserver.**

🔒 [Personvernerklæring](https://komm64.github.io/tutti/)

## Funksjoner

- 📤 **Multi-nettverkskringkasting** — skriv én gang, klikk én gang, post til hvert nettverk du har valgt (11 nettverk)
- ✂️ **Automatisk deling for overlimit-tekst** — nummerert som `(1/N)`, postet sekvensielt. På X kobles de som en **svarkjede (thread)**, på andre nettverk postes de uavhengig
- `#hashtag`-grenser bevares på tvers av delinger / Bluesky får ordentlige **rich-text facets** (klikkbare tagger + URL annotations)
- 🖼️ **Opptil 4 bilder + automatisk størrelsesendring** — passer automatisk inn i stramme grenser som Blueskys 1 MB-tak
- 🎬 **Videoposting + automatisk komprimering** — overlimit-klipp kodes på nytt på stedet av `ffmpeg.wasm` (i et offscreen-dokument)
- 🔌 **Valgfri offisiell API-bane** — for Bluesky / Mastodon / Misskey, registrer legitimasjon i Innstillinger og Tutti poster via det offentlige API-et i stedet for DOM-skripting (motstandsdyktig mot SNS UI-endringer)
- 📊 **Sanntids fremgang** — se hvert nettverks status i sanntid
- 🪪 **Visning av innlogget konto** — popupen viser hvilken konto hvert nettverk vil poste fra (hjelper med å forhindre uhell)
- 🛡️ **autoPost-bryter** — av som standard. Standardmodusen åpner hver komposisjonsside, fyller ut innhold + vedlegg, og **stopper rett før å klikke på postknappen** ("forhåndsvisning"-modus) slik at du kan oppdage feil
- 📜 **Innleggshistorikk** — siste 20 oppføringer lagret lokalt
- 💾 **Automatisk lagrede utkast** — teksten din overlever lukking av popupen
- ⌨️ **Ctrl/Cmd + Enter for å poste**
- ⚙️ **Mastodon / Misskey-instansveksling** — pek til hvilken som helst instans fra Innstillinger
- 🩹 **Selector-hurtigreparasjon** — når et SNS-DOM endres og bryter en bane, kan Tutti hente en `selectors.json`-oppdatering slik at du ikke trenger å vente på neste utvidelsesutgivelse
- 🐞 **Bug-rapport-knapp** — ett klikk fra popupen sender inn en GitHub-issue med et redigert DOM-øyeblikksbilde (auto-triage-rørledningen gjør det om til en selector-PR)
- 🌐 **Lokalisert** — 31 språk (popup + alternativer)

## Støttede nettverk

11 nettverk. "Stable" betyr at ekte posting er verifisert ende-til-ende; "Experimental" betyr at adapteren er tilkoblet, men ekte posting med autoPost er ennå ikke fullt ut validert. For Experimental, start i forhåndsvisningsmodus (autoPost AV).

### Stable (ekte posting verifisert)

| Nettverk | text | image | shortVideo | longVideo | Bane |
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

### Experimental (kun adapter; ekte posting med autoPost ennå ikke verifisert)

| Nettverk | text | image | shortVideo | longVideo | Bane |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti automatiserer SNS-ets webgrensesnitt for komposisjon (mer følsomt for anti-bot-endringer)
- **DOM + API**: Hvis du lagrer legitimasjon i Innstillinger, bytter Tutti til det offisielle API-et. Ved API-feil **faller Tutti ikke stille tilbake til DOM** — du vil se en eksplisitt feil. Uten legitimasjon kjøres kun DOM-banen.
- **multi-step**: For modaler i veiviser-stil over flere trinn (rammeverk: `executeMultiStepFlow`)

## Installasjon

### Chrome Web Store

Publisert (Unlisted): [Tutti i Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Utpakket / utviklingsbygg

Last ned siste zip fra [Releases](https://github.com/komm64/tutti/releases), så:

1. Pakk den ut
2. Åpne `chrome://extensions/` (eller `brave://extensions/` i Brave)
3. Slå på "Utviklermodus"
4. Klikk på "Last inn utpakket" og velg den utpakkede mappen

## Støtte

Spørsmål, feilrapporter, funksjonsforespørsler: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

Eller send e-post til **contact@komm64.com**.

## Personvern

Innleggstekst, bilder og video behandles **fullstendig inne i nettleseren din** — de sendes aldri til noen tredjepartsserver. Se [personvernerklæringen](https://komm64.github.io/tutti/) for detaljer.

## Lisens

[Alle rettigheter forbeholdt](./LICENSE) — © 2026 komm64

Kildekoden er publisert for åpenhet. Videredistribusjon, gjenbruk eller modifikasjon er ikke tillatt.

---

## Utvikling

Utviklingsdokumentasjon (Stack, Commands, Layout) er på engelsk i [README.md](./README.md).
