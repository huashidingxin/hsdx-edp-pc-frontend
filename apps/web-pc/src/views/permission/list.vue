<script setup>
import { onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const filterFields = ref([
  { field: 'name', label: '编码', type: 'text', span: 8 },
  { field: 'display_name', label: '名称', type: 'text', span: 8 },
  {
    field: 'type',
    label: '类型',
    type: 'select',
    span: 8,
    attrs: {
      allowClear: true,
      items: [
        { id: 1, name: '页面' },
        { id: 2, name: '功能' },
      ],
    },
  },
]);

const formFields = ref([
  { field: 'name', type: 'text', label: '编码', span: 12, required: true,
    attrs: { placeholder: '如 menu.user / user.create' } },
  { field: 'display_name', type: 'text', label: '名称', span: 12, required: true },
  {
    field: 'type',
    type: 'select',
    label: '类型',
    span: 12,
    attrs: {
      items: [
        { id: 1, name: '页面' },
        { id: 2, name: '功能' },
      ],
    },
  },
  {
    field: 'parent_id',
    type: 'select',
    label: '父级',
    span: 12,
    attrs: {
      allowClear: true,
      fieldNames: { label: 'display_name', value: 'id' },
      placeholder: '可选，标记层级归属',
    },
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'display_name', title: '名称', minWidth: 160 },
  { field: 'name', title: '编码', minWidth: 200 },
  { field: 'type', title: '类型', width: 90, slots: { default: 'default_type' } },
  { field: 'parent', title: '父级', minWidth: 140, slots: { default: 'default_parent' } },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

function typeText(t) {
  return t === 1 ? '页面' : (t === 2 ? '功能' : '-');
}

async function loadPermissions() {
  try {
    const { data } = await new Resource('permissions').list({ per_page: 'all' });
    const items = (data || []).map((p) => ({ id: p.id, display_name: p.display_name }));
    const field = formFields.value.find((f) => f.field === 'parent_id');
    if (field) field.attrs.items = items;
  } catch (error) {
    console.error(error);
  }
}

onMounted(loadPermissions);
</script>

<template>
  <AppCrudTable
    api-url="permissions"
    :filter-fields="filterFields"
    :fields="formFields"
    permission-name="permission"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="权限管理"
    class="p-4"
  >
    <template #default_type="{ row }">
      <Tag :color="row.type === 1 ? 'blue' : 'green'">{{ typeText(row.type) }}</Tag>
    </template>
    <template #default_parent="{ row }">
      {{ row.parent?.display_name || '-' }}
    </template>
  </AppCrudTable>
</template>
