# Tutti

> Toutes les tracas de la publication croisée, gérés — une extension Chrome, onze réseaux.

[undefined](./README.eo.md) &middot; [undefined](./README.md) &middot; [undefined](./README.zh-Hans.md) &middot; [undefined](./README.ru.md) &middot; [undefined](./README.es-ES.md) &middot; [undefined](./README.pt-BR.md) &middot; [undefined](./README.de.md) &middot; [undefined](./README.ko.md) &middot; [undefined](./README.ja.md) &middot; [undefined](./README.pl.md) &middot; [undefined](./README.zh-Hant.md) &middot; [undefined](./README.tr.md) &middot; [undefined](./README.th.md) &middot; [undefined](./README.es-419.md) &middot; [undefined](./README.uk.md) &middot; [undefined](./README.it.md) &middot; [undefined](./README.cs.md) &middot; [undefined](./README.hu.md) &middot; [undefined](./README.sv.md) &middot; [undefined](./README.nl.md) &middot; [undefined](./README.vi.md) &middot; [undefined](./README.id.md) &middot; [undefined](./README.ro.md) &middot; [undefined](./README.el.md) &middot; [undefined](./README.pt-PT.md) &middot; [undefined](./README.ar.md) &middot; [undefined](./README.fi.md) &middot; [undefined](./README.bg.md) &middot; [undefined](./README.no.md) &middot; [undefined](./README.da.md)

Tutti vous permet d'écrire une fois et de diffuser la même publication sur tous vos réseaux sociaux en un seul clic (11 réseaux pris en charge). Le texte qui dépasse la limite est divisé automatiquement (X utilise une véritable chaîne de réponses pour qu'il devienne un thread); les images sont automatiquement redimensionnées pour les contraintes de chaque plateforme; les vidéos sont inspectées pour la durée / taille, et les clips trop volumineux sont transcodés à la volée avec `ffmpeg.wasm`.

**Le contenu de vos publications ne touche jamais aucun serveur tiers.**

🔒 [Politique de confidentialité](https://tutti.komm64.com/privacy.html)

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

Questions, rapports de bugs, demandes de fonctionnalités : **[tutti.komm64.com/support.html](https://tutti.komm64.com/support.html)**

Ou envoyez un e-mail à **contact@komm64.com**.

## Confidentialité

Le texte, les images et la vidéo des publications sont traités **entièrement à l'intérieur de votre navigateur** — ils ne sont jamais envoyés à aucun serveur tiers. Voir la [politique de confidentialité](https://tutti.komm64.com/privacy.html) pour les détails.

## Responsible Use and Disclaimer

Tutti assists posting actions that you initiate. You remain responsible for your content, selected accounts, and compliance with each platform's terms, rules, posting limits, community guidelines, and applicable laws. Automation, repeated or duplicate content, unauthorized content, or insufficient sensitive-content labeling can result in platform enforcement. Tutti is provided as is, without warranties, and liability is limited to the maximum extent permitted by law. Full terms: https://tutti.komm64.com/terms.html

## Licence

[Tous droits réservés](./LICENSE) — © 2026 komm64

Le code source est publié à des fins de transparence. La redistribution, la réutilisation ou la modification ne sont pas autorisées.

---

## Développement

La documentation de développement (Stack, Commandes, Layout) est en anglais dans [README.md](./README.md).
