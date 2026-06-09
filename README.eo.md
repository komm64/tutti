# Tutti

> Ĉiu ĝeno de krucpoŝtado, traktita — unu Chrome-etendaĵo, dek unu retoj.

[undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti permesas vin skribi unufoje kaj dissendi la saman afiŝon al ĉiuj viaj sociaj retoj per unu klako (subtenas 11 retojn). Teksto, kiu superas la limon, estas aŭtomate dividita (X uzas taŭgan respondoĉenon, do ĝi fariĝas thread); bildoj estas aŭtomate regrandigitaj al la limoj de ĉiu platformo; videoj estas inspektitaj por daŭro / grandeco, kaj tro grandaj filmetoj estas transkodigitaj surloke per `ffmpeg.wasm`.

**La enhavo de viaj afiŝoj neniam tuŝas ian triapartan servilon.**

🔒 [Politiko pri privateco](https://tutti.komm64.com/privacy.html)

## Funkcioj

- 📤 **Multretdissendado** — skribu unufoje, klaku unufoje, afiŝu en ĉiun reton, kiun vi elektis (11 retoj)
- ✂️ **Aŭtomata dividado por superlima teksto** — numeritaj kiel `(1/N)`, afiŝitaj sinsekve. Sur X ili estas ligitaj kiel **respondoĉeno (thread)**, en aliaj retoj ili estas afiŝitaj sendepende
- La limoj de `#hashtag` estas konservitaj trans dividoj / Bluesky ricevas taŭgajn **rich-text facets** (kaŝebla tags + URL annotations)
- 🖼️ **Ĝis 4 bildoj + aŭtomata regrandigo** — aŭtomate konformas al striktaj limoj kiel la plafono de 1 MB de Bluesky
- 🎬 **Video-afiŝo + aŭtomata kunpremo** — superlimaj filmetoj estas rekodigitaj surloke de `ffmpeg.wasm` (en ekstera dokumento)
- 🔌 **Laŭvola oficiala API-vojo** — por Bluesky / Mastodon / Misskey, registru akreditaĵojn en Agordoj kaj Tutti afiŝas per la publika API anstataŭ DOM-skriptado (rezistas al SNS UI-ŝanĝoj)
- 📊 **Viva progreso** — vidu la staton de ĉiu reto en reala tempo
- 🪪 **Montriĝo de ensalutita konto** — la ŝprucfenestro montras el kiu konto ĉiu reto afiŝos (helpas eviti akcidentojn)
- 🛡️ **autoPost-baskulo** — malŝaltita defaŭlte. La defaŭlta reĝimo malfermas ĉiun verkadan paĝon, plenigas la korpon + aldonaĵojn, kaj **haltas ĵus antaŭ klaki la afiŝobutonon** ("antaŭrigardo"-reĝimo) por ke vi povu trovi erarojn
- 📜 **Afiŝa historio** — lastaj 20 enskriboj konservitaj loke
- 💾 **Aŭtomate konservitaj malnetoj** — via teksto supervivas la fermon de la ŝprucfenestro
- ⌨️ **Ctrl/Cmd + Enter por afiŝi**
- ⚙️ **Ŝanĝo de Mastodon / Misskey-instancoj** — montru al iu ajn instanco el Agordoj
- 🩹 **Hot-fix de elektiloj** — kiam SNS-DOM ŝanĝiĝas kaj rompas vojon, Tutti povas elŝuti `selectors.json`-flikon, do vi ne devas atendi la sekvan etendaĵan eldonon
- 🐞 **Raporta butono pri eraroj** — unu klako el la ŝprucfenestro registras GitHub-issue kun redaktita DOM-foto (la aŭtomata triage-dukto transformas tion en selector-PR)
- 🌐 **Lokalizita** — 31 lingvoj (ŝprucfenestro + opcioj)

## Subtenataj retoj

11 retoj. "Stable" signifas, ke vera afiŝado estas kontrolita de fino al fino; "Experimental" signifas, ke la adaptilo estas konektita sed vera afiŝado kun autoPost ankoraŭ ne estas plene validigita. Por Experimental, komencu en antaŭrigarda reĝimo (autoPost MALŜALTITA).

### Stable (vera afiŝado kontrolita)

| Reto | text | image | shortVideo | longVideo | Vojo |
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

### Experimental (nur adaptilo; vera afiŝado kun autoPost ankoraŭ ne kontrolita)

| Reto | text | image | shortVideo | longVideo | Vojo |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti aŭtomatigas la teksan UI por verkado de la SNS (pli sentema al kontraŭ-bot ŝanĝoj)
- **DOM + API**: Se vi konservas akreditaĵojn en Agordoj, Tutti ŝanĝas al la oficiala API. Ĉe API-malsukceso Tutti **ne silente revenas al DOM** — vi vidos eksplicitan eraron. Sen akreditaĵoj, nur la DOM-vojo funkcias.
- **multi-step**: Por modalfenestroj en sorĉisto-stilo trans pluraj paŝoj (kadro: `executeMultiStepFlow`)

## Instalado

### Chrome Web Store

Eldonita (Unlisted): [Tutti en Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Malpakita / disvolva muntaĵo

Elŝutu la plej novan zip-on de [Releases](https://github.com/komm64/tutti/releases), poste:

1. Malpaku ĝin
2. Malfermu `chrome://extensions/` (aŭ `brave://extensions/` en Brave)
3. Ŝaltu "Programisto-reĝimo"
4. Klaku "Ŝargi malpakitan" kaj elektu la malpakitan dosierujon

## Subteno

Demandoj, eraroraportoj, funkcio-petoj: **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

Aŭ retpoŝtu **contact@komm64.com**.

## Privateco

Afiŝa teksto, bildoj kaj video estas prilaborataj **tute ene de via retumilo** — ili neniam estas senditaj al iu ajn triaparta servilo. Vidu la [politikon pri privateco](https://tutti.komm64.com/privacy.html) por detaloj.

## Responsible Use and Disclaimer

Tutti assists posting actions that you initiate. You remain responsible for your content, selected accounts, and compliance with each platform's terms, rules, posting limits, community guidelines, and applicable laws. Automation, repeated or duplicate content, unauthorized content, or insufficient sensitive-content labeling can result in platform enforcement. Tutti is provided as is, without warranties, and liability is limited to the maximum extent permitted by law. Full terms: https://tutti.komm64.com/terms.html

## Permesilo

[Ĉiuj rajtoj rezervitaj](./LICENSE) — © 2026 komm64

La fontkodo estas eldonita por travidebleco. Redistribuo, reuzo aŭ modifo ne estas permesata.

---

## Disvolviĝo

Disvolva dokumentaro (Stack, Komandoj, Aranĝo) estas en la angla en [README.md](./README.md).
