<script setup>
import { computed, onMounted, ref } from 'vue';

import { Button, Drawer, message, TabPane, Tabs, Tag, Tree } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { Page } from '@vben/common-ui';

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

/* ===================== 权限分组树 =====================
 * 三层权限模型（点分规范）：
 * - type=1  PC 菜单可见性（menu.*）
 * - type=4  APP 菜单可见性（menu.app_*）
 * - type=2  功能权限：资源容器 → 动作叶子（view/create/edit/delete/audit/assign）
 */
const PERMISSION_GROUPS = [
  { key: 'func', label: '功能权限', types: [2] },
  { key: 'pc', label: 'PC 菜单', types: [1] },
  { key: 'app', label: 'APP 菜单', types: [4] },
];

const allPermissions = ref([]);

function buildTree(list) {
  const nodes = new Map();
  list.forEach((p) =>
    nodes.set(p.id, {
      key: p.id,
      title: p.display_name ? `${p.display_name}（${p.name}）` : p.name,
      children: [],
    }),
  );
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

const groupData = computed(() => {
  const result = {};
  PERMISSION_GROUPS.forEach((g) => {
    const list = allPermissions.value.filter((p) => g.types.includes(p.type));
    result[g.key] = {
      list,
      tree: buildTree(list),
      ids: new Set(list.map((p) => p.id)),
    };
  });
  return result;
});

/** 组内 id → 子孙 id 列表（用于勾选级联） */
function descendantsOf(groupKey, id) {
  const list = groupData.value[groupKey]?.list || [];
  const childrenMap = new Map();
  list.forEach((p) => {
    if (!childrenMap.has(p.parent_id)) childrenMap.set(p.parent_id, []);
    childrenMap.get(p.parent_id).push(p.id);
  });
  const out = [];
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop();
    (childrenMap.get(cur) || []).forEach((c) => {
      out.push(c);
      stack.push(c);
    });
  }
  return out;
}

async function loadPermissions() {
  try {
    const { data } = await new Resource('permissions').list({ per_page: 'all' });
    allPermissions.value = data || [];
  } catch (error) {
    console.error(error);
  }
}

/* ===================== 分配权限抽屉 ===================== */
const assignOpen = ref(false);
const assignRoleId = ref(null);
const assignRoleName = ref('');
const assignRoleScope = ref(null);
const assignLoading = ref(false);
const activeTab = ref('func');

/** 每组独立勾选状态；checkStrictly 精确模式：勾什么存什么，回显不失真 */
const checkedByGroup = ref({ func: [], pc: [], app: [] });
const expandedByGroup = ref({ func: [], pc: [], app: [] });

async function openAssign(row) {
  assignRoleId.value = row.id;
  assignRoleName.value = row.display_name || row.name;
  assignRoleScope.value = row.scope;
  activeTab.value = 'func';
  checkedByGroup.value = { func: [], pc: [], app: [] };
  expandedByGroup.value = {
    func: (groupData.value.func?.tree || []).map((n) => n.key),
    pc: (groupData.value.pc?.tree || []).map((n) => n.key),
    app: (groupData.value.app?.tree || []).map((n) => n.key),
  };
  assignOpen.value = true;
  try {
    const { data } = await new Resource(`roles/${row.id}/permissions`).list({});
    const owned = new Set((data || []).map((p) => p.id));
    PERMISSION_GROUPS.forEach((g) => {
      checkedByGroup.value[g.key] = [...owned].filter((id) =>
        groupData.value[g.key].ids.has(id),
      );
    });
  } catch (error) {
    console.error(error);
  }
}

/** 严格模式下勾父级联子孙：勾选补齐子孙、取消同步清掉子孙 */
function onGroupCheck(groupKey, checkedInfo, e) {
  const base = Array.isArray(checkedInfo) ? checkedInfo : checkedInfo?.checked || [];
  const set = new Set(base);
  const nodeKey = e?.node?.key;
  if (nodeKey !== undefined) {
    const descendants = descendantsOf(groupKey, nodeKey);
    if (e.checked) {
      descendants.forEach((d) => set.add(d));
    } else {
      descendants.forEach((d) => set.delete(d));
    }
  }
  checkedByGroup.value[groupKey] = [...set];
}

function checkAll(groupKey) {
  checkedByGroup.value[groupKey] = [...groupData.value[groupKey].ids];
}

function uncheckAll(groupKey) {
  checkedByGroup.value[groupKey] = [];
}

async function saveAssign() {
  assignLoading.value = true;
  try {
    const permissions = [
      ...checkedByGroup.value.func,
      ...checkedByGroup.value.pc,
      ...checkedByGroup.value.app,
    ];
    await new Resource(`roles/${assignRoleId.value}/permissions`).store({
      permissions,
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
    permission: 'edit',
    onClick: (row) => openAssign(row),
    order: 35,
  },
]);

onMounted(loadPermissions);
</script>

<template>
  <Page auto-content-height>
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
      width="560"
      @close="assignOpen = false"
    >
    <div class="mb-2 text-xs text-gray-500">
      作用域：{{ scopeText(assignRoleScope) }}。勾选父节点将自动勾选其全部子权限；
      取消勾选仅影响该节点及其子孙，父节点可独立保留。
    </div>
    <Tabs v-model:active-key="activeTab">
      <TabPane v-for="g in PERMISSION_GROUPS" :key="g.key" :tab="g.label">
        <div class="mb-2 flex gap-2">
          <Button size="small" @click="checkAll(g.key)">全选</Button>
          <Button size="small" @click="uncheckAll(g.key)">清空</Button>
          <span class="text-xs leading-6 text-gray-400">
            已选 {{ checkedByGroup[g.key].length }} / {{ groupData[g.key]?.list.length || 0 }}
          </span>
        </div>
        <Tree
          :checked-keys="checkedByGroup[g.key]"
          :tree-data="groupData[g.key]?.tree || []"
          :expanded-keys="expandedByGroup[g.key]"
          checkable
          check-strictly
          block-node
          :height="440"
          @check="(keys, e) => onGroupCheck(g.key, keys, e)"
          @expand="(keys) => (expandedByGroup[g.key] = keys)"
        />
      </TabPane>
    </Tabs>
    <template #footer>
      <div class="flex justify-end gap-2">
        <Button @click="assignOpen = false">取消</Button>
        <Button type="primary" :loading="assignLoading" @click="saveAssign">保存</Button>
      </div>
    </template>
  </Drawer>
</Page>
</template>
