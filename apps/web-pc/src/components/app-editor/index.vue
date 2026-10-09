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
  LayoutGrid,
} from '@vben/icons';

import { NodeSelection, TextSelection } from '@tiptap/pm/state';

import { VbenTiptap } from '@vben/plugins/tiptap';

import { upload as uploadFile } from '#/api';

import { createEditorExtensions } from './extensions';
import FloatingToolbar from './floating-toolbar.vue';

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
});

const emit = defineEmits(['update:value', 'update:modelValue', 'change']);

const content = ref(props.modelValue ?? props.value ?? '');
const editorInstance = ref(null);
const editorContainerRef = ref(null);
const sectionFloatingRef = ref(null);
const imageFloatingRef = ref(null);

const isEditable = computed(() => !props.disabled);

async function uploadImage(file) {
  const result = await uploadFile(file, {});
  if (typeof result === 'string') {
    return result;
  }
  return result?.url ?? result?.default ?? '';
}

provide('appEditor:upload', uploadImage);

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
// ProseMirror DOM 查找函数
// ---------------------------------------------------------------------------

function findImageNodeAndPos(view, imgEl) {
  if (!view || !imgEl) return null;
  try {
    let pos = view.posAtDOM(imgEl, 0);
    let node = view.state.doc.nodeAt(pos);
    if (node?.type?.name === 'image') {
      return { pos, node };
    }
    if (pos > 0) {
      node = view.state.doc.nodeAt(pos - 1);
      if (node?.type?.name === 'image') {
        return { pos: pos - 1, node };
      }
    }
    const rect = imgEl.getBoundingClientRect();
    const coord = view.posAtCoords({
      left: rect.left + rect.width / 2,
      top: rect.top + rect.height / 2,
    });
    if (coord && typeof coord.pos === 'number') {
      node = view.state.doc.nodeAt(coord.pos);
      if (node?.type?.name === 'image') {
        return { pos: coord.pos, node };
      }
      if (coord.pos > 0) {
        node = view.state.doc.nodeAt(coord.pos - 1);
        if (node?.type?.name === 'image') {
          return { pos: coord.pos - 1, node };
        }
      }
    }
    let matched = null;
    view.state.doc.descendants((n, p) => {
      if (matched) return false;
      if (n.type?.name === 'image') {
        const dom = view.nodeDOM(p);
        if (dom === imgEl || dom?.contains?.(imgEl)) {
          matched = { pos: p, node: n };
          return false;
        }
      }
      return true;
    });
    if (matched) return matched;
  } catch (err) {
    console.warn('[app-editor] findImageNodeAndPos error:', err);
  }
  return null;
}

function findSectionNodeAndPos(view, sectionEl) {
  if (!view || !sectionEl) return null;
  try {
    let matched = null;
    view.state.doc.descendants((node, pos) => {
      if (matched) return false;
      if (node.type?.name === 'section') {
        const dom = view.nodeDOM(pos);
        if (dom === sectionEl) {
          matched = { pos, node };
          return false;
        }
      }
      return true;
    });
    if (matched) return matched;

    const posInside = view.posAtDOM(sectionEl, 0);
    const $pos = view.state.doc.resolve(posInside);
    for (let d = $pos.depth; d > 0; d -= 1) {
      const node = $pos.node(d);
      if (node.type?.name === 'section') {
        const pos = $pos.before(d);
        const dom = view.nodeDOM(pos);
        if (dom === sectionEl) {
          return { pos, node };
        }
      }
    }
  } catch (err) {
    console.warn('[app-editor] findSectionNodeAndPos error:', err);
  }
  return null;
}

// ---------------------------------------------------------------------------
// 悬浮框显目标 Section 与徽标（135 模式：仅单框指示，不阻断文本编辑）
// ---------------------------------------------------------------------------

const hoveredSectionEl = ref(null);
const badgeVisible = ref(false);
const badgeCoords = ref({ left: 0, top: 0 });
const isBadgeHovered = ref(false);

function getContentContainerEl() {
  return (
    editorContainerRef.value?.querySelector('.vben-tiptap-content') ||
    editorContainerRef.value?.querySelector('.vben-tiptap')
  );
}

