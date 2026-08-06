<script setup>
/**
 * FormTemplateList —— 表单打印模板子组件（内嵌于表单管理页）
 *
 * 对齐 web-admin form-template/list.vue：
 * - print-templates CRUD（printable_type=form, printable_id=formId）
 * - 模板 docx 上传（file_path）+ 默认标记（后端 is_default 互斥）
 * - 在线编辑模板：AppOffice（自部署 DocumentServer）+ asc.formfields 插件注入表单字段树
 * - 编辑结果经 callbackUrl 保存到 print-templates/{id}/file（后端 OnlyOffice 回调保存 docx）
 */
import { computed, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { useUserStore } from '@vben/stores';

import { Button, Drawer } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppOffice from '#/components/AppOffice.vue';
import { useAppStore } from '#/store';

const props = defineProps({
  formId: {
    type: [String, Number],
    default: undefined,
  },
  type: {
    type: [String, Number],
    default: 2,
  },
});

const { hasAccessByCodes, hasAccessByRoles } = useAccess();
const userStore = useUserStore();
const appStore = useAppStore();

const editingItem = ref({});

// 模板公共数据模型（docxtpl 渲染可用变量树）
const typeModels = {
  1: [
    { key: 'template_code', name: '表编号' },
    { key: 'submission_code', name: '文档编号' },
    { key: 'signature_image', name: '手写签名' },
    {
      key: 'datetime',
      name: '时间',
      children: [
        { key: 'year', name: '年' },
        { key: 'month', name: '月' },
        { key: 'day', name: '日' },
        { key: 'date', name: '日期' },
        { key: 'time', name: '时间' },
      ],
    },
    {
      key: 'weather',
      name: '天气',
      children: [
        { key: 'name', name: '名称' },
        { key: 'degree', name: '温度' },
        { key: 'humidity', name: '湿度' },
        { key: 'pressure', name: '气压' },
        { key: 'day_degree_min', name: '最低温度' },
        { key: 'day_degree_max', name: '最高温度' },
        { key: 'wind_power', name: '风级' },
        { key: 'wind_speed', name: '风速' },
        { key: 'wind_direction_name', name: '风向' },
        { key: 'weather', name: '名称+温度范围+风速' },
      ],
    },
    {
      key: 'project',
      name: '项目',
      children: [
        { key: 'name', name: '名称' },
        { key: 'code', name: '编号' },
        { key: 'owner_name', name: '业主' },
        { key: 'supervisor_name', name: '监理单位' },
        { key: 'supervisor_manager', name: '监理单位项目经理' },
      ],
    },
    {
      key: 'task',
      name: '任务',
      children: [
        { key: 'staff_name', name: '执行人' },
        { key: 'mileposts', name: '桩号' },
      ],
    },
  ],
  2: [
    { key: 'template_code', name: '表编号' },
    { key: 'submission_code', name: '文档编号' },
    { key: 'signature_image', name: '手写签名' },
    {
      key: 'datetime',
      name: '时间',
      children: [
        { key: 'year', name: '年' },
        { key: 'month', name: '月' },
        { key: 'day', name: '日' },
        { key: 'date', name: '日期' },
        { key: 'time', name: '时间' },
      ],
    },
    {
      key: 'weather',
      name: '天气',
      children: [
        { key: 'name', name: '名称' },
        { key: 'degree', name: '温度' },
        { key: 'humidity', name: '湿度' },
        { key: 'pressure', name: '气压' },
        { key: 'day_degree_min', name: '最低温度' },
        { key: 'day_degree_max', name: '最高温度' },
        { key: 'wind_power', name: '风级' },
        { key: 'wind_speed', name: '风速' },
        { key: 'wind_direction_name', name: '风向' },
        { key: 'weather', name: '名称+温度范围+风速' },
      ],
    },
    {
      key: 'project',
      name: '项目',
      children: [
        { key: 'name', name: '名称' },
        { key: 'code', name: '编号' },
        { key: 'owner_name', name: '业主' },
        { key: 'supervisor_name', name: '监理单位' },
        { key: 'supervisor_manager', name: '监理单位项目经理' },
      ],
    },
    {
      key: 'task',
      name: '任务',
      children: [
        { key: 'staff_name', name: '执行人' },
        { key: 'mileposts', name: '桩号' },
      ],
    },
  ],
};

// 表单字段树（asc.formfields 插件数据）
const formData = ref(null);
const pluginReady = ref(false);

function buildFieldTree(fields) {
  const tree = [];
  const map = {};
  for (const f of fields) {
    map[f.id] = { key: `_${f.id}`, name: f.name, ...f, children: [] };
  }
  for (const f of fields) {
    if (f.parent_id && map[f.parent_id]) {
      map[f.parent_id].children.push(map[f.id]);
    } else {
      tree.push(map[f.id]);
    }
  }
  return tree;
}

function formatFormFields() {
  const _fields = (formData.value.fields || []).map((item) => ({
    key: `_${item.id}`,
    ...item,
  }));
  const tree = buildFieldTree(_fields);
  const common = JSON.parse(
    JSON.stringify(typeModels[props.type] || typeModels[2]),
  );
  common.forEach((e) => {
    if (e.children?.length) {
      e.children = e.children.map((val) => ({
        key: `${e.key}.${val.key}`,
        name: `${val.name}(${e.name})`,
      }));
    }
  });
  return [...common, { key: 'fields', name: '字段', children: tree }];
}

async function loadFormFields() {
  if (!props.formId) return;
  const { data } = await new Resource('forms').get(props.formId);
  formData.value = data;
  pluginReady.value = true;
}

const plugins = computed(() => ({
  autostart: ['asc.formfields'],
  options: {
    'asc.formfields': { data: formData.value },
  },
}));

const user = computed(() => ({
  name: userStore.userInfo?.name || '系统',
  id: userStore.userInfo?.id || 1,
  image: userStore.userInfo?.avatar,
}));

// ---- 模板列表/表单 ----
const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
]);

