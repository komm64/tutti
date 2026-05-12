/**
 * E2E API path テストの共通 helper。
 *
 * 設計方針:
 *   - 環境変数で credentials を受ける (CI は repo secrets 経由)
 *   - credentials 不足時は test を **skip** (失敗じゃなく) — 部分セットでも CI 通る
 *   - test post は **必ず削除** (try/finally) — test 垢の timeline 汚染を防ぐ
 *   - 1 ネットワーク 1 test 程度に抑える — anti-spam 配慮
 */

export function envSkipIf(...keys: string[]): boolean {
  return keys.some((k) => !process.env[k]);
}

export function testText(label: string): string {
  return `tutti e2e ${label} ${new Date().toISOString()}`;
}