function updateBadgePosition(sectionEl) {
  if (!sectionEl || !sectionEl.isConnected || !editorContainerRef.value) {
    badgeVisible.value = false;
    return;
  }
  const rect = sectionEl.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    badgeVisible.value = false;
    return;
  }
  const editorEl = getContentContainerEl();
  const editorRect = editorEl?.getBoundingClientRect();

  if (editorRect) {
    if (rect.bottom < editorRect.top || rect.top > editorRect.bottom) {
      badgeVisible.value = false;
      return;
    }
  }

  const left = Math.max(editorRect ? editorRect.left + 8 : 8, rect.left + 2);
  let top = rect.top - 24;
  if (editorRect && top < editorRect.top + 4) {
    top = rect.top + 4;
  }
  badgeCoords.value = { left: Math.round(left), top: Math.round(top) };
  badgeVisible.value = true;
}

function setHoveredSection(el) {
  if (hoveredSectionEl.value === el) return;
  if (hoveredSectionEl.value) {
    hoveredSectionEl.value.classList.remove('app-editor-section--hover');
  }
  hoveredSectionEl.value = el;
  if (el && selectedTarget.value?.el !== el && isEditable.value) {
    el.classList.add('app-editor-section--hover');
    updateBadgePosition(el);
  } else {
    badgeVisible.value = false;
  }
}

// ---------------------------------------------------------------------------
// 单选体系（不支持同时选中多个 section 进行设置，全局单例工具条）
// ---------------------------------------------------------------------------

const selectedTarget = ref(null);
// 结构: { type: 'image' | 'section', el, pos, node, parentSectionEl }

function updateActiveFloating() {
  nextTick(() => {
    if (selectedTarget.value?.type === 'section') {
      sectionFloatingRef.value?.updatePosition();
    } else if (selectedTarget.value?.type === 'image') {
      imageFloatingRef.value?.updatePosition();
    }
  });
}

function clearSelection() {
  if (selectedTarget.value) {
    selectedTarget.value.el.classList.remove(
      'app-editor-section--selected',
      'app-editor-image--selected',
    );
    selectedTarget.value = null;
  }
  activePanel.value = null;
  handleVisible.value = false;
}

function selectSection(sectionEl) {
  if (!sectionEl || !editorInstance.value || !isEditable.value) return;
  clearSelection();

  const found = findSectionNodeAndPos(editorInstance.value.view, sectionEl);
  if (!found) return;

  try {
    const sel = NodeSelection.create(editorInstance.value.state.doc, found.pos);
    editorInstance.value.view.dispatch(
      editorInstance.value.state.tr.setSelection(sel),
    );
  } catch {}

  sectionEl.classList.add('app-editor-section--selected');
  selectedTarget.value = {
    type: 'section',
    el: sectionEl,
    pos: found.pos,
    node: found.node,
  };

  badgeVisible.value = false;
  if (hoveredSectionEl.value) {
    hoveredSectionEl.value.classList.remove('app-editor-section--hover');
  }
  updateActiveFloating();
}

function selectImage(imgEl) {
  if (!imgEl || !editorInstance.value || !isEditable.value) return;
  clearSelection();

  const found = findImageNodeAndPos(editorInstance.value.view, imgEl);
  if (!found) return;

  try {
    const sel = NodeSelection.create(editorInstance.value.state.doc, found.pos);
    editorInstance.value.view.dispatch(
      editorInstance.value.state.tr.setSelection(sel),
    );
  } catch {}

  imgEl.classList.add('app-editor-image--selected');
  const parentSectionEl = imgEl.closest('section');

  selectedTarget.value = {
    type: 'image',
    el: imgEl,
    pos: found.pos,
    node: found.node,
    parentSectionEl,
  };

  sliderValue.value = getCurrentImagePercent();
  badgeVisible.value = false;
  if (hoveredSectionEl.value) {
    hoveredSectionEl.value.classList.remove('app-editor-section--hover');
  }
  updateActiveFloating();
  nextTick(() => {
    updateHandlePosition();
  });
}

