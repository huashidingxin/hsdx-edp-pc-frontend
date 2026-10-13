<script setup>
/**
 * CrudRecordMeta - 详情底部操作容器左侧的记录元信息（创建时间 / 最后更新时间）
 *
 * 横向单行精简展示：短标签（创建/更新）+ 去秒（2026-09-23 23:51:01 → 23:51），
 * 一行放不下时省略号截断，悬浮 title 保留完整信息；无值（新增场景）时整个组件不渲染。
 */
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  // 页面声明的表单字段（可选）：悬浮 title 里复用页面自定义的时间戳标签
  fields: { type: Array, default: () => [] },
});

const META_FIELDS = ['created_at', 'updated_at'];
const META_SHORT_LABELS = {
  created_at: '创建',
  updated_at: '更新',
};
const META_FULL_LABELS = {
  created_at: '创建时间',
  updated_at: '最后更新时间',
};

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

/** 去掉秒位，分钟精度足够底部概览使用 */
function shortValue(value) {
  return typeof value === 'string'
    ? value.replace(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}):\d{2}$/, '$1')
    : value;
}

const items = computed(() =>
  META_FIELDS.map((field) => {
    const declared = props.fields.find((f) => f.field === field);
    return {
      field,
      fullLabel: declared?.label || META_FULL_LABELS[field],
      value: props.modelValue?.[field],
    };
  }).filter((item) => hasValue(item.value)),
);

const summary = computed(() =>
  items.value
    .map((item) => `${META_SHORT_LABELS[item.field]} ${shortValue(item.value)}`)
    .join(' · '),
);

const fullText = computed(() =>
  items.value.map((item) => `${item.fullLabel}：${item.value}`).join('　'),
);
</script>

<template>
  <div
    v-if="items.length"
    class="crud-record-meta min-w-0 flex-1 truncate text-xs text-gray-400"
    :title="fullText"
  >
    {{ summary }}
  </div>
</template>
