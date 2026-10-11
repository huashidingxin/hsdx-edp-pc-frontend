<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { TextSelection } from '@tiptap/pm/state';

import MediaLibraryModal from './media-library-modal.vue';
import { collectHeadingOutline } from './doc-actions';
import { findPluginKey, getFindState } from './find-plugin';
import { DEFAULT_THUMBNAIL_PROCESS, defaultFetchMedia, stripThumbnailParam } from './media-api';

const props = defineProps({
  editor: {
    type: Object,
    default: null,
  },
  editable: {
    type: Boolean,
    default: true,
  },
  previewable: {
    type: Boolean,
    default: true,
  },
  isFullscreen: {
    type: Boolean,
    default: false,
  },
  isSourceMode: {
    type: Boolean,
    default: false,
  },
  uploadImage: {
    type: Function,
    default: null,
  },
  uploadFile: {
    type: Function,
    default: null,
  },
  fetchMedia: {
    type: [Function, Boolean],
    default: () => defaultFetchMedia,
  },
  thumbnailProcess: {
    type: [String, Function, Boolean],
    default: DEFAULT_THUMBNAIL_PROCESS,
  },
  externalAssetsCount: {
    type: Number,
    default: 0,
  },
  // 校对：问题列表、检查中状态、是否配置了校对服务（均由 index.vue 下发）
  proofreadIssues: {
    type: Array,
    default: () => [],
  },
  proofreading: {
    type: Boolean,
    default: false,
  },
  proofreadConfigured: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'toggle-fullscreen',
  'open-preview',
  'toggle-source-mode',
  'open-external-assets',
  'run-proofread',
  'locate-proofread',
  'apply-proofread',
  'dismiss-proofread',
  'clear-proofread',
]);

// ---------------------------------------------------------------------------
// 激活状态与当前光标属性跟踪
// ---------------------------------------------------------------------------

const activeMarks = ref({
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  subscript: false,
  superscript: false,
  code: false,
  link: false,
});

const activeNodes = ref({
  bulletList: false,
  orderedList: false,
  taskList: false,
  blockquote: false,
  codeBlock: false,
  details: false,
  table: false,
  columns: false,
});

const canHistory = ref({
  undo: false,
  redo: false,
});

const currentHeading = ref('p');
const currentFontFamily = ref('');
const currentFontSize = ref('');
const currentLineHeight = ref('');
const currentTextColor = ref('');
const currentHighlightColor = ref('');
const currentAlign = ref('left');

// 弹层菜单控制（单开互斥）
const activeDropdown = ref(null);
const activeDropdownPanelRef = ref(null);
const toolbarContainerRef = ref(null);

const isActionDisabled = computed(
  () => !props.editable || props.isSourceMode,
);

const hasMediaLibrary = computed(() => {
  const fn = props.fetchMedia !== undefined ? props.fetchMedia : defaultFetchMedia;
  if (fn === false || fn === null) return false;
  return typeof fn === 'function';
});

const isMediaModalOpen = ref(false);
const mediaModalType = ref('image');

function openMediaLibrary(type = 'image') {
  if (!hasMediaLibrary.value) return;
  mediaModalType.value = type;
  isMediaModalOpen.value = true;
  closeDropdown();
}

function onImageButtonClick() {
  if (hasMediaLibrary.value) {
    openMediaLibrary('image');
  } else {
    toggleDropdown('image');
  }
}

function onVideoButtonClick() {
  if (hasMediaLibrary.value) {
    openMediaLibrary('video');
  } else {
    toggleDropdown('video');
  }
}

function onMediaSelect(item) {
  if (!item?.url || !props.editor) return;
  const insertUrl = stripThumbnailParam(item.url);
  const isVideo =
    mediaModalType.value === 'video' ||
    item.type === 'video' ||
    item.mime?.startsWith('video/') ||
    ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(
      item.extension?.toLowerCase(),
    );

  if (isVideo) {
    props.editor.chain().focus().setVideo({ src: insertUrl }).run();
  } else {
    props.editor.chain().focus().setImage({ src: insertUrl }).run();
  }
  isMediaModalOpen.value = false;
  updateEditorState();
}

// ---------------------------------------------------------------------------
// 智能自适应弹层边界防碰撞调整
// ---------------------------------------------------------------------------

function updatePanelPosition() {
  nextTick(() => {
    const panel = activeDropdownPanelRef.value;
    if (!panel) return;

    // 先重置 transform 以便测得元素真实的初始布局坐标
    panel.style.transform = '';

    const rect = panel.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const margin = 8;

    // 获取工具栏外层容器边界
    const container = toolbarContainerRef.value;
    const containerRect = container ? container.getBoundingClientRect() : null;

    // 计算左右安全边界（优先尊重工具栏容器边界，若容器自身过窄则回退到视口安全边界）
    let minLeft = margin;
    let maxRight = viewportWidth - margin;

    if (containerRect && containerRect.width >= rect.width) {
      minLeft = Math.max(margin, containerRect.left + 4);
      maxRight = Math.min(viewportWidth - margin, containerRect.right - 4);
    }

    if (rect.right > maxRight) {
      const overflow = rect.right - maxRight;
      panel.style.transform = `translateX(-${overflow}px)`;
    } else if (rect.left < minLeft) {
      const underflow = minLeft - rect.left;
      panel.style.transform = `translateX(${underflow}px)`;
    }
  });
}

function toggleDropdown(name) {
  if (isActionDisabled.value) return;
  if (activeDropdown.value === name) {
    activeDropdown.value = null;
  } else {
    activeDropdown.value = name;
    updatePanelPosition();
  }
}

function closeDropdown() {
  activeDropdown.value = null;
}

// ---------------------------------------------------------------------------
// 字体与样式提取辅助函数
// ---------------------------------------------------------------------------

function matchKnownFontFamily(fontFamilyStr) {
  if (!fontFamilyStr) return '';
  const lower = fontFamilyStr.toLowerCase();
  if (lower.includes('microsoft yahei') || lower.includes('微软雅黑'))
    return 'Microsoft YaHei';
  if (lower.includes('simsun') || lower.includes('宋体')) return 'SimSun';
  if (lower.includes('simhei') || lower.includes('黑体')) return 'SimHei';
  if (lower.includes('kaiti') || lower.includes('楷体')) return 'KaiTi';
  if (lower.includes('fangsong') || lower.includes('仿宋')) return 'FangSong';
  if (lower.includes('arial')) return 'Arial';
  if (lower.includes('times new roman')) return 'Times New Roman';
  if (lower.includes('georgia')) return 'Georgia';
  return '';
}

function normalizeLineHeight(ratioStr) {
  const ratio = Number.parseFloat(ratioStr);
  if (Number.isNaN(ratio)) return '';
  if (Math.abs(ratio - 1) < 0.15) return '1';
  if (Math.abs(ratio - 1.25) < 0.15) return '1.25';
  if (Math.abs(ratio - 1.5) < 0.15) return '1.5';
  if (Math.abs(ratio - 1.75) < 0.15) return '1.75';
  if (Math.abs(ratio - 2) < 0.15) return '2';
  if (Math.abs(ratio - 2.5) < 0.15) return '2.5';
  if (Math.abs(ratio - 3) < 0.15) return '3';
  return ratioStr;
}

