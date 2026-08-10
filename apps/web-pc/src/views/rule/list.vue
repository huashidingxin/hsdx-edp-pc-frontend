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

// P3-V09：通用规范（is_general=1）仅管理员可创建/编辑/删除；项目专属=0
const isAdmin = computed(() => !!userStore.userInfo?.is_admin);

const currentProjectId = computed(
  () => appStore.defaultProject?.id || undefined,
);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

// ================= 声明 filterFields 和 formFields（必须在使用它们的 watch 之前） =================
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
  {
    field: 'is_general',
    label: '是否通用',
    type: 'select',
    span: 8,
    attrs: {
      options: [
        { value: 1, label: '是' },
        { value: 0, label: '否' },
      ],
    },
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
    field: 'is_general',
    type: 'slot',
    label: '通用规范',
    span: 12,
    required: false,
    attrs: {},
  },
]);

// ================= P3-V13：项目控件改「是否通用」 =================
const projectField = computed(() => {
  if (isAdmin.value) {
    return {
      field: 'is_general',
      type: 'slot',
      label: '通用规范',
      span: 12,
      required: false,
      attrs: {},
    };
  }
  return {
    field: 'is_general',
    type: 'slot',
    label: '所属项目',
    span: 12,
    required: false,
    attrs: {},
  };
});

// ================= Watches（现在 formFields 和 filterFields 已声明） =================

// P3-V12：新建时默认归属当前项目（管理员可清除=通用）
watch(
  currentProjectId,
  () => {
    const f = formFields.value.find((x) => x.field === 'is_general');
    if (f) f.default = 0;
  },
  { immediate: true },
);

// P3-V13：更新 is_general slot 控件
watch(
  [projectField, currentProjectId],
  () => {
    const idx = formFields.value.findIndex((x) => x.field === 'is_general');
    if (idx !== -1) formFields.value.splice(idx, 1, projectField.value);
    // 新建默认归属当前项目（管理员不动开关时也落当前项目）
    const f = formFields.value.find((x) => x.field === 'is_general');
    if (f) f.default = 0;
  },
  { immediate: true },
);

// ================= 异步加载 =================

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

// 保存时统一通用标识：1=是、0=否；project_id 只保存项目专属规范的实际项目。
function saveFormat(payload) {
  const p = { ...payload };
  const isGeneral = Number(p.is_general) === 1;
  p.is_general = isGeneral ? 1 : 0;
  if (isGeneral) {
    p.project_id = null;
  } else if (!isAdmin.value || !p.project_id) {
    p.project_id = appStore.defaultProject?.id ?? null;
  }
  return p;
}

// P3-V09：非管理员不可编辑/删除通用规范（后端 403 兜底）
const actionsConfig = computed(() => [
  {
    key: 'edit',
    disabled: (row) => !isAdmin.value && Number(row.is_general) === 1,
  },
  {
    key: 'delete',
    disabled: (row) => !isAdmin.value && Number(row.is_general) === 1,
  },
]);

// P3-V09：状态列即时启停切换
async function toggleStatus(row, checked) {
  try {
    await new Resource('rules').update(row.id, {
      category_id: row.category_id,
      name: row.name,
      form_id: row.form_id,
      project_id: row.project_id,
      is_general: Number(row.is_general) === 1 ? 1 : 0,
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
    <template
      #field_is_general="{ modelValue: generalValue, update: updateGeneral }"
    >
      <template v-if="isAdmin">
        <!-- 原生按钮不受 Form disabled 上下文影响；值统一为 1=是、0=否。 -->
        <button
          type="button"
          role="switch"
          :aria-checked="Number(generalValue) === 1"
          class="toggle-switch relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          :class="Number(generalValue) === 1 ? 'bg-blue-500' : 'bg-gray-300'"
          @click="updateGeneral(Number(generalValue) === 1 ? 0 : 1)"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out"
            :class="
              Number(generalValue) === 1 ? 'translate-x-5' : 'translate-x-0'
            "
          ></span>
        </button>
        <div class="mt-1 text-xs text-gray-400">
          <template v-if="Number(generalValue) === 1">
            通用（所有项目可见，仅管理员可管理）
          </template>
          <template v-else>
            {{
              editingItem.id
                ? `所属项目：${editingItem.project?.name || appStore.defaultProject?.name || '未知项目'}`
                : `所属项目：${appStore.defaultProject?.name || '-'}`
            }}
          </template>
        </div>
      </template>
      <div v-else class="text-sm text-gray-600">
        {{
          editingItem.project?.name ||
          appStore.defaultProject?.name ||
          '未设置当前项目'
        }}
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
