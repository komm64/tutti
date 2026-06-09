# Tutti

> Wszystkie kłopoty z publikacją krzyżową, załatwione — jedno rozszerzenie Chrome, jedenaście sieci.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti pozwala napisać raz i rozesłać ten sam post do wszystkich Twoich sieci społecznościowych jednym kliknięciem (obsługiwanych 11 sieci). Tekst przekraczający limit jest automatycznie dzielony (X używa właściwego łańcucha odpowiedzi, dzięki czemu staje się thread); obrazy są automatycznie zmieniane do ograniczeń każdej platformy; filmy są sprawdzane pod kątem długości / rozmiaru, a zbyt duże klipy są transkodowane w locie za pomocą `ffmpeg.wasm`.

**Zawartość Twoich postów nigdy nie dotyka żadnego serwera trzeciej strony.**

🔒 [Polityka prywatności](https://tutti.komm64.com/privacy.html)

## Funkcje

- 📤 **Rozsyłanie wieloplatformowe** — napisz raz, kliknij raz, opublikuj w każdej wybranej sieci (11 sieci)
- ✂️ **Automatyczny podział tekstu nadlimitowego** — ponumerowane jako `(1/N)`, publikowane sekwencyjnie. Na X są łączone jako **łańcuch odpowiedzi (thread)**, w innych sieciach publikowane niezależnie
- Granice `#hashtag` są zachowywane przy podziałach / Bluesky otrzymuje właściwe **rich-text facets** (klikalne tagi + URL annotations)
- 🖼️ **Do 4 obrazów + automatyczna zmiana rozmiaru** — automatycznie dopasowuje się do ścisłych limitów, takich jak pułap 1 MB Bluesky
- 🎬 **Publikowanie wideo + automatyczna kompresja** — nadlimitowe klipy są przekodowywane na miejscu przez `ffmpeg.wasm` (w dokumencie offscreen)
- 🔌 **Opcjonalna ścieżka oficjalnego API** — dla Bluesky / Mastodon / Misskey zarejestruj poświadczenia w Ustawieniach, a Tutti publikuje przez publiczne API zamiast skryptowania DOM (odporne na zmiany UI SNS)
- 📊 **Postęp na żywo** — zobacz status każdej sieci w czasie rzeczywistym
- 🪪 **Wyświetlanie zalogowanego konta** — popup pokazuje, z którego konta każda sieć opublikuje (pomaga zapobiec wypadkom)
- 🛡️ **Przełącznik autoPost** — domyślnie wyłączony. Tryb domyślny otwiera każdą stronę tworzenia, wypełnia treść + załączniki i **zatrzymuje się tuż przed kliknięciem przycisku publikacji** (tryb "podglądu"), abyś mógł zauważyć błędy
- 📜 **Historia postów** — ostatnich 20 wpisów zapisanych lokalnie
- 💾 **Automatycznie zapisywane wersje robocze** — Twój tekst przetrwa zamknięcie popup
- ⌨️ **Ctrl/Cmd + Enter, aby opublikować**
- ⚙️ **Przełączanie instancji Mastodon / Misskey** — wskaż dowolną instancję z Ustawień
- 🩹 **Hot-fix selektorów** — gdy DOM SNS się zmienia i łamie ścieżkę, Tutti może pobrać patch `selectors.json`, więc nie musisz czekać na następne wydanie rozszerzenia
- 🐞 **Przycisk zgłaszania błędów** — jedno kliknięcie z popup zgłasza issue GitHub z zredagowanym snapshotem DOM (potok auto-triage przekształca to w PR selektora)
- 🌐 **Zlokalizowany** — 31 języków (popup + opcje)

## Obsługiwane sieci

11 sieci. "Stable" oznacza, że rzeczywista publikacja została zweryfikowana end-to-end; "Experimental" oznacza, że adapter jest podłączony, ale rzeczywista publikacja z autoPost nie została jeszcze w pełni zwalidowana. Dla Experimental zacznij w trybie podglądu (autoPost WYŁ).

### Stable (rzeczywista publikacja zweryfikowana)

| Sieć | text | image | shortVideo | longVideo | Ścieżka |
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

### Experimental (tylko adapter; rzeczywista publikacja z autoPost jeszcze nie zweryfikowana)

| Sieć | text | image | shortVideo | longVideo | Ścieżka |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti automatyzuje webowy UI tworzenia SNS (bardziej wrażliwy na zmiany anti-bot)
- **DOM + API**: Jeśli zapiszesz poświadczenia w Ustawieniach, Tutti przełączy się na oficjalne API. W przypadku awarii API Tutti **nie wraca po cichu do DOM** — zobaczysz wyraźny błąd. Bez poświadczeń uruchamia się tylko ścieżka DOM.
- **multi-step**: Dla modali w stylu kreatora w wielu krokach (framework: `executeMultiStepFlow`)

## Instalacja

### Chrome Web Store

Opublikowane (Unlisted): [Tutti w Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Rozpakowana / build deweloperski

Pobierz najnowszy zip z [Releases](https://github.com/komm64/tutti/releases), następnie:

1. Rozpakuj go
2. Otwórz `chrome://extensions/` (lub `brave://extensions/` w Brave)
3. Włącz "Tryb dewelopera"
4. Kliknij "Załaduj rozpakowane" i wybierz rozpakowany folder

## Pomoc

Pytania, zgłoszenia błędów, prośby o funkcje: **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

Lub wyślij e-mail na **contact@komm64.com**.

## Prywatność

Tekst postów, obrazy i wideo są przetwarzane **całkowicie wewnątrz Twojej przeglądarki** — nigdy nie są wysyłane do żadnego serwera trzeciej strony. Zobacz [politykę prywatności](https://tutti.komm64.com/privacy.html) po szczegóły.

## Responsible Use and Disclaimer

Tutti assists posting actions that you initiate. You remain responsible for your content, selected accounts, and compliance with each platform's terms, rules, posting limits, community guidelines, and applicable laws. Automation, repeated or duplicate content, unauthorized content, or insufficient sensitive-content labeling can result in platform enforcement. Tutti is provided as is, without warranties, and liability is limited to the maximum extent permitted by law. Full terms: https://tutti.komm64.com/terms.html

## Licencja

[Wszelkie prawa zastrzeżone](./LICENSE) — © 2026 komm64

Kod źródłowy jest publikowany w celach przejrzystości. Redystrybucja, ponowne użycie lub modyfikacja nie są dozwolone.

---

## Rozwój

Dokumentacja dewelopera (Stack, Commands, Layout) jest po angielsku w [README.md](./README.md).
