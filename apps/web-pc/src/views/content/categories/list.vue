<script setup>
import { onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';

import LocaleManager from '../_components/LocaleManager.vue';

const typeOptions = [
  { id: 1, name: '页面' },
  { id: 2, name: '文章' },
  { id: 3, name: '产品' },
  { id: 4, name: '图库' },
  { id: 5, name: '案例' },
];
const typeMap = { 1: '页面', 2: '文章', 3: '产品', 4: '图库', 5: '案例' };

const parentOptions = ref([]);

const filterFields = ref([
  {
    field: 'type',
    label: '类型',
    type: 'select',
    span: 8,
    attrs: { items: typeOptions },
  },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  {
    field: 'type',
    type: 'select',
    label: '类型',
    span: 12,
    attrs: { items: typeOptions },
  },
  {
    field: 'parent_id',
    type: 'select',
    label: '父级',
    span: 12,
    attrs: {
      items: parentOptions,
      fieldNames: { label: 'name', value: 'id' },
      allowClear: true,
      showSearch: true,
    },
  },
  // 名称/Slug/描述为语种内容，由下方 LocaleManager 按语言维护（分类无顶层 name 字段）
  { field: 'sort', type: 'number', label: '排序', span: 12 },
  {
    field: 'status',
    type: 'select',
    label: '状态',
    span: 12,
    attrs: { items: [{ id: 1, name: '启用' }, { id: 0, name: '停用' }] },
  },
  {
    field: 'locale_manager',
    type: 'slot',
    label: '语言名称',
    span: 24,
    renderKey: 'locale_manager',
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  {
    field: 'name',
    title: '名称',
    minWidth: 180,
    formatter: ({ row }) => row.locales?.[0]?.name || '-',
  },
  {
    field: 'type',
    title: '类型',
    width: 90,
    slots: { default: 'default_type' },
  },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'sort', title: '排序', width: 80 },
  { field: 'created_at', title: '创建时间', minWidth: 160 },
]);

const formData = ref(null);
const localeOptions = ref([]);

onMounted(async () => {
  try {
    const { data } = await new Resource('categories').list({ per_page: 100 });
    parentOptions.value = (data || []).map((c) => ({
      id: c.id,
      name: c.locales?.[0]?.name || `#${c.id}`,
    }));
  } catch (error) {
    console.error(error);
  }
  try {
    const { data } = await new Resource('applications/locale-catalog').list({});
    localeOptions.value = data || [];
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <AppCrudTable
    api-url="categories"
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
    permission-name="cms.category"
    title="分类管理"
    class="p-4"
  >
    <template #default_type="{ row }">
      <Tag :color="typeMap[row.type] === '文章' ? 'green' : 'blue'">
        {{ typeMap[row.type] || '-' }}
      </Tag>
    </template>
    <template #default_status="{ row }">
      <Tag :color="row.status ? 'green' : 'default'">
        {{ row.status ? '启用' : '停用' }}
      </Tag>
    </template>

    <template #field_locale_manager="{ modelValue, formValue }">
      <LocaleManager
        resource="categories"
        :row-id="formValue?.id"
        :locales="formValue?.locales || []"
        @update:locales="(v) => { if (formValue) formValue.locales = v; }"
        :locales-pool="localeOptions"
        :fields="[
          { field: 'name', label: '名称', type: 'text' },
          { field: 'slug', label: 'Slug', type: 'text' },
          { field: 'description', label: '描述', type: 'textarea' },
        ]"
      />
    </template>
  </AppCrudTable>
</template>
