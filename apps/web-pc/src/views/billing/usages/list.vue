<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { ref } from 'vue';

const filterFields = ref([
  { field: 'capability_code', label: '能力', type: 'text', span: 8 },
  { field: 'period_key', label: '周期', type: 'text', span: 8 },
  { field: 'date_from', label: '开始日期', type: 'date', span: 4 },
  { field: 'date_to', label: '结束日期', type: 'date', span: 4 },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'capability_code', type: 'text', label: '能力', span: 12, displayOnly: true },
  { field: 'amount', type: 'text', label: '数量', span: 12, displayOnly: true },
  { field: 'period_key', type: 'text', label: '周期', span: 12, displayOnly: true },
  { field: 'resource_type', type: 'text', label: '资源类型', span: 12, displayOnly: true },
  { field: 'resource_id', type: 'text', label: '资源 ID', span: 12, displayOnly: true },
  { field: 'created_at', type: 'datetime', label: '时间', span: 12, displayOnly: true },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 80 },
  { field: 'capability_code', title: '能力', minWidth: 160 },
  { field: 'amount', title: '数量', width: 90 },
  { field: 'period_key', title: '周期', minWidth: 110 },
  { field: 'resource_type', title: '资源类型', minWidth: 120, formatter: emptyText },
  { field: 'resource_id', title: '资源 ID', width: 90, formatter: emptyText },
  { field: 'created_at', title: '时间', minWidth: 170 },
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
    api-url="usages"
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
    permission-name="billing.usage"
    title="用量流水"
    class="p-4"
  >
  </AppCrudTable>
</template>
