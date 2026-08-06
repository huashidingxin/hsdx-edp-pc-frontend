<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import { Button, Input, message, Modal, Radio, Tag, Tree } from 'antdv-next';

import Resource from '#/api/resource';
import { useAppStore } from '#/store';

const { hasAccessByCodes } = useAccess();
const appStore = useAppStore();

const canCreate = computed(() => hasAccessByCodes(['division.create']));
const canEdit = computed(() => hasAccessByCodes(['division.edit']));
const canDelete = computed(() => hasAccessByCodes(['division.delete']));

const projectId = computed(() => appStore.defaultProject?.id);

const treeData = ref([]);
const expandedKeys = ref([]);
const allExpanded = ref(false);

const levelNames = {
  1: '单位工程',
  2: '子单位工程',
  3: '分部工程',
  4: '子分部工程',
  5: '分项工程',
  6: '子分项工程',
  7: '检验批',
};
const levelColors = {
  1: 'blue',
  2: 'green',
  3: 'orange',
  4: 'red',
  5: 'default',
  6: 'cyan',
  7: 'purple',
};

// 每个父层级可选的子层级（与 App 端一致）
const parentLevelOptions = {
  null: [{ label: '单位工程', value: 1 }],
  1: [
    { label: '子单位工程', value: 2 },
    { label: '分部工程', value: 3 },
  ],
  2: [{ label: '分部工程', value: 3 }],
  3: [
    { label: '子分部工程', value: 4 },
    { label: '分项工程', value: 5 },
  ],
  4: [{ label: '分项工程', value: 5 }],
  5: [
    { label: '子分项工程', value: 6 },
    { label: '检验批', value: 7 },
  ],
  6: [{ label: '检验批', value: 7 }],
  7: [],
};

function toTreeNode(node) {
  return {
    key: node.id,
    id: node.id,
    name: node.name,
    code: node.code,
    level: node.level,
    parent_id: node.parent_id,
    children: (node.children || []).map(toTreeNode),
  };
}

function buildTree(flat) {
  const map = new Map();
  (flat || []).forEach((d) => map.set(d.id, { ...d, children: [] }));
  const roots = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots.map(toTreeNode);
}

function collectKeys(nodes) {
  return nodes.flatMap((n) => [n.key, ...collectKeys(n.children || [])]);
}

async function loadAll() {
  if (!projectId.value) {
    treeData.value = [];
    return;
  }
  try {
    const { data } = await new Resource('divisions').list({
      project_id: projectId.value,
      per_page: 'all',
    });
    treeData.value = buildTree(data);
    if (allExpanded.value) {
      expandedKeys.value = collectKeys(treeData.value);
    }
  } catch (error) {
    console.error(error);
    message.error('项目划分加载失败');
  }
}

watch(() => appStore.defaultProject?.id, loadAll);
onMounted(loadAll);

function toggleAll() {
  allExpanded.value = !allExpanded.value;
  expandedKeys.value = allExpanded.value ? collectKeys(treeData.value) : [];
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(String(code || ''));
    message.success('编号已复制');
  } catch {
    /* 剪贴板不可用时静默 */
  }
}

/* ===================== 新增/编辑弹窗 ===================== */
const open = ref(false);
const isEdit = ref(false);
const editingId = ref(null);
const form = ref({
  name: '',
  code: '',
  parent_id: null,
  parent_level: null,
  level: 1,
  project_id: null,
});

const availableLevels = computed(() => parentLevelOptions[form.value.parent_level] || []);

function openAdd(parent) {
  isEdit.value = false;
  editingId.value = null;
  form.value = {
    name: '',
    code: parent ? `${parent.code}-` : '',
    parent_id: parent?.id || null,
    parent_level: parent?.level ?? null,
    level: (parent?.level || 0) + 1,
    project_id: projectId.value,
  };
  open.value = true;
}

function openEdit(node) {
  isEdit.value = true;
  editingId.value = node.id;
  form.value = {
    name: node.name,
    code: node.code,
    parent_id: node.parent_id,
    parent_level: null,
    level: node.level,
    project_id: projectId.value,
  };
  open.value = true;
}

