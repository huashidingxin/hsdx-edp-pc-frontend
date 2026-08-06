<script setup>
/**
 * 打印模板（独立页）—— print-templates 资源 CRUD
 * 菜单 component=/form-template/list 对应；表单内嵌场景用 views/form/form-template-list.vue
 * 与内嵌版差异：支持选择所属表单（printable_id），无表单上下文时 AppOffice 编辑不含字段面板插件
 */
import { computed, ref } from 'vue';

import { useAccess } from '@vben/access';
import { useUserStore } from '@vben/stores';

import { Button, Drawer } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppOffice from '#/components/AppOffice.vue';
import { useAppStore } from '#/store';

const { hasAccessByCodes, hasAccessByRoles } = useAccess();
const userStore = useUserStore();
const appStore = useAppStore();

const editingItem = ref({});
const formOptions = ref([]);
const formNameMap = ref({});

async function loadForms() {
  const { data } = await new Resource('forms').list({ per_page: 'all' });
  formOptions.value = (data || []).map((f) => ({ value: f.id, label: f.name }));
  formNameMap.value = {};
  (data || []).forEach((f) => (formNameMap.value[f.id] = f.name));
  const f = formFields.value.find((x) => x.field === 'printable_id');
  if (f) f.attrs.options = formOptions.value;
  const f2 = filterFields.value.find((x) => x.field === 'printable_id');
  if (f2) f2.attrs.options = formOptions.value;
}

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
  {
    field: 'printable_id',
    label: '所属表单',
    type: 'select',
    span: 8,
    attrs: { options: [] },
  },
]);

const formFields = ref([
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  { field: 'code', type: 'text', label: '编号', span: 12, required: true },
  {
    field: 'printable_id',
    type: 'select',
    label: '所属表单',
    span: 12,
    required: true,
    attrs: { options: [] },
  },
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
    field: 'printable_id',
    title: '所属表单',
    minWidth: 140,
    slots: { default: 'default_form' },
  },
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
  printable_id: editingItem.value?.id ? undefined : undefined,
  project_id: appStore.defaultProject?.id,
}));

function saveFormat(payload) {
  return {
    ...payload,
    printable_type: 'form',
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

// ---- AppOffice 编辑 ----
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

const user = computed(() => ({
  name: userStore.userInfo?.name || '系统',
  id: userStore.userInfo?.id || 1,
  image: userStore.userInfo?.avatar,
}));

loadForms();
</script>

<template>
  <div>
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
      :open-mode="{ create: 'drawer', detail: 'drawer' }"
      :form-attrs="{ layout: 'vertical', size: 'medium' }"
      title="打印模板"
      class="p-4"
    >
      <template #default_form="{ row }">
        {{ formNameMap[row.printable_id] || `#${row.printable_id}` }}
      </template>
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

    <Drawer
      v-model:open="officeOpen"
      :title="editingItem.name || '模板编辑'"
      width="90%"
      destroy-on-close
    >
      <div v-if="officeDocument" class="h-[calc(100vh-120px)]">
        <AppOffice
          :document="officeDocument"
          :user="user"
          :callback-url="officeCallbackUrl"
          :mode="officeMode"
        />
      </div>
    </Drawer>
  </div>
</template>
