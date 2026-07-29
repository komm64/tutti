import type {
  ImageAttachment,
  PlatformId,
  PostResultMessage,
} from '../messages';
import type { PostingAlgorithm } from '../types/posting';
import {
  createNextPostOrchestrator,
  type PostOrchestratorOptions,
} from './post-orchestrator';
import { createLegacyPostOrchestrator } from './legacy-post-orchestrator';
import type {
  PostAlgorithmSelectionOptions,
  PostingAlgorithmOrchestrator,
  PostingVisibility,
} from './posting-orchestrator-contract';

export type PlatformPosterOptions = PostOrchestratorOptions;

/**
 * Root posting-algorithm boundary.
 *
 * Both immutable orchestrators are created once, then every platform in a
 * request is routed through the algorithm selected by PostRequestHandler.
 * Lower-level X/platform strategies do not choose the request algorithm.
 */
export function createPlatformPoster(options: PlatformPosterOptions) {
  const orchestrators: Record<PostingAlgorithm, PostingAlgorithmOrchestrator> = {
    next: createNextPostOrchestrator(options),
    legacy: createLegacyPostOrchestrator(options),
  };

  function forAlgorithm(
    postingAlgorithm: PostingAlgorithm,
  ): PostingAlgorithmOrchestrator {
    return orchestrators[postingAlgorithm];
  }

  async function postToPlatform(
    platform: PlatformId,
    text: string,
    images?: ImageAttachment[],
    cw?: string,
    visibility?: PostingVisibility,
    autoPost = true,
    postOptions: PostAlgorithmSelectionOptions = {},
  ): Promise<PostResultMessage> {
    const {
      postingAlgorithm = 'next',
      ...executionOptions
    } = postOptions;
    return await orchestrators[postingAlgorithm].postToPlatform(
      platform,
      text,
      images,
      cw,
      visibility,
      autoPost,
      executionOptions,
    );
  }

  return { forAlgorithm, postToPlatform };
}

export { createNextPostOrchestrator, createLegacyPostOrchestrator };
export type { PostOrchestratorOptions };
