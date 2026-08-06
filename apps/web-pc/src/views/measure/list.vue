<script setup>
import { ref } from 'vue';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
]);

const formFields = ref([
  { field: 'name', type: 'text', label: '名称', span: 24, required: true },
]);

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 200 },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);
</script>

<template>
  <AppCrudTable
    api-url="measures"
    :filter-fields="filterFields"
    :fields="formFields"
    permission-name="measure"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="监理方式"
    class="p-4"
  />
</template>
