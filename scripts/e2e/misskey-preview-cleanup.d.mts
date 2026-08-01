export interface MisskeyPreviewCleanupFailure {
  fileId: string;
  error: string;
}

export interface MisskeyPreviewCleanupResult {
  uploaded: number;
  deleted: number;
  failures: MisskeyPreviewCleanupFailure[];
}

export interface MisskeyPreviewUploadTracker {
  checkpoint(): number;
  cleanupSince(checkpoint: number): Promise<MisskeyPreviewCleanupResult>;
  dispose(): void;
}

export interface MisskeyPreviewTrackerContext {
  on(event: 'response', listener: (response: unknown) => void): void;
  off(event: 'response', listener: (response: unknown) => void): void;
  pages?(): unknown[];
}

export function isMisskeyDriveUploadUrl(value: string): boolean;

export function createMisskeyPreviewUploadTracker(
  context: MisskeyPreviewTrackerContext,
  options?: {
    deleteFiles?: (
      context: MisskeyPreviewTrackerContext,
      fileIds: string[],
    ) => Promise<Omit<MisskeyPreviewCleanupResult, 'uploaded'>>;
    warn?: (message: string) => void;
  },
): MisskeyPreviewUploadTracker;

export function deleteMisskeyDriveFiles(
  context: MisskeyPreviewTrackerContext,
  fileIds: string[],
): Promise<Omit<MisskeyPreviewCleanupResult, 'uploaded'>>;
