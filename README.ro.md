# Tutti

> Toate bătăile de cap cu postarea încrucișată, rezolvate — o extensie Chrome, unsprezece rețele.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Italiano](./README.it.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Nederlands](./README.nl.md) &middot; [Svenska](./README.sv.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

Tutti îți permite să scrii o dată și să transmiți aceeași postare către toate rețelele sociale cu un singur clic (11 rețele acceptate). Textul care depășește limita este divizat automat (X folosește un lanț de răspunsuri adecvat astfel încât să devină un thread); imaginile sunt redimensionate automat la restricțiile fiecărei platforme; videoclipurile sunt inspectate pentru durată / mărime, iar clipurile prea mari sunt transcodate din mers cu `ffmpeg.wasm`.

**Conținutul postărilor tale nu atinge niciodată vreun server terț.**

🔒 [Politica de confidențialitate](https://komm64.github.io/tutti/)

## Funcții

- 📤 **Difuzare multi-rețea** — scrie o dată, dă clic o dată, publică pe fiecare rețea pe care ai selectat-o (11 rețele)
- ✂️ **Împărțire automată pentru text peste limită** — numerotate ca `(1/N)`, publicate secvențial. Pe X sunt conectate ca un **lanț de răspunsuri (thread)**, în alte rețele sunt publicate independent
- Limitele `#hashtag` sunt păstrate la împărțiri / Bluesky primește **rich-text facets** corespunzătoare (tag-uri pe care se poate da clic + URL annotations)
- 🖼️ **Până la 4 imagini + redimensionare automată** — se potrivește automat în limite stricte precum plafonul de 1 MB al Bluesky
- 🎬 **Postare video + compresie automată** — clipurile peste limită sunt recodate pe loc de `ffmpeg.wasm` (într-un document offscreen)
- 🔌 **Cale API oficială opțională** — pentru Bluesky / Mastodon / Misskey, înregistrează acreditările în Setări și Tutti publică prin API-ul public în loc de scripting DOM (rezistent la schimbările UI ale SNS)
- 📊 **Progres în timp real** — vezi statusul fiecărei rețele în timp real
- 🪪 **Afișarea contului conectat** — popup-ul arată din ce cont va publica fiecare rețea (ajută la prevenirea accidentelor)
- 🛡️ **Comutator autoPost** — dezactivat implicit. Modul implicit deschide fiecare pagină de compunere, completează corpul + atașamentele și **se oprește chiar înainte de a da clic pe butonul de publicare** (modul "previzualizare") pentru a putea observa greșelile
- 📜 **Istoric postări** — ultimele 20 de intrări salvate local
- 💾 **Ciorne salvate automat** — textul tău supraviețuiește închiderii popup-ului
- ⌨️ **Ctrl/Cmd + Enter pentru a publica**
- ⚙️ **Schimbarea instanțelor Mastodon / Misskey** — indică orice instanță din Setări
- 🩹 **Hot-fix de selectori** — când un DOM SNS se schimbă și sparge o cale, Tutti poate prelua un patch `selectors.json`, astfel încât să nu fie nevoie să aștepți următoarea lansare a extensiei
- 🐞 **Buton de raportare a erorilor** — un clic din popup depune un issue GitHub cu un snapshot DOM redactat (pipeline-ul auto-triage îl transformă într-un PR de selector)
- 🌐 **Localizat** — 31 de limbi (popup + opțiuni)

## Rețele acceptate

11 rețele. "Stable" înseamnă că postarea reală a fost verificată end-to-end; "Experimental" înseamnă că adaptorul este conectat, dar postarea reală cu autoPost nu a fost încă pe deplin validată. Pentru cele Experimentale, începe în modul previzualizare (autoPost OFF).

### Stable (postare reală verificată)

| Rețea | text | image | shortVideo | longVideo | Cale |
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

### Experimental (doar adaptor; postare reală cu autoPost încă neverificată)

| Rețea | text | image | shortVideo | longVideo | Cale |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti automatizează UI-ul web de compunere al SNS (mai sensibil la schimbările anti-bot)
- **DOM + API**: Dacă salvezi acreditările în Setări, Tutti trece la API-ul oficial. La eșecul API-ului, Tutti **nu revine în tăcere la DOM** — vei vedea o eroare explicită. Fără acreditări, rulează doar calea DOM.
- **multi-step**: Pentru modale în stil wizard prin mai mulți pași (framework: `executeMultiStepFlow`)

## Instalare

### Chrome Web Store

Publicat (Unlisted): [Tutti în Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Dezarhivat / build de dezvoltare

Descarcă cel mai recent zip de la [Releases](https://github.com/komm64/tutti/releases), apoi:

1. Dezarhivează-l
2. Deschide `chrome://extensions/` (sau `brave://extensions/` în Brave)
3. Activează "Modul dezvoltator"
4. Dă clic pe "Încarcă dezarhivată" și alege folderul dezarhivat

## Asistență

Întrebări, rapoarte de erori, solicitări de funcționalitate: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

Sau trimite e-mail la **contact@komm64.com**.

## Confidențialitate

Textul postării, imaginile și videoul sunt procesate **integral în interiorul browserului tău** — niciodată nu sunt trimise vreunui server terț. Vezi [politica de confidențialitate](https://komm64.github.io/tutti/) pentru detalii.

## Licență

[Toate drepturile rezervate](./LICENSE) — © 2026 komm64

Codul sursă este publicat pentru transparență. Redistribuirea, reutilizarea sau modificarea nu sunt permise.

---

## Dezvoltare

Documentația de dezvoltare (Stack, Comenzi, Layout) este în engleză în [README.md](./README.md).
