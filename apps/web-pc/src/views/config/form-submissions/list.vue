<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';

import { Tag, message } from 'antdv-next';

import { requestClient } from '#/api/request';

const route = useRoute();
const crudRef = ref(null);

const formId = computed(() => Number(route.query.form_id) || null);
const apiUrl = computed(() => `forms/${formId.value}/submissions`);

const statusColor = { 0: 'blue', 1: 'default', 2: 'green' };

const statusItems = [
  { id: 0, name: '新提交' },
  { id: 1, name: '已读' },
  { id: 2, name: '已回复' },
];

const filterFields = ref([
  { field: 'status', label: '状态', type: 'select', span: 8, attrs: { fieldNames: { label: 'name', value: 'id' },
      options: statusItems } },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'form_id', type: 'text', label: '表单', span: 12, displayOnly: true },
  { field: 'locale', type: 'text', label: '语言', span: 12, displayOnly: true },
  { field: 'ip', type: 'text', label: 'IP', span: 12, displayOnly: true },
  {
    field: 'payload',
    type: 'textarea',
    label: '提交内容',
    span: 24,
    displayOnly: true,
    attrs: { rows: 8 },
  },
  { field: 'created_at', type: 'datetime', label: '提交时间', span: 12, displayOnly: true },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 80 },
  {
    field: 'payload',
    title: '提交内容',
    minWidth: 300,
    formatter: ({ cellValue }) => (Array.isArray(cellValue) ? cellValue.map((f) => `${f.label || f.name}: ${f.value}`).join(' | ') : JSON.stringify(cellValue || {})),
  },
  { field: 'locale', title: '语言', width: 90, formatter: emptyText },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'created_at', title: '提交时间', minWidth: 170 },
]);

const formData = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

async function mark(row, status) {
  try {
    await requestClient.patch(`/forms/${row.form_id}/submissions/${row.id}`, {
      status,
    });
    message.success('状态已更新');
    crudRef.value?.refresh();
  } catch {
    message.error('更新失败');
  }
}

const actionsConfig = ref([
  {
    key: 'mark_read',
    label: '标记已读',
    icon: 'mdi--eye-outline',
    permission: 'write',
    visible: (row) => row.status === 0,
    onClick: (row) => mark(row, 1),
    order: 35,
  },
  {
    key: 'mark_replied',
    label: '标记已回复',
    icon: 'mdi--check-circle-outline',
    permission: 'write',
    visible: (row) => row.status !== 2,
    onClick: (row) => mark(row, 2),
    order: 40,
  },
]);
</script>

<template>
  <div class="h-full">
    <AppCrudTable
      v-if="formId"
      ref="crudRef"
      :api-url="apiUrl"
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
      :inline-actions="['view', 'mark_read', 'mark_replied']"
      :toolbar="{ create: false }"
      permission-name="cms.form"
      title="表单提交"
      class="p-4"
    >
      <template #default_status="{ row }">
        <Tag :color="statusColor[row.status] || 'default'">{{ row.status_label || '-' }}</Tag>
      </template>
    </AppCrudTable>
    <div v-else class="p-8 text-center text-gray-400">请从表单列表进入提交记录</div>
  </div>
</template>
