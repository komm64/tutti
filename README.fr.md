# Tutti

> Toutes les tracas de la publication croisée, gérés — une extension Chrome, onze réseaux.

[English](./README.md) &middot; [日本語](./README.ja.md) &middot; [简体中文](./README.zh_CN.md) &middot; [繁體中文](./README.zh_TW.md) &middot; [한국어](./README.ko.md) &middot; [Español](./README.es.md) &middot; [Español (LatAm)](./README.es_419.md) &middot; [Português (BR)](./README.pt_BR.md) &middot; [Português (PT)](./README.pt_PT.md) &middot; [Русский](./README.ru.md) &middot; [Deutsch](./README.de.md) &middot; [Polski](./README.pl.md) &middot; [Türkçe](./README.tr.md) &middot; [Italiano](./README.it.md) &middot; [Čeština](./README.cs.md) &middot; [Українська](./README.uk.md) &middot; [Magyar](./README.hu.md) &middot; [ไทย](./README.th.md) &middot; [Tiếng Việt](./README.vi.md) &middot; [Nederlands](./README.nl.md) &middot; [Svenska](./README.sv.md) &middot; [العربية](./README.ar.md) &middot; [Bahasa Indonesia](./README.id.md) &middot; [Suomi](./README.fi.md) &middot; [Ελληνικά](./README.el.md) &middot; [Български](./README.bg.md) &middot; [Norsk](./README.no.md) &middot; [Română](./README.ro.md) &middot; [Dansk](./README.da.md) &middot; [Esperanto](./README.eo.md)

Tutti vous permet d'écrire une fois et de diffuser la même publication sur tous vos réseaux sociaux en un seul clic (11 réseaux pris en charge). Le texte qui dépasse la limite est divisé automatiquement (X utilise une véritable chaîne de réponses pour qu'il devienne un thread); les images sont automatiquement redimensionnées pour les contraintes de chaque plateforme; les vidéos sont inspectées pour la durée / taille, et les clips trop volumineux sont transcodés à la volée avec `ffmpeg.wasm`.

**Le contenu de vos publications ne touche jamais aucun serveur tiers.**

🔒 [Politique de confidentialité](https://komm64.github.io/tutti/)

## Fonctionnalités

- 📤 **Diffusion multi-réseaux** — écrivez une fois, cliquez une fois, publiez sur chaque réseau que vous avez sélectionné (11 réseaux)
- ✂️ **Division automatique pour texte dépassé** — numéroté `(1/N)`, publié séquentiellement. Sur X, ils sont connectés en **chaîne de réponses (thread)**, sur d'autres réseaux ils sont publiés indépendamment
- Les limites de `#hashtag` sont préservées lors des divisions / Bluesky reçoit de véritables **rich-text facets** (tags clicables + URL annotations)
- 🖼️ **Jusqu'à 4 images + redimensionnement automatique** — s'adapte automatiquement aux limites strictes comme le plafond de 1 Mo de Bluesky
- 🎬 **Publication vidéo + compression automatique** — les clips dépassés sont réencodés sur place par `ffmpeg.wasm` (dans un document offscreen)
- 🔌 **Chemin d'API officielle optionnel** — pour Bluesky / Mastodon / Misskey, enregistrez les identifiants dans les Paramètres et Tutti publie via l'API publique au lieu du scripting DOM (résilient aux changements d'UI des SNS)
- 📊 **Progression en direct** — voir le statut de chaque réseau en temps réel
- 🪪 **Affichage du compte connecté** — le popup montre depuis quel compte chaque réseau publiera (aide à prévenir les accidents)
- 🛡️ **Bascule autoPost** — désactivé par défaut. Le mode par défaut ouvre chaque page de composition, remplit le corps + pièces jointes, et **s'arrête juste avant de cliquer sur le bouton de publication** (mode "prévisualisation") afin que vous puissiez repérer les erreurs
- 📜 **Historique des publications** — 20 dernières entrées enregistrées localement
- 💾 **Brouillons enregistrés automatiquement** — votre texte survit à la fermeture du popup
- ⌨️ **Ctrl/Cmd + Entrée pour publier**
- ⚙️ **Basculement d'instances Mastodon / Misskey** — pointez vers n'importe quelle instance depuis les Paramètres
- 🩹 **Hot-fix de sélecteurs** — lorsqu'un DOM SNS change et casse un chemin, Tutti peut récupérer un patch `selectors.json` afin que vous n'ayez pas à attendre la prochaine version de l'extension
- 🐞 **Bouton de rapport de bug** — un clic depuis le popup crée un issue GitHub avec un instantané DOM expurgé (le pipeline auto-triage le transforme en PR de sélecteur)
- 🌐 **Localisé** — 31 langues (popup + options)

## Réseaux pris en charge

11 réseaux. "Stable" signifie que la publication réelle a été vérifiée de bout en bout; "Experimental" signifie que l'adaptateur est connecté mais que la publication réelle avec autoPost n'a pas encore été entièrement validée. Pour les Experimental, commencez en mode prévisualisation (autoPost OFF).

### Stable (publication réelle vérifiée)

| Réseau | text | image | shortVideo | longVideo | Chemin |
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

### Experimental (adaptateur uniquement; publication réelle avec autoPost pas encore vérifiée)

| Réseau | text | image | shortVideo | longVideo | Chemin |
|---|:---:|:---:|:---:|:---:|---|
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

- **DOM**: Tutti automatise l'UI web de composition du SNS (plus sensible aux changements anti-bot)
- **DOM + API**: Si vous enregistrez les identifiants dans les Paramètres, Tutti passe à l'API officielle. En cas d'échec de l'API, Tutti **ne revient pas silencieusement au DOM** — vous verrez une erreur explicite. Sans identifiants, seul le chemin DOM s'exécute.
- **multi-step**: Pour les modales de type assistant à plusieurs étapes (framework: `executeMultiStepFlow`)

## Installation

### Chrome Web Store

Publié (Unlisted): [Tutti sur le Web Store](https://chromewebstore.google.com/detail/tutti/mcjfgdcffjfhkcepfpnifcpknlddmbpe)

### Décompressé / build de développement

Téléchargez le dernier zip depuis [Releases](https://github.com/komm64/tutti/releases), puis:

1. Décompressez-le
2. Ouvrez `chrome://extensions/` (ou `brave://extensions/` sur Brave)
3. Activez le "Mode développeur"
4. Cliquez sur "Charger l'extension non empaquetée" et choisissez le dossier décompressé

## Support

Questions, rapports de bugs, demandes de fonctionnalités : **[komm64.github.io/tutti/support.html](https://komm64.github.io/tutti/support.html)**

Ou envoyez un e-mail à **contact@komm64.com**.

## Confidentialité

Le texte, les images et la vidéo des publications sont traités **entièrement à l'intérieur de votre navigateur** — ils ne sont jamais envoyés à aucun serveur tiers. Voir la [politique de confidentialité](https://komm64.github.io/tutti/) pour les détails.

## Licence

[Tous droits réservés](./LICENSE) — © 2026 komm64

Le code source est publié à des fins de transparence. La redistribution, la réutilisation ou la modification ne sont pas autorisées.

---

## Développement

La documentation de développement (Stack, Commandes, Layout) est en anglais dans [README.md](./README.md).
