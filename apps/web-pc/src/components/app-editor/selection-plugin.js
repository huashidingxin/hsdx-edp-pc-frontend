/**
 * 编辑器选中高亮插件（ProseMirror Decorations 机制）
 *
 * 背景：此前用 `el.classList.add/remove` 直接改 ProseMirror 管理的 DOM，
 * 会被 DOMObserver 判定为外部污染，下一拍经 updateState 重渲染还原——
 * 表现为“点击多栏/图片毫无反应：高亮类被秒删、存下的 el 指向游离节点、
 * 浮动工具条因 target 失联而隐藏”。官方正确做法是 Decorations：高亮由
 * 视图状态驱动，随每次渲染自动应用，不与 DOMObserver 打架。
 *
 * 状态：{ columnsPos, mediaPos, mediaType, tablePos, elementPos }
 * 经 tr.mapping 自动跟随文档变化；节点被删则自动落空（渲染时再按类型校验）。
 */
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const appEditorSelectionKey = new PluginKey('appEditorSelection');

export const MEDIA_SELECTED_CLASS = {
  image: 'app-editor-image--selected',
  video: 'app-editor-video--selected',
};

export const COLUMNS_SELECTED_CLASS = 'app-editor-columns--selected';

export const TABLE_SELECTED_CLASS = 'app-editor-table--selected';

/** 元素检查器选中（虚线描边，与容器实线区分） */
export const ELEMENT_SELECTED_CLASS = 'app-editor-element--selected';

function mapPos(mapping, pos) {
  if (typeof pos !== 'number') return null;
  try {
    const result = mapping.mapResult(pos);
    if (result.deleted) return null;
    return result.pos;
  } catch {
    return pos;
  }
}

export const selectionPlugin = new Plugin({
  key: appEditorSelectionKey,

  state: {
    init() {
      return {
        columnsPos: null,
        mediaPos: null,
        mediaType: null,
        tablePos: null,
        elementPos: null,
        spanFrom: null,
        spanTo: null,
      };
    },
    apply(tr, prev) {
      let next = {
        columnsPos: mapPos(tr.mapping, prev.columnsPos),
        mediaPos: mapPos(tr.mapping, prev.mediaPos),
        mediaType: prev.mediaType,
        tablePos: mapPos(tr.mapping, prev.tablePos),
        elementPos: mapPos(tr.mapping, prev.elementPos),
        spanFrom: mapPos(tr.mapping, prev.spanFrom),
        spanTo: mapPos(tr.mapping, prev.spanTo),
      };
      const meta = tr.getMeta(appEditorSelectionKey);
      if (meta) {
        if (meta.type === 'setColumns') {
          next.columnsPos = meta.pos;
        } else if (meta.type === 'clearColumns') {
          next.columnsPos = null;
        } else if (meta.type === 'setMedia') {
          next.mediaPos = meta.pos;
          next.mediaType = meta.mediaType;
        } else if (meta.type === 'clearMedia') {
          next.mediaPos = null;
          next.mediaType = null;
        } else if (meta.type === 'setTable') {
          next.tablePos = meta.pos;
        } else if (meta.type === 'clearTable') {
          next.tablePos = null;
        } else if (meta.type === 'setElement') {
          next.elementPos = meta.pos;
        } else if (meta.type === 'clearElement') {
          next.elementPos = null;
        } else if (meta.type === 'setSpan') {
          next.spanFrom = meta.from;
          next.spanTo = meta.to;
        } else if (meta.type === 'clearSpan') {
          next.spanFrom = null;
          next.spanTo = null;
        } else if (meta.type === 'clearAll') {
          next = {
            columnsPos: null,
            mediaPos: null,
            mediaType: null,
            tablePos: null,
            elementPos: null,
            spanFrom: null,
            spanTo: null,
          };
        }
      }
      return next;
    },
  },

  props: {
    decorations(state) {
      const sel = appEditorSelectionKey.getState(state);
      if (!sel) return DecorationSet.empty;
      const decos = [];
      try {
        if (typeof sel.columnsPos === 'number') {
          const node = state.doc.nodeAt(sel.columnsPos);
          if (node && node.type.name === 'columns') {
            decos.push(
              Decoration.node(sel.columnsPos, sel.columnsPos + node.nodeSize, {
                class: COLUMNS_SELECTED_CLASS,
              }),
            );
          }
        }
        if (typeof sel.mediaPos === 'number' && sel.mediaType) {
          const node = state.doc.nodeAt(sel.mediaPos);
          if (node && node.type.name === sel.mediaType) {
            const cls = MEDIA_SELECTED_CLASS[sel.mediaType];
            if (cls) {
              decos.push(
                Decoration.node(sel.mediaPos, sel.mediaPos + node.nodeSize, {
                  class: cls,
                }),
              );
            }
          }
        }
        if (typeof sel.tablePos === 'number') {
          const node = state.doc.nodeAt(sel.tablePos);
          if (node && node.type.name === 'table') {
            decos.push(
              Decoration.node(sel.tablePos, sel.tablePos + node.nodeSize, {
                class: TABLE_SELECTED_CLASS,
              }),
            );
          }
        }
        if (typeof sel.elementPos === 'number') {
          // 元素检查器：任意已存在的节点都可高亮（类型不限，doc 除外）
          let node = null;
          try {
            node = state.doc.nodeAt(sel.elementPos);
          } catch {
            node = null;
          }
          if (node && node.type.name !== 'doc') {
            decos.push(
              Decoration.node(sel.elementPos, sel.elementPos + node.nodeSize, {
                class: ELEMENT_SELECTED_CLASS,
              }),
            );
          }
        }
        if (typeof sel.spanFrom === 'number' && typeof sel.spanTo === 'number') {
          // 行内 span（textStyle mark）：行内 decoration 包住文本区间
          decos.push(
            Decoration.inline(sel.spanFrom, sel.spanTo, {
              class: ELEMENT_SELECTED_CLASS,
            }),
          );
        }
      } catch {
        /* 忽略，返回已收集的 decorations */
      }
      return decos.length > 0 ? DecorationSet.create(state.doc, decos) : DecorationSet.empty;
    },
  },
});

