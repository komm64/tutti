import type {
  ImageAttachment,
  PlatformId,
  PostResultMessage,
} from '../messages';
import {
  createNextPostOrchestrator,
  type PostOrchestratorOptions,
} from './post-orchestrator';
import type {
  PostExecutionOptions,
  PostingVisibility,
} from './posting-orchestrator-contract';

export type PlatformPosterOptions = PostOrchestratorOptions;

export function createPlatformPoster(options: PlatformPosterOptions) {
  const orchestrator = createNextPostOrchestrator(options);

  async function postToPlatform(
    platform: PlatformId,
    text: string,
    images?: ImageAttachment[],
    cw?: string,
    visibility?: PostingVisibility,
    autoPost = true,
    postOptions: PostExecutionOptions = {},
  ): Promise<PostResultMessage> {
    return await orchestrator.postToPlatform(
      platform,
      text,
      images,
      cw,
      visibility,
      autoPost,
      postOptions,
    );
  }

  return { postToPlatform };
}

export { createNextPostOrchestrator };
export type { PostOrchestratorOptions };
