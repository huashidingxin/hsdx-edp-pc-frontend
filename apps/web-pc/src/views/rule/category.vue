<script setup>
import { onMounted, ref, watch } from 'vue';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

import RuleFieldList from './field-list.vue';

const editingItem = ref({});

// 仅查询规则类型分类，并要求返回子分类计数（对齐 web-admin requestData）
const extraQuery = ref({ type: 'rule', children_count: 1 });

// 规则分类（categories?type=rule），用于选择父级
const categoryOptions = ref([]);
async function loadCategories() {
  const { data } = await new Resource('categories').list({
    per_page: 'all',
    type: 'rule',
  });
  categoryOptions.value = (data || []).map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const f = formFields.value.find((x) => x.field === 'parent_id');
  if (f) f.attrs.options = categoryOptions.value;
  const f2 = filterFields.value.find((x) => x.field === 'parent_id');
  if (f2) f2.attrs.options = categoryOptions.value;
}

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
  {
    field: 'parent_id',
    label: '上级分类',
    type: 'select',
    span: 8,
    attrs: { options: [] },
  },
]);

const formFields = ref([
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  {
    field: 'parent_id',
    type: 'select',
    label: '上级分类',
    span: 12,
    attrs: { options: [] },
  },
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
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

// 保存时注入 type=rule（对齐后端分类类型）
function saveFormat(payload) {
  return { ...payload, type: 'rule' };
}

const fieldListKey = ref(0);
watch(
  () => editingItem.value?.id,
  (id) => {
    if (id) fieldListKey.value += 1;
  },
);

onMounted(loadCategories);
</script>

<template>
  <AppCrudTable
    v-model="editingItem"
    api-url="categories"
    :filter-fields="filterFields"
    :fields="formFields"
    :extra-query="extraQuery"
    permission-name="rule"
    :inline-actions="['view', 'edit']"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :save-format="saveFormat"
    title="规则分类"
    class="p-4"
  >
    <template #default_parent="{ row }">
      {{ row.parent?.name || '-' }}
    </template>

    <template #form-description>
      <div v-if="editingItem.id" class="text-sm text-gray-500">
        当前分类：{{ editingItem.name }}
      </div>
    </template>

    <template #form-default>
      <div v-if="editingItem.id" class="mt-2">
        <RuleFieldList :key="fieldListKey" :rule-category-id="editingItem.id" />
      </div>
    </template>
  </AppCrudTable>
</template>
