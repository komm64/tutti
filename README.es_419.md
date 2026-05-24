# Tutti

> Todas las complicaciones de publicar en varias redes, resueltas — una extensión de Chrome, once redes.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Français](./README.fr.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Italiano](./README.it.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Nederlands](./README.nl.md) &middot; [Svenska](./README.sv.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Română](./README.ro.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

Tutti te permite escribir una vez y transmitir la misma publicación a todas tus redes sociales con un solo clic (11 redes compatibles). El texto que excede el límite se divide automáticamente (X usa una cadena de respuestas adecuada para que se convierta en thread); las imágenes se redimensionan automáticamente para ajustarse a las restricciones de cada plataforma; los videos se inspeccionan por duración / tamaño, y los clips de gran tamaño se transcodifican sobre la marcha con `ffmpeg.wasm`.

**El contenido de tus publicaciones nunca toca ningún servidor de terceros.**

🔒 [Política de privacidad](https://komm64.github.io/tutti/)

## Características

- 📤 **Transmisión multi-red** — escribe una vez, haz clic una vez, publica en cada red que hayas seleccionado (11 redes)
- ✂️ **División automática de texto excedido** — numerado como `(1/N)`, publicado secuencialmente. En X se conectan como **cadena de respuestas (thread)**, en otras redes se publican independientemente
- Los límites de `#hashtag` se preservan al dividir / Bluesky recibe **rich-text facets** adecuados (etiquetas clicables + URL annotations)
- 🖼️ **Hasta 4 imágenes + redimensionamiento automático** — se ajusta automáticamente a límites estrictos como el tope de 1 MB de Bluesky
- 🎬 **Publicación de video + compresión automática** — los clips excedidos se vuelven a codificar in situ con `ffmpeg.wasm` (en un documento offscreen)
- 🔌 **Ruta de API oficial opcional** — para Bluesky / Mastodon / Misskey, registra credenciales en Configuración y Tutti publica vía la API pública en lugar de scripting DOM (resistente a cambios de UI de SNS)
- 📊 **Progreso en vivo** — ver el estado de cada red en tiempo real
- 🪪 **Visualización de cuenta conectada** — el popup muestra desde qué cuenta publicará cada red (ayuda a prevenir accidentes)
- 🛡️ **Switch autoPost** — desactivado por defecto. El modo predeterminado abre cada página de redacción, llena el cuerpo + adjuntos, y **se detiene justo antes de hacer clic en el botón de publicar** (modo "vista previa") para que puedas detectar errores
- 📜 **Historial de publicaciones** — últimas 20 entradas guardadas localmente
- 💾 **Borradores guardados automáticamente** — tu texto sobrevive al cierre del popup
- ⌨️ **Ctrl/Cmd + Enter para publicar**
- ⚙️ **Cambio de instancias Mastodon / Misskey** — apunta a cualquier instancia desde Configuración
- 🩹 **Hot-fix de selectores** — cuando un SNS DOM cambia y rompe una ruta, Tutti puede obtener un parche de `selectors.json` para que no tengas que esperar al próximo lanzamiento de la extensión
- 🐞 **Botón de reporte de errores** — un clic desde el popup presenta un issue de GitHub con una captura DOM redactada (la canalización auto-triage lo convierte en un PR de selector)
- 🌐 **Localizado** — 31 idiomas (popup + opciones)

## Redes compatibles

11 redes. "Stable" significa que la publicación real ha sido verificada de extremo a extremo; "Experimental" significa que el adaptador está conectado pero la publicación real con autoPost aún no ha sido completamente validada. Para los Experimental, comienza en modo vista previa (autoPost OFF).

### Stable (publicación real verificada)

| Red | text | image | shortVideo | longVideo | Ruta |
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

### Experimental (solo adaptador; publicación real con autoPost aún no verificada)

| Red | text | image | shortVideo | longVideo | Ruta |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti automatiza la UI web de redacción del SNS (más sensible a cambios anti-bot)
- **DOM + API**: Si guardas credenciales en Configuración, Tutti cambia a la API oficial. En caso de falla de API, Tutti **no recurre silenciosamente al DOM** — verás un error explícito. Sin credenciales, solo se ejecuta la ruta DOM.
- **multi-step**: Para modales tipo asistente a través de múltiples pasos (framework: `executeMultiStepFlow`)

## Instalación

### Chrome Web Store

Publicado (Unlisted): [Tutti en la Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Desempaquetado / build de desarrollo

Descarga el último zip desde [Releases](https://github.com/komm64/tutti/releases), luego:

1. Descomprímelo
2. Abre `chrome://extensions/` (o `brave://extensions/` en Brave)
3. Activa "Modo desarrollador"
4. Haz clic en "Cargar descomprimida" y elige la carpeta descomprimida

## Soporte

Preguntas, reportes de errores, solicitudes de funciones: **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

O envía un correo a **contact@komm64.com**.

## Privacidad

El texto, las imágenes y el video de las publicaciones se procesan **completamente dentro de tu navegador** — nunca se envían a ningún servidor de terceros. Consulta la [política de privacidad](https://komm64.github.io/tutti/) para más detalles.

## Licencia

[Todos los derechos reservados](./LICENSE) — © 2026 komm64

El código fuente se publica con fines de transparencia. No se permite la redistribución, reutilización o modificación.

---

## Desarrollo

La documentación de desarrollo (Stack, Comandos, Layout) está en inglés en [README.md](./README.md).
