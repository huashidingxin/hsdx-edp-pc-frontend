// 源代码模式 CodeMirror 6 配对标签：高亮/改名联动/跳转
// 纯 state 层验证，不需要 DOM（happy-dom 仅满足统一环境约定）
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { html } from '@codemirror/lang-html';
import { Decoration, EditorView, ViewPlugin, keymap } from '@codemirror/view';
import { createTagPairSupport } from '../app-editor/source-editor.js';

const support = createTagPairSupport({
  syntaxTree,
  EditorState,
  Decoration,
  ViewPlugin,
  EditorView,
  keymap,
});
const mk = (doc) => EditorState.create({ doc, extensions: [html(), ...support.extensions] });

/** 模拟 view：仅 capture dispatch 的 selection spec（jumpToPair 只用这两项） */
function fakeViewAt(state, pos) {
  const positioned = state.update({ selection: { anchor: pos } }).state;
  let moved = null;
  return {
    get moved() {
      return moved;
    },
    view: {
      state: positioned,
      dispatch(spec) {
        moved = spec.selection;
      },
    },
  };
}

describe('源码模式配对标签（CodeMirror 6）', () => {
  it('改开标签名自动联动闭标签名', () => {
    const s = mk('<section style="a: 1;"><p>hi</p></section>');
    const tr = s.update({ changes: { from: 1, to: 8, insert: 'div' } });
    expect(tr.state.doc.toString()).toBe('<div style="a: 1;"><p>hi</p></div>');
  });

  it('改闭标签名自动联动开标签名', () => {
    const s = mk('<section><p>hi</p></section>');
    const from = s.doc.toString().lastIndexOf('section');
    const tr = s.update({ changes: { from, to: from + 7, insert: 'article' } });
    expect(tr.state.doc.toString()).toBe('<article><p>hi</p></article>');
  });

  it('编辑属性值不触发标签名联动', () => {
    const s = mk('<section class="x"><p>hi</p></section>');
    const at = s.doc.toString().indexOf('"x"') + 1;
    const tr = s.update({ changes: { from: at, to: at + 1, insert: 'y' } });
    expect(tr.state.doc.toString()).toBe('<section class="y"><p>hi</p></section>');
  });

  it('嵌套结构只联动自身配对端', () => {
    const s = mk('<div><section><p>hi</p></section></div>');
    const from = s.doc.toString().indexOf('section');
    const tr = s.update({ changes: { from, to: from + 7, insert: 'article' } });
    expect(tr.state.doc.toString()).toBe('<div><article><p>hi</p></article></div>');
  });

  it('开标签名上跳转到配对闭标签并选中', () => {
    const s = mk('<section><p>hi</p></section>');
    const probe = fakeViewAt(s, s.doc.toString().indexOf('section') + 2);
    const ok = support.jumpToPair(probe.view);
    const expectFrom = s.doc.toString().lastIndexOf('section');
    expect(ok).toBe(true);
    expect(probe.moved).toEqual({ anchor: expectFrom, head: expectFrom + 7 });
  });

  it('闭标签名上跳回配对开标签', () => {
    const s = mk('<section><p>hi</p></section>');
    const probe = fakeViewAt(s, s.doc.toString().lastIndexOf('section') + 2);
    const ok = support.jumpToPair(probe.view);
    expect(ok).toBe(true);
    expect(probe.moved).toEqual({ anchor: 1, head: 8 });
  });

  it('自闭合/无配对端（img）跳转返回 false', () => {
    const s = mk('<section><img src="a.png"></section>');
    const probe = fakeViewAt(s, s.doc.toString().indexOf('img') + 1);
    expect(support.jumpToPair(probe.view)).toBe(false);
  });

  it('光标在标签属性上也能识别配对并跳转', () => {
    const s = mk('<div class="box"><span>x</span></div>');
    const attrPos = s.doc.toString().indexOf('class') + 1;
    const probe = fakeViewAt(s, attrPos);
    const ok = support.jumpToPair(probe.view);
    const closeFrom = s.doc.toString().lastIndexOf('/div') + 1;
    expect(ok).toBe(true);
    expect(probe.moved).toEqual({ anchor: closeFrom, head: closeFrom + 3 });
  });

  it('光标在内容区：跳转到包裹元素的配对闭标签', () => {
    const s = mk('<div><p>hello world</p></div>');
    const inner = s.doc.toString().indexOf('hello') + 2;
    const probe = fakeViewAt(s, inner);
    const ok = support.jumpToPair(probe.view);
    const closeFrom = s.doc.toString().indexOf('</p>') + 2;
    expect(ok).toBe(true);
    expect(probe.moved).toEqual({ anchor: closeFrom, head: closeFrom + 1 });
  });

  it('pairAt 在内容区返回包裹元素的两端标签名（高亮用）', () => {
    const s = mk('<section><div>hi</div></section>');
    const text = s.doc.toString();
    const pair = support.pairAt(s, text.indexOf('hi') + 1);
    expect(text.slice(pair.selfName.from, pair.selfName.to)).toBe('div');
    expect(text.slice(pair.otherName.from, pair.otherName.to)).toBe('div');
  });

  it('未闭合结构下编辑不报错且不误联动', () => {
    const s = mk('<div><br><p>hi');
    const from = s.doc.toString().indexOf('br');
    const tr = s.update({ changes: { from, to: from + 2, insert: 'hr' } });
    expect(tr.state.doc.toString()).toBe('<div><hr><p>hi');
  });
});
