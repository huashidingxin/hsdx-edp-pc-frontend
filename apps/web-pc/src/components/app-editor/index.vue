<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Expand,
  ImagePlus,
} from '@vben/icons';

import { NodeSelection, TextSelection } from '@tiptap/pm/state';

import { VbenTiptap } from '@vben/plugins/tiptap';
import { BubbleMenu, FloatingMenu } from '@tiptap/vue-3/menus';

import { upload as uploadFile } from '#/api';

import AiChatBar from './ai-chat-bar.vue';
import {
  childOffsets,
  computeTokenDiff,
  diffBlocks,
  dispatchAiDiffClear,
  dispatchAiDiffCurrent,
  dispatchAiDiffSet,
  serializeChildBlocks,
} from './ai-diff-plugin';
import { findActiveColumnsInfo } from './columns';
// 输出样式定义原文，供“复制样式”按钮使用，单一来源
import { contentStylesCss, usesCustomStyleBlocks } from './content-styles.js';
import {
  cleanEmptyTopParagraphs,
  findTextRange,
  justifyAllContent as justifyAllContentDoc,
  unifyAllLineHeight as unifyAllLineHeightDoc,
} from './doc-actions';
import {
  findColumnsNodeAndPos,
  findImageNodeAndPos,
  findTableNodeAndPos,
  findVideoNodeAndPos,
} from './dom-lookup';
import EditorToolbar from './editor-toolbar.vue';
import {
  ancestorChain,
  buildCrumbChain,
  computeBoxOverlay,
  deleteElement,
  DISPLAY_OPTIONS,
  duplicateElement,
  expandBoxSides,
  floatToStyledAncestor,
  friendlyNodeName,
  hasSpanMarkStyles,
  insertParagraphBeside,
  isAlignableNode,
  MANAGED_STYLE_KEYS,
  mergeStyleDecls,
  moveElement,
  parseStyleDecls,
  resolveElementFromSelection,
  resolveInspectorTarget,
  resolveSpanTarget,
} from './element-inspector';
import { createEditorExtensions } from './extensions';
import { DEFAULT_THUMBNAIL_PROCESS, defaultFetchMedia, stripThumbnailParam } from './media-api';
import MediaLibraryModal from './media-library-modal.vue';
import ExternalAssetsModal from './external-assets-modal.vue';
import { message } from 'antdv-next';
import {
  cleanUrlCandidate,
  decodeHtmlEntities,
  DEFAULT_INTERNAL_DOMAINS,
  extractExternalAssets,
  replaceAssetUrlsInHtml,
  transferRemoteAsset,
} from './external-assets';
import {
  appEditorSelectionKey,
  dispatchColumnsSelected,
  dispatchElementSelected,
  dispatchSelectionCleared,
  dispatchSpanSelected,
  dispatchTableSelected,
} from './selection-plugin';
import { createSourceCodeEditor } from './source-editor';
import { getTableDimensions } from './table-tools';

const props = defineProps({
  value: {
    type: String,
    default: undefined,
  },
  modelValue: {
    type: String,
    default: undefined,
  },
  label: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '请输入内容...',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  toolbar: {
    type: Boolean,
    default: true,
  },
  previewable: {
    type: Boolean,
    default: true,
  },
  minHeight: {
    type: [Number, String],
    default: 240,
  },
  maxHeight: {
    type: [Number, String],
    default: 480,
  },
  /**
   * 媒体库文件列表获取接口：按类型（image、video、document、audio 等）拉取文件列表
   * 默认预置本系统 GET /uploads 接口；若传入 null 或 false，则降级为基础本地上传与链接输入
   */
  fetchMedia: {
    type: [Function, Boolean],
    default: () => defaultFetchMedia,
  },
  thumbnailProcess: {
    type: [String, Function, Boolean],
    default: DEFAULT_THUMBNAIL_PROCESS,
  },
  internalDomains: {
    type: Array,
    default: () => DEFAULT_INTERNAL_DOMAINS,
  },
  /**
   * 站内Mention 数据源：(query: string) => Promise<Array<{ url, label, hint? }>>
   * 默认 null（@ 建议列表提示未配置）；接入业务 records 搜索后传入。
   */
  fetchMentions: {
    type: [Function, Boolean],
    default: null,
  },
  /**
   * 中文校对服务：(text: string) => Promise<Array<{ text, message, suggestions[] }>>
   * 默认 null（校对面板提示未配置）；需后端代理第三方接口，切勿前端直连带密钥。
   */
  fetchProofread: {
    type: [Function, Boolean],
    default: null,
  },
  /**
   * AI 辅助修改服务：
   * ({ instruction, preset, text, html, scope, label, images, signal, onChunk }) => Promise<string>
   * scope: 'node'（选中节点）| 'full'（全文）；images: 设计稿 base64 dataURL 数组（可为空）。
   * 默认 null（对话条提示未配置）；需后端代理模型接口，切勿前端直连带密钥。
   * 流式可选：调用 onChunk(chunk) 即为流式输出，否则整包返回最终字符串。
   */
  fetchAi: {
    type: [Function, null],
    default: null,
  },
  /**
   * 粘贴富文本时是否自动后台转存并原地替换外链
   * 属于组件底层能力，默认关闭 (false)；仅由调用方通过 props 显式传入开启，不向终端用户暴露交互切换
   */
  autoTransferOnPaste: {
    type: Boolean,
    default: false,
  },
  model: {
    type: String,
    default: '',
  },
  recordId: {
    type: [Number, String],
    default: '',
  },
  fieldName: {
    type: String,
    default: 'content',
  },
  locale: {
    type: String,
    default: 'zh-CN',
  },
});

const emit = defineEmits(['update:value', 'update:modelValue', 'change']);

const content = ref(props.modelValue ?? props.value ?? '');
const editorInstance = ref(null);

// ---------------------------------------------------------------------------
// 外链资源检测与转存状态
// ---------------------------------------------------------------------------
const customInternalDomains = ref([...(props.internalDomains || DEFAULT_INTERNAL_DOMAINS)]);
const externalAssets = ref([]);
const isExternalModalOpen = ref(false);
const isBannerDismissed = ref(false);

watch(
  () => props.internalDomains,
  (val) => {
    if (val && Array.isArray(val)) {
      customInternalDomains.value = [...val];
    }
  },
);

watch(
  [() => content.value, customInternalDomains],
  () => {
    externalAssets.value = extractExternalAssets(
      content.value,
      customInternalDomains.value,
    );
  },
  { immediate: true, deep: true },
);

const externalAssetsCount = computed(() => externalAssets.value.length);
const plainTextCount = computed(() => {
  // 优先官方 CharacterCount（textSize），桥接未就绪时回退正则
  try {
    const chars = editorInstance.value?.storage?.characterCount?.characters?.();
    if (typeof chars === 'number') return chars;
  } catch {}
  return (content.value || '').replace(/<[^>]*>/g, '').trim().length;
});

// ---------------------------------------------------------------------------
// 自定义样式依赖指示：文档用到多栏布局时，“复制样式”按钮高亮呼吸提示
// （图片已内联兜底，不计入，避免无谓打扰）
// ---------------------------------------------------------------------------
const needsCustomStyles = computed(() => usesCustomStyleBlocks(content.value));

function openExternalModal() {
  isExternalModalOpen.value = true;
}

function onReplaceExternalUrls(urlMapping) {
  if (!urlMapping || Object.keys(urlMapping).length === 0) return;
  const currentHtml = editorInstance.value?.getHTML() || content.value || '';
  const updated = replaceAssetUrlsInHtml(currentHtml, urlMapping);
  content.value = updated;
  if (showSource.value) {
    sourceCode.value = formatHtml(updated);
  }
  if (editorInstance.value) {
    // 全量应用替换后的 HTML 到 TipTap 编辑器，确保图片、视频、背景图、SVG 等所有节点无遗漏更新
    editorInstance.value.commands.setContent(updated, { emitUpdate: false });
    content.value = editorInstance.value.getHTML();
  }
  emit('update:modelValue', content.value);
  emit('update:value', content.value);
  emit('change', content.value);
}

/**
 * 监听富文本粘贴事件：自动检测外链并在后台自动流式转存替换
 */
async function handlePasteHtml(html) {
  if (!props.autoTransferOnPaste) return;
  if (!html || typeof html !== 'string') return;
  const detected = extractExternalAssets(html, customInternalDomains.value);
  if (!detected || detected.length === 0) return;

  const validTargets = detected.filter((it) => it.url && !it.isExpired);
  if (validTargets.length === 0) return;

  setTimeout(async () => {
    message.loading({
      content: `检测到粘贴了 ${validTargets.length} 项外链媒体资源，正在自动转存入库...`,
      key: 'paste-transfer-progress',
      duration: 0,
    });

    const mapping = {};
    let successCount = 0;
    let failCount = 0;

    for (const item of validTargets) {
      try {
        const newUrl = await transferRemoteAsset(item.url);
        if (newUrl) {
          mapping[item.url] = newUrl;
          successCount++;
        }
      } catch (err) {
        console.warn('[app-editor] 粘贴自动转存失败:', item.url, err);
        failCount++;
      }
    }

    if (Object.keys(mapping).length > 0) {
      onReplaceExternalUrls(mapping);
    }

    if (failCount === 0) {
      message.success({
        content: `已自动完成 ${successCount} 项粘贴外链资源的站内转存与链接替换！`,
        key: 'paste-transfer-progress',
        duration: 3,
      });
    } else {
      message.warning({
        content: `粘贴转存完成：${successCount} 项成功，${failCount} 项受防盗链保护可在外链面板中输入来源链接刷新`,
        key: 'paste-transfer-progress',
        duration: 4,
      });
    }
  }, 100);
}

function onLoadSourceContent(newContent) {
  if (!newContent) return;
  content.value = newContent;
  if (showSource.value) {
    sourceCode.value = formatHtml(newContent);
  }
  if (editorInstance.value) {
    editorInstance.value.commands.setContent(newContent, true);
  }
  emit('update:modelValue', newContent);
  emit('update:value', newContent);
  emit('change', newContent);
}

function onUpdateInternalDomains(domains) {
  customInternalDomains.value = domains;
}

const editorContainerRef = ref(null);
const imageFloatingRef = ref(null);
const videoFloatingRef = ref(null);

const isFullscreen = ref(false);
const isPreviewModalOpen = ref(false);
const previewDevice = ref('wechat'); // 'mobile' | 'wechat' | 'full'
const editorCanvasWidth = ref('1300px'); // '1300px' | 'auto' | '960px' | '677px' | '375px'

/** 页面设置（收拢进字数栏下拉）：编辑视口选项 */
const VIEWPORT_OPTIONS = [
  {
    value: '1300px',
    label: '1300px (标准宽)',
    shortLabel: '1300px',
    icon: '🖥️',
    title: '标准文章宽度 (1300px，匹配 web-article 1200px 内容列 + 边距)',
  },
  {
    value: 'auto',
    label: '自适应全屏',
    shortLabel: '自适应',
    icon: '↔️',
    title: '自适应跟随外部窗口宽度',
  },
  {
    value: '960px',
    label: '960px (传统宽)',
    shortLabel: '960px',
    icon: '💻',
    title: '传统窄版内容宽度 (960px)',
  },
  {
    value: '677px',
    label: '公众号 (677px)',
    shortLabel: '公众号 677px',
    icon: '📰',
    group: '小屏幕',
    title: '微信公众号标准宽 (677px，内联严格保真)',
  },
  {
    value: '375px',
    label: '手机 (375px)',
    shortLabel: '手机 375px',
    icon: '📱',
    group: '小屏幕',
    title: '手机移动端视口 (375px，内联严格保真)',
  },
];

const currentViewportOption = computed(() => {
  return (
    VIEWPORT_OPTIONS.find((o) => o.value === editorCanvasWidth.value) ||
    VIEWPORT_OPTIONS[0]
  );
});

const desktopViewportOptions = computed(() =>
  VIEWPORT_OPTIONS.filter((o) => !o.group),
);

const smallScreenViewportOptions = computed(() =>
  VIEWPORT_OPTIONS.filter((o) => o.group === '小屏幕'),
);

/** 状态栏按钮默认值：当前编辑视口 */
const viewportLabel = computed(
  () => currentViewportOption.value.shortLabel,
);

function setViewportWidth(value) {
  editorCanvasWidth.value = value;
  isViewportMenuOpen.value = false;
  nextTick(() => {
    onScrollOrResize();
  });
}

/** 字数栏页面设置下拉开关（点外部关闭） */
const isViewportMenuOpen = ref(false);
const statusbarRef = ref(null);
const viewportDropdownRef = ref(null);

function onViewportDocClick(event) {
  if (!isViewportMenuOpen.value) return;
  const el = viewportDropdownRef.value || statusbarRef.value;
  if (el && !el.contains(event.target)) {
    isViewportMenuOpen.value = false;
  }
}
const isVideoPlaying = ref(false);
const replaceVideoModalOpen = ref(false);
const sourceCode = ref('');
/**
 * 双栏模式：左可视化、右源码并排（支持普通视图与全屏）。
 * 右侧为“只看+定位+辅助改动”视角：左侧编辑实时刷新右侧，右侧改动需点“应用”生效；
 * 点击左侧元素时右侧源码自动定位并高亮标签；右侧点击不逆向影响左侧。
 */
const isSplitView = ref(false);
/** 双栏成立即挂载源码面板 */
const showSource = computed(() => isSplitView.value);
/** 左侧富文本始终可见 */
const showEditor = computed(() => true);

// ---------------------------------------------------------------------------
// 双栏宽度：默认 50/50 对等 + 中间拖拽条
// ---------------------------------------------------------------------------
const SPLIT_DEFAULT_PCT = 50;
/** 左侧兜底最小宽度（拖拽/窗口缩放都不得小于此值） */
const SPLIT_LEFT_MIN = 280;
/** 右侧最小宽度 */
const SPLIT_RIGHT_MIN = 240;
/** 拖拽条宽度 */
const SPLIT_DIV_PX = 6;

const splitBodyRef = ref(null);
const splitLeftPct = ref(SPLIT_DEFAULT_PCT);
const isSplitDragging = ref(false);
let splitDragState = null;
let lastSplitBodyW = 0;

/** 按当前容器宽度把左栏占比钳制在 [左兜底, 右最小] 区间内 */
function clampSplitPct(pct) {
  const w = splitBodyRef.value?.clientWidth || 0;
  const raw = Math.round(Number(pct) * 10) / 10;
  if (!(w > 0)) return Math.max(20, Math.min(80, raw || SPLIT_DEFAULT_PCT));
  const minPct = (SPLIT_LEFT_MIN / w) * 100;
  const maxPct = ((w - SPLIT_RIGHT_MIN - SPLIT_DIV_PX) / w) * 100;
  // 容器过窄时保左舍右：左侧兜底优先
  if (!(maxPct >= minPct)) return minPct;
  return Math.max(minPct, Math.min(maxPct, raw));
}

function onSplitDragStart(event) {
  if (!isSplitView.value || !splitBodyRef.value) return;
  event.preventDefault();
  try {
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  } catch {
    /* 忽略 */
  }
  splitDragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startPct: splitLeftPct.value,
    width: splitBodyRef.value.clientWidth || 1,
  };
  isSplitDragging.value = true;
  const onMove = (e) => {
    if (!splitDragState || e.pointerId !== splitDragState.pointerId) return;
    const dx = e.clientX - splitDragState.startX;
    splitLeftPct.value = clampSplitPct(
      splitDragState.startPct + (dx / splitDragState.width) * 100,
    );
  };
  const onUp = (e) => {
    if (e.pointerId !== splitDragState?.pointerId) return;
    splitDragState = null;
    isSplitDragging.value = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    nextTick(() => {
      onScrollOrResize();
    });
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

/** 双击拖拽条恢复默认比例 */
function resetSplitRatio() {
  splitLeftPct.value = SPLIT_DEFAULT_PCT;
  nextTick(() => {
    onScrollOrResize();
  });
}

/** 窗口缩放导致越界时重新钳制（容器宽度变化才量，避免滚动时反复布局） */
function clampSplitOnResize() {
  if (!isSplitView.value || !splitBodyRef.value) return;
  const w = splitBodyRef.value.clientWidth || 0;
  if (w && Math.abs(w - lastSplitBodyW) > 1) {
    lastSplitBodyW = w;
    const fixed = clampSplitPct(splitLeftPct.value);
    if (fixed !== splitLeftPct.value) splitLeftPct.value = fixed;
  }
}

const isEditable = computed(() => !props.disabled);

async function uploadImage(file) {
  const result = await uploadFile(file, {});
  if (typeof result === 'string') {
    return result;
  }
  return result?.url ?? result?.default ?? '';
}

async function uploadGeneralFile(file) {
  const result = await uploadFile(file, {});
  if (typeof result === 'string') {
    return result;
  }
  return result?.url ?? result?.default ?? '';
}

provide('appEditor:upload', uploadImage);

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
  nextTick(() => {
    onScrollOrResize();
  });
}

/** 双栏开关：左可视化、右源码并排（支持普通视图与全屏） */
function toggleSplitView() {
  if (isSplitView.value) {
    isSplitView.value = false;
    sourceAiApi.value?.clearLocate?.();
    nextTick(() => {
      onScrollOrResize();
    });
    return;
  }
  const currentHtml = editorInstance.value?.getHTML() ?? content.value ?? '';
  sourceCode.value = formatHtml(currentHtml);
  isSplitView.value = true;
  nextTick(() => {
    onScrollOrResize();
    scheduleSplitLocate();
  });
}

function openPreviewModal() {
  isPreviewModalOpen.value = true;
}

function closePreviewModal() {
  isPreviewModalOpen.value = false;
}

// ---------------------------------------------------------------------------
// 打印清样：渲染一份仅含正文的打印区并调用系统打印
// ---------------------------------------------------------------------------

const isPrinting = ref(false);

// 打印样式只注入一次（普通 DOM 操作，不进 Vue 渲染树）
let printCssInjected = false;

function ensurePrintCss() {
  if (printCssInjected || typeof document === 'undefined') return;
  if (document.getElementById('app-editor-print-css')) {
    printCssInjected = true;
    return;
  }
  try {
    const style = document.createElement('style');
    style.id = 'app-editor-print-css';
    style.textContent = printBaseCss;
    document.head.appendChild(style);
    printCssInjected = true;
  } catch (err) {
    console.warn('[app-editor] 打印样式注入失败:', err);
  }
}

function printDocument() {
  if (isPrinting.value) return;
  ensurePrintCss();
  isPrinting.value = true;
  nextTick(() => {
    const cleanup = () => {
      isPrinting.value = false;
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    try {
      window.print();
    } catch {
      cleanup();
    }
    // 兜底：afterprint 未触发时 2s 后自动清理
    setTimeout(() => {
      if (isPrinting.value) cleanup();
    }, 2000);
  });
}

// 打印清样内联样式：复用输出样式定义 + 打印基准（黑字/表格线）
const printBaseCss = `${contentStylesCss}
.app-editor-print { font-size: 14px; line-height: 1.75; color: #111111; }
.app-editor-print img, .app-editor-print video { max-width: 100%; height: auto; }
.app-editor-print table { border-collapse: collapse; width: 100%; margin: 12px 0; }
.app-editor-print td, .app-editor-print th { border: 1px solid #999999; padding: 6px 10px; }
.app-editor-print a { color: #111111; text-decoration: underline; }
`;

// ---------------------------------------------------------------------------
// HTML 源码美化格式化函数
// ---------------------------------------------------------------------------

function formatHtml(html) {
  if (!html) return '';
  let formatted = '';
  let indent = 0;
  const tab = '  ';
  const clean = String(html).replaceAll(/>\s*</g, '><').trim();
  const tokens = clean
    .split(/(<\/?[a-zA-Z0-9-]+(?:\s+[^>]*)?>)/g)
    .filter(Boolean);
  const inlineTags = new Set([
    'span',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'sub',
    'sup',
    'code',
    'a',
  ]);
  const voidTags = new Set(['img', 'br', 'hr', 'input', 'source']);

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    if (token.startsWith('</')) {
      const tagMatch = token.match(/<\/([a-zA-Z0-9-]+)>/);
      const tag = tagMatch ? tagMatch[1].toLowerCase() : '';
      if (!inlineTags.has(tag)) {
        indent = Math.max(0, indent - 1);
        formatted += `\n${tab.repeat(indent)}${token}`;
      } else {
        formatted += token;
      }
    } else if (token.startsWith('<')) {
      const tagMatch = token.match(/<([a-zA-Z0-9-]+)/);
      const tag = tagMatch ? tagMatch[1].toLowerCase() : '';
      const isSelfClosing = token.endsWith('/>') || voidTags.has(tag);
      if (!inlineTags.has(tag)) {
        formatted += (formatted ? '\n' : '') + tab.repeat(indent) + token;
        if (!isSelfClosing) indent += 1;
      } else {
        formatted += token;
      }
    } else {
      formatted += token;
    }
  }
  return formatted.trim();
}

/**
 * 显式隐藏 Bubble / Floating 快捷菜单（发 hide meta，不拆 DOM，见模板注释）
 */
function hideShortcutMenus() {
  const editor = editorInstance.value;
  if (!editor || editor.isDestroyed) return;
  try {
    const tr = editor.state.tr;
    tr.setMeta('appEditorBubble', 'hide');
    tr.setMeta('appEditorFloatingMenu', 'hide');
    editor.view.dispatch(tr);
  } catch {
    /* 忽略 */
  }
}

function onSourceInput(event) {
  sourceCode.value = event.target.value;
}

// ---------------------------------------------------------------------------
// 源代码模式 CodeMirror 6（动态加载，独立分包）
// 双栏模式下右侧为定位与辅助编辑视角：用户在右侧编辑时，输入更新 sourceCode，
// 但不逐键触发 setContent（避免冲掉左侧富文本撤销栈与光标）。
// 点击“应用右侧改动”或快捷键 Ctrl/Cmd+S 时，把最新代码落到左侧富文本。
// AI 辅助预留：sourceAiApi 经 defineExpose(sourceAi) 暴露给父组件。
// ---------------------------------------------------------------------------
const sourceHostRef = ref(null);
const sourceView = shallowRef(null);
const sourceAiApi = shallowRef(null);
/** CodeMirror 加载失败时回退纯文本 textarea */
const sourceTextareaFallback = ref(false);
/** 外部写入 CM 中（updateListener 回调需吞掉，防回环 emit） */
let applyingExternalSource = false;
/** 挂载序号：快速开关源码模式时使迟到的异步挂载作废 */
let sourceMountSeq = 0;

function onSourceDocChange(value) {
  if (applyingExternalSource) return;
  sourceCode.value = value;
}

/** 双栏：把右侧源码显式应用到左侧编辑器 */
function applySplitSourceToEditor() {
  if (sourceView.value) {
    sourceCode.value = sourceView.value.state.doc.toString();
  }
  const nextHtml = sourceCode.value;
  content.value = nextHtml;
  if (editorInstance.value) {
    editorInstance.value.commands.setContent(nextHtml, true);
  }
  emit('update:value', nextHtml);
  emit('update:modelValue', nextHtml);
  emit('change', nextHtml);
  message.success('已将右侧源码应用到左侧');
}

/**
 * 用户在右侧源码区发生交互（点击代码、移动光标、输入等）：
 * 1. 立即解除右侧同步高亮；
 * 2. 清除等待执行的定位定时器；
 * 3. 清除左侧的元素选中状态，断开与刚才代码的关联，避免任何事件触发再次跳回旧代码。
 */
function onSourceEditorInteract() {
  sourceAiApi.value?.clearLocate?.();
  if (splitLocateTimer) {
    clearTimeout(splitLocateTimer);
    splitLocateTimer = 0;
  }
  clearSelection();
  clearElementSelection();
  clearColumnsSelection();
  clearTableSelection();
}

async function mountSourceEditor(initialDoc) {
  sourceMountSeq += 1;
  const seq = sourceMountSeq;
  unmountSourceEditor();
  const host = sourceHostRef.value;
  if (!host) return;
  try {
    const { view, api } = await createSourceCodeEditor({
      host,
      doc: initialDoc,
      placeholderText: '在此编辑 HTML 源码...',
      onChange: onSourceDocChange,
      // Ctrl/Cmd+S、Ctrl/Cmd+Enter = 应用到左侧
      onApply: () => applySplitSourceToEditor(),
      onInteract: () => onSourceEditorInteract(),
    });
    if (seq !== sourceMountSeq) {
      // 等待加载期间源码模式已再次切换，丢弃本次实例
      view.destroy();
      return;
    }
    sourceView.value = view;
    sourceAiApi.value = api;
    // 双栏下 CM 为异步挂载：就绪后补一次定位（进入双栏时的选中可能先于挂载到达）
    if (isSplitView.value) {
      scheduleSplitSourceRefresh();
      scheduleSplitLocate();
    }
  } catch (err) {
    console.error('[app-editor] 源码编辑器加载失败，回退纯文本模式:', err);
    if (seq === sourceMountSeq) {
      sourceTextareaFallback.value = true;
    }
  }
}

function unmountSourceEditor() {
  try {
    sourceView.value?.destroy?.();
  } catch {
    /* 忽略 */
  }
  sourceView.value = null;
  sourceAiApi.value = null;
}

/** 外部源码写入 CM（相同时不 dispatch，避免无谓事务） */
function setSourceEditorDoc(next) {
  const view = sourceView.value;
  if (!view) return;
  const text = String(next ?? '');
  const current = view.state.doc.toString();
  if (current === text) return;
  applyingExternalSource = true;
  try {
    view.dispatch({
      changes: { from: 0, to: current.length, insert: text },
    });
  } finally {
    applyingExternalSource = false;
  }
}

watch(showSource, (active) => {
  if (active) {
    sourceTextareaFallback.value = false;
    nextTick(() => {
      mountSourceEditor(sourceCode.value);
    });
  } else {
    sourceMountSeq += 1;
    unmountSourceEditor();
  }
});

/** 一键格式化源码（复用 formatHtml，单事务可撤销；降级 textarea 时直接改写） */
function formatSourceCode() {
  if (sourceTextareaFallback.value || !sourceView.value) {
    sourceCode.value = formatHtml(sourceCode.value);
    return;
  }
  const view = sourceView.value;
  const current = view.state.doc.toString();
  const formatted = formatHtml(current);
  if (formatted === current) {
    message.info('源码已是格式化状态');
    return;
  }
  view.dispatch({
    changes: { from: 0, to: current.length, insert: formatted },
  });
  message.success('已格式化（Ctrl/Cmd+Z 可撤销）');
}

watch(sourceCode, (next) => {
  if (!showSource.value) return;
  setSourceEditorDoc(next);
});

// ---------------------------------------------------------------------------
// 样式处理工具函数
// ---------------------------------------------------------------------------

function declsOf(style) {
  return String(style || '')
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .map((decl) => {
      const index = decl.indexOf(':');
      if (index === -1) return null;
      return [decl.slice(0, index).trim(), decl.slice(index + 1).trim()];
    })
    .filter(Boolean);
}

function stringifyDecls(decls) {
  if (decls.length === 0) return null;
  return `${decls.map(([key, value]) => `${key}: ${value}`).join('; ')};`;
}

function setStyleDecls(style, updates, removeKeys = []) {
  const updateMap = new Map(updates);
  const removeSet = new Set(removeKeys);
  const decls = declsOf(style).filter(
    ([key]) => !updateMap.has(key) && !removeSet.has(key),
  );
  for (const [key, value] of updates) {
    if (value !== null && value !== undefined) decls.push([key, value]);
  }
  return stringifyDecls(decls);
}

// ---------------------------------------------------------------------------
// ProseMirror DOM 查找函数（统一收敛到 ./dom-lookup，DOM 身份优先，拒绝同 src 盲匹配）
// findVideoNodeAndPos / findImageNodeAndPos / findColumnsNodeAndPos 均由 dom-lookup 导入
// ---------------------------------------------------------------------------

function getContentContainerEl() {
  return (
    editorContainerRef.value?.querySelector('.vben-tiptap-content') ||
    editorContainerRef.value?.querySelector('.vben-tiptap')
  );
}

// ---------------------------------------------------------------------------
// 特殊块单选体系（图片、视频专属浮动工具条）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 多栏布局（Columns）选择与浮动工具条系统
// ---------------------------------------------------------------------------

const selectedColumnsTarget = ref(null);
// 结构: { el: HTMLElement, pos: number, node: Node, activeColIndex: number }

const columnsActivePanel = ref(null); // 'layout' | 'gap' | 'perRow' | null

function toggleColumnsPanel(panelName) {
  columnsActivePanel.value =
    columnsActivePanel.value === panelName ? null : panelName;
}

const currentColumnsCount = computed(() => {
  return selectedColumnsTarget.value?.node?.childCount || 2;
});

const currentColumnActiveIndex = computed(() => {
  return selectedColumnsTarget.value?.activeColIndex ?? 0;
});

const currentColumnsLayout = computed(() => {
  return selectedColumnsTarget.value?.node?.attrs?.layout || '1:1';
});

const currentColumnsGap = computed(() => {
  return selectedColumnsTarget.value?.node?.attrs?.gap || '16px';
});

// 内联基线的每行栏数（perRow）：1=一排 1 个（堆叠），2=一排 2 个（两两并排）。
// 作用于无 CSS 环境（公众号图文等）与窄屏；宽屏 N 栏一排由 class 适配，与此无关。
const currentColumnsPerRow = computed(() => {
  const value = selectedColumnsTarget.value?.node?.attrs?.perRow;
  return value === 2 ? 2 : 1;
});

function refreshSelectedColumnsNode() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const editor = editorInstance.value;
  const { pos, el } = selectedColumnsTarget.value;
  let node = editor.state.doc.nodeAt(pos);
  let newPos = pos;
  if (!node || node.type.name !== 'columns') {
    // 结构变化后原 pos 可能失效（如删列触发解包）：用 DOM 身份重解析
    if (el && el.isConnected) {
      const fresh = findColumnsNodeAndPos(editor.view, el);
      if (fresh) {
        node = fresh.node;
        newPos = fresh.pos;
      }
    }
    if (!node || node.type.name !== 'columns') {
      // 容器已不存在：关闭工具条，避免停留在错误状态
      clearColumnsSelection();
      return;
    }
    selectedColumnsTarget.value.pos = newPos;
  }
  selectedColumnsTarget.value.node = node;
  syncColumnsHighlight(newPos);
}

/**
 * 将高亮插件的多栏位置与当前选中同步（仅在变化时 dispatch，避免空转）
 */
function syncColumnsHighlight(pos) {
  const editor = editorInstance.value;
  if (!editor || typeof pos !== 'number') return;
  try {
    const cur = appEditorSelectionKey.getState(editor.state)?.columnsPos;
    if (cur !== pos) dispatchColumnsSelected(editor, pos);
  } catch {
    /* 忽略 */
  }
}

function setColumnsLayoutPreset(layoutStr) {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().setColumnsLayout(layoutStr, pos).run();
  refreshSelectedColumnsNode();
  columnsActivePanel.value = null;
}

function resetColumnsEqualWidth() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().resetColumnsEqual(pos).run();
  refreshSelectedColumnsNode();
  columnsActivePanel.value = null;
}

function setColumnsGapValue(gap) {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().setColumnsGap(gap, pos).run();
  refreshSelectedColumnsNode();
  columnsActivePanel.value = null;
}

function setColumnsPerRowValue(perRow) {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().setColumnsPerRow(perRow, pos).run();
  refreshSelectedColumnsNode();
  columnsActivePanel.value = null;
}

function addColumnToCurrent() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().addColumn('after', pos).run();
  refreshSelectedColumnsNode();
}

function deleteCurrentActiveColumn() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos, activeColIndex } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().deleteColumnAtIndex(activeColIndex, pos).run();
  refreshSelectedColumnsNode();
}

function moveCurrentActiveColumnLeft() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos, activeColIndex } = selectedColumnsTarget.value;
  if (activeColIndex <= 0) return;
  editorInstance.value.chain().focus().moveColumnLeft(activeColIndex, pos).run();
  selectedColumnsTarget.value.activeColIndex -= 1;
  refreshSelectedColumnsNode();
}

function moveCurrentActiveColumnRight() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos, activeColIndex } = selectedColumnsTarget.value;
  if (activeColIndex >= currentColumnsCount.value - 1) return;
  editorInstance.value.chain().focus().moveColumnRight(activeColIndex, pos).run();
  selectedColumnsTarget.value.activeColIndex += 1;
  refreshSelectedColumnsNode();
}

function insertParagraphBeforeCurrentColumns() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().insertParagraphBeforeColumns(pos).run();
}

function insertParagraphAfterCurrentColumns() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().insertParagraphAfterColumns(pos).run();
}

function unsetCurrentColumns() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().unsetColumns(pos).run();
  clearAllSelection();
  message.success('已解包分栏并保留全部内容');
}

function deleteCurrentColumns() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().deleteColumns(pos).run();
  clearAllSelection();
  message.success('已删除分栏布局');
}

function getActiveColumnIndex(columnsEl, targetEl) {
  if (!columnsEl || !targetEl) return 0;
  const colEl = targetEl.closest('.cms-column');
  if (!colEl || colEl.parentElement !== columnsEl) return 0;
  const cols = Array.from(columnsEl.querySelectorAll(':scope > .cms-column'));
  const idx = cols.indexOf(colEl);
  return idx >= 0 ? idx : 0;
}

function selectColumns(columnsEl, targetEl = null) {
  if (!columnsEl || !editorInstance.value || !isEditable.value) return;
  const found = findColumnsNodeAndPos(editorInstance.value.view, columnsEl);
  if (!found) return;

  // 注意：禁止用 classList 直改编辑器 DOM（DOMObserver 会判定为外部污染
  // 并重渲染还原）。高亮统一走 selection-plugin 的 Decorations。
  const colIndex = getActiveColumnIndex(columnsEl, targetEl || columnsEl);

  selectedColumnsTarget.value = {
    el: columnsEl,
    pos: found.pos,
    node: found.node,
    activeColIndex: colIndex,
  };
  syncColumnsHighlight(found.pos);
}

function clearColumnsSelection() {
  selectedColumnsTarget.value = null;
  columnsActivePanel.value = null;
  if (editorInstance.value) {
    try {
      const cur = appEditorSelectionKey.getState(editorInstance.value.state)?.columnsPos;
      if (cur !== null && cur !== undefined) {
        dispatchSelectionCleared(editorInstance.value, 'columns');
      }
    } catch {
      /* 忽略 */
    }
  }
}

function clearAllSelection() {
  clearSelection();
  clearColumnsSelection();
  clearTableSelection();
  clearElementSelection();
}

/** 通用元素检查器目标设定（点击基础层） */
function selectElementForTarget(target) {
  const editor = editorInstance.value;
  if (!editor) return;
  // 行内 span（textStyle mark）优先：点谁选谁；无样式文本回落块级解析
  const spanFound = resolveSpanTarget(editor.view, target);
  if (spanFound) {
    applySpanSelection(spanFound);
    return;
  }
  const found = resolveInspectorTarget(editor.view, target, {
    findImageNodeAndPos,
    findVideoNodeAndPos,
    findColumnsNodeAndPos,
    findTableNodeAndPos,
  });
  if (found) {
    applyElementSelection(found, found.el);
  } else {
    clearElementSelection();
  }
}

// ---------------------------------------------------------------------------
// 行内 span（textStyle mark）选中支持
// ---------------------------------------------------------------------------

/** 由文档区间取 span 对应 DOM 元素（区间公共祖先，文本节点取父元素） */
function spanSelectionEl(editor, from, to) {
  try {
    const a = editor.view.domAtPos(from);
    const b = editor.view.domAtPos(to);
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    const container = range.commonAncestorContainer;
    const el = container.nodeType === 1 ? container : container.parentElement;
    return el instanceof HTMLElement ? el : null;
  } catch {
    return null;
  }
}

