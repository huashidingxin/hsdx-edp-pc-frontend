/**
 * 查找替换插件（视图层 decorations，不污染输出 HTML）
 *
 * 状态：{ query: string, matches: [{from, to}], index: number }
 * 高亮类仅编辑器内使用（见 index.vue 样式），序列化时自动丢弃。
 */
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const findPluginKey = new PluginKey('appEditorFind');

export const FIND_MATCH_CLASS = 'app-editor-find-match';
export const FIND_CURRENT_CLASS = 'app-editor-find-current';

/**
 * 在文档文本块中按原文顺序查找（大小写不敏感），返回位置列表。
 */
export function collectMatches(doc, query) {
  const matches = [];
  if (!query || typeof query !== 'string') return matches;
  const needle = query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textContent.toLowerCase();
    if (!text.includes(needle)) return true;
    let from = 0;
    for (;;) {
      const idx = text.indexOf(needle, from);
      if (idx === -1) break;
      // 文本块内容起始于 pos + 1
      matches.push({ from: pos + 1 + idx, to: pos + 1 + idx + needle.length });
      from = idx + Math.max(1, needle.length);
    }
    return true;
  });
  return matches;
}

export const findPlugin = new Plugin({
  key: findPluginKey,

  state: {
    init() {
      return { query: '', matches: [], index: 0 };
    },
    apply(tr, prev) {
      const meta = tr.getMeta(findPluginKey);
      if (meta) {
        if (meta.type === 'setQuery') {
          const matches = collectMatches(tr.doc, meta.query);
          return { query: meta.query, matches, index: 0 };
        }
        if (meta.type === 'setIndex') {
          if (prev.matches.length === 0) return prev;
          const len = prev.matches.length;
          const index = ((meta.index % len) + len) % len;
          return { ...prev, index };
        }
        if (meta.type === 'clear') {
          return { query: '', matches: [], index: 0 };
        }
      }
      // 文档变化后重算命中（替换操作后保持同步）
      if (tr.docChanged && prev.query) {
        const matches = collectMatches(tr.doc, prev.query);
        return {
          query: prev.query,
          matches,
          index: matches.length === 0 ? 0 : Math.min(prev.index, matches.length - 1),
        };
      }
      return prev;
    },
  },

  props: {
    decorations(state) {
      const find = findPluginKey.getState(state);
      if (!find || find.matches.length === 0) return DecorationSet.empty;
      const decos = find.matches.map((m, i) =>
        Decoration.inline(m.from, m.to, {
          class: i === find.index ? FIND_CURRENT_CLASS : FIND_MATCH_CLASS,
        }),
      );
      return DecorationSet.create(state.doc, decos);
    },
  },
});

export function getFindState(editor) {
  try {
    return findPluginKey.getState(editor.state) || { query: '', matches: [], index: 0 };
  } catch {
    return { query: '', matches: [], index: 0 };
  }
}
