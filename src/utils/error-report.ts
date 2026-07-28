import type { ImageAttachment, LogEntry, PlatformId, PostResultMessage } from '../messages';
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
  lastResults?: readonly PostResultMessage[] | null;
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

export function formatLogExcerpt(
  entries: readonly ErrorReportLogEntry[],
  options: { maxMessageChars?: number } = {},
): string {
  return entries
    .map((e) => {
      const message = typeof options.maxMessageChars === 'number'
        ? truncateLogMessage(e.message, options.maxMessageChars)
        : e.message;
      return `[${new Date(e.ts).toISOString()}] ${e.level} (${e.context}) ${message}`;
    })
    .join('\n');
}

export function formatReportLogs(
  entries: readonly ErrorReportLogEntry[],
  platforms: readonly PlatformId[] = [],
): string {
  const sections: string[] = [];
  const uniquePlatforms = Array.from(new Set(platforms));
  if (uniquePlatforms.length > 0) {
    sections.push('### Selected platform logs');
    for (const platform of uniquePlatforms) {
      const matched = entries.filter((entry) => logEntryMatchesPlatform(entry, platform)).slice(-5);
      sections.push(
        `#### ${platform}`,
        matched.length > 0 ? formatLogExcerpt(matched, { maxMessageChars: 240 }) : '(no matching logs captured)',
      );
    }
    sections.push('');
  }
  sections.push(
    '### Overall last 30',
    formatLogExcerpt(entries.slice(-30), { maxMessageChars: 240 }) || '(no logs captured)',
  );
  return sections.join('\n').trim();
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
    ...buildResultSummaryLines(input.lastResults),
  ];
}

function buildResultSummaryLines(results: readonly PostResultMessage[] | null | undefined): string[] {
  if (!results || results.length === 0) return ['- Last results: (none)'];
  return [
    '- Last results:',
    ...results.map((result) => {
      const flow = result.flow;
      return [
        `  - ${result.platform}:`,
        `success=${result.success}`,
        result.preview ? 'preview=true' : undefined,
        result.confirmed ? 'confirmed=true' : undefined,
        result.uncertain ? 'uncertain=true' : undefined,
        result.userAction ? `userAction=${result.userAction}` : undefined,
        flow?.submitReached !== undefined ? `submitReached=${flow.submitReached}` : undefined,
        flow?.lastCompletedStep ? `lastCompletedStep=${flow.lastCompletedStep}` : undefined,
        flow?.failedStep ? `failedStep=${flow.failedStep}` : undefined,
        flow?.totalDurationMs !== undefined
          ? `totalMs=${Math.round(flow.totalDurationMs)}`
          : undefined,
        flow?.stageTimings?.length
          ? `stages=${flow.stageTimings
              .map((timing) => `${timing.step}:${Math.round(timing.durationMs)}`)
              .join(',')}`
          : undefined,
      ].filter(Boolean).join(' ').replace(': success=', ': success=');
    }),
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
    '## Recent logs',
    '```',
    redactPII((input.logsExcerpt ?? '').slice(0, 20_000)) || '(no logs captured)',
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

function truncateLogMessage(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - TRUNCATION_MARKER.length))}${TRUNCATION_MARKER}`;
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

function logEntryMatchesPlatform(entry: ErrorReportLogEntry, platform: PlatformId): boolean {
  const context = entry.context.toLowerCase();
  const message = entry.message.toLowerCase();
  switch (platform) {
    case 'x':
      return context === 'x.com' || context === 'twitter.com' || /\bx\b|twitter|tweet/.test(message);
    case 'bluesky':
      return context === 'bsky.app' || /bluesky|bsky/.test(message);
    case 'threads':
      return /threads\.(?:com|net)$/.test(context) || /threads/.test(message);
    case 'mastodon':
      return context.includes('mastodon') || /mastodon/.test(message);
    case 'misskey':
      return context.includes('misskey') || /misskey/.test(message);
    case 'tumblr':
      return context.includes('tumblr') || /tumblr/.test(message);
    case 'pixiv':
      return context.includes('pixiv') || /pixiv/.test(message);
    case 'deviantart':
      return context.includes('deviantart') || /deviantart|deviation|\bda\b/.test(message);
    case 'instagram':
      return context.includes('instagram') || /\big\b|instagram/.test(message);
    case 'tiktok':
      return context.includes('tiktok') || /tiktok/.test(message);
    case 'youtube':
      return context.includes('youtube') || /youtube|\byt\b/.test(message);
  }
}
