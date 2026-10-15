/**
 * CMS 多栏布局自研扩展（CMS Columns Extension）
 *
 * 结合 topo-io/tiptap-extensions 优势与本项目需求：
 * 1. 结构纯净与标准 HTML：columns 容器 + column 子节点，输出标准 <div>、class 与内联样式，杜绝 data-*。
 * 2. 内容保留机制 (keepContent)：插入分栏时若有选中内容或当前段落已有文字/图片，自动将其移入第 1 栏，防止覆盖丢失。
 * 3. 完美解包 (unsetColumns)：支持一键解包分栏，提取并平铺所有栏目的内部段落、图片、表格等，保留全部内容。
 * 4. 边界隔离与防非法嵌套：column 采用 isolating: true 与 selectable: false，回车/退格不破坏分栏骨架，禁止列内嵌套插入分栏。
 * 5. 比例自适应与拖拽调宽：列宽保存为无量纲 flex 权重（如 1:1、1:2、1:1:1），通过 ProseMirror 事务安全更新。
 * 6. 间隙宽度（gap）自定义：支持 0px / 8px / 16px / 24px / 32px 间隙设置。
 * 7. 内联基线 = 「一排 x 个」（perRow，1 或 2）：容器不带 display，列宽/浮动/内衬距全部内联——
 *    perRow=1 为块流堆叠；perRow=2 为浮动两列（列间距用对侧 padding 半距表达，刻意不用 flex
 *    gap）。无 CSS 环境（微信公众号图文、邮件客户端）下这份内联样式原样保真，是最兼容的保障；
 *    宽屏「N 栏一排」由 class（cms-columns--row1 / --row2 + 站点/导出样式里的
 *    min-width:769px 适配）承担，窄屏不覆盖、直接回落内联基线。
 * 8. 旧版内容（--stack/--keep + 内联 flex）原样 round-trip；被任一结构命令触碰时，
 *    按「stack→一排 1 个、keep→一排 2 个」整体迁移到新基线（class 与内联样式原子切换）。
 */
import { mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

// ---------------------------------------------------------------------------
// 1. 列宽与样式计算辅助函数
// ---------------------------------------------------------------------------

/**
 * 从内联 style 字符串中解析 flex-grow 权重
 * 例如: "flex: 2 1 0%; min-width: 0;" -> 2
 */
export function extractFlexWeight(styleStr) {
  if (!styleStr) return 1;
  const match = styleStr.match(/flex\s*:\s*([\d.]+)/i);
  if (match && match[1]) {
    const val = Number.parseFloat(match[1]);
    return Number.isNaN(val) || val <= 0 ? 1 : val;
  }
  const growMatch = styleStr.match(/flex-grow\s*:\s*([\d.]+)/i);
  if (growMatch && growMatch[1]) {
    const val = Number.parseFloat(growMatch[1]);
    return Number.isNaN(val) || val <= 0 ? 1 : val;
  }
  return 1;
}

/**
 * 间隙值取半（浮动两列的对侧内衬距）："16px" -> "8px"，"0px"/不可解析 -> ""
 */
export function halfGapValue(gap) {
  const match = String(gap ?? "").match(/^\s*([\d.]+)\s*(px|em|rem|pt|%)?\s*$/i);
  if (!match) return "";
  const value = Number.parseFloat(match[1]);
  if (Number.isNaN(value) || value <= 0) return "";
  const unit = match[2] || "px";
  return `${Math.round((value / 2) * 100) / 100}${unit}`;
}

/**
 * 构造单列标准内联样式（内联基线：一排 x 个）
 *
 * @param {number} flexWeight 该列 flex 权重（无量纲，常驻内联；容器被 class 适配为 flex 时生效）
 * @param {object} [options]
 * @param {1|2} [options.perRow] 每行栏数：1=块流堆叠，2=浮动两列
 * @param {number} [options.index] 该列在容器中的序号（0 起）
 * @param {number} [options.total] 总列数
 * @param {number[]} [options.weights] 各列权重数组（长度须等于 total）
 * @param {string} [options.gap] 间隙宽度
 */
export function buildColumnStyle(flexWeight = 1, options = {}) {
  const {
    perRow = 1,
    index = 0,
    total = 1,
    weights = null,
    gap = "16px",
  } = options;
  const normalized = Math.round(flexWeight * 100) / 100;
  const safeTotal = Math.max(1, total);
  // flex 权重常驻内联：容器被 class 适配为 flex（宽屏）时按比例分配；非 flex 环境下被忽略。
  let style = `box-sizing: border-box; min-width: 0; flex: ${normalized} 1 0%;`;

  if (perRow === 2) {
    const rowStart = Math.floor(index / 2) * 2;
    const rowCount = Math.min(2, Math.max(1, safeTotal - rowStart));
    const isLone = rowCount <= 1;
    const rowWeights =
      Array.isArray(weights) && weights.length === safeTotal
        ? weights.slice(rowStart, rowStart + rowCount)
        : Array.from({ length: rowCount }, () => 1);
    const rowSum =
      rowWeights.reduce((acc, w) => acc + (Number(w) || 1), 0) || rowCount;
    // 行内按权重比例分宽（整数百分比两位小数，总和 100）；落单的末列占满整行
    const widthPct = isLone
      ? 100
      : ((Number(rowWeights[index - rowStart]) || 1) / rowSum) * 100;
    style += ` float: left; width: ${Math.round(widthPct * 100) / 100}%;`;
    // 列间距 = 对侧内衬距各一半（box-sizing: border-box，宽度含内衬，总和恒 100%）
    if (!isLone) {
      const half = halfGapValue(gap);
      const isLeftOfPair = (index - rowStart) % 2 === 0;
      if (half) {
        style += isLeftOfPair ? ` padding-right: ${half};` : ` padding-left: ${half};`;
      }
    }
    // 行间距 = 非末行列的 margin-bottom（浮动布局按 margin 盒排后续行）
    const lastRowStart = Math.floor((safeTotal - 1) / 2) * 2;
    if (rowStart < lastRowStart && String(gap) !== "0px") {
      style += ` margin-bottom: ${gap};`;
    }
  } else {
    // 一排 1 个：块流自然堆叠，列间距 = 非首列的 margin-top
    style += " width: 100%;";
    if (index > 0 && String(gap) !== "0px") {
      style += ` margin-top: ${gap};`;
    }
  }
  return style;
}

/**
 * 构造多栏容器标准内联样式
 *
 * 容器刻意不带 display：内联基线（一排 x 个）自身就是完整布局，无 CSS 环境原样保真；
 * --cms-columns-gap 仅把间隙值透传给 class 层的 flex gap（无 CSS 环境静默忽略）。
 */
export function buildColumnsContainerStyle(gap = "16px", perRow = 1) {
  const gapValue = String(gap ?? "").trim() || "16px";
  return `margin: 16px 0; box-sizing: border-box; width: 100%; --cms-columns-gap: ${gapValue};${
    perRow === 2 ? " overflow: hidden;" : ""
  }`;
}

/** 首/末列内收（外边距）修饰类：仅作用于 .web-bleed 全宽块，使首列/末列
 *  外缘对齐内容列、另一侧继续出血；两列并排时即「内容列 + 单侧出血」效果。 */
export const INSET_START_CLASS = 'cms-columns--inset-start';
export const INSET_END_CLASS = 'cms-columns--inset-end';

/** 多栏各列等高铺满修饰类：以最高的列为基准，各列内容高度自动铺满 */
export const EQUAL_HEIGHT_CLASS = 'cms-columns--equal-height';

/** 新版多栏容器 class（perRow 语义标记，站点/导出样式据此适配宽屏） */
export function normalizeColumnsClass(perRow) {
  return `cms-columns cms-columns--row${perRow === 2 ? 2 : 1}`;
}

/**
 * 解析比例字符串为数值数组
 * 例如: "1:2" -> [1, 2], "1:1:1" -> [1, 1, 1]
 */
export function parseRatioString(ratioStr) {
  if (!ratioStr || typeof ratioStr !== "string") return [1, 1];
  const parts = ratioStr
    .split(":")
    .map((s) => Number.parseFloat(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0);
  return parts.length >= 2 ? parts : [1, 1];
}

// ---------------------------------------------------------------------------
// 2. ProseMirror 节点查找辅助函数
// ---------------------------------------------------------------------------

/**
 * 向上查找光标所属的 column 节点及其在父 columns 中的索引和绝对位置
 */
export function findActiveColumnInfo(state) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d -= 1) {
    const node = $from.node(d);
    if (node.type.name === "column") {
      const colPos = $from.before(d);
      const parentColumns = $from.node(d - 1);
      const columnsPos = $from.before(d - 1);
      const index = $from.index(d - 1);
      return {
        colNode: node,
        colPos,
        columnsNode: parentColumns,
        columnsPos,
        index,
        depth: d,
      };
    }
  }
  return null;
}

/**
 * 查找光标所属的 columns 容器节点（支持 NodeSelection 与光标深层嵌套查找）
 */
export function findActiveColumnsInfo(state) {
  const { selection } = state;
  if (selection.node && selection.node.type.name === "columns") {
    return {
      columnsNode: selection.node,
      columnsPos: selection.from,
      depth: selection.$from.depth,
    };
  }
  const { $from } = selection;
  for (let d = $from.depth; d > 0; d -= 1) {
    const node = $from.node(d);
    if (node && node.type.name === "columns") {
      return {
        columnsNode: node,
        columnsPos: $from.before(d),
        depth: d,
      };
    }
  }
  return null;
}

