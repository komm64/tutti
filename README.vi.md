# Tutti

> Mọi phiền phức khi đăng bài chéo nền tảng, đã được xử lý — một tiện ích Chrome, mười một mạng.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Italiano](./README.it.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Nederlands](./README.nl.md) &middot; [Svenska](./README.sv.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Română](./README.ro.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

Tutti cho phép bạn viết một lần và phát đi cùng một bài đăng đến tất cả các mạng xã hội của bạn chỉ với một cú nhấp chuột (hỗ trợ 11 mạng). Văn bản vượt quá giới hạn được tự động chia (X sử dụng chuỗi trả lời phù hợp để trở thành một thread); hình ảnh được tự động điều chỉnh kích thước theo các ràng buộc của từng nền tảng; video được kiểm tra về thời lượng / kích thước, và các clip quá lớn được transcode tại chỗ với `ffmpeg.wasm`.

**Nội dung bài đăng của bạn không bao giờ chạm vào bất kỳ máy chủ bên thứ ba nào.**

🔒 [Chính sách bảo mật](https://komm64.github.io/tutti/)

## Tính năng

- 📤 **Phát đa mạng** — viết một lần, nhấp một lần, đăng lên mỗi mạng bạn đã chọn (11 mạng)
- ✂️ **Tự động chia cho văn bản vượt giới hạn** — được đánh số `(1/N)`, đăng tuần tự. Trên X chúng được kết nối thành **chuỗi trả lời (thread)**, trên các mạng khác chúng được đăng độc lập
- Ranh giới `#hashtag` được bảo toàn qua các lần chia / Bluesky nhận được **rich-text facets** đúng cách (thẻ có thể nhấp + URL annotations)
- 🖼️ **Tối đa 4 hình ảnh + tự động điều chỉnh kích thước** — tự động vừa với các giới hạn chặt như giới hạn 1 MB của Bluesky
- 🎬 **Đăng video + nén tự động** — các clip vượt giới hạn được mã hóa lại tại chỗ bởi `ffmpeg.wasm` (trong tài liệu offscreen)
- 🔌 **Đường dẫn API chính thức tùy chọn** — đối với Bluesky / Mastodon / Misskey, đăng ký thông tin đăng nhập trong Cài đặt và Tutti đăng qua API công khai thay vì DOM scripting (đàn hồi với các thay đổi UI của SNS)
- 📊 **Tiến trình trực tiếp** — xem trạng thái của từng mạng theo thời gian thực
- 🪪 **Hiển thị tài khoản đã đăng nhập** — popup hiển thị mỗi mạng sẽ đăng từ tài khoản nào (giúp ngăn ngừa tai nạn)
- 🛡️ **Công tắc autoPost** — tắt theo mặc định. Chế độ mặc định mở từng trang soạn thảo, điền nội dung + tệp đính kèm, và **dừng lại ngay trước khi nhấp vào nút đăng** (chế độ "xem trước") để bạn có thể phát hiện sai sót
- 📜 **Lịch sử bài đăng** — 20 mục cuối cùng được lưu cục bộ
- 💾 **Bản nháp tự động lưu** — văn bản của bạn vẫn còn khi đóng popup
- ⌨️ **Ctrl/Cmd + Enter để đăng**
- ⚙️ **Chuyển đổi phiên bản Mastodon / Misskey** — chỉ vào bất kỳ phiên bản nào từ Cài đặt
- 🩹 **Selector hot-fix** — khi một DOM SNS thay đổi và phá vỡ một đường dẫn, Tutti có thể tìm nạp một patch `selectors.json` để bạn không phải chờ phát hành tiện ích tiếp theo
- 🐞 **Nút báo cáo lỗi** — một nhấp chuột từ popup gửi GitHub issue với ảnh chụp DOM đã được biên tập (pipeline auto-triage biến nó thành PR selector)
- 🌐 **Bản địa hóa** — 31 ngôn ngữ (popup + tùy chọn)

## Mạng được hỗ trợ

11 mạng. "Stable" có nghĩa là việc đăng thực tế đã được xác minh đầu cuối; "Experimental" có nghĩa là adapter đã được kết nối nhưng việc đăng thực tế với autoPost chưa được xác thực đầy đủ. Đối với Experimental, bắt đầu ở chế độ xem trước (autoPost TẮT).

### Stable (đăng thực tế đã xác minh)

| Mạng | text | image | shortVideo | longVideo | Đường dẫn |
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

### Experimental (chỉ adapter; đăng thực tế với autoPost chưa xác minh)

| Mạng | text | image | shortVideo | longVideo | Đường dẫn |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti tự động hóa giao diện soạn thảo web của SNS (nhạy cảm hơn với các thay đổi chống bot)
- **DOM + API**: Nếu bạn lưu thông tin đăng nhập trong Cài đặt, Tutti chuyển sang API chính thức. Khi API thất bại, Tutti **không quay lại DOM một cách lặng lẽ** — bạn sẽ thấy lỗi rõ ràng. Không có thông tin đăng nhập, chỉ đường dẫn DOM chạy.
- **multi-step**: Cho các modal kiểu wizard qua nhiều bước (framework: `executeMultiStepFlow`)

## Cài đặt

### Chrome Web Store

Đã xuất bản (Unlisted): [Tutti trên Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Giải nén / build phát triển

Tải xuống zip mới nhất từ [Releases](https://github.com/komm64/tutti/releases), sau đó:

1. Giải nén nó
2. Mở `chrome://extensions/` (hoặc `brave://extensions/` trên Brave)
3. Bật "Chế độ nhà phát triển"
4. Nhấp "Tải tiện ích đã giải nén" và chọn thư mục đã giải nén

## Hỗ trợ

Câu hỏi, báo cáo lỗi, yêu cầu tính năng: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

Hoặc gửi email tới **contact@komm64.com**.

## Quyền riêng tư

Văn bản bài đăng, hình ảnh và video được xử lý **hoàn toàn bên trong trình duyệt của bạn** — chúng không bao giờ được gửi đến bất kỳ máy chủ bên thứ ba nào. Xem [chính sách bảo mật](https://komm64.github.io/tutti/) để biết chi tiết.

## Giấy phép

[Bảo lưu mọi quyền](./LICENSE) — © 2026 komm64

Mã nguồn được xuất bản vì mục đích minh bạch. Không cho phép phân phối lại, tái sử dụng hoặc sửa đổi.

---

## Phát triển

Tài liệu phát triển (Stack, Lệnh, Layout) bằng tiếng Anh trong [README.md](./README.md).
