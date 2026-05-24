# Tutti

> Kaikki ristijulkaisun vaiva, hoidettuna — yksi Chrome-laajennus, yksitoista verkostoa.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Italiano](./README.it.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Nederlands](./README.nl.md) &middot; [Svenska](./README.sv.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Română](./README.ro.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

Tutti antaa sinun kirjoittaa kerran ja lähettää saman julkaisun kaikkiin sosiaalisiin verkostoihisi yhdellä napsautuksella (11 verkostoa tuettu). Rajan ylittävä teksti jaetaan automaattisesti (X käyttää asianmukaista vastausketjua, jotta siitä tulee thread); kuvat muutetaan automaattisesti kunkin alustan rajoitusten mukaisiksi; videot tarkastetaan keston / koon osalta, ja ylisuuret leikkeet transkoodataan lennossa `ffmpeg.wasm`:llä.

**Julkaisusisältösi ei koskaan koske mihinkään kolmannen osapuolen palvelimeen.**

🔒 [Tietosuojakäytäntö](https://komm64.github.io/tutti/)

## Ominaisuudet

- 📤 **Moniverkostolähetys** — kirjoita kerran, napsauta kerran, julkaise jokaiseen valitsemaasi verkostoon (11 verkostoa)
- ✂️ **Automaattinen jakaminen ylirajaiselle tekstille** — numeroitu muodossa `(1/N)`, julkaistu peräkkäin. X:ssä ne yhdistetään **vastausketjuksi (thread)**, muissa verkostoissa ne julkaistaan itsenäisesti
- `#hashtag`-rajat säilyvät jakojen yli / Bluesky saa kunnolliset **rich-text facets** (klikattavat tunnisteet + URL annotations)
- 🖼️ **Enintään 4 kuvaa + automaattinen koon muutos** — sopii automaattisesti tiukkoihin rajoihin, kuten Blueskyn 1 MB:n kattoon
- 🎬 **Videon julkaiseminen + automaattinen pakkaus** — ylirajaiset leikkeet koodataan paikalla uudelleen `ffmpeg.wasm`:llä (offscreen-asiakirjassa)
- 🔌 **Valinnainen virallinen API-reitti** — Bluesky / Mastodon / Misskeylle, rekisteröi tunnistetiedot Asetuksissa ja Tutti julkaisee julkisen API:n kautta DOM-skriptauksen sijaan (kestävä SNS UI -muutoksia vastaan)
- 📊 **Reaaliaikainen edistyminen** — näe kunkin verkoston tila reaaliajassa
- 🪪 **Sisäänkirjautuneen tilin näyttö** — popup näyttää, miltä tililtä kukin verkosto julkaisee (auttaa estämään onnettomuuksia)
- 🛡️ **autoPost-kytkin** — pois päältä oletusarvoisesti. Oletustila avaa kunkin laatimissivun, täyttää rungon + liitteet ja **pysähtyy juuri ennen julkaisupainikkeen napsauttamista** ("esikatselu"-tila), jotta voit havaita virheet
- 📜 **Julkaisuhistoria** — viimeiset 20 merkintää tallennettuna paikallisesti
- 💾 **Automaattisesti tallennetut luonnokset** — tekstisi säilyy popupin sulkemisesta
- ⌨️ **Ctrl/Cmd + Enter julkaisemiseen**
- ⚙️ **Mastodon / Misskey -instanssien vaihto** — osoita mihin tahansa instanssiin Asetuksista
- 🩹 **Valitsimen pikakorjaus** — kun SNS:n DOM muuttuu ja rikkoo polun, Tutti voi hakea `selectors.json`-korjauksen, jotta sinun ei tarvitse odottaa seuraavaa laajennuksen julkaisua
- 🐞 **Bug-raportointipainike** — yksi napsautus popupista lähettää GitHub-issuen toimitetulla DOM-tilannekuvalla (auto-triage-putki muuttaa sen valitsimen PR:ksi)
- 🌐 **Lokalisoitu** — 31 kieltä (popup + asetukset)

## Tuetut verkostot

11 verkostoa. "Stable" tarkoittaa, että todellinen julkaisu on varmistettu päästä päähän; "Experimental" tarkoittaa, että sovitin on kytketty, mutta todellista julkaisua autoPostilla ei ole vielä täysin validoitu. Experimentalille aloita esikatselutilassa (autoPost POIS).

### Stable (todellinen julkaisu varmistettu)

| Verkosto | text | image | shortVideo | longVideo | Polku |
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

### Experimental (vain sovitin; todellista julkaisua autoPostilla ei vielä varmistettu)

| Verkosto | text | image | shortVideo | longVideo | Polku |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti automatisoi SNS:n verkkokäyttöliittymän laadintaa (herkempi anti-bot-muutoksille)
- **DOM + API**: Jos tallennat tunnistetiedot Asetuksiin, Tutti vaihtaa viralliseen API:hin. API-virheessä Tutti **ei hiljaa palaa DOMiin** — näet eksplisiittisen virheen. Ilman tunnistetietoja vain DOM-polkua suoritetaan.
- **multi-step**: Velho-tyylisiä modaaleja varten useissa vaiheissa (viitekehys: `executeMultiStepFlow`)

## Asennus

### Chrome Web Store

Julkaistu (Unlisted): [Tutti Web Storessa](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Purettu / kehitysrakennus

Lataa uusin zip osoitteesta [Releases](https://github.com/komm64/tutti/releases), sitten:

1. Pura se
2. Avaa `chrome://extensions/` (tai `brave://extensions/` Bravessa)
3. Ota "Kehittäjätila" käyttöön
4. Napsauta "Lataa purettu" ja valitse purettu kansio

## Tuki

Kysymykset, virheilmoitukset, ominaisuuspyynnöt: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

Tai lähetä sähköpostia osoitteeseen **contact@komm64.com**.

## Tietosuoja

Julkaisuteksti, kuvat ja video käsitellään **kokonaan selaimesi sisällä** — niitä ei koskaan lähetetä mihinkään kolmannen osapuolen palvelimeen. Katso lisätietoja [tietosuojakäytännöstä](https://komm64.github.io/tutti/).

## Lisenssi

[Kaikki oikeudet pidätetään](./LICENSE) — © 2026 komm64

Lähdekoodi julkaistaan läpinäkyvyyden vuoksi. Uudelleenjakelu, uudelleenkäyttö tai muokkaus ei ole sallittua.

---

## Kehitys

Kehitysdokumentaatio (Stack, Commands, Layout) on englanniksi tiedostossa [README.md](./README.md).
