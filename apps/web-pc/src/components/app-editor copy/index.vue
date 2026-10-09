<template>
  <div class="app-editor-tiptap">
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
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

import { VbenTiptap } from '@vben/plugins/tiptap';

import { upload as uploadFile } from '#/api';

import { createEditorExtensions } from './extensions';

const props = defineProps({
  // 兼容 AppField 的 :value / @update:value 用法
  value: {
    type: String,
    default: undefined,
  },
  // 兼容 v-model 用法
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

// 内部内容，桥接 VbenTiptap 的 v-model
const content = ref(props.modelValue ?? props.value ?? '');

// 图片上传：复用项目统一的上传接口，返回图片 URL
async function uploadImage(file) {
  const result = await uploadFile(file, {});
  if (typeof result === 'string') {
    return result;
  }
  return result?.url ?? result?.default ?? '';
}

// 自定义扩展集合（与公共插件包解耦，支持富文本解析与带格式粘贴）
const extensions = createEditorExtensions({
  placeholder: props.placeholder,
  upload: uploadImage,
});

// 外部 -> 内部：同步 value
watch(
  () => props.value,
  (newValue) => {
    if (newValue !== undefined && newValue !== content.value) {
      content.value = newValue;
    }
  },
);

// 外部 -> 内部：同步 modelValue
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue !== undefined && newValue !== content.value) {
      content.value = newValue;
    }
  },
);

// 内部 -> 外部：同时派发两种事件，兼容不同用法
watch(content, (newValue) => {
  emit('update:value', newValue);
  emit('update:modelValue', newValue);
});

function onChange(payload) {
  emit('change', payload);
}
</script>

<!-- 非 scoped：编辑器内容渲染在 .vben-tiptap-content 内，需要全局样式补齐表格等元素 -->
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

/* 让粘贴的内联字号在标题上也生效（标题默认样式不使用 !important，内联样式优先） */
.vben-tiptap-content p {
  margin: 0.25rem 0;
}
</style>