/** 读取当前高亮插件状态（无编辑器时返回 null） */
export function getSelectionPluginState(editor) {
  try {
    return appEditorSelectionKey.getState(editor.state) || null;
  } catch {
    return null;
  }
}

/** 高亮多栏容器（pos 必须为 columns 节点起始位置） */
export function dispatchColumnsSelected(editor, pos) {
  if (!editor || typeof pos !== 'number') return;
  editor.view.dispatch(editor.state.tr.setMeta(appEditorSelectionKey, { type: 'setColumns', pos }));
}

/** 高亮媒体节点 */
export function dispatchMediaSelected(editor, pos, mediaType) {
  if (!editor || typeof pos !== 'number') return;
  editor.view.dispatch(
    editor.state.tr.setMeta(appEditorSelectionKey, { type: 'setMedia', pos, mediaType }),
  );
}

/** 高亮表格容器（pos 必须为 table 节点起始位置） */
export function dispatchTableSelected(editor, pos) {
  if (!editor || typeof pos !== 'number') return;
  editor.view.dispatch(editor.state.tr.setMeta(appEditorSelectionKey, { type: 'setTable', pos }));
}

/** 高亮检查器目标元素（任意节点起始位置） */
export function dispatchElementSelected(editor, pos) {
  if (!editor || typeof pos !== 'number') return;
  editor.view.dispatch(editor.state.tr.setMeta(appEditorSelectionKey, { type: 'setElement', pos }));
}

/** 高亮行内 span（textStyle mark 区间 [from, to]） */
export function dispatchSpanSelected(editor, from, to) {
  if (!editor || typeof from !== 'number' || typeof to !== 'number') return;
  editor.view.dispatch(
    editor.state.tr.setMeta(appEditorSelectionKey, { type: 'setSpan', from, to }),
  );
}

/** 清除全部选中高亮 */
export function dispatchSelectionCleared(editor, scope = 'clearAll') {
  if (!editor) return;
  const type =
    scope === 'columns'
      ? 'clearColumns'
      : scope === 'media'
        ? 'clearMedia'
        : scope === 'table'
          ? 'clearTable'
          : scope === 'element'
            ? 'clearElement'
            : scope === 'span'
              ? 'clearSpan'
              : 'clearAll';
  editor.view.dispatch(editor.state.tr.setMeta(appEditorSelectionKey, { type }));
}