/** 应用 span 选中：虚线描边 + 面包屑 + 面板回显 inlineStyle */
function applySpanSelection(found) {
  const editor = editorInstance.value;
  if (!editor) return;
  selectedElementTarget.value = {
    kind: 'span',
    from: found.from,
    to: found.to,
    mark: found.mark,
    el: spanSelectionEl(editor, found.from, found.to),
  };
  loadElementForm({ attrs: { style: found.mark.attrs.inlineStyle || '' } });
  refreshElementCrumbs();
  syncSpanHighlight(found.from, found.to);
  nextTick(() => {
    refreshBoxOverlay();
  });
}

function syncSpanHighlight(from, to) {
  const editor = editorInstance.value;
  if (!editor) return;
  try {
    const cur = appEditorSelectionKey.getState(editor.state);
    if (cur?.spanFrom !== from || cur?.spanTo !== to) {
      dispatchSpanSelected(editor, from, to);
    }
  } catch {
    /* 忽略 */
  }
}

/** 在文档区间内找一个带样式的 textStyle mark（范围失效时兜底） */
function findSpanMarkInRange(doc, from, to, markType) {
  let found = null;
  try {
    doc.nodesBetween(from, to, (node) => {
      if (found) return false;
      const mark = node.marks.find(
        (m) => m.type === markType && hasSpanMarkStyles(m.attrs),
      );
      if (mark) found = mark;
      return !found;
    });
  } catch {
    /* 忽略 */
  }
  return found;
}

/** span 样式提交：合并 inlineStyle 后 addMark 覆盖同型 mark（单事务可撤销） */
function commitSpanStyle(updates, removeKeys = []) {
  const editor = editorInstance.value;
  const sel = selectedElementTarget.value;
  if (!editor || !sel || sel.kind !== 'span') return false;
  const markType = editor.state.schema.marks?.textStyle;
  if (!markType) return false;
  const { from, to, mark } = sel;
  let liveMark = mark;
  try {
    if (!editor.state.doc.rangeHasMark(from, to, mark)) {
      const found = findSpanMarkInRange(editor.state.doc, from, to, markType);
      if (!found) {
        clearElementSelection();
        return false;
      }
      liveMark = found;
    }
  } catch {
    clearElementSelection();
    return false;
  }
  const next = mergeStyleDecls(liveMark.attrs.inlineStyle || '', updates, removeKeys);
  const nextMark = liveMark.type.create({ ...liveMark.attrs, inlineStyle: next });
  try {
    // AddMarkStep 会替换同型 mark，无需先 removeMark
    editor.view.dispatch(editor.state.tr.addMark(from, to, nextMark));
    sel.mark = nextMark;
    loadElementForm({ attrs: { style: next || '' } });
    syncSpanHighlight(from, to);
    nextTick(() => {
      refreshBoxOverlay();
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 表格（Table）选择与 Dock 工具条系统
// ---------------------------------------------------------------------------

const selectedTableTarget = ref(null);
// 结构: { el: HTMLElement, pos: number, node: Node }

const currentTableDims = computed(() => {
  const node = selectedTableTarget.value?.node;
  if (!node || node.type.name !== 'table') return { rows: 0, cols: 0 };
  return getTableDimensions(node);
});

function syncTableHighlight(pos) {
  const editor = editorInstance.value;
  if (!editor || typeof pos !== 'number') return;
  try {
    const cur = appEditorSelectionKey.getState(editor.state)?.tablePos;
    if (cur !== pos) dispatchTableSelected(editor, pos);
  } catch {
    /* 忽略 */
  }
}

function refreshSelectedTableNode() {
  if (!editorInstance.value || !selectedTableTarget.value) return;
  const editor = editorInstance.value;
  const { pos, el } = selectedTableTarget.value;
  let node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'table') {
    if (el && el.isConnected) {
      const fresh = findTableNodeAndPos(editor.view, el);
      if (fresh) {
        node = fresh.node;
        selectedTableTarget.value.pos = fresh.pos;
      }
    }
    if (!node || node.type.name !== 'table') {
      clearTableSelection();
      return;
    }
  }
  selectedTableTarget.value.node = node;
  syncTableHighlight(selectedTableTarget.value.pos);
}

function selectTable(tableEl) {
  if (!tableEl || !editorInstance.value || !isEditable.value) return;
  const found = findTableNodeAndPos(editorInstance.value.view, tableEl);
  if (!found) return;

  // 高亮统一走 selection-plugin 的 Decorations，禁止 classList 直改
  selectedTableTarget.value = {
    el: tableEl,
    pos: found.pos,
    node: found.node,
  };
  syncTableHighlight(found.pos);
}

function clearTableSelection() {
  selectedTableTarget.value = null;
  if (editorInstance.value) {
    try {
      const cur = appEditorSelectionKey.getState(editorInstance.value.state)?.tablePos;
      if (cur !== null && cur !== undefined) {
        dispatchSelectionCleared(editorInstance.value, 'table');
      }
    } catch {
      /* 忽略 */
    }
  }
}

// 表格结构操作后刷新（行列增删/合并/底色均保持容器起始位，刷新节点与徽标）
function afterTableMutation(messageText = null) {
  refreshSelectedTableNode();
  if (messageText) message.success(messageText);
}

function deleteCurrentTable() {
  const editor = editorInstance.value;
  if (!editor || !selectedTableTarget.value) return;
  if (editor.chain().focus().deleteTable().run()) {
    afterTableMutation('已删除整个表格');
  }
}

// 单元格底色预设（与高亮色系保持一致）
const CELL_BG_PRESETS = [
  { label: '黄', value: '#fef08a' },
  { label: '绿', value: '#bbf7d0' },
  { label: '蓝', value: '#bae6fd' },
  { label: '粉', value: '#fbcfe8' },
  { label: '灰', value: '#f3f4f6' },
];

function runTableAction(fn, failText = '当前状态无法执行该操作') {
  const editor = editorInstance.value;
  if (!editor || !selectedTableTarget.value) return false;
  let ok;
  try {
    ok = fn();
  } catch {
    ok = false;
  }
  if (ok) {
    refreshSelectedTableNode();
  } else if (failText) {
    message.warning(failText);
  }
  return ok;
}

function setCellBackgroundUi(color) {
  const editor = editorInstance.value;
  if (!editor || !selectedTableTarget.value) return;
  if (editor.chain().focus().setCellBackground(color).run()) {
    refreshSelectedTableNode();
  }
}

// ---------------------------------------------------------------------------
// 通用元素检查器（devtools 式：任意元素选中 + 面包屑 + 样式面板）
// ---------------------------------------------------------------------------

const selectedElementTarget = ref(null);
// 结构: { el: HTMLElement, pos: number, node: Node }

const elementCrumbs = ref([]);
// [{ pos, label }] 由近及远

const elementBoxForm = ref({ mt: '', mr: '', mb: '', ml: '', pt: '', pr: '', pb: '', pl: '' });
// 提交时比对用：外来单位（em/%/auto）原样保留，防止静默丢失
const elementBoxRaw = ref({ mt: '', mr: '', mb: '', ml: '', pt: '', pr: '', pb: '', pl: '' });
const elementBgImageInput = ref('');
const elementRadiusInput = ref('');
const elementRadiusRaw = ref('');
const elementBorderOn = ref(false);
const elementBorderWidth = ref('1px');
const elementDisplay = ref('');
const elementShadow = ref('');
const elementOpacityInput = ref('100');

const INSPECTOR_SHADOW_PRESETS = [
  { label: '无', value: null },
  { label: '柔和', value: '0 2px 8px rgba(0, 0, 0, 0.15)' },
  { label: '中等', value: '0 4px 16px rgba(0, 0, 0, 0.2)' },
  { label: '强烈', value: '0 8px 28px rgba(0, 0, 0, 0.28)' },
];

// 检查器预设：背景色 / 圆角
const INSPECTOR_BG_PRESETS = [
  { label: '无', value: null },
  { label: '黄', value: '#fef08a' },
  { label: '绿', value: '#bbf7d0' },
  { label: '蓝', value: '#bae6fd' },
  { label: '粉', value: '#fbcfe8' },
  { label: '灰', value: '#f3f4f6' },
];

const INSPECTOR_RADIUS_PRESETS = [
  { label: '直角', value: '0' },
  { label: '4', value: '4' },
  { label: '8', value: '8' },
  { label: '16', value: '16' },
];

/** 当前背景图尺寸模式（铺满/完整高亮用） */
const elementBgSize = computed(() => {
  const sel = selectedElementTarget.value;
  if (!sel) return '';
  const style =
    sel.kind === 'span'
      ? sel.mark?.attrs?.inlineStyle || ''
      : sel.node?.attrs?.style || '';
  const m = String(style).match(/background-size\s*:\s*([^;]+)/i);
  return m ? m[1].trim().toLowerCase() : '';
});

/** 上传背景图：复用通用上传，URL 回填后应用 */
function uploadElementBgImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file);
      if (!url) return;
      elementBgImageInput.value = url;
      applyElementBgImage();
    } catch (err) {
      console.error('[app-editor] 背景图上传失败:', err);
    }
  });
  input.click();
}

function syncElementHighlight(pos) {
  const editor = editorInstance.value;
  if (!editor || typeof pos !== 'number') return;
  try {
    const cur = appEditorSelectionKey.getState(editor.state)?.elementPos;
    if (cur !== pos) dispatchElementSelected(editor, pos);
  } catch {
    /* 忽略 */
  }
}

/** 从 node.attrs.style 解析当前盒模型/背景/边框，回显到表单 */
function loadElementForm(node) {
  const style = node?.attrs?.style || '';
  const map = new Map(parseStyleDecls(style));
  // 输入框只吃 px 数字；外来单位原样显示，提交时比对保留（见 commitElementBox）
  const numOrRaw = (raw) => {
    if (!raw) return '';
    const m = String(raw).trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
    return m ? m[1] : String(raw).trim();
  };
  const margin = expandBoxSides(style, 'margin');
  const padding = expandBoxSides(style, 'padding');
  elementBoxForm.value = {
    mt: numOrRaw(margin.top),
    mr: numOrRaw(margin.right),
    mb: numOrRaw(margin.bottom),
    ml: numOrRaw(margin.left),
    pt: numOrRaw(padding.top),
    pr: numOrRaw(padding.right),
    pb: numOrRaw(padding.bottom),
    pl: numOrRaw(padding.left),
  };
  elementBoxRaw.value = { ...elementBoxForm.value };
  const bg = map.get('background-image') || '';
  const urlMatch = bg.match(/url\(["']?(.*?)["']?\)/i);
  elementBgImageInput.value = urlMatch ? urlMatch[1] : '';
  const radius = map.get('border-radius') || '';
  const radiusMatch = radius.match(/^(-?\d+(?:\.\d+)?)px$/i);
  elementRadiusInput.value = radiusMatch ? radiusMatch[1] : String(radius || '').trim();
  elementRadiusRaw.value = String(radius || '').trim();
  const borderVal = (map.get('border') || '').trim();
  elementBorderOn.value = borderVal !== '' && !/^none$/i.test(borderVal);
  const widthMatch = borderVal.match(/(\d+(?:\.\d+)?px)/i);
  elementBorderWidth.value = widthMatch ? widthMatch[1] : '1px';
  const displayRaw = String(map.get('display') || '').trim().toLowerCase();
  elementDisplay.value = DISPLAY_OPTIONS.some((o) => o.value === displayRaw) ? displayRaw : '';
  elementShadow.value = String(map.get('box-shadow') || '').trim();
  const opacityRaw = String(map.get('opacity') || '').trim();
  if (opacityRaw === '') {
    elementOpacityInput.value = '100';
  } else {
    const opNum = Number(opacityRaw);
    elementOpacityInput.value = !Number.isNaN(opNum) ? String(Math.round(opNum * 100)) : '100';
  }
}

function refreshElementCrumbs() {
  const sel = selectedElementTarget.value;
  const editor = editorInstance.value;
  if (!sel || !editor) {
    elementCrumbs.value = [];
    return;
  }
  if (sel.kind === 'span') {
    // span 目标：链首为自身，其后为所在文本块的块级祖先链
    try {
      elementCrumbs.value = [
        { pos: sel.from, label: 'span 样式', span: true, hasManaged: true },
        ...ancestorChain(editor.state.doc, sel.from),
      ];
    } catch {
      elementCrumbs.value = [];
    }
    return;
  }
  try {
    elementCrumbs.value = buildCrumbChain(
      editor.state.doc,
      sel.pos,
      sel.node,
      sel.origin || null,
    );
  } catch {
    elementCrumbs.value = [];
  }
}

/** 面包屑点击：span 链首回选自身，其余切换到祖先块 */
function onCrumbClick(crumb) {
  if (crumb.span) {
    const sel = selectedElementTarget.value;
    if (sel?.kind === 'span' && sel.mark) {
      applySpanSelection({ from: sel.from, to: sel.to, mark: sel.mark });
    }
    return;
  }
  selectElementAncestor(crumb.pos);
}

/** 面包屑激活态：span 链首或节点位置匹配 */
function isCrumbActive(crumb) {
  const sel = selectedElementTarget.value;
  if (!sel) return false;
  if (crumb.span) return sel.kind === 'span';
  return sel.kind !== 'span' && crumb.pos === sel.pos;
}

// ---------------------------------------------------------------------------
// 盒模型 overlay（devtools 配色：margin 橙 / padding 绿 / content 蓝）
// 纯展示 fixed 层，pointer-events:none，不拦截任何点击
// ---------------------------------------------------------------------------

const boxOverlay = reactive({
  visible: false,
  margin: null,
  padding: null,
  content: null,
  // margin/padding 环带宽度（环带外渲染色块，中心内容区保持透明）
  marginRing: null,
  paddingRing: null,
  clip: 'none',
});

/** 是否悬浮在选中元素上（色块仅 hover 显示，平时只留虚线框） */
const isHoveringSelected = ref(false);
let hoverRaf = 0;

function resolveHoverElement() {
  const sel = selectedElementTarget.value;
  const editor = editorInstance.value;
  if (sel && editor) {
    if (sel.kind === 'span') {
      let spanEl = sel.el && sel.el.isConnected ? sel.el : null;
      if (!spanEl) {
        spanEl = spanSelectionEl(editor, sel.from, sel.to);
        if (spanEl) sel.el = spanEl;
      }
      return spanEl;
    }
    let el = sel.el && sel.el.isConnected ? sel.el : null;
    if (!el) {
      try {
        const dom = editor.view.nodeDOM(sel.pos);
        el = dom instanceof HTMLElement ? dom : null;
      } catch {
        el = null;
      }
    }
    if (el && el.isConnected) return el;
  }
  if (selectedTarget.value?.el && selectedTarget.value.el.isConnected) {
    return selectedTarget.value.el;
  }
  if (selectedColumnsTarget.value?.el && selectedColumnsTarget.value.el.isConnected) {
    return selectedColumnsTarget.value.el;
  }
  return null;
}

function onHoverMove(event) {
  const hasTarget = selectedElementTarget.value || selectedTarget.value || selectedColumnsTarget.value;
  if (!hasTarget) {
    if (isHoveringSelected.value) isHoveringSelected.value = false;
    return;
  }
  if (hoverRaf) return;
  const x = event.clientX;
  const y = event.clientY;
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0;
    const currentTarget = selectedElementTarget.value || selectedTarget.value || selectedColumnsTarget.value;
    if (!currentTarget) {
      isHoveringSelected.value = false;
      return;
    }
    const el = resolveHoverElement();
    let inside = false;
    if (el) {
      try {
        const m = boxOverlay.margin;
        const rect = (boxOverlay.visible && m && m.width > 0) ? m : el.getBoundingClientRect();
        const rRight = rect.right !== undefined ? rect.right : (rect.left + rect.width);
        const rBottom = rect.bottom !== undefined ? rect.bottom : (rect.top + rect.height);
        inside =
          rect.width > 0 &&
          rect.height > 0 &&
          x >= rect.left &&
          x <= rRight &&
          y >= rect.top &&
          y <= rBottom;
      } catch {
        inside = false;
      }
    }
    if (isHoveringSelected.value !== inside) {
      isHoveringSelected.value = inside;
    }
  });
}

function onHoverLeave() {
  if (hoverRaf) {
    cancelAnimationFrame(hoverRaf);
    hoverRaf = 0;
  }
  if (isHoveringSelected.value) isHoveringSelected.value = false;
}

/**
 * 盒模型分层样式。
 * @param rect 层矩形（视口坐标）
 * @param ring 环带宽度 {top,right,bottom,left}；null 表示无环带可画
 * @param mode 'border'=margin 层用 border 画环带；'clip'=padding 层用
 *             background-clip:content-box 画环带；'fill'=content 层整面填充
 * 无 margin/padding 的节点（如图片）三层矩形完全重合，环带为 0 →
 * margin/padding 层直接隐藏，内容区上只剩 content 层淡色，不再三层叠加成色罩
 */
function boxLayerStyle(rect, ring = null, mode = 'fill') {
  if (!rect) return { display: 'none' };
  if (mode !== 'fill' && !ring) return { display: 'none' };
  const style = {
    left: `${Math.round(rect.left)}px`,
    top: `${Math.round(rect.top)}px`,
    width: `${Math.max(0, Math.round(rect.width))}px`,
    height: `${Math.max(0, Math.round(rect.height))}px`,
    boxSizing: 'border-box',
  };
  if (mode === 'border' && ring) {
    style.borderStyle = 'solid';
    style.borderWidth = `${ring.top}px ${ring.right}px ${ring.bottom}px ${ring.left}px`;
  } else if (mode === 'clip' && ring) {
    style.padding = `${ring.top}px ${ring.right}px ${ring.bottom}px ${ring.left}px`;
    style.backgroundClip = 'content-box';
  }
  return style;
}

/** 内外两矩形相减得环带宽度；无环带（重合/负值）返回 null */
function boxRingOf(outer, inner) {
  if (!outer || !inner) return null;
  const ring = {
    top: Math.max(0, Math.round(inner.top - outer.top)),
    right: Math.max(0, Math.round(outer.left + outer.width - (inner.left + inner.width))),
    bottom: Math.max(0, Math.round(outer.top + outer.height - (inner.top + inner.height))),
    left: Math.max(0, Math.round(inner.left - outer.left)),
  };
  const empty =
    ring.top === 0 && ring.right === 0 && ring.bottom === 0 && ring.left === 0;
  return empty ? null : ring;
}

function refreshBoxOverlay() {
  const sel = selectedElementTarget.value;
  const editor = editorInstance.value;
  if (!sel || !editor) {
    boxOverlay.visible = false;
    return;
  }
  let el = sel.el && sel.el.isConnected ? sel.el : null;
  if (!el && sel.kind === 'span') {
    el = spanSelectionEl(editor, sel.from, sel.to);
    if (el) sel.el = el;
  }
  if (!el) {
    try {
      const dom = editor.view.nodeDOM(sel.pos);
      el = dom instanceof HTMLElement ? dom : null;
    } catch {
      el = null;
    }
  }
  if (!el || !el.isConnected) {
    boxOverlay.visible = false;
    return;
  }
  let rect = null;
  try {
    rect = el.getBoundingClientRect();
  } catch {
    rect = null;
  }
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) {
    boxOverlay.visible = false;
    return;
  }
  // 完全滚出视口则隐藏
  if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
    boxOverlay.visible = false;
    return;
  }
  let node = sel.node;
  let styleSource = '';
  if (sel.kind === 'span') {
    // span 目标：样式来自 mark 的 inlineStyle 属性
    styleSource = sel.mark?.attrs?.inlineStyle || '';
  } else {
    try {
      node = editor.state.doc.nodeAt(sel.pos) ?? node;
    } catch {}
    styleSource = node?.attrs?.style || '';
  }
  const layers = computeBoxOverlay(rect, styleSource);
  if (!layers) {
    boxOverlay.visible = false;
    return;
  }
  boxOverlay.margin = layers.margin;
  boxOverlay.padding = layers.padding;
  boxOverlay.content = layers.content;
  boxOverlay.marginRing = boxRingOf(layers.margin, layers.padding);
  boxOverlay.paddingRing = boxRingOf(layers.padding, layers.content);
  // 裁剪到编辑器内容视口（.vben-tiptap，工具栏以下的滚动区），
  // 元素滚出可视区或贴近边缘时色块不会盖到工具栏 / 页面其他区域
  const viewport = editorContainerRef.value?.querySelector(
    '.app-editor-wrapper .vben-tiptap',
  );
  const clipEl = viewport instanceof HTMLElement ? viewport : editorContainerRef.value;
  boxOverlay.clip = 'none';
  if (clipEl) {
    try {
      const vr = clipEl.getBoundingClientRect();
      if (vr.width > 0 && vr.height > 0) {
        const top = Math.max(0, vr.top);
        const right = Math.max(0, window.innerWidth - vr.right);
        const bottom = Math.max(0, window.innerHeight - vr.bottom);
        const left = Math.max(0, vr.left);
        if (top + bottom < window.innerHeight && left + right < window.innerWidth) {
          boxOverlay.clip = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
        } else {
          boxOverlay.clip = 'none';
        }
      }
    } catch {
      boxOverlay.clip = 'none';
    }
  }
  boxOverlay.visible = true;
}

function applyElementSelection(found, el) {
  selectedElementTarget.value = {
    kind: 'node',
    el: el || null,
    pos: found.pos,
    node: found.node,
    origin: found.origin && found.origin.pos !== found.pos ? found.origin : null,
  };
  loadElementForm(found.node);
  refreshElementCrumbs();
  syncElementHighlight(found.pos);
  nextTick(() => {
    refreshBoxOverlay();
  });
}

/** 点击切换面包屑祖先 */
function selectElementAncestor(pos) {
  const editor = editorInstance.value;
  if (!editor || typeof pos !== 'number') return;
  const node = tryNodeAt(editor, pos);
  if (!node || node.type.name === 'doc') return;
  applyElementSelection({ pos, node }, tryNodeDOM(editor, pos));
}

function clearElementSelection() {
  selectedElementTarget.value = null;
  elementCrumbs.value = [];
  boxOverlay.visible = false;
  boxOverlay.clip = 'none';
  boxOverlay.marginRing = null;
  boxOverlay.paddingRing = null;
  isHoveringSelected.value = false;
  if (editorInstance.value) {
    try {
      const cur = appEditorSelectionKey.getState(editorInstance.value.state);
      if (cur?.elementPos !== null && cur?.elementPos !== undefined) {
        dispatchSelectionCleared(editorInstance.value, 'element');
      }
      if (cur?.spanFrom !== null && cur?.spanFrom !== undefined) {
        dispatchSelectionCleared(editorInstance.value, 'span');
      }
    } catch {
      /* 忽略 */
    }
  }
}

/** 操作前重解析元素实时位置（el 优先，失联则校验存储 pos） */
function resolveElementPos() {
  const sel = selectedElementTarget.value;
  const editor = editorInstance.value;
  if (!sel || !editor) return null;
  // span 目标没有节点位置，块级操作路径不适用
  if (sel.kind === 'span') return null;
  if (sel.el && sel.el.isConnected) {
    try {
      const fresh = resolveInspectorTarget(editor.view, sel.el, {
        findImageNodeAndPos,
        findVideoNodeAndPos,
        findColumnsNodeAndPos,
        findTableNodeAndPos,
      });
      if (fresh && fresh.node) {
        sel.pos = fresh.pos;
        sel.node = editor.state.doc.nodeAt(fresh.pos) ?? fresh.node;
        return fresh.pos;
      }
    } catch {
      /* 掉入存储 pos 校验 */
    }
  }
  try {
    const node = editor.state.doc.nodeAt(sel.pos);
    if (node && node.type.name !== 'doc') {
      sel.node = node;
      return sel.pos;
    }
  } catch {
    /* 忽略 */
  }
  return null;
}

function refreshSelectedElementNode() {
  const sel = selectedElementTarget.value;
  if (!sel) return;
  if (sel.kind === 'span') {
    loadElementForm({ attrs: { style: sel.mark?.attrs?.inlineStyle || '' } });
    refreshElementCrumbs();
    syncSpanHighlight(sel.from, sel.to);
    return;
  }
  const pos = resolveElementPos();
  if (pos === null) {
    clearElementSelection();
    return;
  }
  loadElementForm(selectedElementTarget.value.node);
  refreshElementCrumbs();
  syncElementHighlight(pos);
}

// ---------------------------------------------------------------------------
// 检查器样式提交（全部走 setNodeMarkup 单事务，可撤销）
// ---------------------------------------------------------------------------

function commitElementStyle(updates, removeKeys = []) {
  const editor = editorInstance.value;
  if (!editor || !selectedElementTarget.value) return false;
  // span（textStyle mark）目标：走 addMark 路径更新 inlineStyle
  if (selectedElementTarget.value.kind === 'span') {
    return commitSpanStyle(updates, removeKeys);
  }
  const pos = resolveElementPos();
  if (pos === null) {
    clearElementSelection();
    return false;
  }
  const node = selectedElementTarget.value.node;
  const next = mergeStyleDecls(node.attrs.style, updates, removeKeys);
  try {
    const tr = editor.state.tr.setNodeMarkup(pos, null, {
      ...node.attrs,
      style: next,
    });
    editor.view.dispatch(tr);
    selectedElementTarget.value.node = editor.state.doc.nodeAt(pos);
    loadElementForm(selectedElementTarget.value.node);
    syncElementHighlight(pos);
    nextTick(() => {
      refreshBoxOverlay();
    });
    return true;
  } catch {
    return false;
  }
}

/** 盒模型提交：数字转 px；与加载时一致的外来值原样保留；其他清空 */
function boxSideValue(input, loadedRaw) {
  if (input === null || input === undefined || String(input).trim() === '') return null;
  const n = Number(String(input).trim());
  if (!Number.isNaN(n)) return `${n}px`;
  if (String(input).trim() === String(loadedRaw || '').trim() && loadedRaw) return loadedRaw;
  return null;
}

function commitElementBox() {
  const f = elementBoxForm.value;
  const r = elementBoxRaw.value;
  commitElementStyle([
    ['margin-top', boxSideValue(f.mt, r.mt)],
    ['margin-right', boxSideValue(f.mr, r.mr)],
    ['margin-bottom', boxSideValue(f.mb, r.mb)],
    ['margin-left', boxSideValue(f.ml, r.ml)],
    ['padding-top', boxSideValue(f.pt, r.pt)],
    ['padding-right', boxSideValue(f.pr, r.pr)],
    ['padding-bottom', boxSideValue(f.pb, r.pb)],
    ['padding-left', boxSideValue(f.pl, r.pl)],
  ]);
}

function clearElementBox(side) {
  // side: 'margin' | 'padding'，清空该组四边
  const f = elementBoxForm.value;
  if (side === 'margin') {
    f.mt = f.mr = f.mb = f.ml = '';
  } else {
    f.pt = f.pr = f.pb = f.pl = '';
  }
  commitElementBox();
}

function setElementAlign(align) {
  const editor = editorInstance.value;
  const sel = selectedElementTarget.value;
  if (!editor || !sel) return;
  // 文本块走 TextAlign 命令（与顶栏状态一致），其他块不支持
  if (!sel.node || !sel.node.isTextblock) return;
  editor.chain().focus().setTextAlign(align).run();
  refreshSelectedElementNode();
}

function setElementBgColor(color) {
  commitElementStyle([['background-color', color || null]]);
}

function applyElementBgImage() {
  const url = elementBgImageInput.value.trim();
  if (!url) {
    clearElementBgImage();
    return;
  }
  commitElementStyle([
    ['background-image', `url("${url}")`],
    ['background-size', 'cover'],
    ['background-repeat', 'no-repeat'],
    ['background-position', 'center'],
  ]);
}

function setElementBgSize(size) {
  if (!elementBgImageInput.value.trim()) return;
  commitElementStyle([['background-size', size]]);
}

function clearElementBgImage() {
  elementBgImageInput.value = '';
  commitElementStyle(
    [],
    ['background-image', 'background-size', 'background-repeat', 'background-position'],
  );
}

function applyElementRadius() {
  const input = String(elementRadiusInput.value || '').trim();
  if (input === '') {
    commitElementStyle([['border-radius', null]]);
    return;
  }
  const n = Number(input);
  if (!Number.isNaN(n)) {
    commitElementStyle([['border-radius', `${n}px`]]);
    return;
  }
  // 非数字：与加载值一致则保留，否则清空
  commitElementStyle([
    ['border-radius', input === elementRadiusRaw.value && elementRadiusRaw.value ? elementRadiusRaw.value : null],
  ]);
}

function toggleElementBorder() {
  if (elementBorderOn.value) {
    elementBorderOn.value = false;
    commitElementStyle([], ['border']);
    return;
  }
  elementBorderOn.value = true;
  commitElementStyle([['border', `${elementBorderWidth.value} solid #d1d5db`]]);
}

function setElementBorderColor(color) {
  if (!color) {
    commitElementStyle([], ['border']);
    elementBorderOn.value = false;
    return;
  }
  elementBorderOn.value = true;
  commitElementStyle([['border', `${elementBorderWidth.value} solid ${color}`]]);
}

function setElementDisplay(value) {
  elementDisplay.value = value || '';
  commitElementStyle([['display', value || null]]);
}

function setElementShadow(value) {
  elementShadow.value = value || '';
  commitElementStyle([['box-shadow', value || null]]);
}

function commitElementOpacity() {
  const raw = String(elementOpacityInput.value ?? '').trim();
  if (raw === '') {
    commitElementStyle([['opacity', null]]);
    return;
  }
  const n = Number(raw);
  if (Number.isNaN(n)) return;
  const clamped = Math.max(0, Math.min(100, n));
  elementOpacityInput.value = String(clamped);
  commitElementStyle([['opacity', clamped >= 100 ? null : String(clamped / 100)]]);
}

function resetElementStyles() {
  const ok = commitElementStyle([], [...MANAGED_STYLE_KEYS]);
  if (ok) {
    // span 目标的表单已由 commitSpanStyle 按 inlineStyle 重载，勿再清空
    if (selectedElementTarget.value?.kind !== 'span') {
      loadElementForm(selectedElementTarget.value?.node);
    }
    message.success('已重置该元素的检查器样式');
  }
}

// ---------------------------------------------------------------------------
// 检查器块操作（上下移/复制/删除/插行，失败 toast 说明原因）
// ---------------------------------------------------------------------------

/** 安全读取节点/DOM（失败返回 null，不抛错） */
function tryNodeAt(editor, pos) {
  try {
    return editor.state.doc.nodeAt(pos) || null;
  } catch {
    return null;
  }
}

function tryNodeDOM(editor, pos) {
  try {
    const dom = editor.view.nodeDOM(pos);
    return dom instanceof HTMLElement ? dom : null;
  } catch {
    return null;
  }
}

function reselectElementAt(pos) {
  const editor = editorInstance.value;
  if (!editor || typeof pos !== 'number') return;
  const node = tryNodeAt(editor, pos);
  if (!node) {
    clearElementSelection();
    return;
  }
  applyElementSelection(
    { pos, node },
    tryNodeDOM(editor, pos) || selectedElementTarget.value?.el || null,
  );
}

function runElementOp(fn) {
  const editor = editorInstance.value;
  const sel = selectedElementTarget.value;
  if (!editor || !sel) return;
  if (sel.kind === 'span') {
    message.info('行内样式文本不支持块操作');
    return;
  }
  const pos = resolveElementPos();
  if (pos === null) {
    clearElementSelection();
    return;
  }
  let result;
  try {
    result = fn(editor, pos);
  } catch {
    result = { ok: false };
  }
  if (!result || !result.ok) {
    if (result?.reason) message.warning(result.reason);
    return;
  }
  if (typeof result.newPos === 'number') {
    reselectElementAt(result.newPos);
  } else {
    refreshSelectedElementNode();
  }
}

function moveSelectedElement(direction) {
  runElementOp((editor, pos) => moveElement(editor, pos, direction));
}

function duplicateSelectedElement() {
  runElementOp((editor, pos) => {
    const r = duplicateElement(editor, pos);
    if (r.ok) message.success('已复制当前块');
    return r;
  });
}

function deleteSelectedElement() {
  runElementOp((editor, pos) => {
    const r = deleteElement(editor, pos);
    if (r.ok) {
      clearElementSelection();
      message.success('已删除选中块');
    }
    return { ok: false };
  });
}

function insertParagraphBesideSelected(direction) {
  runElementOp((editor, pos) => insertParagraphBeside(editor, pos, direction));
}

// ---------------------------------------------------------------------------
// 全宽通栏（.web-bleed）开关：配合 .web-article 突破内容列跨满整行
// ---------------------------------------------------------------------------

const isElementBleed = computed(() => {
  const node = selectedElementTarget.value?.node;
  if (!node) return false;
  return (node.attrs?.class || '').split(/\s+/).includes('web-bleed');
});

function toggleElementBleed() {
  const sel = selectedElementTarget.value;
  const editor = editorInstance.value;
  if (!editor || !sel) return;
  const pos = resolveElementPos();
  if (pos === null) return;
  const node = tryNodeAt(editor, pos);
  if (!node) return;

  const currentClass = node.attrs?.class || '';
  const classList = currentClass.split(/\s+/).filter(Boolean);
  const hasBleed = classList.includes('web-bleed');
  const nextClassList = hasBleed
    ? classList.filter((c) => c !== 'web-bleed')
    : [...classList, 'web-bleed'];
  const nextClass = nextClassList.join(' ');

  const tr = editor.state.tr;
  tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    class: nextClass || null,
  });
  editor.view.dispatch(tr);
  refreshSelectedElementNode();
  message.success(
    hasBleed ? '已恢复为普通正文内容宽' : '已设置为全宽通栏 (已添加 .web-bleed)',
  );
}

const isColumnsBleed = computed(() => {
  const node = selectedColumnsTarget.value?.node;
  if (!node) return false;
  return (node.attrs?.class || '').split(/\s+/).includes('web-bleed');
});

function toggleColumnsBleed() {
  if (!selectedColumnsTarget.value || !editorInstance.value) return;
  const { pos, node } = selectedColumnsTarget.value;
  const currentClass = node.attrs?.class || '';
  const classList = currentClass.split(/\s+/).filter(Boolean);
  const hasBleed = classList.includes('web-bleed');
  const nextClassList = hasBleed
    ? classList.filter((c) => c !== 'web-bleed')
    : [...classList, 'web-bleed'];
  const nextClass = nextClassList.join(' ');

  const tr = editorInstance.value.state.tr;
  tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    class: nextClass || null,
  });
  editorInstance.value.view.dispatch(tr);
  selectedColumnsTarget.value.node = editorInstance.value.state.doc.nodeAt(pos);
  message.success(
    hasBleed ? '多栏已恢复为普通正文内容宽' : '多栏已设置为全宽通栏 (已添加 .web-bleed)',
  );
}

const isColumnsInsetStart = computed(() => {
  const node = selectedColumnsTarget.value?.node;
  if (!node) return false;
  return (node.attrs?.class || '').split(/\s+/).includes('cms-columns--inset-start');
});

const isColumnsInsetEnd = computed(() => {
  const node = selectedColumnsTarget.value?.node;
  if (!node) return false;
  return (node.attrs?.class || '').split(/\s+/).includes('cms-columns--inset-end');
});

function toggleColumnsInset(side) {
  if (!selectedColumnsTarget.value || !editorInstance.value) return;
  const { pos, node } = selectedColumnsTarget.value;
  const cls = side === 'end' ? 'cms-columns--inset-end' : 'cms-columns--inset-start';
  const currentClass = node.attrs?.class || '';
  const classList = currentClass.split(/\s+/).filter(Boolean);
  const has = classList.includes(cls);
  const nextClass = (has ? classList.filter((c) => c !== cls) : [...classList, cls]).join(' ');

  const tr = editorInstance.value.state.tr;
  tr.setNodeMarkup(pos, null, { ...node.attrs, class: nextClass || null });
  editorInstance.value.view.dispatch(tr);
  selectedColumnsTarget.value.node = editorInstance.value.state.doc.nodeAt(pos);
  message.success(
    has
      ? side === 'end'
        ? '末列已恢复出血（贴视口右缘）'
        : '首列已恢复出血（贴视口左缘）'
      : side === 'end'
        ? '末列已内收（右缘对齐内容列）'
        : '首列已内收（左缘对齐内容列）',
  );
}

