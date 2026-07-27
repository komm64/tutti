import type { PlatformAdapter } from '../adapters/types';
import type {
  ImageAttachment,
  PlatformId,
  PostResultMessage,
} from '../messages';
import { t } from '../utils/i18n';
import { log } from '../utils/logger';
import { splitTextForPlatform } from '../utils/platform-text';
import { resolveAdapter } from './adapter-resolver';
import type { OpenedTabRegistry } from './opened-tab-registry';
import {
  attachVerifyResult,
  createPostConfirmation,
  maybeAutoOpenPostUrl,
} from './post-confirmation';
import {
  buildReplyOverrideUrl,
  continuationNeedsReplyUrl,
  isVerifySupported,
  shouldUseInlineThread,
} from './platform-strategies';
import { prepareMediaForPlatform } from './platform-media';
import {
  buildFinalChunkResult,
  downgradeHardVerifyFailures,
  toPreviewResult,
  unconfirmedPostResult,
} from './post-result-policy';
import {
  createPostingTransport,
  PostFlowError,
  type PostToPlatformOptions,
  type Visibility,
} from './posting-transport';

const CHUNK_INTERVAL_MS = 2000;

export interface PostOrchestratorOptions {
  openedTabs: Pick<OpenedTabRegistry, 'record' | 'forget'>;
  appendBackgroundLog?: (message: string) => void;
}

export function createPostOrchestrator(options: PostOrchestratorOptions) {
  const confirmation = createPostConfirmation({
    appendBackgroundLog: options.appendBackgroundLog,
  });
  const transport = createPostingTransport({
    openedTabs: options.openedTabs,
    confirmation,
  });

  async function postToPlatform(
    platform: PlatformId,
    text: string,
    images?: ImageAttachment[],
    cw?: string,
    visibility?: Visibility,
    autoPost = true,
    postOptions: PostToPlatformOptions = {},
  ): Promise<PostResultMessage> {
    const adapter = await resolveAdapter(platform);
    if (!adapter) {
      return {
        type: 'POST_RESULT',
        platform,
        success: false,
        flow: {
          mode: autoPost ? 'post' : 'preview',
          submitReached: false,
          failedStep: 'preflight:adapter',
        },
        error: t('runtimeUnsupportedPlatform'),
      };
    }

    const media = await prepareMediaForPlatform(
      adapter,
      platform,
      images,
      autoPost,
    );
    if (!media.ok) return media.result;
    images = media.images;

    const chunks = splitTextForPlatform(adapter.id, text, adapter.charLimit);
    if (shouldUseInlineThread(adapter.id, autoPost) && chunks.length > 1) {
      return await postSingleChunkInlineThread(adapter, chunks, images, autoPost);
    }

    let previousPostUrl: string | undefined;
    let allConfirmed = true;
    let finalChunkFlow: PostResultMessage['flow'];
    for (let index = 0; index < chunks.length; index++) {
      if (index > 0) await sleep(CHUNK_INTERVAL_MS);
      const chunkImages = index === 0 ? images : undefined;
      const replyToUrl = index > 0 ? previousPostUrl : undefined;
      if (
        autoPost &&
        index > 0 &&
        continuationNeedsReplyUrl(adapter.id) &&
        !replyToUrl
      ) {
        return unconfirmedPostResult(adapter.id, {
          mode: 'post',
          submitReached: true,
          failedStep: 'capture-url',
          lastCompletedStep: finalChunkFlow?.lastCompletedStep,
        });
      }
      const overrideUrl = buildReplyOverrideUrl(
        adapter.id,
        index,
        previousPostUrl,
      );

      try {
        const result = await transport.postSingleChunkWithRetry(
          adapter,
          chunks[index]!,
          chunkImages,
          undefined,
          overrideUrl,
          cw,
          visibility,
          autoPost,
          replyToUrl,
          postOptions,
        );
        if (!result.success) {
          return {
            ...result,
            error: chunks.length > 1
              ? t(
                  'runtimeChunkContext',
                  index + 1,
                  chunks.length,
                  result.error ?? t('runtimePostUncertain'),
                )
              : result.error,
          };
        }
        if (result.url) previousPostUrl = result.url;
        if (!result.confirmed && !result.url) allConfirmed = false;
        finalChunkFlow = result.flow;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const flow = error instanceof PostFlowError ? error.flow : undefined;
        return {
          type: 'POST_RESULT',
          platform,
          success: false,
          flow: {
            mode: autoPost ? 'post' : 'preview',
            submitReached: flow?.submitReached ?? false,
            lastCompletedStep: flow?.lastCompletedStep,
            failedStep: flow?.failedStep ?? 'pre-submit-attempt',
          },
          error: chunks.length > 1
            ? t('runtimeChunkFailed', index + 1, chunks.length, message)
            : message,
        };
      }
    }

    const finalResultBase = buildFinalChunkResult(
      platform,
      autoPost,
      allConfirmed,
      previousPostUrl,
      finalChunkFlow,
    );
    let finalResult = autoPost
      ? finalResultBase
      : toPreviewResult(finalResultBase);

    if (autoPost && previousPostUrl && isVerifySupported(platform)) {
      await attachVerifyResult(
        finalResult,
        platform,
        previousPostUrl,
        chunks,
        text,
        images,
      );
      finalResult = downgradeHardVerifyFailures(finalResult);
    }

    if (autoPost && previousPostUrl) {
      void maybeAutoOpenPostUrl(previousPostUrl, finalResult.verify);
    }
    return finalResult;
  }

  async function postSingleChunkInlineThread(
    adapter: PlatformAdapter,
    chunks: string[],
    images?: ImageAttachment[],
    autoPost = true,
  ): Promise<PostResultMessage> {
    log.info(
      `${adapter.id}: inline thread compose で ` +
      `${chunks.length} chunks を 1 つの compose に並べる`,
    );
    return await transport.postSingleChunkWithRetry(
      adapter,
      chunks[0]!,
      images,
      chunks,
      undefined,
      undefined,
      undefined,
      autoPost,
    );
  }

  return { postToPlatform };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
