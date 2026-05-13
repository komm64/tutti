# E2E fixtures

Pixiv / TikTok / YouTube は画像 / 動画必須なので、E2E module は
このディレクトリの fixture を読みに来る。fixture が無いと
当該 SNS の test は **error 扱いで skip** される (他 SNS の test は影響なし)。

## ファイル

| ファイル名 | 用途 | 推奨スペック |
|---|---|---|
| `test-image.jpg` | Pixiv image post | 1024×1024 程度の JPG、~500KB 以下。Pixiv の最小寸法に余裕で乗るサイズ |
| `test-video.mp4` | TikTok / YouTube Shorts upload | 2〜5 秒 / 720p 程度 / mp4 (h.264) / 音声 silent でも可 |

## 用意の仕方

CC0 のテスト動画 / 画像を `test-image.jpg` / `test-video.mp4` として
このディレクトリに配置する。自分で撮った素材でも OK (test 垢の timeline に
晒されるので、人物 / 個人情報の入ったものは避ける)。

ffmpeg で手元で生成する場合:

```bash
# 1 秒の真っ黒な mp4 (silent)
ffmpeg -f lavfi -i color=c=black:s=720x1280:d=2 \
  -c:v libx264 -pix_fmt yuv420p -t 2 test-video.mp4

# 1024x1024 の単色 JPG
ffmpeg -f lavfi -i color=c=teal:s=1024x1024:d=1 \
  -frames:v 1 test-image.jpg
```

## .gitignore

`scripts/e2e/fixtures/*` は `.gitignore` で管理外 (binary を repo に
含めないため)。各 dev / self-hosted runner で localに用意する。