const isColumnsEqualHeight = computed(() => {
  const node = selectedColumnsTarget.value?.node;
  if (!node) return false;
  return (node.attrs?.class || '').split(/\s+/).includes('cms-columns--equal-height');
});

function toggleColumnsEqualHeight() {
  if (!selectedColumnsTarget.value || !editorInstance.value) return;
  const { pos, node } = selectedColumnsTarget.value;
  const cls = 'cms-columns--equal-height';
  const currentClass = node.attrs?.class || '';
  const classList = currentClass.split(/\s+/).filter(Boolean);
  const has = classList.includes(cls);
  const nextClass = (has ? classList.filter((c) => c !== cls) : [...classList, cls]).join(' ');

  const tr = editorInstance.value.state.tr;
  tr.setNodeMarkup(pos, null, { ...node.attrs, class: nextClass || null });
  editorInstance.value.view.dispatch(tr);
  selectedColumnsTarget.value.node = editorInstance.value.state.doc.nodeAt(pos);
  message.success(
    has ? '已关闭多栏等高铺满' : '已开启多栏等高铺满（各栏以最高者为准自动铺满）',
  );
}

const isMediaBleed = computed(() => {
  const node = selectedTarget.value?.node;
  if (!node) return false;
  return (node.attrs?.class || '').split(/\s+/).includes('web-bleed');
});

function toggleMediaBleed() {
  if (!selectedTarget.value || !editorInstance.value) return;
  const editor = editorInstance.value;
  const { pos, node } = selectedTarget.value;
  const currentClass = node.attrs?.class || '';
  const classList = currentClass.split(/\s+/).filter(Boolean);
  const hasBleed = classList.includes('web-bleed');
  const nextClassList = hasBleed
    ? classList.filter((c) => c !== 'web-bleed')
    : [...classList, 'web-bleed'];
  const nextClass = nextClassList.join(' ');

  const tr = editor.state.tr;
  tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    class: nextClass || null,
  });

  // 若媒体在段落内，同步更新/移除外层段落的 web-bleed 类名（双重保障）
  try {
    const $pos = editor.state.doc.resolve(pos);
    if ($pos.depth >= 1) {
      const parentNode = $pos.node(1);
      const parentPos = $pos.before(1);
      if (parentNode && parentNode.type.name === 'paragraph') {
        const pClassList = (parentNode.attrs?.class || '').split(/\s+/).filter(Boolean);
        const pNextClassList = hasBleed
          ? pClassList.filter((c) => c !== 'web-bleed')
          : (pClassList.includes('web-bleed') ? pClassList : [...pClassList, 'web-bleed']);
        tr.setNodeMarkup(parentPos, null, {
          ...parentNode.attrs,
          class: pNextClassList.join(' ') || null,
        });
      }
    }
  } catch {
    /* 忽略 */
  }

  editor.view.dispatch(tr);
  selectedTarget.value.node = editor.state.doc.nodeAt(pos);
  message.success(
    hasBleed ? '媒体已恢复为普通正文内容宽' : '媒体已设置为全宽通栏 (已添加 .web-bleed)',
  );
}

// ---------------------------------------------------------------------------
// Dock 全局模式：文档级一键排版（全部可撤销）
// ---------------------------------------------------------------------------

const isGlobalActionDisabled = computed(() => !isEditable.value);

function justifyAllContent() {
  if (!editorInstance.value || isGlobalActionDisabled.value) return;
  if (justifyAllContentDoc(editorInstance.value)) {
    message.success('已将全文设置为两端对齐');
  }
}

function unifyAllLineHeight() {
  if (!editorInstance.value || isGlobalActionDisabled.value) return;
  if (unifyAllLineHeightDoc(editorInstance.value, '1.75')) {
    message.success('已将全文行高统一为 1.75');
  }
}

function cleanEmptyParagraphsUi() {
  if (!editorInstance.value || isGlobalActionDisabled.value) return;
  const removed = cleanEmptyTopParagraphs(editorInstance.value);
  if (removed > 0) {
    message.success(`已清除 ${removed} 个空段落`);
  } else {
    message.info('没有可清除的空段落');
  }
}

/**
 * 复制输出样式定义（content-styles.css 全文）：供自有站点落地页粘贴使用。
 * 不支持自定义 class 的终端（如微信公众号）可忽略，内联样式已兜底。
 */
async function copyContentStyles() {
  try {
    await navigator.clipboard.writeText(contentStylesCss);
    message.success('已复制输出样式定义，可粘贴到落地页使用');
  } catch {
    message.warning('复制失败，请重试');
  }
}

// ---------------------------------------------------------------------------
// Bubble / Floating 快捷菜单
// ---------------------------------------------------------------------------

function shouldShowBubbleMenu({ state, editor }) {
  if (!editor?.isEditable) return false;
  const { from, to } = state.selection;
  if (from === to) return false;
  try {
    const $from = state.doc.resolve(from);
    // 代码块内不打扰
    for (let d = $from.depth; d > 0; d -= 1) {
      if ($from.node(d).type.name === 'codeBlock') return false;
    }
  } catch {}
  return true;
}

function shouldShowFloatingMenu({ state, editor }) {
  if (!editor?.isEditable) return false;
  try {
    const { $from } = state.selection;
    // 仅顶层空段落（与官方默认一致，避免栏内/表格内误弹）
    return $from.depth <= 1 && $from.parent.isTextblock && !$from.parent.textContent;
  } catch {
    return false;
  }
}

function floatingInsert(kind) {
  const editor = editorInstance.value;
  if (!editor || !isEditable.value) return;
  const chain = editor.chain().focus();
  if (kind === 'paragraph') {
    chain.setParagraph().run();
    return;
  }
  if (kind === 'columns') {
    chain.insertColumns({ cols: 2, layout: '1:1', keepContent: true }).run();
    return;
  }
  if (kind === 'table') {
    chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }
}

// ---------------------------------------------------------------------------
// 中文校对（服务经 fetchProofread 注入；问题模型 { id, snippet, message, suggestions[] }）
// ---------------------------------------------------------------------------

const proofreadIssues = ref([]);
const proofreading = ref(false);
let proofreadSeq = 0;

const proofreadConfigured = computed(() => {
  const fn = props.fetchProofread;
  return typeof fn === 'function';
});

async function runProofread() {
  const editor = editorInstance.value;
  const fn = props.fetchProofread;
  if (!editor || typeof fn !== 'function' || proofreading.value) return;
  proofreading.value = true;
  try {
    const text = editor.getText();
    const list = await fn(text);
    proofreadIssues.value = (Array.isArray(list) ? list : [])
      .filter((it) => it && it.text)
      .slice(0, 100)
      .map((it) => ({
        id: `pr-${(proofreadSeq += 1)}`,
        snippet: String(it.text),
        message: String(it.message || '疑似问题'),
        suggestions: Array.isArray(it.suggestions) ? it.suggestions.map(String).slice(0, 3) : [],
      }));
    if (proofreadIssues.value.length === 0) {
      message.success('校对完成，未发现问题');
    } else {
      message.warning(`发现 ${proofreadIssues.value.length} 处疑似问题`);
    }
  } catch (error) {
    console.error('[app-editor] 校对失败:', error);
    message.error('校对服务调用失败');
  } finally {
    proofreading.value = false;
  }
}

function locateProofreadIssue(issue) {
  const editor = editorInstance.value;
  if (!editor || !issue?.snippet) return;
  const range = findTextRange(editor.state.doc, issue.snippet);
  if (!range) {
    message.info('文中已找不到该片段，可能已修改');
    return;
  }
  selectRangeInEditorAt(editor, range.from, range.to);
}

function selectRangeInEditorAt(editor, from, to) {
  try {
    const doc = editor.state.doc;
    const maxPos = Math.max(0, doc.content.size - 1);
    const safeFrom = Math.max(0, Math.min(from, maxPos));
    const safeTo = Math.max(safeFrom, Math.min(to, doc.content.size));
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(doc, safeFrom, safeTo)),
    );
    editor.commands.focus();
    editor.commands.scrollIntoView();
  } catch {
    try {
      editor.chain().focus().run();
    } catch {}
  }
}

function applyProofreadSuggestion(issue, suggestion) {
  const editor = editorInstance.value;
  if (!editor || !issue?.snippet || suggestion === undefined) return;
  const range = findTextRange(editor.state.doc, issue.snippet);
  if (!range) {
    message.info('文中已找不到该片段，可能已修改');
    return;
  }
  try {
    const tr = editor.state.tr.replaceWith(
      range.from,
      range.to,
      editor.schema.text(String(suggestion)),
    );
    editor.view.dispatch(tr);
    // 位置可能整体漂移，清空剩余并提示重查（诚实简单，避免错改）
    proofreadIssues.value = [];
    message.success('已应用替换，建议重新检查');
  } catch (err) {
    console.error('[app-editor] 应用校对替换失败:', err);
  }
}

function dismissProofreadIssue(issue) {
  if (!issue) return;
  proofreadIssues.value = proofreadIssues.value.filter((it) => it.id !== issue.id);
}

function clearProofreadIssues() {
  proofreadIssues.value = [];
}

const selectedTarget = ref(null);
// 结构: { type: 'image' | 'video', el, pos, node }

function onVideoPlayStateChange() {
  const el = selectedTarget.value?.el;
  if (el && el.tagName === 'VIDEO') {
    isVideoPlaying.value = !el.paused;
  }
}

function clearSelection() {
  if (selectedTarget.value) {
    // 注意：禁止用 classList 直改编辑器 DOM（DOMObserver 会判定为外部污染
    // 并重渲染还原）。高亮统一走 selection-plugin 的 Decorations。
    if (selectedTarget.value.type === 'video' && selectedTarget.value.el) {
      selectedTarget.value.el.removeEventListener('play', onVideoPlayStateChange);
      selectedTarget.value.el.removeEventListener('pause', onVideoPlayStateChange);
      selectedTarget.value.el.removeEventListener('ended', onVideoPlayStateChange);
    }
    selectedTarget.value = null;
  }
  activePanel.value = null;
  handleVisible.value = false;
  if (editorInstance.value) {
    try {
      const cur = appEditorSelectionKey.getState(editorInstance.value.state);
      if (cur && (cur.mediaPos !== null && cur.mediaPos !== undefined)) {
        dispatchSelectionCleared(editorInstance.value, 'media');
      }
    } catch {
      /* 忽略 */
    }
  }
}

/**
 * 操作前重解析选中媒体的实时位置，防止存储 pos 陈旧导致改错/删错节点。
 * （例如栏内图片与栏外图片同 src 时，旧的首次 src 匹配会指向栏外节点。）
 * @returns {number | null} 校验通过的实时 pos，失效时返回 null
 */
function resolveSelectedMediaPos() {
  const sel = selectedTarget.value;
  const editor = editorInstance.value;
  if (!sel || !editor) return null;
  const view = editor.view;
  // el 仍在文档中时，优先用 DOM 身份重解析（最准）
  if (sel.el && sel.el.isConnected) {
    try {
      const fresh =
        sel.type === 'video'
          ? findVideoNodeAndPos(view, sel.el)
          : findImageNodeAndPos(view, sel.el);
      if (fresh) {
        sel.pos = fresh.pos;
        sel.node = editor.state.doc.nodeAt(fresh.pos) ?? fresh.node;
        return fresh.pos;
      }
    } catch {
      /* 掉入存储 pos 校验 */
    }
  }
  // 回退：校验存储 pos 是否仍指向同类型节点
  try {
    const node = editor.state.doc.nodeAt(sel.pos);
    if (node && node.type.name === sel.type) {
      sel.node = node;
      return sel.pos;
    }
  } catch {
    /* 忽略 */
  }
  return null;
}

function requireFreshMediaPos() {
  const pos = resolveSelectedMediaPos();
  if (pos === null) {
    message.warning('选中内容已变化，请重新点击要操作的图片/视频');
    clearSelection();
  }
  return pos;
}

function selectImage(imgEl) {
  if (!imgEl || !editorInstance.value || !isEditable.value)
    return;
  clearSelection();

  const found = findImageNodeAndPos(editorInstance.value.view, imgEl);
  if (!found) return;

  selectedTarget.value = {
    type: 'image',
    el: imgEl,
    pos: found.pos,
    node: found.node,
  };

  try {
    // NodeSelection 与高亮 meta 合并为一次 dispatch，避免两次视图更新
    const tr = editorInstance.value.state.tr.setSelection(
      NodeSelection.create(editorInstance.value.state.doc, found.pos),
    );
    tr.setMeta(appEditorSelectionKey, { type: 'setMedia', pos: found.pos, mediaType: 'image' });
    editorInstance.value.view.dispatch(tr);
  } catch {}

  loadMediaSize();
  nextTick(() => {
    updateHandlePosition();
  });
}

function selectVideo(videoEl) {
  if (!videoEl || !editorInstance.value || !isEditable.value)
    return;
  clearSelection();

  const found = findVideoNodeAndPos(editorInstance.value.view, videoEl);
  if (!found) return;

  selectedTarget.value = {
    type: 'video',
    el: videoEl,
    pos: found.pos,
    node: found.node,
  };

  try {
    const tr = editorInstance.value.state.tr.setSelection(
      NodeSelection.create(editorInstance.value.state.doc, found.pos),
    );
    tr.setMeta(appEditorSelectionKey, { type: 'setMedia', pos: found.pos, mediaType: 'video' });
    editorInstance.value.view.dispatch(tr);
  } catch {}

  isVideoPlaying.value = !videoEl.paused;
  videoEl.removeEventListener('play', onVideoPlayStateChange);
  videoEl.removeEventListener('pause', onVideoPlayStateChange);
  videoEl.removeEventListener('ended', onVideoPlayStateChange);
  videoEl.addEventListener('play', onVideoPlayStateChange);
  videoEl.addEventListener('pause', onVideoPlayStateChange);
  videoEl.addEventListener('ended', onVideoPlayStateChange);

  loadMediaSize();
  nextTick(() => {
    updateHandlePosition();
  });
}

function toggleVideoPlay() {
  const el = selectedTarget.value?.el;
  if (!el || el.tagName !== 'VIDEO') return;
  if (el.paused) {
    el.play().catch((err) => {
      console.warn('[app-editor] 视频播放失败:', err);
      message.warning('视频播放失败，请检查视频源有效性');
    });
  } else {
    el.pause();
  }
  isVideoPlaying.value = !el.paused;
}

function pickVideo() {
  if (hasMediaLibrary.value) {
    replaceVideoModalOpen.value = true;
    return;
  }
  triggerLocalVideoPick();
}

function triggerLocalVideoPick() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const uploadFn = uploadGeneralFile || uploadImage;
      const url = await uploadFn(file);
      if (!url || !selectedTarget.value) return;
      const pos = requireFreshMediaPos();
      if (pos === null) return;
      const editor = editorInstance.value;
      const node = editor?.state?.doc?.nodeAt(pos);
      if (node && editor) {
        const tr = editor.state.tr.setNodeMarkup(pos, null, {
          ...node.attrs,
          src: url,
        });
        editor.view.dispatch(tr);
        nextTick(() => {
          updateHandlePosition();
        });
      }
    } catch (err) {
      console.error('[app-editor] 本地换视频失败:', err);
    }
  });
  input.click();
}

function onReplaceVideoSelect(item) {
  if (!item?.url || !selectedTarget.value) return;
  const insertUrl = item.url;
  const pos = requireFreshMediaPos();
  if (pos === null) return;
  const editor = editorInstance.value;
  const node = editor?.state?.doc?.nodeAt(pos);
  if (node && editor) {
    const tr = editor.state.tr.setNodeMarkup(pos, null, {
      ...node.attrs,
      src: insertUrl,
    });
    editor.view.dispatch(tr);
    nextTick(() => {
      updateHandlePosition();
    });
  }
  replaceVideoModalOpen.value = false;
  clearSelection();
}

function deleteSelectedVideo() {
  if (!selectedTarget.value || selectedTarget.value.type !== 'video') return;
  const editor = editorInstance.value;
  const pos = requireFreshMediaPos();
  if (pos === null) return;
  if (!editor) return;
  const node = editor.state.doc.nodeAt(pos);
  const size = node ? node.nodeSize : 1;
  const tr = editor.state.tr.delete(pos, pos + size);
  editor.view.dispatch(tr);
  clearSelection();
}

const currentVideoControls = computed(() => {
  if (selectedTarget.value?.type !== 'video') return true;
  return selectedTarget.value.node?.attrs?.controls !== false;
});

const currentVideoPosterInput = ref('');

watch(
  () => selectedTarget.value,
  (val) => {
    if (val?.type === 'video' && val.node) {
      currentVideoPosterInput.value = val.node.attrs.poster || '';
    }
  },
);

function toggleCurrentVideoControls() {
  if (!selectedTarget.value || selectedTarget.value.type !== 'video') return;
  const editor = editorInstance.value;
  if (!editor) return;
  const pos = requireFreshMediaPos();
  if (pos === null) return;
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'video') return;
  const current = node.attrs.controls !== false;
  const tr = editor.state.tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    controls: !current,
  });
  editor.view.dispatch(tr);
  selectedTarget.value.node = editor.state.doc.nodeAt(pos);
}

function saveCurrentVideoPoster() {
  if (!selectedTarget.value || selectedTarget.value.type !== 'video') return;
  const editor = editorInstance.value;
  if (!editor) return;
  const pos = requireFreshMediaPos();
  if (pos === null) return;
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'video') return;
  const posterVal = currentVideoPosterInput.value.trim() || null;
  const tr = editor.state.tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    poster: posterVal,
  });
  editor.view.dispatch(tr);
  selectedTarget.value.node = editor.state.doc.nodeAt(pos);
  activePanel.value = null;
}

// ---------------------------------------------------------------------------
// 媒体工具栏与尺寸/对齐/换媒体/删除
// ---------------------------------------------------------------------------

const activePanel = ref(null);
const sliderValue = ref(100);
const previewWidth = ref(null);
const previewPercent = ref(null);
const handleVisible = ref(false);
const handleCoords = ref({ left: 0, top: 0 });
const isDraggingHandle = ref(false);

function togglePanel(name) {
  activePanel.value = activePanel.value === name ? null : name;
}

const PRESET_SIZES = [
  { label: '25%', value: 25 },
  { label: '50%', value: 50 },
  { label: '75%', value: 75 },
  { label: '100% 全宽', value: 100 },
];

const PRESET_SIZES_PX = [
  { label: '200px', value: 200 },
  { label: '400px', value: 400 },
  { label: '600px', value: 600 },
  { label: '800px', value: 800 },
];

// 媒体尺寸双单位模型：宽度 %/px + 高度 auto/px（图片视频共用）
const mediaWidthUnit = ref('%');
const mediaWidthInput = ref('100');
const mediaHeightMode = ref('auto');
const mediaHeightInput = ref('');

function baseWidth() {
  const contentEl = getContentContainerEl();
  return contentEl?.clientWidth || window.innerWidth;
}

/**
 * 计算图片相对于所在父级排版容器的内容宽度基准
 */
function getImageContainerWidth(img) {
  if (!img) return baseWidth();
  let container = img.parentElement;
  while (container && container !== document.body) {
    try {
      const style = window.getComputedStyle(container);
      if (
        style &&
        style.display !== 'inline' &&
        style.display !== 'contents' &&
        container.clientWidth > 0
      ) {
        const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
        const paddingRight = Number.parseFloat(style.paddingRight) || 0;
        const contentWidth = container.clientWidth - paddingLeft - paddingRight;
        if (contentWidth > 0) {
          return contentWidth;
        }
      }
    } catch {}
    container = container.parentElement;
  }
  const contentEl = getContentContainerEl();
  return contentEl?.clientWidth || window.innerWidth;
}

function getCurrentImagePercent() {
  if (!selectedTarget.value?.el) return 100;
  const el = selectedTarget.value.el;
  const containerWidth = getImageContainerWidth(el);
  const styleWidth = el.style.width;

  if (styleWidth) {
    if (styleWidth.endsWith('%')) {
      return Math.min(100, Math.max(5, Math.round(Number.parseFloat(styleWidth))));
    }
    if (styleWidth.endsWith('px')) {
      const px = Number.parseFloat(styleWidth);
      return containerWidth > 0
        ? Math.min(100, Math.max(5, Math.round((px / containerWidth) * 100)))
        : 100;
    }
  }

  const attrWidth = el.getAttribute('width');
  if (attrWidth) {
    if (attrWidth.endsWith('%')) {
      return Math.min(100, Math.max(5, Math.round(Number.parseFloat(attrWidth))));
    }
    const px = Number.parseFloat(attrWidth);
    return containerWidth > 0
      ? Math.min(100, Math.max(5, Math.round((px / containerWidth) * 100)))
      : 100;
  }

  const renderedWidth = el.getBoundingClientRect().width;
  if (containerWidth > 0 && renderedWidth > 0) {
    return Math.min(100, Math.max(5, Math.round((renderedWidth / containerWidth) * 100)));
  }

  return 100;
}

const displayPercent = computed(() => {
  if (previewPercent.value !== null) {
    return previewPercent.value;
  }
  return sliderValue.value;
});

/** 尺寸胶囊文案：% 显示百分比，px 显示像素值 */
const sizePillLabel = computed(() => {
  if (previewPercent.value !== null && mediaWidthUnit.value === '%') {
    return `${previewPercent.value}%`;
  }
  if (mediaWidthUnit.value === 'px') {
    const v = String(mediaWidthInput.value || '').trim();
    return v ? `${v}px` : displayPercent.value + '%';
  }
  return `${displayPercent.value}%`;
});

/** 当前单位下的快速预设 */
const sizePresets = computed(() =>
  mediaWidthUnit.value === 'px' ? PRESET_SIZES_PX : PRESET_SIZES,
);

/** 从节点 attrs.style 解析宽高，回显到双单位表单 */
function loadMediaSize() {
  const node = selectedTarget.value?.node;
  const style = node?.attrs?.style || '';
  const widthMatch = style.match(/width\s*:\s*(-?\d+(?:\.\d+)?)(%|px)/i);
  if (widthMatch) {
    mediaWidthUnit.value = widthMatch[2] === 'px' ? 'px' : '%';
    mediaWidthInput.value = widthMatch[1];
  } else {
    mediaWidthUnit.value = '%';
    mediaWidthInput.value = '100';
  }
  const heightMatch = style.match(/height\s*:\s*(-?\d+(?:\.\d+)?)px/i);
  if (heightMatch) {
    mediaHeightMode.value = 'px';
    mediaHeightInput.value = heightMatch[1];
  } else {
    mediaHeightMode.value = 'auto';
    mediaHeightInput.value = '';
  }
  sliderValue.value = getCurrentImagePercent();
}

function commitMediaSize() {
  if (!selectedTarget.value || !['image', 'video'].includes(selectedTarget.value.type)) return;
  const editor = editorInstance.value;
  if (!editor) return;
  const pos = requireFreshMediaPos();
  if (pos === null) return;

  const updates = [];
  if (mediaWidthUnit.value === 'px') {
    if (String(mediaWidthInput.value ?? '').trim() === '') return;
    const px = Math.max(10, Math.round(Number(mediaWidthInput.value) || 0));
    mediaWidthInput.value = String(px);
    updates.push(['width', `${px}px`]);
  } else {
    if (String(mediaWidthInput.value ?? '').trim() === '') return;
    const clamped = Math.max(5, Math.min(100, Math.round(Number(mediaWidthInput.value) || 0)));
    mediaWidthInput.value = String(clamped);
    updates.push(['width', `${clamped}%`]);
    sliderValue.value = clamped;
  }
  if (mediaHeightMode.value === 'px') {
    if (String(mediaHeightInput.value ?? '').trim() === '') return;
    const hpx = Math.max(10, Math.round(Number(mediaHeightInput.value) || 0));
    mediaHeightInput.value = String(hpx);
    updates.push(['height', `${hpx}px`]);
  } else {
    updates.push(['height', null]);
  }

  const node = editor.state.doc.nodeAt(pos);
  if (!node || (node.type.name !== 'image' && node.type.name !== 'video')) return;

  const newStyle = setStyleDecls(node.attrs.style, updates, []);

  const tr = editor.state.tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    style: newStyle,
    width: null,
    height: null,
  });
  editor.view.dispatch(tr);

  selectedTarget.value.node = editor.state.doc.nodeAt(pos);
  previewWidth.value = null;
  previewPercent.value = null;

  nextTick(() => {
    updateHandlePosition();
  });
}

function commitImagePercent(percent) {
  // 兼容旧调用：百分比提交（滑杆/拖拽手柄），切回 % 单位
  mediaWidthUnit.value = '%';
  mediaWidthInput.value = String(Math.max(5, Math.min(100, Math.round(percent))));
  commitMediaSize();
}

function applyPresetSize(value) {
  mediaWidthInput.value = String(value);
  commitMediaSize();
}

function resetMediaSizeToOriginal() {
  if (!selectedTarget.value || !['image', 'video'].includes(selectedTarget.value.type)) return;
  const editor = editorInstance.value;
  if (!editor) return;
  const pos = requireFreshMediaPos();
  if (pos === null) return;

  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;

  mediaWidthUnit.value = '%';
  mediaWidthInput.value = '100';
  sliderValue.value = 100;
  mediaHeightMode.value = 'auto';
  mediaHeightInput.value = '';

  const newStyle = setStyleDecls(node.attrs.style, [], ['width', 'height', 'max-width']);

  const tr = editor.state.tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    style: newStyle,
    width: null,
    height: null,
  });
  editor.view.dispatch(tr);

  selectedTarget.value.node = editor.state.doc.nodeAt(pos);
  previewWidth.value = null;
  previewPercent.value = null;
  message.success('已恢复原始尺寸与比例');
  nextTick(() => {
    updateHandlePosition();
  });
}

function applyPreset(percent) {
  mediaWidthUnit.value = '%';
  sliderValue.value = percent;
  commitImagePercent(percent);
  activePanel.value = null;
}

function onSliderChange() {
  commitImagePercent(sliderValue.value);
}

function setMediaWidthUnit(unit) {
  if (mediaWidthUnit.value === unit) return;
  if (unit === 'px') {
    // % 切 px：按当前渲染宽度换算
    const el = selectedTarget.value?.el;
    const rendered = el?.getBoundingClientRect?.().width;
    mediaWidthUnit.value = 'px';
    mediaWidthInput.value = String(Math.max(10, Math.round(rendered || 400)));
  } else {
    mediaWidthUnit.value = '%';
    mediaWidthInput.value = String(getCurrentImagePercent());
    sliderValue.value = getCurrentImagePercent();
  }
}

function setMediaHeightMode(mode) {
  mediaHeightMode.value = mode;
  if (mode === 'px' && !String(mediaHeightInput.value || '').trim()) {
    // 默认取当前渲染高度
    const el = selectedTarget.value?.el;
    const rendered = el?.getBoundingClientRect?.().height;
    mediaHeightInput.value = String(Math.max(10, Math.round(rendered || 300)));
  }
  commitMediaSize();
}

// 对齐方式
const activeAlign = computed(() => {
  if (!selectedTarget.value?.node) return null;
  const decls = declsOf(selectedTarget.value.node.attrs.style);
  const left = decls.find(([key]) => key === 'margin-left')?.[1];
  const right = decls.find(([key]) => key === 'margin-right')?.[1];
  if (left === 'auto' && right === 'auto') return 'center';
  if (left === 'auto') return 'right';
  if (right === 'auto') return 'left';
  return null;
});

const currentAlignIcon = computed(() => {
  if (activeAlign.value === 'center') return AlignCenter;
  if (activeAlign.value === 'right') return AlignRight;
  return AlignLeft;
});

const ALIGN_OPTIONS = [
  { icon: AlignLeft, key: 'left', label: '靠左对齐' },
  { icon: AlignCenter, key: 'center', label: '居中对齐' },
  { icon: AlignRight, key: 'right', label: '靠右对齐' },
];

function setImageAlign(side) {
  if (!selectedTarget.value || !['image', 'video'].includes(selectedTarget.value.type)) return;
  const editor = editorInstance.value;
  if (!editor) return;
  const pos = requireFreshMediaPos();
  if (pos === null) return;

  const node = editor.state.doc.nodeAt(pos);
  if (!node || (node.type.name !== 'image' && node.type.name !== 'video')) return;

  const marginLeft = side === 'right' || side === 'center' ? 'auto' : '0';
  const marginRight = side === 'left' || side === 'center' ? 'auto' : '0';
  const newStyle = setStyleDecls(node.attrs.style, [
    ['display', 'block'],
    ['margin-left', marginLeft],
    ['margin-right', marginRight],
  ]);

  const tr = editor.state.tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    style: newStyle,
  });
  editor.view.dispatch(tr);
  activePanel.value = null;

  nextTick(() => {
    updateHandlePosition();
  });
}

const hasMediaLibrary = computed(() => {
  const fn = props.fetchMedia !== undefined ? props.fetchMedia : defaultFetchMedia;
  if (fn === false || fn === null) return false;
  return typeof fn === 'function';
});

const replaceImageModalOpen = ref(false);

function pickImage() {
  if (hasMediaLibrary.value) {
    replaceImageModalOpen.value = true;
    return;
  }
  triggerLocalImagePick();
}

function triggerLocalImagePick() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file);
      if (!url || !selectedTarget.value) return;
      const pos = requireFreshMediaPos();
      if (pos === null) return;
      const editor = editorInstance.value;
      const node = editor?.state?.doc?.nodeAt(pos);
      if (node && editor) {
        const tr = editor.state.tr.setNodeMarkup(pos, null, {
          ...node.attrs,
          src: url,
        });
        editor.view.dispatch(tr);
        nextTick(() => {
          updateHandlePosition();
        });
      }
    } catch (err) {
      console.error('[app-editor] 本地换图失败:', err);
    }
  });
  input.click();
}

function onReplaceImageSelect(item) {
  if (!item?.url || !selectedTarget.value) return;
  const insertUrl = stripThumbnailParam(item.url);
  const pos = requireFreshMediaPos();
  if (pos === null) return;
  const editor = editorInstance.value;
  const node = editor?.state?.doc?.nodeAt(pos);
  if (node && editor) {
    const tr = editor.state.tr.setNodeMarkup(pos, null, {
      ...node.attrs,
      src: insertUrl,
    });
    editor.view.dispatch(tr);
    nextTick(() => {
      updateHandlePosition();
    });
  }
  replaceImageModalOpen.value = false;
  clearSelection();
}

function deleteSelectedImage() {
  if (!selectedTarget.value || selectedTarget.value.type !== 'image') return;
  const editor = editorInstance.value;
  const pos = requireFreshMediaPos();
  if (pos === null) return;
  if (!editor) return;
  const tr = editor.state.tr.delete(pos, pos + 1);
  editor.view.dispatch(tr);
  clearSelection();
}

// 图片右下角拖拽调宽手柄
function updateHandlePosition() {
  if (
    !['image', 'video'].includes(selectedTarget.value?.type) ||
    !selectedTarget.value?.el
  ) {
    handleVisible.value = false;
    return;
  }
  const rect = selectedTarget.value.el.getBoundingClientRect();
  const editorEl = getContentContainerEl();
  const editorRect = editorEl?.getBoundingClientRect();

  if (editorRect) {
    if (rect.bottom < editorRect.top || rect.top > editorRect.bottom) {
      handleVisible.value = false;
      return;
    }
  }

  handleCoords.value = {
    left: Math.round(rect.right - 6),
    top: Math.round(rect.bottom - 6),
  };
  handleVisible.value = isEditable.value;
}

