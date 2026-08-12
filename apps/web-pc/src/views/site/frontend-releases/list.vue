<script setup>
import { ref } from 'vue';

import { Tag, message } from 'antdv-next';

import Resource from '#/api/resource';

const statusMap = { created: '已创建', active: '已激活', retired: '已下线' };
const statusColor = { created: 'default', active: 'green', retired: 'gray' };

const filterFields = ref([]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'project_id', type: 'text', label: '项目', span: 12, displayOnly: true },
  { field: 'version', type: 'text', label: '版本', span: 12, displayOnly: true },
  {
    field: 'schema_version',
    type: 'text',
    label: 'Schema 版本',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'status_label',
    type: 'text',
    label: '状态',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'created_at',
    type: 'datetime',
    label: '创建时间',
    span: 12,
    displayOnly: true,
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'project_id', title: '项目', minWidth: 160 },
  { field: 'version', title: '版本', minWidth: 140 },
  { field: 'schema_version', title: 'Schema 版本', width: 120 },
  {
    field: 'status_label',
    title: '状态',
    width: 100,
    slots: { default: 'default_status' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

const formData = ref(null);
const crudRef = ref(null);

async function doActivate(row) {
  try {
    await new Resource(`admin/frontend-releases/${row.id}/activate`).store({});
    message.success('已激活');
    crudRef.value?.refresh();
  } catch {
    message.error('激活失败');
  }
}

async function doRollback() {
  try {
    await new Resource('admin/frontend-releases/rollback').store({});
    message.success('已回滚到上一版本');
    crudRef.value?.refresh();
  } catch {
    message.error('回滚失败');
  }
}

const actionsConfig = ref([
  {
    key: 'activate',
    label: '激活',
    icon: 'mdi--play-circle-outline',
    permission: 'publish',
    visible: (row) => row.status_label !== 'active',
    confirm: true,
    confirmTitle: '确定激活该版本吗？',
    onClick: (row) => doActivate(row),
    order: 35,
  },
  {
    key: 'rollback',
    label: '回滚',
    icon: 'mdi--restore',
    permission: 'publish',
    confirm: true,
    confirmTitle: '确定回滚到上一版本吗？',
    onClick: () => doRollback(),
    order: 40,
  },
]);
</script>

<template>
  <AppCrudTable
    ref="crudRef"
    api-url="admin/frontend-releases"
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
    :actions-config="actionsConfig"
    :inline-actions="['view', 'activate', 'rollback']"
    :toolbar="{ create: false, more: false }"
    permission-name="cms.frontend_release"
    title="前端版本"
    class="p-4"
  >
    <template #default_status="{ row }">
      <Tag :color="statusColor[row.status_label] || 'default'">
        {{ statusMap[row.status_label] || row.status_label || '-' }}
      </Tag>
    </template>
  </AppCrudTable>
</template>
