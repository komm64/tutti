import { defineConfig } from 'vitest/config';

// Real API call を伴う E2E test 用の vitest config。
// default config (vitest.config.ts) は src 配下の .test.ts だけを include するので
// scripts/e2e-api/ は普段の `npm test` には引っかからない。
// CI nightly や credentials を持つローカルで `npm run test:e2e-api` で明示的に走らせる用。
// test 垢のメアド / token は env に置く前提 (.github/workflows/e2e-api.yml 参照)。
export default defineConfig({
  test: {
    include: ['scripts/e2e-api/**/*.test.ts'],
    environment: 'node',
    // 各 SNS の API 呼び出しが直列で実行されるよう pool=single (forks) にする
    // anti-spam: 並列で 3 SNS 同時に書き込みに行かないように
    pool: 'forks',
    forks: { singleFork: true },
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
