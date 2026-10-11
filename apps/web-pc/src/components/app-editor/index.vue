<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
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

import { upload as uploadFile } from '#/api';

import { findActiveColumnsInfo } from './columns';
import {
  findColumnsNodeAndPos,
  findImageNodeAndPos,
  findVideoNodeAndPos,
} from './dom-lookup';
import EditorToolbar from './editor-toolbar.vue';
import { createEditorExtensions } from './extensions';
import FloatingToolbar from './floating-toolbar.vue';
import { DEFAULT_THUMBNAIL_PROCESS, defaultFetchMedia, stripThumbnailParam } from './media-api';
import {
  appEditorSelectionKey,
  dispatchColumnsSelected,
  dispatchSelectionCleared,
} from './selection-plugin';
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
const plainTextCount = computed(
  () => (content.value || '').replace(/<[^>]*>/g, '').trim().length,
);

function openExternalModal() {
  isExternalModalOpen.value = true;
}

function onReplaceExternalUrls(urlMapping) {
  if (!urlMapping || Object.keys(urlMapping).length === 0) return;
  const currentHtml = editorInstance.value?.getHTML() || content.value || '';
  const updated = replaceAssetUrlsInHtml(currentHtml, urlMapping);
  content.value = updated;
  if (isSourceMode.value) {
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
  if (isSourceMode.value) {
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

function openPreviewModal() {
  isPreviewModalOpen.value = true;
}

function closePreviewModal() {
  isPreviewModalOpen.value = false;
}

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
    enterSourceMode();
  }
}

function enterSourceMode() {
  clearSelection();
  const currentHtml = editorInstance.value?.getHTML() ?? content.value ?? '';
  sourceCode.value = formatHtml(currentHtml);
  isSourceMode.value = true;
}

function exitSourceMode() {
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
  const nextHtml = event.target.value;
  sourceCode.value = nextHtml;
  content.value = nextHtml;
  emit('update:value', nextHtml);
  emit('update:modelValue', nextHtml);
  emit('change', nextHtml);
}

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

const compoundFloatingRef = ref(null);

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
  updateActiveFloating();
}

function resetColumnsEqualWidth() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().resetColumnsEqual(pos).run();
  refreshSelectedColumnsNode();
  columnsActivePanel.value = null;
  updateActiveFloating();
}

function setColumnsGapValue(gap) {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().setColumnsGap(gap, pos).run();
  refreshSelectedColumnsNode();
  columnsActivePanel.value = null;
  updateActiveFloating();
}

function setColumnsResponsiveMode(mode) {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().setColumnsResponsive(mode, pos).run();
  refreshSelectedColumnsNode();
  columnsActivePanel.value = null;
  updateActiveFloating();
}

function addColumnToCurrent() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().addColumn('after', pos).run();
  refreshSelectedColumnsNode();
  updateActiveFloating();
}

function deleteCurrentActiveColumn() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos, activeColIndex } = selectedColumnsTarget.value;
  editorInstance.value.chain().focus().deleteColumnAtIndex(activeColIndex, pos).run();
  refreshSelectedColumnsNode();
  updateActiveFloating();
}

function moveCurrentActiveColumnLeft() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos, activeColIndex } = selectedColumnsTarget.value;
  if (activeColIndex <= 0) return;
  editorInstance.value.chain().focus().moveColumnLeft(activeColIndex, pos).run();
  selectedColumnsTarget.value.activeColIndex -= 1;
  refreshSelectedColumnsNode();
  updateActiveFloating();
}

function moveCurrentActiveColumnRight() {
  if (!editorInstance.value || !selectedColumnsTarget.value) return;
  const { pos, activeColIndex } = selectedColumnsTarget.value;
  if (activeColIndex >= currentColumnsCount.value - 1) return;
  editorInstance.value.chain().focus().moveColumnRight(activeColIndex, pos).run();
  selectedColumnsTarget.value.activeColIndex += 1;
  refreshSelectedColumnsNode();
  updateActiveFloating();
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
  updateActiveFloating();
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
}

const selectedTarget = ref(null);
// 结构: { type: 'image' | 'video', el, pos, node }

function updateActiveFloating() {
  nextTick(() => {
    compoundFloatingRef.value?.updatePosition();
    requestAnimationFrame(() => {
      compoundFloatingRef.value?.updatePosition();
    });
  });
}

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

  sliderValue.value = getCurrentImagePercent();
  updateActiveFloating();
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

  sliderValue.value = getCurrentImagePercent();
  updateActiveFloating();
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
        updateActiveFloating();
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
    updateActiveFloating();
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
  updateActiveFloating();
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
  updateActiveFloating();
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

