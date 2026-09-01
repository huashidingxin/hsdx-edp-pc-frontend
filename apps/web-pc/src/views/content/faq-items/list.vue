<script setup>
import { onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';

import LocaleManager from '../_components/LocaleManager.vue';

const categories = ref([]);
const localeOptions = ref([]);

const filterFields = ref([
  {
    field: 'category_id',
    label: '分类',
    type: 'select',
    span: 8,
    attrs: { items: categories, fieldNames: { label: 'name', value: 'id' }, showSearch: true },
  },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  {
    field: 'category_id',
    type: 'select',
    label: '分类',
    span: 12,
    attrs: { items: categories, fieldNames: { label: 'name', value: 'id' }, showSearch: true },
  },
  { field: 'sort', type: 'number', label: '排序', span: 12 },
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
  { field: 'question', title: '问题', minWidth: 240, formatter: ({ row }) => row.locales?.[0]?.title || row.locales?.[0]?.question || '-' },
  {
    field: 'category',
    title: '分类',
    width: 110,
    slots: { default: 'default_category' },
  },
  { field: 'sort', title: '排序', width: 80 },
  { field: 'created_at', title: '创建时间', minWidth: 160 },
]);

const formData = ref(null);

onMounted(async () => {
  try {
    const { data } = await new Resource('categories').list({ per_page: 100, type: 2 });
    categories.value = data || [];
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
    api-url="faq-items"
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
    permission-name="cms.faq"
    title="常见问题"
    class="p-4"
  >
    <template #default_category="{ row }">
      <Tag color="blue">{{ categories.find((c) => c.id === row.category_id)?.name || '-' }}</Tag>
    </template>

    <template #field_locale_manager="{ modelValue, formValue }">
      <LocaleManager
        resource="faq-items"
        :row-id="formValue?.id"
        :locales="formValue?.locales || []"
        @update:locales="(v) => { if (formValue) formValue.locales = v; }"
        :locales-pool="localeOptions"
        :fields="[
          { field: 'question', label: '问题', type: 'text' },
          { field: 'answer', label: '答案', type: 'textarea' },
        ]"
      />
    </template>
  </AppCrudTable>
</template>
