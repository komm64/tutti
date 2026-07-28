export interface MediaCommandFile {
  name: string;
  type: string;
  data: string;
}

export interface MediaCommandRequest {
  id: string;
  selector: string;
  files: MediaCommandFile[];
  uploadTimeoutMs?: number;
  requireVideoAccepted?: boolean;
  requireMediaAccepted?: boolean;
  requireMediaPreview?: boolean;
}

export interface MediaCommandResponse<Source extends string> {
  source: Source;
  id: string;
  ok: boolean;
  error?: string;
  fileCount?: number;
  droppedOn?: string;
  uploadCount?: number;
  acceptedByPreview?: boolean;
  uploadTimedOut?: boolean;
}

export interface MediaUploadWaitOptions {
  requireMediaAccepted?: boolean;
  requirePreviewAccepted?: boolean;
  isMediaPreviewVisible?: () => boolean;
  getMediaRejectionMessage?: () => string | undefined;
}

export interface MediaUploadWaitResult {
  uploadCount: number;
  timedOut: boolean;
  acceptedByPreview: boolean;
  error?: string;
}

export interface MediaCommandRuntime {
  findElement: (
    selector: string,
    options?: { preferVisible?: boolean },
  ) => { el: HTMLElement; matchedPart: string } | null;
  buildDataTransfer: (
    files: MediaCommandFile[],
  ) => { dt: DataTransfer } | { error: string };
  mediaPreviewScope: (target: HTMLElement) => ParentNode;
  countMediaPreviews: (scope: ParentNode) => number;
  mediaAcceptedPredicate: (
    target: HTMLElement,
    beforeCount: number,
  ) => () => boolean;
  mediaRejectionMessage: (target: HTMLElement) => string | undefined;
  waitForUploadComplete: (
    timeoutMs: number,
    options: MediaUploadWaitOptions,
  ) => Promise<MediaUploadWaitResult>;
}

export function createMediaCommandHandlers<Source extends string>(
  source: Source,
  runtime: MediaCommandRuntime,
): {
  input: (request: MediaCommandRequest) => Promise<MediaCommandResponse<Source>>;
  drop: (request: MediaCommandRequest) => Promise<MediaCommandResponse<Source>>;
} {
  return {
    input: async (request) => await handleInputCommand(request, source, runtime),
    drop: async (request) => await handleDropCommand(request, source, runtime),
  };
}

async function handleInputCommand<Source extends string>(
  request: MediaCommandRequest,
  source: Source,
  runtime: MediaCommandRuntime,
): Promise<MediaCommandResponse<Source>> {
  const found = runtime.findElement(request.selector, { preferVisible: true });
  if (!found) {
    return { source, id: request.id, ok: false, error: 'file input not found' };
  }
  const input = found.el as HTMLInputElement;
  const inDialog = !!input.closest('[role="dialog"]');
  console.log(
    `[Tutti inject-helper] inject input matched "${found.matchedPart}" — ` +
    `inDialog=${inDialog}`,
  );
  const built = runtime.buildDataTransfer(request.files);
  if ('error' in built) {
    return { source, id: request.id, ok: false, error: built.error };
  }

  const requireMediaAccepted = requiresMediaAcceptance(request);
  const beforePreviewCount = runtime.countMediaPreviews(runtime.mediaPreviewScope(input));
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
  if (setter) setter.call(input, built.dt.files);
  else input.files = built.dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('input', { bubbles: true }));

  const wait = await runtime.waitForUploadComplete(
    request.uploadTimeoutMs ?? 30000,
    buildWaitOptions(request, input, beforePreviewCount, requireMediaAccepted, runtime),
  );
  const ok = waitSucceeded(wait);
  return {
    source,
    id: request.id,
    ok,
    error: waitError(wait, ok),
    fileCount: input.files?.length ?? 0,
    uploadCount: wait.uploadCount,
    acceptedByPreview: wait.acceptedByPreview,
    uploadTimedOut: wait.timedOut,
  };
}

async function handleDropCommand<Source extends string>(
  request: MediaCommandRequest,
  source: Source,
  runtime: MediaCommandRuntime,
): Promise<MediaCommandResponse<Source>> {
  const found = runtime.findElement(request.selector);
  if (!found) {
    return { source, id: request.id, ok: false, error: 'drop target not found' };
  }
  const target = found.el;
  console.log(`[Tutti inject-helper] drop target matched "${found.matchedPart}"`);
  const built = runtime.buildDataTransfer(request.files);
  if ('error' in built) {
    return { source, id: request.id, ok: false, error: built.error };
  }

  const requireMediaAccepted = requiresMediaAcceptance(request);
  const beforePreviewCount = runtime.countMediaPreviews(runtime.mediaPreviewScope(target));
  const rect = target.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  for (const type of ['dragenter', 'dragover', 'drop'] as const) {
    target.dispatchEvent(new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer: built.dt,
      clientX,
      clientY,
    }));
  }

  const wait = await runtime.waitForUploadComplete(
    request.uploadTimeoutMs ?? 30000,
    buildWaitOptions(request, target, beforePreviewCount, requireMediaAccepted, runtime),
  );
  const ok = waitSucceeded(wait);
  return {
    source,
    id: request.id,
    ok,
    error: waitError(wait, ok),
    fileCount: built.dt.files.length,
    droppedOn: target.tagName,
    uploadCount: wait.uploadCount,
    acceptedByPreview: wait.acceptedByPreview,
    uploadTimedOut: wait.timedOut,
  };
}

function requiresMediaAcceptance(request: MediaCommandRequest): boolean {
  return request.requireMediaAccepted === true ||
    (
      request.requireVideoAccepted !== false &&
      request.files.some((file) => file.type.startsWith('video/'))
    );
}

function buildWaitOptions(
  request: MediaCommandRequest,
  target: HTMLElement,
  beforePreviewCount: number,
  requireMediaAccepted: boolean,
  runtime: MediaCommandRuntime,
): MediaUploadWaitOptions {
  return {
    requireMediaAccepted,
    requirePreviewAccepted: request.requireMediaPreview === true,
    isMediaPreviewVisible: requireMediaAccepted
      ? runtime.mediaAcceptedPredicate(target, beforePreviewCount)
      : undefined,
    getMediaRejectionMessage: requireMediaAccepted
      ? () => runtime.mediaRejectionMessage(target)
      : undefined,
  };
}

function waitSucceeded(result: MediaUploadWaitResult): boolean {
  return !result.error && (!result.timedOut || result.acceptedByPreview);
}

function waitError(result: MediaUploadWaitResult, ok: boolean): string | undefined {
  return ok
    ? undefined
    : (result.error ?? 'Timed out while waiting for the media upload or preview');
}
