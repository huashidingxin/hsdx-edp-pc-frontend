/**
 * Slash `/` 快捷插入菜单（行首触发，避免干扰正文中的 `/` 如“和/或”）
 *
 * 命令表 SLASH_COMMANDS 单独导出以便单测；run 接收 { editor, range }，
 * 先删触发区再执行插入。图片/视频走 onOpenMedia 回调（媒体库由 index.vue 承接）。
 */
import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';

import { createPopupRenderer } from './suggestion-popup';

export const slashPluginKey = new PluginKey('appEditorSlash');

/**
 * @param {{ editor: object, range: object, onOpenMedia?: (type: 'image'|'video') => void }} ctx
 */
function deleteTrigger(ctx) {
  ctx.editor.chain().focus().deleteRange(ctx.range).run();
}

export const SLASH_COMMANDS = [
  {
    id: 'paragraph',
    title: '正文',
    hint: '纯文本段落',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    id: 'h1',
    title: '一级标题',
    hint: 'H1',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    },
  },
  {
    id: 'h2',
    title: '二级标题',
    hint: 'H2',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
  },
  {
    id: 'h3',
    title: '三级标题',
    hint: 'H3',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    },
  },
  {
    id: 'bulletList',
    title: '无序列表',
    hint: '- 列表',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: 'orderedList',
    title: '有序列表',
    hint: '1. 列表',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: 'taskList',
    title: '待办清单',
    hint: '复选框',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor.chain().focus().toggleTaskList().run();
    },
  },
  {
    id: 'blockquote',
    title: '引用',
    hint: '摘要/强调',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    id: 'codeBlock',
    title: '代码块',
    hint: '```',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
  {
    id: 'details',
    title: '折叠块',
    hint: '问答/收起',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor.chain().focus().setDetails().run();
    },
  },
  {
    id: 'image',
    title: '图片',
    hint: '媒体库/上传',
    run: ({ editor, range, onOpenMedia }) => {
      deleteTrigger({ editor, range });
      if (typeof onOpenMedia === 'function') onOpenMedia('image');
    },
  },
  {
    id: 'video',
    title: '视频',
    hint: '媒体库/上传',
    run: ({ editor, range, onOpenMedia }) => {
      deleteTrigger({ editor, range });
      if (typeof onOpenMedia === 'function') onOpenMedia('video');
    },
  },
  {
    id: 'table',
    title: '表格',
    hint: '3×3',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    id: 'columns2',
    title: '两栏布局',
    hint: '1:1',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor.chain().focus().insertColumns({ cols: 2, layout: '1:1', keepContent: true }).run();
    },
  },
  {
    id: 'columns3',
    title: '三栏布局',
    hint: '1:1:1',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor.chain().focus().insertColumns({ cols: 3, layout: '1:1:1', keepContent: true }).run();
    },
  },
  {
    id: 'hr',
    title: '分割线',
    hint: '---',
    run: ({ editor, range }) => {
      deleteTrigger({ editor, range });
      editor.chain().focus().setHorizontalRule().run();
    },
  },
];

function filterCommands(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(q) ||
      (cmd.hint || '').toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q),
  );
}

/**
 * @param {{ onOpenMedia?: (type: 'image'|'video') => void }} options
 */
export function createSlashExtension(options = {}) {
  const { onOpenMedia } = options;
  return Extension.create({
    name: 'appEditorSlash',
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '/',
          pluginKey: slashPluginKey,
          startOfLine: true,
          command: ({ editor, range, props }) => {
            if (props && typeof props.run === 'function') {
              props.run({ editor, range, onOpenMedia });
            }
          },
          items: ({ query }) => filterCommands(query),
          render: () =>
            createPopupRenderer({
              formatItem: (item) => ({ title: item.title, hint: item.hint }),
              emptyText: '无匹配命令',
            }),
        }),
      ];
    },
  });
}
