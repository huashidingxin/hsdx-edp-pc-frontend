/**
 * app-editor-tiptap 的扩展集合
 *
 * 设计目标：
 * 1. 与项目解耦：不修改公共插件包（packages/effects/plugins），所有能力在本目录内实现，
 *    仅复用 VbenTiptap 的外壳（工具栏 / 预览 / 暗色 / 基础内容样式）。
 * 2. 覆盖常用富文本能力：标题(1-6)、粗体/斜体/下划线/删除线/行内代码、
 *    有序/无序列表、引用、代码块、链接、图片、文字颜色/背景色、字体、字号、行高、
 *    对齐、表格、高亮。
 * 3. 富文本「正常解析」与「带格式粘贴」：
 *    - 纯净原生节点：Section 与 Image 均保持原生 DOM 输出，严禁注入中间 NodeView wrapper div，
 *      彻底杜绝破坏 135/秀米素材中的 flex/float/定位/层级/尺寸（还原保真）。
 *    - PreserveAttributes 全局属性保留块级元素与标记上的 style/class。
 * 4. 粘贴保真（paste-preserve.js）：承接 135/秀米/公众号/Word 等来源的
 *    <section>/<div> 嵌套结构与行内装饰样式，并在解析前清洗来源垃圾。
 * 5. 编辑器桥接（EditorBridge）：向父级 index.vue 暴露 editor 实例，
 *    支撑单例悬浮工具条与 135 式交互（悬浮框显目标 section、单选排版块与图片）。
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
} from '@tiptap/extension-text-style';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';

import { PasteSanitizer, RichTextStyle, Section } from './paste-preserve';

// 需要保留 style / class 的节点类型（块级节点 + 行内标记）
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
  // 秀米/135 素材骨架容器
  'section',
  // 行内标记上的装饰样式（如 <strong style="color:...">）
  'bold',
  'italic',
  'underline',
  'strike',
];

/**
 * 保留块级节点上的 style / class，避免粘贴/回填时被 schema 裁剪。
 * 注意：text-align 已交由 TextAlign 扩展处理，这里在解析时剔除，避免重复渲染。
 */
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
                .replaceAll(/text-align\s*:[^;]+;?/gi, '')
                .replaceAll(/mso-[\w-]*\s*:[^;]+;?/gi, '')
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

/**
 * 图片节点：原生 <img> 渲染，保留 width / height 属性，
 * 配合 PreserveAttributes 的 style 一起保真还原粘贴图片的尺寸与层级。
 * 不挂载 NodeView wrapper，杜绝破坏原 HTML 的绝对定位、浮动与层级。
 */
const RichImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('width') || null,
        renderHTML: (attributes) =>
          attributes.width ? { width: attributes.width } : {},
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute('height') || null,
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
      console.error('[app-editor-tiptap] 图片上传失败:', error);
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

/**
 * 编辑器桥接扩展：向外传递 editor 实例
 */
function createEditorBridgeExtension(onEditorReady) {
  return Extension.create({
    name: 'editorBridge',
    onCreate() {
      if (typeof onEditorReady === 'function') {
        onEditorReady(this.editor);
      }
    },
  });
}

/**
 * 构建编辑器扩展集合
 * @param {object} options
 * @param {string} [options.placeholder] 占位提示
 * @param {(file: File) => Promise<string>} [options.upload] 图片上传函数，返回图片 URL
 * @param {(editor: object) => void} [options.onEditorReady] 编辑器初始化就绪回调
 */
export function createEditorExtensions(options = {}) {
  const { placeholder = '请输入内容...', upload, onEditorReady } = options;

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: false,
    }),
    Section,
    TextAlign.configure({
      types: ['heading', 'paragraph', 'section'],
    }),
    RichTextStyle,
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
    PasteSanitizer,
    createEditorBridgeExtension(onEditorReady),
  ];
}
