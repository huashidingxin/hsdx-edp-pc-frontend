<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { computed, onMounted, ref } from 'vue';

import { Button, Drawer, Tag, Tree, message } from 'antdv-next';

import Resource from '#/api/resource';
import { requestClient } from '#/api/request';

const filterFields = ref([
  { field: 'name', label: '编码', type: 'text', span: 8 },
  { field: 'display_name', label: '名称', type: 'text', span: 8 },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  {
    field: 'name',
    type: 'text',
    label: '编码',
    span: 12,
    required: true,
    attrs: { placeholder: '如 admin / editor' },
  },
  {
    field: 'display_name',
    type: 'text',
    label: '名称',
    span: 12,
    required: true,
  },
  {
    field: 'description',
    type: 'textarea',
    label: '描述',
    span: 24,
    attrs: { rows: 3 },
  },
  { field: 'is_system', type: 'text', label: '系统角色', span: 12, displayOnly: true },
  { field: 'created_at', type: 'datetime', label: '创建时间', span: 12, displayOnly: true },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'name', title: '编码', minWidth: 140 },
  { field: 'display_name', title: '名称', minWidth: 140 },
  {
    field: 'is_system',
    title: '系统角色',
    width: 100,
    slots: { default: 'default_is_system' },
  },
  { field: 'users_count', title: '成员数', width: 90 },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

function isSystemText(row) {
  return row.is_system ? '预设' : '自定义';
}

/* ===================== 权限树（domain → resource → action） ===================== */
const allPermissions = ref([]);

/** 按 domain → resource 分组构建三层树；叶子 key 为权限 id */
function buildTree(list) {
  const byDomain = new Map();
  list.forEach((p) => {
    if (!byDomain.has(p.domain)) byDomain.set(p.domain, []);
    byDomain.get(p.domain).push(p);
  });

  return [...byDomain.entries()].map(([domain, items]) => {
    const byResource = new Map();
    items.forEach((p) => {
      if (!byResource.has(p.resource)) byResource.set(p.resource, []);
      byResource.get(p.resource).push(p);
    });

    return {
      key: `domain:${domain}`,
      title: domain,
      children: [...byResource.entries()].map(([resource, perms]) => ({
        key: `resource:${domain}:${resource}`,
        title: resource,
        children: perms.map((p) => ({
          key: p.id,
          title: p.label,
        })),
      })),
    };
  });
}

const permissionTree = computed(() => buildTree(allPermissions.value));

/** 组内勾选/取消级联：勾选 resource 补全其下 action，取消同步清掉 */
const leafIds = new Set();

function collectLeaves() {
  leafIds.clear();
  allPermissions.value.forEach((p) => leafIds.add(p.id));
}

function descendantsOf(nodeKey) {
  const out = [];
  const stack = [nodeKey];
  while (stack.length > 0) {
    const cur = stack.pop();
    const node = findNode(permissionTree.value, cur);
    (node?.children || []).forEach((c) => {
      if (typeof c.key === 'number') {
        out.push(c.key);
      } else {
        stack.push(c.key);
      }
    });
  }
  return out;
}

function findNode(nodes, key) {
  for (const n of nodes || []) {
    if (n.key === key) return n;
    const hit = findNode(n.children, key);
    if (hit) return hit;
  }
  return null;
}

async function loadPermissions() {
  try {
    const { data } = await new Resource('permissions').list({
      per_page: 'all',
    });
    allPermissions.value = data || [];
    collectLeaves();
  } catch (error) {
    console.error(error);
  }
}

/* ===================== 分配权限抽屉 ===================== */
const assignOpen = ref(false);
const assignRoleId = ref(null);
const assignRoleName = ref('');
const assignLoading = ref(false);
const checkedKeys = ref([]);
const expandedKeys = ref([]);
const allExpandedKeys = computed(() => {
  const keys = [];
  permissionTree.value.forEach((d) => {
    keys.push(d.key);
    (d.children || []).forEach((r) => keys.push(r.key));
  });
  return keys;
});

async function openAssign(row) {
  assignRoleId.value = row.id;
  assignRoleName.value = row.display_name || row.name;
  checkedKeys.value = [];
  expandedKeys.value = [...allExpandedKeys.value];
  assignOpen.value = true;
  try {
    const { data } = await new Resource(`roles/${row.id}/permissions`).list(
      {},
    );
    // 接口返回权限 id 数组（非对象数组），直接赋值
    checkedKeys.value = data || [];
  } catch (error) {
    console.error(error);
  }
}

function onCheck(checked, e) {
  const base = [...checked];
  const nodeKey = e?.node?.key;
  if (nodeKey !== undefined) {
    const set = new Set(base);
    const descendants = descendantsOf(nodeKey);
    if (e.checked) {
      descendants.forEach((d) => set.add(d));
    } else {
      descendants.forEach((d) => set.delete(d));
    }
    checkedKeys.value = [...set];
  }
}

function checkAll() {
  checkedKeys.value = [...leafIds];
}

function uncheckAll() {
  checkedKeys.value = [];
}

async function saveAssign() {
  assignLoading.value = true;
  try {
    await requestClient.put(`/roles/${assignRoleId.value}/permissions`, {
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
    permission: 'write',
    onClick: (row) => openAssign(row),
    order: 35,
  },
]);

onMounted(loadPermissions);
</script>

<template>
  <div class="h-full">
    <AppCrudTable
      api-url="roles"
      :filter-fields="filterFields"
      :fields="formFields"
      :actions-config="actionsConfig"
      :inline-actions="['view', 'edit', 'assign_permissions', 'delete']"
      permission-name="system.role"
      :grid-options="{
        columns: gridColumns,
        showOverflow: false,
        columnConfig: { resizable: true },
      }"
      :open-mode="{ create: 'modal', detail: 'modal' }"
      :form-attrs="{ layout: 'vertical', size: 'medium' }"
      title="角色管理"
      class="p-4"
    >
      <template #default_is_system="{ row }">
        <Tag :color="row.is_system ? 'orange' : 'green'">
          {{ isSystemText(row) }}
        </Tag>
      </template>
    </AppCrudTable>

    <Drawer
      :open="assignOpen"
      :title="`分配权限 - ${assignRoleName}`"
      width="560"
      @close="assignOpen = false"
    >
      <div class="mb-2 text-xs text-gray-500">
        权限按 域（domain）→ 资源（resource）→ 动作（action）三层分组。
        勾选资源节点将自动勾选其全部动作；取消勾选同步清除该节点全部动作。
      </div>
      <div class="mb-2 flex gap-2">
        <Button size="small" @click="checkAll">全选</Button>
        <Button size="small" @click="uncheckAll">清空</Button>
        <span class="text-xs leading-6 text-gray-400">
          已选 {{ checkedKeys.length }} / {{ leafIds.size }}
        </span>
      </div>
      <div
        style="height: calc(100vh - 260px); overflow-y: auto"
        class="rounded border border-gray-200 dark:border-gray-600"
      >
        <Tree
          :checked-keys="checkedKeys"
          :tree-data="permissionTree"
          :expanded-keys="expandedKeys"
          checkable
          check-strictly
          block-node
          @check="onCheck"
          @expand="(keys) => (expandedKeys = keys)"
        />
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button @click="assignOpen = false">取消</Button>
          <Button type="primary" :loading="assignLoading" @click="saveAssign">
            保存
          </Button>
        </div>
      </template>
    </Drawer>
  </div>
</template>
