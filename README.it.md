# Tutti

> Tutto il fastidio della pubblicazione incrociata, gestito — un'estensione Chrome, undici reti.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Nederlands](./README.nl.md) &middot; [Svenska](./README.sv.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Română](./README.ro.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

Tutti ti permette di scrivere una volta e trasmettere lo stesso post a tutti i tuoi social network con un solo clic (11 reti supportate). Il testo che supera il limite viene diviso automaticamente (X usa una catena di risposte adeguata in modo che diventi un thread); le immagini vengono ridimensionate automaticamente per le restrizioni di ciascuna piattaforma; i video vengono ispezionati per durata / dimensione, e i clip di grandi dimensioni vengono transcodificati al volo con `ffmpeg.wasm`.

**Il contenuto dei tuoi post non tocca mai alcun server di terze parti.**

🔒 [Informativa sulla privacy](https://komm64.github.io/tutti/)

## Funzionalità

- 📤 **Trasmissione multi-rete** — scrivi una volta, clicca una volta, pubblica su ogni rete che hai selezionato (11 reti)
- ✂️ **Divisione automatica per testo oltre limite** — numerati come `(1/N)`, pubblicati in sequenza. Su X sono collegati come **catena di risposte (thread)**, su altre reti vengono pubblicati indipendentemente
- I limiti di `#hashtag` sono preservati nelle divisioni / Bluesky riceve **rich-text facets** adeguati (tag cliccabili + URL annotations)
- 🖼️ **Fino a 4 immagini + ridimensionamento automatico** — si adatta automaticamente a limiti rigorosi come il tetto di 1 MB di Bluesky
- 🎬 **Pubblicazione video + compressione automatica** — i clip oltre limite vengono ricodificati in loco da `ffmpeg.wasm` (in un documento offscreen)
- 🔌 **Percorso API ufficiale opzionale** — per Bluesky / Mastodon / Misskey, registra credenziali nelle Impostazioni e Tutti pubblica tramite l'API pubblica invece dello scripting DOM (resiliente ai cambiamenti dell'interfaccia SNS)
- 📊 **Progresso in tempo reale** — visualizza lo stato di ciascuna rete in tempo reale
- 🪪 **Visualizzazione dell'account connesso** — il popup mostra da quale account ciascuna rete pubblicherà (aiuta a prevenire incidenti)
- 🛡️ **Toggle autoPost** — disattivato per impostazione predefinita. La modalità predefinita apre ciascuna pagina di composizione, riempie il corpo + allegati, e **si ferma prima di cliccare il pulsante di pubblicazione** (modalità "anteprima") in modo che tu possa individuare errori
- 📜 **Cronologia post** — ultimi 20 elementi salvati localmente
- 💾 **Bozze salvate automaticamente** — il tuo testo sopravvive alla chiusura del popup
- ⌨️ **Ctrl/Cmd + Invio per pubblicare**
- ⚙️ **Cambio istanze Mastodon / Misskey** — punta a qualsiasi istanza dalle Impostazioni
- 🩹 **Hot-fix dei selettori** — quando un DOM SNS cambia e rompe un percorso, Tutti può recuperare una patch `selectors.json` in modo da non dover attendere il prossimo rilascio dell'estensione
- 🐞 **Pulsante di segnalazione bug** — un clic dal popup invia un issue GitHub con uno snapshot DOM redatto (la pipeline auto-triage lo trasforma in una PR di selettore)
- 🌐 **Localizzato** — 31 lingue (popup + opzioni)

## Reti supportate

11 reti. "Stable" significa che la pubblicazione reale è stata verificata end-to-end; "Experimental" significa che l'adattatore è collegato ma la pubblicazione reale con autoPost non è ancora stata completamente convalidata. Per gli Experimental, inizia in modalità anteprima (autoPost OFF).

### Stable (pubblicazione reale verificata)

| Rete | text | image | shortVideo | longVideo | Percorso |
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

### Experimental (solo adattatore; pubblicazione reale con autoPost non ancora verificata)

| Rete | text | image | shortVideo | longVideo | Percorso |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti automatizza l'interfaccia web di composizione del SNS (più sensibile ai cambiamenti anti-bot)
- **DOM + API**: Se salvi le credenziali nelle Impostazioni, Tutti passa all'API ufficiale. In caso di errore API, Tutti **non torna silenziosamente al DOM** — vedrai un errore esplicito. Senza credenziali, viene eseguito solo il percorso DOM.
- **multi-step**: Per modali in stile procedura guidata su più passaggi (framework: `executeMultiStepFlow`)

## Installazione

### Chrome Web Store

Pubblicato (Unlisted): [Tutti sul Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Decompresso / build di sviluppo

Scarica l'ultimo zip da [Releases](https://github.com/komm64/tutti/releases), poi:

1. Decomprimilo
2. Apri `chrome://extensions/` (o `brave://extensions/` su Brave)
3. Attiva "Modalità sviluppatore"
4. Clicca "Carica estensione non pacchettizzata" e scegli la cartella decompressa

## Supporto

Domande, segnalazioni di bug, richieste di funzionalità: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

O invia un'email a **contact@komm64.com**.

## Privacy

Il testo, le immagini e il video dei post sono elaborati **interamente all'interno del tuo browser** — non vengono mai inviati a nessun server di terze parti. Vedi la [informativa sulla privacy](https://komm64.github.io/tutti/) per i dettagli.

## Licenza

[Tutti i diritti riservati](./LICENSE) — © 2026 komm64

Il codice sorgente è pubblicato per trasparenza. Ridistribuzione, riutilizzo o modifica non sono consentiti.

---

## Sviluppo

La documentazione di sviluppo (Stack, Comandi, Layout) è in inglese in [README.md](./README.md).