function commitImagePercent(percent) {
  if (!selectedTarget.value || !['image', 'video'].includes(selectedTarget.value.type)) return;
  const editor = editorInstance.value;
  if (!editor) return;
  const pos = requireFreshMediaPos();
  if (pos === null) return;

  const clamped = Math.max(5, Math.min(100, Math.round(percent)));
  const widthVal = clamped >= 100 ? '100%' : `${clamped}%`;

  const node = editor.state.doc.nodeAt(pos);
  if (!node || (node.type.name !== 'image' && node.type.name !== 'video')) return;

  const currentStyle = node.attrs.style || '';
  const newStyle = setStyleDecls(
    currentStyle,
    [['width', widthVal]],
    ['height'],
  );

  const tr = editor.state.tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    style: newStyle,
    width: null,
    height: null,
  });
  editor.view.dispatch(tr);

  selectedTarget.value.node = editor.state.doc.nodeAt(pos);
  sliderValue.value = clamped;
  previewWidth.value = null;
  previewPercent.value = null;

  updateActiveFloating();
  nextTick(() => {
    updateHandlePosition();
  });
}

function applyPreset(percent) {
  sliderValue.value = percent;
  commitImagePercent(percent);
  activePanel.value = null;
}

function onSliderChange() {
  commitImagePercent(sliderValue.value);
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

  updateActiveFloating();
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
        updateActiveFloating();
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
    updateActiveFloating();
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
    updateActiveFloating();
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
  }
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
    } else if (p.kind === 'video') {
      selectVideo(p.el);
      const columnsEl = p.el.closest?.('.cms-columns');
      if (columnsEl) selectColumns(columnsEl, p.el);
      else clearColumnsSelection();
    } else if (p.kind === 'columns') {
      clearSelection();
      selectColumns(p.el, p.targetEl || p.el);
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
    target.closest('.app-editor-toolbar')
  ) {
    return;
  }

  // 桥接尚未就绪（editorInstance 为空）时暂存点击，待就绪回放，不静默丢弃
  if (!editorInstance.value) {
    stashPendingClick(target);
    return;
  }

  const columnsEl = target.closest('.cms-columns');

  // 1. 点击图片：选中图片，若在多栏内部则同时激活多栏工具条（实现双块堆叠显示）
  const imgEl = target.tagName === 'IMG' ? target : target.closest('img');
  if (imgEl) {
    selectImage(imgEl);
    if (columnsEl) {
      selectColumns(columnsEl, imgEl);
    } else {
      clearColumnsSelection();
    }
    return;
  }

  // 2. 点击视频：拦截原生自动触发，选中视频，若在多栏内部则同时激活多栏工具条（实现双块堆叠显示）
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
    return;
  }

  // 3. 点击多栏内部的常规元素（段落、文本、空白区域等）：激活多栏工具条，清除媒体工具条
  if (columnsEl) {
    clearSelection();
    selectColumns(columnsEl, target);
    return;
  }

  // 4. 点击多栏外部的常规段落：清除全部浮动选中
  clearAllSelection();
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
  if (['image', 'video'].includes(selectedTarget.value?.type)) {
    updateHandlePosition();
  }
  updateActiveFloating();
}

function onKeyDown(event) {
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
      updateActiveFloating();
      return;
    }
  }

  // 只有当脱离多栏且没有选中的内部媒体时才清理多栏选中
  if (selectedColumnsTarget.value && !selectedTarget.value) {
    clearColumnsSelection();
  }
}

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
});

