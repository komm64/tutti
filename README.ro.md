# Tutti

> Toate bătăile de cap cu postarea încrucișată, rezolvate — o extensie Chrome, unsprezece rețele.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti îți permite să scrii o dată și să transmiți aceeași postare către toate rețelele sociale cu un singur clic (11 rețele acceptate). Textul care depășește limita este divizat automat (X folosește un lanț de răspunsuri adecvat astfel încât să devină un thread); imaginile sunt redimensionate automat la restricțiile fiecărei platforme; videoclipurile sunt inspectate pentru durată / mărime, iar clipurile prea mari sunt transcodate din mers cu `ffmpeg.wasm`.

**Conținutul postărilor tale nu atinge niciodată vreun server terț.**

🔒 [Politica de confidențialitate](https://tutti.komm64.com/privacy.html)

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

Întrebări, rapoarte de erori, solicitări de funcționalitate: **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

Sau trimite e-mail la **contact@komm64.com**.

## Confidențialitate

Textul postării, imaginile și videoul sunt procesate **integral în interiorul browserului tău** — niciodată nu sunt trimise vreunui server terț. Vezi [politica de confidențialitate](https://tutti.komm64.com/privacy.html) pentru detalii.

## Responsible Use and Disclaimer

Tutti assists posting actions that you initiate. You remain responsible for your content, selected accounts, and compliance with each platform's terms, rules, posting limits, community guidelines, and applicable laws. Automation, repeated or duplicate content, unauthorized content, or insufficient sensitive-content labeling can result in platform enforcement. Tutti is provided as is, without warranties, and liability is limited to the maximum extent permitted by law. Full terms: https://tutti.komm64.com/terms.html

## Licență

[Toate drepturile rezervate](./LICENSE) — © 2026 komm64

Codul sursă este publicat pentru transparență. Redistribuirea, reutilizarea sau modificarea nu sunt permise.

---

## Dezvoltare

Documentația de dezvoltare (Stack, Comenzi, Layout) este în engleză în [README.md](./README.md).