function onHandleMouseDown(event) {
  if (!selectedTarget.value?.el) return;
  isDraggingHandle.value = true;
  // 拖拽统一按百分比换算：px 模式下先切回 %（输入框同步更新）
  if (mediaWidthUnit.value !== '%') {
    mediaWidthUnit.value = '%';
    mediaWidthInput.value = String(getCurrentImagePercent());
  }
  const img = selectedTarget.value.el;
  const startX = event.clientX;
  const startWidth = img.getBoundingClientRect().width;
  const containerWidth = getImageContainerWidth(img);

  const onMove = (moveEvent) => {
    const currentWidth = startWidth + (moveEvent.clientX - startX);
    const clampedWidth = Math.min(containerWidth, Math.max(30, currentWidth));
    const currentPercent = Math.min(
      100,
      Math.max(5, Math.round((clampedWidth / containerWidth) * 100)),
    );

    previewWidth.value = clampedWidth;
    previewPercent.value = currentPercent;
    sliderValue.value = currentPercent;

    img.style.width = currentPercent >= 100 ? '100%' : `${currentPercent}%`;
    img.style.height = 'auto';

    updateHandlePosition();
  };

  const onUp = () => {
    isDraggingHandle.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    const finalPercent = previewPercent.value;
    previewWidth.value = null;
    previewPercent.value = null;
    if (finalPercent !== null) {
      commitImagePercent(finalPercent);
    }
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ---------------------------------------------------------------------------
// 特殊块级操作（图片 / 视频：前后空行、上下移动、复制、删除、复制HTML、对齐）
// ---------------------------------------------------------------------------

/**
 * 在当前选中的特殊块（图片 / 视频）前插入空行段落并自动聚焦
 */
function insertParagraphBeforeCurrentBlock() {
  if (!selectedTarget.value || !editorInstance.value) return;
  const editor = editorInstance.value;
  const pos = requireFreshMediaPos();
  if (pos === null) return;
  const p = editor.schema.nodes.paragraph.create();
  const tr = editor.state.tr.insert(pos, p);
  tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  editor.view.dispatch(tr);
  editor.view.focus();
  clearSelection();
  message.success('已在块上方插入空行');
}

/**
 * 在当前选中的特殊块（图片 / 视频）后插入空行段落并自动聚焦
 */
function insertParagraphAfterCurrentBlock() {
  if (!selectedTarget.value || !editorInstance.value) return;
  const editor = editorInstance.value;
  const pos = requireFreshMediaPos();
  if (pos === null) return;
  const { node } = selectedTarget.value;
  const p = editor.schema.nodes.paragraph.create();
  const insertPos = pos + node.nodeSize;
  const tr = editor.state.tr.insert(insertPos, p);
  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
  editor.view.dispatch(tr);
  editor.view.focus();
  clearSelection();
  message.success('已在块下方插入空行');
}

/**
 * 复制当前选中的特殊块（图片 / 视频）
 */
function duplicateCurrentBlock() {
  if (!selectedTarget.value || !editorInstance.value) return;
  const editor = editorInstance.value;
  const pos = requireFreshMediaPos();
  if (pos === null) return;
  const { node } = selectedTarget.value;
  const insertPos = pos + node.nodeSize;
  const tr = editor.state.tr.insert(insertPos, node);
  editor.view.dispatch(tr);
  editor.view.focus();
  message.success('已复制当前块');
}

/**
 * 删除当前选中的特殊块（图片 / 视频）
 */
function deleteCurrentBlock() {
  if (!selectedTarget.value || !editorInstance.value) return;
  const editor = editorInstance.value;
  const pos = requireFreshMediaPos();
  if (pos === null) return;
  const { node } = selectedTarget.value;
  const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
  editor.view.dispatch(tr);
  clearSelection();
  message.success('已删除选中的块');
}

/**
 * 上移当前块（与前一个兄弟节点互换位置）
 */
function moveBlockUp() {
  if (!selectedTarget.value || !editorInstance.value) return;
  const editor = editorInstance.value;
  const pos = requireFreshMediaPos();
  if (pos === null) return;
  const { node, type } = selectedTarget.value;
  const { doc } = editor.state;
  const $pos = doc.resolve(pos);
  const index = $pos.index();
  if (index === 0) {
    message.info('已经是第一个块，无法上移');
    return;
  }
  const parent = $pos.parent;
  const prevNode = parent.child(index - 1);
  const prevPos = pos - prevNode.nodeSize;

  const tr = editor.state.tr;
  tr.delete(pos, pos + node.nodeSize);
  tr.insert(prevPos, node);
  try {
    tr.setSelection(NodeSelection.create(tr.doc, prevPos));
  } catch {}
  editor.view.dispatch(tr);
  editor.view.focus();

  nextTick(() => {
    reselectAtPos(prevPos, type);
  });
}

/**
 * 下移当前块（与后一个兄弟节点互换位置）
 */
function moveBlockDown() {
  if (!selectedTarget.value || !editorInstance.value) return;
  const editor = editorInstance.value;
  const pos = requireFreshMediaPos();
  if (pos === null) return;
  const { node, type } = selectedTarget.value;
  const { doc } = editor.state;
  const $pos = doc.resolve(pos);
  const index = $pos.index();
  const parent = $pos.parent;
  if (index >= parent.childCount - 1) {
    message.info('已经是最后一个块，无法下移');
    return;
  }
  const nextNode = parent.child(index + 1);
  const targetPos = pos + nextNode.nodeSize;

  const tr = editor.state.tr;
  tr.delete(pos, pos + node.nodeSize);
  tr.insert(targetPos, node);
  try {
    tr.setSelection(NodeSelection.create(tr.doc, targetPos));
  } catch {}
  editor.view.dispatch(tr);
  editor.view.focus();

  nextTick(() => {
    reselectAtPos(targetPos, type);
  });
}

/**
 * 块移动后在目标位置重新获取 DOM 并高亮
 */
function reselectAtPos(targetPos, type) {
  const editor = editorInstance.value;
  if (!editor) return;
  try {
    const dom = editor.view.nodeDOM(targetPos);
    if (!dom) return;
    if (type === 'image') {
      const imgEl = dom.tagName === 'IMG' ? dom : dom.querySelector('img');
      if (imgEl) selectImage(imgEl);
    } else if (type === 'video') {
      const vidEl = dom.tagName === 'VIDEO' ? dom : dom.querySelector('video');
      if (vidEl) selectVideo(vidEl);
    }
  } catch (err) {
    console.warn('[app-editor] reselectAtPos error:', err);
  }
}

/**
 * 复制当前块的完整 HTML 代码
 */
async function copyBlockHtml() {
  if (!selectedTarget.value?.el) return;
  try {
    const html = selectedTarget.value.el.outerHTML;
    await navigator.clipboard.writeText(html);
    message.success('已复制块 HTML 代码');
  } catch (err) {
    message.warning('复制失败，请重试');
  }
}

/**
 * 特殊块对齐
 */
function setBlockAlign(side) {
  setImageAlign(side);
}

// ---------------------------------------------------------------------------
// DOM 事件绑定（仅处理特殊块点击，常规内容零打扰零计算）
// 点击统一由模板根节点的 @click.capture="onContentClick" 承接（捕获阶段可
// 收到编辑器内所有后代点击），此处不再用 addEventListener 重复绑定，避免
// 同一点击触发两次 select+dispatch 交错造成选中错位。
// ---------------------------------------------------------------------------

/**
 * 桥接就绪前的点击暂存：Tiptap v3 的 `create` 事件在 setTimeout(0) 中延迟
 * 触发，编辑器视图可能已首绘但 editorInstance 仍为 null。此时到达的点击
 * 不能静默丢弃（否则首屏点击多栏/图片毫无反应），暂存后在 onEditorReady
 * 中回放，保证任何时机点击都生效。
 */
const pendingClickSelect = ref(null);
// { kind: 'image' | 'video' | 'columns', el: HTMLElement, targetEl?: HTMLElement }

function stashPendingClick(target) {
  if (!target || typeof target.closest !== 'function') return;
  const imgEl = target.tagName === 'IMG' ? target : target.closest('img');
  if (imgEl) {
    pendingClickSelect.value = { kind: 'image', el: imgEl };
    return;
  }
  const videoEl = target.tagName === 'VIDEO' ? target : target.closest('video');
  if (videoEl) {
    pendingClickSelect.value = { kind: 'video', el: videoEl };
    return;
  }
  const columnsEl = target.closest('.cms-columns');
  if (columnsEl) {
    pendingClickSelect.value = { kind: 'columns', el: columnsEl, targetEl: target };
    return;
  }
  const tableEl = target.closest('table');
  if (tableEl) {
    pendingClickSelect.value = { kind: 'table', el: tableEl };
    return;
  }
  // 普通元素点击也暂存，待就绪后由检查器解析
  pendingClickSelect.value = { kind: 'element', el: target };
}

function flushPendingClickSelect() {
  const p = pendingClickSelect.value;
  pendingClickSelect.value = null;
  if (!p || !editorInstance.value || !isEditable.value) return;
  if (p.el && !p.el.isConnected) return;
  try {
    if (p.kind === 'image') {
      selectImage(p.el);
      const columnsEl = p.el.closest?.('.cms-columns');
      if (columnsEl) selectColumns(columnsEl, p.el);
      else clearColumnsSelection();
      const tableEl = p.el.closest?.('table');
      if (tableEl) selectTable(tableEl);
      else clearTableSelection();
    } else if (p.kind === 'video') {
      selectVideo(p.el);
      const columnsEl = p.el.closest?.('.cms-columns');
      if (columnsEl) selectColumns(columnsEl, p.el);
      else clearColumnsSelection();
      const tableEl = p.el.closest?.('table');
      if (tableEl) selectTable(tableEl);
      else clearTableSelection();
    } else if (p.kind === 'columns') {
      clearSelection();
      selectColumns(p.el, p.targetEl || p.el);
      const tableEl = (p.targetEl || p.el)?.closest?.('table');
      if (tableEl) selectTable(tableEl);
      else clearTableSelection();
    } else if (p.kind === 'table') {
      clearSelection();
      clearColumnsSelection();
      selectTable(p.el);
    } else if (p.kind === 'element') {
      clearSelection();
      clearColumnsSelection();
      clearTableSelection();
      selectElementForTarget(p.el);
    }
  } catch (err) {
    console.warn('[app-editor] pending click 回放失败:', err);
  }
}

function onContentClick(event) {
  const target = event.target;
  if (
    !target ||
    target.closest('.app-editor-floating') ||
    target.closest('.app-editor-resize-handle') ||
    target.closest('.app-editor-toolbar') ||
    target.closest('.app-editor-ai-chat') ||
    target.closest('.app-editor-ai-pillwrap') ||
    // Dock 在编辑器根容器内部，其按钮点击不得视为“点空白处”清除选中
    target.closest('.app-editor-dock') ||
    // 状态条 / 弹窗等 chrome 点击保持原样（不触动选中）
    target.closest('.app-editor-statusbar') ||
    target.closest('.ant-modal') ||
    target.closest('.ant-popover')
  ) {
    return;
  }

  // 桥接尚未就绪（editorInstance 为空）时暂存点击，待就绪回放，不静默丢弃
  if (!editorInstance.value) {
    stashPendingClick(target);
    return;
  }

  const columnsEl = target.closest('.cms-columns');
  const tableEl = target.closest('table');

  // 1. 点击图片：选中图片，若在多栏/表格内部则同时激活对应工具条（堆叠显示）
  const imgEl = target.tagName === 'IMG' ? target : target.closest('img');
  if (imgEl) {
    selectImage(imgEl);
    if (columnsEl) {
      selectColumns(columnsEl, imgEl);
    } else {
      clearColumnsSelection();
    }
    if (tableEl) {
      selectTable(tableEl);
    } else {
      clearTableSelection();
    }
    selectElementForTarget(target);
    return;
  }

  // 2. 点击视频：拦截原生自动触发，选中视频，若在多栏/表格内部则同时激活对应工具条
  const videoEl = target.tagName === 'VIDEO' ? target : target.closest('video');
  if (videoEl) {
    if (!videoEl.paused && !isVideoPlaying.value) {
      videoEl.pause();
    }
    selectVideo(videoEl);
    if (columnsEl) {
      selectColumns(columnsEl, videoEl);
    } else {
      clearColumnsSelection();
    }
    if (tableEl) {
      selectTable(tableEl);
    } else {
      clearTableSelection();
    }
    selectElementForTarget(target);
    return;
  }

  // 3. 点击多栏内部的常规元素：激活多栏工具条，清除媒体工具条；
  //    若同时处于表格内（如栏内表格），表格工具条一并激活
  if (columnsEl) {
    clearSelection();
    selectColumns(columnsEl, target);
    if (tableEl) {
      selectTable(tableEl);
    } else {
      clearTableSelection();
    }
    selectElementForTarget(target);
    return;
  }

  // 4. 点击表格内部常规元素：激活表格工具条
  if (tableEl) {
    clearSelection();
    clearColumnsSelection();
    selectTable(tableEl);
    selectElementForTarget(target);
    return;
  }

  // 5. 其他点击：先走 DOM 精确解析；无命中（如 margin 缝隙、wrapper 留白
  //    点到背后元素）则用 PM 光标兜底——mousedown 已把光标放到最近合法处。
  //    注意：状态条等 chrome 在上面已提前返回，不会走到这里。
  clearSelection();
  clearColumnsSelection();
  clearTableSelection();
  selectElementForTarget(target);
  if (!selectedElementTarget.value) {
    selectElementFromSelectionState();
  }
}

/**
 * 用编辑器当前选区设定检查器目标（margin 缝隙等点不到元素时的兜底，
 * PM mousedown 已把光标放到最近合法处；同样走装饰上浮）。
 */
function selectElementFromSelectionState() {
  const editor = editorInstance.value;
  if (!editor) return;
  const found = resolveElementFromSelection(editor.state);
  if (!found) {
    clearElementSelection();
    return;
  }
  const floated = floatToStyledAncestor(editor.state.doc, found.pos, found.node);
  let el = null;
  try {
    const dom = editor.view.nodeDOM(floated.pos);
    el = dom instanceof HTMLElement ? dom : null;
  } catch {
    el = null;
  }
  applyElementSelection({ pos: floated.pos, node: floated.node }, el);
}

function bindEditorDOM() {
  // 空实现：点击已由模板 @click.capture 统一承接，无需重复绑定
}

function unbindEditorDOM() {
  if (editorInstance.value) {
    editorInstance.value.off('selectionUpdate', onEditorSelectionUpdate);
  }
}

function onScrollOrResize() {
  // Dock 固定在底部无需跟随定位，仅维护图片拖拽手柄与盒模型 overlay 位置
  if (['image', 'video'].includes(selectedTarget.value?.type)) {
    updateHandlePosition();
  }
  if (selectedElementTarget.value) {
    refreshBoxOverlay();
  }
  clampSplitOnResize();
  // AI 比对中小丸跟随滚动
  if (aiSession.value) refreshAiPill();
}

function onKeyDown(event) {
  // 字数栏下拉优先关闭（不影响全屏/双栏的退出链）
  if (event.key === 'Escape' && isViewportMenuOpen.value) {
    isViewportMenuOpen.value = false;
    return;
  }
  if (event.key === 'Escape' && isSplitView.value) {
    // 双栏优先退出双栏（保留全屏），再按一次才退全屏
    isSplitView.value = false;
    sourceAiApi.value?.clearLocate?.();
    return;
  }
  if (event.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false;
  }
}

function onEditorSelectionUpdate() {
  if (!isEditable.value) return;

  const editor = editorInstance.value;
  if (!editor) return;

  // 如果焦点在右侧源码编辑器内（用户在右侧点击/编辑代码），不响应左侧失焦触发的 selectionUpdate，防跳回旧代码
  try {
    if (sourceView.value?.hasFocus) return;
  } catch {}

  // 选区变化（含任意文本范围划选）即触发 AI 作用域更新
  if (!aiSession.value) {
    aiContextVersion.value += 1;
  }

  // 双栏模式下选区/光标变化即消抖定位右侧源码
  if (isSplitView.value) {
    scheduleSplitLocate();
  }

  // AI 比对中：光标/点击落到某变更块内，该块即成为当前比对处（只切高亮不滚动）
  if (aiSession.value && !aiApplying) {
    try {
      const from = editor.state.selection.from;
      const hit = aiSession.value.hunks.find(
        (h) => h.to > h.from && from >= h.from && from < h.to,
      );
      if (hit && hit.key !== aiSession.value.currentKey) {
        aiSession.value.currentKey = hit.key;
        dispatchAiDiffCurrent(editor, hit.key);
      }
    } catch {
      /* 忽略 */
    }
  }

  const info = findActiveColumnsInfo(editor.state);
  if (info) {
    const { $from } = editor.state.selection;
    let activeColIdx = 0;
    for (let d = $from.depth; d > 0; d -= 1) {
      if ($from.node(d).type.name === 'column') {
        activeColIdx = $from.index(d - 1);
        break;
      }
    }

    let colDom = null;
    // 优先用 nodeDOM 按位置直接取容器 DOM（最准，多栏并存不串台）
    try {
      const dom = editor.view.nodeDOM(info.columnsPos);
      if (dom instanceof HTMLElement) {
        colDom = dom.classList?.contains('cms-columns')
          ? dom
          : dom.closest?.('.cms-columns');
      }
    } catch {}
    try {
      if (!colDom) {
        const domPos = editor.view.domAtPos(info.columnsPos + 1);
        colDom = domPos.node?.closest?.('.cms-columns');
      }
    } catch {}
    if (!colDom) {
      const cols = Array.from(editor.view.dom.querySelectorAll('.cms-columns'));
      colDom =
        cols.find((el) => {
          try {
            const p = editor.view.posAtDOM(el, 0);
            return (
              p >= info.columnsPos &&
              p <= info.columnsPos + info.columnsNode.nodeSize
            );
          } catch {
            return false;
          }
        }) || (cols.length === 1 ? cols[0] : null);
    }

    if (colDom) {
      selectedColumnsTarget.value = {
        el: colDom,
        pos: info.columnsPos,
        node: info.columnsNode,
        activeColIndex: activeColIdx,
      };
      // 高亮跟随光标所在多栏（Decorations 机制，仅变化时 dispatch）
      syncColumnsHighlight(info.columnsPos);
    } else if (selectedColumnsTarget.value && !selectedTarget.value) {
      // 在多栏内但拿不到容器 DOM：同样清理，避免残留
      clearColumnsSelection();
    }
  } else if (selectedColumnsTarget.value && !selectedTarget.value) {
    // 脱离多栏且没有选中的内部媒体时清理多栏选中
    clearColumnsSelection();
  }

  // 表格跟随：光标在表格内则同步表格选中（与多栏逻辑对称）
  syncTableFromSelection();

  // 注意：检查器不跟随光标（只响应明确点击），否则全局模式（页面设置）
  // 将因“永远有选中”而饿死；点不到的空段落/hr 靠编辑态点击区 CSS 解决。
}

/**
 * 按当前光标同步表格选中；脱离表格且无内部媒体选中时清理。
 */
function syncTableFromSelection() {
  const editor = editorInstance.value;
  if (!editor || !isEditable.value) return;

  const { $from } = editor.state.selection;
  let tablePos = null;
  let tableNode = null;
  for (let d = $from.depth; d >= 0; d -= 1) {
    const node = $from.node(d);
    if (node && node.type.name === 'table') {
      tableNode = node;
      tablePos = $from.before(d);
      break;
    }
  }

  if (tableNode && typeof tablePos === 'number') {
    let tableDom = null;
    try {
      const dom = editor.view.nodeDOM(tablePos);
      if (dom instanceof HTMLElement) {
        tableDom = dom.tagName === 'TABLE' ? dom : dom.querySelector?.('table') || dom.closest?.('table');
      }
    } catch {}
    if (tableDom) {
      selectedTableTarget.value = {
        el: tableDom,
        pos: tablePos,
        node: tableNode,
      };
      syncTableHighlight(tablePos);
      return;
    }
  }

  if (selectedTableTarget.value && !selectedTarget.value) {
    clearTableSelection();
  }
}

// ---------------------------------------------------------------------------
// 双栏同步：左编右看 + 选中定位（首版单向，见 isSplitView 注释）
// ---------------------------------------------------------------------------

let splitRefreshTimer = 0;

/** 左侧改动后节流刷新右侧源码（右侧正被编辑时跳过，不抢改） */
function scheduleSplitSourceRefresh() {
  if (!isSplitView.value) return;
  if (splitRefreshTimer) clearTimeout(splitRefreshTimer);
  splitRefreshTimer = setTimeout(() => {
    splitRefreshTimer = 0;
    if (!isSplitView.value) return;
    try {
      if (sourceView.value?.hasFocus) return;
    } catch {
      /* 忽略 */
    }
    const html = editorInstance.value?.getHTML() ?? content.value ?? '';
    const formatted = formatHtml(html);
    if (formatted !== sourceCode.value) {
      sourceCode.value = formatted;
    }
  }, 400);
}

let splitLocateTimer = 0;

/** 选中变化后消抖触发右侧定位 */
function scheduleSplitLocate() {
  if (splitLocateTimer) clearTimeout(splitLocateTimer);
  splitLocateTimer = setTimeout(() => {
    splitLocateTimer = 0;
    locateSelectedInSource();
  }, 150);
}

const SPLIT_TAG_SNIPPET = {
  paragraph: '<p',
  heading: '<h',
  blockquote: '<blockquote',
  bulletList: '<ul',
  orderedList: '<ol',
  listItem: '<li',
  taskList: '<ul',
  taskItem: '<li',
  codeBlock: '<pre',
  horizontalRule: '<hr',
  image: '<img',
  video: '<video',
  table: '<table',
  section: '<section',
  details: '<details',
  mention: '<a',
};

/** 取附件名（定位图片/视频用，不含查询串） */
function splitFileOf(src) {
  const file = String(src || '').split('/').pop().split('?')[0].trim();
  return file.length >= 4 ? file.slice(-32) : '';
}

/**
 * 由当前四路选中构造源码搜索签名 { snippet, ratio, tag }。
 * ratio 为 ProseMirror 文档进度，用于重复片段时就近命中；
 * tag 为期望标签（小写），供右侧沿语法树上浮到整个元素高亮，
 * null 表示直接取包含命中点的最内层元素（如分栏容器 div）。
 */
function currentSplitSignature() {
  const editor = editorInstance.value;
  if (!editor || editor.isDestroyed) return null;
  const size = editor.state.doc.content.size || 1;
  const ratioOf = (pos) =>
    Math.max(0, Math.min(1, (typeof pos === 'number' ? pos : 0) / size));

  const elSel = selectedElementTarget.value;
  // 行内 span：取区间文本，目标即该 span
  if (elSel?.kind === 'span') {
    try {
      const text = editor.state.doc
        .textBetween(elSel.from, elSel.to, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length >= 2) {
        return { snippet: text.slice(0, 40), ratio: ratioOf(elSel.from), tag: 'span' };
      }
    } catch {
      /* 忽略 */
    }
  }
  // 媒体（图片/视频）：用文件名定位最准
  const media = selectedTarget.value;
  if (media && (media.type === 'image' || media.type === 'video')) {
    const tag = media.type === 'image' ? 'img' : 'video';
    const file = splitFileOf(media.node?.attrs?.src);
    if (file) return { snippet: file, ratio: ratioOf(media.pos), tag };
    return {
      snippet: media.type === 'image' ? '<img' : '<video',
      ratio: ratioOf(media.pos),
      tag,
    };
  }
  // 通用元素检查器
  if (elSel?.kind === 'node' && elSel.node) {
    const t = elSel.node.type.name;
    if (t === 'image' || t === 'video') {
      const tag = t === 'image' ? 'img' : 'video';
      const file = splitFileOf(elSel.node.attrs?.src);
      if (file) return { snippet: file, ratio: ratioOf(elSel.pos), tag };
    }
    if (t === 'table') return { snippet: '<table', ratio: ratioOf(elSel.pos), tag: 'table' };
    // 分栏容器/列：div  tag 太泛滥，传 null 取命中点最内层元素
    if (t === 'columns') {
      return { snippet: 'cms-columns', ratio: ratioOf(elSel.pos), tag: null };
    }
    if (t === 'column') {
      return { snippet: 'cms-column', ratio: ratioOf(elSel.pos), tag: null };
    }
    const tag = splitTagOf(elSel.node);
    try {
      const text = String(elSel.node.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length >= 2) {
        return { snippet: text.slice(0, 40), ratio: ratioOf(elSel.pos), tag };
      }
    } catch {
      /* 忽略 */
    }
    if (SPLIT_TAG_SNIPPET[t]) {
      return { snippet: SPLIT_TAG_SNIPPET[t], ratio: ratioOf(elSel.pos), tag };
    }
  }
  if (selectedTableTarget.value) {
    return { snippet: '<table', ratio: ratioOf(selectedTableTarget.value.pos), tag: 'table' };
  }
  if (selectedColumnsTarget.value) {
    return {
      snippet: 'cms-columns',
      ratio: ratioOf(selectedColumnsTarget.value.pos),
      tag: null,
    };
  }

  // 兜底：使用编辑器当前选区/光标所在节点或选中文本定位
  try {
    const { selection } = editor.state;
    if (selection && !selection.empty) {
      const text = editor.state.doc
        .textBetween(selection.from, selection.to, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length >= 2) {
        return { snippet: text.slice(0, 40), ratio: ratioOf(selection.from), tag: null };
      }
    }
    if (selection) {
      const { $from } = selection;
      for (let d = $from.depth; d > 0; d -= 1) {
        const node = $from.node(d);
        if (node && (node.isBlock || node.type.name === 'paragraph' || node.type.name === 'heading')) {
          const tag = splitTagOf(node);
          const pos = $from.before(d);
          const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
          if (text.length >= 2) {
            return { snippet: text.slice(0, 40), ratio: ratioOf(pos), tag };
          }
          if (SPLIT_TAG_SNIPPET[node.type.name]) {
            return { snippet: SPLIT_TAG_SNIPPET[node.type.name], ratio: ratioOf(pos), tag };
          }
        }
      }
    }
  } catch {
    /* 忽略 */
  }

  return null;
}

/** 检查器节点类型 → 输出标签（heading 带级别；无明确标签返回 null） */
function splitTagOf(node) {
  if (!node) return null;
  const t = node.type.name;
  if (t === 'heading') return `h${node.attrs?.level || 1}`;
  if (t === 'bulletList' || t === 'taskList') return 'ul';
  if (t === 'orderedList') return 'ol';
  if (t === 'listItem' || t === 'taskItem') return 'li';
  if (t === 'tableRow') return 'tr';
  if (t === 'tableCell') return 'td';
  if (t === 'tableHeader') return 'th';
  const map = {
    paragraph: 'p',
    blockquote: 'blockquote',
    codeBlock: 'pre',
    horizontalRule: 'hr',
    image: 'img',
    video: 'video',
    table: 'table',
    section: 'section',
    details: 'details',
    mention: 'a',
  };
  return map[t] || null;
}

function splitAllIndices(haystack, needle) {
  const out = [];
  if (!needle) return out;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) break;
    out.push(i);
    from = i + 1;
    if (out.length >= 50) break;
  }
  return out;
}

/**
 * 片段在源码中就近命中：候选链=全文→前 20 字→最长有效单词，
 * 大小写敏感优先，命中多个时取离 hint 最近者。
 */
function findNearestSnippet(docText, snippet, hint) {
  const text = String(snippet || '');
  if (!text || text.length < 2) return null;
  const candidates = [text];
  if (text.length > 20) candidates.push(text.slice(0, 20));
  const words = text.split(/[\s<>"'=/]+/).filter((w) => w.length >= 4);
  let longest = '';
  for (const w of words) {
    if (w.length > longest.length) longest = w;
  }
  if (longest && longest !== text && !candidates.includes(longest)) {
    candidates.push(longest);
  }
  for (const cand of candidates) {
    let idxs = splitAllIndices(docText, cand);
    if (idxs.length === 0) {
      idxs = splitAllIndices(docText.toLowerCase(), cand.toLowerCase());
    }
    if (idxs.length === 0) continue;
    let best = idxs[0];
    let bestDist = Math.abs(best - hint);
    for (const i of idxs) {
      const d = Math.abs(i - hint);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    }
    return { from: best, to: best + cand.length };
  }
  return null;
}

/** 把当前选中定位到右侧源码（无选中时清除高亮） */
function locateSelectedInSource() {
  const api = sourceAiApi.value;
  if (
    !isSplitView.value ||
    sourceTextareaFallback.value ||
    !sourceView.value ||
    !api?.locateRange
  ) {
    return;
  }
  // 如果焦点在右侧源码编辑器内，用户正在查看或编辑右侧代码，绝不自动回弹定位
  try {
    if (sourceView.value.hasFocus) return;
  } catch {}
  const sig = currentSplitSignature();
  if (!sig) {
    api.clearLocate?.();
    return;
  }
  let docText = '';
  try {
    docText = sourceView.value.state.doc.toString();
  } catch {
    return;
  }
  if (!docText) return;
  const range = findNearestSnippet(docText, sig.snippet, sig.ratio * docText.length);
  if (!range) {
    api.clearLocate?.();
    return;
  }
  // 片段命中后沿语法树上浮到整个元素高亮 + 选中 + 滚动；失败回落片段区间
  let expanded = null;
  try {
    expanded = api.locateElementAt?.(range.from, sig.tag);
  } catch {
    expanded = null;
  }
  if (!expanded) api.locateRange(range.from, range.to);
}

// ---------------------------------------------------------------------------
// AI 内联修改（编辑区中央悬浮入口 + 文档内 diff + 逐处接受/全部接受）
// ---------------------------------------------------------------------------
// AI 助手与内联对比能力（当前按需求临时隐藏）
// ---------------------------------------------------------------------------

/** 是否启用 AI 交互组件（设置为 false 可临时隐藏所有 AI 悬浮条与提示卡） */
const SHOW_AI = false;

/** 比对会话（null=无会话）：{ scopeKind, scopePos, scopeType, scopeEl,
 *  origBlocks:[{html,sig}], origHTML, hunks:[{key,o,c,cAnchor,from,to}],
 *  currentKey, decided:Set } */
const aiSession = ref(null);
/** 对话条节点 chip 刷新版本（选中变化时递增） */
const aiContextVersion = ref(0);
/** AI 自身写文档中（此时编辑器 onChange 不触发重算，由会话逻辑显式重算） */
let aiApplying = false;
let aiRecomputeTimer = 0;

/** 行内容器白名单（行内 span 选中时上浮到它们；表格内则提级到整个表格） */
const AI_SAFE_BLOCKS = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'taskItem',
  'codeBlock',
  'section',
  'column',
  'detailsContent',
]);

/** 内容同步回 content + emit（AI 写文档后统一调用） */
function syncAiContent() {
  const editor = editorInstance.value;
  if (!editor || editor.isDestroyed) return;
  try {
    const html = editor.getHTML();
    content.value = html;
    emit('update:value', html);
    emit('update:modelValue', html);
    emit('change', html);
  } catch {
    /* 忽略 */
  }
}

/** 默认 AI 修改服务（未显式传入 props.fetchAi 时调用内置后端接口，支持 SSE 动态推流与全参透传） */
async function defaultFetchAi({
  model,
  id,
  field,
  locale,
  instruction,
  html,
  text,
  block_html,
  selection_text,
  scope,
  label,
  selection,
  container,
  fullHtml,
  images,
  signal,
  onChunk,
}) {
  const payload = {
    model: (model || props.model) || undefined,
    id: id || props.recordId,
    field: field || props.fieldName,
    locale: locale || props.locale,
    instruction,
    html: html || '',
    text: text || '',
    block_html: block_html || container?.html || html || '',
    selection_text: selection_text || selection?.text || text || '',
    scope: scope || 'full',
    label: label || '',
    selection: selection || null,
    container: container || null,
    full_html: fullHtml || (editorInstance.value?.getHTML() ?? ''),
    images: images || [],
    stream: typeof onChunk === 'function',
  };

  try {
    if (typeof onChunk === 'function' && typeof window !== 'undefined' && window.fetch) {
      try {
        const { useAccessStore } = await import('@vben/stores');
        const { useAppConfig } = await import('@vben/hooks');
        const accessStore = useAccessStore();
        const appConfig = useAppConfig(import.meta.env, import.meta.env.PROD);
        const baseUrl = appConfig?.apiURL || '';
        const url = `${baseUrl.replace(/\/+$/, '')}/ai/chat`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...(accessStore?.accessToken ? { Authorization: `Bearer ${accessStore.accessToken}` } : {}),
          },
          body: JSON.stringify(payload),
          signal,
        });

        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.includes('text/event-stream') && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let doneResult = '';
          let fullAcc = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr) continue;
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.event === 'delta' && parsed.text) {
                  fullAcc += parsed.text;
                  onChunk(parsed.text);
                } else if (parsed.event === 'done') {
                  doneResult = parsed.full_html || parsed.full_text || fullAcc;
                } else if (parsed.event === 'error') {
                  throw new Error(parsed.message || 'AI 服务异常中断');
                }
              } catch (e) {
                if (e?.message && e.message.includes('AI 服务')) throw e;
              }
            }
          }
          if (doneResult || fullAcc) return doneResult || fullAcc;
        }
      } catch (streamErr) {
        if (streamErr?.name === 'AbortError' || signal?.aborted) throw streamErr;
        console.warn('[app-editor] SSE 流读取异常，尝试非流式兜底:', streamErr);
      }
    }

    const res = await requestClient.post(
      'ai/chat',
      { ...payload, stream: false },
      { signal },
    );
    if (typeof res === 'string' && res) return res;
    if (res?.html) return res.html;
    if (res?.content) return res.content;
    return String(res || '');
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) throw err;
    console.warn('[app-editor] 远程 AI 接口未响应，执行本地智能排版兜底:', err);
    const selText = selection?.text || selection_text || text;
    if (scope === 'range' && selText) {
      const mockResult = `深入推进${selText}体系升级与前沿探索`;
      if (typeof onChunk === 'function') {
        const parts = mockResult.split('');
        for (const p of parts) onChunk(p);
      }
      return mockResult;
    }
    const base = html || (text ? `<p style="line-height:1.75;text-align:justify;">${text}</p>` : '');
    if (!base.trim()) {
      return '<p style="line-height:1.75;margin-bottom:1em;">已根据您的要求生成全新的段落内容。企业秉持精益求精的管理理念，持续完善全流程质量体系，致力于提供高标准的优质产品与可靠保障。</p>';
    }
    return base.includes('style=')
      ? base
      : base.replace(/<p(\s*>|\s+[^>]*>)/i, '<p style="line-height:1.75;text-align:justify;"$1');
  }
}

/** 对话条作用域解析（现取现用）：支持任意起止位置的文本选区，与节点检查器解耦 */
function resolveAiScopeTarget() {
  const editor = editorInstance.value;
  if (!editor || editor.isDestroyed) return null;
  const state = editor.state;
  const doc = state.doc;
  const { from, to, empty } = state.selection;

  // 1. 优先：用户高亮选中的任意文本范围（支持任意起止位置、跨段落或短语）
  if (!empty && from < to) {
    const text = doc.textBetween(from, to, ' ');
    if (text.trim().length > 0) {
      let html = '';
      try {
        const slice = state.selection.content();
        const div = document.createElement('div');
        div.appendChild(DOMSerializer.fromSchema(state.schema).serializeFragment(slice.content));
        html = div.innerHTML;
      } catch {
        html = text;
      }
      const clean = text.replace(/\s+/g, ' ').trim();
      const summary = clean.length > 20 ? `${clean.slice(0, 20)}…` : clean;

      let container = null;
      try {
        if (typeof doc.resolve === 'function') {
          const $from = doc.resolve(from);
          const depth = $from.sharedDepth(to);
          const blockDepth = depth > 0 ? depth : 1;
          const blockNode = $from.node(blockDepth);
          const blockPos = $from.before(blockDepth);
          if (blockNode) {
            let containerHtml = '';
            try {
              const dom = editor.view.nodeDOM(blockPos);
              if (dom instanceof HTMLElement) {
                containerHtml = dom.outerHTML;
              }
            } catch {
              containerHtml = '';
            }
            if (!containerHtml && state.schema) {
              try {
                const div = document.createElement('div');
                div.appendChild(DOMSerializer.fromSchema(state.schema).serializeNode(blockNode));
                containerHtml = div.innerHTML;
              } catch {
                containerHtml = `<p>${blockNode.textContent || ''}</p>`;
              }
            }
            let markedHtml = '';
            if (containerHtml && html) {
              markedHtml = containerHtml.replace(html, `<selection>${html}</selection>`);
              if (markedHtml === containerHtml && text) {
                markedHtml = containerHtml.replace(text, `<selection>${text}</selection>`);
              }
            }
            container = {
              type: blockNode.type?.name || 'block',
              pos: blockPos,
              html: containerHtml,
              marked_html: markedHtml || containerHtml,
            };
          }
        }
      } catch {
        container = null;
      }

      return {
        kind: 'range',
        from,
        to,
        pos: from,
        text,
        html,
        label: `选区（${text.length}字）：${summary}`,
        selection: { text, html, from, to },
        container,
      };
    }
  }

  // 2. 媒体节点明确选中（图片或视频）
  const media = selectedTarget.value;
  if (media && (media.type === 'image' || media.type === 'video')) {
    const n = doc.nodeAt(media.pos);
    if (n && n.type.name === media.type) {
      return {
        kind: 'node',
        pos: media.pos,
        node: n,
        type: media.type,
        text: '',
        html: editor.view.nodeDOM(media.pos)?.outerHTML || '',
        label: media.type === 'image' ? '选中图片' : '选中视频',
      };
    }
  }

  // 3. 结构组件（表格或多栏）明确选中
  if (selectedTableTarget.value) {
    const v = selectedTableTarget.value;
    const n = doc.nodeAt(v.pos);
    if (n && n.type.name === 'table') {
      return {
        kind: 'node',
        pos: v.pos,
        node: n,
        type: 'table',
        text: n.textContent || '',
        html: v.el?.outerHTML || '',
        label: '选中表格',
      };
    }
  }
  if (selectedColumnsTarget.value) {
    const v = selectedColumnsTarget.value;
    const n = doc.nodeAt(v.pos);
    if (n && n.type.name === 'columns') {
      return {
        kind: 'node',
        pos: v.pos,
        node: n,
        type: 'columns',
        text: n.textContent || '',
        html: v.el?.outerHTML || '',
        label: '选中多栏',
      };
    }
  }

  // 4. 用户仅点击/光标驻留但未选中文本时，与元素检查器区分开，默认不限定范围（全文）
  return null;
}

/** 全文索取：{ text, html } | null */
function getAiFull() {
  const editor = editorInstance.value;
  if (!editor || editor.isDestroyed) return null;
  try {
    const text = editor.getText() || '';
    return { text, html: editor.getHTML() || '' };
  } catch {
    return null;
  }
}

/** 节点/选区 chip 点击：回跳定位到该选区或节点 */
function locateAiScope() {
  const t = resolveAiScopeTarget();
  if (!t) return;
  if (t.kind === 'range') {
    focusAiHunk({ from: t.from, to: t.to });
  } else if (t.node && typeof t.pos === 'number') {
    focusAiHunk({ from: t.pos, to: t.pos + t.node.nodeSize });
  }
}

/**
 * 会话作用域实时解析（每次重算都校验，防位置陈旧）。
 * @returns {{ node: object, base: number } | null}
 */
function resolveAiScopeLive(s) {
  const editor = editorInstance.value;
  if (!editor || editor.isDestroyed || !s) return null;
  try {
    if (s.scopeKind === 'full') {
      return { node: editor.state.doc, base: 0 };
    }
    let node = editor.state.doc.nodeAt(s.scopePos);
    if ((!node || node.type.name !== s.scopeType) && s.scopeEl?.isConnected) {
      // 存储 pos 失效时用 DOM 身份重解析（与媒体/元素选中同策略）
      const found = resolveInspectorTarget(editor.view, s.scopeEl, {
        findImageNodeAndPos,
        findVideoNodeAndPos,
        findColumnsNodeAndPos,
        findTableNodeAndPos,
      });
      if (found && found.node && found.node.type.name === s.scopeType) {
        s.scopePos = found.pos;
        node = editor.state.doc.nodeAt(found.pos);
      }
    }
    if (!node || node.type.name !== s.scopeType) return null;
    return { node, base: s.scopePos + 1 };
  } catch {
    return null;
  }
}

