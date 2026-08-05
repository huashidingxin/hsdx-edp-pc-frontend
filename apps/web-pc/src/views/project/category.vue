<script setup>
import { onMounted, ref } from 'vue';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

/**
 * 项目分类管理（categories?type=project）
 * web-admin 为懒加载树，web-pc 用平铺列表（含父分类列，AppCrudTable 无树网格）
 */
const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
]);

const formFields = ref([
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
]);

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 200 },
  {
    field: 'parent.name',
    title: '上级分类',
    minWidth: 140,
    slots: { default: 'default_parent' },
  },
  { field: 'children_count', title: '子分类数', width: 100 },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

function saveFormat(payload) {
  return { ...payload, type: 'project' };
}

const extraQuery = ref({ type: 'project', children_count: 1 });

onMounted(() => {});
</script>

<template>
  <AppCrudTable
    api-url="categories"
    permission-name="category"
    :extra-query="extraQuery"
    :filter-fields="filterFields"
    :fields="formFields"
    :save-format="saveFormat"
    :inline-actions="['view', 'edit', 'delete']"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="项目分类"
    class="p-4"
  >
    <template #default_parent="{ row }">
      {{ row.parent?.name || '-' }}
    </template>
  </AppCrudTable>
</template>
