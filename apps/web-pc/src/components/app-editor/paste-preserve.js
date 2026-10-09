/**
 * 粘贴保真增强（paste fidelity）
 *
 * 目标：135编辑器 / 秀米 / 微信公众号 / Word 等编辑器排好版的富文本，
 * 粘贴进编辑器后排版样式尽量不丢。
 *
 * 组成：
 * 1. Section 节点：承接 <section>/<div> 嵌套结构（秀米/135 素材骨架），
 *    其 style/class 由 extensions.js 的 PreserveAttributes 全局属性保留。
 * 2. RichTextStyle：在 TextStyle 基础上追加行内「剩余样式」保留——
 *    color/background-color/font-family/font-size/line-height 仍由专用
 *    扩展结构化管理，其余（letter-spacing、text-indent、font-weight、
 *    white-space 等）原样保留，输出时合并回同一个 span。
 * 3. PasteSanitizer：解析前清洗来源垃圾（Word 的 o:p 标签与 mso-* 声明、
 *    script/style 标签、HTML 注释等），避免脏内容进入文档。
 */
import { Extension, Node } from '@tiptap/core';
import { TextStyle } from '@tiptap/extension-text-style';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// ---------------------------------------------------------------------------
// 1. Section 节点
// ---------------------------------------------------------------------------

/**
 * 块级容器节点，可嵌套（content: 'block+'），是秀米/135 素材的骨架。
 * style/class/text-align 等属性由 PreserveAttributes 全局属性统一保留，
 * text-align 交给 TextAlign 扩展管理（见 extensions.js 的 types 配置）。
 */
export const Section = Node.create({
  name: 'section',
  group: 'block',
  content: 'block+',
  // 跨 section 的选区删除时不拆壳
  defining: true,
  parseHTML() {
    // section: 秀米/135 素材骨架；div: Word/网页粘贴的通用容器
    return [{ tag: 'section' }, { tag: 'div' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['section', HTMLAttributes, 0];
  },
});

// ---------------------------------------------------------------------------
// 2. RichTextStyle：span 行内样式全量保留
// ---------------------------------------------------------------------------

/** 已由专用扩展结构化管理的 style 键，剔除后剩余部分原样保留 */
const MANAGED_STYLE_KEYS = new Set([
  'color',
  'background-color',
  'font-family',
  'font-size',
  'line-height',
]);

/** 提取 span 上「未被专用扩展管理」的剩余内联样式 */
function extractResidualInlineStyle(element) {
  if (!element.hasAttribute('style')) return null;
  const { style } = element;
  const parts = [];
  for (let i = 0; i < style.length; i += 1) {
    const key = style.item(i);
    if (!key || MANAGED_STYLE_KEYS.has(key)) continue;
    const value = style.getPropertyValue(key);
    if (!value) continue;
    const priority = style.getPropertyPriority(key);
    parts.push(`${key}: ${value}${priority ? ' !important' : ''}`);
  }
  return parts.length ? `${parts.join('; ')};` : null;
}

const MAX_MERGE_SPAN_DEPTH = 20;

/**
 * 把父 span 的样式合并到子孙 span 上，避免嵌套 span 解析时外层样式丢失
 * （ProseMirror 解析嵌套 span 时内层 mark 会覆盖外层）。
 * 复刻自 tiptap v3 TextStyle.mergeNestedSpanStyles，并修正父级无 style
 * 时拼接出 "undefined" 的缺陷。
 */
function mergeNestedSpanStyles(element) {
  const childSpans = [];
  const walk = (node, depth) => {
    if (depth > MAX_MERGE_SPAN_DEPTH) return;
    Array.from(node.children).forEach((child) => {
      if (child.tagName === 'SPAN') {
        childSpans.push(child);
      } else {
        walk(child, depth + 1);
      }
    });
  };
  walk(element, 0);
  childSpans.forEach((childSpan) => {
    const parentStyle = childSpan.parentElement
      ?.closest('span')
      ?.getAttribute('style');
    if (!parentStyle) return;
    const childStyle = childSpan.getAttribute('style') ?? '';
    childSpan.setAttribute('style', `${parentStyle};${childStyle}`);
  });
}

export const RichTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute('class'),
        renderHTML: (attributes) =>
          attributes.class ? { class: attributes.class } : {},
      },
      inlineStyle: {
        default: null,
        parseHTML: (element) => extractResidualInlineStyle(element),
        renderHTML: (attributes) =>
          attributes.inlineStyle ? { style: attributes.inlineStyle } : {},
      },
    };
  },
  /**
   * 覆盖默认解析规则：v3 默认仅当 span 有 style 时才应用 textStyle mark，
   * 这里放宽为「有 style 或 class」，保证仅 class 的 span 也能保留；
   * consuming: false 保持与官方一致（不阻止其他规则匹配同一元素）。
   */
  parseHTML() {
    return [
      {
        tag: 'span',
        consuming: false,
        getAttrs: (element) => {
          const hasStyle = element.hasAttribute('style');
          const hasClass = Boolean(element.getAttribute('class'));
          if (!hasStyle && !hasClass) return false;
          if (hasStyle) mergeNestedSpanStyles(element);
          return {};
        },
      },
    ];
  },
});

