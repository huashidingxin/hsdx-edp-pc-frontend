<script setup>
import { ref } from 'vue';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
]);

const formFields = ref([
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  { field: 'remarks', type: 'textarea', label: '备注', span: 24 },
]);

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 160 },
  { field: 'staff_count', title: '员工数', width: 100 },
  { field: 'remarks', title: '备注', minWidth: 200 },
  { field: 'created_at', title: '创建时间', width: 160 },
]);
</script>

<template>
  <AppCrudTable
    api-url="departments"
    :filter-fields="filterFields"
    :fields="formFields"
    permission-name="department"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="组织部门"
    class="p-4"
  />
</template>
