<script setup lang="ts">
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
const allExpanded = ref(true);
const selectedKeys = ref([]);

const levelNames: Record<number, string> = {
  1: '单位工程',
  2: '子单位工程',
  3: '分部工程',
  4: '子分部工程',
  5: '分项工程',
  6: '子分项工程',
  7: '检验批',
};
const levelColors: Record<number, string> = {
  1: '#3F51B5',
  2: '#3F51B5',
  3: '#2196F3',
  4: '#2196F3',
  5: '#009688',
  6: '#009688',
  7: '#FF9800',
};

const parentLevelOptions: Record<number | string, { label: string; value: number }[]> = {
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

function toTreeNode(node: any) {
  return {
    key: node.id,
    id: node.id,
    name: node.name,
    code: node.code,
    level: node.level,
    parent_id: node.parent_id,
    project_id: node.project_id,
    title: node.name,
    children: (node.children || []).map((item) => toTreeNode(item)),
  };
}

function buildTree(flat: any[]) {
  const map = new Map();
  (flat || []).forEach((d) => map.set(d.id, { ...d, children: [] }));
  const roots: any[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots.map((item) => toTreeNode(item));
}

function collectKeys(nodes: any[]): number[] {
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

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(String(code || ''));
    message.success('编号已复制');
  } catch {
    /* 静默 */
  }
}

/* ===================== 新增/编辑弹窗 ===================== */
const open = ref(false);
const isEdit = ref(false);
const editingId = ref(null);
const form = ref({
  name: '',
  code: '',
  parent_id: null as null | number,
  parent_level: null as null | number,
  level: 1,
  project_id: null as null | number,
});

const availableLevels = computed(
  () => parentLevelOptions[form.value.parent_level ?? 'null'] || [],
);

const parentInfo = computed(() => {
  if (!form.value.parent_id) return null;
  return findNode(treeData.value, form.value.parent_id);
});

function findNode(nodes: any[], id: number): any {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function openAdd(parent: any) {
  isEdit.value = false;
  editingId.value = null;
  const parentLevel = parent?.level ?? null;
  const opts = parentLevelOptions[parentLevel ?? 'null'] || [];
  form.value = {
    name: '',
    code: parent ? `${parent.code}-` : '',
    parent_id: parent?.id || null,
    parent_level: parentLevel,
    level: opts.length === 1 ? opts[0].value : (parent?.level || 0) + 1,
    project_id: projectId.value,
  };
  open.value = true;
}

function openEdit(node: any) {
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
  if (!form.value.code?.trim()) {
    message.warning('请输入编号');
    return;
  }
  try {
    const api = new Resource('divisions');
    isEdit.value
      ? await api.update(String(editingId.value), { ...form.value })
      : await api.store({ ...form.value });
    message.success(isEdit.value ? '保存成功' : '创建成功');
    open.value = false;
    loadAll();
  } catch (error) {
    console.error(error);
  }
}

function handleDelete(node: any) {
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
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Button v-if="canCreate" type="primary" @click="openAdd(null)">
          <template #icon>
            <i class="icon-[mdi--plus]"></i>
          </template>
          新建单位工程
        </Button>
        <span v-if="!projectId" class="ml-2 text-xs text-gray-400">
          请先在右上角选择项目
        </span>
      </div>
      <Button v-if="treeData.length" @click="toggleAll">
        {{ allExpanded ? '全部收起' : '全部展开' }}
      </Button>
    </div>

    <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-600">
      <Tree
        v-if="treeData.length"
        :expanded-keys="expandedKeys"
        :selected-keys="selectedKeys"
        :tree-data="treeData"
        block-node
        :show-line="true"
        :default-expand-all="true"
        @expand="(keys: number[]) => (expandedKeys = keys)"
        @select="(keys: number[]) => (selectedKeys = keys)"
      >
        <template #title="node">
          <div class="flex items-center gap-2 py-0.5">
            <span class="text-sm">{{ node.name }}</span>
            <span class="text-xs text-gray-400">{{ node.code }}</span>
            <Tag
              v-if="selectedKeys.includes(node.key)"
              :style="{
                color: levelColors[node.level] || '#8c8c8c',
                backgroundColor: `${levelColors[node.level]}15`,
                borderColor: `${levelColors[node.level]}40`,
              }"
              class="!ml-1 !mr-0 !text-xs"
            >
              {{ levelNames[node.level] }}
            </Tag>
            <span
              v-if="selectedKeys.includes(node.key)"
              class="ml-1 flex items-center gap-1"
            >
              <Button
                v-if="canCreate && node.level < 7"
                type="link"
                size="small"
                @click.stop="openAdd(node)"
              >
                <template #icon>
                  <i class="icon-[mdi--plus-circle-outline]"></i>
                </template>
                增加下级
              </Button>
              <Button
                v-if="canEdit"
                type="link"
                size="small"
                @click.stop="openEdit(node)"
              >
                <template #icon>
                  <i class="icon-[mdi--pencil-outline]"></i>
                </template>
              </Button>
              <Button
                v-if="canDelete"
                type="link"
                size="small"
                danger
                @click.stop="handleDelete(node)"
              >
                <template #icon>
                  <i class="icon-[mdi--trash-can-outline]"></i>
                </template>
              </Button>
            </span>
          </div>
        </template>
      </Tree>
      <div v-else class="py-16 text-center text-gray-400">
        {{ projectId ? '暂无项目划分，点击上方按钮开始创建' : '请先选择项目' }}
      </div>
    </div>

    <Modal
      :open="open"
      :title="isEdit ? '编辑节点' : '新建节点'"
      :width="420"
      @ok="submit"
      @cancel="closeDialog"
    >
      <div v-if="parentInfo" class="mb-3 rounded bg-gray-50 p-3 text-sm">
        上级：{{ parentInfo.name }}
        <Tag
          :style="{
            color: levelColors[parentInfo.level] || '#8c8c8c',
            backgroundColor: `${levelColors[parentInfo.level]}15`,
            borderColor: `${levelColors[parentInfo.level]}40`,
          }"
          class="!ml-1 !text-xs"
        >
          {{ levelNames[parentInfo.level] }}
        </Tag>
        <span class="ml-1 text-gray-400">{{ parentInfo.code }}</span>
      </div>
      <div class="mb-3">
        <div
          v-if="!isEdit && availableLevels.length > 1"
          class="mb-2 text-sm text-gray-500"
        >
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
        <div class="mb-2 text-sm text-gray-500">
          名称 <span class="text-red-400">*</span>
        </div>
        <Input v-model:value="form.name" placeholder="请输入名称" />
        <div class="mb-2 mt-3 text-sm text-gray-500">
          编号 <span class="text-red-400">*</span>
        </div>
        <Input v-model:value="form.code" placeholder="请输入编号（必填）" />
      </div>
    </Modal>
  </div>
</template>