// ---------------------------------------------------------------------------
// 图片工具栏与尺寸/对齐/换图/删除
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
 * 计算图片相对于所在父级排版容器（Containing Block）的内容宽度基准
 * 杜绝将整个编辑器视口作为基准导致的百分比虚标与松手塌陷
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

  // 若无显式百分比或像素宽度，按其当前渲染宽度与所在容器宽度的真实比例推导
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
  if (!selectedTarget.value || selectedTarget.value.type !== 'image') return;
  const { pos } = selectedTarget.value;
  const editor = editorInstance.value;
  if (!editor) return;

  const clamped = Math.max(5, Math.min(100, Math.round(percent)));
  const widthVal = clamped >= 100 ? '100%' : `${clamped}%`;

  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'image') return;

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
  if (!selectedTarget.value || selectedTarget.value.type !== 'image') return;
  const { pos } = selectedTarget.value;
  const editor = editorInstance.value;
  if (!editor) return;

  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'image') return;

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

function pickImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file);
      if (!url || !selectedTarget.value) return;
      const { pos } = selectedTarget.value;
      const editor = editorInstance.value;
      const node = editor.state.doc.nodeAt(pos);
      if (node) {
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
      console.error('[app-editor] 换图失败:', err);
    }
  });
  input.click();
}

function deleteSelectedImage() {
  if (!selectedTarget.value || selectedTarget.value.type !== 'image') return;
  const { pos } = selectedTarget.value;
  const editor = editorInstance.value;
  if (!editor) return;
  const tr = editor.state.tr.delete(pos, pos + 1);
  editor.view.dispatch(tr);
  clearSelection();
}

function jumpToParentSection() {
  if (!selectedTarget.value?.parentSectionEl) return;
  selectSection(selectedTarget.value.parentSectionEl);
}

