/**
 * 输出样式定义（CSS 文本，单一来源）
 *
 * 自有站点落地页直接复制本模块导出的 CSS 文本到样式表即可；编辑器
 * Dock 全局模式的「复制样式」按钮与单测均引用此处，保证不漂移。
 * 不用 .css 文件承载，是因为本仓库管线会桩空 CSS 导入（?raw 实测为空），
 * JS 字符串在 dev / build / test 下行为一致。
 *
 * 兼容性说明见 CSS 文本头部注释。
 */

/**
 * 检测 HTML 是否使用了依赖自定义样式的块（目前仅多栏布局）。
 * 图片已内联 max-width 自给自足，不计入，避免无谓打扰。
 */
const CUSTOM_STYLE_BLOCK_PATTERN =
  /class\s*=\s*["'][^"']*\b(cms-columns?|web-bleed)\b/i;

export function usesCustomStyleBlocks(html) {
  if (!html || typeof html !== 'string') return false;
  return CUSTOM_STYLE_BLOCK_PATTERN.test(html);
}
export const contentStylesCss = `
/**
 * EDP 富文本输出样式定义
 *
 * 用途：编辑器输出的 HTML 带有少量语义 class（多栏布局、全宽通栏等），在自有站点/
 * 落地页使用这份 HTML 时，复制本模块导出的 CSS 文本到样式表即可还原排版。只包含
 * 输出内容相关的选择器（编辑器内部的选中高亮、拖拽手柄等不在此列），
 * 全部使用字面量（无 CSS 变量、无 Tailwind），任何站点可直接使用。
 *
 * 兼容性说明（多栏布局双轨制 & 版式网格）：
 * 1. 版式网格：正文外层挂 .web-article，所有子节点默认落内容列；
 *    仅打上了 .web-bleed 标记的直接子块跨满整行（全宽通栏）。
 * 2. 内联基线：新版多栏（--row1/--row2）的容器不带 display，列宽/浮动/对侧
 *    内衬距/间距全部内联，语义即小屏基线（单列堆叠或双列并排）。
 *    无 CSS 环境（微信公众号图文、邮件客户端）下这份内联样式原样保真，
 *    是最兼容的保障；class 被整体剥离也不塌。
 * 3. class 适配：--row1/--row2 仅负责「其他分辨率」——宽屏（>768px）把内联
 *    基线适配为 N 栏一排（flex + 内联 flex 权重，!important 清掉浮动/宽度/
 *    内衬距）；窄屏不写任何覆盖，直接回落内联基线。
 * 4. 旧版内容（--stack/--keep + 内联 flex）：保持历史行为——宽屏 flex 并排、
 *    ≤768px 按档位堆叠/保持；媒体查询里的 !important 是刻意为之，勿删。
 */

/* ---------- 正文版式网格（web-article / web-bleed） ----------
 * 全局富文本正文版式：容器全宽，三列网格 [gutter] [内容列] [gutter]。
 * 所有直接子节点默认落内容列；全宽块加 .web-bleed 跨满整行。 */
.web-article {
  --web-article-width: 1200px;
  --web-article-gutter: 24px;
  --web-article-inset: max(var(--web-article-gutter, 24px), calc((100% - var(--web-article-width, 1200px)) / 2));
  --web-article-template:
    [full-start] minmax(var(--web-article-gutter), 1fr)
    [content-start] minmax(0, var(--web-article-width)) [content-end]
    minmax(var(--web-article-gutter), 1fr) [full-end];
  display: grid;
  grid-template-columns: var(--web-article-template);
}

.web-article > * {
  grid-column: content;
  min-width: 0;
}

.web-article > .web-bleed,
.web-article > :has(> .web-bleed:only-child) {
  grid-column: full;
}

.web-article > section.web-bleed,
.web-article > div.web-bleed:not(.cms-columns) {
  display: grid;
  grid-template-columns: var(--web-article-template);
}

.web-article > section.web-bleed > *,
.web-article > div.web-bleed:not(.cms-columns) > * {
  grid-column: content;
  min-width: 0;
}

.web-article img.web-bleed,
.web-article video.web-bleed {
  width: 100% !important;
  max-width: 100% !important;
  display: block;
}

/* ===== 旧版内容兼容（内联 flex 基线 + --stack/--keep 标记） ===== */
.cms-columns--stack,
.cms-columns--keep {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 16px 0;
  box-sizing: border-box;
  width: 100%;
}

.cms-columns--stack > .cms-column,
.cms-columns--keep > .cms-column {
  flex: 1 1 0%;
  min-width: 0;
  box-sizing: border-box;
}

/* 旧版移动端 768px 自适应：--stack 堆叠 / --keep 保持并排 */
@media (max-width: 768px) {
  .cms-columns--stack {
    flex-direction: column !important;
    gap: 12px !important;
  }

  .cms-columns--stack > .cms-column {
    flex: 1 1 100% !important;
    width: 100% !important;
  }

  .cms-columns--keep {
    flex-direction: row !important;
  }
}

/* ===== 新版多栏（--row1/--row2）：宽屏适配为 N 栏一排 =====
 * 内联基线是「一排 x 个」，这里只在有 CSS 的宽屏场景覆盖它；
 * 间隙值由容器内联的 --cms-columns-gap 透传。 */
@media (min-width: 769px) {
  .cms-columns--row1,
  .cms-columns--row2 {
    display: flex;
    flex-direction: row;
    gap: var(--cms-columns-gap, 16px);
  }

  .cms-columns--row1 > .cms-column,
  .cms-columns--row2 > .cms-column {
    float: none !important;
    width: auto !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* 全宽多栏首/末列内收：仅 .web-bleed 全宽块有意义。
   * 直接作用于多栏容器自身的 padding，外边距取「站点 gutter 与内容列留白」的较大值，
   * 确保首列左缘与末列右缘与正文未全宽内容列像素级精确对齐，另一侧继续出血。 */
  .web-article > .cms-columns.web-bleed.cms-columns--inset-start,
  .web-article .cms-columns.web-bleed.cms-columns--inset-start,
  .web-article > div.web-bleed.cms-columns--inset-start {
    padding-left: var(--web-article-inset, max(var(--web-article-gutter, 24px), calc((100% - var(--web-article-width, 1200px)) / 2))) !important;
  }

  .web-article > .cms-columns.web-bleed.cms-columns--inset-end,
  .web-article .cms-columns.web-bleed.cms-columns--inset-end,
  .web-article > div.web-bleed.cms-columns--inset-end {
    padding-right: var(--web-article-inset, max(var(--web-article-gutter, 24px), calc((100% - var(--web-article-width, 1200px)) / 2))) !important;
  }
}

/* ===== 多栏等高铺满（.cms-columns--equal-height）：以最高栏为基准，各栏内容自动铺满全高 ===== */
.cms-columns--equal-height {
  align-items: stretch !important;
}

.cms-columns--equal-height > .cms-column {
  display: flex !important;
  flex-direction: column !important;
  height: auto !important;
}

.cms-columns--equal-height > .cms-column > :only-child {
  flex: 1 1 auto !important;
  min-height: 100% !important;
  box-sizing: border-box !important;
}

.cms-columns--equal-height > .cms-column > section,
.cms-columns--equal-height > .cms-column > div:not(.app-editor-drop-cursor) {
  flex: 1 1 auto;
  box-sizing: border-box;
}

/* 图片：内联已有 max-width，此处双保险（窄屏不溢出）
 * 双类兼容：edp-editor__image 为现行类；vben-tiptap__image 为存量内容旧类 */
img.edp-editor__image,
img.vben-tiptap__image {
  max-width: 100%;
  height: auto;
}

/* 站内Mention 内链：输出为原生 a 链接 */
a.edp-mention {
  color: #2563eb;
  text-decoration: none;
  border-bottom: 1px solid #bfdbfe;
  padding: 0 2px;
}
`;
