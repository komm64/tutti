import type {
  ImageAttachment,
  PlatformId,
  PostResultMessage,
} from '../messages';
import type { OpenedTabRegistry } from './opened-tab-registry';
import type { PostTransportPolicy } from './post-concurrency';

export type PostingVisibility = 'public' | 'unlisted' | 'private' | 'direct';

export interface PostExecutionOptions {
  forceForeground?: boolean;
  forceBackground?: boolean;
  transportPolicy?: PostTransportPolicy;
  /** Request-scoped unfocused window that owns real DOM posting tabs. */
  postWindowId?: number;
  /** Window that should retain OS focus while postWindowId owns the active SNS tab. */
  postWindowFocusReturnId?: number;
}

export interface PostingOrchestratorDependencies {
  openedTabs: Pick<OpenedTabRegistry, 'record' | 'forget'>;
  appendBackgroundLog?: (message: string) => void;
}

export interface PostingOrchestrator {
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