function updateEditorState() {
  const editor = props.editor;
  if (!editor || editor.isDestroyed) return;

  canHistory.value = {
    undo: Boolean(editor.can().undo?.()),
    redo: Boolean(editor.can().redo?.()),
  };

  activeMarks.value = {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    subscript: editor.isActive('subscript'),
    superscript: editor.isActive('superscript'),
    code: editor.isActive('code'),
    link: editor.isActive('link'),
  };

  activeNodes.value = {
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    taskList: editor.isActive('taskList'),
    blockquote: editor.isActive('blockquote'),
    codeBlock: editor.isActive('codeBlock'),
    details: editor.isActive('details'),
    table: editor.isActive('table'),
    columns: Boolean(editor.isActive('columns') || editor.isActive('column')),
  };

  // 标题检测
  let headingVal = 'p';
  for (let i = 1; i <= 6; i += 1) {
    if (editor.isActive('heading', { level: i })) {
      headingVal = `h${i}`;
      break;
    }
  }
  currentHeading.value = headingVal;

  // 1. 尝试从显式 textStyle 获取
  const textAttrs = editor.getAttributes('textStyle') || {};
  let fontSize = textAttrs.fontSize || '';
  let fontFamily = textAttrs.fontFamily || '';
  let lineHeight = textAttrs.lineHeight || '';
  let textColor = textAttrs.color || '';

  // 2. 如果未显式设置，则从选区所在 DOM 节点的计算样式提取真实渲染值
  try {
    const view = editor.view;
    let targetEl = null;
    if (view?.dom) {
      const { from } = editor.state.selection;
      const domAtPos = view.domAtPos(from);
      targetEl = domAtPos?.node;
      if (targetEl?.nodeType === 3) {
        targetEl = targetEl.parentElement;
      }
    }
    if (!targetEl && window.getSelection) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        targetEl = sel.getRangeAt(0).startContainer;
        if (targetEl?.nodeType === 3) {
          targetEl = targetEl.parentElement;
        }
      }
    }
    if (targetEl && targetEl.nodeType === 1) {
      const style = window.getComputedStyle(targetEl);
      if (!fontSize && style?.fontSize) {
        const px = Math.round(Number.parseFloat(style.fontSize));
        if (px) fontSize = `${px}px`;
      }
      if (!fontFamily && style?.fontFamily) {
        fontFamily = matchKnownFontFamily(style.fontFamily);
      }
      if (!lineHeight && style?.lineHeight) {
        const lhVal = Number.parseFloat(style.lineHeight);
        const fsVal = Number.parseFloat(style.fontSize);
        if (lhVal && fsVal) {
          const ratio = (lhVal / fsVal).toFixed(2);
          lineHeight = normalizeLineHeight(ratio);
        }
      }
      if (!textColor && style?.color) {
        textColor = style.color;
      }
    }
  } catch {}

  currentFontFamily.value = fontFamily;
  currentFontSize.value = fontSize;
  currentLineHeight.value = lineHeight;
  currentTextColor.value = textColor;

  const highlightAttrs = editor.getAttributes('highlight') || {};
  currentHighlightColor.value = highlightAttrs.color || '';

  // 对齐
  if (editor.isActive({ textAlign: 'center' })) {
    currentAlign.value = 'center';
  } else if (editor.isActive({ textAlign: 'right' })) {
    currentAlign.value = 'right';
  } else if (editor.isActive({ textAlign: 'justify' })) {
    currentAlign.value = 'justify';
  } else {
    currentAlign.value = 'left';
  }
}

function onNativeSelectionChange() {
  if (props.editor && !props.editor.isDestroyed && props.editor.isFocused) {
    updateEditorState();
  }
}

function onWindowResize() {
  if (activeDropdown.value) {
    updatePanelPosition();
  }
}

watch(activeDropdown, (newVal) => {
  if (newVal) {
    updatePanelPosition();
  }
});

watch(
  () => props.editor,
  (editor, oldEditor) => {
    if (oldEditor && !oldEditor.isDestroyed) {
      oldEditor.off('transaction', updateEditorState);
      oldEditor.off('selectionUpdate', updateEditorState);
      oldEditor.off('focus', updateEditorState);
    }
    if (editor && !editor.isDestroyed) {
      editor.on('transaction', updateEditorState);
      editor.on('selectionUpdate', updateEditorState);
      editor.on('focus', updateEditorState);
      updateEditorState();
    }
  },
  { immediate: true },
);

// ---------------------------------------------------------------------------
// 预设选项定义
// ---------------------------------------------------------------------------

const HEADING_OPTIONS = [
  { label: '正文', value: 'p' },
  { label: '一级标题 (H1)', value: 'h1' },
  { label: '二级标题 (H2)', value: 'h2' },
  { label: '三级标题 (H3)', value: 'h3' },
  { label: '四级标题 (H4)', value: 'h4' },
  { label: '五级标题 (H5)', value: 'h5' },
  { label: '六级标题 (H6)', value: 'h6' },
];

