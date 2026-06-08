import { getSettings } from '../storage';
import type { ReportResult } from './types';
import {
  buildCurrentDraftReportSection,
  buildErrorReportPayload,
  buildGitHubIssueUrl,
  formatLogExcerpt,
  type CurrentDraftReportInput,
  type ErrorReportLogEntry,
} from '../utils/error-report';
import {
  hashReportKey,
  isRecentlyReported,
  markReported,
} from '../utils/report-dedup';

export interface PopupReportContext extends CurrentDraftReportInput {
  version: string;
}

export async function buildPopupReportPayload(
  errorText: string,
  context: PopupReportContext,
): Promise<{ title: string; body: string }> {
  const logsExcerpt = await loadLogsExcerpt();
  const diagnosticsJson = await loadDiagnosticsJson();
  return buildErrorReportPayload({
    errorText,
    version: context.version,
    userAgent: navigator.userAgent,
    draftSection: buildCurrentDraftReportSection(context),
    logsExcerpt,
    diagnosticsJson,
  });
}

export async function submitPopupErrorReport(input: {
  errorText: string;
  context: PopupReportContext;
  endpoint: string;
  dedupedMessage: (hours: number) => string;
}): Promise<ReportResult> {
  const settings = await getSettings();
  const hash = await hashReportKey(input.errorText);
  if (!settings.disableReportDedup) {
    const lastTs = await isRecentlyReported(hash);
    if (lastTs !== null) {
      return {
        ok: false,
        deduped: true,
        error: input.dedupedMessage(Math.round((Date.now() - lastTs) / (60 * 60 * 1000))),
      };
    }
  }

  const { title, body } = await buildPopupReportPayload(input.errorText, input.context);
  try {
    const res = await fetch(input.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; issueUrl?: string; error?: string };
    if (res.ok && data.ok) {
      if (!settings.disableReportDedup) void markReported(hash);
      return { ok: true, issueUrl: data.issueUrl };
    }
    return { ok: false, error: data.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function openPopupGitHubIssue(input: {
  errorText: string;
  context: PopupReportContext;
  note: string;
  overflowNote: string;
}): Promise<void> {
  const { title, body } = await buildPopupReportPayload(input.errorText, input.context);
  try { await navigator.clipboard.writeText(body); } catch { /* ignore */ }
  const url = buildGitHubIssueUrl(title, body, input.note, input.overflowNote);
  window.open(url, '_blank');
}

async function loadLogsExcerpt(): Promise<string> {
  try {
    const res = (await browser.runtime.sendMessage({ type: 'LOG_EXPORT_REQUEST' })) as
      | { entries?: ErrorReportLogEntry[] }
      | undefined;
    return formatLogExcerpt((res?.entries ?? []).slice(-30));
  } catch {
    return '';
  }
}

async function loadDiagnosticsJson(): Promise<string> {
  try {
    const res = (await browser.runtime.sendMessage({ type: 'DIAGNOSE_REQUEST' })) as
      | { report?: unknown }
      | undefined;
    return res?.report ? JSON.stringify(res.report, null, 2) : '';
  } catch {
    return '';
  }
}
