/**
 * app-editor-tiptap 的扩展集合
 *
 * 设计目标：
 * 1. 与项目解耦：不修改公共插件包（packages/effects/plugins），所有能力在本目录内实现，
 *    仅复用 VbenTiptap 的外壳（工具栏 / 预览 / 暗色 / 基础内容样式）。
 * 2. 覆盖大多数常用富文本能力：标题(1-6)、粗体/斜体/下划线/删除线/行内代码、
 *    有序/无序列表、引用、代码块、链接、图片、文字颜色/背景色、字体、字号、行高、
 *    对齐、表格、高亮。
 * 3. 富文本「正常解析」与「带格式粘贴」：
 *    - 通过注册结构化节点（表格）与行内样式标记（颜色/背景/字体/字号/行高），
 *      让粘贴/回填的 HTML 不被裁剪。
 *    - 通过 PreserveAttributes 全局属性保留块级元素上的 style/class，
 *      尽量逼近 CKEditor GeneralHtmlSupport 的「无损」表现。
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

/**
 * 图片节点：在默认 Image 基础上保留 width / height，
 * 配合 PreserveAttributes 的 style 一起，能还原粘贴图片的尺寸。
 */
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
      console.error('[app-editor-tiptap] 图片上传失败:', error);
    });
}

/**
 * 图片上传插件：处理「粘贴原始图片数据」与「拖拽图片文件」。
 * 关键点：当剪贴板包含 text/html 时一律放行，保证「带格式粘贴」不被打断，
 * 仅在没有 HTML（如截图、纯图片数据）时才走上传。
 */
function createImageUploadPlugin(upload) {
  return new Plugin({
    key: new PluginKey('appEditorImageUpload'),
    props: {
      handlePaste(view, event) {
        // 含 HTML 的内容交给默认的带格式粘贴流程
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
 * 构建编辑器扩展集合
 * @param {object} options
 * @param {string} [options.placeholder] 占位提示
 * @param {(file: File) => Promise<string>} [options.upload] 图片上传函数，返回图片 URL
 */
export function createEditorExtensions(options = {}) {
  const { placeholder = '请输入内容...', upload } = options;

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      // 关闭 StarterKit 内置 Link，使用下方自定义配置
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