/**
 * 解析目标 columns 节点（支持传入明确 pos 或从当前 selection 自动推断）
 */
function resolveColumnsNodeAndPos(state, targetPos = null) {
  if (typeof targetPos === "number") {
    try {
      const node = state.doc.nodeAt(targetPos);
      if (node && node.type.name === "columns") {
        return { columnsNode: node, columnsPos: targetPos };
      }
    } catch {}
  }
  return findActiveColumnsInfo(state);
}

/**
 * 按容器属性（perRow/gap/权重）整体重建一个多栏块：容器 class + 内联样式与
 * 每一列的内联基线原子切换。凡改变结构/比例/间隙/每行栏数的命令都走这里，
 * 保证「class 与内联样式永不漂移」（旧版 flex 块被触碰即整体迁移到新基线）。
 *
 * @param {object} tr ProseMirror 事务
 * @param {number} columnsPos 容器位置
 * @param {object} columnsNode 容器节点（迁移前的 doc 节点）
 * @param {object} [overrides] 需覆盖的容器属性（如 { perRow: 2 } / { gap: "8px" }）
 * @param {number[]} [weightsOverride] 覆盖后的各列权重（改比例/拖拽时传入）
 */
function rebuildColumnsBlock(tr, columnsPos, columnsNode, overrides = {}, weightsOverride = null) {
  const attrs = { ...columnsNode.attrs, ...overrides };
  const perRow = attrs.perRow === 2 ? 2 : 1;
  const gap = attrs.gap || "16px";
  const total = columnsNode.childCount;
  const weights = [];
  for (let i = 0; i < total; i += 1) {
    const raw = weightsOverride ? weightsOverride[i] : columnsNode.child(i).attrs?.flex;
    const w = Number.parseFloat(raw);
    weights.push(Number.isNaN(w) || w <= 0 ? 1 : w);
  }

  const rawClass = attrs.class || columnsNode.attrs?.class || '';
  const hadBleed = rawClass.split(/\s+/).includes('web-bleed');
  const hadInsetStart = rawClass.split(/\s+/).includes(INSET_START_CLASS);
  const hadInsetEnd = rawClass.split(/\s+/).includes(INSET_END_CLASS);
  const hadEqualHeight = rawClass.split(/\s+/).includes(EQUAL_HEIGHT_CLASS);
  const baseClass = normalizeColumnsClass(perRow);
  const finalClass = [
    baseClass,
    hadBleed ? 'web-bleed' : '',
    hadInsetStart ? INSET_START_CLASS : '',
    hadInsetEnd ? INSET_END_CLASS : '',
    hadEqualHeight ? EQUAL_HEIGHT_CLASS : '',
  ]
    .filter(Boolean)
    .join(' ');

  tr.setNodeMarkup(columnsPos, null, {
    ...attrs,
    perRow,
    gap,
    class: finalClass,
    style: buildColumnsContainerStyle(gap, perRow),
  });

  let offset = columnsPos + 1;
  for (let i = 0; i < total; i += 1) {
    const col = columnsNode.child(i);
    tr.setNodeMarkup(offset, null, {
      ...col.attrs,
      flex: String(weights[i]),
      style: buildColumnStyle(weights[i], { perRow, index: i, total, weights, gap }),
    });
    offset += col.nodeSize;
  }
}

// ---------------------------------------------------------------------------
// 3. Columns（多栏容器）节点
// ---------------------------------------------------------------------------

