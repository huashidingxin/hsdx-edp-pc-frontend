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
   * 粘贴富文本时是否自动后台转存并原地替换外链
   * 属于组件底层能力，默认关闭 (false)；仅由调用方通过 props 显式传入开启，不向终端用户暴露交互切换
   */
  autoTransferOnPaste: {
    type: Boolean,
    default: false,
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
const editorCanvasWidth = ref('auto'); // 'auto' | '677px' | '375px'
const isVideoPlaying = ref(false);
const replaceVideoModalOpen = ref(false);
const isSourceMode = ref(false);
const sourceCode = ref('');
/**
 * 双栏模式：全屏下左可视化、右源码并排。进入时自动进全屏；
 * 右侧为“只看+定位”视角：左侧编辑实时刷新右侧，右侧改动需手动应用
 * （避免逐键 setContent 丢光标/丢撤销栈），选中元素时右侧高亮定位。
 */
const isSplitView = ref(false);
/** 双栏或纯源码任一成立即挂载源码面板 */
const showSource = computed(() => isSourceMode.value || isSplitView.value);
/** 纯源码时隐藏左侧可视化，双栏时两侧同时可见 */
const showEditor = computed(() => !isSourceMode.value || isSplitView.value);

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
  // 退出全屏时双栏无处安放，一并收起
  if (!isFullscreen.value && isSplitView.value) {
    isSplitView.value = false;
  }
  nextTick(() => {
    onScrollOrResize();
  });
}

