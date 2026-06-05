# Tutti

> 크로스포스팅의 모든 번거로움을 처리 — 하나의 Chrome 확장 프로그램, 열한 개의 네트워크.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti는 한 번 작성하여 동일한 게시물을 모든 소셜 네트워크에 클릭 한 번으로 브로드캐스트할 수 있습니다 (11개 네트워크 지원). 글자 수 제한을 초과하는 텍스트는 자동 분할됩니다 (X는 정식 답글 체인을 사용하여 thread가 됨); 이미지는 각 플랫폼 제약에 맞게 자동 조정됩니다; 동영상은 길이/크기가 검사되고, 크기 초과 클립은 `ffmpeg.wasm`으로 즉석에서 트랜스코딩됩니다.

**귀하의 게시 콘텐츠는 어떠한 제3자 서버에도 닿지 않습니다.**

🔒 [개인정보 처리방침](https://komm64.github.io/tutti/)

## 기능

- 📤 **멀티 네트워크 브로드캐스트** — 한 번 작성, 한 번 클릭, 선택한 모든 네트워크에 게시 (11개 네트워크)
- ✂️ **초과 텍스트 자동 분할** — `(1/N)`로 번호 매김, 순차적으로 게시. X에서는 **답글 체인 (thread)**으로 연결되고, 다른 네트워크에서는 독립적으로 게시
- 분할 시 `#hashtag` 경계 보존 / Bluesky는 정식 **rich-text facets** (클릭 가능한 태그 + URL annotations) 획득
- 🖼️ **최대 4개 이미지 + 자동 크기 조정** — Bluesky의 1 MB 상한과 같은 엄격한 제한에 자동 적합
- 🎬 **동영상 게시 + 자동 압축** — 초과 클립은 `ffmpeg.wasm`(오프스크린 문서)에서 즉석 재인코딩
- 🔌 **선택적 공식 API 경로** — Bluesky / Mastodon / Misskey의 경우 설정에 자격 증명을 등록하면 Tutti가 DOM 스크립팅 대신 공개 API를 통해 게시 (SNS UI 변경에 강함)
- 📊 **실시간 진행률** — 각 네트워크의 상태를 실시간으로 확인
- 🪪 **로그인된 계정 표시** — popup에 각 네트워크가 어떤 계정에서 게시할지 표시 (실수 방지)
- 🛡️ **autoPost 토글** — 기본적으로 꺼짐. 기본 모드는 각 작성 페이지를 열고 본문+첨부를 채우며 **게시 버튼 클릭 직전에 멈춤** ("미리보기" 모드)으로 실수를 발견할 수 있음
- 📜 **게시 기록** — 마지막 20개 항목이 로컬에 저장
- 💾 **자동 저장 초안** — popup을 닫아도 텍스트가 살아남음
- ⌨️ **Ctrl/Cmd + Enter로 게시**
- ⚙️ **Mastodon / Misskey 인스턴스 전환** — 설정에서 임의의 인스턴스를 가리킴
- 🩹 **Selector 핫픽스** — SNS DOM이 변경되어 경로가 깨지면 Tutti는 `selectors.json` 패치를 가져올 수 있으므로 다음 확장 프로그램 릴리스를 기다릴 필요 없음
- 🐞 **버그 신고 버튼** — popup에서 한 번의 클릭으로 redacted DOM 스냅샷이 포함된 GitHub issue 제출 (auto-triage 파이프라인이 이를 selector PR로 변환)
- 🌐 **현지화** — 31개 언어 (popup + 옵션)

## 지원되는 네트워크

11개 네트워크. "Stable"은 실제 게시가 종단 간 검증되었음을 의미합니다; "Experimental"은 어댑터가 연결되었지만 autoPost 실제 게시가 아직 완전히 검증되지 않았음을 의미합니다. Experimental의 경우 미리보기 모드 (autoPost OFF)로 시작하세요.

### Stable (실제 게시 검증됨)

| 네트워크 | text | image | shortVideo | longVideo | 경로 |
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

### Experimental (어댑터만; autoPost 실제 게시 아직 검증되지 않음)

| 네트워크 | text | image | shortVideo | longVideo | 경로 |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti가 SNS의 웹 작성 UI를 자동화 (안티봇 변경에 더 민감)
- **DOM + API**: 설정에 자격 증명을 저장하면 Tutti가 공식 API로 전환됩니다. API 실패 시 Tutti는 **DOM으로 조용히 폴백하지 않음** — 명시적인 오류를 보게 됩니다. 자격 증명 없이는 DOM 경로만 실행됩니다.
- **multi-step**: 여러 단계에 걸친 마법사 스타일 모달용 (프레임워크: `executeMultiStepFlow`)

## 설치

### Chrome 웹 스토어

게시됨 (Unlisted): [웹 스토어의 Tutti](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### 압축 해제 / 개발 빌드

[Releases](https://github.com/komm64/tutti/releases)에서 최신 zip을 다운로드한 후:

1. 압축 해제
2. `chrome://extensions/` (또는 Brave에서 `brave://extensions/`) 열기
3. "개발자 모드" 켜기
4. "압축해제된 확장 프로그램을 로드합니다"를 클릭하고 압축 해제된 폴더 선택

## 지원

질문, 버그 신고, 기능 요청: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

또는 **contact@komm64.com**으로 이메일.

## 개인정보

게시 텍스트, 이미지, 동영상은 **귀하의 브라우저 내부에서 완전히** 처리됩니다 — 어떠한 제3자 서버로도 전송되지 않습니다. 자세한 내용은 [개인정보 처리방침](https://komm64.github.io/tutti/)을 참조하세요.

## 라이선스

[All Rights Reserved](./LICENSE) — © 2026 komm64

소스 코드는 투명성을 위해 공개됩니다. 재배포, 재사용 또는 수정은 허용되지 않습니다.

---

## 개발

개발 문서 (Stack, Commands, Layout)는 영어로 [README.md](./README.md)에 있습니다.