const FONT_FAMILY_OPTIONS = [
  { label: '默认字体', value: '' },
  { label: '微软雅黑', value: 'Microsoft YaHei' },
  { label: '宋体', value: 'SimSun' },
  { label: '黑体', value: 'SimHei' },
  { label: '楷体', value: 'KaiTi' },
  { label: '仿宋', value: 'FangSong' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Georgia', value: 'Georgia' },
];

const FONT_SIZE_OPTIONS = [
  { label: '默认', value: '' },
  { label: '12px 小字', value: '12px' },
  { label: '14px 正文', value: '14px' },
  { label: '16px 正文大', value: '16px' },
  { label: '18px 小标题', value: '18px' },
  { label: '20px 二级标题', value: '20px' },
  { label: '24px 一级标题', value: '24px' },
  { label: '28px 特大', value: '28px' },
  { label: '32px 封面标题', value: '32px' },
  { label: '36px 巨幅', value: '36px' },
];

const LINE_HEIGHT_OPTIONS = [
  { label: '默认', value: '' },
  { label: '1.0 单倍', value: '1' },
  { label: '1.25 紧凑', value: '1.25' },
  { label: '1.5 推荐', value: '1.5' },
  { label: '1.75 舒适', value: '1.75' },
  { label: '2.0 双倍', value: '2' },
  { label: '2.5 宽松', value: '2.5' },
  { label: '3.0 极大', value: '3' },
];

const COLOR_PRESETS = [
  '#000000',
  '#4b5563',
  '#9ca3af',
  '#dc2626',
  '#ea580c',
  '#d97706',
  '#16a34a',
  '#0d9488',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ffffff',
];

const HIGHLIGHT_PRESETS = [
  '#fef08a',
  '#bbf7d0',
  '#bae6fd',
  '#fbcfe8',
  '#e9d5ff',
  '#fed7aa',
];

// ---------------------------------------------------------------------------
// 工具栏动作执行
// ---------------------------------------------------------------------------

function setHeading(val) {
  if (!props.editor) return;
  if (val === 'p') {
    props.editor.chain().focus().setParagraph().run();
  } else {
    const level = Number.parseInt(val.replace('h', ''), 10);
    props.editor.chain().focus().toggleHeading({ level }).run();
  }
  closeDropdown();
  updateEditorState();
}

function setFontFamily(val) {
  if (!props.editor) return;
  if (!val) {
    props.editor.chain().focus().unsetFontFamily().run();
  } else {
    props.editor.chain().focus().setFontFamily(val).run();
  }
  closeDropdown();
  updateEditorState();
}

function setFontSize(val) {
  if (!props.editor) return;
  if (!val) {
    props.editor.chain().focus().unsetFontSize().run();
  } else {
    props.editor.chain().focus().setFontSize(val).run();
  }
  closeDropdown();
  updateEditorState();
}

function setLineHeight(val) {
  if (!props.editor) return;
  if (!val) {
    props.editor.chain().focus().unsetLineHeight().run();
  } else {
    props.editor.chain().focus().setLineHeight(val).run();
  }
  closeDropdown();
  updateEditorState();
}

function setTextColor(color) {
  if (!props.editor) return;
  if (!color) {
    props.editor.chain().focus().unsetColor().run();
  } else {
    props.editor.chain().focus().setColor(color).run();
  }
  closeDropdown();
  updateEditorState();
}

function setHighlight(color) {
  if (!props.editor) return;
  if (!color) {
    props.editor.chain().focus().unsetHighlight().run();
  } else {
    props.editor.chain().focus().setHighlight({ color }).run();
  }
  closeDropdown();
  updateEditorState();
}

function setAlign(side) {
  if (!props.editor) return;
  props.editor.chain().focus().setTextAlign(side).run();
  updateEditorState();
}

// ---------------------------------------------------------------------------
// 表格套件操作
// ---------------------------------------------------------------------------

function insertTable(rows = 3, cols = 3) {
  if (!props.editor) return;
  props.editor
    .chain()
    .focus()
    .insertTable({ rows, cols, withHeaderRow: true })
    .run();
  closeDropdown();
  updateEditorState();
}

function runTableCommand(cmd) {
  if (!props.editor) return;
  const chain = props.editor.chain().focus();
  if (cmd === 'addRowBefore') chain.addRowBefore().run();
  else if (cmd === 'addRowAfter') chain.addRowAfter().run();
  else if (cmd === 'deleteRow') chain.deleteRow().run();
  else if (cmd === 'addColumnBefore') chain.addColumnBefore().run();
  else if (cmd === 'addColumnAfter') chain.addColumnAfter().run();
  else if (cmd === 'deleteColumn') chain.deleteColumn().run();
  else if (cmd === 'mergeCells') chain.mergeCells().run();
  else if (cmd === 'splitCell') chain.splitCell().run();
  else if (cmd === 'deleteTable') chain.deleteTable().run();
  closeDropdown();
  updateEditorState();
}

// ---------------------------------------------------------------------------
// CMS 多栏布局（Columns）操作
// ---------------------------------------------------------------------------

function insertColumns(cols = 2, layout = '1:1') {
  if (!props.editor) return;
  props.editor.chain().focus().insertColumns({ cols, layout, keepContent: true }).run();
  closeDropdown();
  updateEditorState();
}

function runColumnsCommand(cmd, arg) {
  if (!props.editor) return;
  const chain = props.editor.chain().focus();
  if (cmd === 'setLayout') chain.setColumnsLayout(arg).run();
  else if (cmd === 'addColumn') chain.addColumn('after').run();
  else if (cmd === 'deleteColumn') chain.deleteCurrentColumn().run();
  else if (cmd === 'moveLeft') chain.moveColumnLeft().run();
  else if (cmd === 'moveRight') chain.moveColumnRight().run();
  else if (cmd === 'unsetColumns') chain.unsetColumns().run();
  else if (cmd === 'deleteColumns') chain.deleteColumns().run();
  else if (cmd === 'insertBefore') chain.insertParagraphBeforeColumns().run();
  else if (cmd === 'insertAfter') chain.insertParagraphAfterColumns().run();
  closeDropdown();
  updateEditorState();
}

// ---------------------------------------------------------------------------
// 文档大纲（标题跳转；读取官方 table-of-contents storage，无则回退遍历）
// ---------------------------------------------------------------------------

const tocItems = ref([]);

function collectTocItems() {
  const editor = props.editor;
  if (!editor || editor.isDestroyed) {
    tocItems.value = [];
    return;
  }
  tocItems.value = collectHeadingOutline(editor.state.doc);
}

function openTocDropdown() {
  if (isActionDisabled.value) return;
  if (activeDropdown.value === 'toc') {
    closeDropdown();
    return;
  }
  collectTocItems();
  activeDropdown.value = 'toc';
  updatePanelPosition();
}

function jumpToHeading(pos) {
  if (!props.editor) return;
  selectRangeInEditor(props.editor, pos + 1, pos + 1, true);
  closeDropdown();
  updateEditorState();
}

// ---------------------------------------------------------------------------
// 查找替换（视图 decorations，不污染输出）
// ---------------------------------------------------------------------------

const findQuery = ref('');
const findReplaceText = ref('');

function openFindDropdown() {
  if (isActionDisabled.value) return;
  if (activeDropdown.value === 'find') {
    closeDropdown();
    return;
  }
  activeDropdown.value = 'find';
  updatePanelPosition();
}

function commitFindQuery() {
  if (!props.editor) return;
  props.editor.view.dispatch(
    props.editor.state.tr.setMeta(findPluginKey, {
      type: 'setQuery',
      query: findQuery.value,
    }),
  );
  jumpFindMatch(0, true);
}

function currentFindState() {
  try {
    return getFindState(props.editor);
  } catch {
    return { query: '', matches: [], index: 0 };
  }
}

function jumpFindMatch(delta, absolute = false) {
  const editor = props.editor;
  if (!editor) return;
  const st = currentFindState();
  if (!st.matches || st.matches.length === 0) return;
  const next = absolute ? delta : st.index + delta;
  editor.view.dispatch(
    editor.state.tr.setMeta(findPluginKey, { type: 'setIndex', index: next }),
  );
  const cur = currentFindState();
  const m = cur.matches[cur.index];
  if (m) selectRangeInEditor(editor, m.from, m.to);
}

function selectRangeInEditor(editor, from, to, collapse = false) {
  try {
    const doc = editor.state.doc;
    const maxPos = Math.max(0, doc.content.size - 1);
    const safeFrom = Math.max(0, Math.min(from, maxPos));
    const safeTo = collapse ? safeFrom : Math.max(safeFrom, Math.min(to, doc.content.size));
    const sel = collapse
      ? TextSelection.near(doc.resolve(safeFrom))
      : TextSelection.create(doc, safeFrom, safeTo);
    editor.view.dispatch(editor.state.tr.setSelection(sel));
    editor.commands.focus();
    editor.commands.scrollIntoView();
  } catch {
    try {
      editor.chain().focus().run();
    } catch {}
  }
}

function replaceCurrentFindMatch() {
  const editor = props.editor;
  if (!editor) return;
  const st = currentFindState();
  const m = st.matches?.[st.index];
  if (!m) return;
  try {
    const node = editor.schema.text(findReplaceText.value ?? '');
    const tr = editor.state.tr.replaceWith(m.from, m.to, node);
    editor.view.dispatch(tr);
    updateEditorState();
  } catch {}
}

function replaceAllFindMatches() {
  const editor = props.editor;
  if (!editor) return;
  const st = currentFindState();
  if (!st.matches || st.matches.length === 0) return;
  try {
    const tr = editor.state.tr;
    st.matches
      .toSorted((a, b) => b.from - a.from)
      .forEach((m) => {
        tr.replaceWith(m.from, m.to, editor.schema.text(findReplaceText.value ?? ''));
      });
    editor.view.dispatch(tr);
    updateEditorState();
  } catch {}
}

function clearFind() {
  findQuery.value = '';
  findReplaceText.value = '';
  if (props.editor) {
    props.editor.view.dispatch(
      props.editor.state.tr.setMeta(findPluginKey, { type: 'clear' }),
    );
  }
}

// ---------------------------------------------------------------------------
// 超链接操作
// ---------------------------------------------------------------------------

const linkInputUrl = ref('');

function openLinkDropdown() {
  if (activeDropdown.value === 'link') {
    closeDropdown();
    return;
  }
  const prevUrl = props.editor?.getAttributes('link')?.href || '';
  linkInputUrl.value = prevUrl;
  activeDropdown.value = 'link';
  updatePanelPosition();
}

function confirmLink() {
  if (!props.editor) return;
  const url = linkInputUrl.value.trim();
  if (!url) {
    props.editor.chain().focus().unsetLink().run();
  } else {
    props.editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url })
      .run();
  }
  closeDropdown();
  updateEditorState();
}

function removeLink() {
  if (!props.editor) return;
  props.editor.chain().focus().unsetLink().run();
  closeDropdown();
  updateEditorState();
}

// ---------------------------------------------------------------------------
// 图片上传与外链（选择上传 + URL）
// ---------------------------------------------------------------------------

const imageFileInputRef = ref(null);
const imageUrlInput = ref('');
const isUploadingImage = ref(false);

function triggerImageFileSelect() {
  imageFileInputRef.value?.click();
}

async function onImageFileChange(event) {
  const file = event.target?.files?.[0];
  if (!file || !props.editor) return;
  isUploadingImage.value = true;
  try {
    const uploadFn = props.uploadImage || props.uploadFile;
    if (typeof uploadFn === 'function') {
      const url = await uploadFn(file);
      if (url) {
        props.editor.chain().focus().setImage({ src: url }).run();
      }
    }
  } catch (err) {
    console.error('[app-editor] 本地图片上传失败:', err);
  } finally {
    isUploadingImage.value = false;
    if (imageFileInputRef.value) imageFileInputRef.value.value = '';
    closeDropdown();
    updateEditorState();
  }
}

