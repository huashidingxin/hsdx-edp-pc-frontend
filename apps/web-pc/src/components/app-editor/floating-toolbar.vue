<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  // 目标 DOM 元素，例如 img、section、columns 等
  target: {
    type: null,
    default: null,
  },
  // 停靠倾向，默认 'right'（右侧停靠不挡目标，方便直观调控）
  placement: {
    type: String,
    default: 'right',
  },
  editor: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['close']);

const floatingRef = ref(null);
const coords = ref({ left: 0, top: 0, visible: false });

function resolveTargetEl() {
  const t = props.target;
  if (!t) return null;
  if (t instanceof HTMLElement) return t;
  if (t.$el instanceof HTMLElement) return t.$el;
  return null;
}

function updatePosition() {
  if (!props.visible) {
    coords.value = { ...coords.value, visible: false };
    return;
  }
  const el = resolveTargetEl();
  if (!el || !el.isConnected) {
    coords.value = { ...coords.value, visible: false };
    return;
  }

  let targetRect = el.getBoundingClientRect();

  if (targetRect.width === 0 && targetRect.height === 0) {
    const visibleChild = el.querySelector(':scope > *:not(style):not(script)');
    if (visibleChild) {
      targetRect = visibleChild.getBoundingClientRect();
    }
  }

  if (targetRect.width === 0 && targetRect.height === 0) {
    coords.value = { ...coords.value, visible: false };
    return;
  }

  const editorEl =
    el.closest('.app-editor-wrapper') ||
    el.closest('.vben-tiptap-content') ||
    el.closest('.vben-tiptap') ||
    document.querySelector('.vben-tiptap-content') ||
    document.querySelector('.vben-tiptap');
  const editorRect = editorEl?.getBoundingClientRect();

  // 若完全超出屏幕视口则隐藏
  if (targetRect.bottom < 0 || targetRect.top > window.innerHeight) {
    coords.value = { ...coords.value, visible: false };
    return;
  }

  const floatingEl = floatingRef.value;
  const toolbarWidth = floatingEl?.offsetWidth || 320;
  const toolbarHeight = floatingEl?.offsetHeight || 44;

  const containerRight = editorRect ? editorRect.right : window.innerWidth;
  const containerLeft = editorRect ? editorRect.left : 0;
  const containerTop = editorRect ? editorRect.top : 0;
  const containerBottom = editorRect ? editorRect.bottom : window.innerHeight;

  let left = 0;
  let top = 0;

  if (props.placement === 'right') {
    const idealLeft = targetRect.right + 12;
    // 右侧有空间停靠在右侧
    if (idealLeft + toolbarWidth <= containerRight - 8 && idealLeft + toolbarWidth <= window.innerWidth - 8) {
      left = idealLeft;
      top = targetRect.top;
    } else {
      // 右侧不足（如全宽多栏布局或右侧内容）
      const topSpace = targetRect.top - containerTop;
      if (topSpace >= toolbarHeight + 10) {
        // 上方空间充足停靠在顶部上方靠右
        top = targetRect.top - toolbarHeight - 8;
      } else {
        // 上方空间不足（如分栏处于编辑器最顶端），停靠在元素顶端内侧靠右
        top = targetRect.top + 8;
      }
      left = Math.min(
        targetRect.right - toolbarWidth,
        containerRight - toolbarWidth - 12,
      );
    }
  } else {
    top = targetRect.top - toolbarHeight - 8;
    left = targetRect.left + targetRect.width / 2 - toolbarWidth / 2;
  }

  // 严格边界安全保护：确保工具条不超出编辑器容器与视口边界
  const minLeft = Math.max(8, containerLeft + 8);
  const maxLeft = Math.min(
    window.innerWidth - toolbarWidth - 8,
    containerRight - toolbarWidth - 8,
  );
  if (maxLeft >= minLeft) {
    left = Math.max(minLeft, Math.min(maxLeft, left));
  } else {
    left = Math.max(8, containerLeft + 8);
  }

  const minTop = Math.max(8, containerTop + 8);
  const maxTop = Math.min(
    window.innerHeight - toolbarHeight - 8,
    containerBottom - toolbarHeight - 8,
  );
  if (maxTop >= minTop) {
    top = Math.max(minTop, Math.min(maxTop, top));
  } else {
    top = Math.max(8, targetRect.top);
  }

  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    coords.value = { ...coords.value, visible: false };
    return;
  }

  coords.value = {
    left: Math.round(left),
    top: Math.round(top),
    visible: true,
  };
}

const floatingStyle = computed(() => ({
  display: coords.value.visible ? 'flex' : 'none',
  left: `${coords.value.left}px`,
  top: `${coords.value.top}px`,
}));

watch(
  [() => props.visible, () => props.target],
  ([visible, target]) => {
    if (!visible || !target) {
      coords.value = { ...coords.value, visible: false };
      return;
    }
    nextTick(() => {
      updatePosition();
      requestAnimationFrame(() => {
        updatePosition();
      });
    });
  },
  { immediate: true },
);

function onGlobalPointerDown(event) {
  if (!props.visible) return;
  const floatingEl = floatingRef.value;
  const targetEl = resolveTargetEl();
  if (floatingEl && floatingEl.contains(event.target)) return;
  if (targetEl && targetEl.contains(event.target)) return;
  if (
    event.target.closest('.app-editor-floating') ||
    event.target.closest('.app-editor-resize-handle') ||
    event.target.closest('.ant-modal') ||
    event.target.closest('.ant-popover')
  ) {
    return;
  }
  // 若点击发生在编辑器区域内部，由编辑器内部 onContentClick 统一处理切换与清除，避免全局误杀
  if (
    event.target.closest('.app-editor-wrapper') ||
    event.target.closest('.app-editor-tiptap') ||
    event.target.closest('.vben-tiptap')
  ) {
    return;
  }

  emit('close');
}

onMounted(() => {
  window.addEventListener('scroll', updatePosition, true);
  window.addEventListener('resize', updatePosition);
  document.addEventListener('pointerdown', onGlobalPointerDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updatePosition, true);
  window.removeEventListener('resize', updatePosition);
  document.removeEventListener('pointerdown', onGlobalPointerDown);
});

defineExpose({
  updatePosition,
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="floatingRef"
      class="app-editor-floating"
      :style="floatingStyle"
      contenteditable="false"
      @mousedown.prevent
    >
      <slot></slot>
    </div>
  </Teleport>
</template>

<style>
/* 公用浮动工具弹层（挂载在 body 顶层，全编辑器通用） */
.app-editor-floating {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  pointer-events: auto;
  user-select: none;
}

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

.app-editor-parent-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.app-editor-parent-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
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
</style>
