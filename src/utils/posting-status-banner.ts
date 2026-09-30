/**
 * In-page status banner shown on the SNS tab while Tutti operates it.
 *
 * Video posts run in a dedicated foreground window and ask the user not to
 * touch it, so the tab itself must say what is happening and for how long.
 * The banner lives in a closed shadow root with `pointer-events: none`: SNS
 * DOM queries, `innerText` scans and clicks never see or hit it.
 */

import type { PostFlowStep } from '../messages';
import { t } from './i18n';
import { getPostProgressSnapshot, type PostProgressSnapshot } from './post-submission-state';

export type PostingPhase = 'prepare' | 'media' | 'text' | 'submit' | 'confirm' | 'working';

/** A single step exceeding this is flagged as slow instead of looking frozen. */
export const POSTING_STEP_SLOW_MS = 45_000;

const PHASE_RULES: readonly [PostingPhase, RegExp][] = [
  ['confirm', /completion|confirmation|post-processing|capture/],
  ['submit', /submit/],
  ['media', /media|image|video/],
  ['text', /text|caption|title|description|tags/],
  ['prepare', /login|compose|open|modal|advance|await-next|security|set-|skip|filter/],
];

const PHASE_MESSAGE_KEYS: Record<PostingPhase, string> = {
  prepare: 'postingStatusPhasePrepare',
  media: 'postingStatusPhaseMedia',
  text: 'postingStatusPhaseText',
  submit: 'postingStatusPhaseSubmit',
  confirm: 'postingStatusPhaseConfirm',
  working: 'postingStatusPhaseWorking',
};

export function classifyPostingStep(step: PostFlowStep | undefined): PostingPhase {
  if (!step) return 'prepare';
  return PHASE_RULES.find(([, pattern]) => pattern.test(step))?.[0] ?? 'working';
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export interface PostingStatusView {
  title: string;
  phase: string;
  elapsed: string;
  slow: boolean;
}

export function buildPostingStatusView(
  platformName: string,
  preview: boolean,
  snapshot: PostProgressSnapshot,
  now: number,
): PostingStatusView {
  const phase = classifyPostingStep(snapshot.step);
  return {
    title: t(preview ? 'postingStatusPreviewTitle' : 'postingStatusTitle', platformName),
    phase: t(PHASE_MESSAGE_KEYS[phase]),
    elapsed: t('postingStatusElapsed', formatElapsed(now - snapshot.flowStartedAt)),
    slow: snapshot.stepStartedAt !== undefined &&
      now - snapshot.stepStartedAt >= POSTING_STEP_SLOW_MS,
  };
}

const STYLE = `
  :host { all: initial; }
  .banner {
    position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
    z-index: 2147483647; pointer-events: none;
    max-width: min(560px, calc(100vw - 32px)); box-sizing: border-box;
    padding: 10px 14px; border-radius: 10px;
    background: rgba(17, 24, 39, 0.92); color: #f9fafb;
    font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  }
  .row { display: flex; gap: 12px; justify-content: space-between; align-items: baseline; }
  .title { font-weight: 600; }
  .elapsed { font-variant-numeric: tabular-nums; opacity: 0.8; white-space: nowrap; }
  .phase { margin-top: 2px; }
  .note { margin-top: 4px; font-size: 12px; opacity: 0.75; }
  .slow { color: #fcd34d; }
`;

/** Shows the banner until the returned function is called. */
export function showPostingStatusBanner(platformName: string, preview: boolean): () => void {
  if (typeof document === 'undefined' || !document.documentElement) return () => {};
  const host = document.createElement('tutti-posting-status');
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>${STYLE}</style>
    <div class="banner" aria-hidden="true">
      <div class="row"><span class="title"></span><span class="elapsed"></span></div>
      <div class="phase"></div>
      <div class="note"></div>
    </div>`;
  const title = shadow.querySelector<HTMLElement>('.title')!;
  const elapsed = shadow.querySelector<HTMLElement>('.elapsed')!;
  const phase = shadow.querySelector<HTMLElement>('.phase')!;
  const note = shadow.querySelector<HTMLElement>('.note')!;

  const render = (): void => {
    const view = buildPostingStatusView(platformName, preview, getPostProgressSnapshot(), Date.now());
    title.textContent = view.title;
    elapsed.textContent = view.elapsed;
    phase.textContent = view.phase;
    note.textContent = view.slow ? t('postingStatusSlow') : t('postingStatusDoNotTouch');
    note.classList.toggle('slow', view.slow);
  };
  render();
  document.documentElement.appendChild(host);
  const timer = setInterval(render, 1000);
  return () => {
    clearInterval(timer);
    host.remove();
  };
}