function confirmImageUrl() {
  if (!props.editor) return;
  const url = imageUrlInput.value.trim();
  if (url) {
    props.editor.chain().focus().setImage({ src: url }).run();
  }
  imageUrlInput.value = '';
  closeDropdown();
  updateEditorState();
}

// ---------------------------------------------------------------------------
// 视频上传与外链（选择上传 + URL 原生播放）
// ---------------------------------------------------------------------------

const videoFileInputRef = ref(null);
const videoUrlInput = ref('');
const isUploadingVideo = ref(false);

function triggerVideoFileSelect() {
  videoFileInputRef.value?.click();
}

async function onVideoFileChange(event) {
  const file = event.target?.files?.[0];
  if (!file || !props.editor) return;
  isUploadingVideo.value = true;
  try {
    const uploadFn = props.uploadFile || props.uploadImage;
    if (typeof uploadFn === 'function') {
      const url = await uploadFn(file);
      if (url) {
        props.editor.chain().focus().setVideo({ src: url }).run();
      }
    }
  } catch (err) {
    console.error('[app-editor] 本地视频上传失败:', err);
  } finally {
    isUploadingVideo.value = false;
    if (videoFileInputRef.value) videoFileInputRef.value.value = '';
    closeDropdown();
    updateEditorState();
  }
}

function confirmVideoUrl() {
  if (!props.editor) return;
  const url = videoUrlInput.value.trim();
  if (url) {
    props.editor.chain().focus().setVideo({ src: url }).run();
  }
  videoUrlInput.value = '';
  closeDropdown();
  updateEditorState();
}

// ---------------------------------------------------------------------------
// 全局点击遮罩与事件监听
// ---------------------------------------------------------------------------

function onDocumentClick(event) {
  if (!toolbarContainerRef.value) return;
  if (!toolbarContainerRef.value.contains(event.target)) {
    closeDropdown();
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('selectionchange', onNativeSelectionChange);
  window.addEventListener('resize', onWindowResize);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('selectionchange', onNativeSelectionChange);
  window.removeEventListener('resize', onWindowResize);
});

// 计算当前段落按钮文本
const headingLabel = computed(() => {
  const found = HEADING_OPTIONS.find((o) => o.value === currentHeading.value);
  return found?.label || '正文';
});

// 计算当前字体按钮文本
const fontFamilyLabel = computed(() => {
  const found = FONT_FAMILY_OPTIONS.find(
    (o) => o.value === currentFontFamily.value,
  );
  return found ? (found.value ? found.label : '字体') : currentFontFamily.value || '字体';
});

// 计算当前字号按钮文本
const fontSizeLabel = computed(() => {
  return currentFontSize.value || '字号';
});

// 计算当前行高按钮文本
const lineHeightLabel = computed(() => {
  return currentLineHeight.value ? `${currentLineHeight.value}x` : '行高';
});
</script>

