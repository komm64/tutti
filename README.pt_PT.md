# Tutti

> Todo o incómodo de publicação cruzada, tratado — uma extensão Chrome, onze redes.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Italiano](./README.it.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Nederlands](./README.nl.md) &middot; [Svenska](./README.sv.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Română](./README.ro.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

O Tutti permite escrever uma vez e transmitir a mesma publicação para todas as suas redes sociais com um único clique (11 redes suportadas). Texto que excede o limite é dividido automaticamente (o X usa uma cadeia de respostas adequada para se tornar uma thread); as imagens são redimensionadas automaticamente para as restrições de cada plataforma; os vídeos são inspecionados quanto à duração / tamanho, e os clips de tamanho excessivo são transcodificados em tempo real com `ffmpeg.wasm`.

**O conteúdo das suas publicações nunca toca em qualquer servidor de terceiros.**

🔒 [Política de Privacidade](https://komm64.github.io/tutti/)

## Funcionalidades

- 📤 **Transmissão multi-rede** — escreva uma vez, clique uma vez, publique em cada rede que selecionou (11 redes)
- ✂️ **Divisão automática para texto excedido** — numerado como `(1/N)`, publicado sequencialmente. No X são ligados como **cadeia de respostas (thread)**, noutras redes são publicados de forma independente
- Os limites de `#hashtag` são preservados nas divisões / O Bluesky recebe **rich-text facets** adequados (tags clicáveis + URL annotations)
- 🖼️ **Até 4 imagens + redimensionamento automático** — encaixa automaticamente em limites apertados como o teto de 1 MB do Bluesky
- 🎬 **Publicação de vídeo + compressão automática** — clips excedidos são recodificados no local pelo `ffmpeg.wasm` (num documento offscreen)
- 🔌 **Caminho de API oficial opcional** — para Bluesky / Mastodon / Misskey, registe credenciais nas Definições e o Tutti publica pela API pública em vez de scripting DOM (resiliente a alterações de UI dos SNS)
- 📊 **Progresso em direto** — veja o estado de cada rede em tempo real
- 🪪 **Apresentação da conta com sessão iniciada** — o popup mostra a partir de que conta cada rede publicará (ajuda a evitar acidentes)
- 🛡️ **Comutador autoPost** — desativado por omissão. O modo predefinido abre cada página de composição, preenche o corpo + anexos, e **para antes de clicar no botão de publicar** (modo "pré-visualização") para que possa detetar erros
- 📜 **Histórico de publicações** — últimas 20 entradas guardadas localmente
- 💾 **Rascunhos guardados automaticamente** — o seu texto sobrevive ao fecho do popup
- ⌨️ **Ctrl/Cmd + Enter para publicar**
- ⚙️ **Alternância de instâncias Mastodon / Misskey** — aponte para qualquer instância a partir das Definições
- 🩹 **Hot-fix de seletores** — quando um SNS DOM muda e quebra um caminho, o Tutti pode obter um patch de `selectors.json` para que não tenha de esperar pelo próximo lançamento da extensão
- 🐞 **Botão de relatório de bugs** — um clique no popup submete um issue do GitHub com uma captura DOM redigida (o pipeline auto-triage transforma-a num PR de seletor)
- 🌐 **Localizado** — 31 idiomas (popup + opções)

## Redes suportadas

11 redes. "Stable" significa que a publicação real foi verificada de ponta a ponta; "Experimental" significa que o adaptador está ligado mas a publicação real com autoPost ainda não foi totalmente validada. Para os Experimentais, comece no modo pré-visualização (autoPost OFF).

### Stable (publicação real verificada)

| Rede | text | image | shortVideo | longVideo | Caminho |
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

### Experimental (apenas adaptador; publicação real com autoPost ainda não verificada)

| Rede | text | image | shortVideo | longVideo | Caminho |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: O Tutti automatiza a UI web de composição do SNS (mais sensível a alterações anti-bot)
- **DOM + API**: Se guardar credenciais nas Definições, o Tutti muda para a API oficial. Em caso de falha da API, o Tutti **não recorre silenciosamente ao DOM** — verá um erro explícito. Sem credenciais, apenas o caminho DOM é executado.
- **multi-step**: Para diálogos modais estilo assistente em vários passos (framework: `executeMultiStepFlow`)

## Instalação

### Chrome Web Store

Publicado (Unlisted): [Tutti na Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Descompactado / build de desenvolvimento

Transfira o zip mais recente em [Releases](https://github.com/komm64/tutti/releases), depois:

1. Descompacte-o
2. Abra `chrome://extensions/` (ou `brave://extensions/` no Brave)
3. Ative o "Modo de programador"
4. Clique em "Carregar não empacotada" e escolha a pasta descompactada

## Apoio

Perguntas, relatórios de bugs, pedidos de funcionalidade: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

Ou envie e-mail para **contact@komm64.com**.

## Privacidade

Texto, imagens e vídeo das publicações são processados **inteiramente dentro do seu navegador** — nunca são enviados para qualquer servidor de terceiros. Veja a [política de privacidade](https://komm64.github.io/tutti/) para detalhes.

## Licença

[Todos os direitos reservados](./LICENSE) — © 2026 komm64

O código-fonte é publicado para transparência. A redistribuição, reutilização ou modificação não é permitida.

---

## Desenvolvimento

A documentação de desenvolvimento (Stack, Comandos, Layout) está em inglês em [README.md](./README.md).
