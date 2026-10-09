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
  // 目标 DOM 元素，例如 img、section 等
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

  // 若元素本身没有宽高（如 display: contents 或 0 尺寸容器），尝试查找内部首个可见子元素定位
  if (targetRect.width === 0 && targetRect.height === 0) {
    const visibleChild = el.querySelector(':scope > *:not(style):not(script)');
    if (visibleChild) {
      targetRect = visibleChild.getBoundingClientRect();
    }
  }

  // 若仍无法获取有效尺寸，隐藏浮层，坚决不降级到屏幕 (0, 0) 左上角
  if (targetRect.width === 0 && targetRect.height === 0) {
    coords.value = { ...coords.value, visible: false };
    return;
  }

  const editorEl =
    el.closest('.vben-tiptap-content') ||
    el.closest('.vben-tiptap') ||
    document.querySelector('.vben-tiptap-content') ||
    document.querySelector('.vben-tiptap');
  const editorRect = editorEl?.getBoundingClientRect();

  // 滚动超出可见区检测：目标完全滚出编辑器可见区时隐藏
  if (editorRect) {
    if (
      targetRect.bottom < editorRect.top ||
      targetRect.top > editorRect.bottom
    ) {
      coords.value = { ...coords.value, visible: false };
      return;
    }
  }
  if (targetRect.bottom < 0 || targetRect.top > window.innerHeight) {
    coords.value = { ...coords.value, visible: false };
    return;
  }

  const floatingEl = floatingRef.value;
  const toolbarWidth = floatingEl?.offsetWidth || 180;
  const toolbarHeight = floatingEl?.offsetHeight || 38;

  const containerRight = editorRect ? editorRect.right : window.innerWidth;
  const containerLeft = editorRect ? editorRect.left : 0;
  const rightSpace = containerRight - targetRect.right;
  const leftSpace = targetRect.left - containerLeft;

  let left;
  let top;

  if (props.placement === 'right') {
    // 优先右侧外侧停靠（0 遮挡，方便动态观察调节）
    if (rightSpace >= toolbarWidth + 12) {
      left = targetRect.right + 10;
      top = targetRect.top;
    } else if (leftSpace >= toolbarWidth + 12) {
      // 右侧不足但左侧充足，停靠在左侧外侧
      left = targetRect.left - toolbarWidth - 10;
      top = targetRect.top;
    } else {
      // 左右均不足（全宽大图/排版块），停靠于右上角上方
      const topSpace = targetRect.top - (editorRect ? editorRect.top : 0);
      if (topSpace >= toolbarHeight + 10) {
        top = targetRect.top - toolbarHeight - 8;
      } else {
        top = targetRect.top + 8;
      }
      left = Math.max(containerLeft + 8, containerRight - toolbarWidth - 12);
    }
  } else {
    // 顶部优先模式
    top = targetRect.top - toolbarHeight - 8;
    left = targetRect.left + targetRect.width / 2 - toolbarWidth / 2;
  }

  // 严格的边界 clamp 防护，杜绝超出编辑器或屏幕边界
  const minTop = Math.max(8, editorRect ? editorRect.top + 8 : 8);
  const maxTop = Math.min(
    window.innerHeight - toolbarHeight - 8,
    editorRect
      ? editorRect.bottom - toolbarHeight - 8
      : window.innerHeight - toolbarHeight - 8,
  );
  if (maxTop >= minTop) {
    top = Math.max(minTop, Math.min(maxTop, top));
  }

  const minLeft = Math.max(8, containerLeft + 8);
  const maxLeft = Math.min(
    window.innerWidth - toolbarWidth - 8,
    containerRight - toolbarWidth - 8,
  );
  if (maxLeft >= minLeft) {
    left = Math.max(minLeft, Math.min(maxLeft, left));
  }

  // 防御性校验：若计算结果非有限数值，不显示
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
  () => props.visible,
  (visible) => {
    if (!visible) return;
    nextTick(() => {
      updatePosition();
    });
  },
  { immediate: true },
);

function onGlobalClick(event) {
  if (!props.visible) return;
  const floatingEl = floatingRef.value;
  const targetEl = resolveTargetEl();
  if (
    floatingEl &&
    !floatingEl.contains(event.target) &&
    targetEl &&
    !targetEl.contains(event.target) &&
    !event.target.closest('.app-editor-floating') &&
    !event.target.closest('.app-editor-section-badge') &&
    !event.target.closest('.app-editor-resize-handle')
  ) {
    emit('close');
  }
}

onMounted(() => {
  window.addEventListener('scroll', updatePosition, true);
  window.addEventListener('resize', updatePosition);
  document.addEventListener('mousedown', onGlobalClick);
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updatePosition, true);
  window.removeEventListener('resize', updatePosition);
  document.removeEventListener('mousedown', onGlobalClick);
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
      <!-- 主工具条卡片 -->
      <div class="app-editor-floating__toolbar">
        <slot name="header"></slot>
        <div class="app-editor-floating__actions">
          <slot></slot>
        </div>
      </div>

      <!-- 二级调节面板区（尺寸、对齐等） -->
      <div class="app-editor-floating__panels">
        <slot name="panels"></slot>
      </div>
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
  margin-top: 6px;
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