<template>
  <div
    ref="toolbarContainerRef"
    class="app-editor-toolbar sticky top-0 z-20 flex flex-wrap items-center gap-1 rounded-t-xl border-b border-border bg-card p-1.5 text-xs text-foreground select-none"
  >
    <!-- 彻底隐藏原生文件选择器 -->
    <input
      ref="imageFileInputRef"
      type="file"
      accept="image/*"
      style="display: none !important;"
      @change="onImageFileChange"
    />
    <input
      ref="videoFileInputRef"
      type="file"
      accept="video/*"
      style="display: none !important;"
      @change="onVideoFileChange"
    />

    <!-- 组 1：历史操作与格式清除 -->
    <div class="flex items-center gap-0.5">
      <button
        class="toolbar-btn"
        :disabled="!canHistory.undo || isActionDisabled"
        title="撤销 (Ctrl+Z)"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().undo().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :disabled="!canHistory.redo || isActionDisabled"
        title="重做 (Ctrl+Y)"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().redo().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :disabled="isActionDisabled"
        title="清除格式"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().clearNodes().unsetAllMarks().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path d="M4 7V4h16v3" />
          <path d="M5 20h6" />
          <path d="M13 4 8 20" />
          <path d="m15 15 5 5m0-5-5 5" />
        </svg>
      </button>
    </div>

    <div class="toolbar-sep"></div>

    <!-- 组 2：段落、字体、字号、行高下拉（左侧定位，右侧展开） -->
    <div class="flex items-center gap-1">
      <!-- 段落/标题 -->
      <div class="relative">
        <button
          class="toolbar-select-btn min-w-[70px]"
          :disabled="isActionDisabled"
          type="button"
          @mousedown.prevent
          @click="toggleDropdown('heading')"
        >
          <span class="truncate">{{ headingLabel }}</span>
          <svg
            class="size-3 opacity-60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="m6 9 6 6 6-6"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
        </button>
        <div
          v-if="activeDropdown === 'heading'"
          ref="activeDropdownPanelRef"
          class="dropdown-panel left-0 min-w-[130px]"
        >
          <button
            v-for="item in HEADING_OPTIONS"
            :key="item.value"
            class="dropdown-item"
            :class="{ 'is-active': currentHeading === item.value }"
            type="button"
            @mousedown.prevent
            @click="setHeading(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <!-- 字体 -->
      <div class="relative">
        <button
          class="toolbar-select-btn min-w-[75px]"
          :disabled="isActionDisabled"
          type="button"
          @mousedown.prevent
          @click="toggleDropdown('fontFamily')"
        >
          <span class="truncate">{{ fontFamilyLabel }}</span>
          <svg
            class="size-3 opacity-60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="m6 9 6 6 6-6"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
        </button>
        <div
          v-if="activeDropdown === 'fontFamily'"
          ref="activeDropdownPanelRef"
          class="dropdown-panel left-0 min-w-[140px]"
        >
          <button
            v-for="item in FONT_FAMILY_OPTIONS"
            :key="item.value"
            class="dropdown-item"
            :class="{
              'is-active':
                currentFontFamily === item.value ||
                (!currentFontFamily && !item.value),
            }"
            :style="{ fontFamily: item.value || 'inherit' }"
            type="button"
            @mousedown.prevent
            @click="setFontFamily(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <!-- 字号 -->
      <div class="relative">
        <button
          class="toolbar-select-btn min-w-[62px]"
          :disabled="isActionDisabled"
          type="button"
          @mousedown.prevent
          @click="toggleDropdown('fontSize')"
        >
          <span class="truncate">{{ fontSizeLabel }}</span>
          <svg
            class="size-3 opacity-60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="m6 9 6 6 6-6"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
        </button>
        <div
          v-if="activeDropdown === 'fontSize'"
          ref="activeDropdownPanelRef"
          class="dropdown-panel left-0 min-w-[120px]"
        >
          <button
            v-for="item in FONT_SIZE_OPTIONS"
            :key="item.value"
            class="dropdown-item"
            :class="{
              'is-active':
                currentFontSize === item.value ||
                (!currentFontSize && !item.value),
            }"
            type="button"
            @mousedown.prevent
            @click="setFontSize(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <!-- 行高 -->
      <div class="relative">
        <button
          class="toolbar-select-btn min-w-[62px]"
          :disabled="isActionDisabled"
          type="button"
          @mousedown.prevent
          @click="toggleDropdown('lineHeight')"
        >
          <span class="truncate">{{ lineHeightLabel }}</span>
          <svg
            class="size-3 opacity-60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="m6 9 6 6 6-6"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
        </button>
        <div
          v-if="activeDropdown === 'lineHeight'"
          ref="activeDropdownPanelRef"
          class="dropdown-panel left-0 min-w-[110px]"
        >
          <button
            v-for="item in LINE_HEIGHT_OPTIONS"
            :key="item.value"
            class="dropdown-item"
            :class="{
              'is-active':
                currentLineHeight === item.value ||
                (!currentLineHeight && !item.value),
            }"
            type="button"
            @mousedown.prevent
            @click="setLineHeight(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="toolbar-sep"></div>

    <!-- 组 3：基础文本样式（加粗、斜体、下划线、删除线、上下标、行内代码） -->
    <div class="flex items-center gap-0.5">
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeMarks.bold }"
        :disabled="isActionDisabled"
        title="加粗 (Ctrl+B)"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleBold().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path d="M6 12h9a4 4 0 0 1 0 8H6v-8zm0 0V4h8a4 4 0 0 1 0 8H6z" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeMarks.italic }"
        :disabled="isActionDisabled"
        title="斜体 (Ctrl+I)"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleItalic().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <line x1="19" x2="10" y1="4" y2="4" />
          <line x1="14" x2="5" y1="20" y2="20" />
          <line x1="15" x2="9" y1="4" y2="20" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeMarks.underline }"
        :disabled="isActionDisabled"
        title="下划线 (Ctrl+U)"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleUnderline().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3" />
          <line x1="4" x2="20" y1="21" y2="21" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeMarks.strike }"
        :disabled="isActionDisabled"
        title="删除线"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleStrike().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path d="M16 4H9a3 3 0 0 0-2.83 4" />
          <path d="M14 12a4 4 0 0 1 0 8H6" />
          <line x1="4" x2="20" y1="12" y2="12" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeMarks.superscript }"
        :disabled="isActionDisabled"
        title="上标 (Ctrl+.)"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleSuperscript().run()"
      >
        <span class="font-serif text-[11px] font-bold">X<sup>2</sup></span>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeMarks.subscript }"
        :disabled="isActionDisabled"
        title="下标 (Ctrl+,)"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleSubscript().run()"
      >
        <span class="font-serif text-[11px] font-bold">X<sub>2</sub></span>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeMarks.code }"
        :disabled="isActionDisabled"
        title="行内代码"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleCode().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>
    </div>

    <div class="toolbar-sep"></div>

    <!-- 组 4：色彩与高亮（靠右定位，向左展开，杜绝右侧遮挡） -->
    <div class="flex items-center gap-0.5">
      <!-- 字体颜色 -->
      <div class="relative">
        <button
          class="toolbar-btn relative"
          :disabled="isActionDisabled"
          title="文本颜色"
          type="button"
          @mousedown.prevent
          @click="toggleDropdown('textColor')"
        >
          <span class="font-bold">A</span>
          <span
            class="absolute bottom-1 left-1.5 right-1.5 h-0.5 rounded-full"
            :style="{ backgroundColor: currentTextColor || '#000000' }"
          ></span>
        </button>
        <div
          v-if="activeDropdown === 'textColor'"
          ref="activeDropdownPanelRef"
          class="dropdown-panel right-0 w-44 p-2"
        >
          <div class="mb-1 text-[11px] text-muted-foreground font-medium">文本颜色</div>
          <div class="grid grid-cols-6 gap-1.5">
            <button
              v-for="color in COLOR_PRESETS"
              :key="color"
              class="size-5 rounded-md border border-border transition-transform hover:scale-110"
              :style="{ backgroundColor: color }"
              type="button"
              @mousedown.prevent
              @click="setTextColor(color)"
            ></button>
          </div>
          <button
            class="mt-2 w-full rounded border border-border py-1 text-center text-[11px] hover:bg-muted"
            type="button"
            @mousedown.prevent
            @click="setTextColor('')"
          >
            恢复默认
          </button>
        </div>
      </div>

      <!-- 背景高亮（靠右向左展开，防止右侧切断） -->
      <div class="relative">
        <button
          class="toolbar-btn relative"
          :disabled="isActionDisabled"
          title="背景高亮"
          type="button"
          @mousedown.prevent
          @click="toggleDropdown('highlight')"
        >
          <svg
            class="size-3.5"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path
              d="m9 11-6 6v3h3l6-6m-3-3 7-7a2 2 0 0 1 2.83 0l2.17 2.17a2 2 0 0 1 0 2.83l-7 7m-5-5 5 5"
            />
          </svg>
          <span
            class="absolute bottom-1 left-1.5 right-1.5 h-0.5 rounded-full"
            :style="{
              backgroundColor: currentHighlightColor || 'transparent',
            }"
          ></span>
        </button>
        <div
          v-if="activeDropdown === 'highlight'"
          ref="activeDropdownPanelRef"
          class="dropdown-panel right-0 w-44 p-2"
        >
          <div class="mb-1 text-[11px] text-muted-foreground font-medium">高亮颜色</div>
          <div class="grid grid-cols-6 gap-1.5">
            <button
              v-for="color in HIGHLIGHT_PRESETS"
              :key="color"
              class="size-5 rounded-md border border-border transition-transform hover:scale-110"
              :style="{ backgroundColor: color }"
              type="button"
              @mousedown.prevent
              @click="setHighlight(color)"
            ></button>
          </div>
          <button
            class="mt-2 w-full rounded border border-border py-1 text-center text-[11px] hover:bg-muted"
            type="button"
            @mousedown.prevent
            @click="setHighlight('')"
          >
            清除高亮
          </button>
        </div>
      </div>
    </div>

    <div class="toolbar-sep"></div>

    <!-- 组 5：对齐方式 -->
    <div class="flex items-center gap-0.5">
      <button
        class="toolbar-btn"
        :class="{ 'is-active': currentAlign === 'left' }"
        :disabled="isActionDisabled"
        title="左对齐"
        type="button"
        @mousedown.prevent
        @click="setAlign('left')"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <line x1="21" x2="3" y1="6" y2="6" />
          <line x1="15" x2="3" y1="12" y2="12" />
          <line x1="17" x2="3" y1="18" y2="18" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': currentAlign === 'center' }"
        :disabled="isActionDisabled"
        title="居中对齐"
        type="button"
        @mousedown.prevent
        @click="setAlign('center')"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <line x1="21" x2="3" y1="6" y2="6" />
          <line x1="17" x2="7" y1="12" y2="12" />
          <line x1="19" x2="5" y1="18" y2="18" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': currentAlign === 'right' }"
        :disabled="isActionDisabled"
        title="右对齐"
        type="button"
        @mousedown.prevent
        @click="setAlign('right')"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <line x1="21" x2="3" y1="6" y2="6" />
          <line x1="21" x2="9" y1="12" y2="12" />
          <line x1="21" x2="7" y1="18" y2="18" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': currentAlign === 'justify' }"
        :disabled="isActionDisabled"
        title="两端对齐"
        type="button"
        @mousedown.prevent
        @click="setAlign('justify')"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <line x1="21" x2="3" y1="6" y2="6" />
          <line x1="21" x2="3" y1="12" y2="12" />
          <line x1="21" x2="3" y1="18" y2="18" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :disabled="isActionDisabled"
        title="首行缩进（Tab）"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().setTextIndent().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <line x1="3" x2="21" y1="6" y2="6" />
          <line x1="9" x2="21" y1="12" y2="12" />
          <line x1="9" x2="21" y1="18" y2="18" />
          <polyline points="9 6 13 6 13 18 9 18" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :disabled="isActionDisabled"
        title="取消首行缩进（Shift+Tab）"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().unsetTextIndent().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <line x1="3" x2="21" y1="6" y2="6" />
          <line x1="3" x2="15" y1="12" y2="12" />
          <line x1="3" x2="15" y1="18" y2="18" />
          <polyline points="15 6 11 6 11 18 15 18" />
        </svg>
      </button>
    </div>

    <div class="toolbar-sep"></div>

    <!-- 组 6：列表、引用、代码块与分割线 -->
    <div class="flex items-center gap-0.5">
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeNodes.bulletList }"
        :disabled="isActionDisabled"
        title="无序列表"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleBulletList().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <line x1="8" x2="21" y1="6" y2="6" />
          <line x1="8" x2="21" y1="12" y2="12" />
          <line x1="8" x2="21" y1="18" y2="18" />
          <line x1="3" x2="3.01" y1="6" y2="6" />
          <line x1="3" x2="3.01" y1="12" y2="12" />
          <line x1="3" x2="3.01" y1="18" y2="18" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeNodes.orderedList }"
        :disabled="isActionDisabled"
        title="有序列表"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleOrderedList().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <line x1="10" x2="21" y1="6" y2="6" />
          <line x1="10" x2="21" y1="12" y2="12" />
          <line x1="10" x2="21" y1="18" y2="18" />
          <path d="M4 6h1v4" />
          <path d="M4 10h2" />
          <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeNodes.taskList }"
        :disabled="isActionDisabled"
        title="待办清单"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleTaskList().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <rect height="5" rx="1" width="5" x="3" y="4" />
          <path d="m8.5 6.5 5.5 5.5" />
          <line x1="10" x2="21" y1="12" y2="12" />
          <rect height="5" rx="1" width="5" x="3" y="15" />
          <line x1="10" x2="16" y1="17.5" y2="17.5" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeNodes.blockquote }"
        :disabled="isActionDisabled"
        title="引用"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleBlockquote().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path
            d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"
          />
          <path
            d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"
          />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeNodes.codeBlock }"
        :disabled="isActionDisabled"
        title="代码块"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().toggleCodeBlock().run()"
      >
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
          <path d="m10 10-2 2 2 2" />
          <path d="m14 10 2 2-2 2" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeNodes.details }"
        :disabled="isActionDisabled"
        title="折叠块（问答/收起）"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().setDetails().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path d="m7 15 5 5 5-5" />
          <path d="m7 9 5-5 5 5" />
        </svg>
      </button>
      <button
        class="toolbar-btn"
        :disabled="isActionDisabled"
        title="分割线"
        type="button"
        @mousedown.prevent
        @click="editor?.chain().focus().setHorizontalRule().run()"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <line x1="5" x2="19" y1="12" y2="12" />
        </svg>
      </button>
    </div>

    <div class="toolbar-sep"></div>

    <!-- 组 7：表格套件 (Table，右侧向左展开) -->
    <div class="relative">
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeNodes.table }"
        :disabled="isActionDisabled"
        title="表格工具"
        type="button"
        @mousedown.prevent
        @click="toggleDropdown('table')"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path d="M12 3v18" />
          <rect height="18" rx="2" width="18" x="3" y="3" />
          <path d="M3 9h18" />
          <path d="M3 15h18" />
        </svg>
      </button>
      <div
        v-if="activeDropdown === 'table'"
        ref="activeDropdownPanelRef"
        class="dropdown-panel right-0 min-w-[150px] p-1.5"
      >
        <!-- 未在表格中 -->
        <template v-if="!activeNodes.table">
          <div class="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            插入表格
          </div>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="insertTable(3, 3)"
          >
            插入 3 × 3 表格
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="insertTable(4, 4)"
          >
            插入 4 × 4 表格
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="insertTable(5, 5)"
          >
            插入 5 × 5 表格
          </button>
        </template>
        <!-- 已在表格中 -->
        <template v-else>
          <div class="px-2 py-1 text-[11px] font-semibold text-primary">
            当前表格操作
          </div>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runTableCommand('addRowBefore')"
          >
            在上方添加行
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runTableCommand('addRowAfter')"
          >
            在下方添加行
          </button>
          <button
            class="dropdown-item text-red-500 hover:text-red-600"
            type="button"
            @mousedown.prevent
            @click="runTableCommand('deleteRow')"
          >
            删除当前行
          </button>
          <div class="my-1 border-t border-border"></div>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runTableCommand('addColumnBefore')"
          >
            在左侧添加列
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runTableCommand('addColumnAfter')"
          >
            在右侧添加列
          </button>
          <button
            class="dropdown-item text-red-500 hover:text-red-600"
            type="button"
            @mousedown.prevent
            @click="runTableCommand('deleteColumn')"
          >
            删除当前列
          </button>
          <div class="my-1 border-t border-border"></div>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runTableCommand('mergeCells')"
          >
            合并单元格
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runTableCommand('splitCell')"
          >
            拆分单元格
          </button>
          <button
            class="dropdown-item text-red-600 font-semibold"
            type="button"
            @mousedown.prevent
            @click="runTableCommand('deleteTable')"
          >
            删除整个表格
          </button>
        </template>
      </div>
    </div>

    <!-- 组 7.5：分栏布局 (Columns) -->
    <div class="relative">
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeNodes.columns }"
        :disabled="isActionDisabled"
        title="分栏布局"
        type="button"
        @mousedown.prevent
        @click="toggleDropdown('columns')"
      >
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
      </button>
      <div
        v-if="activeDropdown === 'columns'"
        ref="activeDropdownPanelRef"
        class="dropdown-panel right-0 min-w-[170px] p-1.5"
      >
        <!-- 未在分栏中：显示插入预设 -->
        <template v-if="!activeNodes.columns">
          <div class="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            插入分栏布局
          </div>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="insertColumns(2, '1:1')"
          >
            两栏 (1 : 1 等宽)
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="insertColumns(2, '1:2')"
          >
            两栏 (1 : 2 左侧边栏)
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="insertColumns(2, '2:1')"
          >
            两栏 (2 : 1 右侧边栏)
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="insertColumns(3, '1:1:1')"
          >
            三栏 (1 : 1 : 1 等宽)
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="insertColumns(3, '1:2:1')"
          >
            三栏 (1 : 2 : 1 居中聚焦)
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="insertColumns(4, '1:1:1:1')"
          >
            四栏 (1 : 1 : 1 : 1 等宽)
          </button>
        </template>
        <!-- 已在分栏中：显示列操作与比例调整 -->
        <template v-else>
          <div class="px-2 py-1 text-[11px] font-semibold text-primary">
            当前分栏操作
          </div>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runColumnsCommand('moveLeft')"
          >
            ← 左移此列
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runColumnsCommand('moveRight')"
          >
            → 右移此列
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runColumnsCommand('addColumn')"
          >
            + 在右侧添加列
          </button>
          <button
            class="dropdown-item text-red-500 hover:text-red-600"
            type="button"
            @mousedown.prevent
            @click="runColumnsCommand('deleteColumn')"
          >
            删除当前列
          </button>

          <div class="my-1 border-t border-border"></div>
          <div class="px-2 py-1 text-[10px] font-medium text-muted-foreground">
            快速切换比例
          </div>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runColumnsCommand('setLayout', '1:1')"
          >
            设为 1 : 1
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runColumnsCommand('setLayout', '1:2')"
          >
            设为 1 : 2
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runColumnsCommand('setLayout', '2:1')"
          >
            设为 2 : 1
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runColumnsCommand('setLayout', '1:1:1')"
          >
            设为 1 : 1 : 1
          </button>

          <div class="my-1 border-t border-border"></div>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runColumnsCommand('insertBefore')"
          >
            在分栏上方插入空行
          </button>
          <button
            class="dropdown-item"
            type="button"
            @mousedown.prevent
            @click="runColumnsCommand('insertAfter')"
          >
            在分栏下方插入空行
          </button>
          <button
            class="dropdown-item text-amber-600 font-medium"
            type="button"
            @mousedown.prevent
            @click="runColumnsCommand('unsetColumns')"
          >
            解包分栏 (保留内容)
          </button>
          <button
            class="dropdown-item text-red-600 font-semibold"
            type="button"
            @mousedown.prevent
            @click="runColumnsCommand('deleteColumns')"
          >
            删除整个分栏
          </button>
        </template>
      </div>
    </div>

    <!-- 组 7.6：文档大纲（标题跳转） -->
    <div class="relative">
      <button
        class="toolbar-btn"
        :disabled="isActionDisabled"
        title="文档大纲（点击跳转到标题）"
        type="button"
        @mousedown.prevent
        @click="openTocDropdown"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <line x1="8" x2="21" y1="6" y2="6" />
          <line x1="8" x2="21" y1="12" y2="12" />
          <line x1="8" x2="21" y1="18" y2="18" />
          <line x1="3" x2="5" y1="6" y2="6" />
          <line x1="3" x2="5" y1="12" y2="12" />
          <line x1="3" x2="5" y1="18" y2="18" />
        </svg>
      </button>
      <div
        v-if="activeDropdown === 'toc'"
        ref="activeDropdownPanelRef"
        class="dropdown-panel right-0 min-w-[220px] max-w-[320px] p-1.5"
      >
        <div class="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
          文档大纲
        </div>
        <div v-if="tocItems.length === 0" class="px-2 py-2 text-[11px] text-muted-foreground">
          暂无标题（使用 H1~H6 后在此跳转）
        </div>
        <div v-else class="max-h-64 overflow-y-auto">
          <button
            v-for="item in tocItems"
            :key="item.key"
            class="dropdown-item"
            type="button"
            :style="{ paddingLeft: `${8 + (item.level - 1) * 12}px` }"
            :title="`H${item.level}：${item.text}`"
            @mousedown.prevent
            @click="jumpToHeading(item.pos)"
          >
            <span class="truncate">H{{ item.level }} · {{ item.text }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 组 8：超链接（右侧向左展开） -->
    <div class="relative">
      <button
        class="toolbar-btn"
        :class="{ 'is-active': activeMarks.link }"
        :disabled="isActionDisabled"
        title="超链接"
        type="button"
        @mousedown.prevent
        @click="openLinkDropdown"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </button>
      <div
        v-if="activeDropdown === 'link'"
        ref="activeDropdownPanelRef"
        class="dropdown-panel right-0 w-64 p-2.5"
      >
        <div class="mb-1.5 text-[11px] font-medium text-muted-foreground">
          插入 / 编辑链接
        </div>
        <input
          v-model="linkInputUrl"
          class="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          placeholder="https://example.com"
          type="text"
          @keydown.enter.prevent="confirmLink"
        />
        <div class="mt-2 flex items-center justify-end gap-1.5">
          <button
            v-if="activeMarks.link"
            class="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-muted"
            type="button"
            @click="removeLink"
          >
            取消链接
          </button>
          <button
            class="rounded bg-primary px-2.5 py-0.5 text-xs text-primary-foreground hover:opacity-90"
            type="button"
            @click="confirmLink"
          >
            确定
          </button>
        </div>
      </div>
    </div>

    <!-- 组 8.5：查找替换（右侧向左展开） -->
    <div class="relative">
      <button
        class="toolbar-btn"
        :disabled="isActionDisabled"
        title="查找替换"
        type="button"
        @mousedown.prevent
        @click="openFindDropdown"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" x2="16.5" y1="21" y2="16.5" />
        </svg>
      </button>
      <div
        v-if="activeDropdown === 'find'"
        ref="activeDropdownPanelRef"
        class="dropdown-panel right-0 w-72 p-2.5"
      >
        <div class="mb-1.5 text-[11px] font-medium text-muted-foreground">
          查找替换
        </div>
        <input
          v-model="findQuery"
          class="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          placeholder="查找内容"
          type="text"
          @keydown.enter.prevent="commitFindQuery"
        />
        <input
          v-model="findReplaceText"
          class="mt-1.5 w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          placeholder="替换为"
          type="text"
          @keydown.enter.prevent="replaceCurrentFindMatch"
        />
        <div class="mt-2 flex items-center justify-between gap-1.5">
          <span class="text-[11px] text-muted-foreground">
            {{ currentFindState().matches.length > 0 ? `${currentFindState().index + 1} / ${currentFindState().matches.length}` : '无匹配' }}
          </span>
          <div class="flex items-center gap-1">
            <button
              class="rounded px-2 py-0.5 text-xs hover:bg-muted"
              type="button"
              @click="jumpFindMatch(-1)"
            >
              上一个
            </button>
            <button
              class="rounded px-2 py-0.5 text-xs hover:bg-muted"
              type="button"
              @click="jumpFindMatch(1)"
            >
              下一个
            </button>
            <button
              class="rounded px-2 py-0.5 text-xs hover:bg-muted"
              type="button"
              @click="replaceCurrentFindMatch"
            >
              替换
            </button>
            <button
              class="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:opacity-90"
              type="button"
              @click="replaceAllFindMatches"
            >
              全部替换
            </button>
            <button
              class="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              type="button"
              @click="clearFind"
            >
              清除
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="toolbar-sep"></div>

    <!-- 组 9：图片（右侧向左展开，杜绝右侧遮挡） -->
    <div class="relative">
      <button
        class="toolbar-btn"
        :disabled="isActionDisabled"
        :title="hasMediaLibrary ? '从媒体库选择图片' : '插入图片（支持本地文件与网络链接）'"
        type="button"
        @mousedown.prevent
        @click="onImageButtonClick"
      >
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
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      </button>
      <div
        v-if="!hasMediaLibrary && activeDropdown === 'image'"
        ref="activeDropdownPanelRef"
        class="dropdown-panel right-0 w-72 p-2.5"
      >
        <div class="mb-2 text-[11px] font-medium text-muted-foreground">
          图片上传与插入
        </div>

        <!-- 从媒体库选择图片 -->
        <button
          v-if="hasMediaLibrary"
          class="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
          type="button"
          @click="openMediaLibrary('image')"
        >
          <svg
            class="size-4 text-primary"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path
              d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"
            />
          </svg>
          <span>从媒体库选择图片</span>
        </button>

        <!-- 本地上传按钮 -->
        <button
          class="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/50 bg-primary/5 py-2 text-xs font-medium text-primary hover:bg-primary/10"
          :disabled="isUploadingImage"
          type="button"
          @click="triggerImageFileSelect"
        >
          <svg
            v-if="!isUploadingImage"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" x2="12" y1="3" y2="15" />
          </svg>
          <span v-else class="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
          <span>{{ isUploadingImage ? '正在上传图片...' : '选择本地图片上传' }}</span>
        </button>

        <div class="my-2 flex items-center gap-2">
          <div class="h-px flex-1 bg-border"></div>
          <span class="text-[10px] text-muted-foreground">或输入网络图片地址</span>
          <div class="h-px flex-1 bg-border"></div>
        </div>

        <!-- 网络链接 -->
        <div class="flex items-center gap-1.5">
          <input
            v-model="imageUrlInput"
            class="flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
            placeholder="https://.../image.png"
            type="text"
            @keydown.enter.prevent="confirmImageUrl"
          />
          <button
            class="rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:opacity-90"
            type="button"
            @click="confirmImageUrl"
          >
            插入
          </button>
        </div>
      </div>
    </div>

    <!-- 组 10：视频（右侧向左展开，杜绝右侧遮挡） -->
    <div class="relative">
      <button
        class="toolbar-btn"
        :disabled="isActionDisabled"
        :title="hasMediaLibrary ? '从媒体库选择视频' : '插入视频（支持本地文件与网络链接）'"
        type="button"
        @mousedown.prevent
        @click="onVideoButtonClick"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path
            d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"
          />
          <rect height="12" rx="2" width="14" x="2" y="6" />
        </svg>
      </button>
      <div
        v-if="!hasMediaLibrary && activeDropdown === 'video'"
        ref="activeDropdownPanelRef"
        class="dropdown-panel right-0 w-72 p-2.5"
      >
        <div class="mb-2 text-[11px] font-medium text-muted-foreground">
          视频上传与嵌入
        </div>

        <!-- 从媒体库选择视频 -->
        <button
          v-if="hasMediaLibrary"
          class="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
          type="button"
          @click="openMediaLibrary('video')"
        >
          <svg
            class="size-4 text-primary"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path
              d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"
            />
          </svg>
          <span>从媒体库选择视频</span>
        </button>

        <!-- 本地上传视频 -->
        <button
          class="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/50 bg-primary/5 py-2 text-xs font-medium text-primary hover:bg-primary/10"
          :disabled="isUploadingVideo"
          type="button"
          @click="triggerVideoFileSelect"
        >
          <svg
            v-if="!isUploadingVideo"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" x2="12" y1="3" y2="15" />
          </svg>
          <span v-else class="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
          <span>{{ isUploadingVideo ? '正在上传视频...' : '选择本地视频上传' }}</span>
        </button>

        <div class="my-2 flex items-center gap-2">
          <div class="h-px flex-1 bg-border"></div>
          <span class="text-[10px] text-muted-foreground">或输入网络视频地址</span>
          <div class="h-px flex-1 bg-border"></div>
        </div>

        <!-- 网络链接视频 -->
        <div class="flex items-center gap-1.5">
          <input
            v-model="videoUrlInput"
            class="flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
            placeholder="https://.../video.mp4"
            type="text"
            @keydown.enter.prevent="confirmVideoUrl"
          />
          <button
            class="rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:opacity-90"
            type="button"
            @click="confirmVideoUrl"
          >
            插入
          </button>
        </div>
      </div>
    </div>

    <!-- 右侧工具：HTML 源码切换、预览与全屏 -->
    <div class="ml-auto flex items-center gap-1">
      <!-- 外链检测与标注按钮 -->
      <button
        class="toolbar-btn relative"
        :class="{ '!text-amber-500 hover:bg-amber-500/10': externalAssetsCount > 0 }"
        :title="externalAssetsCount > 0 ? `检测到 ${externalAssetsCount} 个外部外链资源，点击管理与转存` : '外链检测（暂无外部资源）'"
        type="button"
        @mousedown.prevent
        @click="emit('open-external-assets')"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" x2="22" y1="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span
          v-if="externalAssetsCount > 0"
          class="absolute -top-1 -right-1 flex min-w-3.5 h-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-bold text-white shadow-xs"
        >
          {{ externalAssetsCount > 99 ? '99+' : externalAssetsCount }}
        </span>
      </button>

      <!-- 中文校对按钮（问题数徽标） -->
      <div class="relative">
        <button
          class="toolbar-btn relative"
          :class="{ '!text-violet-500 hover:bg-violet-500/10': proofreadIssues.length > 0 }"
          :title="proofreadConfigured ? (proofreadIssues.length > 0 ? `发现 ${proofreadIssues.length} 处疑似问题，点击查看` : '中文校对（暂无问题）') : '中文校对（未配置校对服务，可通过 fetch-proofread 接入）'"
          type="button"
          @mousedown.prevent
          @click="toggleDropdown('proofread')"
        >
          <svg
            class="size-3.5"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="m5 8 6 6" />
            <path d="m4 14 6-6 2-3" />
            <path d="M2 5h12" />
            <path d="M7 2h1" />
            <path d="m22 22-5-10-5 10" />
            <path d="M14 18h6" />
          </svg>
          <span
            v-if="proofreadIssues.length > 0"
            class="absolute -top-1 -right-1 flex min-w-3.5 h-3.5 items-center justify-center rounded-full bg-violet-500 px-0.5 text-[9px] font-bold text-white shadow-xs"
          >
            {{ proofreadIssues.length > 99 ? '99+' : proofreadIssues.length }}
          </span>
        </button>
        <div
          v-if="activeDropdown === 'proofread'"
          ref="activeDropdownPanelRef"
          class="dropdown-panel right-0 w-80 p-2.5"
        >
          <div class="mb-1.5 flex items-center justify-between">
            <span class="text-[11px] font-medium text-muted-foreground">中文校对</span>
            <div class="flex items-center gap-1">
              <button
                v-if="proofreadIssues.length > 0"
                class="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                type="button"
                @click="emit('clear-proofread')"
              >
                全部忽略
              </button>
              <button
                class="rounded bg-primary px-2.5 py-0.5 text-[11px] text-primary-foreground hover:opacity-90 disabled:opacity-40"
                :disabled="proofreading || isActionDisabled"
                type="button"
                @click="emit('run-proofread')"
              >
                {{ proofreading ? '检查中...' : '开始检查' }}
              </button>
            </div>
          </div>
          <div v-if="!proofreadConfigured" class="rounded bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground">
            未配置校对服务，可通过 fetch-proofread 接入中文校对接口。
          </div>
          <div v-else-if="proofreadIssues.length === 0" class="px-2 py-2 text-[11px] text-muted-foreground">
            {{ proofreading ? '正在检查全文...' : '暂无问题，点击右上开始检查。' }}
          </div>
          <div v-else class="max-h-64 space-y-1.5 overflow-y-auto">
            <div
              v-for="issue in proofreadIssues"
              :key="issue.id"
              class="rounded border border-border/70 p-2"
            >
              <div class="text-xs text-foreground">
                <span class="text-muted-foreground">“</span>{{ issue.snippet }}<span class="text-muted-foreground">”</span>
              </div>
              <div class="mt-0.5 text-[11px] text-muted-foreground">{{ issue.message }}</div>
              <div v-if="issue.suggestions?.length" class="mt-1 flex flex-wrap gap-1">
                <button
                  v-for="(sug, si) in issue.suggestions.slice(0, 3)"
                  :key="si"
                  class="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/20"
                  type="button"
                  @click="emit('apply-proofread', issue, sug)"
                >
                  改为“{{ sug }}”
                </button>
              </div>
              <div class="mt-1 flex items-center justify-end gap-1">
                <button
                  class="rounded px-1.5 py-0.5 text-[11px] text-primary hover:bg-muted"
                  type="button"
                  @click="emit('locate-proofread', issue)"
                >
                  定位
                </button>
                <button
                  class="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                  type="button"
                  @click="emit('dismiss-proofread', issue)"
                >
                  忽略
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 源代码编辑切换按钮 -->
      <button
        class="toolbar-btn"
        :class="{ 'is-active': isSourceMode }"
        :title="isSourceMode ? '退出源码，返回可视化排版' : '编辑 HTML 源代码'"
        type="button"
        @mousedown.prevent
        @click="emit('toggle-source-mode')"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </button>

      <button
        v-if="previewable"
        class="toolbar-btn"
        title="预览效果"
        type="button"
        @mousedown.prevent
        @click="emit('open-preview')"
      >
        <svg
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      <button
        class="toolbar-btn"
        :class="{ 'is-active': isFullscreen }"
        :title="isFullscreen ? '退出全屏' : '全屏编辑'"
        type="button"
        @mousedown.prevent
        @click="emit('toggle-fullscreen')"
      >
        <svg
          v-if="!isFullscreen"
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
        <svg
          v-else
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path d="M4 14h6v6" />
          <path d="M20 10h-6V4" />
          <path d="M14 10l7-7" />
          <path d="M3 21l7-7" />
        </svg>
      </button>
    </div>

    <!-- 媒体库选择弹窗 -->
    <MediaLibraryModal
      v-if="hasMediaLibrary"
      v-model:visible="isMediaModalOpen"
      :initial-type="mediaModalType"
      :fetch-media="props.fetchMedia !== undefined ? props.fetchMedia : defaultFetchMedia"
      :upload-file="props.uploadFile || props.uploadImage"
      :thumbnail-process="props.thumbnailProcess"
      @select="onMediaSelect"
    />
  </div>
</template>

<style scoped>
.app-editor-toolbar {
  min-height: 40px;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  width: 28px;
  border-radius: 4px;
  color: hsl(var(--foreground));
  transition: all 0.15s ease;
  user-select: none;
}

.toolbar-btn:hover:not(:disabled) {
  background-color: hsl(var(--muted));
}

.toolbar-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.toolbar-btn.is-active {
  background-color: hsl(var(--primary) / 15%);
  color: hsl(var(--primary));
  font-weight: 600;
}

.toolbar-select-btn {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: 28px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  font-size: 11px;
  transition: all 0.15s ease;
  cursor: pointer;
}

.toolbar-select-btn:hover:not(:disabled) {
  border-color: hsl(var(--primary));
}

.toolbar-select-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.toolbar-sep {
  height: 18px;
  width: 1px;
  margin: 0 2px;
  background-color: hsl(var(--border));
}

.dropdown-panel {
  position: absolute;
  top: 100%;
  margin-top: 4px;
  z-index: 50;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  box-shadow:
    0 10px 15px -3px rgb(0 0 0 / 12%),
    0 4px 6px -4px rgb(0 0 0 / 10%),
    0 0 0 1px hsl(var(--border));
}

.dropdown-item {
  display: flex;
  width: 100%;
  align-items: center;
  padding: 5px 8px;
  font-size: 11px;
  border-radius: 4px;
  color: hsl(var(--foreground));
  transition: background-color 0.15s ease;
  cursor: pointer;
  text-align: left;
}

.dropdown-item:hover {
  background-color: hsl(var(--muted));
}

.dropdown-item.is-active {
  background-color: hsl(var(--primary) / 15%);
  color: hsl(var(--primary));
  font-weight: 600;
}
</style>
