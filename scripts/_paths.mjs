// dev / test scripts で共有するパス。username 等のローカル情報を含めない。
//
// - SCREENSHOT_DIR: puppeteer スクショを置く場所(repo root から相対)。
//   個別の script はこれを base に '${SCREENSHOT_DIR}/foo.png' のように使う。
// - TEST_IMAGE: 1x1 ~ 100x100 のテスト用 PNG。`make-bigger-png.mjs` が
//   生成する側、各 test script が読み込む側で同じパスを参照する。
//
// 必要なら `.env` で `TEST_IMAGE=...` 等を上書き可能(Node 20+ なら
// `node --env-file=.env scripts/foo.mjs`)。
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? 'scripts';
export const TEST_IMAGE = process.env.TEST_IMAGE ?? join(tmpdir(), 'tutti-test-100x100.png');
export const TEST_IMAGE_LEGACY = process.env.TEST_IMAGE_LEGACY ?? join(tmpdir(), 'tutti-test-image.png');
