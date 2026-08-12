/**
 * AppPrintTemplate 的扩展集合（基于 AppEditor 的基础扩展 + 表单插值占位符节点）
 *
 * 占位符节点 placeholderToken 渲染为：
 *   <abbr class="placeholder" data-key="{key}" title="{name}">{key}</abbr>
 * 与旧 CKEditor 占位符插件的输出保持一致，打印时按 .placeholder[data-key] 取字段即可。
 */
import { mergeAttributes, Node } from '@tiptap/core';
import Underline from '@tiptap/extension-underline';

import { createEditorExtensions } from '../AppEditor/extensions';

export const PlaceholderToken = Node.create({
  name: 'placeholderToken',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      key: { default: '' },
      name: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'abbr.placeholder' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'abbr',
      mergeAttributes(HTMLAttributes, {
        class: 'placeholder',
        'data-key': node.attrs.key,
        title: node.attrs.name,
      }),
      `{${node.attrs.key}}`,
    ];
  },

  addCommands() {
    return {
      insertPlaceholder:
        (attrs) =>
        ({ chain }) =>
          chain().insertContent({ type: this.name, attrs }).run(),
    };
  },
});

export function createPrintTemplateExtensions(options = {}) {
  const base = createEditorExtensions(options);
  return [...base, Underline, PlaceholderToken];
}
