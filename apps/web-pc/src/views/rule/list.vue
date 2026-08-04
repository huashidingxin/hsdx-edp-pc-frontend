<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import RuleFieldList from './field-list.vue';

import { useAppStore } from '#/store';

const appStore = useAppStore();
const editingItem = ref({});

const currentProjectId = computed(() => appStore.defaultProject?.id || undefined);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

// 规则分类（categories?type=rule）
const categoryOptions = ref([]);
async function loadCategories() {
  const { data } = await new Resource('categories').list({ per_page: 'all', type: 'rule' });
  categoryOptions.value = (data || []).map((c) => ({ value: c.id, label: c.name }));
  const f = formFields.value.find((x) => x.field === 'category_id');
  if (f) f.attrs.options = categoryOptions.value;
}

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
]);

const formFields = ref([
  {
    field: 'category_id',
    type: 'select',
    label: '分类',
    span: 12,
    required: true,
    attrs: { options: [] },
  },
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
]);

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 200 },
  { field: 'category.name', title: '分类', minWidth: 140 },
  { field: 'project.name', title: '项目', minWidth: 140, slots: { default: 'default_project' } },
  { field: 'status', title: '状态', width: 100, slots: { default: 'default_status' } },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

function saveFormat(payload) {
  const p = { ...payload };
  p.project_id = p.project_id || currentProjectId.value;
  return p;
}

const fieldListKey = ref(0);
watch(
  () => editingItem.value?.id,
  (id) => {
    if (id) fieldListKey.value += 1;
  }
);

onMounted(loadCategories);
</script>

<template>
  <AppCrudTable
    v-model="editingItem"
    api-url="rules"
    :filter-fields="filterFields"
    :fields="formFields"
    :extra-query="extraQuery"
    permission-name="rule"
    :inline-actions="['view', 'edit']"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :save-format="saveFormat"
    title="规范规则"
    class="p-4"
  >
    <template #default_project="{ row }">
      {{ row.project?.name || '通用' }}
    </template>
    <template #default_status="{ row }">
      <Tag :color="row.status ? 'green' : 'red'">{{ row.status ? '正常' : '已停用' }}</Tag>
    </template>

    <template #form-default>
      <div v-if="editingItem.id" class="mt-2">
        <RuleFieldList
          :key="fieldListKey"
          :rule-category-id="editingItem.category_id"
          :rule-id="editingItem.id"
        />
      </div>
    </template>
  </AppCrudTable>
</template>
