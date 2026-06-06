# Tutti

> A keresztposztolás minden bonyodalma kezelve — egy Chrome-bővítmény, tizenegy hálózat.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

A Tutti lehetővé teszi, hogy egyszer írjon, és egyetlen kattintással ugyanazt a bejegyzést sugározza minden közösségi hálózatára (11 hálózat támogatott). A korlátot meghaladó szöveg automatikusan felosztásra kerül (az X megfelelő válaszláncot használ, így thread lesz belőle); a képek automatikusan átméretezésre kerülnek minden platform korlátozásaihoz; a videók időtartam / méret szempontjából ellenőrzésre kerülnek, és a túl nagy klipek menet közben transzkódolásra kerülnek `ffmpeg.wasm`-mel.

**A bejegyzései tartalma soha nem érint harmadik fél szerverét.**

🔒 [Adatvédelmi szabályzat](https://tutti.komm64.com/privacy.html)

## Funkciók

- 📤 **Több hálózatú sugárzás** — írjon egyszer, kattintson egyszer, posztoljon minden kiválasztott hálózatra (11 hálózat)
- ✂️ **Automatikus felosztás a korlátot meghaladó szöveghez** — `(1/N)` formátumban számozva, sorrendben posztolva. X-en megfelelő **válaszláncként (thread)** kapcsolódnak, más hálózatokon függetlenül kerülnek posztolásra
- A `#hashtag` határok megőrződnek a felosztásokon át / a Bluesky megfelelő **rich-text facets**-eket kap (kattintható címkék + URL annotations)
- 🖼️ **Akár 4 kép + automatikus átméretezés** — automatikusan illeszkedik szigorú korlátokhoz, mint a Bluesky 1 MB-os plafonja
- 🎬 **Videó posztolása + automatikus tömörítés** — a korlátot meghaladó klipek helyben újrakódolódnak az `ffmpeg.wasm` által (offscreen dokumentumban)
- 🔌 **Opcionális hivatalos API útvonal** — a Bluesky / Mastodon / Misskey számára regisztráljon hitelesítő adatokat a Beállításokban, és a Tutti a nyilvános API-n keresztül posztol DOM-szkriptelés helyett (rugalmas az SNS UI változásokkal szemben)
- 📊 **Élő haladás** — látja minden hálózat állapotát valós időben
- 🪪 **Bejelentkezett fiók megjelenítése** — a popup megmutatja, melyik fiókról fog posztolni minden hálózat (segít elkerülni a baleseteket)
- 🛡️ **autoPost kapcsoló** — alapértelmezetten kikapcsolva. Az alapértelmezett mód megnyitja minden szerkesztési oldalt, kitölti a törzset + mellékleteket, és **közvetlenül a posztolás gomb megnyomása előtt megáll** ("előnézet" mód), hogy észrevehesse a hibákat
- 📜 **Bejegyzés-előzmények** — utolsó 20 bejegyzés helyileg mentve
- 💾 **Automatikusan mentett piszkozatok** — a szöveg túléli a popup bezárását
- ⌨️ **Ctrl/Cmd + Enter a posztoláshoz**
- ⚙️ **Mastodon / Misskey példányváltás** — mutasson bármely példányra a Beállításokból
- 🩹 **Selector hot-fix** — amikor egy SNS DOM megváltozik és megtör egy útvonalat, a Tutti lekérhet egy `selectors.json` javítást, így nem kell várnia a következő bővítményváltozatra
- 🐞 **Hibajelentés gomb** — egy kattintás a popupból küld egy GitHub issue-t szerkesztett DOM-pillanatfelvétellel (az auto-triage csővezeték selector PR-ré alakítja)
- 🌐 **Lokalizált** — 31 nyelv (popup + opciók)

## Támogatott hálózatok

11 hálózat. A "Stable" azt jelenti, hogy a valódi posztolást végpontról végpontig ellenőrizték; az "Experimental" azt jelenti, hogy az adapter csatlakoztatva van, de a valódi posztolás autoPost-tal még nincs teljesen validálva. Az Experimentalokhoz kezdjen előnézeti módban (autoPost KI).

### Stable (valódi posztolás ellenőrizve)

| Hálózat | text | image | shortVideo | longVideo | Útvonal |
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

### Experimental (csak adapter; valódi posztolás autoPost-tal még nincs ellenőrizve)

| Hálózat | text | image | shortVideo | longVideo | Útvonal |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: A Tutti automatizálja az SNS webes szerkesztő UI-ját (érzékenyebb az anti-bot változásokra)
- **DOM + API**: Ha hitelesítő adatokat ment a Beállításokban, a Tutti átvált a hivatalos API-ra. API hiba esetén a Tutti **nem tér vissza csendben a DOM-hoz** — explicit hibát fog látni. Hitelesítő adatok nélkül csak a DOM útvonal fut.
- **multi-step**: Több lépésen át menő varázsló stílusú modálokhoz (keretrendszer: `executeMultiStepFlow`)

## Telepítés

### Chrome Web Store

Közzétéve (Unlisted): [Tutti a Web Store-ban](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Kicsomagolt / dev build

Töltse le a legújabb zip-et a [Releases](https://github.com/komm64/tutti/releases)-ből, majd:

1. Csomagolja ki
2. Nyissa meg a `chrome://extensions/`-et (vagy `brave://extensions/`-et Brave-ben)
3. Kapcsolja be a "Fejlesztői módot"
4. Kattintson a "Kicsomagolt bővítmény betöltése"-re és válassza ki a kicsomagolt mappát

## Támogatás

Kérdések, hibajelentések, funkciókérések: **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

Vagy küldjön e-mailt a **contact@komm64.com** címre.

## Adatvédelem

A bejegyzés szövege, képei és videója **teljesen a böngészőjében** feldolgozódik — soha nem küldjük el harmadik fél szerverére. Részletekért lásd az [adatvédelmi szabályzatot](https://tutti.komm64.com/privacy.html).

## Licenc

[Minden jog fenntartva](./LICENSE) — © 2026 komm64

A forráskód átláthatóság céljából kerül közzétételre. Újraterjesztés, újrafelhasználás vagy módosítás nem engedélyezett.

---

## Fejlesztés

A fejlesztői dokumentáció (Stack, Parancsok, Layout) angolul található a [README.md](./README.md)-ben.