export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column{2,}",
  defining: true,
  isolating: true,
  selectable: true,

  addAttributes() {
    return {
      // class 忠实 round-trip：旧版内容（--stack/--keep）原样保留渲染行为，
      // 被结构命令触碰时才由 rebuildColumnsBlock 原子切换为 --row1/--row2。
      class: {
        default: normalizeColumnsClass(1),
        parseHTML: (el) => el.getAttribute("class") || normalizeColumnsClass(1),
        renderHTML: (attrs) => ({
          class: attrs.class || normalizeColumnsClass(attrs.perRow === 2 ? 2 : 1),
        }),
      },
      // 每行栏数（内联基线口径）：1=堆叠，2=两两并排。旧版 --keep 视同 2、--stack/裸类视同 1。
      perRow: {
        default: 1,
        parseHTML: (el) => {
          if (el.classList?.contains("cms-columns--row2")) return 2;
          if (el.classList?.contains("cms-columns--keep")) return 2;
          return 1;
        },
        renderHTML: () => ({}),
      },
      // 容器内联样式为权威存储（解析时原样保留，旧版 flex 块因此不被静默改写）；
      // 结构命令统一经 rebuildColumnsBlock 重生成为当前基线。
      style: {
        default: buildColumnsContainerStyle("16px", 1),
        parseHTML: (el) => el.getAttribute("style") || buildColumnsContainerStyle("16px", 1),
        renderHTML: (attrs) => ({
          style: attrs.style || buildColumnsContainerStyle("16px", 1),
        }),
      },
      layout: {
        default: "1:1",
        parseHTML: (el) => {
          const cols = el.querySelectorAll(":scope > .cms-column");
          if (cols.length > 0) {
            const weights = Array.from(cols).map((col) =>
              extractFlexWeight(col.getAttribute("style")),
            );
            return weights.join(":");
          }
          return "1:1";
        },
        renderHTML: () => ({}),
      },
      gap: {
        default: "16px",
        parseHTML: (el) => {
          const style = el.getAttribute("style") || "";
          // 新版基线把间隙透传给 class 层的 var；旧版基线是直接的 gap 属性
          const varMatch = style.match(/--cms-columns-gap\s*:\s*([^;]+)/i);
          if (varMatch) return varMatch[1].trim();
          const match = style.match(/(?:^|[;{\s])gap\s*:\s*([^;]+)/i);
          return match ? match[1].trim() : "16px";
        },
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div.cms-columns",
        priority: 1000,
      },
      {
        tag: "div",
        priority: 600,
        getAttrs: (el) => {
          if (el.classList.contains("cms-columns")) return {};
          const style = el.getAttribute("style") || "";
          if (
            style.includes("display: flex") &&
            el.querySelector(":scope > .cms-column")
          ) {
            return {};
          }
          return false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      /**
       * 插入多栏布局
       */
      insertColumns:
        (options = {}) =>
        ({ tr, dispatch, state, editor }) => {
          const schema = state.schema || editor?.schema;
          if (!schema || !schema.nodes.columns || !schema.nodes.column) {
            return false;
          }

          // 1. 防非法嵌套：检查当前光标是否已在 column 内部
          const activeCol = findActiveColumnInfo(state);
          if (activeCol) {
            return false;
          }

          const {
            cols = 2,
            layout = "1:1",
            gap = "16px",
            perRow = 1,
            keepContent = true,
          } = options;
          const weights = parseRatioString(layout);
          const finalCols = Math.max(2, Math.min(6, cols || weights.length));
          // 列数多于比例项时按 1 补齐，layout 归一化为等长比例串
          const fullWeights = Array.from({ length: finalCols }, (_, i) => weights[i] ?? 1);
          const rowPerRow = perRow === 2 ? 2 : 1;

          const { selection } = state;
          let firstColContent = [];
          let replaceFrom = selection.from;
          let replaceTo = selection.to;

          if (keepContent) {
            if (!selection.empty) {
              const slice = selection.content();
              if (slice.content.childCount > 0) {
                const nodes = [];
                slice.content.forEach((n) => {
                  if (n.isInline) {
                    nodes.push(schema.nodes.paragraph.create(null, n));
                  } else {
                    nodes.push(n);
                  }
                });
                if (nodes.length > 0) {
                  firstColContent = nodes;
                }
              }
            } else {
              const $from = selection.$from;
              const parent = $from.parent;
              if (parent && parent.isBlock && parent.type.name === "paragraph") {
                if (parent.content.size > 0) {
                  firstColContent = [parent];
                  replaceFrom = $from.before();
                  replaceTo = $from.after();
                } else {
                  replaceFrom = $from.before();
                  replaceTo = $from.after();
                }
              }
            }
          }

          if (firstColContent.length === 0) {
            firstColContent = [schema.nodes.paragraph.create()];
          }

          const columnNodes = [];
          for (let i = 0; i < finalCols; i += 1) {
            const weight = fullWeights[i];
            const content = i === 0 ? firstColContent : [schema.nodes.paragraph.create()];
            columnNodes.push(
              schema.nodes.column.create(
                {
                  flex: String(weight),
                  style: buildColumnStyle(weight, {
                    perRow: rowPerRow,
                    index: i,
                    total: finalCols,
                    weights: fullWeights,
                    gap,
                  }),
                },
                content,
              ),
            );
          }

          const columnsNode = schema.nodes.columns.create(
            {
              layout: fullWeights.join(":"),
              gap,
              perRow: rowPerRow,
              class: normalizeColumnsClass(rowPerRow),
              style: buildColumnsContainerStyle(gap, rowPerRow),
            },
            columnNodes,
          );

          if (dispatch) {
            tr.replaceWith(replaceFrom, replaceTo, columnsNode);

            try {
              const insidePos = replaceFrom + 2;
              const safePos = Math.min(insidePos + 1, tr.doc.content.size);
              tr.setSelection(TextSelection.near(tr.doc.resolve(safePos)));
            } catch {}

            tr.scrollIntoView();
          }

          return true;
        },

      setColumns:
        (cols = 2, keepContent = true) =>
        ({ commands }) => {
          return commands.insertColumns({ cols, keepContent });
        },

      /**
       * 解包分栏布局：提取内部所有内容平铺到正文
       */
      unsetColumns:
        (targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;

          if (dispatch) {
            const innerNodes = [];
            for (let i = 0; i < columnsNode.childCount; i += 1) {
              const col = columnsNode.child(i);
              for (let j = 0; j < col.childCount; j += 1) {
                innerNodes.push(col.child(j));
              }
            }

            if (innerNodes.length === 0) {
              innerNodes.push(state.schema.nodes.paragraph.create());
            }

            tr.replaceWith(
              columnsPos,
              columnsPos + columnsNode.nodeSize,
              innerNodes,
            );
            tr.setSelection(TextSelection.near(tr.doc.resolve(columnsPos + 1)));
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 设置当前多栏各列比例（如 "1:1", "1:2", "2:1", "1:1:1" 等）
       */
      setColumnsLayout:
        (layoutStr, targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;
          const weights = parseRatioString(layoutStr);
          const fullWeights = Array.from(
            { length: columnsNode.childCount },
            (_, i) => weights[i] ?? 1,
          );

          if (dispatch) {
            rebuildColumnsBlock(
              tr,
              columnsPos,
              columnsNode,
              { layout: fullWeights.join(":") },
              fullWeights,
            );
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 设置多栏间隙宽度（gap）
       */
      setColumnsGap:
        (gap = "16px", targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;

          if (dispatch) {
            rebuildColumnsBlock(tr, columnsPos, columnsNode, { gap });
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 设置内联基线的每行栏数（perRow）：1=一排 1 个（堆叠），2=一排 2 个（两两并排）。
       * 作用于无 CSS 环境（公众号图文等）与窄屏；宽屏 N 栏一排由 class 适配，不受影响。
       */
      setColumnsPerRow:
        (perRow = 1, targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;

          if (dispatch) {
            rebuildColumnsBlock(tr, columnsPos, columnsNode, {
              perRow: perRow === 2 ? 2 : 1,
            });
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 切换当前多栏通栏全宽标记（.web-bleed）
       */
      toggleColumnsBleed:
        (targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;
          const currentClass = columnsNode.attrs?.class || '';
          const classList = currentClass.split(/\s+/).filter(Boolean);
          const hasBleed = classList.includes('web-bleed');
          const nextClassList = hasBleed
            ? classList.filter((c) => c !== 'web-bleed')
            : [...classList, 'web-bleed'];
          const nextClass = nextClassList.join(' ');

          if (dispatch) {
            tr.setNodeMarkup(columnsPos, null, {
              ...columnsNode.attrs,
              class: nextClass,
            });
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 切换首列/末列内收（外边距）标记：仅对 .web-bleed 全宽块有意义，
       * 使首列（start）或末列（end）外缘对齐内容列、另一侧继续出血。
       */
      toggleColumnsInset:
        (side = 'start', targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;
          const cls =
            side === 'end' ? INSET_END_CLASS : INSET_START_CLASS;
          const currentClass = columnsNode.attrs?.class || '';
          const classList = currentClass.split(/\s+/).filter(Boolean);
          const has = classList.includes(cls);
          const nextClassList = has
            ? classList.filter((c) => c !== cls)
            : [...classList, cls];
          const nextClass = nextClassList.join(' ');

          if (dispatch) {
            tr.setNodeMarkup(columnsPos, null, {
              ...columnsNode.attrs,
              class: nextClass,
            });
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 切换多栏等高铺满标记（.cms-columns--equal-height）：以最高的栏为基准，其他各栏内容自动铺满全高
       */
      toggleColumnsEqualHeight:
        (targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;
          const currentClass = columnsNode.attrs?.class || '';
          const classList = currentClass.split(/\s+/).filter(Boolean);
          const has = classList.includes(EQUAL_HEIGHT_CLASS);
          const nextClassList = has
            ? classList.filter((c) => c !== EQUAL_HEIGHT_CLASS)
            : [...classList, EQUAL_HEIGHT_CLASS];
          const nextClass = nextClassList.join(' ');

          if (dispatch) {
            tr.setNodeMarkup(columnsPos, null, {
              ...columnsNode.attrs,
              class: nextClass,
            });
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 快捷将所有栏重置为均等比例
       */
      resetColumnsEqual:
        (targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;

          if (dispatch) {
            const childCount = columnsNode.childCount;
            const equalWeights = Array.from({ length: childCount }, () => 1);
            rebuildColumnsBlock(
              tr,
              columnsPos,
              columnsNode,
              { layout: equalWeights.join(":") },
              equalWeights,
            );
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 在当前多栏中添加新列（默认在当前列后追加，自适应平分）
       */
      addColumn:
        (direction = "after", targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;
          if (columnsNode.childCount >= 6) {
            return false; // 最多 6 栏
          }

          let insertPos = columnsPos + columnsNode.nodeSize - 1;
          const colInfo = findActiveColumnInfo(state);
          if (colInfo && colInfo.columnsPos === columnsPos) {
            insertPos = direction === "before" ? colInfo.colPos : colInfo.colPos + colInfo.colNode.nodeSize;
          }

          if (dispatch) {
            const newCol = state.schema.nodes.column.create(
              {
                flex: "1",
                style: buildColumnStyle(1),
              },
              state.schema.nodes.paragraph.create(),
            );

            tr.insert(insertPos, newCol);
            // 栏数变了：行归属/比例/内衬距全部重算（临时样式即被覆盖）
            const freshNode = tr.doc.nodeAt(columnsPos);
            if (freshNode && freshNode.type.name === "columns") {
              rebuildColumnsBlock(tr, columnsPos, freshNode);
            }
            tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 删除指定索引或当前光标所在的列
       */
      deleteColumnAtIndex:
        (colIndex, targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;

          if (columnsNode.childCount <= 2) {
            // 只剩 2 列时，删除其中一列即解包另一列
            const remainIndex = colIndex === 0 ? 1 : 0;
            const remainCol = columnsNode.child(remainIndex);
            if (dispatch) {
              tr.replaceWith(
                columnsPos,
                columnsPos + columnsNode.nodeSize,
                remainCol.content,
              );
              tr.scrollIntoView();
            }
            return true;
          }

          if (dispatch) {
            let offset = columnsPos + 1;
            for (let i = 0; i < colIndex; i += 1) {
              offset += columnsNode.child(i).nodeSize;
            }
            const col = columnsNode.child(colIndex);
            tr.delete(offset, offset + col.nodeSize);
            const freshNode = tr.doc.nodeAt(columnsPos);
            if (freshNode && freshNode.type.name === "columns") {
              rebuildColumnsBlock(tr, columnsPos, freshNode);
            }
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 删除当前光标所在的列
       */
      deleteCurrentColumn:
        () =>
        ({ tr, dispatch, state, commands }) => {
          const colInfo = findActiveColumnInfo(state);
          if (!colInfo) return false;
          return commands.deleteColumnAtIndex(colInfo.index, colInfo.columnsPos);
        },

      /**
       * 左移当前列（与左侧兄弟列交换位置）
       */
      moveColumnLeft:
        (colIndex = null, targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;

          let idx = colIndex;
          if (typeof idx !== "number") {
            const colInfo = findActiveColumnInfo(state);
            if (!colInfo) return false;
            idx = colInfo.index;
          }

          if (idx <= 0 || idx >= columnsNode.childCount) return false;

          if (dispatch) {
            let prevColPos = columnsPos + 1;
            for (let i = 0; i < idx - 1; i += 1) {
              prevColPos += columnsNode.child(i).nodeSize;
            }
            const prevCol = columnsNode.child(idx - 1);
            const currentColPos = prevColPos + prevCol.nodeSize;
            const currentCol = columnsNode.child(idx);

            tr.delete(currentColPos, currentColPos + currentCol.nodeSize);
            tr.insert(prevColPos, currentCol);
            // 列序变了：行归属/比例/内衬距全部重算
            const freshNode = tr.doc.nodeAt(columnsPos);
            if (freshNode && freshNode.type.name === "columns") {
              rebuildColumnsBlock(tr, columnsPos, freshNode);
            }
            tr.setSelection(TextSelection.near(tr.doc.resolve(prevColPos + 1)));
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 右移当前列（与右侧兄弟列交换位置）
       */
      moveColumnRight:
        (colIndex = null, targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;

          let idx = colIndex;
          if (typeof idx !== "number") {
            const colInfo = findActiveColumnInfo(state);
            if (!colInfo) return false;
            idx = colInfo.index;
          }

          if (idx < 0 || idx >= columnsNode.childCount - 1) return false;

          if (dispatch) {
            let currentColPos = columnsPos + 1;
            for (let i = 0; i < idx; i += 1) {
              currentColPos += columnsNode.child(i).nodeSize;
            }
            const currentCol = columnsNode.child(idx);
            const nextCol = columnsNode.child(idx + 1);

            tr.delete(currentColPos, currentColPos + currentCol.nodeSize);
            // 删除后 next 前移 currentCol.nodeSize：目标边界（next 之后）在
            // 新文档中的位置（tr.insert 不做位置映射，不能用删除前算的原始 pos）
            const movedPos = currentColPos + nextCol.nodeSize;
            tr.insert(movedPos, currentCol);
            const freshNode = tr.doc.nodeAt(columnsPos);
            if (freshNode && freshNode.type.name === "columns") {
              rebuildColumnsBlock(tr, columnsPos, freshNode);
            }
            tr.setSelection(TextSelection.near(tr.doc.resolve(movedPos + 1)));
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 删除整个多栏容器
       */
      deleteColumns:
        (targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;

          if (dispatch) {
            tr.delete(columnsPos, columnsPos + columnsNode.nodeSize);
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 在当前多栏容器上方插入空行并自动聚焦
       */
      insertParagraphBeforeColumns:
        (targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsPos } = info;

          if (dispatch) {
            const p = state.schema.nodes.paragraph.create();
            tr.insert(columnsPos, p);
            tr.setSelection(TextSelection.near(tr.doc.resolve(columnsPos + 1)));
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 在当前多栏容器下方插入空行并自动聚焦
       */
      insertParagraphAfterColumns:
        (targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;
          const insertPos = columnsPos + columnsNode.nodeSize;

          if (dispatch) {
            const p = state.schema.nodes.paragraph.create();
            tr.insert(insertPos, p);
            tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
            tr.scrollIntoView();
          }

          return true;
        },
    };
  },
});

// ---------------------------------------------------------------------------
// 4. Column（单列子节点）节点
// ---------------------------------------------------------------------------

export const Column = Node.create({
  name: "column",
  content: "block+",
  defining: true,
  isolating: true,
  selectable: false,

  addAttributes() {
    return {
      class: {
        default: "cms-column",
        parseHTML: (el) => el.getAttribute("class") || "cms-column",
        renderHTML: () => ({ class: "cms-column" }),
      },
      flex: {
        default: "1",
        parseHTML: (el) => String(extractFlexWeight(el.getAttribute("style"))),
        renderHTML: () => ({}),
      },
      // 内联样式为权威存储：解析时原样保留（旧版 flex 块不被静默改写），
      // 结构命令经 rebuildColumnsBlock 重生成为当前基线（一排 x 个）。
      style: {
        default: buildColumnStyle(1),
        parseHTML: (el) => {
          const style = el.getAttribute("style") || "";
          const w = extractFlexWeight(style);
          return style || buildColumnStyle(w);
        },
        renderHTML: (attrs) => ({
          style: attrs.style || buildColumnStyle(Number.parseFloat(attrs.flex) || 1),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div.cms-column",
        priority: 1000,
      },
      {
        tag: "div",
        priority: 600,
        getAttrs: (el) => {
          if (el.classList.contains("cms-column")) return {};
          if (el.parentElement?.classList.contains("cms-columns")) {
            return {};
          }
          return false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes), 0];
  },
});

// ---------------------------------------------------------------------------
// 5. ProseMirror 插件：列间分割线（Gutter）鼠标拖拽调整列宽
// ---------------------------------------------------------------------------

function findColumnPosByDOM(view, domEl) {
  try {
    const pos = view.posAtDOM(domEl, 0);
    const $pos = view.state.doc.resolve(pos);
    for (let d = $pos.depth; d > 0; d -= 1) {
      if ($pos.node(d).type.name === "column") {
        return $pos.before(d);
      }
    }
  } catch {}
  return null;
}

export function createColumnsResizerPlugin() {
  let draggingState = null;
  let tooltipEl = null;

  function ensureTooltip() {
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "cms-columns-resize-tooltip";
      tooltipEl.style.cssText =
        "position: fixed; z-index: 10000; padding: 4px 8px; font-size: 11px; background: rgba(15, 23, 42, 0.9); color: #fff; border-radius: 4px; pointer-events: none; transform: translate(-50%, -100%); margin-top: -8px; font-family: monospace; display: none;";
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }

  function removeTooltip() {
    if (tooltipEl && tooltipEl.parentNode) {
      tooltipEl.parentNode.removeChild(tooltipEl);
      tooltipEl = null;
    }
  }

  return new Plugin({
    key: new PluginKey("cmsColumnsResizer"),
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          const target = event.target;
          if (!target || !(target instanceof HTMLElement)) return false;

          // 检测是否点击在两列之间的拖拽手柄区域
          const columnEl = target.closest(".cms-column");
          if (!columnEl || !columnEl.parentElement?.classList.contains("cms-columns")) {
            return false;
          }

          const columnsEl = columnEl.parentElement;
          const rect = columnEl.getBoundingClientRect();
          // 如果鼠标靠近当前列的右边缘 8px 以内，且当前列不是最后一列
          const isNearRightEdge =
            event.clientX >= rect.right - 8 && event.clientX <= rect.right + 8;
          const nextColumnEl = columnEl.nextElementSibling;

          if (!isNearRightEdge || !nextColumnEl || !nextColumnEl.classList.contains("cms-column")) {
            return false;
          }

          event.preventDefault();
          event.stopPropagation();

          const leftColPos = findColumnPosByDOM(view, columnEl);
          const rightColPos = findColumnPosByDOM(view, nextColumnEl);
          if (leftColPos === null || rightColPos === null) return false;

          const initialLeftRect = columnEl.getBoundingClientRect();
          const initialRightRect = nextColumnEl.getBoundingClientRect();
          const combinedWidth = initialLeftRect.width + initialRightRect.width;

          const leftWeight = extractFlexWeight(columnEl.getAttribute("style"));
          const rightWeight = extractFlexWeight(nextColumnEl.getAttribute("style"));
          const combinedWeight = leftWeight + rightWeight;

          const startX = event.clientX;
          const startLeftWidth = initialLeftRect.width;

          const tip = ensureTooltip();
          tip.style.display = "block";
          tip.style.left = `${event.clientX}px`;
          tip.style.top = `${event.clientY}px`;
          tip.textContent = `${Math.round((initialLeftRect.width / combinedWidth) * 100)}% : ${Math.round((initialRightRect.width / combinedWidth) * 100)}%`;

          draggingState = {
            view,
            columnsEl,
            columnEl,
            nextColumnEl,
            startX,
            startLeftWidth,
            combinedWidth,
            combinedWeight,
            leftColPos,
            rightColPos,
          };

          const onMouseMove = (moveEvent) => {
            if (!draggingState) return;
            const deltaX = moveEvent.clientX - draggingState.startX;
            const rawNewLeftWidth = draggingState.startLeftWidth + deltaX;

            // 限制每列最小占比 10%，避免列完全坍塌
            const minW = draggingState.combinedWidth * 0.1;
            const maxW = draggingState.combinedWidth * 0.9;
            const clampedLeftWidth = Math.max(minW, Math.min(maxW, rawNewLeftWidth));

            const leftRatio = clampedLeftWidth / draggingState.combinedWidth;
            const rightRatio = 1 - leftRatio;

            // 计算新的归一化 flex 权重
            const newLeftWeight = Math.round(draggingState.combinedWeight * leftRatio * 10) / 10;
            const newRightWeight = Math.round((draggingState.combinedWeight - newLeftWeight) * 10) / 10;

            draggingState.calculatedLeftWeight = Math.max(0.2, newLeftWeight);
            draggingState.calculatedRightWeight = Math.max(0.2, newRightWeight);

            // 更新浮层提示
            if (tip) {
              tip.style.left = `${moveEvent.clientX}px`;
              tip.style.top = `${moveEvent.clientY}px`;
              tip.textContent = `${Math.round(leftRatio * 100)}% : ${Math.round(rightRatio * 100)}%`;
            }
          };

          const onMouseUp = () => {
            if (tip) {
              tip.style.display = "none";
            }
            if (
              draggingState &&
              draggingState.calculatedLeftWeight &&
              draggingState.calculatedRightWeight
            ) {
              const {
                view: v,
                leftColPos: lPos,
                calculatedLeftWeight,
                calculatedRightWeight,
              } = draggingState;
              const tr = v.state.tr;

              const lNode = tr.doc.nodeAt(lPos);
              const rNode = tr.doc.nodeAt(draggingState.rightColPos);
              if (lNode && rNode) {
                // 左列位置必在容器内部：据此反解容器节点/位置与两列序号，
                // 经 rebuildColumnsBlock 原子重生（权重 + 全部列的内联基线）。
                try {
                  const $lp = tr.doc.resolve(lPos);
                  const columnsNode = $lp.parent;
                  if (columnsNode?.type.name === "columns") {
                    const columnsPos = $lp.before($lp.depth);
                    const leftIndex = $lp.indexAfter();
                    const total = columnsNode.childCount;
                    const weights = [];
                    for (let i = 0; i < total; i += 1) {
                      const w = Number.parseFloat(columnsNode.child(i).attrs?.flex);
                      weights.push(Number.isNaN(w) || w <= 0 ? 1 : w);
                    }
                    weights[leftIndex] = calculatedLeftWeight;
                    weights[leftIndex + 1] = calculatedRightWeight;

                    rebuildColumnsBlock(tr, columnsPos, columnsNode, {}, weights);
                    v.dispatch(tr);
                  }
                } catch {}
              }
            }

            draggingState = null;
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
          };

          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);

          return true;
        },
      },
    },
    destroy() {
      removeTooltip();
    },
  });
}