// ---------------------------------------------------------------------------
// 3. PasteSanitizer：粘贴 HTML 预清洗
// ---------------------------------------------------------------------------

const REMOVED_SELECTOR = [
  'script',
  'style',
  'meta',
  'link',
  'title',
  'iframe',
  'object',
  'embed',
].join(',');

// Office/Word 私有标签命名空间（o:p、v:shape 等）
const OFFICE_TAG_PREFIXES = ['o:', 'v:', 'w:', 'st1:'];

// Word 专有 style 声明，粘贴无意义
const WORD_STYLE_DECL = /^(mso-|tab-stops\b)/i;

function isOfficeTag(element) {
  const tag = (element.tagName || '').toLowerCase();
  return OFFICE_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix));
}

function cleanStyleAttr(element) {
  const raw = element.getAttribute('style');
  if (!raw) return;
  const kept = raw
    .split(';')
    .map((decl) => decl.trim())
    .filter((decl) => decl && !WORD_STYLE_DECL.test(decl));
  if (kept.length) {
    element.setAttribute('style', `${kept.join('; ')};`);
  } else {
    element.removeAttribute('style');
  }
}

function cleanClassAttr(element) {
  const raw = element.getAttribute('class');
  if (!raw) return;
  const kept = raw.split(/\s+/).filter((cls) => cls && !/^Mso/i.test(cls));
  if (kept.length) {
    element.setAttribute('class', kept.join(' '));
  } else {
    element.removeAttribute('class');
  }
}

/**
 * 清洗粘贴的 HTML：剥离脚本/样式表/注释/Office 私有标签与声明，
 * 其余结构原样保留，交给 schema 解析。
 */
export function sanitizePastedHtml(html) {
  if (!html) return html ?? '';
  try {
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const { body } = dom;
    if (!body) return html;

    dom.querySelectorAll(REMOVED_SELECTOR).forEach((el) => el.remove());

    // 注释（含 Word 的 StartFragment 标记等）
    // 128 = NodeFilter.SHOW_COMMENT
    const commentWalker = dom.createTreeWalker(body, 128);
    const comments = [];
    while (commentWalker.nextNode()) comments.push(commentWalker.currentNode);
    comments.forEach((comment) => comment.parentNode?.removeChild(comment));

    // Office 私有标签：拆壳保留内容
    const officeTags = Array.from(body.querySelectorAll('*')).filter(
      isOfficeTag,
    );
    officeTags.forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });

    body.querySelectorAll('[style]').forEach(cleanStyleAttr);
    body.querySelectorAll('[class]').forEach(cleanClassAttr);

    return body.innerHTML;
  } catch {
    return html;
  }
}

export const PasteSanitizer = Extension.create({
  name: 'pasteSanitizer',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('appEditorPasteSanitizer'),
        props: {
          transformPastedHTML: (html) => sanitizePastedHtml(html ?? ''),
        },
      }),
    ];
  },
});
