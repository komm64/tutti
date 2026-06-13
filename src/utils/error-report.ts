import type { ImageAttachment, LogEntry, PlatformId } from '../messages';
import { base64ByteLength } from './base64';
import { formatBytes } from './formatters';
import { splitTextForPlatform } from './platform-text';
import { redactPII } from './redact';

const DIAGNOSTICS_JSON_MAX_CHARS = 30_000;
const TRUNCATION_MARKER = '[report-truncated]';

export interface ErrorReportPlatformOption {
  id: PlatformId;
  limit: number;
  available: boolean;
}

export interface CurrentDraftReportInput {
  text: string;
  platforms: readonly ErrorReportPlatformOption[];
  selected: Partial<Record<PlatformId, boolean>>;
  images: readonly ImageAttachment[];
  video?: ImageAttachment | null;
  imageAlts?: readonly string[];
  cw: string;
  visibility: 'public' | 'unlisted' | 'private' | 'direct';
  trimToS?: number | null;
}

export interface ErrorReportPayloadInput {
  errorText: string;
  version: string;
  userAgent: string;
  draftSection: readonly string[];
  logsExcerpt?: string;
  diagnosticsJson?: string;
}

export type ErrorReportLogEntry = Pick<LogEntry, 'ts' | 'level' | 'context' | 'message'>;

export function formatLogExcerpt(entries: readonly ErrorReportLogEntry[]): string {
  return entries
    .map((e) => `[${new Date(e.ts).toISOString()}] ${e.level} (${e.context}) ${e.message}`)
    .join('\n');
}

export function mediaBytesForReport(media: ImageAttachment): string {
  const bytes = typeof media.bytes === 'number'
    ? media.bytes
    : media.data
      ? base64ByteLength(media.data)
      : null;
  return bytes === null ? 'unknown' : `${bytes} (${formatBytes(bytes)})`;
}

export function buildCurrentDraftReportSection(input: CurrentDraftReportInput): string[] {
  const selectedPlatforms = input.platforms
    .filter((p) => p.available && input.selected[p.id])
    .map((p) => p.id);
  const chunks = selectedPlatforms.map((id) => `${id}:${safeChunkCount(input, id)}`);
  const mediaItems = input.video
    ? [
        `- video[0]: type=${input.video.type || 'unknown'}, bytes=${mediaBytesForReport(input.video)}, durationS=${Number.isFinite(input.video.durationS) ? Math.round(input.video.durationS ?? 0) : 'unknown'}`,
      ]
    : input.images.map((img, idx) => (
        `- image[${idx}]: type=${img.type || 'unknown'}, bytes=${mediaBytesForReport(img)}, altLength=${input.imageAlts?.[idx]?.length ?? 0}`
      ));
  return [
    '## Current draft (redacted)',
    `- Text length: ${input.text.length}`,
    `- Selected platforms: ${selectedPlatforms.join(', ') || '(none)'}`,
    `- Platform chunks: ${chunks.join(', ') || '(none)'}`,
    `- Media: images=${input.images.length}, video=${input.video ? 1 : 0}`,
    `- Content warning length: ${input.cw.length}`,
    `- Visibility: ${input.visibility}`,
    `- Trim video to seconds: ${input.trimToS ?? '(none)'}`,
    ...(mediaItems.length > 0 ? mediaItems : ['- Media items: (none)']),
  ];
}

export function buildErrorReportPayload(input: ErrorReportPayloadInput): { title: string; body: string } {
  const title = redactPII(input.errorText.split('\n')[0]?.slice(0, 80) || 'Tutti error report');
  const sections = [
    '## Error',
    '```',
    redactPII(input.errorText.slice(0, 800)),
    '```',
    '',
    '## Environment',
    `- Tutti version: ${input.version}`,
    `- User agent: ${input.userAgent}`,
    '',
    ...input.draftSection,
    '',
    '## Recent logs (last 30 entries)',
    '```',
    redactPII((input.logsExcerpt ?? '').slice(0, 6000)) || '(no logs captured)',
    '```',
  ];
  if (input.diagnosticsJson) {
    sections.push(
      '',
      '## Diagnostics (for auto-triage - selector audit + redacted DOM snapshot)',
      '<!-- tutti-diagnostics-begin -->',
      '```json',
      formatDiagnosticsJsonForReport(input.diagnosticsJson),
      '```',
      '<!-- tutti-diagnostics-end -->',
    );
  }
  return { title, body: sections.join('\n') };
}

