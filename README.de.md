# Tutti

> Alle Mühen des Cross-Postings, erledigt — eine Chrome-Erweiterung, elf Netzwerke.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti lässt Sie einmal schreiben und denselben Beitrag mit einem einzigen Klick an alle Ihre sozialen Netzwerke verteilen (11 Netzwerke unterstützt). Text, der das Limit überschreitet, wird automatisch geteilt (X verwendet eine richtige Antwortkette, sodass es zu einem Thread wird); Bilder werden automatisch an die Beschränkungen der jeweiligen Plattform angepasst; Videos werden auf Dauer / Größe überprüft, und übergroße Clips werden im laufenden Betrieb mit `ffmpeg.wasm` transkodiert.

**Ihre Beitragsinhalte berühren niemals einen Drittserver.**

🔒 [Datenschutzerklärung](https://tutti.komm64.com/privacy.html)

## Funktionen

- 📤 **Multi-Netzwerk-Verteilung** — einmal schreiben, einmal klicken, in jedes ausgewählte Netzwerk veröffentlichen (11 Netzwerke)
- ✂️ **Automatische Aufteilung bei Überschreitung** — nummeriert als `(1/N)`, sequenziell veröffentlicht. Auf X werden sie als **Antwortkette (Thread)** verbunden, auf anderen Netzwerken werden sie unabhängig veröffentlicht
- Die `#hashtag`-Grenzen bleiben bei Aufteilungen erhalten / Bluesky erhält ordentliche **rich-text facets** (klickbare Tags + URL annotations)
- 🖼️ **Bis zu 4 Bilder + automatisches Anpassen** — passt automatisch in enge Grenzen wie Bluesky's 1-MB-Obergrenze
- 🎬 **Video-Veröffentlichung + automatische Kompression** — übergroße Clips werden vor Ort von `ffmpeg.wasm` neu kodiert (in einem Offscreen-Dokument)
- 🔌 **Optionaler offizieller API-Pfad** — für Bluesky / Mastodon / Misskey, registrieren Sie Zugangsdaten in den Einstellungen und Tutti veröffentlicht über die öffentliche API anstelle von DOM-Scripting (widerstandsfähig gegenüber SNS-UI-Änderungen)
- 📊 **Live-Fortschritt** — sehen Sie den Status jedes Netzwerks in Echtzeit
- 🪪 **Anzeige des angemeldeten Kontos** — das Popup zeigt, von welchem Konto jedes Netzwerk veröffentlichen wird (hilft, Unfälle zu vermeiden)
- 🛡️ **autoPost-Schalter** — standardmäßig aus. Der Standardmodus öffnet jede Erstellungsseite, füllt Körper + Anhänge und **stoppt kurz bevor der Veröffentlichen-Knopf geklickt wird** ("Vorschau"-Modus), damit Sie Fehler erkennen können
- 📜 **Beitragsverlauf** — letzte 20 Einträge lokal gespeichert
- 💾 **Automatisch gespeicherte Entwürfe** — Ihr Text überlebt das Schließen des Popups
- ⌨️ **Strg/Cmd + Eingabetaste zum Veröffentlichen**
- ⚙️ **Mastodon / Misskey-Instanzwechsel** — verweisen Sie auf jede Instanz aus den Einstellungen
- 🩹 **Selector-Hotfix** — wenn sich ein SNS-DOM ändert und einen Pfad bricht, kann Tutti einen `selectors.json`-Patch abrufen, sodass Sie nicht auf die nächste Erweiterungsversion warten müssen
- 🐞 **Bug-Report-Knopf** — ein Klick aus dem Popup erstellt ein GitHub-Issue mit einem redigierten DOM-Snapshot (die Auto-Triage-Pipeline verwandelt das in einen Selector-PR)
- 🌐 **Lokalisiert** — 31 Sprachen (Popup + Optionen)

## Unterstützte Netzwerke

11 Netzwerke. "Stable" bedeutet, dass die echte Veröffentlichung End-to-End verifiziert wurde; "Experimental" bedeutet, dass der Adapter eingebunden ist, aber die echte Veröffentlichung mit autoPost noch nicht vollständig validiert wurde. Für Experimental beginnen Sie im Vorschaumodus (autoPost AUS).

### Stable (echte Veröffentlichung verifiziert)

| Netzwerk | text | image | shortVideo | longVideo | Pfad |
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

### Experimental (nur Adapter; echte Veröffentlichung mit autoPost noch nicht verifiziert)

| Netzwerk | text | image | shortVideo | longVideo | Pfad |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti automatisiert die Web-UI zur Beitragserstellung des SNS (anfälliger für Anti-Bot-Änderungen)
- **DOM + API**: Wenn Sie Zugangsdaten in den Einstellungen speichern, wechselt Tutti zur offiziellen API. Bei API-Fehler **fällt Tutti nicht stillschweigend auf das DOM zurück** — Sie sehen einen expliziten Fehler. Ohne Zugangsdaten läuft nur der DOM-Pfad.
- **multi-step**: Für Modal-Dialoge im Assistenten-Stil über mehrere Schritte (Framework: `executeMultiStepFlow`)

## Installation

### Chrome Web Store

Veröffentlicht (Unlisted): [Tutti im Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Entpackter / Entwicklungs-Build

Laden Sie die neueste Zip-Datei von [Releases](https://github.com/komm64/tutti/releases) herunter, dann:

1. Entpacken Sie sie
2. Öffnen Sie `chrome://extensions/` (oder `brave://extensions/` in Brave)
3. Schalten Sie den "Entwicklermodus" ein
4. Klicken Sie auf "Entpackte Erweiterung laden" und wählen Sie den entpackten Ordner

## Support

Fragen, Bug-Berichte, Funktionsanfragen: **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

Oder per E-Mail an **contact@komm64.com**.

## Datenschutz

Beitragstext, Bilder und Video werden **vollständig in Ihrem Browser** verarbeitet — sie werden niemals an einen Drittserver gesendet. Siehe [Datenschutzerklärung](https://tutti.komm64.com/privacy.html) für Details.

## Lizenz

[Alle Rechte vorbehalten](./LICENSE) — © 2026 komm64

Der Quellcode wird zur Transparenz veröffentlicht. Weitergabe, Wiederverwendung oder Änderung ist nicht gestattet.

---

## Entwicklung

Die Entwicklungsdokumentation (Stack, Befehle, Layout) ist auf Englisch in [README.md](./README.md).
