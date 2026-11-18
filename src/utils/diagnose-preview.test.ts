// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { auditSelector } from './diagnose';

describe('auditSelector preview', () => {
  it('omits editor content and child nodes', () => {
    document.body.innerHTML =
      '<div contenteditable="true" data-testid="editor"><p>my private draft</p></div>' +
      '<textarea name="caption">another draft</textarea>';
    const editor = auditSelector('editor', '[data-testid="editor"]');
    const textarea = auditSelector('textarea', 'textarea');
    expect(editor.firstMatchPreview).toBe('<div contenteditable="true" data-testid="editor">');
    expect(textarea.firstMatchPreview).toBe('<textarea name="caption">');
    expect(`${editor.firstMatchPreview}${textarea.firstMatchPreview}`).not.toContain('draft');
  });

  it('redacts long attribute values even when the tag is long', () => {
    const long = 'x'.repeat(500);
    document.body.innerHTML = `<input value="${long}" aria-label="${long}" href="https://example.com/a?b=c">`;
    const preview = auditSelector('input', 'input').firstMatchPreview ?? '';
    expect(preview).not.toContain('xxxx');
    expect(preview).toContain('value="<v/>"');
  });
});
