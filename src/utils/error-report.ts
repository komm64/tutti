import type { ImageAttachment, LogEntry, PlatformId } from '../messages';
import { base64ByteLength } from './base64';
import { formatBytes } from './formatters';
import { splitTextForPlatform } from './platform-text';
import { redactPII } from './redact';

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
      redactPII(input.diagnosticsJson.slice(0, 30_000)),
      '```',
      '<!-- tutti-diagnostics-end -->',
    );
  }
  return { title, body: sections.join('\n') };
}

export function buildGitHubIssueUrl(title: string, body: string, note: string, overflowNote: string): string {
  const shortBody = `${note}\n\n${body.slice(0, 3000)}${body.length > 3000 ? `\n\n${overflowNote}` : ''}`;
  return `https://github.com/komm64/tutti-issues/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(shortBody)}`;
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
