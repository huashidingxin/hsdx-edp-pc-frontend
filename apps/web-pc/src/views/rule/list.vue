<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { Alert, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { useAppStore } from '#/store';

import RuleFieldList from './field-list.vue';

const appStore = useAppStore();
const editingItem = ref({});

const currentProjectId = computed(
  () => appStore.defaultProject?.id || undefined,
);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

// 规则分类（categories?type=rule）
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
  const f = formFields.value.find((x) => x.field === 'category_id');
  if (f) f.attrs.options = categoryOptions.value;
  const fc = filterFields.value.find((x) => x.field === 'category_id');
  if (fc) fc.attrs.options = categoryOptions.value;
}

// 所属项目（可选，空 = 通用规范）
const projectOptions = ref([]);
async function loadProjects() {
  const { data } = await new Resource('projects').list({ per_page: 'all' });
  projectOptions.value = (data || []).map((p) => ({
    value: p.id,
    label: p.name,
  }));
  const f = formFields.value.find((x) => x.field === 'project_id');
  if (f) f.attrs.options = projectOptions.value;
}

// P3-V08：所属表单（规范归属表单，1:n；空 = 未归属的历史标准库）
const formOptions = ref([]);
async function loadFormOptions() {
  const { data } = await new Resource('forms').list({ per_page: 'all' });
  formOptions.value = (data || []).map((p) => ({
    value: p.id,
    label: p.name,
  }));
  const f = formFields.value.find((x) => x.field === 'form_id');
  if (f) f.attrs.options = formOptions.value;
  const fc = filterFields.value.find((x) => x.field === 'form_id');
  if (fc) fc.attrs.options = formOptions.value;
}

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
  {
    field: 'category_id',
    label: '分类',
    type: 'select',
    span: 8,
    attrs: { options: [] },
  },
  {
    field: 'form_id',
    label: '所属表单',
    type: 'select',
    span: 8,
    attrs: { options: [], allowClear: true },
  },
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
  {
    field: 'form_id',
    type: 'select',
    label: '所属表单',
    span: 12,
    attrs: {
      options: [],
      allowClear: true,
      placeholder: '未归属（历史标准库）',
    },
  },
  {
    field: 'project_id',
    type: 'select',
    label: '所属项目',
    span: 12,
    attrs: {
      options: [],
      allowClear: true,
      placeholder: '通用（不指定项目）',
    },
  },
]);

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 200 },
  { field: 'category.name', title: '分类', minWidth: 140 },
  {
    field: 'form.name',
    title: '所属表单',
    minWidth: 160,
    slots: { default: 'default_form' },
  },
  {
    field: 'project.name',
    title: '项目',
    minWidth: 140,
    slots: { default: 'default_project' },
  },
  {
    field: 'status',
    title: '状态',
    width: 100,
    slots: { default: 'default_status' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

// 保存时注入所属项目；留空则落 null（通用）
function saveFormat(payload) {
  const p = { ...payload };
  p.project_id = p.project_id || null;
  return p;
}

const fieldListKey = ref(0);
watch(
  () => editingItem.value?.id,
  (id) => {
    if (id) fieldListKey.value += 1;
  },
);

onMounted(async () => {
  await Promise.all([loadCategories(), loadProjects(), loadFormOptions()]);
});
</script>

<template>
  <AppCrudTable
    v-model="editingItem"
    api-url="rules"
    :filter-fields="filterFields"
    :fields="formFields"
    :extra-query="extraQuery"
    permission-name="rule"
    :inline-actions="['view', 'edit', 'delete']"
    :toolbar="{ filter: true, create: true, refresh: true, more: false }"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :save-format="saveFormat"
    title="规范规则"
    class="p-4"
  >
    <template #default_form="{ row }">
      {{ row.form?.name || '未归属' }}
    </template>
    <template #default_project="{ row }">
      {{ row.project?.name || '通用' }}
    </template>
    <template #default_status="{ row }">
      <Tag :color="row.status ? 'green' : 'red'">
        {{ row.status ? '正常' : '已停用' }}
      </Tag>
    </template>

    <template #form-default>
      <div v-if="editingItem.id" class="mt-2">
        <Alert
          type="info"
          show-icon
          class="mb-3"
          message="关联字段（历史记录）"
          description="字段的校验规则请到「表单管理 → 字段规则」配置。下方仅列出本规范在旧链路中绑定的字段，供追溯。"
        />
        <RuleFieldList
          :key="fieldListKey"
          :rule-category-id="editingItem.category_id"
          :rule-id="editingItem.id"
          readonly
        />
      </div>
    </template>
  </AppCrudTable>
</template>
