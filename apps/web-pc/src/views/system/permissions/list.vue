<script setup>
import { onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';

const domainColorMap = {
  system: 'blue',
  cms: 'green',
  billing: 'orange',
  ai: 'purple',
};
const actionColorMap = {
  read: 'blue',
  write: 'green',
  publish: 'orange',
  delete: 'red',
  manage: 'purple',
};

const domainOptions = ref([
  { id: 'system', name: 'system' },
  { id: 'cms', name: 'cms' },
  { id: 'billing', name: 'billing' },
  { id: 'ai', name: 'ai' },
]);

const filterFields = ref([
  { field: 'name', label: '编码', type: 'text', span: 8 },
  {
    field: 'domain',
    label: '域',
    type: 'select',
    span: 8,
    attrs: { items: domainOptions },
  },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'name', type: 'text', label: '编码', span: 12, displayOnly: true },
  { field: 'domain', type: 'text', label: '域', span: 12, displayOnly: true },
  {
    field: 'resource',
    type: 'text',
    label: '资源',
    span: 12,
    displayOnly: true,
  },
  { field: 'action', type: 'text', label: '动作', span: 12, displayOnly: true },
  { field: 'label', type: 'text', label: '说明', span: 24, displayOnly: true },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'name', title: '编码', minWidth: 220 },
  {
    field: 'domain',
    title: '域',
    width: 100,
    slots: { default: 'default_domain' },
  },
  { field: 'resource', title: '资源', minWidth: 160 },
  {
    field: 'action',
    title: '动作',
    width: 100,
    slots: { default: 'default_action' },
  },
  { field: 'label', title: '说明', minWidth: 240 },
]);

const allPermissions = ref([]);

onMounted(async () => {
  try {
    const { data } = await new Resource('admin/permissions').list({
      per_page: 'all',
    });
    allPermissions.value = data || [];
    const domains = [...new Set((data || []).map((p) => p.domain))].sort();
    domainOptions.value = domains.map((d) => ({ id: d, name: d }));
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <AppCrudTable
    api-url="admin/permissions"
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
      { key: 'edit', visible: false },
      { key: 'delete', visible: false },
    ]"
    :inline-actions="['view']"
    :toolbar="{ create: false, export: false, more: false }"
    permission-name="system.permission"
    title="权限目录"
    class="p-4"
  >
    <template #default_domain="{ row }">
      <Tag :color="domainColorMap[row.domain] || 'default'">
        {{ row.domain }}
      </Tag>
    </template>
    <template #default_action="{ row }">
      <Tag :color="actionColorMap[row.action] || 'default'">
        {{ row.action }}
      </Tag>
    </template>
  </AppCrudTable>
</template>
