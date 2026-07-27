export type NetworkObserverState = 'installing' | 'active' | 'failed';
export type NetworkTransport = 'fetch' | 'xhr';

export interface NetworkObserverTag {
  owner: string;
  revision: number;
  state: NetworkObserverState;
  ruleIds: readonly string[];
}

export interface ObservedNetworkRequest {
  transport: NetworkTransport;
  url: string;
  method: string;
  body: unknown;
}

export interface NetworkCapturePreparation {
  /**
   * Replaces the request body when present. Omit the property to observe
   * without modifying the request.
   */
  body?: unknown;
  context?: unknown;
}

export interface NetworkCaptureRule {
  id: string;
  prepare: (
    request: Readonly<ObservedNetworkRequest>,
  ) => NetworkCapturePreparation | null;
  capture: (
    payload: unknown,
    request: Readonly<ObservedNetworkRequest>,
    context: unknown,
  ) => void | Promise<void>;
}

export interface NetworkObserverDiagnostic {
  kind:
    | 'conflict'
    | 'install-failed'
    | 'request-rule-failed'
    | 'response-parse-failed'
    | 'response-rule-failed';
  owner: string;
  revision: number;
  message: string;
  ruleId?: string;
  transport?: NetworkTransport;
}

export interface NetworkObserverTarget {
  fetch: typeof fetch;
  XMLHttpRequest: typeof XMLHttpRequest;
  __tuttiNetObserver?: NetworkObserverTag;
}

export interface InstallNetworkObserverOptions {
  owner: string;
  revision: number;
  rules: readonly NetworkCaptureRule[];
  reportDiagnostic?: (diagnostic: NetworkObserverDiagnostic) => void;
}

export interface InstallNetworkObserverResult {
  status: 'installed' | 'already-installed' | 'conflict' | 'failed';
  tag: NetworkObserverTag;
}

interface PreparedRules {
  request: ObservedNetworkRequest;
  captures: Array<{ rule: NetworkCaptureRule; context: unknown }>;
}

/**
 * Installs one fetch/XHR observer in the page world. It never retries a
 * request, and capture failures never change the original response.
 */
export function installNetworkObserver(
  target: NetworkObserverTarget,
  options: InstallNetworkObserverOptions,
): InstallNetworkObserverResult {
  const existing = target.__tuttiNetObserver;
  if (existing) {
    if (existing.owner === options.owner && existing.revision === options.revision) {
      return { status: 'already-installed', tag: existing };
    }
    report(options, {
      kind: 'conflict',
      owner: options.owner,
      revision: options.revision,
      message: `observer already owned by ${existing.owner}@${existing.revision} (${existing.state})`,
    });
    return { status: 'conflict', tag: existing };
  }

  const tag: NetworkObserverTag = {
    owner: options.owner,
    revision: options.revision,
    state: 'installing',
    ruleIds: options.rules.map(({ id }) => id),
  };
  target.__tuttiNetObserver = tag;

  const originalFetch = target.fetch;
  const xhrPrototype = target.XMLHttpRequest.prototype;
  const originalOpen = xhrPrototype.open;
  const originalSend = xhrPrototype.send;

  try {
    const requests = new WeakMap<XMLHttpRequest, { method: string; url: string }>();

    target.fetch = async function observedFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const prepared = prepareRules(options, {
        transport: 'fetch',
        url: requestUrl(input),
        method: requestMethod(input, init),
        body: init?.body,
      });
      const nextInit = prepared.request.body === init?.body
        ? init
        : { ...init, body: prepared.request.body as BodyInit | null };
      const response = await Reflect.apply(originalFetch, target, [input, nextInit]) as Response;
      captureFetchResponse(options, response, prepared);
      return response;
    };

    xhrPrototype.open = function observedOpen(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ): unknown {
      const normalizedUrl = typeof url === 'string' ? url : url.toString();
      requests.set(this, { method, url: normalizedUrl });
      return Reflect.apply(
        originalOpen as unknown as (...args: unknown[]) => unknown,
        this,
        [method, normalizedUrl, ...rest],
      );
    } as typeof XMLHttpRequest.prototype.open;

    xhrPrototype.send = function observedSend(
      this: XMLHttpRequest,
      body?: Document | XMLHttpRequestBodyInit | null,
    ): void {
      const metadata = requests.get(this);
      const prepared = prepareRules(options, {
        transport: 'xhr',
        url: metadata?.url ?? '',
        method: (metadata?.method ?? 'GET').toUpperCase(),
        body,
      });
      if (prepared.captures.length > 0) {
        this.addEventListener('load', () => {
          captureXhrResponse(options, this.responseText, prepared);
        }, { once: true });
      }
      Reflect.apply(
        originalSend as unknown as (...args: unknown[]) => void,
        this,
        [prepared.request.body],
      );
    };

    tag.state = 'active';
    return { status: 'installed', tag };
  } catch (error) {
    restoreOriginals(target, originalFetch, xhrPrototype, originalOpen, originalSend);
    tag.state = 'failed';
    report(options, {
      kind: 'install-failed',
      owner: options.owner,
      revision: options.revision,
      message: errorMessage(error),
    });
    return { status: 'failed', tag };
  }
}

