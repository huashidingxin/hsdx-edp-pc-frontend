<script setup>
import { ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';

const typeOptions = [
  { label: '公司', value: 'company' },
  { label: '个人', value: 'person' },
];

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 6 },
  {
    field: 'company_id',
    label: '公司',
    type: 'select',
    span: 6,
    loadRemoteOptions: { apiUrl: 'companies' },
  },
  {
    field: 'type',
    label: '类型',
    type: 'select',
    span: 6,
    attrs: {
      options: typeOptions,
      fieldNames: { label: 'label', value: 'value' },
    },
  },
]);

const formFields = ref([
  // { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'name', type: 'text', label: '名称', span: 8, required: true },
  {
    field: 'type',
    type: 'select',
    label: '类型',
    span: 8,
    required: true,
    default: 'person',
    attrs: {
      options: typeOptions,
      fieldNames: { label: 'label', value: 'value' },
    },
  },
  {
    field: 'company_id',
    type: 'select',
    label: '公司',
    span: 8,
    attrs: {
      options: [],
      fieldNames: { label: 'name', value: 'id' },
    },
  },
  { field: 'name_en', type: 'text', label: '英文名称', span: 8 },
  { field: 'title', type: 'text', label: '职位', span: 8 },
  { field: 'title_en', type: 'text', label: '英文职位', span: 8 },
  { field: 'phone', type: 'text', label: '电话', span: 6 },
  { field: 'phone_alt', type: 'text', label: '备用电话', span: 6 },
  { field: 'qrcode', type: 'file', label: '个人二维码', span: 24 },
  { field: 'scope', type: 'textarea', label: '介绍', span: 24 },
  { field: 'sort_order', type: 'number', label: '排序', span: 6, default: 0 },
  { field: 'status', type: 'switch', label: '状态', span: 6, default: 1 },
  { field: 'is_public', type: 'switch', label: '公共', span: 6, default: 0 },
  {
    field: 'created_at',
    type: 'datetime',
    label: '创建时间',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'updated_at',
    type: 'datetime',
    label: '更新时间',
    span: 12,
    displayOnly: true,
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 80 },
  { field: 'name', title: '名称', minWidth: 140 },
  { field: 'type', title: '类型', width: 90 },
  {
    field: 'company',
    title: '公司',
    minWidth: 140,
    slots: { default: 'default_company' },
  },
  { field: 'title', title: '职位', minWidth: 120, formatter: emptyText },
  { field: 'phone', title: '电话', width: 130, formatter: emptyText },
  { field: 'sort_order', title: '排序', width: 90 },
  {
    field: 'qrcode',
    title: '二维码',
    width: 90,
    customRender: { type: 'image' },
  },
  {
    field: 'vcard_qrcode',
    title: '小程序二维码',
    width: 90,
    customRender: { type: 'image' },
  },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

const formData = ref(null);
const crudRef = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

async function loadCompanies() {
  try {
    const api = new Resource('companies');
    const { data } = await api.list({ per_page: 'all' });
    formFields.value[2].attrs.options = data;
  } catch (error) {
    console.log(error);
  }
}

onMounted(() => {
  loadCompanies();
});
</script>

<template>
  <AppCrudTable
    ref="crudRef"
    api-url="vcards"
    v-model="formData"
    :filter-fields="filterFields"
    :fields="formFields"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="名片管理"
    class="p-4"
  >
    <template #default_company="{ row }">
{{
      row.company?.name || '-'
    }}
</template>
    <template #default_status="{ row }">
      <Tag :color="row.status ? 'green' : 'red'">
{{
        row.status ? '启用' : '禁用'
      }}
</Tag>
    </template>
  </AppCrudTable>
</template>
