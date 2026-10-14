/**
 * AI 内联比对插件（ProseMirror Decorations 机制，方案 A 原生行内 Diff 审阅）。
 *
 * 职责：
 * 1. 承载 AI 修改产生的行内差分与块级高亮：
 *    - 删除的原内容：Widget 呈现红底删除线 <del>，不破坏底层文档数据；
 *    - 新增的 AI 内容：Inline Decoration 呈现绿底 + 下划线；
 *    - 块级大改动：呈现边框与区块微色；
 * 2. 当前比对处（current）突出显示；
 * 3. 比对区间随文档 mapping 自动跟随；
 * 4. 纯函数差分算法（Myers/LCS token diff）支持中英文与符号词级精准比对。
 */
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { DOMSerializer } from '@tiptap/pm/model';

export const aiDiffKey = new PluginKey('aiDiff');

/** 待比对块（淡绿底 + 虚线框） */
export const AI_CHANGED_CLASS = 'app-editor-ai-changed';
/** 当前比对处（更强描边） */
export const AI_CURRENT_CLASS = 'app-editor-ai-current';
/** 行内删除标记类名 */
export const AI_DIFF_DEL_CLASS = 'app-editor-diff-del';
/** 行内新增标记类名 */
export const AI_DIFF_INS_CLASS = 'app-editor-diff-ins';

function mapRange(mapping, r) {
  try {
    if (r.type === 'del') {
      const a = mapping.mapResult(r.pos);
      if (a.deleted) return null;
      return { ...r, pos: a.pos };
    }
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
          const isCur = r.key != null && r.key === s.current;

          // 1. 删除的原内容：通过 Widget 渲染红底 + 删除线，不污染实际文档
          if (r.type === 'del') {
            if (typeof r.pos !== 'number' || !r.text) continue;
            decos.push(
              Decoration.widget(
                r.pos,
                () => {
                  const el = document.createElement('del');
                  el.className = AI_DIFF_DEL_CLASS;
                  el.style.cssText =
                    'background-color:rgba(239,68,68,0.15);color:#b91c1c;text-decoration:line-through;text-decoration-color:#ef4444;border-radius:2px;padding:0 3px;margin:0 2px;user-select:none;font-size:0.95em;display:inline-block;vertical-align:baseline;line-height:1.4;';
                  el.textContent = r.text;
                  return el;
                },
                { side: -1, key: r.key },
              ),
            );
            continue;
          }

          // 2. 新增的 AI 内容：Inline Decoration 绿底 + 下划线
          if (r.type === 'ins') {
            if (!(r.to > r.from)) continue;
            const insStyle =
              'background-color:rgba(16,185,129,0.18);color:#065f46;text-decoration:underline;text-decoration-color:#10b981;text-underline-offset:2px;border-radius:2px;padding:0 2px;font-weight:500;';
            decos.push(
              Decoration.inline(r.from, r.to, {
                class: AI_DIFF_INS_CLASS,
                style: insStyle,
              }),
            );
            continue;
          }

          // 3. 块级差异或通用容器高亮
          if (!(r.to > r.from)) continue;
          const blockStyle = isCur
            ? 'background-color:rgba(16,185,129,.18);outline:2px solid rgba(16,185,129,.9);outline-offset:-1px;border-radius:4px;'
            : 'background-color:rgba(16,185,129,.10);outline:1px dashed rgba(16,185,129,.65);outline-offset:-1px;border-radius:4px;';

          if (r.isNode) {
            try {
              decos.push(Decoration.node(r.from, r.to, { style: blockStyle }));
            } catch {
              decos.push(Decoration.inline(r.from, r.to, { style: blockStyle }));
            }
          } else {
            decos.push(Decoration.inline(r.from, r.to, { style: blockStyle }));
          }
        } catch {
          /* 忽略单项异常 */
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
 * 文本分词（支持中英文混排、单字符汉字、英文单词、标点符号与空白）
 */
export function tokenizeText(str) {
  if (!str) return [];
  const matches = String(str).match(/[\u4e00-\u9fa5]|[a-zA-Z0-9_]+|\s+|[^\s\w\u4e00-\u9fa5]/g);
  return matches || [];
}

/**
 * 词级/字符级 LCS 差分比对算法
 * @param {string} textA - 原文
 * @param {string} textB - 现文 (AI建议)
 * @returns {Array<{ type: 'equal' | 'delete' | 'insert', text: string }>}
 */
export function computeTokenDiff(textA, textB) {
  const tokensA = tokenizeText(textA);
  const tokensB = tokenizeText(textB);
  const n = tokensA.length;
  const m = tokensB.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = tokensA[i] === tokensB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && tokensA[i] === tokensB[j]) {
      ops.push({ type: 'equal', text: tokensA[i] });
      i++;
      j++;
    } else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) {
      ops.push({ type: 'delete', text: tokensA[i] });
      i++;
    } else {
      ops.push({ type: 'insert', text: tokensB[j] });
      j++;
    }
  }
  // 合并连续同类型操作
  const merged = [];
  for (const op of ops) {
    if (merged.length > 0 && merged[merged.length - 1].type === op.type) {
      merged[merged.length - 1].text += op.text;
    } else {
      merged.push({ ...op });
    }
  }
  return merged;
}

/**
 * LCS 对齐新旧签名数组，连续差异编为 hunk。
 * @returns {Array<{ o: number[], c: number[], cAnchor: number, key: string }>}
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
