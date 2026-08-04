<script setup>
import { onMounted, ref } from 'vue';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const departments = ref([]);
async function loadDepartments() {
  try {
    const { data } = await new Resource('departments').list({ per_page: 'all' });
    departments.value = data || [];
    const field = formFields.value.find((f) => f.field === 'department_id');
    if (field) field.attrs.options = departments.value;
  } catch (error) {
    console.error(error);
  }
}

const filterFields = ref([
  {
    field: 'department_id',
    label: '部门',
    type: 'select',
    span: 8,
    attrs: { options: [] },
  },
  { field: 'name', label: '名称', type: 'text', span: 8 },
]);

const formFields = ref([
  {
    field: 'department_id',
    type: 'select',
    label: '部门',
    span: 12,
    required: true,
    attrs: { options: [] },
  },
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  { field: 'remarks', type: 'textarea', label: '备注', span: 24 },
]);

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 160 },
  {
    field: 'department.name',
    title: '部门',
    minWidth: 120,
    slots: { default: 'default_department' },
  },
  { field: 'remarks', title: '备注', minWidth: 200 },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

onMounted(loadDepartments);
</script>

<template>
  <AppCrudTable
    api-url="positions"
    :filter-fields="filterFields"
    :fields="formFields"
    permission-name="position"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="职位管理"
    class="p-4"
  >
    <template #default_department="{ row }">
      {{ row.department?.name || '-' }}
    </template>
  </AppCrudTable>
</template>