/** 双栏开关：进入=进全屏+挂载右侧源码（以左侧最新 HTML 为准）；退出保留全屏 */
function toggleSplitView() {
  if (isSplitView.value) {
    isSplitView.value = false;
    sourceAiApi.value?.clearLocate?.();
    nextTick(() => {
      onScrollOrResize();
    });
    return;
  }
  // 纯源码模式下进入双栏：先把右侧改动落到编辑器，再并排
  if (isSourceMode.value) {
    exitSourceMode();
  }
  isFullscreen.value = true;
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

function toggleSourceMode() {
  if (isSourceMode.value) {
    exitSourceMode();
  } else {
    // 纯源码与双栏互斥：进纯源码前先收起双栏，避免两侧状态打架
    if (isSplitView.value) {
      isSplitView.value = false;
      sourceAiApi.value?.clearLocate?.();
    }
    enterSourceMode();
  }
}

function enterSourceMode() {
  clearSelection();
  hideShortcutMenus();
  const currentHtml = editorInstance.value?.getHTML() ?? content.value ?? '';
  sourceCode.value = formatHtml(currentHtml);
  isSourceMode.value = true;
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

function exitSourceMode() {
  // 退出前从 CodeMirror 实例回读全文，确保未触发过 onChange 的改动也不丢失
  if (sourceView.value) {
    sourceCode.value = sourceView.value.state.doc.toString();
  }
  const nextHtml = sourceCode.value;
  content.value = nextHtml;
  if (editorInstance.value) {
    editorInstance.value.commands.setContent(nextHtml, true);
  }
  isSourceMode.value = false;
  emit('update:value', nextHtml);
  emit('update:modelValue', nextHtml);
  emit('change', nextHtml);
}

function onSourceInput(event) {
  applySourceCode(event.target.value);
}

/** 源码变更统一应用（textarea 与 CodeMirror 共用）：同步 content 并向父组件 emit */
function applySourceCode(nextHtml) {
  sourceCode.value = nextHtml;
  content.value = nextHtml;
  emit('update:value', nextHtml);
  emit('update:modelValue', nextHtml);
  emit('change', nextHtml);
}

// ---------------------------------------------------------------------------
// 源代码模式 CodeMirror 6（动态加载，独立分包）
// 数据流：CM updateListener → onSourceDocChange → applySourceCode（与旧
// textarea 逐键 emit 语义一致）；外部写入（props 变化/内部 setContent 等）
// 经 watch(sourceCode) → setSourceEditorDoc 回灌 CM，用 applyingExternal
// 标志防止「外部写入触发的 updateListener 再回环 emit」。
// AI 辅助预留：sourceAiApi 经 defineExpose(sourceAi) 暴露给父组件，
// 接口约定见 source-editor.js 文件头（AI 写、用户看着改，非全套 vibe coding）。
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
  // 双栏（非纯源码）下右侧为定位视角：只收文本，不向编辑器回写，
  // 避免逐键 setContent 导致左侧光标/撤销栈丢失；由“应用右侧改动”显式落盘
  if (isSplitView.value && !isSourceMode.value) {
    sourceCode.value = value;
    return;
  }
  applySourceCode(value);
}

/** 双栏：把右侧源码显式应用到左侧编辑器（与退出源码同语义，但保留双栏） */
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
      // Ctrl/Cmd+S、Ctrl/Cmd+Enter = 完成并应用
      onApply: () => exitSourceMode(),
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
    applySourceCode(formatHtml(sourceCode.value));
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

const columnsActivePanel = ref(null); // 'layout' | 'gap' | 'responsive' | null

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

const currentColumnsResponsive = computed(() => {
  return selectedColumnsTarget.value?.node?.attrs?.responsive || 'stack';
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

function setColumnsResponsiveMode(mode) {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().setColumnsResponsive(mode, pos).run();
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
  if (!columnsEl || !editorInstance.value || !isEditable.value || isSourceMode.value) return;
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
  if (!tableEl || !editorInstance.value || !isEditable.value || isSourceMode.value) return;
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
  if (!sel || !editor) return null;
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
  return el && el.isConnected ? el : null;
}

function onHoverMove(event) {
  if (!selectedElementTarget.value || isSourceMode.value) {
    if (isHoveringSelected.value) isHoveringSelected.value = false;
    return;
  }
  if (hoverRaf) return;
  const x = event.clientX;
  const y = event.clientY;
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0;
    if (!selectedElementTarget.value || isSourceMode.value) {
      isHoveringSelected.value = false;
      return;
    }
    const el = resolveHoverElement();
    let inside = false;
    if (el) {
      try {
        const rect = el.getBoundingClientRect();
        inside =
          rect.width > 0 &&
          rect.height > 0 &&
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom;
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
  if (!sel || !editor || isSourceMode.value) {
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
        boxOverlay.clip = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
      }
    } catch {
      boxOverlay.clip = 'none';
    }
  }
  boxOverlay.visible = true;
}

function applyElementSelection(found, el) {  selectedElementTarget.value = {
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
// Dock 全局模式：文档级一键排版（全部可撤销）
// ---------------------------------------------------------------------------

const isGlobalActionDisabled = computed(() => !isEditable.value || isSourceMode.value);

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
  if (!editor?.isEditable || isSourceMode.value) return false;
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
  if (!editor?.isEditable || isSourceMode.value) return false;
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
  if (!editor || !isEditable.value || isSourceMode.value) return;
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
  if (!imgEl || !editorInstance.value || !isEditable.value || isSourceMode.value)
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
  if (!videoEl || !editorInstance.value || !isEditable.value || isSourceMode.value)
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
  activePanel.value = null;
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
    !selectedTarget.value?.el ||
    isSourceMode.value
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
  if (!p || !editorInstance.value || isSourceMode.value || !isEditable.value) return;
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
  if (isSourceMode.value) return;
  const target = event.target;
  if (
    !target ||
    target.closest('.app-editor-floating') ||
    target.closest('.app-editor-resize-handle') ||
    target.closest('.app-editor-toolbar') ||
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
}

function onKeyDown(event) {
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
  if (isSourceMode.value || !isEditable.value) return;

  const editor = editorInstance.value;
  if (!editor) return;

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
  if (!editor || isSourceMode.value || !isEditable.value) return;

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
  if (!isSplitView.value || isSourceMode.value) return;
  if (splitRefreshTimer) clearTimeout(splitRefreshTimer);
  splitRefreshTimer = setTimeout(() => {
    splitRefreshTimer = 0;
    if (!isSplitView.value || isSourceMode.value) return;
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
 * 由当前四路选中构造源码搜索签名 { snippet, ratio }。
 * ratio 为 ProseMirror 文档进度，用于重复片段时就近命中。
 */
function currentSplitSignature() {
  const editor = editorInstance.value;
  if (!editor || editor.isDestroyed) return null;
  const size = editor.state.doc.content.size || 1;
  const ratioOf = (pos) =>
    Math.max(0, Math.min(1, (typeof pos === 'number' ? pos : 0) / size));

  const elSel = selectedElementTarget.value;
  // 行内 span：取区间文本
  if (elSel?.kind === 'span') {
    try {
      const text = editor.state.doc
        .textBetween(elSel.from, elSel.to, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length >= 2) {
        return { snippet: text.slice(0, 40), ratio: ratioOf(elSel.from) };
      }
    } catch {
      /* 忽略 */
    }
  }
  // 媒体（图片/视频）：用文件名定位最准
  const media = selectedTarget.value;
  if (media && (media.type === 'image' || media.type === 'video')) {
    const file = splitFileOf(media.node?.attrs?.src);
    if (file) return { snippet: file, ratio: ratioOf(media.pos) };
    return {
      snippet: media.type === 'image' ? '<img' : '<video',
      ratio: ratioOf(media.pos),
    };
  }
  // 通用元素检查器
  if (elSel?.kind === 'node' && elSel.node) {
    const t = elSel.node.type.name;
    if (t === 'image' || t === 'video') {
      const file = splitFileOf(elSel.node.attrs?.src);
      if (file) return { snippet: file, ratio: ratioOf(elSel.pos) };
    }
    if (t === 'table') return { snippet: '<table', ratio: ratioOf(elSel.pos) };
    if (t === 'columns') {
      return { snippet: 'cms-columns', ratio: ratioOf(elSel.pos) };
    }
    if (t === 'column') {
      return { snippet: 'cms-column', ratio: ratioOf(elSel.pos) };
    }
    try {
      const text = String(elSel.node.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length >= 2) {
        return { snippet: text.slice(0, 40), ratio: ratioOf(elSel.pos) };
      }
    } catch {
      /* 忽略 */
    }
    if (SPLIT_TAG_SNIPPET[t]) {
      return { snippet: SPLIT_TAG_SNIPPET[t], ratio: ratioOf(elSel.pos) };
    }
  }
  if (selectedTableTarget.value) {
    return { snippet: '<table', ratio: ratioOf(selectedTableTarget.value.pos) };
  }
  if (selectedColumnsTarget.value) {
    return {
      snippet: 'cms-columns',
      ratio: ratioOf(selectedColumnsTarget.value.pos),
    };
  }
  return null;
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
  if (range) api.locateRange(range.from, range.to);
  else api.clearLocate?.();
}

// 四路选中任一变化即触发右侧定位（flush:post，等本轮选中落定）
watch(
  [selectedElementTarget, selectedTableTarget, selectedColumnsTarget, selectedTarget],
  () => {
    if (isSplitView.value) scheduleSplitLocate();
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
  if (!isEditable.value || isSourceMode.value) return;
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
    class="app-editor-tiptap"
    :class="{ 'app-editor--fullscreen': isFullscreen, 'app-editor--split': isSplitView }"
    :data-editor-ready="editorInstance ? 'true' : 'false'"
    @click.capture="onContentClick"
  >
    <div v-if="label && !isFullscreen" class="mb-2 text-sm text-gray-700">
      {{ label }}
    </div>

    <!-- 包装外框：移除 overflow-hidden，确保工具栏弹出面板自由悬浮不被截断 -->
    <div
      class="app-editor-wrapper relative flex flex-col rounded-xl border border-border bg-card transition-all"
      :class="{
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
        :is-source-mode="isSourceMode"
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
        @toggle-source-mode="toggleSourceMode"
        @run-proofread="runProofread"
        @locate-proofread="locateProofreadIssue"
        @apply-proofread="applyProofreadSuggestion"
        @dismiss-proofread="dismissProofreadIssue"
        @clear-proofread="clearProofreadIssues"
      />

      <!-- 头部外链标注通知条 -->
      <div
        v-if="externalAssetsCount > 0 && !isBannerDismissed && !isSourceMode"
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
        class="app-editor-split-body"
        :class="{ 'is-split': isSplitView }"
      >
      <!-- 可视化富文本排版区（下半部独立圆角防溢出；双栏时为左半栏） -->
      <div
        v-show="showEditor"
        class="app-editor-split__left"
      >
      <VbenTiptap
        v-model="content"
        :editable="!disabled"
        :placeholder="placeholder"
        :min-height="isFullscreen ? 'calc(100vh - 120px)' : minHeight"
        :max-height="isFullscreen ? 'calc(100vh - 120px)' : maxHeight"
        :toolbar="false"
        :previewable="false"
        :extensions="extensions"
        class="rounded-b-xl overflow-hidden"
        @change="onChange"
      />
      </div>

      <!-- HTML 源代码编辑区（下半部独立圆角防溢出；双栏时为右半栏） -->
      <div
        v-if="showSource"
        class="app-editor-source app-editor-split__right flex flex-1 flex-col rounded-b-xl overflow-hidden bg-muted/20"
      >
        <div
          class="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground"
        >
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="inline-block size-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span v-if="!isSplitView" class="truncate">HTML 源代码编辑模式（Ctrl/Cmd+S 应用 · Ctrl/Cmd+F 查找替换 · 光标置于标签/内容区两端同亮，Alt+M 或 Ctrl/Cmd+点击标签跳配对）</span>
            <span v-else class="truncate">右侧代码（左侧选中元素自动定位高亮 · 右侧改动需点“应用”才会回写左侧）</span>
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
              v-if="isSplitView"
              class="rounded bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white hover:opacity-90"
              title="把右侧源码应用到左侧编辑器"
              type="button"
              @click="applySplitSourceToEditor"
            >
              应用右侧改动
            </button>
            <button
              v-if="isSplitView"
              class="rounded border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
              title="退出双栏，返回单栏编辑（保留全屏）"
              type="button"
              @click="toggleSplitView"
            >
              收起双栏
            </button>
            <button
              v-else
              class="rounded bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              type="button"
              @click="exitSourceMode"
            >
              完成并应用
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
          @input="onSourceInput"
        ></textarea>
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

    <!-- 底部固定 Dock 工具条：上下文模式（多栏/媒体）与全局模式（编辑视口/一键排版）互斥显示，永不遮挡菜单与正文 -->
    <div
      v-if="!isSourceMode"
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
                <line x1="12" x2="12" y1="3" y2="21" />
              </svg>
              多栏布局
            </span>
            <span class="app-editor-tag-badge">{{ currentColumnsCount }} 栏</span>
            <span class="text-[10px] text-muted-foreground">第 {{ currentColumnActiveIndex + 1 }} 列</span>
          </div>
          <button
            class="text-[11px] text-muted-foreground hover:text-foreground px-1"
            title="关闭多栏工具栏"
            type="button"
            @click="clearColumnsSelection"
          >
            ✕
          </button>
        </div>

        <div class="app-editor-floating__actions">
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

          <!-- 间隙宽度调节（需求 3） -->
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

          <!-- 移动端自适应方案（需求 4） -->
          <button
            class="app-editor-btn app-editor-btn--pill"
            :class="{ 'is-active': columnsActivePanel === 'responsive' }"
            title="移动端自适应排版方案 (768px 断点)"
            type="button"
            @click="toggleColumnsPanel('responsive')"
          >
            <span class="app-editor-btn-label">
              {{ currentColumnsResponsive === 'keep' ? '📱 保持并排' : '📱 ≤768px 堆叠' }}
            </span>
            <ChevronDown
              class="size-3 opacity-60 transition-transform duration-200"
              :class="{ 'rotate-180': columnsActivePanel === 'responsive' }"
            />
          </button>

          <span class="app-editor-divider"></span>

          <!-- 添加列 -->
          <button
            class="app-editor-btn"
            :disabled="currentColumnsCount >= 6"
            title="在此列后添加一列 (最多 6 栏)"
            type="button"
            @click="addColumnToCurrent"
          >
            <span class="text-xs font-semibold">+列</span>
          </button>

          <!-- 左移当前列 -->
          <button
            class="app-editor-btn"
            :disabled="currentColumnActiveIndex <= 0"
            title="当前列左移"
            type="button"
            @click="moveCurrentActiveColumnLeft"
          >
            <svg class="size-3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </button>

          <!-- 右移当前列 -->
          <button
            class="app-editor-btn"
            :disabled="currentColumnActiveIndex >= currentColumnsCount - 1"
            title="当前列右移"
            type="button"
            @click="moveCurrentActiveColumnRight"
          >
            <svg class="size-3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>

          <!-- 删除当前列 -->
          <button
            class="app-editor-btn app-editor-btn--danger"
            title="删除当前列 (若只剩2列则解包)"
            type="button"
            @click="deleteCurrentActiveColumn"
          >
            <svg class="size-3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
          </button>

          <span class="app-editor-divider"></span>

          <!-- 在分栏上方插入空行 -->
          <button
            class="app-editor-btn"
            title="在分栏上方插入空行 (可在此处换行输入)"
            type="button"
            @click="insertParagraphBeforeCurrentColumns"
          >
            <ArrowUp class="size-3.5" />
          </button>

          <!-- 在分栏下方插入空行 -->
          <button
            class="app-editor-btn"
            title="在分栏下方插入空行 (可在此处换行输入)"
            type="button"
            @click="insertParagraphAfterCurrentColumns"
          >
            <ArrowDown class="size-3.5" />
          </button>

          <!-- 一键解包分栏（平铺内容，移除分栏外壳） -->
          <button
            class="app-editor-btn text-amber-600 hover:text-amber-700"
            title="解包分栏 (提取所有文字与媒体，移除分栏外壳，内容不丢失)"
            type="button"
            @click="unsetCurrentColumns"
          >
            <span class="text-[11px] font-medium">解包</span>
          </button>

          <!-- 删除整个分栏 -->
          <button
            class="app-editor-btn app-editor-btn--danger"
            title="删除整个多栏"
            type="button"
            @click="deleteCurrentColumns"
          >
            <svg class="size-3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
          </button>
        </div>

        <!-- 多栏二级面板区（比例、间隙、移动端适配） -->
        <div v-if="columnsActivePanel" class="app-editor-floating__panels">
          <!-- 比例调节面板 -->
          <div v-if="columnsActivePanel === 'layout'" class="app-editor-panel">
            <div class="flex items-center justify-between">
              <span class="app-editor-panel-title">快捷比例切换</span>
              <button
                class="text-[11px] text-primary hover:underline"
                type="button"
                @click="resetColumnsEqualWidth"
              >
                均等重置
              </button>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <template v-if="currentColumnsCount === 2">
                <button
                  class="app-editor-preset-btn"
                  :class="{ 'is-active': currentColumnsLayout === '1:1' }"
                  type="button"
                  @click="setColumnsLayoutPreset('1:1')"
                >
                  1 : 1 (等宽)
                </button>
                <button
                  class="app-editor-preset-btn"
                  :class="{ 'is-active': currentColumnsLayout === '1:2' }"
                  type="button"
                  @click="setColumnsLayoutPreset('1:2')"
                >
                  1 : 2 (左窄右宽)
                </button>
                <button
                  class="app-editor-preset-btn"
                  :class="{ 'is-active': currentColumnsLayout === '2:1' }"
                  type="button"
                  @click="setColumnsLayoutPreset('2:1')"
                >
                  2 : 1 (左宽右窄)
                </button>
                <button
                  class="app-editor-preset-btn"
                  :class="{ 'is-active': currentColumnsLayout === '1:3' }"
                  type="button"
                  @click="setColumnsLayoutPreset('1:3')"
                >
                  1 : 3
                </button>
                <button
                  class="app-editor-preset-btn"
                  :class="{ 'is-active': currentColumnsLayout === '3:1' }"
                  type="button"
                  @click="setColumnsLayoutPreset('3:1')"
                >
                  3 : 1
                </button>
              </template>
              <template v-else-if="currentColumnsCount === 3">
                <button
                  class="app-editor-preset-btn"
                  :class="{ 'is-active': currentColumnsLayout === '1:1:1' }"
                  type="button"
                  @click="setColumnsLayoutPreset('1:1:1')"
                >
                  1 : 1 : 1 (等宽)
                </button>
                <button
                  class="app-editor-preset-btn"
                  :class="{ 'is-active': currentColumnsLayout === '1:2:1' }"
                  type="button"
                  @click="setColumnsLayoutPreset('1:2:1')"
                >
                  1 : 2 : 1 (居中聚焦)
                </button>
                <button
                  class="app-editor-preset-btn"
                  :class="{ 'is-active': currentColumnsLayout === '2:1:1' }"
                  type="button"
                  @click="setColumnsLayoutPreset('2:1:1')"
                >
                  2 : 1 : 1
                </button>
                <button
                  class="app-editor-preset-btn"
                  :class="{ 'is-active': currentColumnsLayout === '1:1:2' }"
                  type="button"
                  @click="setColumnsLayoutPreset('1:1:2')"
                >
                  1 : 1 : 2
                </button>
              </template>
              <template v-else>
                <button
                  class="app-editor-preset-btn is-active"
                  type="button"
                  @click="resetColumnsEqualWidth"
                >
                  均等平分所有栏
                </button>
              </template>
            </div>
          </div>

          <!-- 间隙宽度面板（需求 3） -->
          <div v-else-if="columnsActivePanel === 'gap'" class="app-editor-panel">
            <span class="app-editor-panel-title">列间隙宽度 (Gap)</span>
            <div class="app-editor-presets">
              <button
                class="app-editor-preset-btn"
                :class="{ 'is-active': currentColumnsGap === '0px' }"
                type="button"
                @click="setColumnsGapValue('0px')"
              >
                0px 无缝
              </button>
              <button
                class="app-editor-preset-btn"
                :class="{ 'is-active': currentColumnsGap === '8px' }"
                type="button"
                @click="setColumnsGapValue('8px')"
              >
                8px 紧凑
              </button>
              <button
                class="app-editor-preset-btn"
                :class="{ 'is-active': currentColumnsGap === '16px' }"
                type="button"
                @click="setColumnsGapValue('16px')"
              >
                16px 标准
              </button>
              <button
                class="app-editor-preset-btn"
                :class="{ 'is-active': currentColumnsGap === '24px' }"
                type="button"
                @click="setColumnsGapValue('24px')"
              >
                24px 宽松
              </button>
              <button
                class="app-editor-preset-btn"
                :class="{ 'is-active': currentColumnsGap === '32px' }"
                type="button"
                @click="setColumnsGapValue('32px')"
              >
                32px 大号
              </button>
            </div>
          </div>

          <!-- 移动端自适应方案面板（需求 4） -->
          <div v-else-if="columnsActivePanel === 'responsive'" class="app-editor-panel">
            <span class="app-editor-panel-title">移动端自适应方案 (断点: 768px)</span>
            <div class="flex flex-col gap-1.5">
              <button
                class="app-editor-align-item"
                :class="{ 'is-active': currentColumnsResponsive === 'stack' }"
                type="button"
                @click="setColumnsResponsiveMode('stack')"
              >
                <span class="text-base">📱</span>
                <div class="flex flex-col text-left">
                  <span class="font-medium text-xs">自动垂直堆叠 (推荐)</span>
                  <span class="text-[10px] text-muted-foreground">屏幕 ≤768px 或移动端预览时，各列自动占满100%单栏流，避免字图挤压变形</span>
                </div>
              </button>
              <button
                class="app-editor-align-item"
                :class="{ 'is-active': currentColumnsResponsive === 'keep' }"
                type="button"
                @click="setColumnsResponsiveMode('keep')"
              >
                <span class="text-base">↔️</span>
                <div class="flex flex-col text-left">
                  <span class="font-medium text-xs">保持横向并排</span>
                  <span class="text-[10px] text-muted-foreground">即使在移动端也强行维持多栏横向并列排版，适合紧凑数据或对比</span>
                </div>
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
          <span class="app-editor-tag">页面设置</span>
          <span class="text-[10px] text-muted-foreground">未选中节点时显示</span>
        </div>

        <div class="app-editor-floating__actions">
          <span class="app-editor-panel-title" title="仅调整编辑区显示宽度，用于预览窄屏排版效果，不会改变发布后的页面宽度">编辑视口</span>
          <div class="inline-flex rounded-md border border-border bg-background p-0.5">
            <button
              type="button"
              class="rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
              :class="editorCanvasWidth === 'auto' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
              title="自适应跟随外部宽度"
              @click="editorCanvasWidth = 'auto'"
            >
              自适应
            </button>
            <button
              type="button"
              class="rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
              :class="editorCanvasWidth === '677px' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
              title="微信公众号标准宽 (677px)"
              @click="editorCanvasWidth = '677px'"
            >
              公众号 (677px)
            </button>
            <button
              type="button"
              class="rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
              :class="editorCanvasWidth === '375px' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
              title="手机端真实视口 (375px)"
              @click="editorCanvasWidth = '375px'"
            >
              手机 (375px)
            </button>
          </div>

          <span class="app-editor-divider"></span>

          <span class="app-editor-panel-title">一键排版</span>
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

          <span class="app-editor-divider"></span>

          <button
            class="app-editor-btn app-editor-btn--pill app-editor-copy-styles-btn"
            :class="{ 'is-active': needsCustomStyles }"
            :title="needsCustomStyles ? '文档使用了多栏布局，发布到自有站点前建议复制样式定义（公众号等终端可忽略）' : '复制输出样式定义（当前文档未使用多栏，可忽略）'"
            type="button"
            @click="copyContentStyles"
          >
            <span
              v-if="needsCustomStyles"
              class="inline-block size-1.5 rounded-full bg-primary animate-pulse shrink-0"
            ></span>
            <span class="app-editor-btn-label">复制样式</span>
          </button>
        </div>
      </div>
    </div>

      <!-- 底部状态条与外链标注 -->
      <div
        class="app-editor-statusbar flex flex-wrap items-center justify-between border-t border-border bg-muted/20 px-4 py-1.5 text-[11px] text-muted-foreground select-none"
      >
        <div class="flex items-center gap-3">
          <span>字符数: {{ plainTextCount }}</span>
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
        v-if="handleVisible && !isSourceMode"
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
        v-if="boxOverlay.visible && isHoveringSelected && !isSourceMode"
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
                'max-w-[375px] bg-card rounded-[2.5rem] shadow-2xl border-[6px] border-slate-800 p-5 min-h-[667px]': previewDevice === 'mobile',
                'max-w-[677px] bg-card rounded-xl shadow-xl border border-border p-6 sm:p-8 min-h-[500px]': previewDevice === 'wechat',
                'max-w-full bg-card rounded-xl border border-border p-6 min-h-[500px]': previewDevice === 'full',
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
}

.app-editor-tiptap.app-editor--fullscreen .app-editor-wrapper {
  flex: 1 !important;
  height: 100% !important;
  max-height: 100% !important;
  border-radius: 8px !important;
}

.app-editor-tiptap.app-editor--fullscreen .vben-tiptap {
  flex: 1 !important;
  overflow-y: auto !important;
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
  flex: 1 1 0 !important;
  min-width: 0 !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden auto !important;
}

.app-editor-tiptap.app-editor--split .app-editor-split__left {
  border-right: 1px solid hsl(var(--border)) !important;
}

.app-editor-tiptap.app-editor--split .app-editor-split__right {
  background-color: hsl(var(--muted) / 20%) !important;
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
    border-right: none !important;
    border-bottom: 1px solid hsl(var(--border)) !important;
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
.app-editor-wrapper.viewport--677px .vben-tiptap-content {
  max-width: 677px !important;
  margin-left: auto !important;
  margin-right: auto !important;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.04);
}

.app-editor-wrapper.viewport--375px .vben-tiptap-content {
  max-width: 375px !important;
  margin-left: auto !important;
  margin-right: auto !important;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.06);
  border-left: 1px dashed hsl(var(--border));
  border-right: 1px dashed hsl(var(--border));
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
  z-index: 9000;
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
  border: 0 solid rgb(246 178 107 / 45%);
}

.app-editor-boxoverlay__padding {
  background: rgb(147 196 125 / 55%);
}

.app-editor-boxoverlay__content {
  background: rgb(111 168 220 / 15%);
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
 * --------------------------------------------------------------------------- */
.cms-columns {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 16px 0;
  box-sizing: border-box;
  width: 100%;
}

.cms-column {
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

/* 移动端 768px 自适应响应式（支持默认堆叠与保持并排两档模式） */
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

/* 仿真小屏视口（如 375px） */
.app-editor-wrapper.viewport--375px .cms-columns:not(.cms-columns--keep),
.app-editor-wrapper.viewport--375px .cms-columns--stack {
  flex-direction: column !important;
  gap: 12px !important;
}

.app-editor-wrapper.viewport--375px .cms-columns:not(.cms-columns--keep) > .cms-column,
.app-editor-wrapper.viewport--375px .cms-columns--stack > .cms-column {
  flex: 1 1 100% !important;
  width: 100% !important;
}

.app-editor-wrapper.viewport--375px .cms-columns--keep {
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
</style>