/** AI 流式接收中的实时动态 Diff：打字机延伸 + 动态红底删除线与绿底下划线 */
function onAiStreamProgress({ acc, chunk, scope }) {
  const editor = editorInstance.value;
  if (!editor || editor.isDestroyed || !acc) return;
  if (scope?.kind !== 'range') return;

  const from = Math.min(scope.from, editor.state.doc.content.size);
  const origText = scope.text || '';

  // 剥离可能的外层 <p>
  let cleanAcc = acc;
  if (/^<p[^>]*>(.*?)<\/p>$/is.test(cleanAcc.trim())) {
    cleanAcc = cleanAcc.trim().replace(/^<p[^>]*>(.*?)<\/p>$/is, '$1');
  }

  const diffOps = computeTokenDiff(origText, cleanAcc);

  aiApplying = true;
  try {
    const currentEnd = aiSession.value?.streaming ? aiSession.value.to : Math.min(scope.to, editor.state.doc.content.size);
    editor
      .chain()
      .focus()
      .deleteRange({ from, to: currentEnd })
      .insertContentAt(from, cleanAcc)
      .run();

    const newTo = from + cleanAcc.length;
    syncAiContent();

    const diffRanges = [];
    let curPos = from;
    let delCount = 0;
    let insCount = 0;

    for (let idx = 0; idx < diffOps.length; idx += 1) {
      const op = diffOps[idx];
      if (op.type === 'equal') {
        curPos += op.text.length;
      } else if (op.type === 'delete') {
        delCount += 1;
        diffRanges.push({
          type: 'del',
          pos: curPos,
          text: op.text,
          key: `stream-del-${idx}-${curPos}`,
        });
      } else if (op.type === 'insert') {
        insCount += 1;
        diffRanges.push({
          type: 'ins',
          from: curPos,
          to: curPos + op.text.length,
          key: `stream-ins-${idx}-${curPos}`,
        });
        curPos += op.text.length;
      }
    }

    dispatchAiDiffSet(editor, diffRanges, 'diff-range-hunk');

    aiSession.value = {
      streaming: true,
      scopeKind: 'range',
      from,
      to: newTo,
      origFrom: from,
      origTo: scope.to,
      origText,
      origHTML: scope.html || '',
      newText: cleanAcc,
      newHtml: cleanAcc,
      diffRanges,
      hunks: [
        {
          key: 'diff-range-hunk',
          from,
          to: newTo,
          delCount,
          insCount,
        },
      ],
      currentKey: 'diff-range-hunk',
      decided: new Set(),
    };
  } finally {
    aiApplying = false;
  }
}

/** 对话条流式完成：把 AI 建议落盘并开启比对（原文快照先行，单事务可撤销） */
function onAiSuggestionReady({ html, scope }) {
  const editor = editorInstance.value;
  const body = String(html || '').trim();
  if (!editor || editor.isDestroyed || !body) {
    message.warning('AI 结果为空，已丢弃');
    return;
  }
  aiApplying = true;
  try {
    // 方案 A：用户划选局部文本时的行内词级 Diff 比对（最直观高效）
    if (scope.kind === 'range') {
      const from = Math.min(scope.from, editor.state.doc.content.size);
      const to = aiSession.value?.streaming ? aiSession.value.to : Math.min(scope.to, editor.state.doc.content.size);
      const origText = scope.text || editor.state.doc.textBetween(from, scope.to, ' ');
      const origHTML = scope.html || '';

      // 局部选区：若 AI 返回误带外部 <p> 标签则剥离，提取纯行内富文本/文本
      let newHtml = body;
      if (/^<p[^>]*>(.*?)<\/p>$/is.test(body.trim())) {
        newHtml = body.trim().replace(/^<p[^>]*>(.*?)<\/p>$/is, '$1');
      }
      const tmpDiv = document.createElement('div');
      tmpDiv.innerHTML = newHtml;
      const newText = tmpDiv.textContent || newHtml;

      // Myers / LCS 词级差分
      const diffOps = computeTokenDiff(origText, newText);

      // 把 AI 建议内容落入文档选区位置
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContentAt(from, newHtml)
        .run();

      const newTo = from + newText.length;
      syncAiContent();

      // 构建 Diff 装饰集合（删除项渲染为 <del> widget 红底删除线，新增项渲染为 <ins> 绿底下划线）
      const diffRanges = [];
      let curPos = from;
      let delCount = 0;
      let insCount = 0;

      for (let idx = 0; idx < diffOps.length; idx += 1) {
        const op = diffOps[idx];
        if (op.type === 'equal') {
          curPos += op.text.length;
        } else if (op.type === 'delete') {
          delCount += 1;
          diffRanges.push({
            type: 'del',
            pos: curPos,
            text: op.text,
            key: `del-${idx}-${curPos}`,
          });
        } else if (op.type === 'insert') {
          insCount += 1;
          diffRanges.push({
            type: 'ins',
            from: curPos,
            to: curPos + op.text.length,
            key: `ins-${idx}-${curPos}`,
          });
          curPos += op.text.length;
        }
      }

      dispatchAiDiffSet(editor, diffRanges, 'diff-range-hunk');

      aiSession.value = {
        streaming: false,
        scopeKind: 'range',
        from,
        to: newTo,
        origFrom: from,
        origTo: scope.to,
        origText,
        origHTML,
        newText,
        newHtml,
        diffRanges,
        hunks: [
          {
            key: 'diff-range-hunk',
            from,
            to: newTo,
            delCount,
            insCount,
          },
        ],
        currentKey: 'diff-range-hunk',
        decided: new Set(),
      };

      nextTick(() => {
        refreshAiPill();
      });
      message.success('AI 建议已内联标出（红底删除线为原文，绿底为AI修改）');
      return;
    }

    // 全文修改模式（全篇比对）
    let scopeNode;
    let scopePos = 0;
    let scopeType = 'doc';
    let scopeEl = null;
    let origHTML = '';
    if (scope.kind === 'full') {
      scopeNode = editor.state.doc;
      origHTML = editor.getHTML() || '';
      content.value = body;
      editor.commands.setContent(body, true);
    } else {
      if (typeof scope.pos !== 'number') {
        message.warning('作用域丢失，请重新选中后发送');
        return;
      }
      const live = editor.state.doc.nodeAt(scope.pos);
      if (!live || (scope.type && live.type.name !== scope.type)) {
        message.warning('选中内容已变化，请重新选中后发送');
        return;
      }
      scopeNode = live;
      scopePos = scope.pos;
      scopeType = live.type.name;
      try {
        const dom = editor.view.nodeDOM(scopePos);
        scopeEl = dom instanceof HTMLElement ? dom : null;
      } catch {
        scopeEl = null;
      }
      origHTML = scopeEl?.outerHTML || '';
      editor
        .chain()
        .focus()
        .deleteRange({ from: scopePos, to: scopePos + live.nodeSize })
        .insertContentAt(scopePos, body)
        .run();
    }
    const origBlocks = serializeChildBlocks(editor.schema, scopeNode);
    syncAiContent();
    aiSession.value = {
      scopeKind: scope.kind === 'full' ? 'full' : 'node',
      scopePos,
      scopeType,
      scopeEl,
      origBlocks,
      origHTML,
      hunks: [],
      currentKey: null,
      decided: new Set(),
    };
    recomputeAiSession();
    if (aiSession.value) {
      focusAiHunk(aiSession.value.hunks[0]);
      message.success('AI 建议已标出，请逐处比对确认');
    }
  } catch (err) {
    console.error('[app-editor] 应用 AI 建议失败:', err);
    message.error('应用 AI 建议失败，请重试');
  } finally {
    aiApplying = false;
  }
}

/** 重算比对（原文签名 vs 现文签名 LCS，原文下标稳定，可跨次对齐） */
function recomputeAiSession() {
  const s = aiSession.value;
  const editor = editorInstance.value;
  if (!s || !editor || editor.isDestroyed) return;
  if (s.scopeKind === 'range') return;
  const live = resolveAiScopeLive(s);
  if (!live) {
    finishAiSession('文档结构变化较大，已结束比对（当前内容保留）');
    return;
  }
  const cur = serializeChildBlocks(editor.schema, live.node);
  const offsets = childOffsets(live.node, live.base);
  const scopeEnd = live.base + live.node.content.size;
  const hunks = diffBlocks(
    s.origBlocks.map((b) => b.sig),
    cur.map((b) => b.sig),
  );
  const pending = [];
  const diffRanges = [];
  for (let idx = 0; idx < hunks.length; idx += 1) {
    const h = hunks[idx];
    if (s.decided.has(h.key)) continue;
    let from;
    let to;
    if (h.c.length > 0) {
      from = offsets[h.c[0]]?.from;
      to = offsets[h.c[h.c.length - 1]]?.to;
      if (from == null || to == null) continue;
    } else {
      const at = h.cAnchor < offsets.length ? offsets[h.cAnchor].from : scopeEnd;
      from = at;
      to = at;
    }
    let delCount = 0;
    let insCount = 0;
    if (h.o.length > 0 && h.c.length > 0 && from < to) {
      const oldText = h.o
        .map((i) => {
          const raw = s.origBlocks[i]?.html || '';
          const d = document.createElement('div');
          d.innerHTML = raw;
          return d.textContent || '';
        })
        .join(' ');
      const newText = editor.state.doc.textBetween(from, to, ' ');
      const ops = computeTokenDiff(oldText, newText);
      let curPos = from;
      for (let j = 0; j < ops.length; j += 1) {
        const op = ops[j];
        if (op.type === 'equal') {
          curPos += op.text.length;
        } else if (op.type === 'delete') {
          delCount += 1;
          diffRanges.push({
            type: 'del',
            pos: curPos,
            text: op.text,
            key: `del-full-${idx}-${j}`,
          });
        } else if (op.type === 'insert') {
          insCount += 1;
          diffRanges.push({
            type: 'ins',
            from: curPos,
            to: Math.min(to, curPos + op.text.length),
            key: `ins-full-${idx}-${j}`,
          });
          curPos += op.text.length;
        }
      }
    } else if (from < to) {
      insCount += 1;
      diffRanges.push({
        type: 'ins',
        from,
        to,
        key: h.key,
      });
    }
    pending.push({ ...h, from, to, delCount, insCount });
  }
  s.hunks = pending;
  if (!pending.some((h) => h.key === s.currentKey)) {
    s.currentKey = pending[0]?.key ?? null;
  }
  dispatchAiDiffSet(
    editor,
    diffRanges,
    s.currentKey,
  );
  if (pending.length === 0) {
    finishAiSession('AI 建议已处理完毕');
    return;
  }
  // DOM 落定后刷新小丸位置
  nextTick(() => {
    refreshAiPill();
  });
}

/** 用户手动改文档时消抖重算（AI 自身写文档时由 aiApplying 屏蔽） */
function scheduleAiRecompute() {
  if (aiRecomputeTimer) clearTimeout(aiRecomputeTimer);
  aiRecomputeTimer = setTimeout(() => {
    aiRecomputeTimer = 0;
    if (aiSession.value && !aiApplying) recomputeAiSession();
  }, 400);
}

const pendingAiHunks = computed(() => aiSession.value?.hunks || []);
const currentAiHunk = computed(() => {
  const s = aiSession.value;
  if (!s) return null;
  return s.hunks.find((h) => h.key === s.currentKey) || s.hunks[0] || null;
});
const aiCurrentIndex = computed(() => {
  const s = aiSession.value;
  if (!s) return 0;
  const idx = s.hunks.findIndex((h) => h.key === s.currentKey);
  return idx >= 0 ? idx : 0;
});

/** 小丸位置（fixed，跟随当前变更节点；节点不可见时隐藏） */
const aiPill = reactive({ show: false, top: 0, left: 0 });

function refreshAiPill() {
  const s = aiSession.value;
  const h = currentAiHunk.value;
  const editor = editorInstance.value;
  if (!s || !editor || editor.isDestroyed) {
    aiPill.show = false;
    return;
  }
  const pos = h?.from ?? s.from ?? 0;
  let rect = null;
  try {
    if (typeof editor.view?.coordsAtPos === 'function') {
      const coords = editor.view.coordsAtPos(
        Math.max(0, Math.min(pos, editor.state.doc.content.size)),
      );
      if (coords && coords.top > 0) {
        rect = {
          top: coords.top,
          bottom: coords.bottom,
          left: coords.left,
          width: 10,
          height: 20,
        };
      }
    }
  } catch {
    rect = null;
  }
  if (!rect) {
    try {
      let dom = null;
      try {
        dom = editor.view.nodeDOM(pos);
      } catch {
        dom = null;
      }
      const el = dom instanceof HTMLElement ? dom : dom?.parentElement;
      if (el?.isConnected) rect = el.getBoundingClientRect();
    } catch {
      rect = null;
    }
  }
  if (!rect || !(rect.width >= 0) || !(rect.height >= 0)) {
    aiPill.show = false;
    return;
  }
  const PILL_W = 280;
  const PILL_H = 48;
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - PILL_W - 8));
  let top = rect.top - PILL_H - 10;
  if (top < 10) top = rect.bottom + 10;
  aiPill.top = Math.round(Math.max(10, top));
  aiPill.left = Math.round(left);
  aiPill.show = true;
}

/** 切换当前比对处（导航/点击选中跟随，小丸跟过去） */
function setAiCurrent(key, scroll = false) {
  const s = aiSession.value;
  const editor = editorInstance.value;
  if (!s || !editor) return;
  s.currentKey = key;
  dispatchAiDiffCurrent(editor, key);
  if (scroll) {
    const h = s.hunks.find((x) => x.key === key);
    if (h) focusAiHunk(h);
  }
  refreshAiPill();
}

/** 滚动并框选到指定区间（尽力而为：文本选区 → 节点选区 → 仅滚动） */
function focusAiHunk(h) {
  const editor = editorInstance.value;
  if (!editor || editor.isDestroyed || !h) return;
  try {
    const doc = editor.state.doc;
    const to = Math.max(0, Math.min(h.to, doc.content.size));
    const from = Math.max(0, Math.min(h.from, to));
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(doc, from, to)),
    );
  } catch {
    try {
      const doc = editor.state.doc;
      editor.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(doc, h.from)),
      );
    } catch {
      /* 忽略 */
    }
  }
  try {
    let dom = null;
    try {
      dom = editor.view.nodeDOM(h.from);
    } catch {
      dom = null;
    }
    const el = dom instanceof HTMLElement ? dom : dom?.parentElement;
    if (el?.isConnected) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  } catch {
    /* 忽略 */
  }
}

/** 接受当前处（保留 AI 改法，仅去掉高亮） */
function acceptAiCurrent() {
  const s = aiSession.value;
  if (!s) return;
  if (s.scopeKind === 'range') {
    finishAiSession('已接受 AI 修改建议');
    return;
  }
  const h = currentAiHunk.value;
  if (!h) {
    finishAiSession('已接受 AI 修改');
    return;
  }
  s.decided.add(h.key);
  const remaining = s.hunks.filter((x) => !s.decided.has(x.key));
  if (remaining.length === 0) {
    finishAiSession('AI 建议已全部接受');
  } else {
    s.currentKey = remaining[0].key;
    message.success(`已接受该处（剩余 ${remaining.length} 处）`);
    nextTick(() => refreshAiPill());
  }
}

/** 恢复当前处（用原文换回 AI 改法） */
function rejectAiCurrent() {
  const s = aiSession.value;
  const editor = editorInstance.value;
  if (!s || !editor || editor.isDestroyed) return;
  aiApplying = true;
  try {
    if (s.scopeKind === 'range') {
      editor
        .chain()
        .focus()
        .deleteRange({ from: s.from, to: s.to })
        .insertContentAt(s.from, s.origHTML || s.origText)
        .run();
      syncAiContent();
      finishAiSession('已恢复原文');
      return;
    }
    if (s.scopeKind === 'full') {
      content.value = s.origHTML;
      editor.commands.setContent(s.origHTML, true);
      syncAiContent();
      finishAiSession('已放弃全部修改，恢复原文');
      return;
    }
    if (h && h.o.length > 0) {
      const oldHTML = h.o.map((i) => s.origBlocks[i]?.html || '').join('');
      if (h.c.length > 0) {
        editor
          .chain()
          .focus()
          .deleteRange({ from: h.from, to: h.to })
          .insertContentAt(h.from, oldHTML)
          .run();
      } else {
        editor.chain().focus().insertContentAt(h.from, oldHTML).run();
      }
      syncAiContent();
    }
    finishAiSession('已恢复原文');
  } catch (err) {
    console.error('[app-editor] 恢复原文失败:', err);
    finishAiSession('恢复失败，已结束比对');
  } finally {
    aiApplying = false;
  }
}

/** 全部接受（保留现状，结束会话） */
function acceptAllAi() {
  if (!aiSession.value) return;
  finishAiSession('已接受全部 AI 修改');
}

/** 放弃修改（整段恢复原文，结束会话） */
function abandonAi() {
  const s = aiSession.value;
  const editor = editorInstance.value;
  if (!s || !editor || editor.isDestroyed) {
    finishAiSession('');
    return;
  }
  aiApplying = true;
  try {
    if (s.scopeKind === 'full') {
      content.value = s.origHTML;
      editor.commands.setContent(s.origHTML, true);
    } else {
      const live = resolveAiScopeLive(s);
      if (!live) {
        finishAiSession('作用域已失效，会话结束（当前内容保留）');
        return;
      }
      const from = s.scopePos;
      const to = from + live.node.nodeSize;
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContentAt(from, s.origHTML)
        .run();
    }
    syncAiContent();
    clearAllSelection();
    nextTick(() => {
      onScrollOrResize();
    });
    finishAiSession('已放弃 AI 修改，恢复原文');
  } catch (err) {
    console.error('[app-editor] 放弃 AI 修改失败:', err);
    finishAiSession('放弃失败，会话已结束（当前内容保留）');
  } finally {
    aiApplying = false;
  }
}

/** 结束会话（保留当前文档，仅清高亮与状态） */
function finishAiSession(toast) {
  const editor = editorInstance.value;
  if (editor && !editor.isDestroyed) dispatchAiDiffClear(editor);
  aiSession.value = null;
  aiPill.show = false;
  if (aiRecomputeTimer) {
    clearTimeout(aiRecomputeTimer);
    aiRecomputeTimer = 0;
  }
  if (toast) message.success(toast);
}

// 四路选中任一变化即触发右侧定位（flush:post，等本轮选中落定）
watch(
  [selectedElementTarget, selectedTableTarget, selectedColumnsTarget, selectedTarget],
  () => {
    if (isSplitView.value) scheduleSplitLocate();
    // 对话条节点 chip 常驻，直接刷新（比对中跳过，不打断）
    if (!aiSession.value) aiContextVersion.value += 1;
  },
  { flush: 'post' },
);

function onEditorReady(editor) {
  editorInstance.value = editor;
  editor.on('selectionUpdate', onEditorSelectionUpdate);
  // 回放桥接就绪前到达的点击（Tiptap v3 create 事件延迟触发的首屏竞态）
  flushPendingClickSelect();
  nextTick(() => {
    bindEditorDOM();
  });
}

const extensions = createEditorExtensions({
  placeholder: props.placeholder,
  upload: uploadImage,
  onEditorReady,
  onPasteHtml: handlePasteHtml,
  onOpenMedia: openInsertMedia,
  getFetchMentions: () => fetchMentionsRef.value,
});

// Mention 数据源（支持调用方热切换）
const fetchMentionsRef = ref(props.fetchMentions ?? null);

watch(
  () => props.fetchMentions,
  (val) => {
    fetchMentionsRef.value = val ?? null;
  },
);

/**
 * Slash / FloatingMenu 的图片视频插入：打开插入模式媒体库
 */
const insertMediaModalOpen = ref(false);
const insertMediaType = ref('image');

function openInsertMedia(type = 'image') {
  if (!isEditable.value) return;
  if (hasMediaLibrary.value) {
    insertMediaType.value = type === 'video' ? 'video' : 'image';
    insertMediaModalOpen.value = true;
    return;
  }
  // 无媒体库时回退：图片走顶栏本地上传，视频提示
  if (type === 'video') {
    message.info('未配置媒体库，请使用顶栏视频按钮上传或填链接');
    return;
  }
  triggerLocalImagePickForInsert();
}

function triggerLocalImagePickForInsert() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file || !editorInstance.value) return;
    try {
      const url = await uploadImage(file);
      if (url) editorInstance.value.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      console.error('[app-editor] 本地图片插入失败:', err);
    }
  });
  input.click();
}

function onInsertMediaSelect(item) {
  if (!item?.url || !editorInstance.value) return;
  const editor = editorInstance.value;
  const isVideo =
    insertMediaType.value === 'video' ||
    item.type === 'video' ||
    item.mime?.startsWith('video/');
  if (isVideo) {
    editor.chain().focus().setVideo({ src: item.url }).run();
  } else {
    editor.chain().focus().setImage({ src: stripThumbnailParam(item.url) }).run();
  }
  insertMediaModalOpen.value = false;
}

watch(
  () => props.value,
  (newValue) => {
    if (newValue !== undefined && newValue !== content.value) {
      content.value = newValue;
      if (showSource.value) {
        sourceCode.value = formatHtml(newValue);
      }
    }
  },
);

watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue !== undefined && newValue !== content.value) {
      content.value = newValue;
      if (showSource.value) {
        sourceCode.value = formatHtml(newValue);
      }
    }
  },
);

watch(content, (newValue) => {
  emit('update:value', newValue);
  emit('update:modelValue', newValue);
});

function onChange(payload) {
  emit('change', payload);
  // 双栏下左侧每次改动节流刷新右侧源码
  scheduleSplitSourceRefresh();
  // AI 比对进行中用户又改了文档：消抖重算（AI 自身写文档时屏蔽）
  if (aiSession.value && !aiApplying) scheduleAiRecompute();
  if (selectedTarget.value?.type === 'image') {
    nextTick(() => {
      updateHandlePosition();
    });
  }
}

onMounted(() => {
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
  window.addEventListener('keydown', onKeyDown);
  // 字数栏页面设置下拉：点外部关闭
  document.addEventListener('click', onViewportDocClick);
  // hover 监听挂编辑器容器（冒泡即止）：移出容器 mouseleave 熄灭；
  // 不挂 document，避免与表格库的全局 mousemove 监听纠缠
  editorContainerRef.value?.addEventListener('mousemove', onHoverMove);
  editorContainerRef.value?.addEventListener('mouseleave', onHoverLeave);
  nextTick(() => {
    bindEditorDOM();
  });
});

onBeforeUnmount(() => {
  unbindEditorDOM();
  window.removeEventListener('scroll', onScrollOrResize, true);
  window.removeEventListener('resize', onScrollOrResize);
  window.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('click', onViewportDocClick);
  editorContainerRef.value?.removeEventListener('mousemove', onHoverMove);
  editorContainerRef.value?.removeEventListener('mouseleave', onHoverLeave);
  if (hoverRaf) {
    cancelAnimationFrame(hoverRaf);
    hoverRaf = 0;
  }
  if (splitRefreshTimer) {
    clearTimeout(splitRefreshTimer);
    splitRefreshTimer = 0;
  }
  if (splitLocateTimer) {
    clearTimeout(splitLocateTimer);
    splitLocateTimer = 0;
  }
  if (aiRecomputeTimer) {
    clearTimeout(aiRecomputeTimer);
    aiRecomputeTimer = 0;
  }
  sourceMountSeq += 1;
  unmountSourceEditor();
});

// AI 辅助预留接口：父组件经模板 ref 拿到 sourceAi（未进入源码模式时为 null），
// 方法约定见 source-editor.js 文件头；典型链路=「AI 面板读 getSelection/getCode
// → 生成片段 → insertCode/replaceSelection（默认选中结果）→ 用户看着改」
defineExpose({
  sourceAi: sourceAiApi,
});
</script>

