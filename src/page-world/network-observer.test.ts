import { describe, expect, it, vi } from 'vitest';
import {
  installNetworkObserver,
  type NetworkCaptureRule,
  type NetworkObserverDiagnostic,
  type NetworkObserverTarget,
} from './network-observer';

describe('page-world network observer', () => {
  it('prepares and captures one fetch request without delaying its response', async () => {
    const capture = vi.fn();
    const originalFetch = vi.fn<typeof fetch>(
      async () => jsonResponse({ id: 'fetch-post' }),
    );
    const target = createTarget(originalFetch);
    const rule = captureRule(capture);

    expect(installNetworkObserver(target, observerOptions(rule)).status).toBe('installed');
    const response = await target.fetch('https://example.test/create', {
      method: 'POST',
      body: 'before',
    });

    expect(await response.json()).toEqual({ id: 'fetch-post' });
    expect(originalFetch).toHaveBeenCalledTimes(1);
    expect(originalFetch.mock.calls[0]?.[1]?.body).toBe('after');
    await vi.waitFor(() => expect(capture).toHaveBeenCalledWith(
      { id: 'fetch-post' },
      expect.objectContaining({
        transport: 'fetch',
        method: 'POST',
        body: 'after',
      }),
      { matched: true },
    ));
  });

  it('prepares and captures one XHR request', async () => {
    const capture = vi.fn();
    const FakeXhr = createFakeXhr(JSON.stringify({ id: 'xhr-post' }));
    const target = createTarget(vi.fn(), FakeXhr);

    installNetworkObserver(target, observerOptions(captureRule(capture)));
    const xhr = new target.XMLHttpRequest();
    xhr.open('POST', 'https://example.test/create');
    xhr.send('before');

    expect(FakeXhr.sendBodies).toEqual(['after']);
    await vi.waitFor(() => expect(capture).toHaveBeenCalledWith(
      { id: 'xhr-post' },
      expect.objectContaining({
        transport: 'xhr',
        method: 'POST',
        body: 'after',
      }),
      { matched: true },
    ));
  });

  it('does not wrap again for the same owner and revision', async () => {
    const originalFetch = vi.fn<typeof fetch>(
      async () => jsonResponse({ ok: true }),
    );
    const target = createTarget(originalFetch);
    const options = observerOptions(captureRule(vi.fn()));
    const first = installNetworkObserver(target, options);
    const installedFetch = target.fetch;
    const second = installNetworkObserver(target, options);

    expect(first.status).toBe('installed');
    expect(second.status).toBe('already-installed');
    expect(target.fetch).toBe(installedFetch);
    await target.fetch('https://example.test/create', { method: 'POST' });
    expect(originalFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a mismatched owner or revision without replacing the observer', () => {
    const diagnostics: NetworkObserverDiagnostic[] = [];
    const target = createTarget(vi.fn());
    installNetworkObserver(target, observerOptions(captureRule(vi.fn())));
    const installedFetch = target.fetch;

    const result = installNetworkObserver(target, {
      ...observerOptions(captureRule(vi.fn())),
      revision: 2,
      reportDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(result.status).toBe('conflict');
    expect(result.tag).toMatchObject({
      owner: 'tutti/inject-helper',
      revision: 1,
      state: 'active',
    });
    expect(target.fetch).toBe(installedFetch);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        kind: 'conflict',
        message: 'observer already owned by tutti/inject-helper@1 (active)',
      }),
    ]);
  });

  it('isolates request and response rule failures without retrying fetch', async () => {
    const diagnostics: NetworkObserverDiagnostic[] = [];
    const originalFetch = vi.fn<typeof fetch>(
      async () => jsonResponse({ ok: true }),
    );
    const target = createTarget(originalFetch);
    const prepareFailure: NetworkCaptureRule = {
      id: 'prepare-failure',
      prepare: () => {
        throw new Error('prepare failed');
      },
      capture: vi.fn(),
    };
    const captureFailure: NetworkCaptureRule = {
      id: 'capture-failure',
      prepare: () => ({}),
      capture: () => {
        throw new Error('capture failed');
      },
    };

    installNetworkObserver(target, {
      ...observerOptions(prepareFailure, captureFailure),
      reportDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    await target.fetch('https://example.test/create', { method: 'POST' });

    expect(originalFetch).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(diagnostics.map(({ kind }) => kind)).toEqual([
      'request-rule-failed',
      'response-rule-failed',
    ]));
  });
});

function observerOptions(...rules: NetworkCaptureRule[]) {
  return {
    owner: 'tutti/inject-helper',
    revision: 1,
    rules,
  } as const;
}

function captureRule(capture: NetworkCaptureRule['capture']): NetworkCaptureRule {
  return {
    id: 'create-post',
    prepare: (request) => (
      request.url.endsWith('/create') && request.method === 'POST'
        ? { body: 'after', context: { matched: true } }
        : null
    ),
    capture,
  };
}

function createTarget(
  fetchImplementation: typeof fetch,
  XMLHttpRequestImplementation = createFakeXhr('{}'),
): NetworkObserverTarget {
  return {
    fetch: fetchImplementation,
    XMLHttpRequest: XMLHttpRequestImplementation as unknown as typeof XMLHttpRequest,
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}

function createFakeXhr(responseText: string) {
  return class FakeXMLHttpRequest {
    static sendBodies: unknown[] = [];
    responseText = responseText;
    private listeners = new Map<string, Array<() => void>>();

    open(): void {}

    send(body?: unknown): void {
      FakeXMLHttpRequest.sendBodies.push(body);
      for (const listener of this.listeners.get('load') ?? []) listener();
    }

    addEventListener(type: string, listener: () => void): void {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
  };
}
