<script setup>
import { onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const editingItem = ref({});

const companyOptions = ref([]);
async function loadCompanies() {
  const { data } = await new Resource('companies').list({ per_page: 'all' });
  companyOptions.value = (data || []).map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const field = formFields.value.find((f) => f.field === 'parent_id');
  if (field) field.attrs.options = companyOptions.value;
}

const typeOptions = [
  { value: 1, label: '总公司' },
  { value: 2, label: '分公司' },
  { value: 3, label: '其他' },
];

const formFields = ref([
  { field: 'name', type: 'text', label: '公司名称', span: 12, required: true },
  { field: 'code', type: 'text', label: '公司编码', span: 12 },
  {
    field: 'parent_id',
    type: 'select',
    label: '上级公司',
    span: 12,
    attrs: { options: [], placeholder: '留空为顶级（总公司）' },
  },
  {
    field: 'type',
    type: 'select',
    label: '单位类型',
    span: 12,
    attrs: { options: typeOptions },
  },
  {
    field: 'status',
    type: 'select',
    label: '状态',
    span: 12,
    attrs: {
      options: [
        { value: 1, label: '启用' },
        { value: 0, label: '停用' },
      ],
    },
  },
  { field: 'sort', type: 'number', label: '排序', span: 12 },
]);

const filterFields = ref([
  { field: 'keyword', label: '名称/编码', type: 'text', span: 8 },
  {
    field: 'status',
    label: '状态',
    type: 'select',
    span: 8,
    attrs: {
      options: [
        { value: 1, label: '启用' },
        { value: 0, label: '停用' },
      ],
    },
  },
]);

const gridColumns = ref([
  { field: 'name', title: '公司名称', minWidth: 200 },
  { field: 'code', title: '编码', width: 140 },
  {
    field: 'type',
    title: '单位类型',
    width: 110,
    slots: { default: 'default_type' },
  },
  { field: 'project_count', title: '项目数', width: 90 },
  { field: 'sort', title: '排序', width: 80 },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

onMounted(() => {
  loadCompanies();
});
</script>

<template>
  <AppCrudTable
    v-model="editingItem"
    api-url="companies"
    :filter-fields="filterFields"
    :fields="formFields"
    permission-name="company"
    :inline-actions="['view', 'edit', 'delete']"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    title="单位管理"
    class="p-4"
  >
    <template #default_type="{ row }">
      {{ typeOptions.find((t) => t.value === row.type)?.label || '-' }}
    </template>
    <template #default_status="{ row }">
      <Tag v-if="row.status === 1" color="green">启用</Tag>
      <Tag v-else color="red">停用</Tag>
    </template>
  </AppCrudTable>
</template>
