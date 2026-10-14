/**
 * AI 内联比对插件（ProseMirror Decorations 机制，与 selection-plugin 同源）。
 *
 * 职责：
 * 1. 承载 AI 修改产生的变更区间高亮（node decoration，不碰 DOM，无外部污染）；
 * 2. 当前比对处（current）用更强的描边区分；
 * 3. 区间随文档 mapping 自动跟随；被删则落空（重算时由 index.vue 下发 fresh set）。
 *
 * 块 diff 说明（纯函数，可单测）：
 * - 粒度=作用域顶层子节点（段落/标题/表格整体/图片…，不钻进表格内部）；
 * - 比对键=标签名+归一化文本（`p|你好世界`），与类名等装饰无关；
 * - 对齐=LCS，连续非命中编为一个 hunk；key 由原文下标派生（原文会话内不变，
 *   故跨次重算稳定，可做已接受标记）。
 */
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { DOMSerializer } from '@tiptap/pm/model';

export const aiDiffKey = new PluginKey('aiDiff');

/** 待比对块（淡绿底 + 虚线框） */
export const AI_CHANGED_CLASS = 'app-editor-ai-changed';
/** 当前比对处（更强描边） */
export const AI_CURRENT_CLASS = 'app-editor-ai-current';

function mapRange(mapping, r) {
  try {
    const a = mapping.mapResult(r.from);
    const b = mapping.mapResult(r.to);
    if (a.deleted || b.deleted) return null;
    return { ...r, from: a.pos, to: b.pos };
  } catch {
    return r;
  }
}

export const aiDiffPlugin = new Plugin({
  key: aiDiffKey,

  state: {
    init() {
      return { ranges: [], current: null };
    },
    apply(tr, prev) {
      let next = {
        ranges: (prev.ranges || []).map((r) => mapRange(tr.mapping, r)).filter(Boolean),
        current: prev.current,
      };
      const meta = tr.getMeta(aiDiffKey);
      if (meta) {
        if (meta.type === 'set') {
          next = { ranges: meta.ranges || [], current: meta.current ?? null };
        } else if (meta.type === 'clear') {
          next = { ranges: [], current: null };
        } else if (meta.type === 'setCurrent') {
          next = { ...next, current: meta.key ?? null };
        }
      }
      return next;
    },
  },

  props: {
    decorations(state) {
      const s = aiDiffKey.getState(state);
      if (!s || !s.ranges || s.ranges.length === 0) return DecorationSet.empty;
      const decos = [];
      for (const r of s.ranges) {
        try {
          if (!(r.to > r.from)) continue;
          // 高亮走内联 style（不依赖外部样式表，到哪都生效）
          const isCur = r.key != null && r.key === s.current;
          const style = isCur
            ? 'background-color:rgba(16,185,129,.18);outline:2px solid rgba(16,185,129,.9);outline-offset:-1px;border-radius:4px;'
            : 'background-color:rgba(16,185,129,.10);outline:1px dashed rgba(16,185,129,.65);outline-offset:-1px;border-radius:4px;';
          decos.push(Decoration.node(r.from, r.to, { style }));
        } catch {
          /* 忽略 */
        }
      }
      return decos.length > 0
        ? DecorationSet.create(state.doc, decos)
        : DecorationSet.empty;
    },
  },
});

/** 下发全量区间（重算后调用，附带当前 key） */
export function dispatchAiDiffSet(editor, ranges, current) {
  if (!editor || editor.isDestroyed) return;
  try {
    editor.view.dispatch(
      editor.state.tr.setMeta(aiDiffKey, { type: 'set', ranges, current }),
    );
  } catch {
    /* 忽略 */
  }
}

/** 仅切换当前比对处（导航/点击，不重算） */
export function dispatchAiDiffCurrent(editor, key) {
  if (!editor || editor.isDestroyed) return;
  try {
    editor.view.dispatch(editor.state.tr.setMeta(aiDiffKey, { type: 'setCurrent', key }));
  } catch {
    /* 忽略 */
  }
}

/** 清除全部 AI 高亮（会话结束时） */
export function dispatchAiDiffClear(editor) {
  if (!editor || editor.isDestroyed) return;
  try {
    editor.view.dispatch(editor.state.tr.setMeta(aiDiffKey, { type: 'clear' }));
  } catch {
    /* 忽略 */
  }
}

/** 文本归一化（比对键用，截断防爆） */
export function normText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
}

/** 单块签名：`标签|文本`（无元素时回落纯文本） */
export function blockSig(html) {
  try {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html ?? '').trim();
    const el = tpl.content.firstElementChild;
    if (!el) return `text:${normText(html)}`;
    return `${el.tagName.toLowerCase()}|${normText(el.textContent)}`;
  } catch {
    return `raw:${String(html ?? '').slice(0, 64)}`;
  }
}

/** 顶层子节点序列化为 [{ html, sig }]（与编辑器同一 serializer，口径一致） */
export function serializeChildBlocks(schema, node) {
  const out = [];
  try {
    const ser = DOMSerializer.fromSchema(schema);
    const frag = ser.serializeFragment(node.content);
    const tmp = document.createElement('div');
    tmp.appendChild(frag);
    Array.from(tmp.children).forEach((el) => {
      const html = el.outerHTML;
      out.push({ html, sig: blockSig(html) });
    });
  } catch {
    /* 忽略 */
  }
  return out;
}

/** 顶层子节点起止位置（base=作用域内容起点：全文 0，节点 scopePos+1） */
export function childOffsets(node, base) {
  const out = [];
  let off = base;
  try {
    for (let k = 0; k < node.childCount; k += 1) {
      const ch = node.child(k);
      out.push({ from: off, to: off + ch.nodeSize });
      off += ch.nodeSize;
    }
  } catch {
    /* 忽略 */
  }
  return out;
}

/**
 * LCS 对齐新旧签名数组，连续差异编为 hunk。
 * @returns {Array<{ o: number[], c: number[], cAnchor: number, key: string }>}
 *   o=原文下标，c=现文下标，cAnchor=现文锚点（纯删时定位用），
 *   key=`o1.3`（有原文）或 `i@锚点:签名头`（纯增）。
 */
export function diffBlocks(origSigs, curSigs) {
  const o = Array.isArray(origSigs) ? origSigs : [];
  const c = Array.isArray(curSigs) ? curSigs : [];
  const n = o.length;
  const m = c.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = o[i] === c[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hunks = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && o[i] === c[j]) {
      i += 1;
      j += 1;
      continue;
    }
    const h = { o: [], c: [], cAnchor: j, key: '' };
    while ((i < n || j < m) && !(i < n && j < m && o[i] === c[j])) {
      if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) {
        h.o.push(i);
        i += 1;
      } else {
        h.c.push(j);
        j += 1;
      }
    }
    h.key =
      h.o.length > 0
        ? `o${h.o.join('.')}`
        : `i@${h.cAnchor}:${h.c.map((x) => c[x]).join('|').slice(0, 48)}`;
    hunks.push(h);
  }
  return hunks;
}
