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
const CUSTOM_STYLE_BLOCK_PATTERN = /class\s*=\s*["'][^"']*\bcms-columns?\b/i;

export function usesCustomStyleBlocks(html) {
  if (!html || typeof html !== 'string') return false;
  return CUSTOM_STYLE_BLOCK_PATTERN.test(html);
}
export const contentStylesCss = `
/**
 * EDP 富文本输出样式定义
 *
 * 用途：编辑器输出的 HTML 带有少量语义 class（多栏布局等），在自有站点/
 * 落地页使用这份 HTML 时，复制本模块导出的 CSS 文本到样式表即可还原排版。只包含
 * 输出内容相关的选择器（编辑器内部的选中高亮、拖拽手柄等不在此列），
 * 全部使用字面量（无 CSS 变量、无 Tailwind），任何站点可直接使用。
 *
 * 兼容性说明：
 * 1. 内联优先：容器/列宽/间距/图片尺寸等关键排版已是内联 style，
 *    即使 class 被剥离也能保持基本可读。
 * 2. 微信公众号等不支持自定义 class 的终端：class 会被剥离，
 *    多栏退化为内联 flex 行为（flex 有效则并排，无效则自然上下堆叠），
 *    均可读；“≤768px 自动堆叠 / 保持并排”开关在该类终端下不生效。
 * 3. 媒体查询中的 !important 是刻意为之：用于覆盖内联的 gap / flex，
 *    实现移动端堆叠，勿删。
 */

/* 多栏容器：与内联 style 一致，内联缺失时兜底 */
.cms-columns {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 16px 0;
  box-sizing: border-box;
  width: 100%;
}

/* 单列：无量纲 flex 权重由内联 style 承载，此处仅兜底 */
.cms-column {
  flex: 1 1 0%;
  min-width: 0;
  box-sizing: border-box;
}

/* 图片：内联已有 max-width，此处双保险（窄屏不溢出） */
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

/* 移动端 768px 自适应：默认堆叠，--keep 保持并排 */
@media (max-width: 768px) {
  .cms-columns:not(.cms-columns--keep),
  .cms-columns--stack {
    flex-direction: column !important;
    gap: 12px !important;
  }

  .cms-columns:not(.cms-columns--keep) > .cms-column,
  .cms-columns--stack > .cms-column {
    flex: 1 1 100% !important;
    width: 100% !important;
  }

  .cms-columns--keep {
    flex-direction: row !important;
  }
}
`;