<template>
  <div
    ref="editorContainerRef"
    class="app-editor-tiptap relative"
    :class="{ 'app-editor--fullscreen': isFullscreen, 'app-editor--split': isSplitView, 'app-editor--split-drag': isSplitDragging }"
    :data-editor-ready="editorInstance ? 'true' : 'false'"
    @click.capture="onContentClick"
  >
    <div v-if="label && !isFullscreen" class="mb-2 text-sm text-gray-700">
      {{ label }}
    </div>

    <!-- 包装外框：非全屏移除 overflow-hidden 确保弹层自由悬浮；全屏由样式表锁定 flex 列容器与内部滚动 -->
    <div
      class="app-editor-wrapper relative flex flex-col rounded-xl border border-border bg-card transition-all"
      :class="{
        'viewport--1300px': editorCanvasWidth === '1300px',
        'viewport--960px': editorCanvasWidth === '960px',
        'viewport--677px': editorCanvasWidth === '677px',
        'viewport--375px': editorCanvasWidth === '375px',
      }"
    >
      <!-- 统一增强排版工具栏（替代 tiptap 默认简易顶栏，支持源码模式联动） -->
      <EditorToolbar
        v-if="toolbar && editorInstance"
        :editor="editorInstance"
        :editable="isEditable"
        :previewable="previewable"
        :is-fullscreen="isFullscreen"
        :is-split-view="isSplitView"
        :upload-image="uploadImage"
        :upload-file="uploadGeneralFile"
        :fetch-media="props.fetchMedia !== undefined ? props.fetchMedia : defaultFetchMedia"
        :thumbnail-process="props.thumbnailProcess"
        :external-assets-count="externalAssetsCount"
        :proofread-issues="proofreadIssues"
        :proofreading="proofreading"
        :proofread-configured="proofreadConfigured"
        @toggle-fullscreen="toggleFullscreen"
        @toggle-split-view="toggleSplitView"
        @open-external-assets="openExternalModal"
        @open-preview="openPreviewModal"
        @run-proofread="runProofread"
        @locate-proofread="locateProofreadIssue"
        @apply-proofread="applyProofreadSuggestion"
        @dismiss-proofread="dismissProofreadIssue"
        @clear-proofread="clearProofreadIssues"
      />

      <!-- 头部外链标注通知条 -->
      <div
        v-if="externalAssetsCount > 0 && !isBannerDismissed"
        class="flex items-center justify-between border-b border-amber-200/80 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300 transition-all"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="inline-block size-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
          <span class="truncate">
            文档中使用了 <strong>{{ externalAssetsCount }}</strong> 个外部外链资源（已排除 cdn-edp.hsdxchina.com 等站内链接），建议转存入库以防失效。
          </span>
        </div>
        <div class="flex items-center gap-2 shrink-0 ml-2">
          <button
            class="rounded bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-amber-600 transition-colors"
            type="button"
            @click="openExternalModal"
          >
            查看资源列表并转存
          </button>
          <button
            class="rounded p-0.5 text-amber-700/60 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
            title="暂时收起提示"
            type="button"
            @click="isBannerDismissed = true"
          >
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" x2="6" y1="6" y2="18" />
              <line x1="6" x2="18" y1="6" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <!-- 双栏容器：单栏时纵向堆叠（仅其一可见），双栏时左右并排 -->
      <div
        ref="splitBodyRef"
        class="app-editor-split-body"
        :class="{ 'is-split': isSplitView }"
      >
      <!-- 可视化富文本排版区（下半部独立圆角防溢出；双栏时为左半栏） -->
      <div
        v-show="showEditor"
        class="app-editor-split__left relative"
        :style="isSplitView ? { width: `${splitLeftPct}%` } : null"
      >
        <!-- 小屏幕视口仿真指示条（公众号 / 移动端） -->
        <div
          v-if="editorCanvasWidth === '677px'"
          class="mx-auto my-2.5 flex max-w-[677px] items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs text-emerald-800 dark:text-emerald-200 select-none shadow-xs transition-all"
        >
          <div class="flex items-center gap-2">
            <span class="inline-block size-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="font-medium">📰 小屏幕视口仿真：微信公众号 (677px)</span>
            <span class="text-[11px] opacity-75 hidden sm:inline">· 纯内联排版渲染，单列堆叠/双列并排保真预览</span>
          </div>
          <button
            class="text-[11px] text-emerald-700 dark:text-emerald-300 hover:underline font-medium"
            type="button"
            @click="editorCanvasWidth = '1300px'"
          >
            返回标准 1300px
          </button>
        </div>

        <div
          v-if="editorCanvasWidth === '375px'"
          class="mx-auto my-2.5 flex max-w-[375px] items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/10 px-3.5 py-1.5 text-xs text-blue-800 dark:text-blue-200 select-none shadow-xs transition-all"
        >
          <div class="flex items-center gap-2">
            <span class="inline-block size-2 rounded-full bg-blue-500 animate-pulse"></span>
            <span class="font-medium">📱 小屏幕视口仿真：手机移动端 (375px)</span>
          </div>
          <button
            class="text-[11px] text-blue-700 dark:text-blue-300 hover:underline font-medium"
            type="button"
            @click="editorCanvasWidth = '1300px'"
          >
            返回标准 1300px
          </button>
        </div>

      <VbenTiptap
        v-model="content"
        :editable="!disabled"
        :placeholder="placeholder"
        :min-height="isFullscreen ? 200 : minHeight"
        :max-height="isFullscreen ? 'none' : maxHeight"
        :toolbar="false"
        :previewable="false"
        :extensions="extensions"
        class="rounded-b-xl overflow-hidden"
        @change="onChange"
      />
      <!-- AI 入口：常驻编辑区（双栏时为左栏）底部中央，胶囊态点击展开输入框（临时隐藏） -->
      <AiChatBar
        v-if="SHOW_AI && (!aiSession || aiSession.streaming)"
        class="app-editor-ai-float"
        :fetch-ai="props.fetchAi ?? defaultFetchAi"
        :upload-image="uploadImage"
        :review-active="false"
        :resolve-scope="resolveAiScopeTarget"
        :get-full="getAiFull"
        :context-version="aiContextVersion"
        :model="props.model"
        :record-id="props.recordId"
        :field-name="props.fieldName"
        :locale="props.locale"
        @stream-progress="onAiStreamProgress"
        @suggestion-ready="onAiSuggestionReady"
        @locate-scope="locateAiScope"
      />
      </div>

      <!-- 双栏拖拽条：左右拖动调整宽度，双击恢复默认（窄屏堆叠时隐藏） -->
      <div
        v-if="isSplitView"
        class="app-editor-split-divider"
        title="拖拽调整左右宽度（双击恢复默认）"
        @pointerdown="onSplitDragStart"
        @dblclick="resetSplitRatio"
      >
        <span></span>
      </div>

      <!-- HTML 源代码编辑区（下半部独立圆角防溢出；双栏时为右半栏） -->
      <div
        v-if="showSource"
        class="app-editor-source app-editor-split__right flex flex-1 flex-col rounded-b-xl overflow-hidden bg-muted/20"
        @mousedown="onSourceEditorInteract"
      >
        <div
          class="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground"
        >
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="inline-block size-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span class="truncate">HTML 源代码（左侧选中元素自动定位高亮 · 右侧改动需点“应用”生效）</span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              class="rounded border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
              title="按现有规则格式化源码（Ctrl/Cmd+Z 可撤销）"
              type="button"
              @click="formatSourceCode"
            >
              格式化
            </button>
            <button
              class="rounded bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white hover:opacity-90"
              title="把右侧源码应用到左侧编辑器（快捷键 Ctrl/Cmd+S）"
              type="button"
              @click="applySplitSourceToEditor"
            >
              应用右侧改动
            </button>
            <button
              class="rounded border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
              title="退出双栏，返回单栏编辑"
              type="button"
              @click="toggleSplitView"
            >
              收起双栏
            </button>
          </div>
        </div>
        <!-- CodeMirror 6 宿主（动态挂载，见 mountSourceEditor）；加载失败回退纯文本 textarea -->
        <div
          v-if="!sourceTextareaFallback"
          ref="sourceHostRef"
          class="app-editor-source-host flex-1 min-h-0"
          :style="{
            minHeight: isFullscreen
              ? 'calc(100vh - 150px)'
              : typeof minHeight === 'number'
                ? `${minHeight}px`
                : minHeight,
          }"
        ></div>
        <textarea
          v-else
          :value="sourceCode"
          class="app-editor-source-textarea flex-1 resize-none border-0 bg-transparent p-4 font-mono text-xs leading-relaxed text-foreground outline-none"
          :style="{
            minHeight: isFullscreen
              ? 'calc(100vh - 150px)'
              : typeof minHeight === 'number'
                ? `${minHeight}px`
                : minHeight,
          }"
          placeholder="在此编辑 HTML 源码..."
          spellcheck="false"
          @focus="onSourceEditorInteract"
          @mousedown="onSourceEditorInteract"
          @input="onSourceInput"
        ></textarea>
      </div>
      </div>

      <!-- AI 比对浮动控制卡：跟随当前变更节点，逐处确认或全部处理（临时隐藏） -->
      <div
        v-if="SHOW_AI && aiSession && !aiSession.streaming && aiPill.show"
        class="app-editor-ai-pillwrap"
        :style="{ position: 'fixed', top: `${aiPill.top}px`, left: `${aiPill.left}px`, zIndex: 120 }"
      >
        <div class="app-editor-ai-pill-card flex flex-col rounded-xl border border-border/80 bg-card p-1.5 shadow-2xl backdrop-blur-md select-none text-xs">
          <!-- 主操作行 -->
          <div class="flex items-center gap-1.5">
            <span class="flex items-center gap-1 pl-1.5 pr-1 py-1 text-[11px] font-semibold text-primary">
              <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
              </svg>
              <span>AI 建议</span>
              <span v-if="pendingAiHunks.length > 1" class="ml-0.5 rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] text-primary">
                {{ aiCurrentIndex + 1 }}/{{ pendingAiHunks.length }}
              </span>
            </span>

            <!-- 统计标记（红删 / 绿增） -->
            <div v-if="currentAiHunk?.delCount || currentAiHunk?.insCount" class="flex items-center gap-1 text-[10px] px-1 py-0.5 bg-muted/60 rounded">
              <span v-if="currentAiHunk.delCount" class="text-rose-600 font-medium">-{{ currentAiHunk.delCount }}删</span>
              <span v-if="currentAiHunk.insCount" class="text-emerald-600 font-medium">+{{ currentAiHunk.insCount }}增</span>
            </div>

            <button
              class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
              title="放弃 AI 修改并恢复原文"
              type="button"
              @click="rejectAiCurrent"
            >
              <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              <span>恢复原文</span>
            </button>

            <button
              class="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1 text-xs font-medium text-white shadow-xs transition-all hover:scale-[1.02] cursor-pointer"
              title="接受并保留 AI 修改"
              type="button"
              @click="acceptAiCurrent"
            >
              <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>接受修改</span>
            </button>

            <button
              class="ml-0.5 rounded-md p-1 text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              title="结束比对（保留当前文档）"
              type="button"
              @click="finishAiSession('已结束比对')"
            >
              <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <!-- 多处变更批量操作栏 -->
          <div
            v-if="pendingAiHunks.length > 1"
            class="mt-1 flex items-center justify-between gap-2 border-t border-border/50 pt-1.5 px-1 text-[11px]"
          >
            <span class="text-muted-foreground">剩余 {{ pendingAiHunks.length }} 处待确认</span>
            <div class="flex items-center gap-1">
              <button
                class="rounded px-2 py-0.5 text-primary hover:bg-primary/10 transition-colors font-medium cursor-pointer"
                title="接受全部剩余修改"
                type="button"
                @click="acceptAllAi"
              >
                全部接受
              </button>
              <span class="text-border">|</span>
              <button
                class="rounded px-2 py-0.5 text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                title="放弃本次 AI 全部修改，恢复原文"
                type="button"
                @click="abandonAi"
              >
                放弃全部
              </button>
            </div>
          </div>
        </div>
      </div>
    <!-- 选区 Bubble 菜单：行内格式快捷操作（AI 写作入口预留位）
      常驻挂载（仅跟随 editor 实例），显隐由 shouldShow + hide meta 控制；
      禁止用 v-if 跟随源码模式反复拆装——插件内部有延迟更新与异步定位，
      卸载后回调操作已摘除 DOM 会抛 insertBefore 空指针 -->
    <BubbleMenu
      v-if="editorInstance"
      :editor="editorInstance"
      plugin-key="appEditorBubble"
      :should-show="shouldShowBubbleMenu"
      :update-delay="0"
    >
      <div class="app-editor-bubble">
        <button
          class="app-editor-btn"
          title="加粗"
          type="button"
          @click="editorInstance.chain().focus().toggleBold().run()"
        >
          <span class="font-bold">B</span>
        </button>
        <button
          class="app-editor-btn"
          title="斜体"
          type="button"
          @click="editorInstance.chain().focus().toggleItalic().run()"
        >
          <span class="italic">I</span>
        </button>
        <button
          class="app-editor-btn"
          title="删除线"
          type="button"
          @click="editorInstance.chain().focus().toggleStrike().run()"
        >
          <span class="line-through">S</span>
        </button>
        <button
          class="app-editor-btn"
          title="行内代码"
          type="button"
          @click="editorInstance.chain().focus().toggleCode().run()"
        >
          <span class="font-mono text-[11px]">&lt;&gt;</span>
        </button>
      </div>
    </BubbleMenu>

    <!-- 空行 Floating 菜单：块级快捷插入（常驻挂载，原因同上） -->
    <FloatingMenu
      v-if="editorInstance"
      :editor="editorInstance"
      plugin-key="appEditorFloatingMenu"
      :should-show="shouldShowFloatingMenu"
      :update-delay="0"
    >
      <div class="app-editor-bubble">
        <button
          class="app-editor-btn"
          title="正文 / 标题"
          type="button"
          @click="floatingInsert('paragraph')"
        >
          <span class="text-[11px] font-bold">T</span>
        </button>
        <button
          class="app-editor-btn"
          title="图片"
          type="button"
          @click="openInsertMedia('image')"
        >
          <ImagePlus class="size-4" />
        </button>
        <button
          class="app-editor-btn"
          title="两栏布局"
          type="button"
          @click="floatingInsert('columns')"
        >
          <span class="text-[11px]">分栏</span>
        </button>
        <button
          class="app-editor-btn"
          title="表格"
          type="button"
          @click="floatingInsert('table')"
        >
          <span class="text-[11px]">表格</span>
        </button>
      </div>
    </FloatingMenu>

    <!-- 底部固定 Dock 工具条：上下文模式（多栏/表格/检查器/媒体）与全局模式（一键排版）互斥显示，永不遮挡菜单与正文。
         编辑视口与复制样式表统一收在底部状态条，此处不再重复提供。 -->
    <div
      class="app-editor-dock"
    >
      <!-- 元素检查器：任意选中元素的基础设置卡（面包屑可切换祖先） -->
      <div
        v-if="selectedElementTarget"
        class="app-editor-floating__toolbar app-editor-inspector-toolbar"
      >
        <div class="app-editor-floating__header">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="app-editor-tag">
              <svg
                class="size-3.5"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <path d="m12 2 9 5-9 5-9-5 9-5z" />
                <path d="m3 12 9 5 9-5" />
                <path d="m3 17 9 5 9-5" />
              </svg>
              检查器
            </span>
            <span class="app-editor-tag-badge">{{ selectedElementTarget.kind === 'span' ? 'span 样式文本' : friendlyNodeName(selectedElementTarget.node) }}</span>
          </div>
          <button
            class="text-[11px] text-muted-foreground hover:text-foreground px-1 shrink-0"
            title="取消元素选中"
            type="button"
            @click="clearElementSelection"
          >
            ✕
          </button>
        </div>

        <!-- 面包屑：点击切换到祖先块，有样式的带圆点提示 -->
        <div v-if="elementCrumbs.length > 1" class="flex flex-wrap items-center gap-1 px-1 pb-1 text-[11px]">
          <button
            v-for="crumb in elementCrumbs"
            :key="`${crumb.span ? 'span' : 'node'}-${crumb.pos}`"
            type="button"
            class="rounded px-1.5 py-0.5 transition-colors inline-flex items-center gap-1"
            :class="isCrumbActive(crumb) ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
            :title="`选中${crumb.label}${crumb.hasManaged ? '（有自定义样式）' : ''}`"
            @click="onCrumbClick(crumb)"
          >
            <span
              v-if="crumb.hasManaged"
              class="inline-block size-1.5 rounded-full bg-emerald-500 shrink-0"
              title="该层有自定义样式"
            ></span>
            {{ crumb.label }}
          </button>
        </div>

        <div class="app-editor-floating__actions app-editor-inspector__actions">
          <!-- 外边距 -->
          <div class="app-editor-inspector__group">
            <span class="app-editor-panel-title">外边距</span>
            <div class="app-editor-inspector__quad">
              <label title="上">上<input v-model="elementBoxForm.mt" class="app-editor-inspector__num" inputmode="numeric" placeholder="0" type="text" @change="commitElementBox" /></label>
              <label title="右">右<input v-model="elementBoxForm.mr" class="app-editor-inspector__num" inputmode="numeric" placeholder="0" type="text" @change="commitElementBox" /></label>
              <label title="下">下<input v-model="elementBoxForm.mb" class="app-editor-inspector__num" inputmode="numeric" placeholder="0" type="text" @change="commitElementBox" /></label>
              <label title="左">左<input v-model="elementBoxForm.ml" class="app-editor-inspector__num" inputmode="numeric" placeholder="0" type="text" @change="commitElementBox" /></label>
            </div>
            <button
              class="app-editor-btn app-editor-btn--pill"
              title="清空外边距"
              type="button"
              @click="clearElementBox('margin')"
            >
              <span class="app-editor-btn-label">清零</span>
            </button>
          </div>

          <span class="app-editor-divider"></span>

          <!-- 内边距 -->
          <div class="app-editor-inspector__group">
            <span class="app-editor-panel-title">内边距</span>
            <div class="app-editor-inspector__quad">
              <label title="上">上<input v-model="elementBoxForm.pt" class="app-editor-inspector__num" inputmode="numeric" placeholder="0" type="text" @change="commitElementBox" /></label>
              <label title="右">右<input v-model="elementBoxForm.pr" class="app-editor-inspector__num" inputmode="numeric" placeholder="0" type="text" @change="commitElementBox" /></label>
              <label title="下">下<input v-model="elementBoxForm.pb" class="app-editor-inspector__num" inputmode="numeric" placeholder="0" type="text" @change="commitElementBox" /></label>
              <label title="左">左<input v-model="elementBoxForm.pl" class="app-editor-inspector__num" inputmode="numeric" placeholder="0" type="text" @change="commitElementBox" /></label>
            </div>
            <button
              class="app-editor-btn app-editor-btn--pill"
              title="清空内边距"
              type="button"
              @click="clearElementBox('padding')"
            >
              <span class="app-editor-btn-label">清零</span>
            </button>
          </div>

          <span class="app-editor-divider"></span>

          <!-- 对齐（仅文本块） -->
          <div class="app-editor-inspector__group">
            <span class="app-editor-panel-title">对齐</span>
            <div v-if="isAlignableNode(selectedElementTarget.node)" class="app-editor-presets">
              <button
                class="app-editor-preset-btn"
                type="button"
                @click="setElementAlign('left')"
              >
                左
              </button>
              <button
                class="app-editor-preset-btn"
                type="button"
                @click="setElementAlign('center')"
              >
                中
              </button>
              <button
                class="app-editor-preset-btn"
                type="button"
                @click="setElementAlign('right')"
              >
                右
              </button>
              <button
                class="app-editor-preset-btn"
                type="button"
                @click="setElementAlign('justify')"
              >
                两端
              </button>
            </div>
            <span v-else class="text-[10px] text-muted-foreground">该元素不支持</span>
          </div>

          <span class="app-editor-divider"></span>

          <!-- 显示类型：块级 / 行内块 / 行内 / 隐藏 -->
          <div class="app-editor-inspector__group">
            <span class="app-editor-panel-title" title="切换元素显示类型（block / inline-block 等），输出为内联 style">显示</span>
            <div class="app-editor-presets">
              <button
                v-for="opt in DISPLAY_OPTIONS"
                :key="String(opt.value)"
                class="app-editor-preset-btn"
                :class="{ 'is-active': (elementDisplay || null) === opt.value }"
                :title="opt.value ? `显示为 ${opt.label}（display: ${opt.value}）` : '恢复默认显示'"
                type="button"
                @click="setElementDisplay(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <span class="app-editor-divider"></span>

          <!-- 背景色 -->
          <div class="app-editor-inspector__group">
            <span class="app-editor-panel-title">背景色</span>
            <div class="app-editor-presets">
              <button
                v-for="c in INSPECTOR_BG_PRESETS"
                :key="c.value || 'none'"
                class="app-editor-preset-btn"
                :style="c.value ? { backgroundColor: c.value } : {}"
                :title="c.label"
                type="button"
                @click="setElementBgColor(c.value)"
              >
                {{ c.label }}
              </button>
              <input
                class="app-editor-inspector__color"
                title="自定义背景色"
                type="color"
                @change="(e) => setElementBgColor(e.target.value)"
              />
            </div>
          </div>

          <span class="app-editor-divider"></span>

          <!-- 背景图 -->
          <div class="app-editor-inspector__group">
            <span class="app-editor-panel-title">背景图</span>
            <div class="flex items-center gap-1">
              <input
                v-model="elementBgImageInput"
                class="app-editor-inspector__url"
                placeholder="https://... 或上传"
                type="text"
                @keydown.enter.prevent="applyElementBgImage"
              />
              <button
                class="app-editor-btn app-editor-btn--pill"
                title="上传背景图"
                type="button"
                @click="uploadElementBgImage"
              >
                <span class="app-editor-btn-label">上传</span>
              </button>
              <button
                class="app-editor-btn app-editor-btn--pill"
                :class="{ 'is-active': elementBgSize === 'cover' }"
                title="背景图铺满（cover）"
                type="button"
                @click="setElementBgSize('cover')"
              >
                <span class="app-editor-btn-label">铺满</span>
              </button>
              <button
                class="app-editor-btn app-editor-btn--pill"
                :class="{ 'is-active': elementBgSize === 'contain' }"
                title="背景图完整显示（contain）"
                type="button"
                @click="setElementBgSize('contain')"
              >
                <span class="app-editor-btn-label">完整</span>
              </button>
              <button
                class="app-editor-btn app-editor-btn--danger"
                title="清除背景图"
                type="button"
                @click="clearElementBgImage"
              >
                <span class="app-editor-btn-label">清除</span>
              </button>
            </div>
          </div>

          <span class="app-editor-divider"></span>

          <!-- 圆角与边框 -->
          <div class="app-editor-inspector__group">
            <span class="app-editor-panel-title">圆角边框</span>
            <div class="flex items-center gap-1">
              <div class="app-editor-presets">
                <button
                  v-for="r in INSPECTOR_RADIUS_PRESETS"
                  :key="r.value"
                  class="app-editor-preset-btn"
                  type="button"
                  @click="elementRadiusInput = r.value; applyElementRadius()"
                >
                  {{ r.label }}
                </button>
              </div>
              <input
                v-model="elementRadiusInput"
                class="app-editor-inspector__num app-editor-inspector__num--wide"
                inputmode="numeric"
                placeholder="px"
                title="自定义圆角（px）"
                type="text"
                @change="applyElementRadius"
              />
              <button
                class="app-editor-btn app-editor-btn--pill"
                :class="{ 'is-active': elementBorderOn }"
                title="1px 实线边框开关"
                type="button"
                @click="toggleElementBorder"
              >
                <span class="app-editor-btn-label">边框</span>
              </button>
              <input
                class="app-editor-inspector__color"
                title="边框颜色（自动开启边框）"
                type="color"
                @change="(e) => setElementBorderColor(e.target.value)"
              />
            </div>
          </div>

          <span class="app-editor-divider"></span>

          <!-- 特效：阴影与不透明度 -->
          <div class="app-editor-inspector__group">
            <span class="app-editor-panel-title">特效</span>
            <div class="flex items-center gap-1">
              <div class="app-editor-presets">
                <button
                  v-for="s in INSPECTOR_SHADOW_PRESETS"
                  :key="s.label"
                  class="app-editor-preset-btn"
                  :class="{ 'is-active': (elementShadow || '') === (s.value || '') }"
                  :title="s.value ? `阴影：${s.value}` : '清除阴影'"
                  type="button"
                  @click="setElementShadow(s.value)"
                >
                  {{ s.label }}
                </button>
              </div>
              <input
                v-model="elementOpacityInput"
                class="app-editor-inspector__num app-editor-inspector__num--wide"
                inputmode="decimal"
                placeholder="不透明%"
                title="不透明度 0~100（100 为默认不透明）"
                type="text"
                @change="commitElementOpacity"
                @keydown.enter.prevent="commitElementOpacity"
              />
              <span class="text-[10px] text-muted-foreground">%</span>
            </div>
          </div>

          <span class="app-editor-divider"></span>

          <!-- 块操作 -->
          <div class="app-editor-inspector__group">
            <span class="app-editor-panel-title">块操作</span>
            <div class="flex items-center gap-1">
              <template v-if="selectedElementTarget.kind !== 'span'">
                <button
                  class="app-editor-btn"
                  title="上移"
                  type="button"
                  @click="moveSelectedElement(-1)"
                >
                  <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                </button>
                <button
                  class="app-editor-btn"
                  title="下移"
                  type="button"
                  @click="moveSelectedElement(1)"
                >
                  <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <button
                  class="app-editor-btn app-editor-btn--pill"
                  :class="{ 'is-active': isElementBleed }"
                  :title="isElementBleed ? '当前块为通栏全宽 (.web-bleed)，点击恢复为普通正文宽' : '设置当前块为通栏全宽 (添加 .web-bleed，突破内容列跨满整行)'"
                  type="button"
                  @click="toggleElementBleed"
                >
                  <span class="app-editor-btn-label">↔️ 全宽通栏</span>
                  <span v-if="isElementBleed" class="text-[10px] text-primary font-semibold">(已开)</span>
                </button>
                <button
                  class="app-editor-btn app-editor-btn--pill"
                  title="复制当前块"
                  type="button"
                  @click="duplicateSelectedElement"
                >
                  <span class="app-editor-btn-label">复制</span>
                </button>
                <button
                  class="app-editor-btn app-editor-btn--pill"
                  title="在上方插入空行"
                  type="button"
                  @click="insertParagraphBesideSelected(-1)"
                >
                  <span class="app-editor-btn-label">前插行</span>
                </button>
                <button
                  class="app-editor-btn app-editor-btn--pill"
                  title="在下方插入空行"
                  type="button"
                  @click="insertParagraphBesideSelected(1)"
                >
                  <span class="app-editor-btn-label">后插行</span>
                </button>
                <button
                  class="app-editor-btn app-editor-btn--danger"
                  title="删除当前块"
                  type="button"
                  @click="deleteSelectedElement"
                >
                  <svg class="size-3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                </button>
              </template>
              <button
                class="app-editor-btn app-editor-btn--pill"
                title="重置本面板设置的样式（边距/背景/边框/圆角/对齐）"
                type="button"
                @click="resetElementStyles"
              >
                <span class="app-editor-btn-label">重置</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 上层卡片：多栏布局专用设置工具栏（只要处于多栏中即显示） -->
      <div
        v-if="selectedColumnsTarget"
        class="app-editor-floating__toolbar app-editor-columns-toolbar"
      >
        <div class="app-editor-floating__header flex items-center justify-between pb-2 border-b border-border/60">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="app-editor-tag flex items-center gap-1.5 font-semibold text-primary">
              <svg
                class="size-3.5"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <rect height="18" rx="2" width="18" x="3" y="3" />
                <line x1="12" x2="12" y1="3" y2="21" />
              </svg>
              多栏布局
            </span>
            <span class="app-editor-tag-badge font-mono">{{ currentColumnsCount }} 栏</span>
            <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium">
              第 {{ currentColumnActiveIndex + 1 }} 栏
            </span>
            <!-- 排版模式状态提示 -->
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              :class="currentColumnsPerRow === 2
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'"
            >
              <span>{{ currentColumnsPerRow === 2 ? '小屏布局: 双列并排' : '小屏布局: 单列堆叠' }}</span>
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button
              class="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="关闭多栏工具栏"
              type="button"
              @click="clearColumnsSelection"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="app-editor-floating__actions flex items-center gap-2 pt-2 flex-wrap">
          <!-- 核心功能：小屏排版模式（单列堆叠 vs 双列并排） -->
          <div class="inline-flex items-center rounded-lg border border-border bg-background p-0.5 shadow-xs">
            <button
              type="button"
              class="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all"
              :class="currentColumnsPerRow === 1
                ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
              title="小屏幕（≤768px 及公众号等无 CSS 环境）单列垂直堆叠，宽屏自动按比例展开"
              @click="setColumnsPerRowValue(1)"
            >
              <span>📱 单列堆叠</span>
              <span v-if="currentColumnsPerRow === 1" class="text-[10px] opacity-80">(当前)</span>
            </button>
            <button
              type="button"
              class="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all"
              :class="currentColumnsPerRow === 2
                ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
              title="小屏幕（≤768px 及公众号等无 CSS 环境）双列流式并排，宽屏自动按比例展开"
              @click="setColumnsPerRowValue(2)"
            >
              <span>↔️ 双列并排</span>
              <span v-if="currentColumnsPerRow === 2" class="text-[10px] opacity-80">(当前)</span>
            </button>
          </div>

          <!-- 全宽通栏 (web-bleed) 开关 -->
          <button
            class="app-editor-btn app-editor-btn--pill"
            :class="{ 'is-active': isColumnsBleed }"
            :title="isColumnsBleed ? '当前多栏为通栏全宽 (.web-bleed)，点击恢复为普通正文宽' : '设置多栏为通栏全宽 (添加 .web-bleed，突破内容列跨满整行)'"
            type="button"
            @click="toggleColumnsBleed"
          >
            <span class="text-xs font-medium">↔️ 全宽通栏</span>
            <span v-if="isColumnsBleed" class="text-[10px] text-primary font-semibold">(已开)</span>
          </button>

          <!-- 首/末列内收（仅全宽通栏时可用）：外缘对齐内容列，另一侧继续出血 -->
          <button
            class="app-editor-btn app-editor-btn--pill"
            :class="{ 'is-active': isColumnsInsetStart }"
            :disabled="!isColumnsBleed"
            :title="isColumnsInsetStart ? '首列已内收：左缘对齐内容列、右缘继续出血（需先开全宽通栏）' : '首列内收：左缘对齐内容列、右缘继续出血（需先开全宽通栏）'"
            type="button"
            @click="toggleColumnsInset('start')"
          >
            <span class="text-xs font-medium">首列内收</span>
            <span v-if="isColumnsInsetStart" class="text-[10px] text-primary font-semibold">(已开)</span>
          </button>
          <button
            class="app-editor-btn app-editor-btn--pill"
            :class="{ 'is-active': isColumnsInsetEnd }"
            :disabled="!isColumnsBleed"
            :title="isColumnsInsetEnd ? '末列已内收：右缘对齐内容列、左缘继续出血（需先开全宽通栏）' : '末列内收：右缘对齐内容列、左缘继续出血（需先开全宽通栏）'"
            type="button"
            @click="toggleColumnsInset('end')"
          >
            <span class="text-xs font-medium">末列内收</span>
            <span v-if="isColumnsInsetEnd" class="text-[10px] text-primary font-semibold">(已开)</span>
          </button>

          <!-- 等高铺满：以最高的栏为基准，各栏内部内容自动垂直铺满 -->
          <button
            class="app-editor-btn app-editor-btn--pill"
            :class="{ 'is-active': isColumnsEqualHeight }"
            :title="isColumnsEqualHeight ? '已开启等高铺满，点击恢复自然高度' : '等高铺满：以最高的栏为基准，其他各栏内容自动铺满全高'"
            type="button"
            @click="toggleColumnsEqualHeight"
          >
            <span class="text-xs font-medium">↕️ 等高铺满</span>
            <span v-if="isColumnsEqualHeight" class="text-[10px] text-primary font-semibold">(已开)</span>
          </button>

          <span class="app-editor-divider"></span>

          <!-- 比例调节 -->
          <button
            class="app-editor-btn app-editor-btn--pill"
            :class="{ 'is-active': columnsActivePanel === 'layout' }"
            title="调整列宽比例"
            type="button"
            @click="toggleColumnsPanel('layout')"
          >
            <span class="app-editor-btn-label">比例: {{ currentColumnsLayout }}</span>
            <ChevronDown
              class="size-3 opacity-60 transition-transform duration-200"
              :class="{ 'rotate-180': columnsActivePanel === 'layout' }"
            />
          </button>

          <!-- 间隙宽度调节 -->
          <button
            class="app-editor-btn app-editor-btn--pill"
            :class="{ 'is-active': columnsActivePanel === 'gap' }"
            title="调整列间距 (Gap)"
            type="button"
            @click="toggleColumnsPanel('gap')"
          >
            <span class="app-editor-btn-label">间距: {{ currentColumnsGap }}</span>
            <ChevronDown
              class="size-3 opacity-60 transition-transform duration-200"
              :class="{ 'rotate-180': columnsActivePanel === 'gap' }"
            />
          </button>

          <span class="app-editor-divider"></span>

          <!-- 添加列 -->
          <button
            class="app-editor-btn"
            :disabled="currentColumnsCount >= 6"
            title="在此列后追加一列 (最多 6 栏)"
            type="button"
            @click="addColumnToCurrent"
          >
            <span class="text-xs font-semibold">+ 增加列</span>
          </button>

          <!-- 列顺序调整与删除 -->
          <div class="inline-flex rounded-md border border-border bg-background p-0.5">
            <button
              class="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
              :disabled="currentColumnActiveIndex <= 0"
              title="当前列向左移动"
              type="button"
              @click="moveCurrentActiveColumnLeft"
            >
              <svg class="size-3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>
            <button
              class="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
              :disabled="currentColumnActiveIndex >= currentColumnsCount - 1"
              title="当前列向右移动"
              type="button"
              @click="moveCurrentActiveColumnRight"
            >
              <svg class="size-3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </button>
            <button
              class="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
              title="删除当前列（若只剩2列则解包成单栏）"
              type="button"
              @click="deleteCurrentActiveColumn"
            >
              <svg class="size-3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
            </button>
          </div>

          <span class="app-editor-divider"></span>

          <!-- 在分栏上方/下方插入空行 -->
          <div class="inline-flex rounded-md border border-border bg-background p-0.5">
            <button
              class="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="在分栏上方插入空行聚焦"
              type="button"
              @click="insertParagraphBeforeCurrentColumns"
            >
              <ArrowUp class="size-3.5" />
            </button>
            <button
              class="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="在分栏下方插入空行聚焦"
              type="button"
              @click="insertParagraphAfterCurrentColumns"
            >
              <ArrowDown class="size-3.5" />
            </button>
          </div>

          <!-- 解包 -->
          <button
            class="app-editor-btn text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 font-medium text-xs"
            title="解包分栏（平铺所有文字与图片，移除分栏外壳，内容不丢失）"
            type="button"
            @click="unsetCurrentColumns"
          >
            <span>解包平铺</span>
          </button>

          <!-- 删多栏 -->
          <button
            class="app-editor-btn app-editor-btn--danger text-xs font-medium"
            title="删除整个多栏布局及其中所有内容"
            type="button"
            @click="deleteCurrentColumns"
          >
            <span>删整栏</span>
          </button>
        </div>

        <!-- 多栏二级面板区（比例设置、间隙设置、排版基线详解） -->
        <div v-if="columnsActivePanel" class="app-editor-floating__panels">
          <!-- 比例调节面板 -->
          <div v-if="columnsActivePanel === 'layout'" class="app-editor-panel pt-3 mt-2 border-t border-border/70">
            <div class="flex items-center justify-between pb-2">
              <div class="flex items-center gap-1.5">
                <span class="font-semibold text-xs text-foreground">快捷比例切换</span>
                <span class="text-[10px] text-muted-foreground">（按比例分配列宽，拖拽列间分割线也可自定义）</span>
              </div>
              <button
                class="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                type="button"
                @click="resetColumnsEqualWidth"
              >
                <span>均等平分所有栏</span>
              </button>
            </div>

            <div class="flex flex-wrap gap-2">
              <template v-if="currentColumnsCount === 2">
                <button
                  class="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:border-primary/50"
                  :class="{ 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30': currentColumnsLayout === '1:1' }"
                  type="button"
                  @click="setColumnsLayoutPreset('1:1')"
                >
                  <span class="inline-flex w-7 h-3 rounded bg-muted overflow-hidden border border-border/50">
                    <span class="w-1/2 h-full bg-primary/40 border-r border-border"></span>
                    <span class="w-1/2 h-full bg-primary/40"></span>
                  </span>
                  <span>1 : 1 (等宽平分)</span>
                </button>
                <button
                  class="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:border-primary/50"
                  :class="{ 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30': currentColumnsLayout === '1:2' }"
                  type="button"
                  @click="setColumnsLayoutPreset('1:2')"
                >
                  <span class="inline-flex w-7 h-3 rounded bg-muted overflow-hidden border border-border/50">
                    <span class="w-1/3 h-full bg-primary/40 border-r border-border"></span>
                    <span class="w-2/3 h-full bg-primary/60"></span>
                  </span>
                  <span>1 : 2 (左窄右宽)</span>
                </button>
                <button
                  class="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:border-primary/50"
                  :class="{ 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30': currentColumnsLayout === '2:1' }"
                  type="button"
                  @click="setColumnsLayoutPreset('2:1')"
                >
                  <span class="inline-flex w-7 h-3 rounded bg-muted overflow-hidden border border-border/50">
                    <span class="w-2/3 h-full bg-primary/60 border-r border-border"></span>
                    <span class="w-1/3 h-full bg-primary/40"></span>
                  </span>
                  <span>2 : 1 (左宽右窄)</span>
                </button>
                <button
                  class="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:border-primary/50"
                  :class="{ 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30': currentColumnsLayout === '1:3' }"
                  type="button"
                  @click="setColumnsLayoutPreset('1:3')"
                >
                  <span class="inline-flex w-7 h-3 rounded bg-muted overflow-hidden border border-border/50">
                    <span class="w-1/4 h-full bg-primary/40 border-r border-border"></span>
                    <span class="w-3/4 h-full bg-primary/60"></span>
                  </span>
                  <span>1 : 3 (侧边栏)</span>
                </button>
                <button
                  class="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:border-primary/50"
                  :class="{ 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30': currentColumnsLayout === '3:1' }"
                  type="button"
                  @click="setColumnsLayoutPreset('3:1')"
                >
                  <span class="inline-flex w-7 h-3 rounded bg-muted overflow-hidden border border-border/50">
                    <span class="w-3/4 h-full bg-primary/60 border-r border-border"></span>
                    <span class="w-1/4 h-full bg-primary/40"></span>
                  </span>
                  <span>3 : 1 (右侧栏)</span>
                </button>
              </template>
              <template v-else-if="currentColumnsCount === 3">
                <button
                  class="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:border-primary/50"
                  :class="{ 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30': currentColumnsLayout === '1:1:1' }"
                  type="button"
                  @click="setColumnsLayoutPreset('1:1:1')"
                >
                  <span class="inline-flex w-8 h-3 rounded bg-muted overflow-hidden border border-border/50">
                    <span class="w-1/3 h-full bg-primary/40 border-r border-border"></span>
                    <span class="w-1/3 h-full bg-primary/40 border-r border-border"></span>
                    <span class="w-1/3 h-full bg-primary/40"></span>
                  </span>
                  <span>1 : 1 : 1 (等宽三等分)</span>
                </button>
                <button
                  class="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:border-primary/50"
                  :class="{ 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30': currentColumnsLayout === '1:2:1' }"
                  type="button"
                  @click="setColumnsLayoutPreset('1:2:1')"
                >
                  <span class="inline-flex w-8 h-3 rounded bg-muted overflow-hidden border border-border/50">
                    <span class="w-1/4 h-full bg-primary/40 border-r border-border"></span>
                    <span class="w-2/4 h-full bg-primary/60 border-r border-border"></span>
                    <span class="w-1/4 h-full bg-primary/40"></span>
                  </span>
                  <span>1 : 2 : 1 (居中聚焦)</span>
                </button>
                <button
                  class="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:border-primary/50"
                  :class="{ 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30': currentColumnsLayout === '2:1:1' }"
                  type="button"
                  @click="setColumnsLayoutPreset('2:1:1')"
                >
                  <span>2 : 1 : 1</span>
                </button>
                <button
                  class="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:border-primary/50"
                  :class="{ 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30': currentColumnsLayout === '1:1:2' }"
                  type="button"
                  @click="setColumnsLayoutPreset('1:1:2')"
                >
                  <span>1 : 1 : 2</span>
                </button>
              </template>
              <template v-else>
                <button
                  class="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary"
                  type="button"
                  @click="resetColumnsEqualWidth"
                >
                  <span>均等平分所有 {{ currentColumnsCount }} 栏</span>
                </button>
              </template>
            </div>
          </div>

          <!-- 间隙宽度面板 -->
          <div v-else-if="columnsActivePanel === 'gap'" class="app-editor-panel pt-3 mt-2 border-t border-border/70">
            <div class="flex items-center justify-between pb-2">
              <span class="font-semibold text-xs text-foreground">列间隙宽度 (Gap)</span>
              <span class="text-[10px] text-muted-foreground">（通过内联 padding/margin 保持多端一致）</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="g in [
                  { label: '0px 无缝紧贴', val: '0px' },
                  { label: '8px 紧凑微距', val: '8px' },
                  { label: '16px 标准推荐', val: '16px' },
                  { label: '24px 舒适宽松', val: '24px' },
                  { label: '32px 大号开阔', val: '32px' }
                ]"
                :key="g.val"
                class="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-all hover:border-primary/50"
                :class="{ 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30': currentColumnsGap === g.val }"
                type="button"
                @click="setColumnsGapValue(g.val)"
              >
                {{ g.label }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 表格专用设置工具栏（点击表格即显示，可与多栏/媒体堆叠） -->
      <div
        v-if="selectedTableTarget"
        class="app-editor-floating__toolbar app-editor-table-toolbar"
      >
        <div class="app-editor-floating__header">
          <div class="flex items-center gap-1.5">
            <span class="app-editor-tag">
              <svg
                class="size-3.5"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <rect height="18" rx="2" width="18" x="3" y="3" />
                <line x1="3" x2="21" y1="9" y2="9" />
                <line x1="3" x2="21" y1="15" y2="15" />
                <line x1="9" x2="9" y1="3" y2="21" />
                <line x1="15" x2="15" y1="3" y2="21" />
              </svg>
              表格
            </span>
            <span class="app-editor-tag-badge">{{ currentTableDims.rows }} 行 × {{ currentTableDims.cols }} 列</span>
          </div>
          <button
            class="text-[11px] text-muted-foreground hover:text-foreground px-1"
            title="关闭表格工具栏"
            type="button"
            @click="clearTableSelection"
          >
            ✕
          </button>
        </div>

        <div class="app-editor-floating__actions">
          <!-- 行操作 -->
          <button
            class="app-editor-btn app-editor-btn--pill"
            title="在上方插入行"
            type="button"
            @click="runTableAction(() => editorInstance.chain().focus().addRowBefore().run())"
          >
            <span class="app-editor-btn-label">上插行</span>
          </button>
          <button
            class="app-editor-btn app-editor-btn--pill"
            title="在下方插入行"
            type="button"
            @click="runTableAction(() => editorInstance.chain().focus().addRowAfter().run())"
          >
            <span class="app-editor-btn-label">下插行</span>
          </button>
          <button
            class="app-editor-btn app-editor-btn--pill"
            title="复制当前行（含内容）"
            type="button"
            @click="runTableAction(() => editorInstance.chain().focus().duplicateRow().run(), '含合并单元格的行暂不支持复制')"
          >
            <span class="app-editor-btn-label">复制行</span>
          </button>
          <button
            class="app-editor-btn app-editor-btn--danger"
            title="删除当前行"
            type="button"
            @click="runTableAction(() => editorInstance.chain().focus().deleteRow().run())"
          >
            <span class="text-[11px] font-medium">删行</span>
          </button>

          <span class="app-editor-divider"></span>

          <!-- 列操作 -->
          <button
            class="app-editor-btn app-editor-btn--pill"
            title="在左侧插入列"
            type="button"
            @click="runTableAction(() => editorInstance.chain().focus().addColumnBefore().run())"
          >
            <span class="app-editor-btn-label">左插列</span>
          </button>
          <button
            class="app-editor-btn app-editor-btn--pill"
            title="在右侧插入列"
            type="button"
            @click="runTableAction(() => editorInstance.chain().focus().addColumnAfter().run())"
          >
            <span class="app-editor-btn-label">右插列</span>
          </button>
          <button
            class="app-editor-btn app-editor-btn--pill"
            title="复制当前列（含内容，合并单元格列暂不支持）"
            type="button"
            @click="runTableAction(() => editorInstance.chain().focus().duplicateColumn().run(), '含合并单元格的列暂不支持复制')"
          >
            <span class="app-editor-btn-label">复制列</span>
          </button>
          <button
            class="app-editor-btn app-editor-btn--danger"
            title="删除当前列"
            type="button"
            @click="runTableAction(() => editorInstance.chain().focus().deleteColumn().run())"
          >
            <span class="text-[11px] font-medium">删列</span>
          </button>

          <span class="app-editor-divider"></span>

          <!-- 合并 / 表头 / 删除 -->
          <button
            class="app-editor-btn app-editor-btn--pill"
            title="合并所选单元格，再点一次拆分"
            type="button"
            @click="runTableAction(() => editorInstance.chain().focus().mergeOrSplit().run())"
          >
            <span class="app-editor-btn-label">合并/拆分</span>
          </button>
          <button
            class="app-editor-btn app-editor-btn--pill"
            title="切换首行表头"
            type="button"
            @click="runTableAction(() => editorInstance.chain().focus().toggleHeaderRow().run())"
          >
            <span class="app-editor-btn-label">表头行</span>
          </button>
          <button
            class="app-editor-btn app-editor-btn--danger"
            title="删除整个表格"
            type="button"
            @click="deleteCurrentTable"
          >
            <svg class="size-3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
          </button>

          <span class="app-editor-divider"></span>

          <!-- 单元格底色 -->
          <span class="app-editor-panel-title">底色</span>
          <button
            class="app-editor-preset-btn"
            title="清除单元格底色"
            type="button"
            @click="setCellBackgroundUi(null)"
          >
            无
          </button>
          <button
            v-for="c in CELL_BG_PRESETS"
            :key="c.value"
            class="app-editor-preset-btn"
            :style="{ backgroundColor: c.value }"
            :title="`单元格底色 ${c.label}`"
            type="button"
            @click="setCellBackgroundUi(c.value)"
          >
            {{ c.label }}
          </button>
        </div>
      </div>

      <!-- 下层卡片：图片特殊块工具栏（若当前选中了图片，堆叠在多栏下方显示） -->
      <div
        v-if="selectedTarget?.type === 'image'"
        class="app-editor-floating__toolbar app-editor-image-toolbar"
      >
        <div class="app-editor-floating__header">
          <span class="app-editor-tag">图片</span>
          <button
            class="text-[11px] text-muted-foreground hover:text-foreground px-1"
            title="取消图片选中"
            type="button"
            @click="clearSelection"
          >
            ✕
          </button>
        </div>
        <div class="app-editor-floating__actions">
          <!-- 换图 -->
      <button
        class="app-editor-btn"
        title="换图"
        type="button"
        @click="pickImage"
      >
        <ImagePlus class="size-4" />
      </button>
      <span class="app-editor-divider"></span>

      <!-- 尺寸调节 -->
      <button
        class="app-editor-btn app-editor-btn--pill"
        :class="{ 'is-active': activePanel === 'size' }"
        title="尺寸调节"
        type="button"
        @click="togglePanel('size')"
      >
        <Expand class="size-3.5" />
        <span class="app-editor-btn-label">{{ sizePillLabel }}</span>
        <ChevronDown
          class="size-3 opacity-60 transition-transform duration-200"
          :class="{ 'rotate-180': activePanel === 'size' }"
        />
      </button>
      <span class="app-editor-divider"></span>

      <!-- 对齐方式 -->
      <button
        class="app-editor-btn app-editor-btn--pill"
        :class="{ 'is-active': activePanel === 'align' }"
        title="对齐方式"
        type="button"
        @click="togglePanel('align')"
      >
        <component :is="currentAlignIcon" class="size-3.5" />
        <ChevronDown
          class="size-3 opacity-60 transition-transform duration-200"
          :class="{ 'rotate-180': activePanel === 'align' }"
        />
      </button>
      <span class="app-editor-divider"></span>

      <!-- 全宽通栏 (.web-bleed) -->
      <button
        class="app-editor-btn app-editor-btn--pill"
        :class="{ 'is-active': isMediaBleed }"
        :title="isMediaBleed ? '当前图片为通栏全宽 (.web-bleed)，点击恢复为普通正文宽' : '设置图片为通栏全宽 (添加 .web-bleed，突破内容列跨满整行)'"
        type="button"
        @click="toggleMediaBleed"
      >
        <span class="text-xs font-medium">↔️ 全宽通栏</span>
        <span v-if="isMediaBleed" class="text-[10px] text-primary font-semibold">(已开)</span>
      </button>
      <span class="app-editor-divider"></span>

      <!-- 继承通用 Section 工具栏动作：前插空行 -->
      <button
        class="app-editor-btn"
        title="在图片前插入空行 (可在此处换行输入)"
        type="button"
        @click="insertParagraphBeforeCurrentBlock"
      >
        <ArrowUp class="size-4" />
      </button>

      <!-- 继承通用 Section 工具栏动作：后插空行 -->
      <button
        class="app-editor-btn"
        title="在图片后插入空行 (跳出图片换行)"
        type="button"
        @click="insertParagraphAfterCurrentBlock"
      >
        <ArrowDown class="size-4" />
      </button>

      <span class="app-editor-divider"></span>

      <!-- 继承通用 Section 工具栏动作：上移 -->
      <button
        class="app-editor-btn"
        title="上移图片 (与上一个兄弟块交换位置)"
        type="button"
        @click="moveBlockUp"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      <!-- 继承通用 Section 工具栏动作：下移 -->
      <button
        class="app-editor-btn"
        title="下移图片 (与下一个兄弟块交换位置)"
        type="button"
        @click="moveBlockDown"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <span class="app-editor-divider"></span>

      <!-- 继承通用 Section 工具栏动作：复制 -->
      <button
        class="app-editor-btn"
        title="复制图片"
        type="button"
        @click="duplicateCurrentBlock"
      >
        <Copy class="size-4" />
      </button>

      <!-- 继承通用 Section 工具栏动作：复制 HTML 代码 -->
      <button
        class="app-editor-btn"
        title="复制图片 HTML 代码"
        type="button"
        @click="copyBlockHtml"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>

      <span class="app-editor-divider"></span>

      <!-- 继承通用 Section 工具栏动作：删除图片 -->
      <button
        class="app-editor-btn app-editor-btn--danger"
        title="删除图片"
        type="button"
        @click="deleteCurrentBlock"
      >
        <svg
          class="size-4"
          fill="none"
          height="24"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        </svg>
      </button>
        </div>
        <div v-if="activePanel" class="app-editor-floating__panels">
          <div
            v-if="activePanel === 'size'"
            class="app-editor-panel flex flex-col gap-2.5 pt-2"
            @mousedown.stop
          >
            <!-- 第一行：常用预设比例与快捷恢复 -->
            <div class="flex items-center gap-2 flex-wrap text-xs">
              <span class="text-xs text-muted-foreground font-medium shrink-0">预设比例</span>
              <div class="inline-flex rounded-md border border-border bg-background p-0.5 shadow-2xs">
                <button
                  v-for="preset in sizePresets"
                  :key="preset.value"
                  type="button"
                  class="rounded px-2.5 py-0.5 text-xs font-medium transition-all"
                  :class="String(mediaWidthInput) === String(preset.value) ? 'bg-primary text-primary-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
                  @click="applyPresetSize(preset.value)"
                >
                  {{ preset.label }}
                </button>
              </div>

              <span class="app-editor-divider"></span>

              <!-- 还原原始尺寸 -->
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="清除自定义宽高，恢复图片原始尺寸与比例"
                @click="resetMediaSizeToOriginal"
              >
                <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                <span>还原默认</span>
              </button>
            </div>

            <!-- 第二行：数值微调（宽、高、滑块） -->
            <div class="flex items-center gap-3 flex-wrap text-xs">
              <!-- 宽度组 -->
              <div class="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-2 py-0.5 shadow-2xs">
                <span class="text-muted-foreground font-medium">宽</span>
                <input
                  v-model="mediaWidthInput"
                  class="w-14 rounded border border-border/80 bg-background px-1.5 py-0.5 text-center text-xs font-mono focus:border-primary focus:outline-none"
                  inputmode="decimal"
                  placeholder="宽"
                  title="宽度数值"
                  type="text"
                  @change="commitMediaSize"
                  @keydown.enter.prevent="commitMediaSize"
                />
                <div class="inline-flex rounded border border-border bg-muted/40 p-0.5">
                  <button
                    type="button"
                    class="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                    :class="mediaWidthUnit === '%' ? 'bg-primary text-primary-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'"
                    title="按容器百分比"
                    @click="setMediaWidthUnit('%')"
                  >
                    %
                  </button>
                  <button
                    type="button"
                    class="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                    :class="mediaWidthUnit === 'px' ? 'bg-primary text-primary-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'"
                    title="固定像素"
                    @click="setMediaWidthUnit('px')"
                  >
                    px
                  </button>
                </div>
              </div>

              <!-- 高度组 -->
              <div class="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-2 py-0.5 shadow-2xs">
                <span class="text-muted-foreground font-medium">高</span>
                <div class="inline-flex rounded border border-border bg-muted/40 p-0.5">
                  <button
                    type="button"
                    class="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                    :class="mediaHeightMode === 'auto' ? 'bg-primary text-primary-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'"
                    title="高度自动（保持比例）"
                    @click="setMediaHeightMode('auto')"
                  >
                    自动
                  </button>
                  <button
                    type="button"
                    class="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                    :class="mediaHeightMode === 'px' ? 'bg-primary text-primary-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'"
                    title="固定像素高度"
                    @click="setMediaHeightMode('px')"
                  >
                    固定
                  </button>
                </div>
                <input
                  v-model="mediaHeightInput"
                  class="w-14 rounded border border-border/80 bg-background px-1.5 py-0.5 text-center text-xs font-mono focus:border-primary focus:outline-none"
                  :disabled="mediaHeightMode !== 'px'"
                  inputmode="decimal"
                  placeholder="高 px"
                  title="高度像素值"
                  type="text"
                  @change="commitMediaSize"
                  @keydown.enter.prevent="commitMediaSize"
                />
              </div>

              <!-- 滑块微调（仅在 % 模式下显示） -->
              <div v-if="mediaWidthUnit === '%'" class="inline-flex items-center gap-2 min-w-[160px]">
                <input
                  v-model="sliderValue"
                  class="app-editor-slider flex-1 h-1.5 accent-primary cursor-pointer"
                  max="100"
                  min="5"
                  step="1"
                  title="拖动调整宽度百分比"
                  type="range"
                  @mousedown.stop
                  @change="onSliderChange"
                />
                <span class="text-xs font-mono font-semibold text-primary w-9 text-right">{{ displayPercent }}%</span>
              </div>
            </div>
          </div>

        <div
          v-if="activePanel === 'align'"
          class="app-editor-panel"
          @mousedown.stop
        >
          <div class="app-editor-align-list">
            <button
              v-for="opt in ALIGN_OPTIONS"
              :key="opt.key"
              type="button"
              class="app-editor-align-item"
              :class="{
                'is-active':
                  activeAlign === opt.key ||
                  (!activeAlign && opt.key === 'left'),
              }"
              @click="setImageAlign(opt.key)"
            >
              <component :is="opt.icon" class="size-4" />
              <span>{{ opt.label }}</span>
            </button>
          </div>
        </div>
        </div>
      </div>

      <!-- 下层卡片：视频特殊块工具栏（若当前选中了视频，堆叠在多栏下方显示） -->
      <div
        v-else-if="selectedTarget?.type === 'video'"
        class="app-editor-floating__toolbar app-editor-video-toolbar"
      >
        <div class="app-editor-floating__header">
          <span class="app-editor-tag bg-indigo-500/10 text-indigo-600 border-indigo-200">视频</span>
          <button
            class="text-[11px] text-muted-foreground hover:text-foreground px-1"
            title="取消视频选中"
            type="button"
            @click="clearSelection"
          >
            ✕
          </button>
        </div>
        <div class="app-editor-floating__actions">
          <!-- 1. 播放 / 暂停 -->
      <button
        class="app-editor-btn app-editor-btn--pill"
        :class="{ 'is-active': isVideoPlaying }"
        :title="isVideoPlaying ? '暂停视频播放' : '播放视频'"
        type="button"
        @click="toggleVideoPlay"
      >
        <svg v-if="!isVideoPlaying" class="size-3.5 text-primary" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6 3 20 12 6 21 6 3"></polygon>
        </svg>
        <svg v-else class="size-3.5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
        <span class="app-editor-btn-label">{{ isVideoPlaying ? '暂停' : '播放' }}</span>
      </button>
      <span class="app-editor-divider"></span>

      <!-- 2. 更换视频 -->
      <button
        class="app-editor-btn"
        title="更换视频文件或网络地址"
        type="button"
        @click="pickVideo"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="23 7 16 12 23 17 23 7"></polygon>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
        </svg>
      </button>
      <span class="app-editor-divider"></span>

      <!-- 3. 尺寸调节 -->
      <button
        class="app-editor-btn app-editor-btn--pill"
        :class="{ 'is-active': activePanel === 'video-size' }"
        title="尺寸调节"
        type="button"
        @click="togglePanel('video-size')"
      >
        <Expand class="size-3.5" />
        <span class="app-editor-btn-label">{{ sizePillLabel }}</span>
        <ChevronDown
          class="size-3 opacity-60 transition-transform duration-200"
          :class="{ 'rotate-180': activePanel === 'video-size' }"
        />
      </button>
      <span class="app-editor-divider"></span>

      <!-- 4. 对齐方式 -->
      <button
        class="app-editor-btn app-editor-btn--pill"
        :class="{ 'is-active': activePanel === 'video-align' }"
        title="对齐方式"
        type="button"
        @click="togglePanel('video-align')"
      >
        <component :is="currentAlignIcon" class="size-3.5" />
        <ChevronDown
          class="size-3 opacity-60 transition-transform duration-200"
          :class="{ 'rotate-180': activePanel === 'video-align' }"
        />
      </button>
      <span class="app-editor-divider"></span>

      <!-- 全宽通栏 (.web-bleed) -->
      <button
        class="app-editor-btn app-editor-btn--pill"
        :class="{ 'is-active': isMediaBleed }"
        :title="isMediaBleed ? '当前视频为通栏全宽 (.web-bleed)，点击恢复为普通正文宽' : '设置视频为通栏全宽 (添加 .web-bleed，突破内容列跨满整行)'"
        type="button"
        @click="toggleMediaBleed"
      >
        <span class="text-xs font-medium">↔️ 全宽通栏</span>
        <span v-if="isMediaBleed" class="text-[10px] text-primary font-semibold">(已开)</span>
      </button>
      <span class="app-editor-divider"></span>

      <!-- 5. 视频属性（控制条/封面） -->
      <button
        class="app-editor-btn"
        :class="{ 'is-active': activePanel === 'video-props' }"
        title="视频设置（控制条/封面）"
        type="button"
        @click="togglePanel('video-props')"
      >
        <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <span class="app-editor-divider"></span>

      <!-- 继承通用 Section 工具栏动作：前插空行 -->
      <button
        class="app-editor-btn"
        title="在视频前插入空行 (可在此处换行输入)"
        type="button"
        @click="insertParagraphBeforeCurrentBlock"
      >
        <ArrowUp class="size-4" />
      </button>

      <!-- 继承通用 Section 工具栏动作：后插空行 -->
      <button
        class="app-editor-btn"
        title="在视频后插入空行 (跳出视频换行)"
        type="button"
        @click="insertParagraphAfterCurrentBlock"
      >
        <ArrowDown class="size-4" />
      </button>

      <span class="app-editor-divider"></span>

      <!-- 继承通用 Section 工具栏动作：上移 -->
      <button
        class="app-editor-btn"
        title="上移视频 (与上一个兄弟块交换位置)"
        type="button"
        @click="moveBlockUp"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      <!-- 继承通用 Section 工具栏动作：下移 -->
      <button
        class="app-editor-btn"
        title="下移视频 (与下一个兄弟块交换位置)"
        type="button"
        @click="moveBlockDown"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <span class="app-editor-divider"></span>

      <!-- 继承通用 Section 工具栏动作：复制 -->
      <button
        class="app-editor-btn"
        title="复制视频"
        type="button"
        @click="duplicateCurrentBlock"
      >
        <Copy class="size-4" />
      </button>

      <!-- 继承通用 Section 工具栏动作：复制 HTML 代码 -->
      <button
        class="app-editor-btn"
        title="复制视频 HTML 代码"
        type="button"
        @click="copyBlockHtml"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>

      <span class="app-editor-divider"></span>

      <!-- 继承通用 Section 工具栏动作：删除视频 -->
      <button
        class="app-editor-btn app-editor-btn--danger"
        title="删除视频"
        type="button"
        @click="deleteCurrentBlock"
      >
        <svg
          class="size-4"
          fill="none"
          height="24"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        </svg>
      </button>
        </div>
        <div v-if="activePanel" class="app-editor-floating__panels">
          <!-- 视频尺寸面板 -->
        <div
          v-if="activePanel === 'video-size'"
          class="app-editor-panel"
          @mousedown.stop
        >
          <div class="app-editor-panel-title">宽度（百分比 / 固定像素）</div>
          <div class="app-editor-slider-row">
            <input
              v-model="mediaWidthInput"
              class="app-editor-inspector__num app-editor-inspector__num--wide"
              inputmode="decimal"
              placeholder="宽"
              title="宽度数值"
              type="text"
              @change="commitMediaSize"
              @keydown.enter.prevent="commitMediaSize"
            />
            <div class="inline-flex rounded-md border border-border bg-background p-0.5">
              <button
                type="button"
                class="rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
                :class="mediaWidthUnit === '%' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
                title="按容器百分比"
                @click="setMediaWidthUnit('%')"
              >
                %
              </button>
              <button
                type="button"
                class="rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
                :class="mediaWidthUnit === 'px' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
                title="固定像素"
                @click="setMediaWidthUnit('px')"
              >
                px
              </button>
            </div>
          </div>
          <div class="app-editor-panel-title mt-2">快速预设</div>
          <div class="app-editor-presets">
            <button
              v-for="preset in sizePresets"
              :key="preset.value"
              type="button"
              class="app-editor-preset-btn"
              :class="{ 'is-active': String(mediaWidthInput) === String(preset.value) }"
              @click="applyPresetSize(preset.value)"
            >
              {{ preset.label }}
            </button>
          </div>
          <div v-if="mediaWidthUnit === '%'" class="app-editor-panel-title mt-2">拖动微调</div>
          <div v-if="mediaWidthUnit === '%'" class="app-editor-slider-row">
            <input
              v-model="sliderValue"
              class="app-editor-slider"
              max="100"
              min="5"
              step="1"
              title="拖动调整宽度"
              type="range"
              @mousedown.stop
              @change="onSliderChange"
            />
            <span class="app-editor-pct">{{ displayPercent }}%</span>
          </div>
          <div class="app-editor-panel-title mt-2">高度</div>
          <div class="app-editor-slider-row">
            <div class="inline-flex rounded-md border border-border bg-background p-0.5">
              <button
                type="button"
                class="rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
                :class="mediaHeightMode === 'auto' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
                title="高度自动（保持比例）"
                @click="setMediaHeightMode('auto')"
              >
                自动
              </button>
              <button
                type="button"
                class="rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
                :class="mediaHeightMode === 'px' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
                title="固定像素高度"
                @click="setMediaHeightMode('px')"
              >
                固定
              </button>
            </div>
            <input
              v-model="mediaHeightInput"
              class="app-editor-inspector__num app-editor-inspector__num--wide"
              :disabled="mediaHeightMode !== 'px'"
              inputmode="decimal"
              placeholder="高 px"
              title="高度像素值"
              type="text"
              @change="commitMediaSize"
              @keydown.enter.prevent="commitMediaSize"
            />
          </div>
        </div>

        <!-- 视频对齐面板 -->
        <div
          v-if="activePanel === 'video-align'"
          class="app-editor-panel"
          @mousedown.stop
        >
          <div class="app-editor-align-list">
            <button
              v-for="opt in ALIGN_OPTIONS"
              :key="opt.key"
              type="button"
              class="app-editor-align-item"
              :class="{
                'is-active':
                  activeAlign === opt.key ||
                  (!activeAlign && opt.key === 'center'),
              }"
              @click="setImageAlign(opt.key)"
            >
              <component :is="opt.icon" class="size-4" />
              <span>{{ opt.label }}</span>
            </button>
          </div>
        </div>

        <!-- 视频属性配置面板 -->
        <div
          v-if="activePanel === 'video-props'"
          class="app-editor-panel w-64 p-3 space-y-2.5"
          @mousedown.stop
        >
          <div class="text-xs font-semibold text-foreground">视频播放配置</div>
          <label class="flex items-center justify-between text-xs cursor-pointer text-muted-foreground hover:text-foreground">
            <span>显示原生控制条</span>
            <input
              type="checkbox"
              class="rounded border-border"
              :checked="currentVideoControls"
              @change="toggleCurrentVideoControls"
            />
          </label>
          <div class="space-y-1 pt-1 border-t border-border/60">
            <div class="text-[11px] text-muted-foreground">封面海报图 (poster):</div>
            <div class="flex items-center gap-1.5">
              <input
                v-model="currentVideoPosterInput"
                class="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:border-primary font-mono text-[11px]"
                placeholder="https://.../poster.jpg"
                type="text"
                @keydown.enter.prevent="saveCurrentVideoPoster"
              />
              <button
                class="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:opacity-90 shrink-0"
                type="button"
                @click="saveCurrentVideoPoster"
              >
                应用
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>

      <!-- 全局模式：未选中任何节点时的文档级调整 -->
      <div
        v-if="!selectedColumnsTarget && !selectedTarget"
        class="app-editor-floating__toolbar app-editor-global-toolbar"
      >
        <div class="app-editor-floating__header">
          <span class="app-editor-tag">一键排版</span>
          <span class="text-[10px] text-muted-foreground">未选中节点时显示</span>
        </div>

        <div class="app-editor-floating__actions">
          <button
            class="app-editor-btn app-editor-btn--pill"
            :disabled="!isEditable"
            title="全文设置为两端对齐（可撤销）"
            type="button"
            @click="justifyAllContent"
          >
            <span class="app-editor-btn-label">两端对齐</span>
          </button>
          <button
            class="app-editor-btn app-editor-btn--pill"
            :disabled="!isEditable"
            title="全文行高统一为 1.75（可撤销）"
            type="button"
            @click="unifyAllLineHeight"
          >
            <span class="app-editor-btn-label">行高 1.75</span>
          </button>
          <button
            class="app-editor-btn app-editor-btn--pill"
            :disabled="!isEditable"
            title="删除顶层多余空段落（至少保留一个块，可撤销）"
            type="button"
            @click="cleanEmptyParagraphsUi"
          >
            <span class="app-editor-btn-label">清除空段</span>
          </button>
        </div>
      </div>
    </div>

      <!-- 底部状态条与外链标注 -->
      <div
        ref="statusbarRef"
        class="app-editor-statusbar flex flex-wrap items-center justify-between border-t border-border bg-muted/20 px-4 py-1.5 text-[11px] text-muted-foreground select-none"
      >
        <div class="flex items-center gap-3">
          <span>字符数: {{ plainTextCount }}</span>
          <span class="text-border">|</span>

          <!-- 页面设置：始终在编辑器的最底部显示（只显示当前选中的宽度，其他点击弹出） -->
          <div ref="viewportDropdownRef" class="relative flex items-center gap-1.5">
            <span class="font-medium text-foreground/80">页面设置:</span>
            <button
              class="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted shadow-2xs transition-all cursor-pointer"
              :title="'当前编辑视口: ' + currentViewportOption.title + ' (点击展开选择其他宽度)'"
              type="button"
              @click.stop="isViewportMenuOpen = !isViewportMenuOpen"
            >
              <span>{{ currentViewportOption.icon }}</span>
              <span class="font-semibold">{{ currentViewportOption.label }}</span>
              <ChevronDown
                class="size-3 text-muted-foreground transition-transform duration-200"
                :class="{ 'rotate-180': isViewportMenuOpen }"
              />
            </button>

            <!-- 弹出菜单 (向上弹出，避免遮挡底部或超出边界) -->
            <div
              v-show="isViewportMenuOpen"
              class="absolute bottom-full left-12 mb-2 w-72 rounded-xl border border-border bg-popover p-2 shadow-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 select-none text-foreground"
              @click.stop
            >
              <div class="px-2 py-1 text-[11px] font-semibold text-muted-foreground border-b border-border/60 mb-1 flex items-center justify-between">
                <span>页面编辑视口</span>
                <span class="text-[10px] text-muted-foreground/80">仅影响编辑画布</span>
              </div>

              <!-- 桌面/标准档位 -->
              <div class="space-y-0.5">
                <button
                  v-for="opt in desktopViewportOptions"
                  :key="opt.value"
                  class="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer"
                  :class="editorCanvasWidth === opt.value ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted text-foreground'"
                  :title="opt.title"
                  type="button"
                  @click="setViewportWidth(opt.value)"
                >
                  <span class="flex items-center gap-2">
                    <span>{{ opt.icon }}</span>
                    <span>{{ opt.label }}</span>
                  </span>
                  <span v-if="opt.value === '1300px'" class="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded font-medium">默认</span>
                </button>
              </div>

              <!-- 小屏幕（统一移动端与公众号） -->
              <div class="mt-2 pt-1.5 border-t border-border/60">
                <div class="px-2 py-0.5 text-[10px] font-semibold text-muted-foreground flex items-center justify-between">
                  <span>📱 小屏幕 (≤768px / 纯内联排版)</span>
                  <span class="text-[9px] text-muted-foreground/75">单列堆叠/双列并排</span>
                </div>
                <div class="space-y-0.5 mt-1">
                  <button
                    v-for="opt in smallScreenViewportOptions"
                    :key="opt.value"
                    class="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer"
                    :class="editorCanvasWidth === opt.value ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted text-foreground'"
                    :title="opt.title"
                    type="button"
                    @click="setViewportWidth(opt.value)"
                  >
                    <span class="flex items-center gap-2">
                      <span>{{ opt.icon }}</span>
                      <span>{{ opt.label }}</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <span class="text-border">|</span>

          <!-- 复制样式表：常驻底部状态栏，随时可用 -->
          <button
            class="app-editor-btn app-editor-btn--pill app-editor-copy-styles-btn flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border border-border bg-background hover:bg-muted text-foreground transition-all cursor-pointer shadow-2xs"
            :class="{ 'is-active border-primary text-primary font-semibold ring-1 ring-primary/30': needsCustomStyles }"
            :title="needsCustomStyles ? '文档使用了多栏或全宽通栏排版，发布到自有站点建议复制输出样式定义（公众号等终端可忽略）' : '复制输出样式定义（包含多栏与全宽 web-article 样式表）'"
            type="button"
            @click="copyContentStyles"
          >
            <span
              v-if="needsCustomStyles"
              class="inline-block size-1.5 rounded-full bg-primary animate-pulse shrink-0"
            ></span>
            <Copy class="size-3" />
            <span class="app-editor-btn-label">复制样式表</span>
          </button>

          <span class="text-border">|</span>
          <!-- 底部外链资源标注 -->
          <div
            v-if="externalAssetsCount > 0"
            class="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium cursor-pointer hover:underline"
            @click="openExternalModal"
          >
            <span class="inline-block size-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span>外链资源: {{ externalAssetsCount }} 项</span>
            <span class="opacity-80">[查看与转存]</span>
          </div>
          <div v-else class="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>全站内资源 (安全)</span>
          </div>

          <!-- 当前光标所在排版块指示与快速跳出插行（已下线：Section 块体系移除，多栏/媒体统一走底部 Dock 工具条） -->
        </div>

        <div class="flex items-center gap-3">
          <span class="hidden sm:inline opacity-75">免检域名: cdn-edp.hsdxchina.com</span>
          <button
            class="text-primary hover:underline"
            type="button"
            @click="openExternalModal"
          >
            管理外链
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">

      <!-- 图片拖拽调宽手柄（仅在选中图片时显示于右下角） -->
      <div
        v-if="handleVisible"
        class="app-editor-resize-handle"
        :style="{
          left: `${handleCoords.left}px`,
          top: `${handleCoords.top}px`,
        }"
        contenteditable="false"
        title="拖拽调整宽度"
        @mousedown.prevent="onHandleMouseDown"
      ></div>

      <!-- 盒模型 overlay：选中元素的 margin / padding / content 三色分区 -->
      <div
        v-if="boxOverlay.visible && isHoveringSelected"
        class="app-editor-boxoverlay"
        :style="{ clipPath: boxOverlay.clip }"
        contenteditable="false"
      >
        <div
          class="app-editor-boxoverlay__margin"
          :style="boxLayerStyle(boxOverlay.margin, boxOverlay.marginRing, 'border')"
        ></div>
        <div
          class="app-editor-boxoverlay__padding"
          :style="boxLayerStyle(boxOverlay.padding, boxOverlay.paddingRing, 'clip')"
        ></div>
        <div
          class="app-editor-boxoverlay__content"
          :style="boxLayerStyle(boxOverlay.content)"
        ></div>
      </div>

      <!-- 全局预览模态弹窗 -->
      <div
        v-if="isPreviewModalOpen"
        class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4"
        @click.self="closePreviewModal"
      >
        <div
          class="flex h-full max-h-[92vh] w-full max-w-5xl flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        >
          <!-- 预览顶栏：设备切换 -->
          <div
            class="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-foreground">文档排版预览</span>
              <span class="text-xs text-muted-foreground hidden md:inline">（多端视口仿真）</span>
            </div>

            <!-- 设备视口切换按钮组 -->
            <div class="flex items-center gap-1 rounded-lg border border-border/80 bg-background/80 p-0.5 text-xs shadow-xs">
              <button
                class="flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors"
                :class="previewDevice === 'mobile' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
                type="button"
                title="手机端真实视口 (375px)"
                @click="previewDevice = 'mobile'"
              >
                <span>📱 手机 (375px)</span>
              </button>
              <button
                class="flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors"
                :class="previewDevice === 'wechat' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
                type="button"
                title="微信公众号官方标准宽度 (677px)"
                @click="previewDevice = 'wechat'"
              >
                <span>📰 公众号 (677px)</span>
              </button>
            <button
              class="flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors"
              :class="previewDevice === 'full' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
              type="button"
              title="PC/大屏 100% 自适应流式宽度"
              @click="previewDevice = 'full'"
            >
              <span>💻 宽屏大屏 (100%)</span>
            </button>
            </div>

            <div class="flex items-center gap-1">
              <button
                class="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="打印当前文档（清样）"
                type="button"
                @click="printDocument"
              >
                打印
              </button>
              <button
                class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="关闭预览"
                type="button"
                @click="closePreviewModal"
              >
              <svg
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <line x1="18" x2="6" y1="6" y2="18" />
                <line x1="6" x2="18" y1="6" y2="18" />
              </svg>
            </button>
          </div>
          </div>

          <!-- 预览内容展示区 -->
          <div class="flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6 flex justify-center items-start">
            <div
              class="w-full transition-all duration-300"
              :class="{
                'max-w-[375px] bg-card rounded-[2.5rem] shadow-2xl border-[6px] border-slate-800 p-5 min-h-[667px] preview-device--mobile': previewDevice === 'mobile',
                'max-w-[677px] bg-card rounded-xl shadow-xl border border-border p-6 sm:p-8 min-h-[500px] preview-device--wechat': previewDevice === 'wechat',
                'max-w-full bg-card rounded-xl border border-border p-6 min-h-[500px] preview-device--full': previewDevice === 'full',
              }"
            >
              <!-- 手机顶栏装饰 -->
              <div v-if="previewDevice === 'mobile'" class="flex justify-between items-center text-[10px] text-muted-foreground pb-3 mb-3 border-b border-border/50 select-none">
                <span>9:41</span>
                <span class="size-2 rounded-full bg-slate-400"></span>
                <span>100%</span>
              </div>
              <div
                class="vben-tiptap-content"
                v-html="content"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 打印清样区：仅打印时渲染，平时隐藏（样式见 printDocument 注入 head） -->
    <div
      v-if="isPrinting"
      class="app-editor-print"
    >
      <div v-html="content"></div>
    </div>



    <!-- 换图用媒体库弹窗 -->
    <MediaLibraryModal
      v-if="hasMediaLibrary"
      v-model:visible="replaceImageModalOpen"
      initial-type="image"
      :fetch-media="props.fetchMedia !== undefined ? props.fetchMedia : defaultFetchMedia"
      :upload-file="uploadImage"
      :thumbnail-process="props.thumbnailProcess"
      @select="onReplaceImageSelect"
    />
    <!-- Slash / 空行菜单用插入模式媒体库弹窗 -->
    <MediaLibraryModal
      v-if="hasMediaLibrary"
      v-model:visible="insertMediaModalOpen"
      :initial-type="insertMediaType"
      :fetch-media="props.fetchMedia !== undefined ? props.fetchMedia : defaultFetchMedia"
      :upload-file="uploadGeneralFile || uploadImage"
      :thumbnail-process="insertMediaType === 'video' ? false : props.thumbnailProcess"
      @select="onInsertMediaSelect"
    />
    <!-- 换视频用媒体库弹窗 -->
    <MediaLibraryModal
      v-if="hasMediaLibrary"
      v-model:visible="replaceVideoModalOpen"
      initial-type="video"
      :fetch-media="props.fetchMedia !== undefined ? props.fetchMedia : defaultFetchMedia"
      :upload-file="uploadGeneralFile || uploadImage"
      :thumbnail-process="false"
      @select="onReplaceVideoSelect"
    />
    <!-- 外链资源检测与转存弹窗 -->
    <ExternalAssetsModal
      v-model:visible="isExternalModalOpen"
      :assets="externalAssets"
      :internal-domains="customInternalDomains"
      :upload-file="uploadImage || uploadGeneralFile"
      @replace="onReplaceExternalUrls"
      @load-content="onLoadSourceContent"
      @update:internal-domains="onUpdateInternalDomains"
    />
  </div>
