<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { onMounted, ref } from 'vue';

import { Button, Modal, Select, Tag, message } from 'antdv-next';

import Resource from '#/api/resource';
import { requestClient } from '#/api/request';

const STATUS_OPTIONS = [
  { id: 1, name: '正常' },
  { id: 2, name: '禁用' },
];
const statusColor = { 1: 'green', 2: 'red' };

const filterFields = ref([
  { field: 'keyword', label: '关键词', type: 'text', span: 6 },
  { field: 'username', label: '用户名', type: 'text', span: 6 },
  { field: 'mobile', label: '手机号', type: 'text', span: 6 },
  { field: 'email', label: '邮箱', type: 'text', span: 6 },
  {
    field: 'status',
    label: '状态',
    type: 'select',
    span: 6,
    attrs: { fieldNames: { label: 'name', value: 'id' },
      items: STATUS_OPTIONS },
  },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'name', type: 'text', label: '姓名', span: 12 },
  { field: 'username', type: 'text', label: '用户名', span: 12 },
  { field: 'email', type: 'text', label: '邮箱', span: 12, required: true },
  { field: 'mobile', type: 'text', label: '手机号', span: 12 },
  {
    field: 'password',
    type: 'text',
    label: '密码',
    span: 12,
    attrs: { type: 'password', autocomplete: 'new-password' },
  },
  {
    field: 'role_ids',
    type: 'select',
    label: '角色',
    span: 24,
    attrs: {
      mode: 'multiple',
      fieldNames: { label: 'display_name', value: 'id' },
      optionFilterProp: 'display_name',
      placeholder: '请选择角色；清空角色将恢复为普通用户',
    },
  },
  {
    field: 'status',
    type: 'select',
    label: '状态',
    span: 12,
    attrs: { items: STATUS_OPTIONS },
  },
  {
    field: 'last_login_at',
    type: 'datetime',
    label: '最近登录',
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
  {
    field: 'updated_at',
    type: 'datetime',
    label: '更新时间',
    span: 12,
    displayOnly: true,
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 90 },
  { field: 'name', title: '姓名', minWidth: 120, formatter: emptyText },
  { field: 'username', title: '用户名', minWidth: 130, formatter: emptyText },
  { field: 'email', title: '邮箱', minWidth: 180, formatter: emptyText },
  { field: 'mobile', title: '手机号', width: 130, formatter: emptyText },
  {
    field: 'roles',
    title: '角色',
    minWidth: 180,
    slots: { default: 'default_roles' },
  },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'last_login_at', title: '最近登录', minWidth: 170, formatter: emptyText },
  { field: 'created_at', title: '创建时间', minWidth: 170 },
]);

const formData = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

function roleTitle(role) {
  return role?.display_name || role?.name || '-';
}

/* ===================== 角色选项 ===================== */
const roleOptions = ref([]);

async function loadRoles() {
  try {
    const api = new Resource('roles');
    const { data } = await api.list({ per_page: 'all' });
    roleOptions.value = data || [];
  } catch (error) {
    console.error(error);
  }
}

/* ===================== 分配角色弹窗 ===================== */
const assignOpen = ref(false);
const assignUserId = ref(null);
const assignUserName = ref('');
const assignLoading = ref(false);
const assignRoleIds = ref([]);

function openAssignRoles(row) {
  assignUserId.value = row.id;
  assignUserName.value = row.name || row.username || row.email;
  assignRoleIds.value = (row.roles || []).map((r) => r.id);
  assignOpen.value = true;
}

async function saveAssignRoles() {
  assignLoading.value = true;
  try {
    await requestClient.put(`/admin-users/${assignUserId.value}/roles`, {
      role_ids: assignRoleIds.value,
    });
    message.success('角色已保存');
    assignOpen.value = false;
    crudRef.value?.refresh();
  } catch (error) {
    message.error('保存失败');
  } finally {
    assignLoading.value = false;
  }
}

const crudRef = ref(null);

onMounted(() => {
  loadRoles();
});
</script>

<template>
  <div class="h-full">
    <AppCrudTable
      ref="crudRef"
      api-url="admin-users"
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
      :actions-config="[
        {
          key: 'assign_roles',
          label: '分配角色',
          icon: 'mdi--account-key-outline',
          permission: 'write',
          onClick: (row) => openAssignRoles(row),
          order: 35,
        },
      ]"
      :inline-actions="['view', 'edit', 'assign_roles', 'delete']"
      permission-name="system.user"
      title="管理员管理"
      class="p-4"
    >
      <template #default_roles="{ row }">
        <div class="flex flex-wrap gap-1">
          <Tag
            v-for="role in row.roles || []"
            :key="role.id || role.name"
            color="blue"
          >
            {{ roleTitle(role) }}
          </Tag>
          <span v-if="!row.roles?.length">-</span>
        </div>
      </template>

      <template #default_status="{ row }">
        <Tag :color="statusColor[row.status] || 'default'">
          {{ row.status_label || '-' }}
        </Tag>
      </template>
    </AppCrudTable>

    <Modal
      :open="assignOpen"
      :title="`分配角色 - ${assignUserName}`"
      :confirm-loading="assignLoading"
      width="480"
      @ok="saveAssignRoles"
      @cancel="assignOpen = false"
    >
      <p class="mb-2 text-xs text-gray-500">
        清空角色将恢复为普通用户（无任何权限）。
      </p>
      <Select
        v-model:value="assignRoleIds"
        :options="roleOptions"
        mode="multiple"
        :field-names="{ label: 'display_name', value: 'id' }"
        option-filter-prop="display_name"
        style="width: 100%"
        placeholder="请选择角色"
      />
    </Modal>
  </div>
</template>
