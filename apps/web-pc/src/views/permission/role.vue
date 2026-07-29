<script setup>
import { onMounted, ref } from 'vue';

import { Button, Drawer, message, Tag, Tree } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const filterFields = ref([
  { field: 'name', label: '编码', type: 'text', span: 8 },
  { field: 'display_name', label: '名称', type: 'text', span: 8 },
]);

const formFields = ref([
  { field: 'name', type: 'text', label: '编码', span: 12, required: true,
    attrs: { placeholder: '如 admin / manager' } },
  { field: 'display_name', type: 'text', label: '名称', span: 12, required: true },
  {
    field: 'scope',
    type: 'select',
    label: '作用域',
    span: 12,
    attrs: {
      items: [
        { id: 1, name: '项目级' },
        { id: 2, name: '团队级' },
        { id: 3, name: '全局' },
      ],
    },
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'name', title: '编码', minWidth: 160 },
  { field: 'display_name', title: '名称', minWidth: 160 },
  { field: 'scope', title: '作用域', width: 90, slots: { default: 'default_scope' } },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

const scopeMap = { 1: '项目级', 2: '团队级', 3: '全局' };
function scopeText(s) {
  return scopeMap[s] || '-';
}

/* ===================== 权限树 ===================== */
const permissionTree = ref([]);

function buildTree(list) {
  const nodes = new Map();
  list.forEach((p) => nodes.set(p.id, { key: p.id, title: p.display_name || p.name, children: [] }));
  const roots = [];
  list.forEach((p) => {
    const node = nodes.get(p.id);
    if (p.parent_id && nodes.has(p.parent_id)) {
      nodes.get(p.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

async function loadPermissions() {
  try {
    const { data } = await new Resource('permissions').list({ per_page: 'all' });
    permissionTree.value = buildTree(data || []);
  } catch (error) {
    console.error(error);
  }
}

/* ===================== 分配权限抽屉 ===================== */
const assignOpen = ref(false);
const assignRoleId = ref(null);
const assignRoleName = ref('');
const checkedKeys = ref([]);
const expandedKeys = ref([]);
const assignLoading = ref(false);

async function openAssign(row) {
  assignRoleId.value = row.id;
  assignRoleName.value = row.display_name || row.name;
  checkedKeys.value = [];
  expandedKeys.value = (permissionTree.value || []).map((n) => n.key);
  assignOpen.value = true;
  try {
    const { data } = await new Resource(`roles/${row.id}/permissions`).list({});
    checkedKeys.value = (data || []).map((p) => p.id);
  } catch (error) {
    console.error(error);
  }
}

async function saveAssign() {
  assignLoading.value = true;
  try {
    await new Resource(`roles/${assignRoleId.value}/permissions`).store({
      permissions: checkedKeys.value,
    });
    message.success('权限已保存');
    assignOpen.value = false;
  } catch {
    message.error('保存失败');
  } finally {
    assignLoading.value = false;
  }
}

const actionsConfig = ref([
  {
    key: 'assign_permissions',
    label: '分配权限',
    icon: 'mdi--key-outline',
    permission: 'update',
    onClick: (row) => openAssign(row),
    order: 35,
  },
]);

onMounted(loadPermissions);
</script>

<template>
  <AppCrudTable
    api-url="roles"
    :filter-fields="filterFields"
    :fields="formFields"
    :actions-config="actionsConfig"
    :inline-actions="['view', 'edit', 'assign_permissions', 'delete']"
    permission-name="role"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="角色管理"
    class="p-4"
  >
    <template #default_scope="{ row }">
      <Tag color="purple">{{ scopeText(row.scope) }}</Tag>
    </template>
  </AppCrudTable>

  <Drawer
    :open="assignOpen"
    :title="`分配权限 - ${assignRoleName}`"
    width="460"
    @close="assignOpen = false"
  >
    <Tree
      v-model:checked-keys="checkedKeys"
      :tree-data="permissionTree"
      checkable
      :expanded-keys="expandedKeys"
      block-node
      :height="480"
      @expand="(keys) => (expandedKeys = keys)"
    />
    <template #footer>
      <div class="flex justify-end gap-2">
        <Button @click="assignOpen = false">取消</Button>
        <Button type="primary" :loading="assignLoading" @click="saveAssign">保存</Button>
      </div>
    </template>
  </Drawer>
</template>
