<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { message, Switch, Tag } from 'antdv-next';
import { useUserStore } from '@vben/stores';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();
const userStore = useUserStore();
const editingItem = ref({});

// P3-V09：通用规范（project_id 为空）仅管理员可创建/编辑/删除
const isAdmin = computed(() => !!userStore.userInfo?.is_admin);

const currentProjectId = computed(
  () => appStore.defaultProject?.id || undefined,
);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

// P3-V12：新建时默认归属当前项目（管理员可清除=通用）
watch(
  currentProjectId,
  (v) => {
    const f = formFields.value.find((x) => x.field === 'project_id');
    if (f) f.default = v ?? null;
    const fc = filterFields.value.find((x) => x.field === 'project_id');
    if (fc && !fc.attrs) fc.attrs = {};
  },
  { immediate: true },
);

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
    required: !isAdmin.value,
    attrs: {
      options: [],
      allowClear: isAdmin.value,
      placeholder: isAdmin.value
        ? '通用（不指定项目，仅管理员）'
        : '请选择项目（通用规范仅管理员可创建）',
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

// P3-V09：非管理员不可编辑/删除通用规范（后端 403 兜底）
const actionsConfig = computed(() => [
  {
    key: 'edit',
    disabled: (row) => !isAdmin.value && !row.project_id,
  },
  {
    key: 'delete',
    disabled: (row) => !isAdmin.value && !row.project_id,
  },
]);

// P3-V09：状态列即时启停切换
async function toggleStatus(row, checked) {
  try {
    await new Resource('rules').update(row.id, {
      category_id: row.category_id,
      name: row.name,
      form_id: row.form_id,
      status: checked ? 1 : 0,
    });
    row.status = checked ? 1 : 0;
    message.success(checked ? '规范已启用' : '规范已停用');
  } catch (error) {
    const msg = error?.response?.data?.message || error?.message;
    message.error(typeof msg === 'string' && msg ? msg : '状态切换失败');
  }
}

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
    :actions-config="actionsConfig"
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
      <div class="flex items-center gap-2">
        <Switch
          size="small"
          :checked="!!row.status"
          @change="(v) => toggleStatus(row, v)"
        />
        <Tag :color="row.status ? 'green' : 'red'">
          {{ row.status ? '正常' : '已停用' }}
        </Tag>
      </div>
    </template>
  </AppCrudTable>
</template>
