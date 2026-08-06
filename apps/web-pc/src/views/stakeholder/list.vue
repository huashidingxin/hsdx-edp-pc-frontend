<script setup>
import { computed, ref } from 'vue';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();

const typeOptions = [
  { value: 1, label: '业主', disabled: true },
  { value: 2, label: '施工单位' },
  { value: 3, label: '设计单位' },
  { value: 4, label: '检测单位' },
];

const extraQuery = computed(() => {
  const query = {};
  if (appStore.defaultProject?.id)
    query.project_id = appStore.defaultProject.id;
  return query;
});

function saveFormat(payload) {
  return {
    ...payload,
    project_id: payload.project_id || appStore.defaultProject?.id,
  };
}

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
  {
    field: 'types',
    label: '类型',
    type: 'select',
    span: 8,
    attrs: { options: typeOptions, multiple: true },
  },
]);

const formFields = ref([
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  {
    field: 'type',
    type: 'select',
    label: '类型',
    span: 12,
    required: true,
    attrs: { options: typeOptions },
  },
  { field: 'short_name', type: 'text', label: '简称', span: 12 },
  { field: 'manager_name', type: 'text', label: '负责人', span: 12 },
]);

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 200 },
  { field: 'project.name', title: '项目', minWidth: 200 },
  { field: 'type_label', title: '类型', width: 120 },
  { field: 'manager_name', title: '负责人', width: 120 },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);
</script>

<template>
  <AppCrudTable
    api-url="stakeholders"
    :extra-query="extraQuery"
    :filter-fields="filterFields"
    :fields="formFields"
    permission-name="stakeholder"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="相关方管理"
    class="p-4"
    :save-format="saveFormat"
  />
</template>
