<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { ref } from 'vue';

import { Tag } from 'antdv-next';

const statusMap = { 1: '已启用', 0: '已停用' };

const statusItems = [
  { id: 1, name: '已启用' },
  { id: 0, name: '已停用' },
];

const filterFields = ref([
  { field: 'capability_code', label: '能力', type: 'text', span: 8 },
  { field: 'enabled', label: '状态', type: 'select', span: 8, attrs: { fieldNames: { label: 'name', value: 'id' },
      items: statusItems } },
]);

const formFields = ref([
  { field: 'capability_code', type: 'text', label: '能力', span: 12, displayOnly: true },
  { field: 'enabled', type: 'text', label: '状态', span: 12, displayOnly: true },
  { field: 'limit_value', type: 'text', label: '配额', span: 12, displayOnly: true },
  { field: 'period_label', type: 'text', label: '周期', span: 12, displayOnly: true },
  { field: 'used', type: 'text', label: '已用', span: 12, displayOnly: true },
  { field: 'source', type: 'text', label: '来源', span: 12, displayOnly: true },
  { field: 'package_code', type: 'text', label: '套餐', span: 12, displayOnly: true },
]);

const gridColumns = ref([
  { field: 'capability_code', title: '能力', minWidth: 180 },
  {
    field: 'enabled',
    title: '状态',
    width: 90,
    slots: { default: 'default_enabled' },
  },
  {
    field: 'limit_value',
    title: '配额',
    width: 100,
    formatter: ({ cellValue }) => (cellValue === null ? '无限' : cellValue),
  },
  { field: 'used', title: '已用', width: 90 },
  { field: 'period_label', title: '周期', width: 100 },
  { field: 'source', title: '来源', minWidth: 110, formatter: emptyText },
]);

const formData = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}
</script>

<template>
  <AppCrudTable
    api-url="entitlements"
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
    :inline-actions="['view']"
    :toolbar="{ create: false, export: false, more: false }"
    permission-name="billing.entitlement"
    title="套餐与配额"
    class="p-4"
  >
    <template #default_enabled="{ row }">
      <Tag :color="row.enabled ? 'green' : 'default'">
        {{ statusMap[row.enabled] || '-' }}
      </Tag>
    </template>
  </AppCrudTable>
</template>
