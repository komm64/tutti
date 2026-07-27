export const DEFAULT_CDP_ENDPOINT: string;
export const DEFAULT_CDP_TIMEOUT_MS: number;
export const DEFAULT_EXTENSION_DISCOVERY_TIMEOUT_MS: number;
export const E2E_FIXTURE_ROOT: string;

type Environment = Record<string, string | undefined>;

export function resolveCdpEndpoint(options?: {
  env?: Environment;
  fallback?: string;
  required?: boolean;
}): string | undefined;

export function connectPlaywrightCdp(options?: {
  chromium?: { connectOverCDP(endpoint: string, options: { timeout: number }): Promise<unknown> };
  endpoint?: string;
  timeoutMs?: number;
}): Promise<unknown>;

export function connectPuppeteerCdp(options?: {
  puppeteer?: { connect(options: Record<string, unknown>): Promise<unknown> };
  endpoint?: string;
  timeoutMs?: number;
  browserURL?: string;
  browserWSEndpoint?: string;
  protocolTimeout?: number;
  defaultViewport?: null | { width: number; height: number };
  [option: string]: unknown;
}): Promise<unknown>;

export function resolveCdpHttpEndpoint(endpoint?: string): string;

export function fetchCdpJson(
  path: string,
  options?: {
    endpoint?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<unknown>;

export interface CdpTarget {
  id?: string;
  type?: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
  [key: string]: unknown;
}

export function listCdpTargets(options?: {
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<CdpTarget[]>;

export function waitForCdpTarget(
  predicate: (target: CdpTarget) => boolean,
  options?: {
    endpoint?: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<CdpTarget>;

export class RawCdpClient {
  constructor(url: string, options?: {
    name?: string;
    timeoutMs?: number;
    WebSocketImpl?: unknown;
    logger?: (message: string) => void;
  });
  readonly url: string;
  readonly name: string;
  ws: unknown;
  connect(): Promise<this>;
  send(method: string, params?: Record<string, unknown>): Promise<Record<string, any>>;
  evaluate(expression: string, awaitPromise?: boolean): Promise<any>;
  navigate(url: string, options?: { settleMs?: number }): Promise<void>;
  close(): void;
}

export function disconnectCdp(browser: unknown): Promise<void>;

export function withCdpBrowser<T>(
  connect: () => Promise<unknown>,
  run: (browser: unknown) => Promise<T>,
): Promise<T>;

export function resolveExtensionId(
  subject: unknown,
  options?: {
    env?: Environment;
    timeoutMs?: number;
    pollIntervalMs?: number;
  },
): Promise<string>;

export function extensionIdFromUrl(url: unknown): string | null;

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label?: string): Promise<T>;

export function resolveFixturePath(filename: string, options?: { root?: string }): string;

export interface E2eFixture {
  name: string;
  type: string;
  data: string;
  bytes: number;
  durationS?: number;
}

export function loadE2eFixture(
  filename: string,
  mimeType: string,
  options?: {
    durationS?: number;
    root?: string;
    required?: boolean;
  },
): Promise<E2eFixture | null>;

export function withTemporaryDirectory<T>(
  run: (path: string) => Promise<T>,
  options?: {
    prefix?: string;
    root?: string;
    preserve?: boolean;
  },
): Promise<T>;
