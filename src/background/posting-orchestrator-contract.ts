import type {
  ImageAttachment,
  PlatformId,
  PostResultMessage,
} from '../messages';
import type { PostingAlgorithm } from '../types/posting';
import type { OpenedTabRegistry } from './opened-tab-registry';
import type { PostTransportPolicy } from './post-concurrency';

export type PostingVisibility = 'public' | 'unlisted' | 'private' | 'direct';

export interface PostExecutionOptions {
  forceForeground?: boolean;
  forceBackground?: boolean;
  transportPolicy?: PostTransportPolicy;
}

export interface PostAlgorithmSelectionOptions extends PostExecutionOptions {
  postingAlgorithm?: PostingAlgorithm;
}

export interface PostingOrchestratorDependencies {
  openedTabs: Pick<OpenedTabRegistry, 'record' | 'forget'>;
  appendBackgroundLog?: (message: string) => void;
}

export interface PostingAlgorithmOrchestrator {
  postToPlatform(
    platform: PlatformId,
    text: string,
    images?: ImageAttachment[],
    cw?: string,
    visibility?: PostingVisibility,
    autoPost?: boolean,
    postOptions?: PostExecutionOptions,
  ): Promise<PostResultMessage>;
}
