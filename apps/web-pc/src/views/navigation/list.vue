<script setup>
import { ref } from 'vue';

import { Tag } from 'antdv-next';

const linkTypeOptions = [
  { label: '无', value: 'none' },
  { label: '页面', value: 'page' },
  { label: '外链', value: 'url' },
  { label: '电话', value: 'phone' },
  { label: '内容', value: 'post' },
  { label: '业务', value: 'business' },
  { label: '分类', value: 'category' },
  { label: '模块', value: 'module' },
];

const scopeOptions = [
  { label: '标签栏', value: 'tabbar' },
  { label: '首页宫格', value: 'home_grid' },
  { label: '首页按钮', value: 'home_buttons' },
  { label: '用户中心', value: 'user_center' },
];

const filterFields = ref([
  { field: 'title', label: '标题', type: 'text', span: 6 },
  {
    field: 'scope',
    label: '范围',
    type: 'select',
    span: 6,
    attrs: { options: scopeOptions, fieldNames: { label: 'label', value: 'value' } },
  },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  {
    field: 'scope',
    type: 'select',
    label: '范围',
    span: 12,
    required: true,
    attrs: { options: scopeOptions, fieldNames: { label: 'label', value: 'value' } },
  },
  { field: 'title', type: 'text', label: '标题', span: 12, required: true },
  { field: 'parent_id', type: 'number', label: '父级ID', span: 12 },
  {
    field: 'link_type',
    type: 'select',
    label: '链接类型',
    span: 12,
    attrs: { options: linkTypeOptions, fieldNames: { label: 'label', value: 'value' } },
  },
  { field: 'link_value', type: 'text', label: '链接值', span: 12 },
  { field: 'sort_order', type: 'number', label: '排序', span: 12, default: 0 },
  { field: 'status', type: 'switch', label: '状态', span: 12, default: 1 },
  { field: 'created_at', type: 'datetime', label: '创建时间', span: 12, displayOnly: true },
  { field: 'updated_at', type: 'datetime', label: '更新时间', span: 12, displayOnly: true },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 80 },
  { field: 'title', title: '标题', minWidth: 140 },
  { field: 'scope', title: '范围', width: 120 },
  { field: 'link_type', title: '链接类型', width: 100 },
  { field: 'parent_id', title: '父级ID', width: 90, formatter: emptyText },
  { field: 'sort_order', title: '排序', width: 90 },
  { field: 'status', title: '状态', width: 90, slots: { default: 'default_status' } },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

const formData = ref(null);
const crudRef = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === '' ? '-' : cellValue;
}
</script>
<template>
  <AppCrudTable
    ref="crudRef"
    api-url="navigations"
    v-model="formData"
    :filter-fields="filterFields"
    :fields="formFields"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="导航管理"
    class="p-4"
  >
    <template #default_status="{ row }">
      <Tag :color="row.status ? 'green' : 'red'">{{ row.status ? '启用' : '禁用' }}</Tag>
    </template>
  </AppCrudTable>
</template>
