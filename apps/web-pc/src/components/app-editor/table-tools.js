/**
 * 表格增强工具（自研，零 schema 改动）
 *
 * 1. duplicateRow / duplicateColumn：复制当前行列。只处理 1x1 单元格，
 *    遇到合并单元格拒绝执行并返回 false（由调用方 toast 提示），
 *    避免制造 rowspan/colspan 交叠的非法表格；单事务，可撤销。
 * 2. setCellBackground：把底色并入单元格现有 style（style 属性已全局保留，
 *    输出即内联，微信安全），不新增任何属性。
 * 3. getTableDimensions：行列数统计（Dock 徽标用）。
 */
import { Extension } from '@tiptap/core';
import { CellSelection, TableMap } from '@tiptap/pm/tables';

function parseStyleDecls(style) {
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

function stringifyStyleDecls(decls) {
  if (decls.length === 0) return null;
  return `${decls.map(([key, value]) => `${key}: ${value}`).join('; ')};`;
}

/**
 * 合并底色到现有 style：保留其他声明；color 为空则清除；
 * 顺手去掉无 url() 的 background 速写，避免与 background-color 打架。
 */
export function mergeCellBackground(style, color) {
  const decls = parseStyleDecls(style).filter(([key, value]) => {
    if (key === 'background-color') return false;
    if (key === 'background' && !/url\(/i.test(value)) return false;
    return true;
  });
  if (color) decls.push(['background-color', color]);
  return stringifyStyleDecls(decls);
}

function isSimpleCell(node) {
  return (
    (node.type.name === 'tableCell' || node.type.name === 'tableHeader') &&
    node.attrs.colspan === 1 &&
    node.attrs.rowspan === 1
  );
}

/**
 * 收集本次要作用的单元格：CellSelection（多格拖选）取矩形内全部格子，
 * 否则取光标所在单个格。返回 [{ pos, node }]（pos 为绝对位置）。
 */
export function collectTargetCells(state) {
  const { selection } = state;
  if (selection instanceof CellSelection) {
    try {
      const $anchorCell = selection.$anchorCell;
      const $headCell = selection.$headCell;
      const table = $anchorCell.node(-1);
      const map = TableMap.get(table);
      const tableStart = $anchorCell.start(-1);
      const rect = map.rectBetween(
        $anchorCell.pos - tableStart,
        $headCell.pos - tableStart,
      );
      const seen = new Set();
      const cells = [];
      map.cellsInRect(rect).forEach((off) => {
        if (seen.has(off)) return;
        seen.add(off);
        // cellsInRect 按惯例排除 head 格，这里要全量，补回
        cells.push(off);
      });
      const headOff = $headCell.pos - tableStart;
      if (!seen.has(headOff)) cells.push(headOff);
      return cells
        .map((off) => {
          const absPos = off + tableStart;
          const node = state.doc.nodeAt(absPos);
          if (!node || (node.type.name !== 'tableCell' && node.type.name !== 'tableHeader')) {
            return null;
          }
          return { pos: absPos, node };
        })
        .filter(Boolean);
    } catch {
      /* 掉入单格逻辑 */
    }
  }
  const ctx = resolveTableContext(state);
  if (!ctx) return [];
  return [{ pos: ctx.cellPos, node: ctx.cellNode }];
}
/**
 * 从光标向上找表格三级结构：cell -> row -> table。
 * @returns {{ cellPos, cellNode, rowPos, rowNode, tablePos, tableNode } | null}
 */
export function resolveTableContext(state) {
  const { $from } = state.selection;
  let cellPos = null;
  let cellNode = null;
  let rowPos = null;
  let rowNode = null;
  let tablePos = null;
  let tableNode = null;
  for (let d = $from.depth; d > 0; d -= 1) {
    const node = $from.node(d);
    if (!cellNode && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) {
      cellNode = node;
      cellPos = $from.before(d);
    } else if (!rowNode && node.type.name === 'tableRow') {
      rowNode = node;
      rowPos = $from.before(d);
    } else if (!tableNode && node.type.name === 'table') {
      tableNode = node;
      tablePos = $from.before(d);
      break;
    }
  }
  if (cellPos === null || rowPos === null || tablePos === null) return null;
  return { cellPos, cellNode, rowPos, rowNode, tablePos, tableNode };
}

export function getTableDimensions(tableNode) {
  if (!tableNode || tableNode.type.name !== 'table') return { rows: 0, cols: 0 };
  try {
    const map = TableMap.get(tableNode);
    return { rows: map.height, cols: map.width };
  } catch {
    return { rows: tableNode.childCount, cols: 0 };
  }
}

export const TableTools = Extension.create({
  name: 'appEditorTableTools',

  addCommands() {
    return {
      /**
       * 复制光标所在整行（含内容），追加到该行之后。
       * 含合并单元格的行拒绝执行（返回 false）。
       */
      duplicateRow:
        () =>
        ({ tr, state, dispatch }) => {
          const ctx = resolveTableContext(state);
          if (!ctx) return false;
          for (let i = 0; i < ctx.rowNode.childCount; i += 1) {
            if (!isSimpleCell(ctx.rowNode.child(i))) return false;
          }
          if (dispatch) {
            tr.insert(ctx.rowPos + ctx.rowNode.nodeSize, ctx.rowNode);
            tr.scrollIntoView();
          }
          return true;
        },

      /**
       * 复制光标所在整列（含内容），追加到该列之后。
       * 该列含合并单元格时拒绝执行（返回 false）。
       */
      duplicateColumn:
        () =>
        ({ tr, state, dispatch }) => {
          const ctx = resolveTableContext(state);
          if (!ctx) return false;
          let map = null;
          try {
            map = TableMap.get(ctx.tableNode);
          } catch {
            return false;
          }
          const col = map.findCell(ctx.cellPos - ctx.tablePos - 1).left;
          // 逐行找覆盖该列的单元格；凡涉及合并一律拒绝
          const copies = [];
          const seen = new Set();
          for (let r = 0; r < map.height; r += 1) {
            for (let c = 0; c < map.width; c += 1) {
              const off = map.map[r * map.width + c];
              if (seen.has(off)) continue;
              let rect = null;
              try {
                rect = map.findCell(off);
              } catch {
                return false;
              }
              if (rect.left <= col && col < rect.right) {
                seen.add(off);
                const absPos = off + ctx.tablePos + 1;
                const cellNode = tr.doc.nodeAt(absPos);
                if (!cellNode || !isSimpleCell(cellNode)) return false;
                copies.push({ absPos, cellNode });
                break;
              }
            }
          }
          if (copies.length === 0) return false;
          if (dispatch) {
            copies
              .toSorted((a, b) => b.absPos - a.absPos)
              .forEach(({ absPos, cellNode }) => {
                tr.insert(absPos + cellNode.nodeSize, cellNode);
              });
            tr.scrollIntoView();
          }
          return true;
        },

      /**
       * 设置光标所在单元格底色（color 为空则清除），输出为内联 style。
       * 多格拖选（CellSelection）时统一作用于矩形内全部格子。
       */
      setCellBackground:
        (color = null) =>
        ({ tr, state, dispatch }) => {
          const cells = collectTargetCells(state);
          if (cells.length === 0) return false;
          let count = 0;
          cells.forEach(({ pos, node }) => {
            const next = mergeCellBackground(node.attrs.style, color);
            if ((next || null) !== (node.attrs.style || null)) {
              tr.setNodeMarkup(pos, null, { ...node.attrs, style: next });
              count += 1;
            }
          });
          if (count === 0) return false;
          if (dispatch) tr.scrollIntoView();
          return true;
        },
    };
  },
});