// 图片右下角拖拽调宽手柄
function updateHandlePosition() {
  if (selectedTarget.value?.type !== 'image' || !selectedTarget.value.el) {
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
// 排版块工具栏（前空行/后空行/复制/删除）
// ---------------------------------------------------------------------------

function insertParagraphBeforeSection() {
  if (!selectedTarget.value || selectedTarget.value.type !== 'section') return;
  const { pos } = selectedTarget.value;
  const editor = editorInstance.value;
  if (!editor) return;
  const p = editor.schema.nodes.paragraph.create();
  const tr = editor.state.tr.insert(pos, p);
  tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  editor.view.dispatch(tr);
  editor.view.focus();
}

function insertParagraphAfterSection() {
  if (!selectedTarget.value || selectedTarget.value.type !== 'section') return;
  const { pos, node } = selectedTarget.value;
  const editor = editorInstance.value;
  if (!editor) return;
  const p = editor.schema.nodes.paragraph.create();
  const insertPos = pos + node.nodeSize;
  const tr = editor.state.tr.insert(insertPos, p);
  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
  editor.view.dispatch(tr);
  editor.view.focus();
}

function duplicateSection() {
  if (!selectedTarget.value || selectedTarget.value.type !== 'section') return;
  const { pos, node } = selectedTarget.value;
  const editor = editorInstance.value;
  if (!editor) return;
  const insertPos = pos + node.nodeSize;
  const tr = editor.state.tr.insert(insertPos, node);
  editor.view.dispatch(tr);
  editor.view.focus();
}

function deleteSelectedSection() {
  if (!selectedTarget.value || selectedTarget.value.type !== 'section') return;
  const { pos, node } = selectedTarget.value;
  const editor = editorInstance.value;
  if (!editor) return;
  const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
  editor.view.dispatch(tr);
  clearSelection();
}

// ---------------------------------------------------------------------------
// DOM 事件绑定（事件委托：悬浮框显、点击聚焦、文本编辑零打扰）
// ---------------------------------------------------------------------------

let boundContentEl = null;

function onContentMouseMove(event) {
  // 鼠标拖拽选区或正在拖拽手柄时，绝不进行悬浮计算，保证拖拽选中文本顺畅
  if (event.buttons !== 0 || isDraggingHandle.value) {
    return;
  }

  // 若当前编辑器存在非空文本选区，隐藏悬浮徽标，不干扰选中文本
  if (editorInstance.value) {
    const { empty } = editorInstance.value.state.selection;
    if (!empty) {
      setHoveredSection(null);
      return;
    }
  }

  const target = event.target;
  if (
    target.closest('.app-editor-floating') ||
    target.closest('.app-editor-section-badge') ||
    target.closest('.app-editor-resize-handle')
  ) {
    return;
  }
  const section = target.closest('section');
  if (section && boundContentEl?.contains(section)) {
    setHoveredSection(section);
  } else {
    setHoveredSection(null);
  }
}

function onContentMouseLeave() {
  if (!isBadgeHovered.value) {
    setHoveredSection(null);
  }
}

function onContentClick(event) {
  const target = event.target;
  if (
    target.closest('.app-editor-floating') ||
    target.closest('.app-editor-section-badge') ||
    target.closest('.app-editor-resize-handle')
  ) {
    return;
  }

  // 1. 明确点击图片：选中图片并弹出图片工具栏
  if (target.tagName === 'IMG') {
    event.stopPropagation();
    selectImage(target);
    return;
  }

  // 2. 点击常规内容（文本段落、标题、排版块内部文本等）：
  // 严禁拦截 click 或强制将整个 section 设为 NodeSelection，
  // 仅在之前已打开浮层时关闭浮层，将事件完全放行给 ProseMirror 进行原生光标与文本选区处理
  if (selectedTarget.value) {
    clearSelection();
  }
}

function bindEditorDOM() {
  const contentEl = getContentContainerEl();
  if (!contentEl || boundContentEl === contentEl) return;
  boundContentEl = contentEl;

  contentEl.addEventListener('mousemove', onContentMouseMove);
  contentEl.addEventListener('mouseleave', onContentMouseLeave);
  contentEl.addEventListener('click', onContentClick);
}

function unbindEditorDOM() {
  if (boundContentEl) {
    boundContentEl.removeEventListener('mousemove', onContentMouseMove);
    boundContentEl.removeEventListener('mouseleave', onContentMouseLeave);
    boundContentEl.removeEventListener('click', onContentClick);
    boundContentEl = null;
  }
}

function onScrollOrResize() {
  if (hoveredSectionEl.value) {
    updateBadgePosition(hoveredSectionEl.value);
  }
  if (selectedTarget.value?.type === 'image') {
    updateHandlePosition();
  }
  updateActiveFloating();
}

function onEditorReady(editor) {
  editorInstance.value = editor;
  nextTick(() => {
    bindEditorDOM();
  });
}

const extensions = createEditorExtensions({
  placeholder: props.placeholder,
  upload: uploadImage,
  onEditorReady,
});

watch(
  () => props.value,
  (newValue) => {
    if (newValue !== undefined && newValue !== content.value) {
      content.value = newValue;
    }
  },
);

watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue !== undefined && newValue !== content.value) {
      content.value = newValue;
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
  nextTick(() => {
    bindEditorDOM();
  });
});

onBeforeUnmount(() => {
  unbindEditorDOM();
  window.removeEventListener('scroll', onScrollOrResize, true);
  window.removeEventListener('resize', onScrollOrResize);
});
</script>

