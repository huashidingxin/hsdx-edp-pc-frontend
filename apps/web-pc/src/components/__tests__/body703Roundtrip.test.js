// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { readFileSync } from 'node:fs';
import { createEditorExtensions } from '../app-editor/extensions';

const HTML_PATH = '/tmp/body_703.sanitized.html';
const bodyHtml = readFileSync(HTML_PATH, 'utf-8');

function roundtrip(html) {
  const e1 = new Editor({ extensions: createEditorExtensions(), content: html });
  const first = e1.getHTML();
  e1.destroy();
  const e2 = new Editor({ extensions: createEditorExtensions(), content: first });
  const second = e2.getHTML();
  e2.destroy();
  return { first, second };
}

describe('703 京华精品彩涂板 body 编辑器兼容性', () => {
  const { first, second } = roundtrip(bodyHtml);

  it('关键结构一次解析后全部存活', () => {
    expect(first.match(/class="cms-columns[ "]/g)?.length).toBe(5);
    expect(first.match(/class="cms-column"/g)?.length).toBe(14);
    expect(first.match(/<h2/g)?.length).toBe(4);
    expect(first.match(/<img /g)?.length).toBe(15);
    expect(first).not.toContain('<h1');
    expect(first).not.toContain('<figure');
    expect(first).not.toMatch(/(src|href)="(?!https?:|data:|#)/);
  });

  it('往返稳定（getHTML → 全新构造解析 → getHTML 幂等）', () => {
    expect(second).toBe(first);
  });
});
