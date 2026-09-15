<script setup>
/**
 * 多语言内容管理器（薄壳）
 *
 * 历史入口：articles / categories 等通过 AppCrudTable 的 #field_locale_manager 插槽使用，
 * 签名为 resource + rowId + locales + fields + localesPool。实际逻辑已抽取到通用组件
 * LocaleTabsEditor（按语种 Tabs 切换编辑）。本组件保留旧签名转发，避免改动各调用点。
 *
 * summary 模式（默认）：各语种内容汇总成 locales 数组通过 update:locales 交回父级，
 * 父级写入 formValue.locales，随详情表单一起 PATCH/POST。
 */
import LocaleTabsEditor from '#/components/LocaleTabsEditor.vue';

const props = defineProps({
  // 保留兼容：当前 summary 模式不使用，未来 explicit 模式按 resource+rowId 独立保存
  resource: { type: String, default: '' },
  rowId: { type: [Number, String], default: null },
  locales: { type: Array, default: () => [] },
  fields: { type: Array, default: () => [] },
  localesPool: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:locales', 'changed']);
</script>

<template>
  <LocaleTabsEditor
    :fields="fields"
    :locales="locales"
    :locales-pool="localesPool"
    @update:locales="(v) => emit('update:locales', v)"
    @changed="(v) => emit('changed', v)"
  />
</template>
