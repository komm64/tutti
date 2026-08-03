import { describe, expect, it, vi } from 'vitest';
import { executeMultiStepFlow, type Step } from './step-runner';

vi.mock('./web-action-pacing', () => ({
  waitForWebActionPacing: vi.fn(async () => 0),
  clickElementWithPacing: vi.fn(async (element: HTMLElement) => { element.click(); }),
}));

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
      preSubmitPacing: async () => { log.push('pacing'); },
    });

    expect(log).toContain('finalize.click');
    expect(log.indexOf('pacing')).toBeLessThan(log.indexOf('finalize.click'));
  });

  it('next は固定 settle の代わりに明示された完了条件を順番に待つ', async () => {
    const log: string[] = [];
    const steps: Step[] = [
      {
        name: 'event-driven',
        action: async () => { log.push('action'); },
        settleMs: 60_000,
        waitAfterAction: async () => { log.push('action.ready'); },
        advance: { finder: () => makeMockButton('advance', log) },
        waitAfterAdvance: async () => { log.push('next.ready'); },
      },
    ];

    await executeMultiStepFlow({
      steps,
      finalize: {
        finder: () => makeMockButton('finalize', log),
        afterClickDelayMs: 60_000,
      },
      implementationPath: 'next',
      preSubmitPacing: async () => undefined,
    });

    expect(log).toEqual([
      'action',
      'action.ready',
      'advance.click',
      'next.ready',
      'finalize.click',
    ]);
  });

  it('legacy は next 用完了条件を呼ばず従来の settle 経路を維持する', async () => {
    const log: string[] = [];
    const steps: Step[] = [
      {
        name: 'legacy',
        action: async () => { log.push('action'); },
        settleMs: 0,
        waitAfterAction: async () => { log.push('action.ready'); },
        advance: { finder: () => makeMockButton('advance', log) },
        waitAfterAdvance: async () => { log.push('next.ready'); },
      },
    ];

    await executeMultiStepFlow({
      steps,
      finalize: {
        finder: () => makeMockButton('finalize', log),
        afterClickDelayMs: 0,
      },
      preSubmitPacing: async () => undefined,
    });

    expect(log).toEqual([
      'action',
      'advance.click',
      'finalize.click',
    ]);
  });

  it('next の完了条件エラーは step.name を含めて throw', async () => {
    await expect(
      executeMultiStepFlow({
        steps: [
          {
            name: 'await-editor',
            action: async () => {},
            settleMs: 0,
            waitAfterAction: async () => { throw new Error('editor unstable'); },
          },
        ],
        finalize: { finder: () => null },
        implementationPath: 'next',
      }),
    ).rejects.toThrow(/await-editor/);
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

  it('dry-run は明示オプション付きなら disabled finalize ボタンを到達確認として許可する', async () => {
    const log: string[] = [];
    const disabledFinalize = {
      getAttribute: (name: string) => name === 'aria-disabled' ? 'true' : null,
      disabled: true,
      click: () => log.push('finalize.click'),
      style: { outline: '' },
    } as unknown as HTMLElement;

    await executeMultiStepFlow({
      steps: [
        {
          name: 'visibility',
          action: async () => { log.push('visibility.action'); },
          settleMs: 0,
        },
      ],
      finalize: {
        finder: () => disabledFinalize,
        timeoutMs: 10,
        allowDisabledInPreview: true,
      },
      dryRun: true,
    });

    expect(log).toEqual(['visibility.action']);
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
      preSubmitPacing: async () => undefined,
    });
    expect(log).toEqual(['only-step.action', 'finalize.click']);
  });
});