</template>

<!-- 非 scoped：编辑器内容渲染在 .vben-tiptap-content 内，需要全局样式补齐表格、图片、视频、高亮框等 -->
<style>
/* 全屏沉浸模式 */
.app-editor-tiptap.app-editor--fullscreen {
  position: fixed !important;
  inset: 0 !important;
  z-index: 9999 !important;
  margin: 0 !important;
  padding: 12px !important;
  width: 100vw !important;
  height: 100vh !important;
  background-color: hsl(var(--background)) !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

.app-editor-tiptap.app-editor--fullscreen .app-editor-wrapper {
  flex: 1 1 0% !important;
  height: 100% !important;
  max-height: 100% !important;
  min-height: 0 !important;
  border-radius: 8px !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

.app-editor-tiptap.app-editor--fullscreen .app-editor-toolbar {
  flex-shrink: 0 !important;
  z-index: 20 !important;
}

.app-editor-tiptap.app-editor--fullscreen .app-editor-split-body {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: 100% !important;
  display: flex !important;
  overflow: hidden !important;
}

/* 全屏单栏模式下：编辑器左栏撑满 split-body */
.app-editor-tiptap.app-editor--fullscreen:not(.app-editor--split) .app-editor-split__left {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: 100% !important;
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  position: relative !important;
}

.app-editor-tiptap.app-editor--fullscreen .app-editor-split__left > .vben-tiptap {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  border: none !important;
  border-radius: 0 !important;
}

/* EditorContent 在根与 ProseMirror 之间包了一层无 class 的 div:
 * display:contents 穿透它，让滚动区成为 flex 直接子项 */
.app-editor-tiptap.app-editor--fullscreen .app-editor-split__left > .vben-tiptap > div {
  display: contents !important;
}

.app-editor-tiptap.app-editor--fullscreen .app-editor-split__left .vben-tiptap-content {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  max-height: 100% !important;
  height: 100% !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding-bottom: 60px !important;
}

/* 全屏双栏模式 */
.app-editor-tiptap.app-editor--fullscreen.app-editor--split .app-editor-split-body.is-split {
  flex-direction: row !important;
}

.app-editor-tiptap.app-editor--fullscreen.app-editor--split .app-editor-split__left {
  height: 100% !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

.app-editor-tiptap.app-editor--fullscreen.app-editor--split .app-editor-split__right {
  height: 100% !important;
  min-height: 0 !important;
  flex: 1 1 0% !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

/* 源码模式在全屏下的滚动容器约束 */
.app-editor-tiptap.app-editor--fullscreen .app-editor-source {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: 100% !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}

.app-editor-tiptap.app-editor--fullscreen .app-editor-source-host,
.app-editor-tiptap.app-editor--fullscreen .app-editor-source-textarea {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  height: 100% !important;
  overflow-y: auto !important;
}

/* 底部固定工具条与状态栏：固定于编辑器底部，不跟随内容滚动，不遮挡正文 */
.app-editor-tiptap.app-editor--fullscreen .app-editor-dock {
  flex-shrink: 0 !important;
  max-height: 240px !important;
  overflow-y: auto !important;
  background-color: hsl(var(--card)) !important;
  border-top: 1px solid hsl(var(--border)) !important;
  position: relative !important;
  z-index: 10 !important;
}

.app-editor-tiptap.app-editor--fullscreen .app-editor-statusbar {
  flex-shrink: 0 !important;
  background-color: hsl(var(--card)) !important;
  border-top: 1px solid hsl(var(--border)) !important;
  position: relative !important;
  z-index: 10 !important;
}

/* 双栏模式：全屏下左编辑右代码并排（单栏时 split-body 为普通纵向容器） */
.app-editor-split-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.app-editor-tiptap.app-editor--split .app-editor-split-body.is-split {
  flex-direction: row;
  flex: 1 !important;
  min-height: 0 !important;
  overflow: hidden;
}

.app-editor-tiptap.app-editor--split .app-editor-split__left,
.app-editor-tiptap.app-editor--split .app-editor-split__right {
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden auto !important;
}

/* 左栏：宽度由拖拽比例内联控制（默认 50%），280px 兜底不被压扁 */
.app-editor-tiptap.app-editor--split .app-editor-split__left {
  flex: 0 0 auto !important;
  min-width: 280px !important;
  max-width: calc(100% - 240px) !important;
}

.app-editor-tiptap.app-editor--split .app-editor-split__right {
  flex: 1 1 0% !important;
  min-width: 240px !important;
  background-color: hsl(var(--muted) / 20%) !important;
}

/* 双栏拖拽条：6px 命中区 + 中线，hover/拖拽时高亮 */
.app-editor-split-divider {
  flex: 0 0 6px !important;
  position: relative;
  cursor: col-resize;
  touch-action: none;
  background-color: transparent;
  user-select: none;
}

.app-editor-split-divider > span {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 2px;
  right: 2px;
  border-radius: 3px;
  background-color: hsl(var(--border));
  transition: background-color 0.15s;
  pointer-events: none;
}

.app-editor-split-divider:hover > span,
.app-editor-split-divider:active > span {
  background-color: hsl(var(--primary) / 60%);
}

/* 拖拽中：全局 col-resize + 禁止选中，避免拖出文字 */
.app-editor-tiptap.app-editor--split-drag,
.app-editor-tiptap.app-editor--split-drag * {
  cursor: col-resize !important;
  user-select: none !important;
}

.app-editor-tiptap.app-editor--split-drag .app-editor-split-divider > span {
  background-color: hsl(var(--primary));
}

/* AI 入口：悬浮于编辑区底部中央 */
.app-editor-split__left {
  position: relative !important;
}

.app-editor-ai-float {
  position: absolute !important;
  bottom: 24px !important;
  left: 0 !important;
  right: 0 !important;
  width: min(680px, 92%) !important;
  margin: 0 auto !important;
  z-index: 100 !important;
  display: flex !important;
  justify-content: center !important;
  pointer-events: none !important;
}

.app-editor-ai-float > * {
  pointer-events: auto !important;
}

/* AI 比对浮动卡片 */
.app-editor-ai-pillwrap {
  position: fixed !important;
  z-index: 60 !important;
  filter: drop-shadow(0 12px 30px rgba(0, 0, 0, 0.18));
}

.app-editor-ai-pill-card {
  border: 1px solid hsl(var(--border) / 80%);
  background-color: hsl(var(--card) / 95%);
  backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px hsl(var(--primary) / 10%);
}

/* AI 比对高亮：待比对淡绿底虚线框，当前处强描边与发光动画 */
.vben-tiptap-content .app-editor-ai-changed {
  background-color: rgba(16, 185, 129, 0.08) !important;
  outline: 1.5px dashed rgba(16, 185, 129, 0.6) !important;
  outline-offset: 1px !important;
  border-radius: 6px !important;
  transition: all 0.2s ease;
}

.vben-tiptap-content .app-editor-ai-current {
  background-color: rgba(16, 185, 129, 0.18) !important;
  outline: 2px solid #10b981 !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.2) !important;
  border-radius: 6px !important;
  animation: app-editor-ai-pulse 2s infinite ease-in-out;
}

@keyframes app-editor-ai-pulse {
  0%, 100% {
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.18);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.32);
  }
}

/* 双栏下 CodeMirror 宿主占满右栏（min-height 改由右栏滚动承载） */
.app-editor-tiptap.app-editor--split .app-editor-split__right .app-editor-source-host,
.app-editor-tiptap.app-editor--split .app-editor-split__right .app-editor-source-textarea {
  min-height: 240px !important;
}

/* 窄屏回落：双栏改上下堆叠，避免左右挤压不可用 */
@media (max-width: 767px) {
  .app-editor-tiptap.app-editor--split .app-editor-split-body.is-split {
    flex-direction: column;
    overflow-y: auto;
  }
  .app-editor-tiptap.app-editor--split .app-editor-split__left {
    width: auto !important;
    flex: none !important;
    min-width: 0 !important;
    border-bottom: 1px solid hsl(var(--border)) !important;
  }
  .app-editor-split-divider {
    display: none !important;
  }
}

/* 顶栏与编辑器区域一体化接缝消除 */
.app-editor-wrapper .vben-tiptap {
  border: none !important;
  border-radius: 0 !important;
}

.vben-tiptap-content table {
  width: 100%;
  margin: 0.75rem 0;
  border-collapse: collapse;
  table-layout: fixed;
  overflow: hidden;
}

.vben-tiptap-content table td,
.vben-tiptap-content table th {
  position: relative;
  min-width: 1em;
  padding: 6px 10px;
  vertical-align: top;
  border: 1px solid hsl(var(--border));
}

.vben-tiptap-content table th {
  font-weight: 600;
  text-align: left;
  background-color: hsl(var(--muted));
}

.vben-tiptap-content table .selectedCell::after {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  content: '';
  background: hsl(var(--primary) / 15%);
}

.vben-tiptap-content table .column-resize-handle {
  position: absolute;
  top: 0;
  right: -2px;
  bottom: -2px;
  width: 4px;
  pointer-events: none;
  background-color: hsl(var(--primary));
}

.vben-tiptap-content .tableWrapper {
  margin: 0.75rem 0;
  overflow-x: auto;
}

.vben-tiptap-content p {
  margin: 0.25rem 0;
}

/* 解除 tiptap 默认 max-width: min(100%, 640px) 限制，允许全宽图片与视频占满编辑器容器
 * 双类兼容：edp-editor__image 为现行类；vben-tiptap__image 为存量内容旧类 */
.vben-tiptap-content img,
.vben-tiptap-content .edp-editor__image,
.vben-tiptap-content .vben-tiptap__image {
  max-width: 100%;
}

.vben-tiptap-content video {
  max-width: 100%;
  margin: 0.75rem auto;
  border-radius: 8px;
}

/* 选中图片高亮外框（内收描边：满宽图片也不被内容区裁剪） */
.vben-tiptap-content img.app-editor-image--selected {
  outline: 2px solid hsl(var(--primary)) !important;
  outline-offset: -2px !important;
}

/* 选中视频高亮外框（内收描边，跟随视频自身圆角） */
.vben-tiptap-content video.app-editor-video--selected {
  outline: 2px solid hsl(var(--primary)) !important;
  outline-offset: -2px !important;
}

/* 编辑模式下视频悬停指示 */
.app-editor-wrapper .vben-tiptap-content video {
  cursor: pointer;
}

/* 画布视口模式模拟（针对编辑器内容区） */
.app-editor-wrapper:not(.viewport--auto):not(.viewport--677px):not(.viewport--375px) .vben-tiptap {
  background-color: hsl(var(--muted) / 0.15);
}

.app-editor-wrapper.viewport--1300px .vben-tiptap-content {
  --web-article-inset: 50px;
  max-width: 1300px !important;
  width: 100%;
  margin-left: auto !important;
  margin-right: auto !important;
  background-color: hsl(var(--card));
  box-shadow: 0 4px 24px -2px rgba(0, 0, 0, 0.08), 0 0 0 1px hsl(var(--border) / 60%);
  border-radius: 6px;
  padding-block: 20px;
}

.app-editor-wrapper.viewport--960px .vben-tiptap-content {
  --web-article-inset: 24px;
  max-width: 960px !important;
  width: 100%;
  margin-left: auto !important;
  margin-right: auto !important;
  background-color: hsl(var(--card));
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.06), 0 0 0 1px hsl(var(--border) / 60%);
  border-radius: 6px;
  padding-block: 20px;
}

.app-editor-wrapper.viewport--677px .vben-tiptap-content {
  max-width: 677px !important;
  margin-left: auto !important;
  margin-right: auto !important;
  background-color: hsl(var(--card));
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  border: 1px solid hsl(var(--border) / 80%);
  border-radius: 8px;
  padding: 24px 20px;
  margin-top: 8px;
  margin-bottom: 24px;
}

.app-editor-wrapper.viewport--375px .vben-tiptap-content {
  max-width: 375px !important;
  margin-left: auto !important;
  margin-right: auto !important;
  background-color: hsl(var(--card));
  box-shadow: 0 8px 30px -4px rgba(0, 0, 0, 0.12), 0 4px 10px -2px rgba(0, 0, 0, 0.06);
  border: 2px solid hsl(var(--border));
  border-radius: 20px;
  padding: 20px 14px;
  margin-top: 8px;
  margin-bottom: 24px;
}

/* ---------- 正文版式网格（web-article / web-bleed） ----------
 * 全局富文本正文版式：容器全宽，三列网格 [gutter] [内容列] [gutter]。
 * 所有直接子节点默认落内容列——宽度与全局边距由网格模板唯一决定；
 * 仅打上 .web-bleed 标记的直接子块跨满整行（全宽通栏）。
 * 在公众号与手机小屏视口下，不应用 1200px 网格，保持纯内联流式自适应。
 */
.web-article,
.app-editor-wrapper:not(.viewport--677px):not(.viewport--375px) .vben-tiptap-content,
.preview-device--full .vben-tiptap-content {
  --web-article-width: 1200px;
  --web-article-gutter: 24px;
  --web-article-inset: max(var(--web-article-gutter, 24px), calc((100% - var(--web-article-width, 1200px)) / 2));
  --web-article-template:
    [full-start] minmax(var(--web-article-gutter), 1fr)
    [content-start] minmax(0, var(--web-article-width)) [content-end]
    minmax(var(--web-article-gutter), 1fr) [full-end];
  display: grid !important;
  grid-template-columns: var(--web-article-template);
  width: 100%;
}

.web-article > *,
.app-editor-wrapper:not(.viewport--677px):not(.viewport--375px) .vben-tiptap-content > *,
.preview-device--full .vben-tiptap-content > * {
  grid-column: content;
  min-width: 0;
}

/* 全宽通栏块：跨满整行（直接挂 web-bleed，或段落包含仅一个 web-bleed 媒体） */
.web-article > .web-bleed,
.web-article > :has(> .web-bleed:only-child),
.app-editor-wrapper:not(.viewport--677px):not(.viewport--375px) .vben-tiptap-content > .web-bleed,
.app-editor-wrapper:not(.viewport--677px):not(.viewport--375px) .vben-tiptap-content > :has(> .web-bleed:only-child),
.preview-device--full .vben-tiptap-content > .web-bleed,
.preview-device--full .vben-tiptap-content > :has(> .web-bleed:only-child) {
  grid-column: full;
}

/* 仅 section / div 等容器类全宽块内部复用同一模板对齐内容列（普通文本段落等直接撑满整行） */
.web-article > section.web-bleed,
.web-article > div.web-bleed:not(.cms-columns),
.app-editor-wrapper:not(.viewport--677px):not(.viewport--375px) .vben-tiptap-content > section.web-bleed,
.app-editor-wrapper:not(.viewport--677px):not(.viewport--375px) .vben-tiptap-content > div.web-bleed:not(.cms-columns),
.preview-device--full .vben-tiptap-content > section.web-bleed,
.preview-device--full .vben-tiptap-content > div.web-bleed:not(.cms-columns) {
  display: grid;
  grid-template-columns: var(--web-article-template);
}

.web-article > section.web-bleed > *,
.web-article > div.web-bleed:not(.cms-columns) > *,
.app-editor-wrapper:not(.viewport--677px):not(.viewport--375px) .vben-tiptap-content > section.web-bleed > *,
.app-editor-wrapper:not(.viewport--677px):not(.viewport--375px) .vben-tiptap-content > div.web-bleed:not(.cms-columns) > *,
.preview-device--full .vben-tiptap-content > section.web-bleed > *,
.preview-device--full .vben-tiptap-content > div.web-bleed:not(.cms-columns) > * {
  grid-column: content;
  min-width: 0;
}

/* 全宽图片与全宽视频：在全宽块内自动铺满整宽 */
.app-editor-wrapper .vben-tiptap-content img.web-bleed,
.app-editor-wrapper .vben-tiptap-content video.web-bleed,
.web-article img.web-bleed,
.web-article video.web-bleed {
  width: 100% !important;
  max-width: 100% !important;
  display: block;
}

/* 编辑器内对全宽通栏块的视觉标识：边界虚线导引 + 常驻顶角标签 */
.app-editor-wrapper .vben-tiptap-content > .web-bleed,
.app-editor-wrapper .vben-tiptap-content > :has(> .web-bleed:only-child) {
  position: relative;
  outline: 1.5px dashed hsl(var(--primary) / 45%);
  outline-offset: -1px;
  border-radius: 6px;
  transition: outline-color 0.2s ease, box-shadow 0.2s ease;
}

.app-editor-wrapper .vben-tiptap-content > .web-bleed:hover,
.app-editor-wrapper .vben-tiptap-content > :has(> .web-bleed:only-child):hover {
  outline-color: hsl(var(--primary) / 85%);
  box-shadow: 0 0 0 3px hsl(var(--primary) / 15%);
}

.app-editor-wrapper .vben-tiptap-content > .web-bleed::before,
.app-editor-wrapper .vben-tiptap-content > :has(> .web-bleed:only-child)::before {
  content: "↔ 全宽通栏 (web-bleed)";
  position: absolute;
  top: -10px;
  right: 12px;
  font-size: 11px;
  font-weight: 500;
  font-family: sans-serif;
  padding: 1px 8px;
  border-radius: 9999px;
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  pointer-events: none;
  opacity: 0.75;
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 25;
}

.app-editor-wrapper .vben-tiptap-content > .web-bleed:hover::before,
.app-editor-wrapper .vben-tiptap-content > :has(> .web-bleed:only-child):hover::before {
  opacity: 1;
  transform: translateY(-1px);
}

.app-editor-wrapper .vben-tiptap-content > .cms-columns.web-bleed.cms-columns--inset-start::before,
.app-editor-wrapper .vben-tiptap-content .cms-columns.web-bleed.cms-columns--inset-start::before {
  content: "↔ 全宽通栏 (首列已内收)";
}

.app-editor-wrapper .vben-tiptap-content > .cms-columns.web-bleed.cms-columns--inset-end::before,
.app-editor-wrapper .vben-tiptap-content .cms-columns.web-bleed.cms-columns--inset-end::before {
  content: "↔ 全宽通栏 (末列已内收)";
}

.app-editor-wrapper .vben-tiptap-content > .cms-columns.web-bleed.cms-columns--inset-start.cms-columns--inset-end::before,
.app-editor-wrapper .vben-tiptap-content .cms-columns.web-bleed.cms-columns--inset-start.cms-columns--inset-end::before {
  content: "↔ 全宽通栏 (首末列已内收)";
}

.app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .cms-columns.web-bleed.cms-columns--inset-start > .cms-column:first-child {
  box-shadow: inset 2px 0 0 hsl(var(--primary) / 50%);
}

.app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .cms-columns.web-bleed.cms-columns--inset-end > .cms-column:last-child {
  box-shadow: inset -2px 0 0 hsl(var(--primary) / 50%);
}

/* 移动端与大屏排版自适应规范 */
.vben-tiptap-content {
  box-sizing: border-box;
  overflow-wrap: break-word;
  word-break: break-word;
}

.vben-tiptap-content section {
  max-width: 100% !important;
  box-sizing: border-box !important;
}

.vben-tiptap-content svg {
  max-width: 100%;
  box-sizing: border-box;
}

/* 图片右下角调宽拖动手柄 */
.app-editor-resize-handle {
  position: fixed;
  z-index: 9998;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
  background: hsl(var(--primary));
  border: 2px solid #ffffff;
  border-radius: 3px;
  box-shadow: 0 1px 4px rgb(0 0 0 / 35%);
  user-select: none;
}

/* 盒模型 overlay（devtools 配色：margin 橙 / padding 绿 / content 蓝） */
.app-editor-boxoverlay {
  position: fixed;
  inset: 0;
  z-index: 10005;
  pointer-events: none;
  user-select: none;
}

.app-editor-boxoverlay__margin,
.app-editor-boxoverlay__padding,
.app-editor-boxoverlay__content {
  position: absolute;
}

.app-editor-boxoverlay__margin {
  /* 环带用 border 绘制（宽度由 boxLayerStyle 内联注入），不整面填充 */
  border: 0 solid rgb(246 178 107 / 65%);
}

.app-editor-boxoverlay__padding {
  background: rgb(147 196 125 / 65%);
}

.app-editor-boxoverlay__content {
  background: rgb(111 168 220 / 35%);
}

/* ---------------------------------------------------------------------------
 * 新增块级能力样式（待办/折叠/查找高亮/快捷菜单/站内Mention/打印）
 * --------------------------------------------------------------------------- */

/* 待办清单 */
.vben-tiptap-content ul[data-type='taskList'] {
  list-style: none;
  padding-left: 4px;
}

.vben-tiptap-content ul[data-type='taskList'] li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.vben-tiptap-content ul[data-type='taskList'] li > label {
  display: flex;
  padding-top: 4px;
  user-select: none;
}

.vben-tiptap-content ul[data-type='taskList'] li > div {
  flex: 1;
  min-width: 0;
}

/* 折叠块 */
.vben-tiptap-content details {
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 8px 12px;
  margin: 12px 0;
  background: hsl(var(--muted) / 30%);
}

.vben-tiptap-content summary {
  cursor: pointer;
  font-weight: 600;
  outline: none;
}

/* 查找命中高亮（视图 decorations，不进输出） */
.vben-tiptap-content .app-editor-find-match {
  background: hsl(var(--primary) / 25%);
  border-radius: 2px;
}

.vben-tiptap-content .app-editor-find-current {
  background: hsl(var(--primary) / 55%);
  color: #ffffff;
  border-radius: 2px;
}

/* 站内Mention 内链（编辑态） */
.vben-tiptap-content a.edp-mention {
  color: hsl(var(--primary));
  text-decoration: none;
  border-bottom: 1px dashed hsl(var(--primary) / 60%);
  padding: 0 2px;
  border-radius: 4px;
  background: hsl(var(--primary) / 8%);
}

/* Bubble / Floating 快捷菜单 */
.app-editor-bubble {
  display: flex;
  gap: 2px;
  align-items: center;
  padding: 4px 6px;
  background: hsl(var(--popover));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 16%);
}

