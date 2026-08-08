<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { useUserStore } from '@vben/stores';

import { message, Switch, Tag } from 'antdv-next';

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

// P3-V13：项目控件改「是否通用」——管理员用 Switch（开=通用 null / 关=当前项目），
// 普通用户只读显示当前项目名；值直接落 project_id（null=通用）
const projectField = computed(() => {
  if (isAdmin.value) {
    return {
      field: 'project_id',
      type: 'slot',
      label: '通用规范',
      span: 12,
      required: false,
      attrs: {},
    };
  }
  return {
    field: 'project_id',
    type: 'slot',
    label: '所属项目',
    span: 12,
    required: false,
    attrs: {},
  };
});
watch([projectField, currentProjectId], () => {
  const idx = formFields.value.findIndex((x) => x.field === 'project_id');
  if (idx !== -1) formFields.value.splice(idx, 1, projectField.value);
  // 新建默认归属当前项目（管理员不动开关时也落当前项目）
  const f = formFields.value.find((x) => x.field === 'project_id');
  if (f) f.default = appStore.defaultProject?.id ?? null;
}, { immediate: true });

// P3-V13：所属项目控件已由「是否通用」Switch / 当前项目只读文本替代，不再需要项目下拉
// 所属表单（P3-V08：规范归属表单，1:n；空 = 未归属的历史标准库）
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
    type: 'slot',
    label: '通用规范',
    span: 12,
    required: false,
    attrs: {},
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

// 保存时归一 project_id：管理员 slot 已落值（null=通用 / pid=当前项目）；普通用户固定当前项目
function saveFormat(payload) {
  const p = { ...payload };
  if (!isAdmin.value) {
    p.project_id = appStore.defaultProject?.id ?? null;
  }
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
  await Promise.all([loadCategories(), loadFormOptions()]);
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
    <template #field_project_id="scope">
      <template v-if="isAdmin">
        <Switch
          :checked="scope['model-value'] === null"
          @change="(v) => scope.update(v ? null : appStore.defaultProject?.id ?? null)"
        />
        <div class="mt-1 text-xs text-gray-400">
          {{ scope['model-value'] === null ? '通用（所有项目可见，仅管理员可管理）' : `当前项目：${appStore.defaultProject?.name || '-'}` }}
        </div>
      </template>
      <div v-else class="text-sm text-gray-600">
        {{ appStore.defaultProject?.name || '未设置当前项目' }}
      </div>
    </template>

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
