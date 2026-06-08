import type { ImageAttachment, PlatformId, PostResultMessage } from '../messages';

export interface PlatformOption {
  id: PlatformId;
  name: string;
  limit: number;
  available: boolean;
}

export type ImagePreview = ImageAttachment & { data: string; previewUrl: string };
export type VideoPreview = ImageAttachment & { data: string; previewUrl: string; durationS: number };

export interface SnsPreset {
  id: string;
  name: string;
  platforms: PlatformId[];
}

export type Visibility = 'public' | 'unlisted' | 'private' | 'direct';

export interface ReportResult {
  ok: boolean;
  issueUrl?: string;
  error?: string;
  deduped?: boolean;
}

export interface FailureHistoryEntry {
  text?: string;
  textPreview: string;
  results: Partial<Record<PlatformId, { success: boolean; uncertain?: boolean; url?: string; error?: string }>>;
}

export interface PostingRestoreState {
  platforms: PlatformId[];
  pending: PlatformId[];
  results: PostResultMessage[];
  done?: boolean;
  finishedAt?: number;
}