function closeDialog() {
  open.value = false;
}

async function submit() {
  if (!form.value.name?.trim()) {
    message.warning('请输入名称');
    return;
  }
  try {
    const api = new Resource('divisions');
    if (isEdit.value) {
      await api.update(String(editingId.value), { ...form.value });
    } else {
      await api.store({ ...form.value });
    }
    message.success(isEdit.value ? '保存成功' : '创建成功');
    open.value = false;
    loadAll();
  } catch (error) {
    console.error(error);
  }
}

function handleDelete(node) {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除"${node.name}"吗？其子节点将一并删除。`,
    okText: '删除',
    okButtonProps: { danger: true },
    cancelText: '取消',
    onOk: async () => {
      try {
        await new Resource('divisions').destroy(String(node.id));
        message.success('删除成功');
        loadAll();
      } catch (error) {
        console.error(error);
      }
    },
  });
}
</script>

<template>
  <div class="p-4">
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Button v-if="canCreate" type="primary" @click="openAdd(null)">
          <template #icon>
            <i class="icon-[mdi--plus]"></i>
          </template>
          单位工程
        </Button>
        <span v-if="!projectId" class="text-xs text-gray-400">
          请先在右上角选择项目
        </span>
      </div>
      <Button @click="toggleAll">
        {{ allExpanded ? '全部收起' : '全部展开' }}
      </Button>
    </div>

    <div class="rounded border border-gray-200 bg-white p-3 dark:border-gray-600">
      <Tree
        v-if="treeData.length"
        :expanded-keys="expandedKeys"
        :tree-data="treeData"
        block-node
        @expand="(keys) => (expandedKeys = keys)"
      >
        <template #title="{ id, name, code, level, parent_id }">
          <div class="flex items-center gap-2">
            <Tag :color="levelColors[level] || 'default'">{{ levelNames[level] }}</Tag>
            <span>{{ name }}</span>
            <span
              class="cursor-pointer text-xs text-gray-400 hover:text-gray-600"
              title="点击复制编号"
              @click.stop="copyCode(code)"
            >
              {{ code }}
            </span>
            <span class="ml-auto flex items-center gap-1">
              <Button
                v-if="canCreate && level < 7"
                type="link"
                size="small"
                title="添加下级"
                @click.stop="openAdd({ id, code, level })"
              >
                <template #icon>
                  <i class="icon-[mdi--plus-circle-outline] text-blue-500"></i>
                </template>
              </Button>
              <Button
                v-if="canEdit"
                type="link"
                size="small"
                title="编辑"
                @click.stop="openEdit({ id, name, code, level, parent_id })"
              >
                <template #icon>
                  <i class="icon-[mdi--pencil-outline] text-amber-500"></i>
                </template>
              </Button>
              <Button
                v-if="canDelete"
                type="link"
                size="small"
                title="删除"
                @click.stop="handleDelete({ id, name })"
              >
                <template #icon>
                  <i class="icon-[mdi--trash-can-outline] text-red-500"></i>
                </template>
              </Button>
            </span>
          </div>
        </template>
      </Tree>
      <div v-else class="py-10 text-center text-gray-400">
        {{ projectId ? '暂无项目划分，点击"单位工程"开始创建' : '请先选择项目' }}
      </div>
    </div>

    <Modal
      :open="open"
      :title="isEdit ? '编辑节点' : '新建节点'"
      :width="420"
      @ok="submit"
      @cancel="closeDialog"
    >
      <div class="mb-3">
        <div v-if="!isEdit && availableLevels.length > 1" class="mb-2 text-sm text-gray-500">
          选择层级
        </div>
        <Radio.Group
          v-if="!isEdit && availableLevels.length > 1"
          v-model:value="form.level"
          class="mb-3"
        >
          <Radio v-for="opt in availableLevels" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </Radio>
        </Radio.Group>
        <div class="mb-2 text-sm text-gray-500">名称</div>
        <Input v-model:value="form.name" placeholder="请输入名称" />
        <div class="mb-2 mt-3 text-sm text-gray-500">编号</div>
        <Input v-model:value="form.code" placeholder="请输入编号" />
      </div>
    </Modal>
  </div>
</template>
