/**
 * 文档级一键排版操作（Dock 全局模式使用）
 *
 * 约束：
 * 1. 只操作顶层段落，不碰多栏/表格/列表等复合结构内部，避免破坏排版骨架；
 * 2. 全部走 ProseMirror 事务（单条历史记录，可撤销）；
 * 3. 不改动 HTML 纯净性（只用现有 TextAlign / LineHeight 能力与段落删除）。
 */
import { TextSelection } from '@tiptap/pm/state';

/**
 * 删除顶层多余空段落（内容为空的 paragraph），至少保留一个块，保证文档合法。
 * @param {object} editor TipTap Editor 实例
 * @returns {number} 删除的段落数
 */
export function cleanEmptyTopParagraphs(editor) {
  if (!editor) return 0;
  const { doc } = editor.state;
  const targets = [];
  doc.forEach((node, offset) => {
    if (node.type.name === 'paragraph' && node.content.size === 0) {
      targets.push({ pos: offset, size: node.nodeSize });
    }
  });
  if (targets.length === 0) return 0;

  // 全部顶层块都是空段落时保留第一个，避免 doc 为空非法
  let toDelete = targets;
  if (toDelete.length >= doc.childCount) {
    toDelete = toDelete.slice(1);
  }
  if (toDelete.length === 0) return 0;

  const tr = editor.state.tr;
  toDelete.toSorted((a, b) => b.pos - a.pos).forEach(({ pos, size }) => {
    tr.delete(pos, pos + size);
  });
  editor.view.dispatch(tr);
  return toDelete.length;
}

/**
 * 收集文档大纲（标题位置/层级/文本，供跳转面板使用）。
 * 按位置跳转，不依赖 id 属性，输出保持纯净。
 * @returns {Array<{ key: string, level: number, text: string, pos: number }>}
 */
export function collectHeadingOutline(doc) {
  const items = [];
  if (!doc) return items;
  try {
    doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        items.push({
          key: `h-${pos}`,
          level: node.attrs.level || 1,
          text: node.textContent || '(空标题)',
          pos,
        });
      }
      return true;
    });
  } catch {
    /* 忽略 */
  }
  return items;
}

/**
 * 在文档中查找纯文本片段的首个出现位置（校对定位/应用替换用）。
 * 只在文本块内匹配，返回 { from, to } 或 null。
 */
export function findTextRange(doc, snippet) {
  if (!doc || !snippet || typeof snippet !== 'string') return null;
  let found = null;
  doc.descendants((node, pos) => {
    if (found || !node.isTextblock) return true;
    const idx = node.textContent.indexOf(snippet);
    if (idx !== -1) {
      found = { from: pos + 1 + idx, to: pos + 1 + idx + snippet.length };
      return false;
    }
    return true;
  });
  return found;
}

/**
 * 在保持光标尽量不动的前提下执行 fn（用于先 selectAll 再恢复的排版操作）。
 */
function withPreservedSelection(editor, fn) {
  const { from } = editor.state.selection;
  fn();
  try {
    const maxPos = editor.state.doc.content.size;
    const safe = Math.max(0, Math.min(from, Math.max(0, maxPos - 1)));
    const tr = editor.state.tr.setSelection(
      TextSelection.near(editor.state.doc.resolve(safe)),
    );
    editor.view.dispatch(tr);
  } catch {
    try {
      editor.commands.focus();
    } catch {
      /* 忽略 */
    }
  }
}

/**
 * 全文两端对齐。
 */
export function justifyAllContent(editor) {
  if (!editor) return false;
  withPreservedSelection(editor, () => {
    editor.chain().focus().selectAll().setTextAlign('justify').run();
  });
  return true;
}

/**
 * 全文统一行高（默认 1.75）。
 */
export function unifyAllLineHeight(editor, lineHeight = '1.75') {
  if (!editor) return false;
  withPreservedSelection(editor, () => {
    editor.chain().focus().selectAll().setLineHeight(lineHeight).run();
  });
  return true;
}
