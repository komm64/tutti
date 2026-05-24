# Tutti

> Al het gedoe van cross-posting, afgehandeld — één Chrome-extensie, elf netwerken.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Italiano](./README.it.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Svenska](./README.sv.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Română](./README.ro.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

Met Tutti schrijft u één keer en verzendt u dezelfde post met één klik naar al uw sociale netwerken (11 netwerken ondersteund). Tekst die de limiet overschrijdt, wordt automatisch gesplitst (X gebruikt een correcte antwoordketen zodat het een thread wordt); afbeeldingen worden automatisch aangepast aan de beperkingen van elk platform; video's worden gecontroleerd op duur / grootte, en te grote clips worden ter plekke getranscodeerd met `ffmpeg.wasm`.

**Uw berichtinhoud raakt nooit een server van derden.**

🔒 [Privacybeleid](https://komm64.github.io/tutti/)

## Functies

- 📤 **Multi-netwerk uitzending** — schrijf één keer, klik één keer, post naar elk geselecteerd netwerk (11 netwerken)
- ✂️ **Automatische splitsing voor overlimiet tekst** — genummerd als `(1/N)`, sequentieel gepost. Op X worden ze verbonden als een **antwoordketen (thread)**, op andere netwerken worden ze onafhankelijk gepost
- `#hashtag`-grenzen worden bewaard bij splitsingen / Bluesky krijgt correcte **rich-text facets** (klikbare tags + URL annotations)
- 🖼️ **Tot 4 afbeeldingen + automatisch formaat wijzigen** — past automatisch in strakke limieten zoals Bluesky's 1 MB-plafond
- 🎬 **Video posten + automatische compressie** — overlimiet clips worden ter plekke opnieuw gecodeerd door `ffmpeg.wasm` (in een offscreen document)
- 🔌 **Optioneel officieel API-pad** — voor Bluesky / Mastodon / Misskey, registreer inloggegevens in Instellingen en Tutti post via de publieke API in plaats van DOM-scripting (bestand tegen SNS UI-wijzigingen)
- 📊 **Live voortgang** — zie de status van elk netwerk in realtime
- 🪪 **Weergave ingelogd account** — de pop-up toont vanaf welk account elk netwerk zal posten (helpt ongelukken voorkomen)
- 🛡️ **autoPost-schakelaar** — standaard uit. De standaardmodus opent elke opstelpagina, vult het body + bijlagen in en **stopt vlak voor het klikken op de postknop** ("preview"-modus), zodat u fouten kunt opmerken
- 📜 **Berichtgeschiedenis** — laatste 20 vermeldingen lokaal opgeslagen
- 💾 **Automatisch opgeslagen concepten** — uw tekst overleeft het sluiten van de pop-up
- ⌨️ **Ctrl/Cmd + Enter om te posten**
- ⚙️ **Mastodon / Misskey instance-wisseling** — wijs naar elke instance vanuit Instellingen
- 🩹 **Selector-hotfix** — wanneer een SNS-DOM verandert en een pad breekt, kan Tutti een `selectors.json`-patch ophalen, zodat u niet hoeft te wachten op de volgende extensie-release
- 🐞 **Bug-rapportknop** — één klik vanuit de pop-up dient een GitHub-issue in met een geredigeerde DOM-snapshot (de auto-triage-pipeline zet dat om in een selector-PR)
- 🌐 **Gelokaliseerd** — 31 talen (pop-up + opties)

## Ondersteunde netwerken

11 netwerken. "Stable" betekent dat het echte posten end-to-end is geverifieerd; "Experimental" betekent dat de adapter is aangesloten maar dat echt posten met autoPost nog niet volledig is gevalideerd. Voor de Experimentele, begin in preview-modus (autoPost UIT).

### Stable (echt posten geverifieerd)

| Netwerk | text | image | shortVideo | longVideo | Pad |
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

### Experimental (alleen adapter; echt posten met autoPost nog niet geverifieerd)

| Netwerk | text | image | shortVideo | longVideo | Pad |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti automatiseert de web-UI voor opstellen van het SNS (gevoeliger voor anti-bot wijzigingen)
- **DOM + API**: Als u inloggegevens opslaat in Instellingen, schakelt Tutti over naar de officiële API. Bij API-fout valt Tutti **niet stilzwijgend terug op DOM** — u ziet een expliciete fout. Zonder inloggegevens wordt alleen het DOM-pad uitgevoerd.
- **multi-step**: Voor modals in wizard-stijl over meerdere stappen (framework: `executeMultiStepFlow`)

## Installatie

### Chrome Web Store

Gepubliceerd (Unlisted): [Tutti in de Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Uitgepakt / ontwikkelingsbuild

Download de nieuwste zip van [Releases](https://github.com/komm64/tutti/releases), dan:

1. Pak het uit
2. Open `chrome://extensions/` (of `brave://extensions/` in Brave)
3. Schakel "Ontwikkelaarsmodus" in
4. Klik op "Uitgepakte extensie laden" en kies de uitgepakte map

## Ondersteuning

Vragen, bugmeldingen, functieverzoeken: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

Of mail naar **contact@komm64.com**.

## Privacy

Posttekst, afbeeldingen en video worden **volledig binnen uw browser** verwerkt — ze worden nooit naar een server van derden gestuurd. Zie het [privacybeleid](https://komm64.github.io/tutti/) voor details.

## Licentie

[Alle rechten voorbehouden](./LICENSE) — © 2026 komm64

De broncode is gepubliceerd voor transparantie. Herdistributie, hergebruik of wijziging is niet toegestaan.

---

## Ontwikkeling

De ontwikkelingsdocumentatie (Stack, Commands, Layout) is in het Engels in [README.md](./README.md).
