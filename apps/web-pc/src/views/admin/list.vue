<script setup>
import { onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';
import Resource from '#/api/resource';

const filterFields = ref([
  { field: 'keyword', label: '关键词', type: 'text', span: 6 },
  { field: 'username', label: '用户名', type: 'text', span: 6 },
  { field: 'mobile', label: '手机号', type: 'text', span: 6 },
  { field: 'email', label: '邮箱', type: 'text', span: 6 },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'name', type: 'text', label: '姓名', span: 12 },
  { field: 'username', type: 'text', label: '用户名', span: 12, required: true },
  { field: 'mobile', type: 'text', label: '手机号', span: 12 },
  { field: 'email', type: 'text', label: '邮箱', span: 12 },
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
  { field: 'created_at', type: 'datetime', label: '创建时间', span: 12, displayOnly: true },
  { field: 'updated_at', type: 'datetime', label: '更新时间', span: 12, displayOnly: true },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 150 },
  { field: 'name', title: '姓名', minWidth: 120, formatter: emptyText },
  { field: 'username', title: '用户名', minWidth: 130 },
  { field: 'mobile', title: '手机号', width: 130, formatter: emptyText },
  { field: 'email', title: '邮箱', minWidth: 170, formatter: emptyText },
  { field: 'roles', title: '角色', minWidth: 180, slots: { default: 'default_roles' } },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

const formData = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === '' ? '-' : cellValue;
}

function roleTitle(role) {
  return role?.display_name || role?.name || '-';
}

async function loadRoles() {
    try{
        const api = new Resource('roles');
        const { data } = await api.list({
            per_page: 'all',
        });
        formFields.value[6].attrs.options = data;
    }catch(e) {
        console.log(e)
    }

}

onMounted(() => {
  loadRoles();
});
</script>

<template>
  <AppCrudTable
    api-url="admins"
    v-model="formData"
    :filter-fields="filterFields"
    :fields="formFields"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="管理员管理"
    class="p-4"
  >
    <template #default_roles="{ row }">
      <div class="flex flex-wrap gap-1">
        <Tag v-for="role in row.roles || []" :key="role.id || role.name" color="blue">
          {{ roleTitle(role) }}
        </Tag>
        <span v-if="!row.roles?.length">-</span>
      </div>
    </template>
  </AppCrudTable>
</template>
