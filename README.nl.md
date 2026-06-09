# Tutti

> Al het gedoe van cross-posting, afgehandeld — één Chrome-extensie, elf netwerken.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Met Tutti schrijft u één keer en verzendt u dezelfde post met één klik naar al uw sociale netwerken (11 netwerken ondersteund). Tekst die de limiet overschrijdt, wordt automatisch gesplitst (X gebruikt een correcte antwoordketen zodat het een thread wordt); afbeeldingen worden automatisch aangepast aan de beperkingen van elk platform; video's worden gecontroleerd op duur / grootte, en te grote clips worden ter plekke getranscodeerd met `ffmpeg.wasm`.

**Uw berichtinhoud raakt nooit een server van derden.**

🔒 [Privacybeleid](https://tutti.komm64.com/privacy.html)

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

Vragen, bugmeldingen, functieverzoeken: **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

Of mail naar **contact@komm64.com**.

## Privacy

Posttekst, afbeeldingen en video worden **volledig binnen uw browser** verwerkt — ze worden nooit naar een server van derden gestuurd. Zie het [privacybeleid](https://tutti.komm64.com/privacy.html) voor details.

## Responsible Use and Disclaimer

Tutti assists posting actions that you initiate. You remain responsible for your content, selected accounts, and compliance with each platform's terms, rules, posting limits, community guidelines, and applicable laws. Automation, repeated or duplicate content, unauthorized content, or insufficient sensitive-content labeling can result in platform enforcement. Tutti is provided as is, without warranties, and liability is limited to the maximum extent permitted by law. Full terms: https://tutti.komm64.com/terms.html

## Licentie

[Alle rechten voorbehouden](./LICENSE) — © 2026 komm64

De broncode is gepubliceerd voor transparantie. Herdistributie, hergebruik of wijziging is niet toegestaan.

---

## Ontwikkeling

De ontwikkelingsdocumentatie (Stack, Commands, Layout) is in het Engels in [README.md](./README.md).