const formFields = ref([
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  { field: 'code', type: 'text', label: '编号', span: 12, required: true },
  {
    field: 'file_path',
    type: 'file',
    label: '模板文件',
    span: 24,
    required: true,
    attrs: { fileType: 'file', accept: '.docx,.doc' },
  },
  { field: 'is_default', type: 'switch', label: '默认', span: 12 },
]);

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 160 },
  { field: 'code', title: '编号', width: 120 },
  {
    field: 'is_default',
    title: '默认',
    width: 80,
    slots: { default: 'default_is_default' },
  },
  {
    field: 'project.name',
    title: '项目',
    minWidth: 120,
    slots: { default: 'default_project' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

const extraQuery = computed(() => ({
  printable_type: 'form',
  printable_id: props.formId,
  project_id: appStore.defaultProject?.id,
}));

function saveFormat(payload) {
  return {
    ...payload,
    printable_type: 'form',
    printable_id: props.formId,
    project_id: appStore.defaultProject?.id,
  };
}

// ---- 权限 ----
function rowCan(row, action = 'edit') {
  return (
    hasAccessByRoles(['Super Admin', 'Admin']) ||
    ((!row?.id || appStore.defaultProject?.id === row.project_id) &&
      hasAccessByCodes([`${action} print_template`]))
  );
}

// ---- AppOffice 在线编辑 ----
const officeOpen = ref(false);
const officeDocument = ref(null);
const officeMode = ref('view');
const officeCallbackUrl = computed(
  () =>
    `${import.meta.env.VITE_GLOB_API_URL}/print-templates/${editingItem.value?.id}/file`,
);

function openOffice() {
  if (!editingItem.value?.file_path) return;
  const urlObj = new URL(editingItem.value.file_path, window.location.origin);
  const fileName = urlObj.pathname.split('/').pop() || '';
  officeDocument.value = {
    fileType: 'docx',
    key: fileName.split('.').shift(),
    url: editingItem.value.file_path,
    title: editingItem.value.name,
  };
  officeMode.value = rowCan(editingItem.value, 'edit') ? 'edit' : 'view';
  officeOpen.value = true;
}

watch(
  () => props.formId,
  (id) => {
    if (id) loadFormFields();
  },
  { immediate: true },
);
</script>

<template>
  <div class="rounded border p-3">
    <div class="mb-2 text-sm font-semibold text-gray-500">打印模板</div>
    <AppCrudTable
      v-model="editingItem"
      api-url="print-templates"
      permission-name="print_template"
      :extra-query="extraQuery"
      :filter-fields="filterFields"
      :fields="formFields"
      :save-format="saveFormat"
      :inline-actions="['view', 'edit', 'delete']"
      :grid-options="{
        columns: gridColumns,
        showOverflow: false,
        columnConfig: { resizable: true },
      }"
      :open-mode="{ create: 'modal', detail: 'modal' }"
      :form-attrs="{ layout: 'vertical', size: 'medium' }"
      class="p-2"
    >
      <template #default_is_default="{ row }">
        <span v-if="row.is_default" class="text-green-500">✔</span>
        <span v-else>-</span>
      </template>
      <template #default_project="{ row }">
        {{ row.project_id > 0 ? row.project?.name : '通用' }}
      </template>

      <template #form-action>
        <Button v-if="editingItem.file_path" type="link" @click="openOffice">
          {{ rowCan(editingItem, 'edit') ? '编辑' : '查看' }}模板
        </Button>
      </template>
    </AppCrudTable>

    <!-- AppOffice 模板编辑抽屉 -->
    <Drawer
      v-model:open="officeOpen"
      :title="editingItem.name || '模板编辑'"
      width="90%"
      destroy-on-close
    >
      <div v-if="pluginReady && officeDocument" class="h-[calc(100vh-120px)]">
        <AppOffice
          :document="officeDocument"
          :user="user"
          :plugins="plugins"
          :callback-url="officeCallbackUrl"
          :mode="officeMode"
        />
      </div>
    </Drawer>
  </div>
</template>
