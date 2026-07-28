import type {
  ImageAttachment,
  PlatformId,
  PostResultMessage,
} from '../messages';
import type { PostingAlgorithm } from '../types/posting';
import {
  createPostOrchestrator,
  type PostOrchestratorOptions,
} from './post-orchestrator';
import type {
  PostToPlatformOptions,
  Visibility,
} from './posting-transport';

export type PlatformPosterOptions = PostOrchestratorOptions;

export interface PostingAlgorithmOrchestrator {
  postToPlatform(
    platform: PlatformId,
    text: string,
    images?: ImageAttachment[],
    cw?: string,
    visibility?: Visibility,
    autoPost?: boolean,
    postOptions?: PostToPlatformOptions,
  ): Promise<PostResultMessage>;
}

/**
 * Root posting-algorithm boundary.
 *
 * Both immutable orchestrators are created once, then every platform in a
 * request is routed through the algorithm selected by PostRequestHandler.
 * Lower-level X/platform strategies do not choose the request algorithm.
 */
export function createPlatformPoster(options: PlatformPosterOptions) {
  const orchestrators: Record<PostingAlgorithm, PostingAlgorithmOrchestrator> = {
    next: createPostOrchestrator(options, 'next'),
    legacy: createPostOrchestrator(options, 'legacy'),
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
    visibility?: Visibility,
    autoPost = true,
    postOptions: PostToPlatformOptions = {},
  ): Promise<PostResultMessage> {
    const postingAlgorithm = postOptions.postingAlgorithm ?? 'next';
    return await orchestrators[postingAlgorithm].postToPlatform(
      platform,
      text,
      images,
      cw,
      visibility,
      autoPost,
      postOptions,
    );
  }

  return { forAlgorithm, postToPlatform };
}

export { createPostOrchestrator };
export type { PostOrchestratorOptions };
