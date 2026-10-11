/**
 * 首行缩进扩展（中文排版刚需，官方无现成件）
 *
 * 原理：纯 style 合并，不改 schema——段落/标题的 style 属性已由
 * PreserveAttributes 全局保留，输出即内联 `text-indent: 2em`，
 * 微信等终端直接生效。Tab / Shift+Tab 快捷键，表格内 Tab 让路
 * （不抢表格的单元格跳转）。
 */
import { Extension } from '@tiptap/core';

export const FIRST_LINE_INDENT = '2em';

function parseStyle(style) {
  return String(style || '')
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .map((decl) => {
      const index = decl.indexOf(':');
      if (index === -1) return null;
      return [decl.slice(0, index).trim(), decl.slice(index + 1).trim()];
    })
    .filter(Boolean);
}

function withTextIndent(style, indent) {
  const decls = parseStyle(style).filter(([key]) => key !== 'text-indent');
  if (indent) decls.push(['text-indent', indent]);
  if (decls.length === 0) return null;
  return `${decls.map(([key, value]) => `${key}: ${value}`).join('; ')};`;
}

/**
 * 对选区内所有文本块执行回调（段落/标题等）。
 */
function eachTextblock(state, fn) {
  const { $from, $to } = state.selection;
  const seen = new Set();
  state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
    if (node.isTextblock && !seen.has(pos)) {
      seen.add(pos);
      fn(node, pos);
    }
  });
  return seen.size;
}

export const TextIndent = Extension.create({
  name: 'textIndent',

  addCommands() {
    return {
      setTextIndent:
        (indent = FIRST_LINE_INDENT) =>
        ({ tr, state, dispatch }) => {
          let count = 0;
          eachTextblock(state, (node, pos) => {
            const next = withTextIndent(node.attrs.style, indent);
            if (next !== (node.attrs.style || null)) {
              tr.setNodeMarkup(pos, null, { ...node.attrs, style: next });
              count += 1;
            }
          });
          if (count === 0) return false;
          if (dispatch) tr.scrollIntoView();
          return true;
        },

      unsetTextIndent:
        () =>
        ({ tr, state, dispatch }) => {
          let count = 0;
          eachTextblock(state, (node, pos) => {
            if (parseStyle(node.attrs.style).some(([key]) => key === 'text-indent')) {
              const next = withTextIndent(node.attrs.style, null);
              tr.setNodeMarkup(pos, null, { ...node.attrs, style: next });
              count += 1;
            }
          });
          if (count === 0) return false;
          if (dispatch) tr.scrollIntoView();
          return true;
        },

      toggleTextIndent:
        (indent = FIRST_LINE_INDENT) =>
        ({ state, commands }) => {
          let allSet = true;
          let any = false;
          eachTextblock(state, (node) => {
            any = true;
            const current = parseStyle(node.attrs.style).find(([key]) => key === 'text-indent')?.[1];
            if (current !== indent) allSet = false;
          });
          if (!any) return false;
          return allSet
            ? commands.unsetTextIndent()
            : commands.setTextIndent(indent);
        },
    };
  },

  addKeyboardShortcuts() {
    const inTable = (editor) => {
      try {
        return Boolean(editor.isActive('table'));
      } catch {
        return false;
      }
    };
    return {
      Tab: ({ editor }) => {
        if (!editor.isEditable || inTable(editor)) return false;
        return editor.commands.toggleTextIndent();
      },
      'Shift-Tab': ({ editor }) => {
        if (!editor.isEditable || inTable(editor)) return false;
        return editor.commands.unsetTextIndent();
      },
    };
  },
});
