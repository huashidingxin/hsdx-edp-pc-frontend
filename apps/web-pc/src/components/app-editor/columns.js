/**
 * CMS 多栏布局自研扩展（CMS Columns Extension）
 *
 * 结合 topo-io/tiptap-extensions 优势与本项目需求：
 * 1. 结构纯净与标准 HTML：columns 容器 + column 子节点，输出标准 <div>、class 与内联样式，杜绝 data-*。
 * 2. 内容保留机制 (keepContent)：插入分栏时若有选中内容或当前段落已有文字/图片，自动将其移入第 1 栏，防止覆盖丢失。
 * 3. 完美解包 (unsetColumns)：支持一键解包分栏，提取并平铺所有栏目的内部段落、图片、表格等，保留全部内容。
 * 4. 边界隔离与防非法嵌套：column 采用 isolating: true 与 selectable: false，回车/退格不破坏分栏骨架，禁止列内嵌套插入分栏。
 * 5. 比例自适应与拖拽调宽：列宽保存为无量纲 flex 权重（如 1:1、1:2、1:1:1），通过 ProseMirror 事务安全更新。
 * 6. 间隙宽度（gap）自定义：支持 0px / 8px / 16px / 24px / 32px 间隙设置，内联 style 存储。
 * 7. 移动端 768px 自适应方案：支持“自动堆叠 (cms-columns--stack)”与“保持并排 (cms-columns--keep)”一键切换。
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
 * 构造单列标准内联样式
 */
export function buildColumnStyle(flexWeight = 1) {
  const normalized = Math.round(flexWeight * 100) / 100;
  return `flex: ${normalized} 1 0%; min-width: 0; box-sizing: border-box;`;
}

/**
 * 构造多栏容器标准内联样式
 */
export function buildColumnsContainerStyle(gap = "16px") {
  return `display: flex; gap: ${gap}; margin: 16px 0; box-sizing: border-box; width: 100%;`;
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
      class: {
        default: "cms-columns cms-columns--stack",
        parseHTML: (el) => el.getAttribute("class") || "cms-columns cms-columns--stack",
        renderHTML: (attrs) => {
          const mode = attrs.responsive === "keep" ? "cms-columns--keep" : "cms-columns--stack";
          return { class: `cms-columns ${mode}` };
        },
      },
      style: {
        default: buildColumnsContainerStyle("16px"),
        parseHTML: (el) => el.getAttribute("style") || buildColumnsContainerStyle("16px"),
        renderHTML: (attrs) => ({
          style: buildColumnsContainerStyle(attrs.gap || "16px"),
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
          const match = el.getAttribute("style")?.match(/gap\s*:\s*([^;]+)/i);
          return match ? match[1].trim() : "16px";
        },
        renderHTML: () => ({}),
      },
      responsive: {
        default: "stack",
        parseHTML: (el) => {
          if (el.classList.contains("cms-columns--keep")) return "keep";
          return "stack";
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
            responsive = "stack",
            keepContent = true,
          } = options;
          const weights = parseRatioString(layout);
          const finalCols = Math.max(2, Math.min(6, cols || weights.length));

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
            const weight = weights[i] !== undefined ? weights[i] : 1;
            const content = i === 0 ? firstColContent : [schema.nodes.paragraph.create()];
            columnNodes.push(
              schema.nodes.column.create(
                {
                  flex: String(weight),
                  style: buildColumnStyle(weight),
                },
                content,
              ),
            );
          }

          const columnsNode = schema.nodes.columns.create(
            {
              layout,
              gap,
              responsive,
              class: `cms-columns cms-columns--${responsive}`,
              style: buildColumnsContainerStyle(gap),
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

          if (dispatch) {
            let childOffset = columnsPos + 1;
            const childCount = columnsNode.childCount;

            for (let i = 0; i < childCount; i += 1) {
              const col = columnsNode.child(i);
              const w = weights[i] !== undefined ? weights[i] : 1;
              const newStyle = buildColumnStyle(w);
              tr.setNodeMarkup(childOffset, null, {
                ...col.attrs,
                flex: String(w),
                style: newStyle,
              });
              childOffset += col.nodeSize;
            }

            tr.setNodeMarkup(columnsPos, null, {
              ...columnsNode.attrs,
              layout: layoutStr,
            });
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
            tr.setNodeMarkup(columnsPos, null, {
              ...columnsNode.attrs,
              gap,
              style: buildColumnsContainerStyle(gap),
            });
            tr.scrollIntoView();
          }

          return true;
        },

      /**
       * 设置移动端自适应方案（768px 分界："stack" 自动堆叠 vs "keep" 保持并排）
       */
      setColumnsResponsive:
        (mode = "stack", targetPos = null) =>
        ({ tr, dispatch, state }) => {
          const info = resolveColumnsNodeAndPos(state, targetPos);
          if (!info) return false;
          const { columnsNode, columnsPos } = info;

          const validMode = mode === "keep" ? "keep" : "stack";
          const newClass = `cms-columns cms-columns--${validMode}`;

          if (dispatch) {
            tr.setNodeMarkup(columnsPos, null, {
              ...columnsNode.attrs,
              responsive: validMode,
              class: newClass,
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
            let childOffset = columnsPos + 1;
            const childCount = columnsNode.childCount;
            const equalLayout = Array(childCount).fill(1).join(":");

            for (let i = 0; i < childCount; i += 1) {
              const col = columnsNode.child(i);
              tr.setNodeMarkup(childOffset, null, {
                ...col.attrs,
                flex: "1",
                style: buildColumnStyle(1),
              });
              childOffset += col.nodeSize;
            }

            tr.setNodeMarkup(columnsPos, null, {
              ...columnsNode.attrs,
              layout: equalLayout,
            });
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
            const targetInsertPos = currentColPos + nextCol.nodeSize;

            tr.delete(currentColPos, currentColPos + currentCol.nodeSize);
            tr.insert(targetInsertPos, currentCol);
            tr.setSelection(TextSelection.near(tr.doc.resolve(targetInsertPos + 1)));
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
      style: {
        default: buildColumnStyle(1),
        parseHTML: (el) => {
          const style = el.getAttribute("style") || "";
          const w = extractFlexWeight(style);
          return buildColumnStyle(w);
        },
        renderHTML: (attrs) => {
          const w = Number.parseFloat(attrs.flex) || 1;
          return { style: attrs.style || buildColumnStyle(w) };
        },
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
              const { view: v, leftColPos, rightColPos, calculatedLeftWeight, calculatedRightWeight } = draggingState;
              const tr = v.state.tr;

              const lNode = tr.doc.nodeAt(leftColPos);
              const rNode = tr.doc.nodeAt(rightColPos);

              if (lNode && rNode) {
                tr.setNodeMarkup(leftColPos, null, {
                  ...lNode.attrs,
                  flex: String(calculatedLeftWeight),
                  style: buildColumnStyle(calculatedLeftWeight),
                });
                tr.setNodeMarkup(rightColPos, null, {
                  ...rNode.attrs,
                  flex: String(calculatedRightWeight),
                  style: buildColumnStyle(calculatedRightWeight),
                });
                v.dispatch(tr);
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
