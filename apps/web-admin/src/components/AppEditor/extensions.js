/**
 * app-editor 的扩展集合（web-admin，复用 web-pc 的同套实现）
 *
 * 设计目标：
 * 1. 与项目解耦：不修改公共插件包（packages/effects/plugins），所有能力在本目录内实现，
 *    仅复用 VbenTiptap 的外壳（工具栏 / 预览 / 暗色 / 基础内容样式）。
 * 2. 覆盖大多数常用富文本能力：标题(1-6)、粗体/斜体/下划线/删除线/行内代码、
 *    有序/无序列表、引用、代码块、链接、图片、文字颜色/背景色、字体、字号、行高、
 *    对齐、表格、高亮。
 * 3. 富文本「正常解析」与「带格式粘贴」。
 */
import { Extension } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import {
  BackgroundColor,
  Color,
  FontFamily,
  FontSize,
  LineHeight,
  TextStyle,
} from '@tiptap/extension-text-style';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';

// 需要保留 style / class 的块级节点类型
const PRESERVE_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'bulletList',
  'orderedList',
  'codeBlock',
  'image',
  'tableCell',
  'tableHeader',
];

const PreserveAttributes = Extension.create({
  name: 'preserveAttributes',
  addGlobalAttributes() {
    return [
      {
        types: PRESERVE_TYPES,
        attributes: {
          class: {
            default: null,
            parseHTML: (element) => element.getAttribute('class'),
            renderHTML: (attributes) =>
              attributes.class ? { class: attributes.class } : {},
          },
          style: {
            default: null,
            parseHTML: (element) => {
              const style = element.getAttribute('style');
              if (!style) return null;
              const cleaned = style
                .replace(/text-align\s*:[^;]+;?/gi, '')
                .trim();
              return cleaned || null;
            },
            renderHTML: (attributes) =>
              attributes.style ? { style: attributes.style } : {},
          },
        },
      },
    ];
  },
});

const RichImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('width') || element.style.width || null,
        renderHTML: (attributes) =>
          attributes.width ? { width: attributes.width } : {},
      },
      height: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('height') || element.style.height || null,
        renderHTML: (attributes) =>
          attributes.height ? { height: attributes.height } : {},
      },
    };
  },
});

function extractImageFiles(dataTransfer) {
  if (!dataTransfer) return [];
  const files = [];
  const items = dataTransfer.items;
  if (items && items.length > 0) {
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }
  if (files.length === 0 && dataTransfer.files?.length) {
    for (const file of dataTransfer.files) {
      if (file.type.startsWith('image/')) files.push(file);
    }
  }
  return files;
}

function insertUploadedImage(view, file, upload, pos) {
  Promise.resolve(upload(file))
    .then((url) => {
      if (!url || view.isDestroyed) return;
      const { schema } = view.state;
      const imageType = schema.nodes.image;
      if (!imageType) return;
      const node = imageType.create({ src: url });
      const insertPos = Math.min(pos, view.state.doc.content.size);
      view.dispatch(view.state.tr.insert(insertPos, node));
    })
    .catch((error) => {
      console.error('[app-editor] 图片上传失败:', error);
    });
}

function createImageUploadPlugin(upload) {
  return new Plugin({
    key: new PluginKey('appEditorImageUpload'),
    props: {
      handlePaste(view, event) {
        const html = event.clipboardData?.getData('text/html');
        if (html) return false;
        const files = extractImageFiles(event.clipboardData);
        if (files.length === 0) return false;
        event.preventDefault();
        const pos = view.state.selection.from;
        files.forEach((file) => insertUploadedImage(view, file, upload, pos));
        return true;
      },
      handleDrop(view, event) {
        const files = extractImageFiles(event.dataTransfer);
        if (files.length === 0) return false;
        event.preventDefault();
        const pos =
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
          view.state.selection.from;
        files.forEach((file) => insertUploadedImage(view, file, upload, pos));
        return true;
      },
    },
  });
}

function createImageUploadExtension(upload) {
  return Extension.create({
    name: 'imageUploadHandler',
    addProseMirrorPlugins() {
      return upload ? [createImageUploadPlugin(upload)] : [];
    },
  });
}

export function createEditorExtensions(options = {}) {
  const { placeholder = '请输入内容...', upload } = options;

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: false,
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    TextStyle,
    Color,
    BackgroundColor,
    FontFamily,
    FontSize,
    LineHeight,
    Highlight.configure({ multicolor: true }),
    Link.configure({
      autolink: true,
      defaultProtocol: 'https',
      openOnClick: false,
      protocols: ['mailto', { optionalSlashes: true, scheme: 'tel' }],
    }),
    TableKit.configure({
      table: { resizable: true },
    }),
    RichImage.configure({
      allowBase64: true,
      HTMLAttributes: { class: 'vben-tiptap__image' },
    }),
    PreserveAttributes,
    Placeholder.configure({ placeholder }),
    createImageUploadExtension(upload),
  ];
}
