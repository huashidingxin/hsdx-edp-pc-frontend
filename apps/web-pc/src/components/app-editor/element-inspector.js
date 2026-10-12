/**
 * 纯 state 空间解析检查器目标（无 DOM 时用，如程序化定位）。
 * NodeSelection 取其节点；原子块边界（hr/图片等）优先归属紧随原子；
 * 其余取光标所在最深 block（文本光标天然落块内）。
 * @returns {{ pos: number, node: object } | null}
 */
export function resolveElementFromSelection(state) {
  try {
    const { selection } = state;
    if (selection && selection.node) {
      return { pos: selection.from, node: selection.node };
    }
    const $from = selection.$from;
    const after = $from.nodeAfter;
    // 注意：文本节点按 isAtom 定义也算叶子，必须排除，只认非文本原子
    //（图片/视频/hr 等单节点元素；文本光标走下面的祖先链归属文本块）
    if (after && after.isAtom && !after.isText) {
      return { pos: $from.pos, node: after };
    }
    for (let d = $from.depth; d >= 0; d -= 1) {
      const node = $from.node(d);
      if (!node || node.type.name === 'doc') continue;
      if (node.isBlock || node.isAtom) {
        return { pos: $from.before(d), node };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * 通用元素检查器（devtools 式：点任意元素 → 高亮 + 面包屑 + 样式面板）
 *
 * 设计要点：
 * 1. 目标解析走 DOM 优先（TD/TH 点中本体选单元格、列/容器点中本体选容器），
 *    否则取点击处最深 block/atom；文本永远归属到其块级父级（行内 mark 归顶栏管）。
 * 2. 所有样式读写只碰 style 属性的受管键（margin/padding/背景/边框/圆角/对齐/显示），
 *    输出即内联，无 class、无 data-*，微信安全。
 * 3. 块操作（上下移/复制/删除/插行）只在同父级内做相邻交换或合法插入，
 *    单事务可撤销；删到只剩一个子节点时拒绝（保 schema 合法）。
 */
import { Fragment } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

/** 检查器受管样式键（重置时精确清除这些，不动其他声明） */
export const MANAGED_STYLE_KEYS = [
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'background-color',
  'background-image',
  'background-size',
  'background-repeat',
  'background-position',
  'border',
  'border-radius',
  'text-align',
  'display',
  'box-shadow',
  'opacity',
];

/**
 * 仅识别不编辑的键：filter / transform / overflow / position。
 * 这类多为粘贴进来的布局/特效写法，面板不提供改写控件（避免误伤），
 * 但识别它们才能让“有效果的父容器”被点中、高亮圆点与装饰上浮正常工作。
 * 实现见 hasMeaningfulDetectOnly（visible/static/none 等显式默认值不算）。
 */

/** 显示类型切换候选（子集，够用且安全） */
export const DISPLAY_OPTIONS = [
  { label: '默认', value: null },
  { label: '块级', value: 'block' },
  { label: '行内块', value: 'inline-block' },
  { label: '行内', value: 'inline' },
  { label: '隐藏', value: 'none' },
];

export function parseStyleDecls(style) {
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

export function stringifyStyleDecls(decls) {
  if (decls.length === 0) return null;
  return `${decls.map(([key, value]) => `${key}: ${value}`).join('; ')};`;
}

/**
 * 合并样式：updates 为 [key, value|null]（null 表示删除），
 * removeKeys 额外删除。返回 style 字符串或 null。
 */
export function mergeStyleDecls(style, updates = [], removeKeys = []) {
  const updateMap = new Map(updates);
  const removeSet = new Set(removeKeys);
  const decls = parseStyleDecls(style).filter(
    ([key]) => !updateMap.has(key) && !removeSet.has(key),
  );
  for (const [key, value] of updates) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      decls.push([key, String(value).trim()]);
    }
  }
  return stringifyStyleDecls(decls);
}

/** "16px" -> 16，其他 -> null（输入框回显用） */
export function parsePx(value) {
  if (value === null || value === undefined) return null;
  const m = String(value).trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  return m ? Number(m[1]) : null;
}

/** px 数值解析（overlay 用，非 px 一律按 0 计，不误导） */
function pxOrZero(value) {
  const m = String(value || '').trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  return m ? Math.max(0, Number(m[1])) : 0;
}

/**
 * 盒模型 overlay 矩形计算（纯函数，可单测）。
 * @param {{ left: number, top: number, width: number, height: number }} borderRect
 *   目标元素的 border-box（即 getBoundingClientRect）
 * @param {string} style 内联 style（margin/padding 含速写展开）
 * @returns {{ margin, padding, content } | null} 各层 { left, top, width, height }，
 *   rect 为空时返回 null（调用方隐藏 overlay）
 *
 * 图层语义（对齐浏览器 devtools 配色）：
 * - margin 层：border-box 向外扩 margin，全橙色；
 * - padding 层：border-box 本体，绿色（忽略 border 本身 0~1px 误差）；
 * - content 层：缩进 padding，蓝色。
 */
export function computeBoxOverlay(borderRect, style) {
  if (
    !borderRect ||
    !(borderRect.width > 0) ||
    !(borderRect.height > 0)
  ) {
    return null;
  }
  const margin = expandBoxSides(style, 'margin');
  const padding = expandBoxSides(style, 'padding');
  const mt = pxOrZero(margin.top);
  const mr = pxOrZero(margin.right);
  const mb = pxOrZero(margin.bottom);
  const ml = pxOrZero(margin.left);
  const pt = pxOrZero(padding.top);
  const pr = pxOrZero(padding.right);
  const pb = pxOrZero(padding.bottom);
  const pl = pxOrZero(padding.left);
  const { left, top, width, height } = borderRect;
  return {
    margin: {
      left: left - ml,
      top: top - mt,
      width: width + ml + mr,
      height: height + mt + mb,
    },
    padding: { left, top, width, height },
    content: {
      left: left + pl,
      top: top + pt,
      width: Math.max(0, width - pl - pr),
      height: Math.max(0, height - pt - pb),
    },
  };
}

/**
 * 盒模型速写展开：longhand 优先，其次解析 margin/padding 1~4 值速写。
 * @returns {{ top: string, right: string, bottom: string, left: string }} 原始值或 ''
 */
export function expandBoxSides(style, base) {
  const map = new Map(parseStyleDecls(style));
  const longhand = {
    top: map.get(`${base}-top`) || '',
    right: map.get(`${base}-right`) || '',
    bottom: map.get(`${base}-bottom`) || '',
    left: map.get(`${base}-left`) || '',
  };
  const shorthand = (map.get(base) || '').trim();
  if (!shorthand) return longhand;
  const parts = shorthand.split(/\s+/).filter(Boolean);
  let values = null;
  if (parts.length === 1) values = [parts[0], parts[0], parts[0], parts[0]];
  else if (parts.length === 2) values = [parts[0], parts[1], parts[0], parts[1]];
  else if (parts.length === 3) values = [parts[0], parts[1], parts[2], parts[1]];
  else if (parts.length >= 4) values = [parts[0], parts[1], parts[2], parts[3]];
  if (!values) return longhand;
  return {
    top: longhand.top || values[0],
    right: longhand.right || values[1],
    bottom: longhand.bottom || values[2],
    left: longhand.left || values[3],
  };
}

/** 节点是否有检查器受管样式（面包屑圆点用，含速写本体） */
/** 仅识别键中有实际意义的值（visible/static/none 这类显式默认值不算） */
function hasMeaningfulDetectOnly(style) {
  const map = new Map(parseStyleDecls(style));
  const overflow = (map.get('overflow') || '').trim().toLowerCase();
  if (overflow && overflow !== 'visible') return true;
  const position = (map.get('position') || '').trim().toLowerCase();
  if (position && position !== 'static') return true;
  const filter = (map.get('filter') || '').trim().toLowerCase();
  if (filter && filter !== 'none') return true;
  const transform = (map.get('transform') || '').trim().toLowerCase();
  if (transform && transform !== 'none') return true;
  return false;
}

export function hasManagedStyles(style) {
  const keys = new Set(parseStyleDecls(style).map(([key]) => key));
  if (MANAGED_STYLE_KEYS.some((k) => keys.has(k))) return true;
  if (['margin', 'padding', 'background', 'border'].some((k) => keys.has(k))) return true;
  // 仅识别键：有特效也值得圆点提示（面板暂不提供改写）
  return hasMeaningfulDetectOnly(style);
}

/**
 * 上浮触发键（装饰子集）：只有这些样式才值得把选中自动上浮到祖先。
 * 刻意排除 display（flex 容器本身透明，避免 flex 布局被吞）和 text-align
 *（居中容器若触发，内部点击将永远到不了段落）。margin/padding/背景/
 * 边框/圆角才是“有点东西、值得进面板”的信号。
 */
const FLOAT_TRIGGER_KEYS = [
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'background-color',
  'background-image',
  'background-size',
  'background-repeat',
  'background-position',
  'border',
  'border-radius',
  'box-shadow',
  'opacity',
];

export function hasFloatTriggerStyles(style) {
  const keys = new Set(parseStyleDecls(style).map(([key]) => key));
  if (FLOAT_TRIGGER_KEYS.some((k) => keys.has(k))) return true;
  // 速写本体（margin/padding/background/border）同样视为装饰信号
  if (['margin', 'padding', 'background', 'border'].some((k) => keys.has(k))) return true;
  // 仅识别键：有效果的容器值得被点中（面板暂不改写它们）
  return hasMeaningfulDetectOnly(style);
}

/**
 * 装饰上浮：自身无触发样式时，向最近的带触发样式的祖先上浮。
 * - 自身有则留守（精确点击优先）；
 * - 中间 plain 节点透明穿过（个数不限，单子/多子不影响结论）；
 * - 遇到 doc 即停；找不到则原样返回（调用方保持原目标）。
 * 幂等：已上浮的目标再次调用返回自身。
 */
/**
 * 装饰上浮：向最近的带触发样式的祖先上浮。
 *
 * 规则（谨慎评估后）：
 * 1. 非叶子文本块（容器/格子/列等）若自身有触发样式，直接留守；
 * 2. 叶子文本块（paragraph/heading）永不锚定——它们的 margin/text-align
 *    多为粘贴重置样式，若锚定则上浮永不触发；要调文字本身点面包屑第一项；
 * 3. 中间 plain 节点透明穿过（个数/单多子不限）；
 * 4. display（flex 正在此列）与 text-align 不在触发键内——flex 容器透明、
 *    居中容器不吞内部点击；遇到 doc 即停，找不到原样返回。
 * 5. columns / table / tableRow 结构容器对上浮透明（直接穿过，
 *    即使它们带 margin）：它们有专属卡片与高亮，要调它们点容器留白或面包屑；
 *    上浮的目标是“装饰层”（section/格子/列等），不是结构层。
 * 幂等：已上浮的目标再次调用返回自身.
 */
export function floatToStyledAncestor(doc, pos, node) {
  if (!doc || !node || typeof pos !== 'number') return { pos, node };
  try {
    const isLeafText = node.type.name === 'paragraph' || node.type.name === 'heading';
    if (!isLeafText && hasFloatTriggerStyles(node.attrs?.style)) return { pos, node };
    const $pos = doc.resolve(pos);
    for (let up = $pos.depth; up >= 0; up -= 1) {
      const parent = $pos.node(up);
      if (!parent || parent.type.name === 'doc') break;
      // 自身起点跳过（叶子文本不锚定；非叶子已在入口判定过）
      if ($pos.before(up) === pos) continue;
      // 结构容器透明穿过（专属卡片负责它们）
      if (parent.type.name === 'columns' || parent.type.name === 'table' || parent.type.name === 'tableRow') {
        continue;
      }
      if (!parent.attrs || !('style' in parent.attrs)) continue;
      if (hasFloatTriggerStyles(parent.attrs.style)) {
        return { pos: $pos.before(up), node: parent };
      }
    }
  } catch {
    /* 忽略 */
  }
  return { pos, node };
}

const FRIENDLY_NAMES = {
  paragraph: '段落',
  heading: '标题',
  blockquote: '引用',
  bulletList: '无序列表',
  orderedList: '有序列表',
  listItem: '列表项',
  taskList: '待办清单',
  taskItem: '待办项',
  codeBlock: '代码块',
  horizontalRule: '分割线',
  image: '图片',
  video: '视频',
  table: '表格',
  tableRow: '表格行',
  tableCell: '单元格',
  tableHeader: '表头格',
  columns: '多栏布局',
  column: '分栏列',
  section: '版块',
  details: '折叠块',
  detailsSummary: '折叠标题',
  detailsContent: '折叠内容',
  mention: '站内链接',
  emoji: '表情',
};

/** 元素友好名（标题带级别，多栏带栏数） */
export function friendlyNodeName(node) {
  if (!node) return '未知';
  if (node.type.name === 'heading') return `标题 H${node.attrs.level || 1}`;
  if (node.type.name === 'columns') return `多栏布局（${node.childCount} 栏）`;
  if (node.type.name === 'table') {
    let rows = 0;
    let cols = 0;
    node.forEach((row) => {
      rows += 1;
      let c = 0;
      row.forEach(() => {
        c += 1;
      });
      cols = Math.max(cols, c);
    });
    if (rows > 0) return `表格（${rows}×${cols}）`;
    return '表格';
  }
  return FRIENDLY_NAMES[node.type.name] || node.type.name;
}

/** 是否文本块（对齐控件可用性） */
export function isAlignableNode(node) {
  if (!node) return false;
  return Boolean(node.isTextblock);
}

function domOf(view, pos) {
  try {
    return view.nodeDOM(pos) || null;
  } catch {
    return null;
  }
}

/**
 * 解析检查器目标。
 * @returns {{ pos: number, node: object, el: HTMLElement|null } | null}
 */
export function resolveInspectorTarget(view, target, finders = {}) {
  if (!view || !target || typeof target.closest !== 'function') return null;
  const { findImageNodeAndPos, findVideoNodeAndPos, findColumnsNodeAndPos, findTableNodeAndPos } = finders;

  try {
    const tag = target.tagName;
    // 图片 / 视频：交给各自查找器（与媒体卡共享定位精度）
    if (tag === 'IMG' && typeof findImageNodeAndPos === 'function') {
      const found = findImageNodeAndPos(view, target);
      if (found) return { pos: found.pos, node: found.node, el: target };
    }
    if (tag === 'VIDEO' && typeof findVideoNodeAndPos === 'function') {
      const found = findVideoNodeAndPos(view, target);
      if (found) return { pos: found.pos, node: found.node, el: target };
    }
    // TD/TH 本体：单元格
    if ((tag === 'TD' || tag === 'TH') && typeof view.posAtDOM === 'function') {
      try {
        const pos = view.posAtDOM(target, 0);
        const $pos = view.state.doc.resolve(pos);
        for (let d = $pos.depth; d >= 0; d -= 1) {
          const node = $pos.node(d);
          if (node && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) {
            return { pos: $pos.before(d), node, el: target };
          }
        }
      } catch {}
    }
    // 列 / 多栏 / 表格容器本体（点中留白处）：直接定位容器
    if (target.classList?.contains('cms-column')) {
      const columnsEl = target.parentElement?.closest?.('.cms-columns');
      const cols = columnsEl ? Array.from(columnsEl.querySelectorAll(':scope > .cms-column')) : [];
      const index = cols.indexOf(target);
      if (columnsEl && index >= 0 && typeof findColumnsNodeAndPos === 'function') {
        const found = findColumnsNodeAndPos(view, columnsEl);
        if (found) {
          let offset = found.pos + 1;
          for (let i = 0; i < index && i < found.node.childCount; i += 1) {
            offset += found.node.child(i).nodeSize;
          }
          const colNode = found.node.child(index);
          if (colNode) return { pos: offset, node: colNode, el: target };
        }
      }
    }
    if (target.classList?.contains('cms-columns') && typeof findColumnsNodeAndPos === 'function') {
      const found = findColumnsNodeAndPos(view, target);
      if (found) return { pos: found.pos, node: found.node, el: target };
    }
    if (target.tagName === 'TABLE' && typeof findTableNodeAndPos === 'function') {
      const found = findTableNodeAndPos(view, target);
      if (found) return { pos: found.pos, node: found.node, el: target };
    }

    // 通用：点击处最深 block / atom（文本归属块级父级）。
    // 注意顶层原子节点（hr/顶层图片等）：祖先链上只有 doc，必须先看相邻原子；
    // 但相邻原子只在“点中的就是它本体时”才算——wrapper 留白处点出的相邻图片
    // 不能劫持（否则带效果的父容器永远选不中）。
    const pos = view.posAtDOM(target, 0);
    const $pos = view.state.doc.resolve(pos);
    const nearAfter = $pos.nodeAfter;
    if (nearAfter && nearAfter.isAtom && !nearAfter.isText) {
      const atomDom = domOf(view, $pos.pos);
      if (atomDom && (atomDom === target || atomDom.contains(target))) {
        return { pos: $pos.pos, node: nearAfter, el: atomDom };
      }
    }
    const nearBefore = $pos.nodeBefore;
    if (nearBefore && nearBefore.isAtom && !nearBefore.isText) {
      const beforePos = $pos.pos - nearBefore.nodeSize;
      const atomDom = domOf(view, beforePos);
      if (atomDom && (atomDom === target || atomDom.contains(target))) {
        return { pos: beforePos, node: nearBefore, el: atomDom };
      }
    }
    for (let d = $pos.depth; d >= 0; d -= 1) {
      const node = $pos.node(d);
      if (!node || node.type.name === 'doc') continue;
      if (node.isBlock || node.isAtom) {
        const nodePos = $pos.before(d);
        // 装饰上浮：自身 plain 且祖先有装饰样式时，自动提级到最近的装饰祖先
        //（DOM 直击分支——图片/单元格/列/容器——不受影响，保持精确）
        const floated = floatToStyledAncestor(view.state.doc, nodePos, node);
        const finalPos = floated.pos;
        const finalNode = floated.node;
        const origin =
          finalPos !== nodePos ? { pos: nodePos, node } : null;
        return {
          pos: finalPos,
          node: finalNode,
          el: domOf(view, finalPos) || target,
          origin,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * 面包屑（原始链）：目标位置的块级祖先链（由近及远，最多 6 级）。
 * 注意 resolve() 在嵌套起始边界会取浅层（如 cell 内容起点与段落起点重合时
 * 只能看到 cell），因此若紧随其后就是一个文本块，优先把它作为链首。
 * 每项附带 hasManaged（该节点是否有检查器受管样式，用于圆点提示）。
 * @returns {Array<{ pos: number, label: string, hasManaged: boolean }>}
 */
export function ancestorChain(doc, pos) {
  const chain = [];
  try {
    const $pos = doc.resolve(pos);
    const after = $pos.nodeAfter;
    if (after && after.isTextblock) {
      chain.push({
        pos: $pos.pos,
        label: friendlyNodeName(after),
        hasManaged: hasManagedStyles(after.attrs?.style),
      });
    }
    for (let d = $pos.depth; d >= 0 && chain.length < 7; d -= 1) {
      const node = $pos.node(d);
      if (!node || node.type.name === 'doc') continue;
      if (node.isBlock || node.isAtom) {
        chain.push({
          pos: $pos.before(d),
          label: friendlyNodeName(node),
          hasManaged: hasManagedStyles(node.attrs?.style),
        });
      }
    }
  } catch {
    /* 忽略 */
  }
  return chain.slice(0, 6);
}

/**
 * 检查器面包屑链：[上浮来源?, 当前, ...严格上层祖先]。
 * 上浮后原来点的节点靠 origin 回切，没有上浮时 origin 为空。
 */
export function buildCrumbChain(doc, pos, node, origin = null) {
  const chain = [];
  const seen = new Set();
  const push = (p, n) => {
    if (!n || n.type.name === 'doc') return;
    const key = `${n.type.name}@${p}`;
    if (seen.has(key)) return;
    seen.add(key);
    chain.push({ pos: p, label: friendlyNodeName(n), hasManaged: hasManagedStyles(n.attrs?.style) });
  };
  if (origin && origin.node && origin.pos !== pos) {
    push(origin.pos, origin.node);
  }
  push(pos, node);
  try {
    const $pos = doc.resolve(pos);
    for (let d = $pos.depth; d >= 0 && chain.length < 7; d -= 1) {
      const n = $pos.node(d);
      if (!n || n.type.name === 'doc') continue;
      // 自身已在首项（同一引用同一位置）则跳过；重合起点但不同节点照收
      if ($pos.before(d) === pos && n === node) continue;
      if (n.isBlock || n.isAtom) push($pos.before(d), n);
    }
  } catch {
    /* 忽略 */
  }
  return chain.slice(0, 6);
}

// ---------------------------------------------------------------------------
// 块操作（同父级内合法变换，单事务可撤销）
// ---------------------------------------------------------------------------

function resolveLiveNode(editor, pos) {
  try {
    const node = editor.state.doc.nodeAt(pos);
    return node || null;
  } catch {
    return null;
  }
}

/** 子节点起始偏移（相对父内容起点） */
function childOffset(parent, index) {
  let off = 0;
  for (let i = 0; i < index && i < parent.childCount; i += 1) {
    off += parent.child(i).nodeSize;
  }
  return off;
}

/** 假设在 index 处插入 node，父内容是否仍合法 */
function canInsertAt(parent, index, node) {
  try {
    const off = childOffset(parent, index) + parent.child(index).nodeSize;
    const next = parent.content.cut(0, off).append(Fragment.from(node)).append(parent.content.cut(off));
    return parent.type.validContent(next);
  } catch {
    return false;
  }
}

/** 假设删除 index 处子节点，父内容是否仍合法 */
function canDeleteAt(parent, index) {
  try {
    const off = childOffset(parent, index);
    const next = parent.content
      .cut(0, off)
      .append(parent.content.cut(off + parent.child(index).nodeSize));
    return parent.type.validContent(next);
  } catch {
    return false;
  }
}

/**
 * 上移/下移：与同父级相邻兄弟交换（同级重排恒合法）。
 * @returns {{ ok: boolean, newPos?: number, reason?: string }}
 */
export function moveElement(editor, pos, direction = -1) {
  if (!editor) return { ok: false };
  const node = resolveLiveNode(editor, pos);
  if (!node) return { ok: false, reason: '目标已不存在，请重新点击' };
  let parent = null;
  let index = -1;
  try {
    const $pos = editor.state.doc.resolve(pos);
    parent = $pos.parent;
    index = $pos.index();
  } catch {
    return { ok: false };
  }
  const targetIndex = direction < 0 ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= parent.childCount) {
    return { ok: false, reason: direction < 0 ? '已经是第一个块' : '已经是最后一个块' };
  }
  try {
    const tr = editor.state.tr;
    const size = node.nodeSize;
    if (direction < 0) {
      const prevNode = parent.child(index - 1);
      const prevPos = pos - prevNode.nodeSize;
      tr.delete(pos, pos + size);
      tr.insert(prevPos, node);
      tr.setSelection(TextSelection.near(tr.doc.resolve(prevPos + 1)));
      editor.view.dispatch(tr);
      return { ok: true, newPos: prevPos };
    }
    const nextNode = parent.child(index + 1);
    const targetPos = pos + nextNode.nodeSize;
    tr.delete(pos, pos + size);
    tr.insert(targetPos, node);
    tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos + 1)));
    editor.view.dispatch(tr);
    return { ok: true, newPos: targetPos };
  } catch {
    return { ok: false };
  }
}

/** 复制：在当前位置之后追加同节点（父内容校验通过才执行） */
export function duplicateElement(editor, pos) {
  if (!editor) return { ok: false };
  const node = resolveLiveNode(editor, pos);
  if (!node) return { ok: false, reason: '目标已不存在，请重新点击' };
  try {
    const $pos = editor.state.doc.resolve(pos);
    const parent = $pos.parent;
    const index = $pos.index();
    if (!canInsertAt(parent, index, node)) {
      return { ok: false, reason: '当前位置不支持复制' };
    }
    const tr = editor.state.tr;
    const insertPos = pos + node.nodeSize;
    tr.insert(insertPos, node);
    tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
    editor.view.dispatch(tr);
    return { ok: true, newPos: insertPos };
  } catch {
    return { ok: false, reason: '当前位置不支持复制' };
  }
}

/**
 * 删除：父内容删除后仍合法才执行（自动保护 column/单元格等单子节点容器）。
 */
export function deleteElement(editor, pos) {
  if (!editor) return { ok: false };
  const node = resolveLiveNode(editor, pos);
  if (!node) return { ok: false, reason: '目标已不存在，请重新点击' };
  try {
    const $pos = editor.state.doc.resolve(pos);
    const parent = $pos.parent;
    const index = $pos.index();
    if (!canDeleteAt(parent, index)) {
      return { ok: false, reason: '至少保留一个块，不能删除' };
    }
    const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
    editor.view.dispatch(tr);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * 前后插空行：仅当父级容得下段落时执行。
 */
export function insertParagraphBeside(editor, pos, direction = 1) {
  if (!editor) return { ok: false };
  const node = resolveLiveNode(editor, pos);
  if (!node) return { ok: false, reason: '目标已不存在，请重新点击' };
  try {
    const schema = editor.schema;
    const p = schema.nodes.paragraph.create();
    const $pos = editor.state.doc.resolve(pos);
    const parent = $pos.parent;
    const index = $pos.index();
    const off = direction < 0 ? childOffset(parent, index) : childOffset(parent, index) + node.nodeSize;
    const next = parent.content.cut(0, off).append(Fragment.from(p)).append(parent.content.cut(off));
    if (!parent.type.validContent(next)) {
      return { ok: false, reason: '当前位置不支持插入空行' };
    }
    const insertPos = direction < 0 ? pos : pos + node.nodeSize;
    const tr = editor.state.tr.insert(insertPos, p);
    tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
    editor.view.dispatch(tr);
    editor.view.focus();
    return { ok: true };
  } catch {
    return { ok: false, reason: '当前位置不支持插入空行' };
  }
}
