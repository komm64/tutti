import { describe, expect, it } from 'vitest';
import { executeMultiStepFlow, type Step } from './step-runner';

// 最小 HTMLElement 風 mock。`finder` に渡せるので DOM 環境 (jsdom) を立てずに済む。
function makeMockButton(label: string, log: string[]): HTMLElement {
  const btn = {
    getAttribute: () => null,
    disabled: false,
    click: () => log.push(`${label}.click`),
    style: { outline: '' },
  };
  return btn as unknown as HTMLElement;
}

describe('executeMultiStepFlow', () => {
  it('dry-run: 全 step.action と advance.click が走るが finalize.click は走らない', async () => {
    const log: string[] = [];
    const finalizeBtn = makeMockButton('finalize', log);

    const steps: Step[] = [
      {
        name: 'step1',
        action: async () => { log.push('step1.action'); },
        settleMs: 0,
        advance: { finder: () => makeMockButton('advance1', log) },
      },
      {
        name: 'step2',
        action: async () => { log.push('step2.action'); },
        settleMs: 0,
        advance: { finder: () => makeMockButton('advance2', log) },
      },
    ];

    await executeMultiStepFlow({
      steps,
      finalize: {
        finder: () => finalizeBtn,
        afterClickDelayMs: 0,
      },
      dryRun: true,
    });

    expect(log).toEqual([
      'step1.action',
      'advance1.click',
      'step2.action',
      'advance2.click',
    ]);
    // finalize は dryRun なので click されない
    expect(log).not.toContain('finalize.click');
  });

  it('dryRun=false: finalize.click まで走る', async () => {
    const log: string[] = [];
    const steps: Step[] = [
      {
        name: 'step1',
        action: async () => { log.push('step1.action'); },
        settleMs: 0,
        advance: { finder: () => makeMockButton('advance1', log) },
      },
    ];

    await executeMultiStepFlow({
      steps,
      finalize: {
        finder: () => makeMockButton('finalize', log),
        afterClickDelayMs: 0,
      },
    });

    expect(log).toContain('finalize.click');
  });

  it('step.action のエラーは step.name を含めて throw', async () => {
    await expect(
      executeMultiStepFlow({
        steps: [
          {
            name: 'fill-caption',
            action: async () => { throw new Error('textarea not found'); },
            settleMs: 0,
          },
        ],
        finalize: { finder: () => null },
      }),
    ).rejects.toThrow(/fill-caption/);
  });

  it('advance ボタンが見つからない場合、step.name を含めて throw', async () => {
    await expect(
      executeMultiStepFlow({
        steps: [
          {
            name: 'tags',
            action: async () => {},
            settleMs: 0,
            advance: { finder: () => null, timeoutMs: 50 },
          },
        ],
        finalize: { finder: () => null },
      }),
    ).rejects.toThrow(/tags/);
  });

  it('finalize ボタンが見つからない場合は throw', async () => {
    await expect(
      executeMultiStepFlow({
        steps: [
          {
            name: 'step1',
            action: async () => {},
            settleMs: 0,
          },
        ],
        finalize: { finder: () => null, timeoutMs: 50 },
        dryRun: true,
      }),
    ).rejects.toThrow(/最終投稿ボタン/);
  });

  it('disabled な advance ボタンは clickable まで待つ (timeout で諦める)', async () => {
    const disabledBtn = {
      getAttribute: () => null,
      disabled: true,
      click: () => {},
      style: { outline: '' },
    } as unknown as HTMLElement;

    await expect(
      executeMultiStepFlow({
        steps: [
          {
            name: 'wait-enable',
            action: async () => {},
            settleMs: 0,
            advance: { finder: () => disabledBtn, timeoutMs: 100 },
          },
        ],
        finalize: { finder: () => null },
      }),
    ).rejects.toThrow(/wait-enable/);
  });

  it('steps が空なら throw', async () => {
    await expect(
      executeMultiStepFlow({
        steps: [],
        finalize: { finder: () => null },
      }),
    ).rejects.toThrow(/steps must not be empty/);
  });

  it('最終 step は advance を省略できる (finalize に直接行く)', async () => {
    const log: string[] = [];
    await executeMultiStepFlow({
      steps: [
        {
          name: 'only-step',
          action: async () => { log.push('only-step.action'); },
          settleMs: 0,
          // advance なし
        },
      ],
      finalize: {
        finder: () => makeMockButton('finalize', log),
        afterClickDelayMs: 0,
      },
    });
    expect(log).toEqual(['only-step.action', 'finalize.click']);
  });
});
