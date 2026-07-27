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
