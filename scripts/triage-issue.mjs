/**
 * Auto-triage Tutti issue.
 *
 * 流れ:
 *   1. Issue body から `<!-- tutti-diagnostics-begin -->` ... end ブロックを抽出
 *   2. 中の JSON を parse、selector miss (matchCount=0) を持つ platform を探す
 *   3. 該当 adapter のソースを読む (`src/adapters/<platform>.ts`)
 *   4. Anthropic API に「壊れた selector + DOM snapshot + adapter 全文」を渡し
 *      新 selector + confidence を JSON で取得
 *   5. confidence >= 0.6 なら branch 切って commit + PR、未満なら issue にコメントだけ
 *
 * 失敗してもワークフロー全体は exit 0 (issue は残るので人手 fallback)。
 */

import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const issueBody = process.env.ISSUE_BODY ?? '';
const issueNumber = process.env.ISSUE_NUMBER ?? '0';
const issueTitle = process.env.ISSUE_TITLE ?? '';

function log(...args) {
  console.log('[triage]', ...args);
}

function commentOnIssue(body) {
  try {
    execSync(`gh issue comment ${issueNumber} --body ${JSON.stringify(body)}`, {
      stdio: 'inherit',
      cwd: repoRoot,
    });
  } catch (e) {
    log('failed to comment:', e?.message ?? e);
  }
}

function abort(reason) {
  log('abort:', reason);
  commentOnIssue(`auto-triage skipped: ${reason}`);
  process.exit(0);
}

