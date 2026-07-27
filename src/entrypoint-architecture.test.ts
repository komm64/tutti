import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { assertArchitectureGuard } from '../tests/architecture-guard';

type EntrypointCategory = 'background' | 'content' | 'offscreen' | 'ui';

const ALLOWED_SRC_IMPORTS: Record<EntrypointCategory, readonly string[]> = {
  background: [
    'src/background/',
    'src/messages',
    'src/storage',
    'src/types/',
    'src/utils/',
  ],
  content: [
    'src/adapters/',
    'src/messages',
    'src/page-world/',
    'src/storage',
    'src/types/',
    'src/utils/',
  ],
  offscreen: [
    'src/messages',
    'src/types/',
    'src/utils/',
  ],
  ui: [
    'src/adapters/',
    'src/api/',
    'src/messages',
    'src/options/',
    'src/popup/',
    'src/storage',
    'src/types/',
    'src/utils/',
  ],
};

describe('entrypoint architecture guard', () => {
  it('keeps src imports inside each entrypoint category boundary', () => {
    const violations: string[] = [];
    for (const path of entrypointSourceFiles('entrypoints')) {
      const source = readFileSync(path, 'utf8');
      const category = categorize(path);
      for (const specifier of importSpecifiers(source)) {
        if (!specifier.startsWith('.')) continue;
        const resolved = normalize(relative('.', resolve(dirname(path), specifier)));
        if (!resolved.startsWith('src/')) continue;
        if (ALLOWED_SRC_IMPORTS[category].some((allowed) => isAllowedImport(resolved, allowed))) {
          continue;
        }
        violations.push(`${normalize(relative('.', path))}: ${category} -> ${resolved}`);
      }
    }
    assertArchitectureGuard({
      guard: 'entrypoint-import-boundaries',
      violations,
    });
  });

  it('keeps runtime message branching out of the background entrypoint', () => {
    const source = readFileSync('entrypoints/background.ts', 'utf8');
    expect(source).toContain('browser.runtime.onMessage.addListener(handleRuntimeMessage)');
    expect(source).not.toMatch(/\b(?:msg|message)\.type\s*(?:===|!==)/);
    expect(source).not.toMatch(/function\s+handlePostRequest\b/);
  });

  it('keeps popup history lifecycle in the composer controller', () => {
    const source = readFileSync('entrypoints/popup/App.svelte', 'utf8');
    expect(source).toContain('composerController.subscribeHistory');
    expect(source).not.toContain('loadPopupHistoryThumbs');
    expect(source).not.toContain('storage.onChanged');
  });

  it('keeps popup background synchronization in the composer controller', () => {
    const source = readFileSync('entrypoints/popup/App.svelte', 'utf8');
    expect(source).toContain('composerController.subscribeBackgroundSync');
    expect(source).not.toContain("type: 'GET_BG_STATE'");
    expect(source).not.toContain('runtime.onMessage.addListener');
    expect(source).not.toContain('applyProgressMessage');
  });

  it('keeps popup support workflows in the composer controller', () => {
    const source = readFileSync('entrypoints/popup/App.svelte', 'utf8');
    expect(source).toContain('composerController.runDiagnostics');
    expect(source).toContain('composerController.submitErrorReport');
    expect(source).toContain('composerController.applyExtensionUpdate');
    expect(source).not.toContain('submitPopupErrorReport');
    expect(source).not.toContain("type: 'DIAGNOSE_REQUEST'");
    expect(source).not.toContain("type: 'APPLY_EXTENSION_UPDATE'");
  });

  it('keeps popup submission orchestration in the composer controller', () => {
    const source = readFileSync('entrypoints/popup/App.svelte', 'utf8');
    expect(source).toContain('composerController.submitPlatforms');
    expect(source).toContain('composerController.retryFailed');
    expect(source).not.toContain('sendPostRequest');
    expect(source).not.toContain('mergePostResults');
    expect(source).not.toContain('shouldClearDraftAfterSubmit');
    expect(source).not.toContain('failedRetryPlatforms');
  });

  it('keeps Options API credentials behind the provider editor boundary', () => {
    const source = readFileSync('entrypoints/options/Options.svelte', 'utf8');
    expect(source).toContain('API_CREDENTIAL_PROVIDERS');
    expect(source).toContain('<ApiCredentialEditor');
    expect(source).not.toMatch(/handle(?:Bsky|Mstd|Msky)(?:Save|Clear)/);
    expect(source.match(/<ApiCredentialEditor/g)).toHaveLength(1);
  });

  it('keeps page-world post capture behind one tagged network observer', () => {
    const entrypoint = readFileSync('entrypoints/inject-helper.content.ts', 'utf8');
    const observer = readFileSync('src/page-world/network-observer.ts', 'utf8');

    expect(entrypoint).toContain('installNetworkObserver(window');
    expect(entrypoint).toContain('createPagePostCaptureRules');
    expect(entrypoint).not.toMatch(
      /__tutti(?:IgFetch|MastodonPostCapture|TumblrPostCapture|ThreadsPostCapture|XPostCapture)/,
    );
    expect(entrypoint).not.toMatch(/\bwindow\.fetch\s*=/);
    expect(entrypoint).not.toMatch(/\bXMLHttpRequest\.prototype\.(?:open|send)\s*=/);
    expect(observer.match(/\btarget\.fetch\s*=\s*async function observedFetch/g)).toHaveLength(1);
    expect(observer.match(/\bxhrPrototype\.open\s*=\s*function observedOpen/g)).toHaveLength(1);
    expect(observer.match(/\bxhrPrototype\.send\s*=\s*function observedSend/g)).toHaveLength(1);
  });
});

function categorize(path: string): EntrypointCategory {
  const normalized = normalize(relative('.', path));
  if (normalized === 'entrypoints/background.ts') return 'background';
  if (normalized.endsWith('.content.ts')) return 'content';
  if (normalized.startsWith('entrypoints/offscreen/')) return 'offscreen';
  return 'ui';
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    if (match[1]) specifiers.push(match[1]);
  }
  for (const match of source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) {
    if (match[1]) specifiers.push(match[1]);
  }
  return specifiers;
}

function entrypointSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root)) {
    const path = resolve(root, name);
    if (statSync(path).isDirectory()) {
      files.push(...entrypointSourceFiles(path));
    } else if (path.endsWith('.ts') || path.endsWith('.svelte')) {
      files.push(path);
    }
  }
  return files;
}

function normalize(path: string): string {
  return path.split(sep).join('/');
}

function isAllowedImport(path: string, allowed: string): boolean {
  return allowed.endsWith('/') ? path.startsWith(allowed) : path === allowed;
}