watch(
  () => props.value,
  (newValue) => {
    if (newValue !== undefined && newValue !== content.value) {
      content.value = newValue;
      if (isSourceMode.value) {
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
      if (isSourceMode.value) {
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
  if (selectedTarget.value?.type === 'image') {
    nextTick(() => {
      updateHandlePosition();
      updateActiveFloating();
    });
  }
}

onMounted(() => {
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
  window.addEventListener('keydown', onKeyDown);
  nextTick(() => {
    bindEditorDOM();
  });
});

onBeforeUnmount(() => {
  unbindEditorDOM();
  window.removeEventListener('scroll', onScrollOrResize, true);
  window.removeEventListener('resize', onScrollOrResize);
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <div
    ref="editorContainerRef"
    class="app-editor-tiptap"
    :class="{ 'app-editor--fullscreen': isFullscreen }"
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
        :upload-image="uploadImage"
        :upload-file="uploadGeneralFile"
        :fetch-media="props.fetchMedia !== undefined ? props.fetchMedia : defaultFetchMedia"
        :thumbnail-process="props.thumbnailProcess"
        :external-assets-count="externalAssetsCount"
        @toggle-fullscreen="toggleFullscreen"
        @open-external-assets="openExternalModal"
        @open-preview="openPreviewModal"
        @toggle-source-mode="toggleSourceMode"
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

      <!-- 可视化富文本排版区（下半部独立圆角防溢出） -->
      <VbenTiptap
        v-show="!isSourceMode"
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

      <!-- HTML 源代码编辑区（下半部独立圆角防溢出） -->
      <div
        v-if="isSourceMode"
        class="app-editor-source flex flex-1 flex-col rounded-b-xl overflow-hidden bg-muted/20"
      >
        <div
          class="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground"
        >
          <div class="flex items-center gap-1.5">
            <span class="inline-block size-2 rounded-full bg-emerald-500"></span>
            <span>HTML 源代码编辑模式（可直接编辑标签与属性样式，编辑完成后点击右侧按钮应用）</span>
          </div>
          <button
            class="rounded bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            type="button"
            @click="exitSourceMode"
          >
            完成并应用
          </button>
        </div>
        <textarea
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
      <!-- 底部状态条与外链标注 -->
      <div
        class="flex flex-wrap items-center justify-between border-t border-border bg-muted/20 px-4 py-1.5 text-[11px] text-muted-foreground select-none"
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

          <!-- 当前光标所在排版块指示与快速跳出插行（已下线：Section 块体系移除，多栏/媒体统一走浮动工具条） -->
        </div>

        <div class="flex items-center gap-3">
          <!-- 视口宽度调节 -->
          <div class="hidden sm:flex items-center gap-1.5 text-[10px]">
            <span class="opacity-75">编辑视口:</span>
            <div class="inline-flex rounded-md border border-border bg-background p-0.5">
              <button
                type="button"
                class="rounded px-1.5 py-0.5 font-medium transition-colors"
                :class="editorCanvasWidth === 'auto' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
                title="自适应跟随外部宽度"
                @click="editorCanvasWidth = 'auto'"
              >
                自适应
              </button>
              <button
                type="button"
                class="rounded px-1.5 py-0.5 font-medium transition-colors"
                :class="editorCanvasWidth === '677px' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
                title="微信公众号标准宽 (677px)"
                @click="editorCanvasWidth = '677px'"
              >
                公众号 (677px)
              </button>
              <button
                type="button"
                class="rounded px-1.5 py-0.5 font-medium transition-colors"
                :class="editorCanvasWidth === '375px' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
                title="手机端真实视口 (375px)"
                @click="editorCanvasWidth = '375px'"
              >
                手机 (375px)
              </button>
            </div>
          </div>
          <span class="text-border hidden sm:inline">|</span>
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

    <!-- 统一复合浮动工具条（支持多栏布局工具条与图片/视频工具条上下堆叠显示） -->
    <FloatingToolbar
      v-if="(selectedColumnsTarget || selectedTarget) && !isSourceMode"
      ref="compoundFloatingRef"
      :visible="true"
      :target="selectedTarget?.el || selectedColumnsTarget?.el"
      placement="right"
      :editor="editorInstance"
      @close="clearAllSelection"
    >
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

      <!-- 下层卡片：图片特殊块工具栏（若当前选中了图片，堆叠在多栏下方显示） -->
      <div
        v-if="selectedTarget?.type === 'image'"
        class="app-editor-floating__toolbar app-editor-image-toolbar"
      >
        <div class="app-editor-floating__header">
          <span class="app-editor-tag">图片</span>
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
        <span class="app-editor-btn-label">{{ displayPercent }}%</span>
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
          <div class="app-editor-panel-title">快速预设</div>
          <div class="app-editor-presets">
            <button
              v-for="preset in PRESET_SIZES"
              :key="preset.value"
              type="button"
              class="app-editor-preset-btn"
              :class="{ 'is-active': displayPercent === preset.value }"
              @click="applyPreset(preset.value)"
            >
              {{ preset.label }}
            </button>
          </div>
          <div class="app-editor-panel-title mt-2">自定义微调</div>
          <div class="app-editor-slider-row">
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
        <span class="app-editor-btn-label">{{ displayPercent }}%</span>
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
          <div class="app-editor-panel-title">快速预设</div>
          <div class="app-editor-presets">
            <button
              v-for="preset in PRESET_SIZES"
              :key="preset.value"
              type="button"
              class="app-editor-preset-btn"
              :class="{ 'is-active': displayPercent === preset.value }"
              @click="applyPreset(preset.value)"
            >
              {{ preset.label }}
            </button>
          </div>
          <div class="app-editor-panel-title mt-2">自定义微调</div>
          <div class="app-editor-slider-row">
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
    </FloatingToolbar>

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

/* 解除 tiptap 默认 max-width: min(100%, 640px) 限制，允许全宽图片与视频占满编辑器容器 */
.vben-tiptap-content img,
.vben-tiptap-content .vben-tiptap__image {
  max-width: 100%;
}

.vben-tiptap-content video {
  max-width: 100%;
  margin: 0.75rem auto;
  border-radius: 8px;
}

/* 选中图片高亮外框 */
.vben-tiptap-content img.app-editor-image--selected {
  outline: 2px solid hsl(var(--primary)) !important;
  outline-offset: 2px !important;
}

/* 选中视频高亮外框 */
.vben-tiptap-content video.app-editor-video--selected {
  outline: 2px solid hsl(var(--primary)) !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px hsla(var(--primary) / 0.25) !important;
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

/* 编辑器多栏选中外框指示 */
.app-editor-wrapper .cms-columns.app-editor-columns--selected {
  outline: 1.5px solid hsl(var(--primary));
  outline-offset: 2px;
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
</style>
