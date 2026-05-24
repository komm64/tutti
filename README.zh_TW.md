# Tutti

> 跨平台發布的所有麻煩,一網打盡 — 一個 Chrome 擴充功能,十一個社群網路。

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Italiano](./README.it.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Nederlands](./README.nl.md) &middot; [Svenska](./README.sv.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Română](./README.ro.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

Tutti 讓您只需寫一次,就能將同一內容一鍵廣播到所有社群網路 (支援 11 個網路)。超出字數限制的文字自動拆分 (X 使用正規的回覆鏈使其成為 thread); 圖片自動調整大小以符合各平台的限制; 影片經過長度/大小檢查,過大的影片透過 `ffmpeg.wasm` 即時轉碼。

**您的發布內容絕不會接觸任何第三方伺服器。**

🔒 [隱私權政策](https://komm64.github.io/tutti/)

## 功能

- 📤 **多網路廣播** — 寫一次、按一次、發布到您選定的每個網路 (11 個網路)
- ✂️ **超限文字自動拆分** — 編號為 `(1/N)`,依序發布。在 X 上以**回覆鏈 (thread)**連接,在其他網路上獨立發布
- 拆分時保留 `#hashtag` 邊界 / Bluesky 取得正規的 **rich-text facets** (可點擊標籤 + URL annotations)
- 🖼️ **最多 4 張圖片 + 自動調整大小** — 自動適應 Bluesky 1 MB 上限等嚴格限制
- 🎬 **影片發布 + 自動壓縮** — 超限影片透過 `ffmpeg.wasm` (在 offscreen 文件中) 就地重新編碼
- 🔌 **選用的官方 API 路徑** — 對於 Bluesky / Mastodon / Misskey,在設定中註冊憑證,Tutti 透過官方 API 而非 DOM 指令碼發布 (對 SNS UI 變更更穩健)
- 📊 **即時進度** — 即時查看各網路的狀態
- 🪪 **已登入帳號顯示** — popup 顯示每個網路將從哪個帳號發布 (有助於防止誤發)
- 🛡️ **autoPost 開關** — 預設關閉。預設模式開啟各 compose 頁面,填入內文+附件,**在按下發布按鈕前停止** ("預覽"模式),以便您能發現錯誤
- 📜 **發布記錄** — 最近 20 筆儲存在本機
- 💾 **自動儲存草稿** — 即使關閉 popup,您的文字也不會遺失
- ⌨️ **Ctrl/Cmd + Enter 發布**
- ⚙️ **Mastodon / Misskey 執行個體切換** — 從設定指向任意執行個體
- 🩹 **Selector 熱修復** — 當 SNS DOM 變更破壞路徑時,Tutti 可以取得 `selectors.json` 修補檔,無需等待下次擴充功能發布
- 🐞 **錯誤回報按鈕** — 在 popup 中一鍵提交帶有 redacted DOM 快照的 GitHub issue (auto-triage 流水線將其轉化為 selector PR)
- 🌐 **多語言** — 31 種語言 (popup + 選項)

## 支援的網路

11 個網路。"Stable"表示真實發布已端到端驗證;"Experimental"表示 adapter 已接入但 autoPost 真實發布尚未完全驗證。對於 Experimental 的網路,請從預覽模式 (autoPost 關閉) 開始。

### Stable (真實發布已驗證)

| 網路 | text | image | shortVideo | longVideo | 路徑 |
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

### Experimental (僅 adapter; autoPost 真實發布尚未驗證)

| 網路 | text | image | shortVideo | longVideo | 路徑 |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti 自動操作 SNS 的網頁 compose UI (對反機器人變更更敏感)
- **DOM + API**: 如果您在設定中儲存憑證,Tutti 會切換到官方 API。API 失敗時 Tutti **不會靜默回退到 DOM** — 您會看到明確的錯誤。沒有憑證時只執行 DOM 路徑。
- **multi-step**: 適用於跨多個步驟的精靈型強制回應 (框架: `executeMultiStepFlow`)

## 安裝

### Chrome 線上應用程式商店

已發布 (Unlisted): [Tutti 於 Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### 解壓版 / 開發建置

從 [Releases](https://github.com/komm64/tutti/releases) 下載最新的 zip,然後:

1. 解壓縮
2. 開啟 `chrome://extensions/` (或 Brave 上的 `brave://extensions/`)
3. 開啟"開發人員模式"
4. 點擊"載入未封裝項目"並選擇解壓縮的資料夾

## 支援

問題、錯誤回報、功能請求: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

或寄信至 **contact@komm64.com**。

## 隱私

發布的文字、圖片和影片**完全在您的瀏覽器內**處理 — 絕不會傳送至任何第三方伺服器。詳情請參閱[隱私權政策](https://komm64.github.io/tutti/)。

## 授權

[保留所有權利](./LICENSE) — © 2026 komm64

原始碼出於透明性目的公開。不允許重新分發、再利用或修改。

---

## 開發

開發文件 (Stack、Commands、Layout) 以英語形式於 [README.md](./README.md) 中。