export function formatDiagnosticsJsonForReport(diagnosticsJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(diagnosticsJson);
  } catch (err) {
    return redactPII(JSON.stringify({
      _reportMeta: {
        diagnosticsParseError: true,
        error: err instanceof Error ? err.message : String(err),
      },
      rawPreview: diagnosticsJson.slice(0, 1000),
    }, null, 2));
  }

  const original = redactPII(JSON.stringify(parsed, null, 2));
  if (original.length <= DIAGNOSTICS_JSON_MAX_CHARS) return original;

  const attempts: TruncationOptions[] = [
    { domSnapshotChars: 8000, stringChars: 12_000, arrayItems: 50 },
    { domSnapshotChars: 4000, stringChars: 4000, arrayItems: 25 },
    { domSnapshotChars: 1200, stringChars: 1200, arrayItems: 12 },
    { domSnapshotChars: 400, stringChars: 400, arrayItems: 6 },
  ];

  for (const opts of attempts) {
    const truncated = addReportMeta(truncateDiagnosticsValue(parsed, opts), {
      diagnosticsTruncatedForIssue: true,
      originalJsonChars: diagnosticsJson.length,
    });
    const serialized = redactPII(JSON.stringify(truncated, null, 2));
    if (serialized.length <= DIAGNOSTICS_JSON_MAX_CHARS) return serialized;
  }

  return redactPII(JSON.stringify(addReportMeta(summarizeDiagnostics(parsed), {
    diagnosticsTruncatedForIssue: true,
    diagnosticsSummaryOnly: true,
    originalJsonChars: diagnosticsJson.length,
  }), null, 2));
}

export function buildGitHubIssueUrl(title: string, body: string, note: string, overflowNote: string): string {
  const shortBody = `${note}\n\n${body.slice(0, 3000)}${body.length > 3000 ? `\n\n${overflowNote}` : ''}`;
  return `https://github.com/komm64/tutti-issues/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(shortBody)}`;
}

interface TruncationOptions {
  domSnapshotChars: number;
  stringChars: number;
  arrayItems: number;
}

function truncateDiagnosticsValue(value: unknown, opts: TruncationOptions, key = ''): unknown {
  if (typeof value === 'string') {
    const max = key === 'domSnapshot' ? opts.domSnapshotChars : opts.stringChars;
    return truncateString(value, max);
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, opts.arrayItems).map((v) => truncateDiagnosticsValue(v, opts));
    if (value.length > opts.arrayItems) {
      items.push({ _truncatedItems: value.length - opts.arrayItems });
    }
    return items;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, truncateDiagnosticsValue(v, opts, k)]),
    );
  }
  return value;
}

function truncateString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const keep = Math.max(0, maxChars - TRUNCATION_MARKER.length);
  return `${value.slice(0, keep)}${TRUNCATION_MARKER}`;
}

function addReportMeta(value: unknown, meta: Record<string, unknown>): unknown {
  if (isRecord(value) && !Array.isArray(value)) {
    return {
      ...value,
      _reportMeta: {
        ...(isRecord(value._reportMeta) ? value._reportMeta : {}),
        ...meta,
      },
    };
  }
  return { value, _reportMeta: meta };
}

function summarizeDiagnostics(value: unknown): unknown {
  if (!isRecord(value)) return { summary: '<diagnostics omitted>' };
  const platforms = Array.isArray(value.platforms)
    ? value.platforms.map((p) => summarizePlatformDiagnostic(p))
    : [];
  return {
    version: value.version,
    generatedAt: value.generatedAt,
    userAgent: value.userAgent,
    platforms,
  };
}

function summarizePlatformDiagnostic(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    type: value.type,
    platform: value.platform,
    url: value.url,
    selectors: value.selectors,
    detectedUser: value.detectedUser,
    domSnapshot: typeof value.domSnapshot === 'string' ? '<omitted from oversized report>' : value.domSnapshot,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeChunkCount(input: CurrentDraftReportInput, platform: PlatformId): number | string {
  const adapter = input.platforms.find((p) => p.id === platform);
  if (!adapter) return 'unknown';
  try {
    return splitTextForPlatform(platform, input.text, adapter.limit).length;
  } catch {
    return 'error';
  }
}
