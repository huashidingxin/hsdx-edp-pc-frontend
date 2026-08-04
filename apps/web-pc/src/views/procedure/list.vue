<script setup>
import { onMounted, ref } from 'vue';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const categories = ref([]);
async function loadCategories() {
  try {
    const { data } = await new Resource('categories').list({
      per_page: 'all',
      type: 'project',
    });
    categories.value = data || [];
    const field = formFields.value.find((f) => f.field === 'category_id');
    if (field) field.attrs.options = categories.value;
  } catch (error) {
    console.error(error);
  }
}

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
  {
    field: 'category_id',
    label: '分类',
    type: 'select',
    span: 8,
    attrs: { options: [] },
  },
]);

const formFields = ref([
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  {
    field: 'category_id',
    type: 'select',
    label: '分类',
    span: 12,
    attrs: { options: [] },
  },
]);

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 200 },
  {
    field: 'category.name',
    title: '分类',
    minWidth: 140,
    slots: { default: 'default_category' },
  },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

onMounted(loadCategories);
</script>

<template>
  <AppCrudTable
    api-url="procedures"
    :filter-fields="filterFields"
    :fields="formFields"
    permission-name="procedure"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="工序管理"
    class="p-4"
  >
    <template #default_category="{ row }">
      {{ row.category?.name || '-' }}
    </template>
  </AppCrudTable>
</template>
