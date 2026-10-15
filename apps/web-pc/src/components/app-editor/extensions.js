/**
 * Tiptap 扩展注册中心（针对公众号/135/秀米保真场景深度定制）
 *
 * 核心设计原则：
 * 1. 严格遵守与公共插件解耦铁律，全部在 web-pc 内部闭环。
 * 2. 覆盖常用富文本排版能力：撤销/重做、清除格式、字号、行高、字体、基础格式（粗/斜/下划/删除/上下标/代码）、
 *    文字颜色与背景高亮、段落标题、对齐、列表、引用、代码块、分割线、表格套件、超链接、
 *    图片（选择上传/外链）、视频（选择上传/外链）。
 * 3. 富文本「正常解析」与「带格式粘贴」：
 *    - 纯净原生节点：Section、Image 与 Video 均保持原生 DOM 输出，严禁注入中间 NodeView wrapper div，
 *      彻底杜绝破坏 135/秀米素材中的 flex/float/定位/层级/尺寸（还原保真）。
 *    - PreserveAttributes 全局属性保留块级元素与标记上的 style/class。
 * 4. 粘贴保真（paste-preserve.js）：承接 135/秀米/公众号/Word 等来源的
 *    <section>/<div> 嵌套结构与行内装饰样式，并在解析前清洗来源垃圾。
 * 5. 编辑器桥接（EditorBridge）：向父级 index.vue 暴露 editor 实例，
 *    支撑独立增强排版工具栏、单例悬浮工具条与 135 式交互。
 */
import { Extension, Mark, mergeAttributes, Node } from '@tiptap/core';
import { CharacterCount } from '@tiptap/extension-character-count';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { Emoji } from '@tiptap/extension-emoji';
import { FileHandler } from '@tiptap/extension-file-handler';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
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

import {
  Figcaption,
  Figure,
  PasteSanitizer,
  RichTextStyle,
  Section,
} from './paste-preserve';
import { aiDiffPlugin } from './ai-diff-plugin';
import { Column, Columns, createColumnsResizerPlugin } from './columns';
import { findPlugin } from './find-plugin';
import { createAppMentionExtension } from './mention';
import { selectionPlugin } from './selection-plugin';
import { createSlashExtension } from './slash-menu';
import { TableTools } from './table-tools';
import { TextIndent } from './text-indent';

// 需要保留 style / class 的节点类型（块级节点 + 行内标记）
// 元素检查器可对以下类型写内联样式（margin/padding/背景/边框/圆角等）
const PRESERVE_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'bulletList',
  'orderedList',
  'taskList',
  'taskItem',
  'codeBlock',
  'horizontalRule',
  'image',
  'video',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'details',
  'detailsSummary',
  'detailsContent',
  // CMS 多栏布局容器与单列
  'columns',
  'column',
  // 秀米/135 素材骨架容器
  'section',
  // 原生配图容器与图注
  'figure',
  'figcaption',
  // 行内标记上的装饰样式（如 <strong style="color:...">）
  'bold',
  'italic',
  'underline',
  'strike',
  'subscript',
  'superscript',
];

/**
 * 保留块级节点与标记上的 style / class，避免粘贴/回填时被 schema 裁剪。
 * 注意：text-align 已交由 TextAlign 扩展处理，这里在解析时剔除，避免重复渲染。
 */
