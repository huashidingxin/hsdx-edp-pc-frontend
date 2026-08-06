<script setup>
import { onMounted, ref } from 'vue';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const categories = ref([]);
async function loadCategories() {
  const { data } = await new Resource('categories').list({
    per_page: 'all',
    type: 'news',
  });
  categories.value = (data || []).map((c) => ({ value: c.id, label: c.name }));
  const field = formFields.value.find((f) => f.field === 'category_id');
  if (field) field.attrs.options = categories.value;
}

const filterFields = ref([
  { field: 'title', label: '标题', type: 'text', span: 8 },
]);

const formFields = ref([
  { field: 'title', type: 'text', span: 12, label: '标题', required: true },
  {
    field: 'category_id',
    type: 'select',
    span: 12,
    label: '分类',
    required: true,
    attrs: { options: [] },
  },
  { field: 'summary', type: 'textarea', span: 24, label: '简介' },
  { field: 'content', type: 'editor', span: 24, label: '详情' },
]);

const gridColumns = ref([
  { field: 'title', title: '标题', minWidth: 200 },
  { field: 'category.name', title: '分类', minWidth: 120 },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

onMounted(loadCategories);
</script>

<template>
  <AppCrudTable
    api-url="news"
    permission-name="news"
    :filter-fields="filterFields"
    :fields="formFields"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="新闻公告"
    class="p-4"
  />
</template>
