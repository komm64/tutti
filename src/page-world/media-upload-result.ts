function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined;
}

/**
 * SNS upload APIs often return HTTP errors as JSON while still completing the
 * browser resource. Extract the user-actionable reason instead of treating
 * "request finished" as "upload succeeded".
 */
export function extractMediaUploadFailure(payload: unknown): string | undefined {
  const body = record(payload);
  if (!body) return undefined;

  const meta = record(body.meta);
  const status = typeof meta?.status === 'number'
    ? meta.status
    : typeof body.status === 'number'
      ? body.status
      : undefined;
  const errors = Array.isArray(body.errors)
    ? body.errors.map(record).filter((entry): entry is Record<string, unknown> => !!entry)
    : [];
  const directError = text(body.error);
  const directMessage = text(body.message);
  const failed = (status !== undefined && status >= 400) ||
    errors.length > 0 ||
    !!directError;
  if (!failed) return undefined;

  const first = errors[0];
  const detail = text(first?.detail) ??
    text(first?.message) ??
    text(first?.title) ??
    directError ??
    (status !== undefined && status >= 400 ? directMessage : undefined) ??
    text(meta?.msg);
  return detail?.slice(0, 300) ??
    (status !== undefined ? `Media upload failed (HTTP ${status}).` : 'Media upload failed.');
}
