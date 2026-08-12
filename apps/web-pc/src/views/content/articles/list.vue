<script setup>
import { onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';

import LocaleManager from '../_components/LocaleManager.vue';

const formatMap = { article: '文章', video: '视频' };
const statusMap = { 0: '草稿', 1: '已发布', 2: '已归档' };
const statusColor = { 0: 'default', 1: 'green', 2: 'orange' };

const categories = ref([]);
const localeOptions = ref([]);

const filterFields = ref([
  { field: 'title', label: '标题', type: 'text', span: 6 },
  {
    field: 'category_id',
    label: '分类',
    type: 'select',
    span: 6,
    attrs: {
      items: categories,
      fieldNames: { label: 'name', value: 'id' },
      showSearch: true,
    },
  },
  {
    field: 'format',
    label: '格式',
    type: 'select',
    span: 6,
    attrs: {
      items: [
        { id: 'article', name: '文章' },
        { id: 'video', name: '视频' },
      ],
    },
  },
  { field: 'status', label: '状态', type: 'select', span: 6, attrs: { items: statusItems } },
]);

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
    attrs: {
      items: categories,
      fieldNames: { label: 'name', value: 'id' },
      showSearch: true,
    },
  },
  {
    field: 'format',
    type: 'select',
    label: '格式',
    span: 12,
    attrs: {
      items: [
        { id: 'article', name: '文章' },
        { id: 'video', name: '视频' },
      ],
    },
  },
  { field: 'cover', type: 'text', label: '封面', span: 12 },
  { field: 'video', type: 'text', label: '视频地址', span: 12 },
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
  {
    field: 'title',
    title: '标题',
    minWidth: 200,
    formatter: ({ row }) => row.locales?.[0]?.title || '-',
  },
  {
    field: 'category',
    title: '分类',
    width: 110,
    slots: { default: 'default_category' },
  },
  {
    field: 'format',
    title: '格式',
    width: 90,
    slots: { default: 'default_format' },
  },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'published_at', title: '发布时间', minWidth: 160, formatter: emptyText },
  { field: 'created_at', title: '创建时间', minWidth: 160 },
]);

const formData = ref(null);

function emptyText({ cellValue }) {
  return cellValue ? cellValue : '-';
}

onMounted(async () => {
  try {
    const { data } = await new Resource('admin/categories').list({
      per_page: 100,
      type: 2,
    });
    categories.value = data || [];
  } catch (error) {
    console.error(error);
  }
  try {
    const { data } = await new Resource('admin/applications/locale-catalog').list(
      {},
    );
    localeOptions.value = data || [];
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <AppCrudTable
    api-url="admin/articles"
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
    permission-name="cms.article"
    title="文章管理"
    class="p-4"
  >
    <template #default_category="{ row }">
      <Tag color="blue">
        {{ categories.find((c) => c.id === row.category_id)?.name || '-' }}
      </Tag>
    </template>
    <template #default_format="{ row }">
      <Tag :color="row.format === 'video' ? 'purple' : 'green'">
        {{ formatMap[row.format] || '-' }}
      </Tag>
    </template>
    <template #default_status="{ row }">
      <Tag :color="statusColor[row.status] || 'default'">
        {{ statusMap[row.status] || '-' }}
      </Tag>
    </template>

    <template #field_locale_manager="{ modelValue }">
      <LocaleManager
        resource="admin/articles"
        :row-id="modelValue?.id"
        :locales="modelValue?.locales || []"
        :locales-pool="localeOptions"
        :fields="[
          { field: 'title', label: '标题', type: 'text' },
          { field: 'slug', label: 'Slug', type: 'text' },
          { field: 'summary', label: '摘要', type: 'textarea' },
          { field: 'body', label: '正文', type: 'textarea' },
          { field: 'seo_title', label: 'SEO 标题', type: 'text' },
          { field: 'seo_description', label: 'SEO 描述', type: 'textarea' },
          { field: 'seo_keywords', label: 'SEO 关键词', type: 'text' },
        ]"
      />
    </template>
  </AppCrudTable>
</template>
