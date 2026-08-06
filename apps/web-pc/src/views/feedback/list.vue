<script setup>
import { ref } from 'vue';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const typeOptions = [
  { value: 1, label: '问题' },
  { value: 2, label: '建议' },
  { value: 99, label: '其他' },
];

const filterFields = ref([
  {
    field: 'type',
    label: '类型',
    type: 'select',
    span: 8,
    attrs: { options: typeOptions },
  },
]);

const detailFields = ref([
  {
    field: 'type',
    type: 'select',
    span: 12,
    label: '类型',
    attrs: { options: typeOptions },
  },
  { field: 'content', type: 'textarea', span: 24, label: '内容' },
  {
    field: 'images',
    type: 'file',
    span: 12,
    label: '图片',
    attrs: { multiple: true },
  },
  {
    field: 'video',
    type: 'file',
    span: 12,
    label: '视频',
    attrs: { fileType: 'video' },
  },
]);

const gridColumns = ref([
  { field: 'type_desc', title: '类型', width: 100 },
  { field: 'user.name', title: '用户', minWidth: 110 },
  { field: 'content', title: '内容', minWidth: 240 },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);
</script>

<template>
  <AppCrudTable
    api-url="feedback"
    permission-name="feedback"
    :filter-fields="filterFields"
    :fields="detailFields"
    :inline-actions="['view', 'delete']"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :toolbar="{ filter: true, create: false, refresh: true }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="用户反馈"
    class="p-4"
  />
</template>