function prepareRules(
  options: InstallNetworkObserverOptions,
  initialRequest: ObservedNetworkRequest,
): PreparedRules {
  const request = { ...initialRequest, method: initialRequest.method.toUpperCase() };
  const captures: PreparedRules['captures'] = [];

  for (const rule of options.rules) {
    try {
      const preparation = rule.prepare(request);
      if (!preparation) continue;
      if (Object.prototype.hasOwnProperty.call(preparation, 'body')) {
        request.body = preparation.body;
      }
      captures.push({ rule, context: preparation.context });
    } catch (error) {
      report(options, {
        kind: 'request-rule-failed',
        owner: options.owner,
        revision: options.revision,
        ruleId: rule.id,
        transport: request.transport,
        message: errorMessage(error),
      });
    }
  }

  return { request, captures };
}

function captureFetchResponse(
  options: InstallNetworkObserverOptions,
  response: Response,
  prepared: PreparedRules,
): void {
  if (prepared.captures.length === 0) return;
  try {
    void response.clone().json()
      .then((payload) => capturePayload(options, payload, prepared))
      .catch((error) => reportParseFailure(options, prepared.request.transport, error));
  } catch (error) {
    reportParseFailure(options, prepared.request.transport, error);
  }
}

function captureXhrResponse(
  options: InstallNetworkObserverOptions,
  responseText: string,
  prepared: PreparedRules,
): void {
  try {
    capturePayload(options, JSON.parse(responseText) as unknown, prepared);
  } catch (error) {
    reportParseFailure(options, prepared.request.transport, error);
  }
}

function capturePayload(
  options: InstallNetworkObserverOptions,
  payload: unknown,
  prepared: PreparedRules,
): void {
  for (const { rule, context } of prepared.captures) {
    try {
      void Promise.resolve(rule.capture(payload, prepared.request, context))
        .catch((error) => reportRuleFailure(options, rule.id, prepared.request.transport, error));
    } catch (error) {
      reportRuleFailure(options, rule.id, prepared.request.transport, error);
    }
  }
}

function reportParseFailure(
  options: InstallNetworkObserverOptions,
  transport: NetworkTransport,
  error: unknown,
): void {
  report(options, {
    kind: 'response-parse-failed',
    owner: options.owner,
    revision: options.revision,
    transport,
    message: errorMessage(error),
  });
}

function reportRuleFailure(
  options: InstallNetworkObserverOptions,
  ruleId: string,
  transport: NetworkTransport,
  error: unknown,
): void {
  report(options, {
    kind: 'response-rule-failed',
    owner: options.owner,
    revision: options.revision,
    ruleId,
    transport,
    message: errorMessage(error),
  });
}

function report(
  options: InstallNetworkObserverOptions,
  diagnostic: NetworkObserverDiagnostic,
): void {
  try {
    options.reportDiagnostic?.(diagnostic);
  } catch {
    // Diagnostics must never break or repeat a page request.
  }
}

function restoreOriginals(
  target: NetworkObserverTarget,
  originalFetch: typeof fetch,
  xhrPrototype: XMLHttpRequest,
  originalOpen: typeof XMLHttpRequest.prototype.open,
  originalSend: typeof XMLHttpRequest.prototype.send,
): void {
  try { target.fetch = originalFetch; } catch { /* best-effort rollback */ }
  try { xhrPrototype.open = originalOpen; } catch { /* best-effort rollback */ }
  try { xhrPrototype.send = originalSend; } catch { /* best-effort rollback */ }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
