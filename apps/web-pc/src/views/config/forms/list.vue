<script setup>
import { onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';

import LocaleManager from '../../content/_components/LocaleManager.vue';

const statusMap = { 0: '停用', 1: '启用' };

const localeOptions = ref([]);

const statusItems = [
  { id: 0, name: '停用' },
  { id: 1, name: '启用' },
];

const filterFields = ref([
  { field: 'title', label: '标题', type: 'text', span: 8 },
  { field: 'code', label: '编码', type: 'text', span: 8 },
  { field: 'status', label: '状态', type: 'select', span: 8, attrs: { items: statusItems } },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'code', type: 'text', label: '编码', span: 12, attrs: { placeholder: '如 contact（小写/数字/下划线/中划线）' } },
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  {
    field: 'fields_schema',
    type: 'textarea',
    label: '字段 Schema（JSON）',
    span: 24,
    attrs: { rows: 6, placeholder: '[{"name":"email","label":"邮箱","type":"email","required":true}]' },
  },
  { field: 'status', type: 'select', label: '状态', span: 12, attrs: { items: statusItems } },
  { field: 'created_at', type: 'datetime', label: '创建时间', span: 12, displayOnly: true },
  {
    field: 'locale_manager',
    type: 'slot',
    label: '语言内容',
    span: 24,
    renderKey: 'locale_manager',
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'code', title: '编码', minWidth: 140 },
  { field: 'name', title: '名称', minWidth: 160 },
  { field: 'submissions_count', title: '提交数', width: 90, formatter: emptyText },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 170 },
]);

const formData = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

const actionsConfig = ref([
  {
    key: 'manage_submissions',
    label: '提交记录',
    icon: 'mdi--inbox-arrow-down',
    permission: 'edit',
    onClick: (row) => {
      window.location.href = `/config/form-submissions?form_id=${row.id}`;
    },
    order: 35,
  },
]);

onMounted(async () => {
  try {
    const { data } = await new Resource('applications/locale-catalog').list({});
    localeOptions.value = data || [];
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <AppCrudTable
    api-url="forms"
    v-model="formData"
    :filter-fields="filterFields"
    :fields="formFields"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :actions-config="actionsConfig"
    :inline-actions="['view', 'edit', 'manage_submissions', 'delete']"
    permission-name="cms.form"
    title="表单管理"
    class="p-4"
  >
    <template #default_status="{ row }">
      <Tag :color="row.status ? 'green' : 'default'">{{ statusMap[row.status] || '-' }}</Tag>
    </template>

    <template #field_locale_manager="{ modelValue, formValue }">
      <LocaleManager
        resource="forms"
        :row-id="formValue?.id"
        :locales="formValue?.locales || []"
        :locales-pool="localeOptions"
        :fields="[
          { field: 'title', label: '标题', type: 'text' },
          { field: 'submit_text', label: '提交按钮文字', type: 'text' },
          { field: 'success_message', label: '成功提示', type: 'textarea' },
        ]"
      />
    </template>
  </AppCrudTable>
</template>
