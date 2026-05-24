# Tutti

> Çapraz gönderim zahmetinin tamamı halledildi — bir Chrome uzantısı, on bir ağ.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Italiano](./README.it.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Nederlands](./README.nl.md) &middot; [Svenska](./README.sv.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Română](./README.ro.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

Tutti, bir kez yazıp aynı gönderiyi tek tıklamayla tüm sosyal ağlarınıza yayınlamanızı sağlar (11 ağ desteklenir). Limiti aşan metin otomatik olarak bölünür (X uygun bir yanıt zinciri kullanır, böylece thread olur); resimler her platformun kısıtlamalarına otomatik olarak yeniden boyutlandırılır; videolar süre / boyut için incelenir ve büyük boy klipler `ffmpeg.wasm` ile anında transkodlanır.

**Gönderi içeriğiniz asla üçüncü taraf sunucuya dokunmaz.**

🔒 [Gizlilik politikası](https://komm64.github.io/tutti/)

## Özellikler

- 📤 **Çoklu ağ yayını** — bir kez yazın, bir kez tıklayın, seçtiğiniz her ağa gönderin (11 ağ)
- ✂️ **Limiti aşan metin için otomatik bölme** — `(1/N)` olarak numaralanır, sırayla gönderilir. X'te **yanıt zinciri (thread)** olarak bağlanır, diğer ağlarda bağımsız olarak gönderilir
- `#hashtag` sınırları bölmeler arasında korunur / Bluesky uygun **rich-text facets** alır (tıklanabilir etiketler + URL annotations)
- 🖼️ **4'e kadar resim + otomatik yeniden boyutlandırma** — Bluesky'ın 1 MB tavanı gibi sıkı sınırlara otomatik olarak sığar
- 🎬 **Video gönderimi + otomatik sıkıştırma** — limiti aşan klipler yerinde `ffmpeg.wasm` (offscreen belgesinde) tarafından yeniden kodlanır
- 🔌 **İsteğe bağlı resmi API yolu** — Bluesky / Mastodon / Misskey için Ayarlar'da kimlik bilgilerini kaydedin ve Tutti DOM kodlaması yerine genel API üzerinden gönderir (SNS UI değişikliklerine dayanıklı)
- 📊 **Canlı ilerleme** — her ağın durumunu gerçek zamanlı olarak görün
- 🪪 **Giriş yapılmış hesap görüntüleme** — popup her ağın hangi hesaptan gönderim yapacağını gösterir (kazaları önlemeye yardımcı olur)
- 🛡️ **autoPost anahtarı** — varsayılan olarak kapalı. Varsayılan mod her oluşturma sayfasını açar, gövde + ekleri doldurur ve **gönderim düğmesine tıklamadan hemen önce durur** ("önizleme" modu), böylece hataları fark edebilirsiniz
- 📜 **Gönderim geçmişi** — son 20 giriş yerel olarak kaydedilir
- 💾 **Otomatik kaydedilen taslaklar** — metniniz popup'ın kapatılmasından sağ kurtulur
- ⌨️ **Göndermek için Ctrl/Cmd + Enter**
- ⚙️ **Mastodon / Misskey örnek geçişi** — Ayarlar'dan herhangi bir örneğe işaret edin
- 🩹 **Seçici hot-fix** — bir SNS DOM'u değişip yolu kırdığında, Tutti bir `selectors.json` yaması alabilir, böylece bir sonraki uzantı sürümünü beklemenize gerek kalmaz
- 🐞 **Hata bildirme düğmesi** — popup'tan tek tıklama, düzenlenmiş DOM anlık görüntüsü içeren bir GitHub issue dosyalar (auto-triage hattı bunu bir seçici PR'ye dönüştürür)
- 🌐 **Yerelleştirildi** — 31 dil (popup + seçenekler)

## Desteklenen ağlar

11 ağ. "Stable", gerçek gönderimin uçtan uca doğrulandığı anlamına gelir; "Experimental", adaptörün bağlandığı ancak autoPost ile gerçek gönderimin henüz tam olarak doğrulanmadığı anlamına gelir. Experimental olanlar için önizleme modunda (autoPost KAPALI) başlayın.

### Stable (gerçek gönderim doğrulandı)

| Ağ | text | image | shortVideo | longVideo | Yol |
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

### Experimental (yalnızca adaptör; autoPost ile gerçek gönderim henüz doğrulanmadı)

| Ağ | text | image | shortVideo | longVideo | Yol |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti, SNS'nin web oluşturma UI'sını otomatikleştirir (anti-bot değişikliklerine daha duyarlı)
- **DOM + API**: Ayarlar'da kimlik bilgilerini kaydederseniz Tutti resmi API'ye geçer. API başarısızlığında Tutti **sessizce DOM'a geri dönmez** — açık bir hata göreceksiniz. Kimlik bilgileri olmadan yalnızca DOM yolu çalışır.
- **multi-step**: Birden çok adımdan oluşan sihirbaz tarzı modal'lar için (çerçeve: `executeMultiStepFlow`)

## Kurulum

### Chrome Web Store

Yayınlandı (Unlisted): [Web Store'da Tutti](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Sıkıştırılmamış / geliştirme yapısı

[Releases](https://github.com/komm64/tutti/releases)'den en son zip dosyasını indirin, ardından:

1. Sıkıştırmasını açın
2. `chrome://extensions/` açın (veya Brave'de `brave://extensions/`)
3. "Geliştirici modu"nu açın
4. "Paketlenmemiş öğe yükle"ye tıklayın ve sıkıştırması açılmış klasörü seçin

## Destek

Sorular, hata raporları, özellik istekleri: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

Veya **contact@komm64.com**'a e-posta gönderin.

## Gizlilik

Gönderi metni, resimler ve video **tamamen tarayıcınızın içinde** işlenir — asla herhangi bir üçüncü taraf sunucuya gönderilmez. Ayrıntılar için [gizlilik politikası](https://komm64.github.io/tutti/)na bakın.

## Lisans

[Tüm hakları saklıdır](./LICENSE) — © 2026 komm64

Kaynak kodu şeffaflık için yayınlanmıştır. Yeniden dağıtım, yeniden kullanım veya değiştirme izin verilmez.

---

## Geliştirme

Geliştirme dokümantasyonu (Stack, Komutlar, Düzen) İngilizce olarak [README.md](./README.md)'dedir.
