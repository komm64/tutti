/**
 * YouTube Studio upload wizard DOM helpers.
 *
 * Studio keeps closed `ytcp-dialog` / `tp-yt-paper-dialog` elements in the DOM
 * permanently, so "a dialog element exists" never means "a dialog is open".
 * Every helper here takes an explicit `isRendered` predicate and only reasons
 * about dialogs that are actually on screen.
 */

const YOUTUBE_VIDEO_ID_RE = /^[\w-]{11}$/;
const DIALOG_SELECTOR =
  'tp-yt-paper-dialog, ytcp-dialog, [role="dialog"], [role="alertdialog"]';
const BUTTON_SELECTOR = 'button, ytcp-button, [role="button"]';
/** Observed on Surface 2026-09-30: ytcp-video-share-dialog > ytcp-dialog > tp-yt-paper-dialog. */
const POST_PUBLISH_DIALOG_HOSTS =
  'ytcp-video-share-dialog, ytcp-uploads-still-processing-dialog';
const VIDEO_URL_IN_TEXT_RE =
  /(?:https?:\/\/)?(?:youtu\.be\/|(?:www\.)?youtube\.com\/(?:shorts\/|watch\?v=))[\w-]{11}/g;

/**
 * Buttons that confirm publishing while YouTube's copyright / policy checks
 * are still running ("We're still checking your content").
 */
const PUBLISH_CONFIRM_LABELS = [
  /^publish anyway$/i,
  /^publish$/i,
  /^このまま公開(?:する)?$/,
  /^公開(?:する)?$/,
];

export type YouTubePublishState =
  | { kind: 'confirm'; button: HTMLElement }
  | { kind: 'published'; url?: string }
  | { kind: 'pending'; step: string | null; dialogButtons: string[] };

export function getYouTubeUploadWizard(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('ytcp-uploads-dialog');
}

/** Studio assigns the video ID as soon as the upload is registered. */
export function readYouTubeUploadVideoId(root: ParentNode): string | null {
  const wizard = getYouTubeUploadWizard(root);
  const attr = wizard?.getAttribute('video-id')?.trim();
  if (attr && YOUTUBE_VIDEO_ID_RE.test(attr)) return attr;
  for (const link of Array.from(
    (wizard ?? root).querySelectorAll<HTMLAnchorElement>('a[href]'),
  )) {
    const id = parseYouTubeVideoId(link.href);
    if (id) return id;
  }
  return null;
}

export function parseYouTubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (!/(?:^|\.)(?:youtube\.com|youtu\.be)$/.test(url.hostname)) return null;
    const id = url.hostname === 'youtu.be'
      ? url.pathname.slice(1)
      : url.pathname.match(/^\/shorts\/([\w-]+)/)?.[1] ?? url.searchParams.get('v');
    return id && YOUTUBE_VIDEO_ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function buildYouTubeVideoUrl(videoId: string, isShort: boolean): string {
  return isShort
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Classifies the Studio screen after Publish was clicked.
 *
 * - `confirm`: a separate dialog asks to publish before checks complete.
 * - `published`: the wizard is gone, or a dialog links to the uploaded video.
 * - `pending`: the wizard is still saving / publishing.
 */
export function resolveYouTubePublishState(
  root: ParentNode,
  videoId: string | null,
  isRendered: (element: HTMLElement) => boolean,
): YouTubePublishState {
  const wizard = getYouTubeUploadWizard(root);
  const wizardPanel = wizard?.querySelector<HTMLElement>('tp-yt-paper-dialog') ?? null;
  const wizardOpen = wizardPanel !== null && isRendered(wizardPanel);
  const dialogs = Array.from(root.querySelectorAll<HTMLElement>(DIALOG_SELECTOR))
    .filter((dialog) => (
      dialog !== wizardPanel &&
      !dialog.contains(wizardPanel) &&
      isRendered(dialog)
    ));

  for (const dialog of dialogs) {
    const button = Array.from(dialog.querySelectorAll<HTMLElement>(BUTTON_SELECTOR))
      .find((candidate) => (
        isRendered(candidate) &&
        !isDisabled(candidate) &&
        PUBLISH_CONFIRM_LABELS.some((label) => label.test(readLabel(candidate)))
      ));
    if (button) return { kind: 'confirm', button };
  }

  // The "Video published" dialog shows the link as an anchor in some variants
  // and as plain text (next to a copy button) in others.
  for (const dialog of dialogs) {
    const candidates = [
      ...Array.from(dialog.querySelectorAll<HTMLAnchorElement>('a[href]'), (link) => link.href),
      ...(dialog.textContent ?? '').match(VIDEO_URL_IN_TEXT_RE) ?? [],
    ];
    for (const candidate of candidates) {
      const id = parseYouTubeVideoId(
        candidate.startsWith('http') ? candidate : `https://${candidate}`,
      );
      if (id && (!videoId || id === videoId)) {
        return { kind: 'published', url: normalizePublishedLink(candidate, id) };
      }
    }
  }

  // Post-publish dialogs stay on top of the still-mounted wizard. Their link can
  // be missing (for example while processing continues); the caller then builds
  // the URL from the wizard's video ID.
  const postPublishDialog = dialogs.find((dialog) => (
    dialog.closest(POST_PUBLISH_DIALOG_HOSTS) !== null ||
    (videoId !== null && (dialog.textContent ?? '').includes(videoId))
  ));
  if (!wizardOpen || postPublishDialog) return { kind: 'published' };
  return {
    kind: 'pending',
    step: wizard?.getAttribute('workflow-step') ?? null,
    dialogButtons: dialogs.flatMap((dialog) => (
      Array.from(dialog.querySelectorAll<HTMLElement>(BUTTON_SELECTOR))
        .map(readLabel)
        .filter(Boolean)
    )).slice(0, 12),
  };
}

function normalizePublishedLink(href: string, videoId: string): string {
  return /\/shorts\//.test(href)
    ? buildYouTubeVideoUrl(videoId, true)
    : buildYouTubeVideoUrl(videoId, false);
}

function readLabel(element: HTMLElement): string {
  return (element.getAttribute('aria-label') ?? element.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDisabled(element: HTMLElement): boolean {
  return element.getAttribute('aria-disabled') === 'true' ||
    element.hasAttribute('disabled');
}
