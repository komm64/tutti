# Tutti

> Çapraz gönderim zahmetinin tamamı halledildi — bir Chrome uzantısı, on bir ağ.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

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
