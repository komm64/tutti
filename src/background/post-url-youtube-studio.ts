import { buildYouTubeTitle } from '../adapters/youtube';
import { retryTransientTabAction } from './tab-action-retry';
import { waitForTabComplete } from './tab-management';

export interface YouTubeStudioCaptureResult {
  url?: string;
  trace: string[];
}

export async function captureYouTubeStudioPostUrlFromTab(
  tabId: number,
  sourceText: string,
  debug: (message: string) => void,
): Promise<string | undefined> {
  const targetTitle = buildYouTubeStudioCaptureTarget(sourceText);
  debug('reload Studio dashboard before latest Short lookup');
  await retryTransientTabAction('reload YouTube Studio before URL capture', () => (
    browser.tabs.reload(tabId)
  ));
  await waitForTabComplete(tabId);
  await sleep(1000);

  const results = await browser.scripting.executeScript({
    target: { tabId },
    func: captureYouTubeStudioPostUrlInPage,
    args: [targetTitle],
    world: 'MAIN',
  });
  debug(`scripting result count=${results?.length}`);
  const result = results?.[0]?.result as YouTubeStudioCaptureResult | null | undefined;
  for (const line of result?.trace?.slice(0, 30) ?? []) {
    debug(`  ${line}`);
  }
  if (typeof result?.url === 'string') {
    debug(`URL captured: ${result.url}`);
    return result.url;
  }
  debug('URL not found');
  return undefined;
}

export function buildYouTubeStudioCaptureTarget(sourceText: string): string {
  return buildYouTubeTitle(sourceText).replace(/\s+/g, ' ').trim().slice(0, 60);
}

export async function captureYouTubeStudioPostUrlInPage(
  targetText: string,
  root: ParentNode = document,
): Promise<YouTubeStudioCaptureResult> {
  const trace: string[] = [];

  const normalize = (value: string | null | undefined): string => (
    (value ?? '').replace(/\s+/g, ' ').trim()
  );
  const titleSelector = 'h1, h2, h3, [id*="title"], ytcp-thumbnail-with-title';

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const titleNodes = Array.from(
      root.querySelectorAll<HTMLElement>(titleSelector),
    )
      .filter((element) => normalize(element.textContent).includes(targetText))
      .sort(
        (first, second) => (
          normalize(first.textContent).length - normalize(second.textContent).length
        ),
      );

    for (const titleNode of titleNodes) {
      let scope: Element | null = titleNode;
      for (
        let depth = 0;
        scope && depth < 8;
        depth += 1, scope = scope.parentElement
      ) {
        const links = Array.from(
          scope.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"]'),
        );
        for (const link of links) {
          const id = link.href.match(/\/video\/([\w-]+)(?:\/|$)/)?.[1];
          if (id) {
            trace.push(
              `matched target title in scoped video card ` +
              `(attempt=${attempt}, depth=${depth})`,
            );
            return {
              url: `https://www.youtube.com/watch?v=${id}`,
              trace,
            };
          }
        }
      }
    }

    if (attempt === 0) {
      trace.push(`target title matches=${titleNodes.length}`);
    }
    await sleep(500);
  }

  return { trace };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
