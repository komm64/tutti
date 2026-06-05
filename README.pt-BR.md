# Tutti

> Toda a complicação da postagem cruzada, resolvida — uma extensão do Chrome, onze redes.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.fr.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti permite que você escreva uma vez e transmita a mesma postagem para todas as suas redes sociais com um único clique (11 redes suportadas). Texto que excede o limite é dividido automaticamente (X usa uma cadeia de respostas adequada para se tornar uma thread); imagens são redimensionadas automaticamente para as restrições de cada plataforma; vídeos são inspecionados quanto à duração / tamanho, e clipes muito grandes são transcodificados em tempo real com `ffmpeg.wasm`.

**O conteúdo das suas postagens nunca toca em nenhum servidor de terceiros.**

🔒 [Política de Privacidade](https://komm64.github.io/tutti/)

## Recursos

- 📤 **Transmissão multi-rede** — escreva uma vez, clique uma vez, poste em cada rede que você selecionou (11 redes)
- ✂️ **Divisão automática para texto excedido** — numerado como `(1/N)`, postado sequencialmente. No X são conectados como uma **cadeia de respostas (thread)**, em outras redes são postados independentemente
- Os limites de `#hashtag` são preservados nas divisões / Bluesky recebe **rich-text facets** adequados (tags clicáveis + URL annotations)
- 🖼️ **Até 4 imagens + redimensionamento automático** — se ajusta automaticamente a limites apertados como o teto de 1 MB do Bluesky
- 🎬 **Postagem de vídeo + compressão automática** — clipes excedidos são recodificados no local pelo `ffmpeg.wasm` (em um documento offscreen)
- 🔌 **Caminho de API oficial opcional** — para Bluesky / Mastodon / Misskey, registre credenciais nas Configurações e o Tutti posta pela API pública em vez de scripting DOM (resiliente a mudanças de UI do SNS)
- 📊 **Progresso ao vivo** — veja o status de cada rede em tempo real
- 🪪 **Exibição de conta conectada** — o popup mostra de qual conta cada rede postará (ajuda a prevenir acidentes)
- 🛡️ **Toggle autoPost** — desativado por padrão. O modo padrão abre cada página de redação, preenche o corpo + anexos, e **para antes de clicar no botão de postagem** (modo "prévia") para que você possa identificar erros
- 📜 **Histórico de postagens** — últimas 20 entradas salvas localmente
- 💾 **Rascunhos salvos automaticamente** — seu texto sobrevive ao fechamento do popup
- ⌨️ **Ctrl/Cmd + Enter para postar**
- ⚙️ **Alternância de instâncias Mastodon / Misskey** — aponte para qualquer instância pelas Configurações
- 🩹 **Hot-fix de seletores** — quando um DOM do SNS muda e quebra um caminho, o Tutti pode buscar um patch de `selectors.json` para que você não precise esperar o próximo lançamento da extensão
- 🐞 **Botão de relatório de bugs** — um clique no popup cria um issue do GitHub com um snapshot DOM redigido (a pipeline auto-triage transforma isso em um PR de seletor)
- 🌐 **Localizado** — 31 idiomas (popup + opções)

## Redes suportadas

11 redes. "Stable" significa que a postagem real foi verificada de ponta a ponta; "Experimental" significa que o adaptador está conectado mas a postagem real com autoPost ainda não foi totalmente validada. Para os Experimentais, comece no modo prévia (autoPost OFF).

### Stable (postagem real verificada)

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

### Experimental (apenas adaptador; postagem real com autoPost ainda não verificada)

| Rede | text | image | shortVideo | longVideo | Caminho |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti automatiza a UI web de redação do SNS (mais sensível a mudanças anti-bot)
- **DOM + API**: Se você salvar credenciais nas Configurações, o Tutti muda para a API oficial. Em caso de falha da API, o Tutti **não retorna silenciosamente ao DOM** — você verá um erro explícito. Sem credenciais, apenas o caminho DOM é executado.
- **multi-step**: Para modais estilo assistente em vários passos (framework: `executeMultiStepFlow`)

## Instalação

### Chrome Web Store

Publicado (Unlisted): [Tutti na Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Descompactado / build de desenvolvimento

Baixe o zip mais recente em [Releases](https://github.com/komm64/tutti/releases), então:

1. Descompacte-o
2. Abra `chrome://extensions/` (ou `brave://extensions/` no Brave)
3. Ative o "Modo desenvolvedor"
4. Clique em "Carregar sem compactação" e escolha a pasta descompactada

## Suporte

Perguntas, relatórios de bugs, solicitações de recursos: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

Ou envie e-mail para **contact@komm64.com**.

## Privacidade

Texto, imagens e vídeo de postagens são processados **inteiramente dentro do seu navegador** — nunca são enviados a nenhum servidor de terceiros. Veja a [política de privacidade](https://komm64.github.io/tutti/) para detalhes.

## Licença

[Todos os direitos reservados](./LICENSE) — © 2026 komm64

O código-fonte é publicado para transparência. Redistribuição, reutilização ou modificação não são permitidas.

---

## Desenvolvimento

A documentação de desenvolvimento (Stack, Comandos, Layout) está em inglês em [README.md](./README.md).
