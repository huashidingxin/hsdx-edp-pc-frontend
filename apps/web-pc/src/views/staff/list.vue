<script setup>
import { onMounted, ref } from 'vue';

import { Button, message, Modal, Select, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const filterFields = ref([
  { field: 'name', label: '姓名', type: 'text', span: 6 },
  { field: 'username', label: '用户名', type: 'text', span: 6 },
  { field: 'mobile', label: '手机号', type: 'text', span: 6 },
  {
    field: 'state',
    label: '状态',
    type: 'select',
    span: 6,
    attrs: {
      allowClear: true,
      items: [
        { id: 1, name: '在职' },
        { id: 2, name: '请假' },
        { id: 3, name: '离职' },
        { id: 4, name: '禁用' },
      ],
    },
  },
]);

const formFields = ref([
  { field: 'username', type: 'text', label: '用户名', span: 12, required: true },
  { field: 'password', type: 'text', label: '密码', span: 12,
    attrs: { type: 'password', autocomplete: 'new-password', placeholder: '留空则不修改' } },
  { field: 'name', type: 'text', label: '姓名', span: 12, required: true },
  { field: 'mobile', type: 'text', label: '手机号', span: 12 },
  { field: 'email', type: 'text', label: '邮箱', span: 12 },
  { field: 'avatar', type: 'file', label: '头像', span: 12 },
  { field: 'id_photo', type: 'file', label: '证件照', span: 12 },
  { field: 'code', type: 'text', label: '工号', span: 12 },
  {
    field: 'position_id',
    type: 'select',
    label: '职位',
    span: 12,
    attrs: { allowClear: true, fieldNames: { label: 'name', value: 'id' }, placeholder: '请选择职位' },
  },
  { field: 'joining_date', type: 'datetime', label: '入职日期', span: 12 },
  {
    field: 'state',
    type: 'select',
    label: '状态',
    span: 12,
    attrs: {
      items: [
        { id: 1, name: '在职' },
        { id: 2, name: '请假' },
        { id: 3, name: '离职' },
        { id: 4, name: '禁用' },
      ],
    },
  },
]);

const gridColumns = ref([
  { field: 'avatar', title: '头像', width: 70, slots: { default: 'default_avatar' } },
  { field: 'name', title: '姓名', minWidth: 100 },
  { field: 'username', title: '用户名', minWidth: 120 },
  { field: 'mobile', title: '手机号', width: 130, formatter: emptyText },
  { field: 'email', title: '邮箱', minWidth: 160, formatter: emptyText },
  { field: 'department', title: '部门', minWidth: 120, slots: { default: 'default_department' } },
  { field: 'position', title: '职位', minWidth: 120, slots: { default: 'default_position' } },
  { field: 'state', title: '状态', width: 90, slots: { default: 'default_state' } },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

function emptyText({ cellValue }) {
  return cellValue == null || cellValue === '' ? '-' : cellValue;
}
function stateText(s) {
  return { 1: '在职', 2: '请假', 3: '离职', 4: '禁用' }[s] || '-';
}
function stateColor(s) {
  return { 1: 'green', 2: 'orange', 3: 'red', 4: 'default' }[s] || 'default';
}

const positions = ref([]);
async function loadPositions() {
  try {
    const { data } = await new Resource('positions').list({ per_page: 'all' });
    positions.value = data || [];
    const field = formFields.value.find((f) => f.field === 'position_id');
    if (field) field.attrs.items = positions.value;
  } catch (error) {
    console.error(error);
  }
}

/* ===================== 单个离职 ===================== */
function resign(row) {
  Modal.confirm({
    title: `确认将 ${row.name || row.username} 设为离职？`,
    okText: '确认离职',
    okType: 'danger',
    onOk: async () => {
      try {
        await new Resource(`staff/${row.id}/resign`).store({});
        message.success('操作成功');
      } catch {
        message.error('操作失败');
      }
    },
  });
}

const actionsConfig = ref([
  {
    key: 'resign',
    label: '离职',
    icon: 'mdi--account-off-outline',
    danger: true,
    permission: 'resign',
    visible: (row) => row.state !== 3 && row.state !== 4,
    onClick: (row) => resign(row),
    order: 35,
  },
]);

/* ===================== 批量离职 ===================== */
const batchOpen = ref(false);
const batchSelected = ref([]);
const batchOptions = ref([]);
const batchLoading = ref(false);

async function openBatch() {
  batchSelected.value = [];
  batchOptions.value = [];
  batchOpen.value = true;
  try {
    const { data } = await new Resource('staff').list({ per_page: 'all' });
    batchOptions.value = (data || []).map((s) => ({
      label: s.name || s.username,
      value: s.id,
    }));
  } catch (error) {
    console.error(error);
  }
}

async function saveBatch() {
  if (batchSelected.value.length === 0) {
    message.warning('请选择员工');
    return;
  }
  Modal.confirm({
    title: `确认将选中的 ${batchSelected.value.length} 名员工设为离职？`,
    okText: '确认离职',
    okType: 'danger',
    onOk: async () => {
      batchLoading.value = true;
      try {
        await new Resource('batch-resign').store({ list: batchSelected.value });
        message.success('操作成功');
        batchOpen.value = false;
      } catch {
        message.error('操作失败');
      } finally {
        batchLoading.value = false;
      }
    },
  });
}

onMounted(loadPositions);
</script>

<template>
  <AppCrudTable
    api-url="staff"
    :filter-fields="filterFields"
    :fields="formFields"
    :actions-config="actionsConfig"
    permission-name="staff"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="员工管理"
    class="p-4"
  >
    <template #toolbar-append>
      <Button type="primary" @click="openBatch">批量离职</Button>
    </template>
    <template #default_avatar="{ row }">
      <img v-if="row.avatar" :src="row.avatar" class="h-8 w-8 rounded-full object-cover" />
      <span v-else>-</span>
    </template>
    <template #default_department="{ row }">
      {{ row.department?.name || '-' }}
    </template>
    <template #default_position="{ row }">
      {{ row.position?.name || '-' }}
    </template>
    <template #default_state="{ row }">
      <Tag :color="stateColor(row.state)">{{ stateText(row.state) }}</Tag>
    </template>
  </AppCrudTable>

  <Modal
    :open="batchOpen"
    title="批量离职"
    :confirm-loading="batchLoading"
    @cancel="batchOpen = false"
    @ok="saveBatch"
  >
    <p class="mb-2 text-gray-500">选择需要设为离职的员工：</p>
    <Select
      v-model:value="batchSelected"
      mode="multiple"
      style="width: 100%"
      :options="batchOptions"
      placeholder="请选择员工"
      :max-tag-count="5"
    />
  </Modal>
</template>