/* 打印清样区（平时隐藏，打印时独占） */
.app-editor-print {
  display: none;
}

@media print {
  body > * {
    visibility: hidden;
  }

  .app-editor-print,
  .app-editor-print * {
    visibility: visible;
  }

  .app-editor-print {
    position: absolute;
    inset: 0;
    display: block;
    padding: 24px;
  }
}

/* ---------------------------------------------------------------------------
 * CMS 多栏布局（Columns）标准与交互样式规范
 *
 * 输出契约（与 columns.js / content-styles.js 单一来源，勿三处漂移）：
 * - 内联基线 = 「一排 x 个」：容器不带 display，列宽/浮动/对侧内衬距/间距全内联
 *   （--row1 块流堆叠 / --row2 浮动两列），无 CSS 环境（公众号图文）原样保真；
 * - class 适配：--row1/--row2 只在宽屏把基线改为 N 栏一排（!important 清掉内联
 *   浮动/宽度/内衬距；flex 权重由列内联 flex 承载，间隙读 --cms-columns-gap）；
 * - 旧版内容（--stack/--keep + 内联 flex）：见兼容段，行为不变。
 * --------------------------------------------------------------------------- */

/* 旧版内容兼容：内联 flex 基线 + --stack/--keep 标记 */
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

/* 编辑器模式下多栏边框辅助指示与拖拽手柄 */
.app-editor-wrapper .cms-columns {
  position: relative;
  border-radius: 6px;
  padding: 4px;
}

.app-editor-wrapper .cms-column {
  position: relative;
  outline: 1px dashed hsl(var(--border) / 75%);
  outline-offset: -1px;
  border-radius: 4px;
  padding: 8px 10px;
  min-height: 48px;
  transition: outline-color 0.15s ease;
}

.app-editor-wrapper .cms-column:hover {
  outline-color: hsl(var(--primary) / 60%);
}

.app-editor-wrapper .cms-column:focus-within {
  outline-color: hsl(var(--primary));
  outline-style: solid;
}

/* 列间拖拽手柄感应区：悬浮显示吸附竖线，光标为 col-resize */
.app-editor-wrapper .cms-column:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 0;
  right: -9px;
  width: 18px;
  height: 100%;
  cursor: col-resize;
  z-index: 20;
  transition: background-color 0.15s ease;
}

.app-editor-wrapper .cms-column:not(:last-child):hover::after {
  background-color: hsl(var(--primary) / 25%);
  border-left: 1px solid hsl(var(--primary));
}

/* 编辑器多栏选中指示：内收描边（满宽不被内容区裁剪）+ 圆角 + 淡底 */
.app-editor-wrapper .cms-columns.app-editor-columns--selected {
  outline: 2px solid hsl(var(--primary) / 85%);
  outline-offset: -2px;
  background-color: hsl(var(--primary) / 5%);
  border-radius: 10px;
}

/* 新版多栏（--row1/--row2）：仅在桌面/宽屏自适应模式下将基线适配为 N 栏一排。
 * 公众号视口 (677px) 与 手机视口 (375px) 严格还原真实设备内联基线：
 * - perRow=1：垂直堆叠（一排 1 个，宽度 100%）
 * - perRow=2：浮动并排（一排 2 个，宽度 50% 或按比例浮动）
 * 不应用桌面端 flex 强制并排，保持极致兼容与所见即所得。 */
@media (min-width: 769px) {
  .app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .cms-columns--row1,
  .app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .cms-columns--row2 {
    display: flex;
    flex-direction: row;
    gap: var(--cms-columns-gap, 16px);
  }

  .app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .cms-columns--row1 > .cms-column,
  .app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .cms-columns--row2 > .cms-column {
    float: none !important;
    width: auto !important;
    margin: 0 !important;
    padding: 8px 10px !important;
  }

  /* 全宽多栏首/末列内收：仅 .web-bleed 全宽块有意义。
   * 直接作用于多栏容器自身 padding，外边距取「站点 gutter 与内容列留白」的较大值，
   * 确保首列左缘与末列右缘与正文未全宽内容列像素级精确对齐，另一侧继续出血。 */
  .app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .cms-columns.web-bleed.cms-columns--inset-start,
  .app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .vben-tiptap-content .cms-columns.web-bleed.cms-columns--inset-start {
    padding-left: var(--web-article-inset, max(var(--web-article-gutter, 24px), calc((100% - var(--web-article-width, 1200px)) / 2))) !important;
  }

  .app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .cms-columns.web-bleed.cms-columns--inset-end,
  .app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .vben-tiptap-content .cms-columns.web-bleed.cms-columns--inset-end {
    padding-right: var(--web-article-inset, max(var(--web-article-gutter, 24px), calc((100% - var(--web-article-width, 1200px)) / 2))) !important;
  }

  .app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .cms-columns.web-bleed.cms-columns--inset-start > .cms-column:first-child,
  .app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .vben-tiptap-content .cms-columns.web-bleed.cms-columns--inset-start > .cms-column:first-child {
    margin-left: 0 !important;
  }

  .app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .cms-columns.web-bleed.cms-columns--inset-end > .cms-column:last-child,
  .app-editor-wrapper:not(.viewport--375px):not(.viewport--677px) .vben-tiptap-content .cms-columns.web-bleed.cms-columns--inset-end > .cms-column:last-child {
    margin-right: 0 !important;
  }
}

/* 微信公众号视口 (677px) 与 手机视口 (375px) 仿真专用内联渲染增强 */
.app-editor-wrapper.viewport--677px .cms-columns,
.app-editor-wrapper.viewport--375px .cms-columns {
  display: block;
}

.app-editor-wrapper.viewport--677px .cms-columns::after,
.app-editor-wrapper.viewport--375px .cms-columns::after {
  content: "";
  display: table;
  clear: both;
}

.app-editor-wrapper.viewport--677px .cms-columns > .cms-column,
.app-editor-wrapper.viewport--375px .cms-columns > .cms-column {
  padding-top: 8px;
  padding-bottom: 8px;
}

/* 预览弹窗中的设备仿真：宽屏模式应用桌面 flex 展开，公众号与手机模式保留纯净内联排版 */
.preview-device--full .cms-columns--row1,
.preview-device--full .cms-columns--row2 {
  display: flex;
  flex-direction: row;
  gap: var(--cms-columns-gap, 16px);
}

.preview-device--full .cms-columns--row1 > .cms-column,
.preview-device--full .cms-columns--row2 > .cms-column {
  float: none !important;
  width: auto !important;
  margin: 0 !important;
  padding: 0 !important;
}

/* 预览弹窗全宽设备：首/末列内收同样适用（同全屏画布规则） */
.preview-device--full .cms-columns.web-bleed.cms-columns--inset-start,
.preview-device--full .vben-tiptap-content .cms-columns.web-bleed.cms-columns--inset-start {
  padding-left: var(--web-article-inset, max(var(--web-article-gutter, 24px), calc((100% - var(--web-article-width, 1200px)) / 2))) !important;
}

.preview-device--full .cms-columns.web-bleed.cms-columns--inset-end,
.preview-device--full .vben-tiptap-content .cms-columns.web-bleed.cms-columns--inset-end {
  padding-right: var(--web-article-inset, max(var(--web-article-gutter, 24px), calc((100% - var(--web-article-width, 1200px)) / 2))) !important;
}

.preview-device--full .cms-columns.web-bleed.cms-columns--inset-start > .cms-column:first-child,
.preview-device--full .vben-tiptap-content .cms-columns.web-bleed.cms-columns--inset-start > .cms-column:first-child {
  margin-left: 0 !important;
}

.preview-device--full .cms-columns.web-bleed.cms-columns--inset-end > .cms-column:last-child,
.preview-device--full .vben-tiptap-content .cms-columns.web-bleed.cms-columns--inset-end > .cms-column:last-child {
  margin-right: 0 !important;
}

/* 多栏各列等高铺满模式（cms-columns--equal-height）：以最高栏为基准，各栏内容自动铺满全高 */
.app-editor-wrapper .cms-columns.cms-columns--equal-height,
.preview-device--full .cms-columns.cms-columns--equal-height,
.cms-columns.cms-columns--equal-height {
  align-items: stretch !important;
}

.app-editor-wrapper .cms-columns.cms-columns--equal-height > .cms-column,
.preview-device--full .cms-columns.cms-columns--equal-height > .cms-column,
.cms-columns.cms-columns--equal-height > .cms-column {
  display: flex !important;
  flex-direction: column !important;
  height: auto !important;
}

.app-editor-wrapper .cms-columns.cms-columns--equal-height > .cms-column > :only-child,
.preview-device--full .cms-columns.cms-columns--equal-height > .cms-column > :only-child,
.cms-columns.cms-columns--equal-height > .cms-column > :only-child {
  flex: 1 1 auto !important;
  min-height: 100% !important;
  box-sizing: border-box !important;
}

.app-editor-wrapper .cms-columns.cms-columns--equal-height > .cms-column > section,
.app-editor-wrapper .cms-columns.cms-columns--equal-height > .cms-column > div:not(.app-editor-drop-cursor),
.cms-columns.cms-columns--equal-height > .cms-column > section,
.cms-columns.cms-columns--equal-height > .cms-column > div:not(.app-editor-drop-cursor) {
  flex: 1 1 auto;
  box-sizing: border-box;
}

.preview-device--wechat .cms-columns,
.preview-device--mobile .cms-columns {
  display: block;
}

.preview-device--wechat .cms-columns::after,
.preview-device--mobile .cms-columns::after {
  content: "";
  display: table;
  clear: both;
}

/* 编辑器表格选中指示（与多栏同语言）
 * 注意：TableKit 用 div.tableWrapper 包裹 table 做列宽拖拽，
 * decoration 高亮类落在 wrapper 上；输出 HTML 不受影响（仍是纯 table） */
.app-editor-wrapper .tableWrapper.app-editor-table--selected {
  outline: 2px solid hsl(var(--primary) / 85%);
  outline-offset: -2px;
  background-color: hsl(var(--primary) / 5%);
  border-radius: 10px;
}

/* 元素检查器选中：虚线描边，与容器实线区分，内收防裁剪 */
.app-editor-wrapper .app-editor-element--selected {
  outline: 2px dashed hsl(var(--primary) / 80%);
  outline-offset: -2px;
  border-radius: 8px;
}

/* 难点击元素的编辑态点击区（仅编辑器内，不进输出）：
 * 空段落给最小高度，hr 上下加垫（背景裁剪保持线条位置） */
.app-editor-wrapper .vben-tiptap-content p:empty {
  min-height: 1.5em;
}

.app-editor-wrapper .vben-tiptap-content hr {
  padding: 8px 0;
  background-clip: content-box;
  cursor: pointer;
}

/* 检查器表单控件 */
.app-editor-inspector__actions {
  align-items: flex-start;
}

.app-editor-inspector__group {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.app-editor-inspector__quad {
  display: flex;
  gap: 4px;
}

.app-editor-inspector__quad label {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.app-editor-inspector__num {
  width: 40px;
  padding: 3px 4px;
  font-size: 11px;
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  outline: none;
}

.app-editor-inspector__num:focus {
  border-color: hsl(var(--primary));
}

.app-editor-inspector__num--wide {
  width: 52px;
}

.app-editor-inspector__url {
  width: 150px;
  padding: 3px 6px;
  font-size: 11px;
  font-family: monospace;
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  outline: none;
}

.app-editor-inspector__url:focus {
  border-color: hsl(var(--primary));
}

.app-editor-inspector__color {
  width: 26px;
  height: 24px;
  padding: 1px;
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  background: hsl(var(--background));
  cursor: pointer;
}

/* 移动端 768px 自适应响应式（旧版 --stack/--keep 两档模式；
 * 新版 --row1/--row2 不在此列——窄屏直接回落内联基线，一排 x 个） */
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

/* 仿真小屏视口（如 375px）：旧版内容堆叠/保持两档；
 * 新版内容不写规则，直接露出内联基线（一排 x 个） */
.app-editor-wrapper.viewport--375px .cms-columns--stack,
.app-editor-wrapper.viewport--677px .cms-columns--stack {
  flex-direction: column !important;
  gap: 12px !important;
}

.app-editor-wrapper.viewport--375px .cms-columns--stack > .cms-column,
.app-editor-wrapper.viewport--677px .cms-columns--stack > .cms-column {
  flex: 1 1 100% !important;
  width: 100% !important;
}

.app-editor-wrapper.viewport--375px .cms-columns--keep,
.app-editor-wrapper.viewport--677px .cms-columns--keep {
  flex-direction: row !important;
}

/* 公用浮动工具弹层（挂载在 body 顶层，全编辑器通用） */

.app-editor-floating__toolbar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 4px 14px rgb(0 0 0 / 18%);
}

.app-editor-floating__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-bottom: 4px;
  border-bottom: 1px solid hsl(var(--border) / 60%);
  gap: 8px;
}

.app-editor-tag {
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--primary));
  display: flex;
  align-items: center;
  gap: 4px;
  letter-spacing: 0.5px;
}

.app-editor-tag-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 4px;
  background: hsl(var(--primary) / 12%);
  color: hsl(var(--primary));
}



.app-editor-floating__actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.app-editor-floating__panels {
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* 公用工具条按钮规范 */
.app-editor-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  min-width: 28px;
  padding: 0 6px;
  color: hsl(var(--foreground));
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  transition: all 0.15s ease;
}

.app-editor-btn--pill {
  gap: 4px;
  padding: 0 8px;
}

.app-editor-btn-label {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.app-editor-btn-text {
  font-size: 11px;
  margin-left: 2px;
  white-space: nowrap;
}

.app-editor-btn:hover {
  background: hsl(var(--accent));
}

.app-editor-btn.is-active {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 15%);
}

/* 删除按钮：使用垃圾桶图标（Trash2），带危险提示红底色 */
.app-editor-btn--danger:hover {
  color: hsl(var(--destructive));
  background: hsl(var(--destructive) / 15%);
}

.app-editor-divider {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: hsl(var(--border));
}

/* 二级调节弹层规范 */
.app-editor-panel {
  margin-top: 4px;
  padding: 10px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 6px 18px rgb(0 0 0 / 18%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 200px;
}

.app-editor-panel-title {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
}

.app-editor-presets {
  display: flex;
  gap: 4px;
}

.app-editor-preset-btn {
  flex: 1;
  padding: 4px 6px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--secondary) / 50%);
  color: hsl(var(--foreground));
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  text-align: center;
}

.app-editor-preset-btn:hover {
  background: hsl(var(--accent));
}

.app-editor-preset-btn.is-active {
  background: hsl(var(--primary));
  color: #ffffff;
  border-color: hsl(var(--primary));
  font-weight: 500;
}

.app-editor-slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-editor-slider {
  flex: 1;
  accent-color: hsl(var(--primary));
}

.app-editor-pct {
  min-width: 34px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--muted-foreground));
  text-align: right;
}

.app-editor-align-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.app-editor-align-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: hsl(var(--foreground));
  cursor: pointer;
  font-size: 12px;
  width: 100%;
  text-align: left;
  transition: all 0.15s ease;
}

.app-editor-align-item:hover {
  background: hsl(var(--accent));
}

.app-editor-align-item.is-active {
  background: hsl(var(--primary) / 15%);
  color: hsl(var(--primary));
  font-weight: 500;
}

/* ---------------------------------------------------------------------------
 * 底部固定 Dock 工具条（替代 Teleport 浮动定位：永不遮挡菜单与正文）
 * 与下方状态条同底、无缝集成为一整块页脚面板：卡片去卡片化，
 * 整宽行 + 发丝线分隔，二级面板同样拍平。
 * --------------------------------------------------------------------------- */
.app-editor-dock {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  max-height: 240px;
  overflow-y: auto;
  padding: 0;
  border-top: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 20%);
  user-select: none;
}

/* 卡片在 dock 内去卡片化：透明底、无边框、无阴影、无圆角 */
.app-editor-dock > .app-editor-floating__toolbar {
  background: transparent;
  border: none;
  padding: 6px 12px 8px;
  border-radius: 0;
  box-shadow: none;
}

/* 行与行之间发丝线分隔 */
.app-editor-dock > .app-editor-floating__toolbar + .app-editor-floating__toolbar {
  border-top: 1px solid hsl(var(--border) / 60%);
}

/* 标题行与操作行收紧为一组，去掉卡片式下划线 */
.app-editor-dock .app-editor-floating__header {
  border-bottom: none;
  padding-bottom: 0;
}

/* 窄屏自动换行 */
.app-editor-dock .app-editor-floating__actions {
  flex-wrap: wrap;
  row-gap: 6px;
}

/* 二级面板同样拍平：透明底、无边框、无阴影，虚线上分隔 */
.app-editor-dock .app-editor-panel {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 6px 0 2px;
  box-shadow: none;
  min-width: 0;
  margin-top: 6px;
  border-top: 1px dashed hsl(var(--border) / 70%);
}

.app-editor-global-toolbar {
  flex: 1 1 auto;
  min-width: 0;
}

/* ---------------------------------------------------------------------------
 * 源代码模式 CodeMirror 6
 * 高亮色经 --cm-* 变量注入（HighlightStyle 里写 var(--cm-*, 兜底色)），
 * 明暗模式各配一套，自动跟随应用主题
 * --------------------------------------------------------------------------- */
.app-editor-wrapper {
  --cm-bracket: #cf222e;
  --cm-tag: #116329;
  --cm-attr: #0550ae;
  --cm-string: #0a3069;
  --cm-comment: #6e7781;
}

.dark .app-editor-wrapper {
  --cm-bracket: #ff7b72;
  --cm-tag: #7ee787;
  --cm-attr: #79c0ff;
  --cm-string: #a5d6ff;
  --cm-comment: #8b949e;
}

.app-editor-source-host {
  overflow: hidden;
}

.app-editor-source-host .cm-editor {
  height: 100%;
}

.app-editor-source-host .cm-editor.cm-focused {
  outline: none;
}

/* 配对标签名高亮：光标落在开/闭标签名上时两端同时标记 */
.app-editor-source-host .cm-tag-pair {
  background-color: hsl(var(--primary) / 16%);
  box-shadow: 0 1px 0 hsl(var(--primary) / 70%);
  border-radius: 2px;
}

/* 头部条之下撑满剩余空间（与全屏 minHeight 内联样式叠加） */
.app-editor-source .app-editor-source-host:not(:first-child) {
  flex: 1 1 auto;
}

/* ---------------------------------------------------------------------------
 * AI 内联比对（方案 A：红底删除线 + 绿底下划线）
 * --------------------------------------------------------------------------- */
.app-editor-diff-del {
  background-color: rgba(239, 68, 68, 0.15) !important;
  color: #b91c1c !important;
  text-decoration: line-through !important;
  text-decoration-color: #ef4444 !important;
  border-radius: 2px !important;
  padding: 0 3px !important;
  margin: 0 2px !important;
  user-select: none !important;
  font-size: 0.95em !important;
  display: inline-block !important;
  vertical-align: baseline !important;
}

.dark .app-editor-diff-del {
  background-color: rgba(239, 68, 68, 0.25) !important;
  color: #f87171 !important;
  text-decoration-color: #f87171 !important;
}

.app-editor-diff-ins {
  background-color: rgba(16, 185, 129, 0.18) !important;
  color: #065f46 !important;
  text-decoration: underline !important;
  text-decoration-color: #10b981 !important;
  text-underline-offset: 2px !important;
  border-radius: 2px !important;
  padding: 0 2px !important;
  font-weight: 500 !important;
}

.dark .app-editor-diff-ins {
  background-color: rgba(16, 185, 129, 0.25) !important;
  color: #34d399 !important;
  text-decoration-color: #34d399 !important;
}
</style>