export const PreserveAttributes = Extension.create({
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
 * 上标标记
 */
export const Superscript = Mark.create({
  name: 'superscript',
  parseHTML() {
    return [
      { tag: 'sup' },
      {
        style: 'vertical-align',
        consuming: false,
        getAttrs: (value) => (value === 'super' ? {} : false),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setSuperscript: () => ({ commands }) => commands.setMark(this.name),
      toggleSuperscript: () => ({ commands }) => commands.toggleMark(this.name),
      unsetSuperscript: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
  addKeyboardShortcuts() {
    return {
      'Mod-.': () => this.editor.commands.toggleSuperscript(),
    };
  },
});

/**
 * 下标标记
 */
export const Subscript = Mark.create({
  name: 'subscript',
  parseHTML() {
    return [
      { tag: 'sub' },
      {
        style: 'vertical-align',
        consuming: false,
        getAttrs: (value) => (value === 'sub' ? {} : false),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['sub', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setSubscript: () => ({ commands }) => commands.setMark(this.name),
      toggleSubscript: () => ({ commands }) => commands.toggleMark(this.name),
      unsetSubscript: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
  addKeyboardShortcuts() {
    return {
      'Mod-,': () => this.editor.commands.toggleSubscript(),
    };
  },
});

/**
 * 超链接：默认行为上，仅在解析时对站内Mention 让路。
 * Mention 输出原生 `<a class="edp-mention">`，其节点规则与 Link mark
 * 都会命中 `<a>`；parser 按 schema 顺序取首条，Link 在前会吞掉 Mention。
 * 这里用 extend（注意：parseHTML 是扩展字段，configure 传参无效）
 * 让 Link 遇到 edp-mention 返回 false，把解析权还给 Mention 节点。
 */
const AppLink = Link.extend({
  parseHTML() {
    return [
      {
        tag: 'a[href]',
        getAttrs: (el) => {
          if (el.classList && el.classList.contains('edp-mention')) return false;
          return null;
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
export const RichImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      referrerpolicy: {
        default: 'no-referrer',
        parseHTML: (element) => element.getAttribute('referrerpolicy') || 'no-referrer',
        renderHTML: (attributes) => ({
          referrerpolicy: attributes.referrerpolicy || 'no-referrer',
        }),
      },
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
      // 最高兼容：图片输出自带 max-width: 100%，在无 class / 无外部 CSS
      // 的终端（如微信公众号）窄屏下不溢出。已有 max-width 则保持原样。
      // 注意：与 PreserveAttributes 的全局 style 同名，类型自身定义优先。
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attributes) => {
          const raw = attributes.style || '';
          if (/max-width\s*:/i.test(raw)) return { style: raw };
          const sep = raw && !/;\s*$/.test(raw) ? '; ' : '';
          return { style: `${raw}${sep}max-width: 100%;` };
        },
      },
    };
  },
});

/**
 * 原生原生视频节点：基于 HTML5 原生 <video controls> 标签，纯净输出，
 * 绝不注入 NodeView wrapper，确保保真与跨端兼容。
 */
export const Video = Node.create({
  name: 'video',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      referrerpolicy: {
        default: 'no-referrer',
        parseHTML: (element) => element.getAttribute('referrerpolicy') || 'no-referrer',
        renderHTML: (attributes) => ({
          referrerpolicy: attributes.referrerpolicy || 'no-referrer',
        }),
      },
      src: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('src') ||
          element.querySelector('source')?.getAttribute('src') ||
          null,
        renderHTML: (attributes) =>
          attributes.src ? { src: attributes.src } : {},
      },
      poster: {
        default: null,
        parseHTML: (element) => element.getAttribute('poster') || null,
        renderHTML: (attributes) =>
          attributes.poster ? { poster: attributes.poster } : {},
      },
      controls: {
        default: true,
        parseHTML: (element) => element.hasAttribute('controls'),
        renderHTML: (attributes) =>
          attributes.controls ? { controls: 'true' } : {},
      },
      width: {
        default: '100%',
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
      style: {
        default: 'max-width: 100%; border-radius: 8px; margin: 12px auto; display: block;',
        parseHTML: (element) => element.getAttribute('style') || null,
        renderHTML: (attributes) =>
          attributes.style ? { style: attributes.style } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'video',
        getAttrs: (element) => {
          const src =
            element.getAttribute('src') ||
            element.querySelector('source')?.getAttribute('src');
          if (!src) return false;
          return {
            src,
            poster: element.getAttribute('poster') || null,
            controls: element.hasAttribute('controls'),
            width: element.getAttribute('width') || null,
            height: element.getAttribute('height') || null,
            style: element.getAttribute('style') || null,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['video', mergeAttributes({ controls: 'true', referrerpolicy: 'no-referrer' }, HTMLAttributes)];
  },

  addCommands() {
    return {
      setVideo:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});

/**
 * 原生 SVG 块级节点：承接微信公众号 / 135 / 秀米等复杂 SVG 动画排版与矢量图形
 * （包含嵌套 svg, foreignObject, animateTransform, g, path 等），
 * 原汁原味纯净输出，不挂载任何包装层，避免破坏原有的定位、动画与层级。
 */
export const SvgBlock = Node.create({
  name: 'svgBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      rawHtml: {
        default: '',
        parseHTML: (element) => element.outerHTML,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'svg',
        getAttrs: (element) => {
          // 若属于嵌套在另一个 svg 内部的子 svg（如 foreignObject 内部包裹的轮播子图），
          // 仅由最外层顶层 svgBlock 统一包裹管理，防止被拆分为多个碎节点
          if (element.parentElement?.closest('svg')) {
            return false;
          }
          return {
            rawHtml: element.outerHTML,
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    if (typeof document !== 'undefined' && node.attrs.rawHtml) {
      const container = document.createElement('div');
      container.innerHTML = node.attrs.rawHtml;
      const svgEl = container.firstElementChild;
      if (svgEl) {
        return svgEl;
      }
    }
    return ['svg', { 'data-raw': node.attrs.rawHtml || '' }];
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
      // 仅处理纯文件粘贴（含截图）；拖拽投放交由官方 FileHandler，
      // 富文本粘贴交由 PasteSanitizer，三者互不重叠。
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
function createPasteWatcherPlugin(onPasteHtml) {
  return new Plugin({
    key: new PluginKey('appEditorPasteWatcher'),
    props: {
      handlePaste(view, event) {
        const html = event.clipboardData?.getData('text/html');
        if (html && typeof onPasteHtml === 'function') {
          onPasteHtml(html, view);
        }
        return false;
      },
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
 * @param {(html: string, view: object) => void} [options.onPasteHtml] 粘贴富文本监听回调（用于自动转存）
 * @param {(type: 'image'|'video') => void} [options.onOpenMedia] slash 菜单请求打开媒体库
 * @param {() => null | ((query: string) => Promise<Array<object>>)} [options.getFetchMentions] 内链数据源获取器
 */
export function createEditorExtensions(options = {}) {
  const {
    placeholder = '请输入内容...',
    upload,
    onEditorReady,
    onPasteHtml,
    onOpenMedia,
    getFetchMentions,
  } = options;

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      horizontalRule: true,
      link: false,
    }),
    Subscript,
    Superscript,
    Section,
    Figure,
    Figcaption,
    Columns,
    Column,
    // 待办清单（TaskItem 必须配套注册）
    TaskList,
    TaskItem,
    // 折叠块（问答/收起场景；输出原生 details/summary，无需自定义渲染）
    Details.configure({ persist: true }),
    DetailsSummary,
    DetailsContent,
    // 注：文末兜底空段落由 StarterKit 内置 TrailingNode 覆盖，不再重复注册；
    // 大纲面板按位置跳转，不依赖 id，因此 UniqueId / TableOfContents 均不引入，
    // 避免每个标题输出 data-id + id + data-toc-id 三重冗余属性。
    // 首行缩进（中文排版）、表格行列复制与单元格底色、查找高亮均为自研小扩展
    TextIndent,
    TableTools,
    Extension.create({
      name: 'appEditorFind',
      addProseMirrorPlugins() {
        return [findPlugin];
      },
    }),
    // 站内 Mention 内链（@ 触发，数据源经 getFetchMentions 注入）
    createAppMentionExtension({ getFetchMentions }),
    // Slash `/` 快捷插入（仅行首触发）
    createSlashExtension({ onOpenMedia }),
    // Emoji 短码联想（:smile:），默认纯文本输出无图片回退
    Emoji.configure({ enableEmoticons: false, forceFallbackImages: false }),
    // 字数统计（storage，无上限；状态条优先读它）
    CharacterCount,
    // 官方拖拽投放（仅图片；纯文件粘贴仍走自研插件，富文本粘贴走 PasteSanitizer）
    FileHandler.configure({
      allowedMimeTypes: ['image/*'],
      onDrop: (editor, files, pos) => {
        if (typeof upload !== 'function') return;
        files.forEach((file) => insertUploadedImage(editor.view, file, upload, pos));
      },
    }),
    Extension.create({
      name: 'columnsResizer',
      addProseMirrorPlugins() {
        return [createColumnsResizerPlugin()];
      },
    }),
    // 选中高亮（Decorations）：多栏/图片/视频的选中描边由插件按位置渲染，
    // 禁止用 classList 直改编辑器 DOM（会被 DOMObserver 判定为外部污染并还原）
    Extension.create({
      name: 'appEditorSelection',
      addProseMirrorPlugins() {
        return [selectionPlugin];
      },
    }),
    // AI 内联比对高亮（Decorations）：待接受/当前处的底色描边，区间自动跟随
    Extension.create({
      name: 'appEditorAiDiff',
      addProseMirrorPlugins() {
        return [aiDiffPlugin];
      },
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph', 'section', 'column', 'figure', 'figcaption'],
    }),
    RichTextStyle,
    Color,
    BackgroundColor,
    FontFamily,
    FontSize,
    LineHeight,
    Highlight.configure({ multicolor: true }),
    AppLink.configure({
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
      HTMLAttributes: {
        // 编辑器插入的图片统一挂 edp 命名类（旧类 vben-tiptap__image
        // 仅存量内容保留，CSS 双类兼容，见 content-styles.js / index.vue）
        class: 'edp-editor__image',
        referrerpolicy: 'no-referrer',
      },
    }),
    Video,
    SvgBlock,
    PreserveAttributes,
    Placeholder.configure({ placeholder }),
    createImageUploadExtension(upload),
    PasteSanitizer,
    createEditorBridgeExtension(onEditorReady),
    ...(typeof onPasteHtml === 'function'
      ? [
          Extension.create({
            name: 'pasteWatcher',
            addProseMirrorPlugins() {
              return [createPasteWatcherPlugin(onPasteHtml)];
            },
          }),
        ]
      : []),
  ];
}
