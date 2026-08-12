<script setup>
import { onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';

import LocaleManager from '../_components/LocaleManager.vue';

const statusMap = { 0: '草稿', 1: '已发布', 2: '已归档' };
const statusColor = { 0: 'default', 1: 'green', 2: 'orange' };
const employmentMap = { full: '全职', part: '兼职', intern: '实习' };

const categories = ref([]);
const localeOptions = ref([]);

const filterFields = ref([
  { field: 'department', label: '部门', type: 'text', span: 6 },
  { field: 'location', label: '地点', type: 'text', span: 6 },
  { field: 'employment_type', label: '类型', type: 'select', span: 6, attrs: { items: employmentOptions } },
  { field: 'status', label: '状态', type: 'select', span: 6, attrs: { items: statusItems } },
]);

const employmentOptions = [
  { id: 'full', name: '全职' },
  { id: 'part', name: '兼职' },
  { id: 'intern', name: '实习' },
];

const statusItems = [
  { id: 0, name: '草稿' },
  { id: 1, name: '已发布' },
  { id: 2, name: '已归档' },
];

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  {
    field: 'category_id',
    type: 'select',
    label: '分类',
    span: 12,
    attrs: { items: categories, fieldNames: { label: 'name', value: 'id' }, showSearch: true },
  },
  { field: 'cover', type: 'text', label: '封面', span: 12 },
  { field: 'department', type: 'text', label: '部门', span: 12 },
  { field: 'location', type: 'text', label: '地点', span: 12 },
  {
    field: 'employment_type',
    type: 'select',
    label: '类型',
    span: 12,
    attrs: { items: employmentOptions },
  },
  { field: 'salary_range', type: 'text', label: '薪资范围', span: 12 },
  { field: 'deadline', type: 'text', label: '截止日期', span: 12 },
  { field: 'sort', type: 'number', label: '排序', span: 12 },
  {
    field: 'published_at',
    type: 'datetime',
    label: '发布时间',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'locale_manager',
    type: 'slot',
    label: '语言内容',
    span: 24,
    renderKey: 'locale_manager',
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'title', title: '职位', minWidth: 180, formatter: ({ row }) => row.locales?.[0]?.title || '-' },
  { field: 'department', title: '部门', minWidth: 110, formatter: emptyText },
  { field: 'location', title: '地点', minWidth: 110, formatter: emptyText },
  {
    field: 'employment_type',
    title: '类型',
    width: 90,
    slots: { default: 'default_employment' },
  },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 160 },
]);

const formData = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

onMounted(async () => {
  try {
    const { data } = await new Resource('admin/categories').list({ per_page: 100, type: 2 });
    categories.value = data || [];
  } catch (error) {
    console.error(error);
  }
  try {
    const { data } = await new Resource('admin/applications/locale-catalog').list({});
    localeOptions.value = data || [];
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <AppCrudTable
    api-url="admin/job-postings"
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
    permission-name="cms.job"
    title="招聘管理"
    class="p-4"
  >
    <template #default_employment="{ row }">
      <Tag color="blue">{{ employmentMap[row.employment_type] || row.employment_type || '-' }}</Tag>
    </template>
    <template #default_status="{ row }">
      <Tag :color="statusColor[row.status] || 'default'">{{ statusMap[row.status] || '-' }}</Tag>
    </template>

    <template #field_locale_manager="{ modelValue }">
      <LocaleManager
        resource="admin/job-postings"
        :row-id="modelValue?.id"
        :locales="modelValue?.locales || []"
        :locales-pool="localeOptions"
        :fields="[
          { field: 'title', label: '职位', type: 'text' },
          { field: 'slug', label: 'Slug', type: 'text' },
          { field: 'summary', label: '简介', type: 'textarea' },
          { field: 'body', label: '描述', type: 'textarea' },
        ]"
      />
    </template>
  </AppCrudTable>
</template>
