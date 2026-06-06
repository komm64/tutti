# Tutti

> 跨平台发布的所有麻烦,一网打尽 — 一个 Chrome 扩展,十一个社交网络。

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti 让您只需写一次,就能将同一内容一键广播到所有社交网络 (支持 11 个网络)。超出字数限制的文本自动拆分 (X 使用正规回复链使其成为一个 thread); 图片自动调整大小以符合各平台的限制; 视频经过时长/大小检查,超大视频通过 `ffmpeg.wasm` 即时转码。

**您的发布内容绝不接触任何第三方服务器。**

🔒 [隐私政策](https://tutti.komm64.com/privacy.html)

## 功能

- 📤 **多网络广播** — 写一次、点一次、发布到您选定的每个网络 (11 个网络)
- ✂️ **超限文本自动拆分** — 编号为 `(1/N)`,顺序发布。在 X 上以**回复链 (thread)**连接,在其他网络上独立发布
- 拆分时保留 `#hashtag` 边界 / Bluesky 获得正规的 **rich-text facets** (可点击标签 + URL annotations)
- 🖼️ **最多 4 张图片 + 自动调整大小** — 自动适应 Bluesky 1 MB 上限等严格限制
- 🎬 **视频发布 + 自动压缩** — 超限视频通过 `ffmpeg.wasm` (在 offscreen 文档中) 就地重新编码
- 🔌 **可选官方 API 路径** — 对于 Bluesky / Mastodon / Misskey,在设置中注册凭据,Tutti 通过官方 API 而非 DOM 脚本发布 (对 SNS UI 变化更稳健)
- 📊 **实时进度** — 实时查看各网络的状态
- 🪪 **已登录账号显示** — popup 显示每个网络将从哪个账号发布 (有助于防止误发)
- 🛡️ **autoPost 开关** — 默认关闭。默认模式打开各 compose 页面,填入正文+附件,**在点击发布按钮前停止** ("预览"模式),以便您能发现错误
- 📜 **发布历史** — 最近 20 条记录保存在本地
- 💾 **自动保存草稿** — 即使关闭 popup,您的文本也不会丢失
- ⌨️ **Ctrl/Cmd + Enter 发布**
- ⚙️ **Mastodon / Misskey 实例切换** — 从设置指向任意实例
- 🩹 **Selector 热修复** — 当 SNS DOM 变更破坏路径时,Tutti 可以获取 `selectors.json` 补丁,无需等待下次扩展发布
- 🐞 **Bug 报告按钮** — 在 popup 中一键提交带有 redacted DOM 快照的 GitHub issue (auto-triage 流水线将其转化为 selector PR)
- 🌐 **多语言** — 31 种语言 (popup + 选项)

## 支持的网络

11 个网络。"Stable"表示真实发布已端到端验证;"Experimental"表示 adapter 已接入但 autoPost 真实发布尚未完全验证。对于 Experimental 的网络,请从预览模式 (autoPost 关闭) 开始。

### Stable (真实发布已验证)

| 网络 | text | image | shortVideo | longVideo | 路径 |
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

### Experimental (仅 adapter; autoPost 真实发布尚未验证)

| 网络 | text | image | shortVideo | longVideo | 路径 |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti 自动操作 SNS 的网页 compose UI (对反机器人变化更敏感)
- **DOM + API**: 如果您在设置中保存了凭据,Tutti 会切换到官方 API。API 失败时 Tutti **不会静默回退到 DOM** — 您会看到明确的错误。没有凭据时只运行 DOM 路径。
- **multi-step**: 适用于跨多个步骤的 wizard 型模态框 (框架: `executeMultiStepFlow`)

## 安装

### Chrome 应用商店

已发布 (Unlisted): [Tutti 在 Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### 解压版 / 开发构建

从 [Releases](https://github.com/komm64/tutti/releases) 下载最新的 zip,然后:

1. 解压
2. 打开 `chrome://extensions/` (或 Brave 上的 `brave://extensions/`)
3. 打开"开发者模式"
4. 点击"加载已解压的扩展程序"并选择解压的文件夹

## 支持

问题、bug 报告、功能请求: **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

或发邮件至 **contact@komm64.com**。

## 隐私

发布的文本、图片和视频**完全在您的浏览器内**处理 — 绝不发送至任何第三方服务器。详情请参阅[隐私政策](https://tutti.komm64.com/privacy.html)。

## 许可证

[保留所有权利](./LICENSE) — © 2026 komm64

源代码出于透明性目的公开。不允许重新分发、再利用或修改。

---

## 开发

开发文档 (Stack、Commands、Layout) 以英语形式在 [README.md](./README.md) 中。
