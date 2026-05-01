# Tutti プライバシーポリシー

最終更新日: 2026-05-01 (v0.4.11)

Tutti(以下「本拡張」)は、ユーザーが入力したコンテンツを複数の SNS に
同時投稿することを目的とした Chrome 拡張機能です。本拡張の開発者(以下
「開発者」)は、ユーザーのプライバシーを尊重し、以下の方針でデータを
扱います。

## 1. 取得・送信するデータ

**投稿コンテンツ(テキスト・画像・動画)は、いかなる第三者サーバーにも
送信しません。**

- 投稿テキスト・画像・動画は、ユーザーが選択した各 SNS(X / Bluesky /
  Threads / Tumblr / Mastodon / Misskey)のページに対して、ユーザーの
  ブラウザ内でのみ渡されます。
- ユーザーの SNS アカウント情報、認証トークン、Cookie 等を本拡張が
  取得・保存・送信することはありません。
- 解析(アナリティクス)・トラッキング・広告のためのデータ収集は
  一切行いません。

### 例外: ユーザーが明示的に押した「報告する」ボタン経由のみ

エラー発生時に表示されるダイアログで **「報告する」ボタンを押した時だけ**、
以下の情報が開発者の Cloudflare Workers 経由で開発者の GitHub Issues
(https://github.com/komm64/tutti/issues) に送信されます:

- エラーメッセージ
- 拡張のバージョン
- ブラウザの User-Agent 文字列
- 拡張内部のログ最終 30 件(ログレベル設定に従う、デフォルト INFO)
  - 投稿の "本文・画像・動画"・SNS のログイン情報・Cookie 等は **含まれません**

ボタンを押すまでは送信されません。送信後は **公開** GitHub Issue として
誰でも閲覧可能になるため、内容は事前に dialog 上で確認できます。
報告自体を完全に避けたい場合は、ダイアログの「閉じる」ボタンで
キャンセルしてください。

## 2. ローカルに保存するデータ

本拡張は、Chrome の `storage` API を用いて以下のデータをユーザーの
ブラウザ内にのみ保存します:

- **設定(`chrome.storage.sync`)**: Mastodon / Misskey インスタンス URL、
  自動投稿モードの ON/OFF 等。Google アカウントで Chrome にサインイン
  している場合、Chrome 同期によって他のデバイスにも複製されます。
- **下書き(`chrome.storage.session`)**: 入力中のテキストおよび添付
  メディア(画像/動画)。ブラウザ終了で自動消去されます。
- **SNS 選択(`chrome.storage.local`)**: 投稿先としてチェックした SNS の
  記憶(投稿後もリセットしない)。デバイスローカルのみ。
- **ログイン中アカウント名(`chrome.storage.local`)**: 各 SNS で現在
  ログインしているユーザー名(誤投稿防止のため popup に表示)。デバイス
  ローカルのみ、外部送信なし。
- **投稿履歴(`chrome.storage.local`)**: 直近 20 件の投稿の先頭 80 文字、
  対象プラットフォーム、成否、タイムスタンプ。デバイスローカルのみ。
- **Selector override(`chrome.storage.local`)**: ユーザーが Settings で
  指定した URL から取得した SNS 用 selector 上書きデータ(SNS の UI が
  変わった際の応急処置用、デフォルトでは空)。

これらのデータは、ユーザーが本拡張をアンインストールするか、Chrome の
拡張機能データを削除することでいつでも完全に消去できます。

## 3. 必要な権限

| 権限 | 用途 |
|---|---|
| `storage` | 上記の設定・履歴・下書き等をローカル保存するため |
| `offscreen` | 将来機能(動画整形)で offscreen document に ffmpeg.wasm をロードするため |
| `host_permissions` | x.com / twitter.com / bsky.app / threads.com / threads.net / mastodon.social / misskey.io / tumblr.com / www.tumblr.com の投稿ページ DOM 操作および compose URL 遷移のため |
| `optional_host_permissions: https://*/*` | ユーザーが mastodon.social / misskey.io 以外のインスタンスを設定した場合に、そのドメインへのアクセスを動的に求めるため。設定保存時に明示的にユーザー許可を求め、それ以外には使いません |

## 4. 外部サービスとの関係

本拡張は X・Bluesky・Threads・Tumblr・Mastodon・Misskey の各 Web 画面を
自動操作しますが、これらサービスの公式機能ではなく、各社・運営とは無関係
です。各サービスの利用規約は各サービスのものに従ってください。

## 5. 連絡先

ご質問・ご要望は GitHub Issues までお願いします:
https://github.com/komm64/tutti/issues

## 6. ポリシーの変更

本ポリシーに変更がある場合、本ファイル(`PRIVACY.md`)の更新をもって
通知に代えるものとします。
