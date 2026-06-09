# Tutti

> Semua kerepotan cross-posting, ditangani — satu ekstensi Chrome, sebelas jejaring.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti memungkinkan Anda menulis sekali dan menyiarkan postingan yang sama ke semua jejaring sosial Anda dengan satu klik (11 jejaring didukung). Teks yang melebihi batas dibagi secara otomatis (X menggunakan rantai balasan yang tepat sehingga menjadi thread); gambar diubah ukurannya secara otomatis ke batasan setiap platform; video diperiksa untuk durasi / ukuran, dan klip berlebihan ditranskode dengan cepat menggunakan `ffmpeg.wasm`.

**Konten postingan Anda tidak pernah menyentuh server pihak ketiga mana pun.**

🔒 [Kebijakan privasi](https://tutti.komm64.com/privacy.html)

## Fitur

- 📤 **Siaran multi-jejaring** — tulis sekali, klik sekali, posting ke setiap jejaring yang telah Anda pilih (11 jejaring)
- ✂️ **Pembagian otomatis untuk teks berlebihan** — diberi nomor sebagai `(1/N)`, diposting secara berurutan. Di X mereka terhubung sebagai **rantai balasan (thread)**, di jejaring lain mereka diposting secara independen
- Batas `#hashtag` dipertahankan di seluruh pembagian / Bluesky mendapatkan **rich-text facets** yang tepat (tag yang dapat diklik + URL annotations)
- 🖼️ **Hingga 4 gambar + ubah ukuran otomatis** — secara otomatis pas dengan batas ketat seperti batas 1 MB Bluesky
- 🎬 **Posting video + kompresi otomatis** — klip berlebihan direkam ulang di tempat oleh `ffmpeg.wasm` (dalam dokumen offscreen)
- 🔌 **Jalur API resmi opsional** — untuk Bluesky / Mastodon / Misskey, daftarkan kredensial di Pengaturan dan Tutti memposting melalui API publik daripada scripting DOM (tahan terhadap perubahan UI SNS)
- 📊 **Kemajuan langsung** — lihat status setiap jejaring secara real-time
- 🪪 **Tampilan akun yang masuk** — popup menunjukkan dari akun mana setiap jejaring akan memposting (membantu mencegah kecelakaan)
- 🛡️ **Sakelar autoPost** — dimatikan secara default. Mode default membuka setiap halaman penyusunan, mengisi badan + lampiran, dan **berhenti sebelum mengklik tombol posting** (mode "pratinjau") sehingga Anda dapat melihat kesalahan
- 📜 **Riwayat postingan** — 20 entri terakhir disimpan secara lokal
- 💾 **Draf yang disimpan otomatis** — teks Anda bertahan dari menutup popup
- ⌨️ **Ctrl/Cmd + Enter untuk memposting**
- ⚙️ **Peralihan instance Mastodon / Misskey** — arahkan ke instance mana pun dari Pengaturan
- 🩹 **Hot-fix selektor** — ketika DOM SNS berubah dan merusak jalur, Tutti dapat mengambil patch `selectors.json` sehingga Anda tidak perlu menunggu rilis ekstensi berikutnya
- 🐞 **Tombol laporan bug** — satu klik dari popup mengajukan issue GitHub dengan snapshot DOM yang disunting (pipeline auto-triage mengubahnya menjadi PR selektor)
- 🌐 **Dilokalkan** — 31 bahasa (popup + opsi)

## Jejaring yang didukung

11 jejaring. "Stable" berarti posting nyata telah diverifikasi end-to-end; "Experimental" berarti adapter terhubung tetapi posting nyata dengan autoPost belum sepenuhnya divalidasi. Untuk Experimental, mulai dalam mode pratinjau (autoPost MATI).

### Stable (posting nyata terverifikasi)

| Jejaring | text | image | shortVideo | longVideo | Jalur |
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

### Experimental (hanya adapter; posting nyata dengan autoPost belum terverifikasi)

| Jejaring | text | image | shortVideo | longVideo | Jalur |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti mengotomatiskan UI web penyusunan SNS (lebih sensitif terhadap perubahan anti-bot)
- **DOM + API**: Jika Anda menyimpan kredensial di Pengaturan, Tutti beralih ke API resmi. Pada kegagalan API, Tutti **tidak diam-diam kembali ke DOM** — Anda akan melihat kesalahan eksplisit. Tanpa kredensial, hanya jalur DOM yang berjalan.
- **multi-step**: Untuk modal bergaya wizard melintasi beberapa langkah (framework: `executeMultiStepFlow`)

## Instalasi

### Chrome Web Store

Diterbitkan (Unlisted): [Tutti di Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Belum dibongkar / build pengembangan

Unduh zip terbaru dari [Releases](https://github.com/komm64/tutti/releases), kemudian:

1. Buka zipnya
2. Buka `chrome://extensions/` (atau `brave://extensions/` di Brave)
3. Aktifkan "Mode pengembang"
4. Klik "Muat tidak dibongkar" dan pilih folder yang sudah dibongkar

## Dukungan

Pertanyaan, laporan bug, permintaan fitur: **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

Atau email **contact@komm64.com**.

## Privasi

Teks postingan, gambar, dan video diproses **sepenuhnya di dalam browser Anda** — tidak pernah dikirim ke server pihak ketiga mana pun. Lihat [kebijakan privasi](https://tutti.komm64.com/privacy.html) untuk detail.

## Responsible Use and Disclaimer

Tutti assists posting actions that you initiate. You remain responsible for your content, selected accounts, and compliance with each platform's terms, rules, posting limits, community guidelines, and applicable laws. Automation, repeated or duplicate content, unauthorized content, or insufficient sensitive-content labeling can result in platform enforcement. Tutti is provided as is, without warranties, and liability is limited to the maximum extent permitted by law. Full terms: https://tutti.komm64.com/terms.html

## Lisensi

[Hak cipta dilindungi](./LICENSE) — © 2026 komm64

Kode sumber diterbitkan untuk transparansi. Pendistribusian ulang, penggunaan kembali, atau modifikasi tidak diizinkan.

---

## Pengembangan

Dokumentasi pengembangan (Stack, Perintah, Layout) dalam bahasa Inggris di [README.md](./README.md).
