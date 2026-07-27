import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/architecture-guard.test.ts',
      'tests/import-cycles.test.ts',
      'tests/selector-wire-contract.test.ts',
      'src/adapters/capabilities.test.ts',
      'src/adapters/platform-matrix.test.ts',
      'src/adapters/registry.test.ts',
      'src/background/message-router.test.ts',
      'src/background/platform-architecture.test.ts',
      'src/background/platform-strategies.test.ts',
      'src/compatibility/production-switches.test.ts',
      'src/entrypoint-architecture.test.ts',
      'src/messages/messages-architecture.test.ts',
      'src/storage/storage-architecture.test.ts',
      'src/utils/no-hardcoded-japanese.test.ts',
      'src/utils/selector-feed.test.ts',
    ],
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
  },
});
