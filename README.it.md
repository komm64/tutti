# Tutti

> Tutto il fastidio della pubblicazione incrociata, gestito — un'estensione Chrome, undici reti.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti ti permette di scrivere una volta e trasmettere lo stesso post a tutti i tuoi social network con un solo clic (11 reti supportate). Il testo che supera il limite viene diviso automaticamente (X usa una catena di risposte adeguata in modo che diventi un thread); le immagini vengono ridimensionate automaticamente per le restrizioni di ciascuna piattaforma; i video vengono ispezionati per durata / dimensione, e i clip di grandi dimensioni vengono transcodificati al volo con `ffmpeg.wasm`.

**Il contenuto dei tuoi post non tocca mai alcun server di terze parti.**

🔒 [Informativa sulla privacy](https://tutti.komm64.com/privacy.html)

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

Domande, segnalazioni di bug, richieste di funzionalità: **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

O invia un'email a **contact@komm64.com**.

## Privacy

Il testo, le immagini e il video dei post sono elaborati **interamente all'interno del tuo browser** — non vengono mai inviati a nessun server di terze parti. Vedi la [informativa sulla privacy](https://tutti.komm64.com/privacy.html) per i dettagli.

## Licenza

[Tutti i diritti riservati](./LICENSE) — © 2026 komm64

Il codice sorgente è pubblicato per trasparenza. Ridistribuzione, riutilizzo o modifica non sono consentiti.

---

## Sviluppo

La documentazione di sviluppo (Stack, Comandi, Layout) è in inglese in [README.md](./README.md).