function extractDiagnostics() {
  const begin = issueBody.indexOf('<!-- tutti-diagnostics-begin -->');
  const end = issueBody.indexOf('<!-- tutti-diagnostics-end -->');
  if (begin < 0 || end < 0) return null;
  const block = issueBody.slice(begin, end);
  const m = block.match(/```json\n([\s\S]*?)\n```/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function findFirstBreakage(diagnostics) {
  const platforms = diagnostics?.platforms ?? [];
  for (const platform of platforms) {
    const audits = platform.selectors ?? [];
    for (const audit of audits) {
      if (audit.matchCount === 0 && audit.selector) {
        return { platform: platform.platform, audit, snapshot: platform.domSnapshot ?? '' };
      }
    }
  }
  return null;
}

async function askClaude({ platform, audit, snapshot, adapterSrc }) {
  const client = new Anthropic();
  const systemPrompt = [
    'あなたは Chrome 拡張 Tutti の SNS adapter 壊れた selector の修正担当。',
    '',
    '入力:',
    '- 壊れた selector (matchCount=0)',
    '- 現在の adapter ソース (src/adapters/<platform>.ts)',
    '- 障害発生時の redacted DOM snapshot',
    '',
    'snapshot 中の表記:',
    '- `<t/>` = ユーザー入力 text を redact 済み',
    '- `<v/>` = value 属性を redact 済み',
    '- `<u/>` = URL を redact 済み',
    '',
    '出力 (純粋 JSON のみ、それ以外のテキスト不要):',
    '{',
    '  "newSelector": string | null,   // 新 selector。fallback として既存をカンマで残してよい',
    '  "reasoning": string,            // なぜこの selector か。snapshot のどこから判断したか',
    '  "confidence": number            // 0.0-1.0。snapshot に該当要素が無ければ 0',
    '}',
    '',
    '判断基準:',
    '- aria-label / role / data-testid / id / class が信頼できる anchor',
    '- snapshot 中に該当しそうな要素が見当たらない場合は newSelector=null + confidence=0',
    '- confidence >= 0.6 のとき自動 PR が作成される。低確度の推測で PR を量産しない',
    '- 既存 selector も残す形 (例: "OLD, NEW") にすると後方互換 (お薦め)',
  ].join('\n');

  const userPrompt = [
    `## platform: ${platform}`,
    '',
    '## broken selector',
    `- name: ${audit.name}`,
    `- current selector: \`${audit.selector}\``,
    '- matchCount: 0',
    audit.firstMatchPreview ? `- previous DOM hint: ${audit.firstMatchPreview}` : '',
    '',
    '## adapter source',
    '```typescript',
    adapterSrc,
    '```',
    '',
    '## redacted DOM snapshot',
    '```html',
    snapshot.slice(0, 12000),
    '```',
  ].filter(Boolean).join('\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const text = response.content.find((c) => c.type === 'text')?.text ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`Claude did not return JSON: ${text.slice(0, 200)}`);
  return JSON.parse(m[0]);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) abort('ANTHROPIC_API_KEY not set in repo secrets');
  log(`issue #${issueNumber}: ${issueTitle}`);

  const diagnostics = extractDiagnostics();
  if (!diagnostics) abort('no diagnostics block in issue body');

  const breakage = findFirstBreakage(diagnostics);
  if (!breakage) abort('no selector miss found (matchCount > 0 for all selectors)');

  const adapterPath = resolve(repoRoot, 'src/adapters', `${breakage.platform}.ts`);
  if (!existsSync(adapterPath)) abort(`adapter file not found: ${breakage.platform}.ts`);
  const adapterSrc = readFileSync(adapterPath, 'utf8');

  if (!adapterSrc.includes(breakage.audit.selector)) {
    abort(`selector "${breakage.audit.selector}" not found verbatim in adapter source — manual review needed`);
  }

  log(`platform=${breakage.platform} broken=${breakage.audit.name}`);

  let proposal;
  try {
    proposal = await askClaude({ ...breakage, adapterSrc });
  } catch (e) {
    abort(`Claude API failed: ${e?.message ?? e}`);
  }
  log('proposal:', JSON.stringify(proposal));

  const conf = Number(proposal.confidence ?? 0);
  if (!proposal.newSelector || conf < 0.6) {
    commentOnIssue(
      [
        '## auto-triage: 自動 PR は作成しません',
        '',
        `confidence=${conf} (閾値 0.6)、または newSelector が null。`,
        '',
        '### Claude の reasoning',
        proposal.reasoning ?? '(no reasoning)',
        '',
        '人手で selector を更新するか、追加の DOM 情報を貼ってください。',
      ].join('\n'),
    );
    return;
  }

  const newSrc = adapterSrc.replace(breakage.audit.selector, proposal.newSelector);
  writeFileSync(adapterPath, newSrc, 'utf8');

  // docs/selectors.json も同時に更新 (hot-fix 即配信)。
  // PR マージ → GitHub Pages 反映 → selectorOverrideUrl を有効にしてる
  // ユーザは次回 fetch (background 起動時) で新 selector を受け取る。
  // 拡張本体の release を待たずに数時間で全ユーザに届く想定。
  const overridesPath = resolve(repoRoot, 'docs/selectors.json');
  let overrides = {};
  if (existsSync(overridesPath)) {
    try {
      overrides = JSON.parse(readFileSync(overridesPath, 'utf8'));
    } catch { /* corrupt, start fresh */ }
  }
  if (!overrides[breakage.platform] || typeof overrides[breakage.platform] !== 'object') {
    overrides[breakage.platform] = {};
  }
  overrides[breakage.platform][breakage.audit.name] = proposal.newSelector;
  writeFileSync(overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');

  const branch = `fix/auto-triage-${breakage.platform}-${issueNumber}`;
  execSync('git config user.name "github-actions[bot]"', { cwd: repoRoot });
  execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"', { cwd: repoRoot });
  execSync(`git checkout -b ${branch}`, { cwd: repoRoot });
  execSync(`git add "${adapterPath}" "${overridesPath}"`, { cwd: repoRoot });
  execSync(
    `git commit -m ${JSON.stringify(`fix(${breakage.platform}): auto-triage selector update from #${issueNumber}`)}`,
    { cwd: repoRoot },
  );
  execSync(`git push -u origin ${branch}`, { cwd: repoRoot });

  const prBody = [
    `Fixes #${issueNumber}`,
    '',
    '## Selector update',
    `- platform: \`${breakage.platform}\``,
    `- name: \`${breakage.audit.name}\``,
    `- old: \`${breakage.audit.selector}\``,
    `- new: \`${proposal.newSelector}\``,
    `- confidence: ${conf}`,
    '',
    '## Files changed',
    `- \`src/adapters/${breakage.platform}.ts\` — code-side fix (要 extension release)`,
    `- \`docs/selectors.json\` — hot-fix override (merge 直後 GitHub Pages から全ユーザに配信)`,
    '',
    '## Reasoning (from Claude)',
    proposal.reasoning ?? '(no reasoning)',
    '',
    '---',
    '',
    '⚠️ This PR was auto-generated by `auto-triage.yml`. Please verify the new selector against the actual SNS DOM before merging.',
    'Merge すると docs/selectors.json が即座に GitHub Pages 経由で配信され、',
    'selectorOverrideUrl を有効にしてる全ユーザに数分以内で hot-fix が届きます。',
  ].join('\n');

  execSync(
    `gh pr create --base main --head ${branch} --title ${JSON.stringify(`fix(${breakage.platform}): auto-triage from #${issueNumber}`)} --body ${JSON.stringify(prBody)}`,
    { cwd: repoRoot, stdio: 'inherit' },
  );

  commentOnIssue(`auto-triage: PR を作成しました (selector breakage を ${breakage.platform} で検出、confidence=${conf})。マージ前に新 selector を確認してください。`);
}

main().catch((e) => {
  log('fatal:', e?.message ?? e);
  commentOnIssue(`auto-triage fatal error: ${e?.message ?? e}`);
  process.exit(0);
});