<template>
  <div ref="editorContainerRef" class="app-editor-tiptap">
    <div v-if="label" class="mb-2 text-sm text-gray-700">{{ label }}</div>
    <VbenTiptap
      v-model="content"
      :editable="!disabled"
      :placeholder="placeholder"
      :min-height="minHeight"
      :max-height="maxHeight"
      :toolbar="toolbar"
      :previewable="previewable"
      :extensions="extensions"
      @change="onChange"
    />

    <!-- 悬浮排版块徽标（135 模式：鼠标悬浮时在目标 section 左上角指示，点击即可选中） -->
    <Teleport to="body">
      <div
        v-if="badgeVisible && !selectedTarget"
        class="app-editor-section-badge"
        :style="{
          left: `${badgeCoords.left}px`,
          top: `${badgeCoords.top}px`,
        }"
        contenteditable="false"
        title="点击选中该排版块"
        @mouseenter="isBadgeHovered = true"
        @mouseleave="isBadgeHovered = false"
        @mousedown.stop.prevent
        @click.stop="selectSection(hoveredSectionEl)"
      >
        <LayoutGrid class="size-3" />
        <span>排版块</span>
      </div>

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
    </Teleport>

    <!-- 排版块公用浮动工具条 -->
    <FloatingToolbar
      v-if="selectedTarget?.type === 'section'"
      ref="sectionFloatingRef"
      :visible="true"
      :target="selectedTarget?.el"
      placement="right"
      :editor="editorInstance"
      @close="clearSelection"
    >
      <template #header>
        <div class="app-editor-floating__header">
          <span class="app-editor-tag">
            <LayoutGrid class="size-3" />
            <span>排版块</span>
          </span>
        </div>
      </template>

      <button
        class="app-editor-btn"
        title="在上方插入空白段落"
        type="button"
        @click="insertParagraphBeforeSection"
      >
        <ArrowUp class="size-3.5" />
        <span class="app-editor-btn-text">前空行</span>
      </button>
      <span class="app-editor-divider"></span>

      <button
        class="app-editor-btn"
        title="在下方插入空白段落"
        type="button"
        @click="insertParagraphAfterSection"
      >
        <ArrowDown class="size-3.5" />
        <span class="app-editor-btn-text">后空行</span>
      </button>
      <span class="app-editor-divider"></span>

      <button
        class="app-editor-btn"
        title="复制整块排版"
        type="button"
        @click="duplicateSection"
      >
        <Copy class="size-3.5" />
        <span class="app-editor-btn-text">复制</span>
      </button>
      <span class="app-editor-divider"></span>

      <button
        class="app-editor-btn app-editor-btn--danger"
        title="删除整块排版"
        type="button"
        @click="deleteSelectedSection"
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
    </FloatingToolbar>

    <!-- 图片公用浮动工具条 -->
    <FloatingToolbar
      v-if="selectedTarget?.type === 'image'"
      ref="imageFloatingRef"
      :visible="true"
      :target="selectedTarget?.el"
      placement="right"
      :editor="editorInstance"
      @close="clearSelection"
    >
      <template #header>
        <div class="app-editor-floating__header">
          <span class="app-editor-tag">图片</span>
          <button
            v-if="selectedTarget?.parentSectionEl"
            class="app-editor-parent-btn"
            title="向上选中所属排版块"
            type="button"
            @click.stop="jumpToParentSection"
          >
            <LayoutGrid class="size-3" />
            <span>所属排版块</span>
          </button>
        </div>
      </template>

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

      <!-- 删除图片 -->
      <button
        class="app-editor-btn app-editor-btn--danger"
        title="删除图片"
        type="button"
        @click="deleteSelectedImage"
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

      <template #panels>
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
      </template>
    </FloatingToolbar>
  </div>
</template>

<!-- 非 scoped：编辑器内容渲染在 .vben-tiptap-content 内，需要全局样式补齐表格、图片、高亮框等 -->
<style>
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

/* 解除 tiptap 默认 max-width: min(100%, 640px) 限制，允许全宽图片占满编辑器容器 */
.vben-tiptap-content img,
.vben-tiptap-content .vben-tiptap__image {
  max-width: 100%;
}

/* 135 模式：悬浮排版块单层虚线框显（保持内部文字的光标与可编辑特性） */
.vben-tiptap-content section.app-editor-section--hover {
  outline: 1.5px dashed hsl(var(--primary) / 50%) !important;
  outline-offset: 2px !important;
}

/* 选中排版块单层虚线高亮 */
.vben-tiptap-content section.app-editor-section--selected {
  outline: 2px dashed hsl(var(--primary)) !important;
  outline-offset: 3px !important;
  border-radius: 4px;
}

/* 选中图片高亮外框 */
.vben-tiptap-content img.app-editor-image--selected {
  outline: 2px solid hsl(var(--primary)) !important;
  outline-offset: 2px !important;
}

/* 悬浮 Section 指示徽标 */
.app-editor-section-badge {
  position: fixed;
  z-index: 9998;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 500;
  color: #ffffff;
  background: hsl(var(--primary));
  border-radius: 4px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 25%);
  cursor: pointer;
  user-select: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.app-editor-section-badge:hover {
  filter: brightness(1.1);
  transform: scale(1.04);
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
</style>
