# Tutti

> Όλη η φασαρία της διασταυρούμενης δημοσίευσης, αντιμετωπίστηκε — μία επέκταση Chrome, έντεκα δίκτυα.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Το Tutti σας επιτρέπει να γράψετε μία φορά και να μεταδώσετε την ίδια ανάρτηση σε όλα τα κοινωνικά σας δίκτυα με ένα μόνο κλικ (υποστηρίζονται 11 δίκτυα). Το κείμενο που υπερβαίνει το όριο διαιρείται αυτόματα (το X χρησιμοποιεί μια κανονική αλυσίδα απαντήσεων ώστε να γίνεται thread); οι εικόνες προσαρμόζονται αυτόματα στους περιορισμούς κάθε πλατφόρμας; τα βίντεο επιθεωρούνται για διάρκεια / μέγεθος, και τα υπερμεγέθη κλιπ μετα-κωδικοποιούνται εν κινήσει με το `ffmpeg.wasm`.

**Το περιεχόμενο των αναρτήσεών σας ποτέ δεν αγγίζει κανέναν διακομιστή τρίτου.**

🔒 [Πολιτική απορρήτου](https://tutti.komm64.com/privacy.html)

## Δυνατότητες

- 📤 **Πολυδικτυακή μετάδοση** — γράψτε μία φορά, κάντε κλικ μία φορά, δημοσιεύστε σε κάθε δίκτυο που έχετε επιλέξει (11 δίκτυα)
- ✂️ **Αυτόματη διαίρεση για κείμενο που υπερβαίνει το όριο** — αριθμημένα ως `(1/N)`, δημοσιεύονται διαδοχικά. Στο X συνδέονται ως **αλυσίδα απαντήσεων (thread)**, σε άλλα δίκτυα δημοσιεύονται ανεξάρτητα
- Τα όρια `#hashtag` διατηρούνται κατά τις διαιρέσεις / το Bluesky λαμβάνει κατάλληλα **rich-text facets** (κάλιμα tags + URL annotations)
- 🖼️ **Έως 4 εικόνες + αυτόματη αλλαγή μεγέθους** — προσαρμόζεται αυτόματα σε στενά όρια όπως το ταβάνι 1 MB του Bluesky
- 🎬 **Δημοσίευση βίντεο + αυτόματη συμπίεση** — κλιπ που υπερβαίνουν το όριο επανακωδικοποιούνται επί τόπου από το `ffmpeg.wasm` (σε ένα έγγραφο offscreen)
- 🔌 **Προαιρετική διαδρομή επίσημου API** — για το Bluesky / Mastodon / Misskey, καταχωρήστε διαπιστευτήρια στις Ρυθμίσεις και το Tutti δημοσιεύει μέσω του δημόσιου API αντί για script DOM (ανθεκτικό σε αλλαγές UI των SNS)
- 📊 **Ζωντανή πρόοδος** — δείτε την κατάσταση κάθε δικτύου σε πραγματικό χρόνο
- 🪪 **Εμφάνιση συνδεδεμένου λογαριασμού** — το popup δείχνει από ποιον λογαριασμό θα δημοσιεύσει κάθε δίκτυο (βοηθά στην πρόληψη ατυχημάτων)
- 🛡️ **Διακόπτης autoPost** — απενεργοποιημένος από προεπιλογή. Η προεπιλεγμένη λειτουργία ανοίγει κάθε σελίδα σύνθεσης, γεμίζει το σώμα + τα συνημμένα και **σταματά λίγο πριν κάνετε κλικ στο κουμπί δημοσίευσης** (λειτουργία "προεπισκόπησης") ώστε να μπορείτε να εντοπίσετε λάθη
- 📜 **Ιστορικό αναρτήσεων** — οι τελευταίες 20 καταχωρήσεις αποθηκευμένες τοπικά
- 💾 **Αυτόματη αποθήκευση προχείρων** — το κείμενό σας επιζεί από το κλείσιμο του popup
- ⌨️ **Ctrl/Cmd + Enter για δημοσίευση**
- ⚙️ **Εναλλαγή instances Mastodon / Misskey** — δείξτε σε οποιοδήποτε instance από τις Ρυθμίσεις
- 🩹 **Hot-fix επιλογέων** — όταν ένα DOM SNS αλλάζει και σπάει μια διαδρομή, το Tutti μπορεί να φέρει ένα patch `selectors.json` ώστε να μην χρειάζεται να περιμένετε για την επόμενη έκδοση της επέκτασης
- 🐞 **Κουμπί αναφοράς σφαλμάτων** — ένα κλικ από το popup καταθέτει ένα GitHub issue με μια επεξεργασμένη φωτογραφία DOM (ο αγωγός auto-triage το μετατρέπει σε PR επιλογέα)
- 🌐 **Τοπικοποιημένο** — 31 γλώσσες (popup + επιλογές)

## Υποστηριζόμενα δίκτυα

11 δίκτυα. "Stable" σημαίνει ότι η πραγματική δημοσίευση έχει επαληθευτεί από άκρο σε άκρο; "Experimental" σημαίνει ότι ο προσαρμογέας είναι συνδεδεμένος αλλά η πραγματική δημοσίευση με autoPost δεν έχει ακόμη πλήρως επικυρωθεί. Για τα Experimental, ξεκινήστε σε λειτουργία προεπισκόπησης (autoPost OFF).

### Stable (πραγματική δημοσίευση επαληθευμένη)

| Δίκτυο | text | image | shortVideo | longVideo | Διαδρομή |
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

### Experimental (μόνο προσαρμογέας; πραγματική δημοσίευση με autoPost δεν έχει ακόμη επαληθευτεί)

| Δίκτυο | text | image | shortVideo | longVideo | Διαδρομή |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Το Tutti αυτοματοποιεί το web UI σύνθεσης του SNS (πιο ευαίσθητο σε αλλαγές anti-bot)
- **DOM + API**: Εάν αποθηκεύσετε διαπιστευτήρια στις Ρυθμίσεις, το Tutti μεταβαίνει στο επίσημο API. Σε περίπτωση αποτυχίας API, το Tutti **δεν επανέρχεται σιωπηρά στο DOM** — θα δείτε ένα ρητό σφάλμα. Χωρίς διαπιστευτήρια, εκτελείται μόνο η διαδρομή DOM.
- **multi-step**: Για modal τύπου wizard σε πολλά βήματα (πλαίσιο: `executeMultiStepFlow`)

## Εγκατάσταση

### Chrome Web Store

Δημοσιεύτηκε (Unlisted): [Tutti στο Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Αποσυσκευασμένο / dev build

Κατεβάστε το τελευταίο zip από το [Releases](https://github.com/komm64/tutti/releases), στη συνέχεια:

1. Αποσυμπιέστε το
2. Ανοίξτε `chrome://extensions/` (ή `brave://extensions/` στο Brave)
3. Ενεργοποιήστε τη "Λειτουργία προγραμματιστή"
4. Κάντε κλικ στο "Φόρτωση αποσυσκευασμένου" και επιλέξτε τον αποσυμπιεσμένο φάκελο

## Υποστήριξη

Ερωτήσεις, αναφορές σφαλμάτων, αιτήματα λειτουργιών: **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

Ή στείλτε email στο **contact@komm64.com**.

## Απόρρητο

Το κείμενο των αναρτήσεων, οι εικόνες και το βίντεο επεξεργάζονται **εξ ολοκλήρου μέσα στον περιηγητή σας** — δεν αποστέλλονται ποτέ σε κανέναν διακομιστή τρίτου. Δείτε την [πολιτική απορρήτου](https://tutti.komm64.com/privacy.html) για λεπτομέρειες.

## Άδεια

[Με επιφύλαξη παντός δικαιώματος](./LICENSE) — © 2026 komm64

Ο πηγαίος κώδικας δημοσιεύεται για διαφάνεια. Η αναδιανομή, επαναχρησιμοποίηση ή τροποποίηση δεν επιτρέπεται.

---

## Ανάπτυξη

Η τεκμηρίωση ανάπτυξης (Stack, Εντολές, Layout) είναι στα αγγλικά στο [README.md](./README.md).
