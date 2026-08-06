<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import {
  Button,
  Input,
  message,
  Modal,
  Radio,
  RadioGroup,
  Tag,
} from 'antdv-next';
import { VxeGrid } from 'vxe-table';

import Resource from '#/api/resource';
import { useAppStore } from '#/store';

const { hasAccessByCodes } = useAccess();
const appStore = useAppStore();

const canCreate = computed(() => hasAccessByCodes(['division.create']));
const canEdit = computed(() => hasAccessByCodes(['division.edit']));
const canDelete = computed(() => hasAccessByCodes(['division.delete']));

const projectId = computed(() => appStore.defaultProject?.id);

/* ===================== 层级配置 ===================== */
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

const parentLevelOptions: Record<
  number | string,
  { label: string; value: number }[]
> = {
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

/* ===================== 表格配置 ===================== */
const gridRef = ref<any>(null);
const list = ref<any[]>([]);
const loading = ref(false);
const isDirty = ref(false);
const saving = ref(false);

// 当前选中行（点击行高亮并显示操作按钮）
const currentRow = ref<any>(null);

// 名称搜索
const filterName = ref('');

// 表格列
const columns = [
  {
    field: 'name',
    title: '名称',
    treeNode: true,
    minWidth: 400,
    slots: { default: 'default_name' },
  },
];

const gridOptions: any = computed(() => ({
  showOverflow: true,
  border: false,
  loading: loading.value,
  stripe: false,
  showHeader: false,
  treeConfig: {
    transform: true,
    rowField: 'id',
    parentField: 'parent_id',
    expandAll: true,
  },
  rowDragConfig: {
    trigger: 'row',
    showGuidesStatus: true,
    isCrossDrag: false,
    isToChildDrag: true,
    async dragEndMethod(e: any) {
      const { oldRow, newRow } = e;
      if (oldRow.project_id !== newRow.project_id) {
        message.error('不同项目之间不能互相包含');
        return false;
      }
      return true;
    },
  },
  rowConfig: {
    drag: true,
    isCurrent: true,
    isHover: true,
  },
  columnConfig: {
    resizable: true,
  },
  columns,
  data: filteredData.value,
}));

/* ===================== 数据加载 ===================== */
async function loadAll() {
  if (!projectId.value) {
    list.value = [];
    return;
  }
  loading.value = true;
  try {
    const { data } = await new Resource('divisions').list({
      project_id: projectId.value,
      per_page: 'all',
    });
    list.value = data || [];
    isDirty.value = false;
  } catch (error) {
    console.error(error);
    message.error('项目划分加载失败');
  } finally {
    loading.value = false;
  }
}

// 名称搜索过滤
const filteredData = computed(() => {
  const keyword = filterName.value?.trim().toLowerCase();
  if (!keyword) return list.value;
  // 搜索匹配的节点及其祖先
  const matchIds = new Set<number>();
  const ancestorIds = new Set<number>();

  // 找出所有匹配的节点
  for (const item of list.value) {
    if (
      String(item.name || '')
        .toLowerCase()
        .includes(keyword)
    ) {
      matchIds.add(item.id);
    }
  }

  // 找出匹配节点的所有祖先
  const idMap = new Map(list.value.map((d) => [d.id, d]));
  for (const id of matchIds) {
    let current = idMap.get(id);
    while (current?.parent_id) {
      ancestorIds.add(current.parent_id);
      current = idMap.get(current.parent_id);
    }
  }

  // 返回匹配节点 + 祖先节点
  return list.value.filter(
    (item) => matchIds.has(item.id) || ancestorIds.has(item.id),
  );
});

watch(() => appStore.defaultProject?.id, loadAll);
onMounted(loadAll);

/* ===================== 拖拽结束处理 ===================== */
function handleRowDragend() {
  isDirty.value = true;
}

/* ===================== 展开/收起 ===================== */
const allExpanded = ref(true);
function toggleAllExpand() {
  const $grid = gridRef.value;
  if (!$grid) return;
  allExpanded.value = !allExpanded.value;
  $grid.setAllTreeExpand(allExpanded.value);
}

/* ===================== 复制编号 ===================== */
async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(String(code || ''));
    message.success('编号已复制');
  } catch {
    /* 静默 */
  }
}

/* ===================== 保存（拖拽排序后） ===================== */
async function save() {
  if (!projectId.value) return;
  saving.value = true;
  try {
    const $grid = gridRef.value;
    // 获取完整的树形数据（包含拖拽后的顺序）
    const fullData = $grid?.getTableData?.()?.fullData || list.value;
    await new Resource('divisions').store({
      list: fullData,
      project_id: projectId.value ?? 0,
    });
    message.success('保存成功');
    isDirty.value = false;
    // 直接用网格数据更新本地列表，保持展开状态
    list.value = [...fullData];
  } catch (error) {
    console.error(error);
    message.error('保存失败');
  } finally {
    saving.value = false;
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
  const parentId = Number(form.value.parent_id);
  return list.value.find((n) => n.id === parentId) || null;
});

function openAdd(parent: any) {
  isEdit.value = false;
  editingId.value = null;
  const parentLevel = parent?.level ?? null;
  const opts = parentLevelOptions[parentLevel ?? 'null'] || [];
  form.value = {
    name: '',
    code: parent ? `${parent.code}-` : '',
    parent_id: parent?.id ? Number(parent.id) : null,
    parent_level: parentLevel,
    level: opts.length === 1 ? opts[0].value : (parent?.level || 0) + 1,
    project_id: projectId.value ? Number(projectId.value) : null,
  };
  open.value = true;
}

function openEdit(row: any) {
  isEdit.value = true;
  editingId.value = row.id;
  form.value = {
    name: row.name,
    code: row.code,
    parent_id: row.parent_id ? Number(row.parent_id) : null,
    parent_level: null,
    level: row.level,
    project_id: projectId.value ? Number(projectId.value) : null,
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
    let result: any;
    if (isEdit.value) {
      // 编辑：更新本地数据
      result = await api.update(String(editingId.value), { ...form.value });
      const index = list.value.findIndex((n) => n.id === editingId.value);
      if (index !== -1) {
        list.value[index] = { ...list.value[index], ...result };
        // 触发响应式更新
        list.value = [...list.value];
      }
      message.success('保存成功');
    } else {
      // 新增：插入到本地数据
      result = await api.store({ ...form.value });
      // 如果有父节点，插入到父节点的子列表末尾；否则插入到顶级
      if (form.value.parent_id) {
        list.value.push(result);
      } else {
        list.value.push(result);
      }
      message.success('创建成功');
    }
    open.value = false;
  } catch (error) {
    console.error(error);
  }
}

function handleDelete(row: any) {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除"${row.name}"吗？其子节点将一并删除。`,
    okText: '删除',
    okButtonProps: { danger: true },
    cancelText: '取消',
    onOk: async () => {
      try {
        await new Resource('divisions').destroy(String(row.id));
        // 从本地数据中移除该节点及其所有子节点
        removeNodeAndChildren(row.id);
        message.success('删除成功');
      } catch (error) {
        console.error(error);
      }
    },
  });
}

/**
 * 从本地列表中移除节点及其所有子节点
 */
function removeNodeAndChildren(nodeId: number) {
  // 收集所有需要删除的 ID（包括子节点）
  const idsToRemove = new Set<number>();
  const collectIds = (id: number) => {
    idsToRemove.add(id);
    list.value
      .filter((n) => n.parent_id === id)
      .forEach((child) => collectIds(child.id));
  };
  collectIds(nodeId);

  // 从列表中移除
  list.value = list.value.filter((n) => !idsToRemove.has(n.id));

  // 如果删除的是当前选中行，清除选中
  if (currentRow.value && idsToRemove.has(currentRow.value.id)) {
    currentRow.value = null;
  }
}

/* ===================== 行点击 ===================== */
function handleRowClick(params: any) {
  currentRow.value = params.row;
}
</script>

<template>
  <div class="division-page flex h-full flex-col bg-gray-50/50">
    <!-- 工具栏 -->
    <div
      class="toolbar flex flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 py-3"
    >
      <div class="flex items-center gap-3">
        <Button
          v-if="canCreate"
          type="primary"
          size="middle"
          @click="openAdd(null)"
        >
          <template #icon>
            <i class="icon-[mdi--plus]"></i>
          </template>
          新建单位工程
        </Button>
        <span v-if="!projectId" class="text-sm text-gray-400">
          请先在右上角选择项目
        </span>
        <transition name="fade">
          <Button
            v-if="isDirty"
            type="primary"
            :loading="saving"
            class="save-btn !bg-amber-500 !border-amber-500 hover:!bg-amber-600"
            @click="save"
          >
            <template #icon>
              <i class="icon-[mdi--content-save-outline]"></i>
            </template>
            保存修改
          </Button>
        </transition>
      </div>
      <div class="flex items-center gap-2">
        <Input
          v-model:value="filterName"
          placeholder="搜索名称..."
          allow-clear
          class="search-input"
          size="middle"
        >
          <template #prefix>
            <i class="icon-[mdi--magnify] text-gray-400"></i>
          </template>
        </Input>
        <Button v-if="list.length" size="middle" @click="toggleAllExpand">
          <template #icon>
            <i
              :class="
                allExpanded
                  ? 'icon-[mdi--unfold-less-horizontal]'
                  : 'icon-[mdi--unfold-more-horizontal]'
              "
            ></i>
          </template>
          {{ allExpanded ? '全部收起' : '全部展开' }}
        </Button>
      </div>
    </div>

    <!-- 表格区域 -->
    <div class="table-container flex-1 overflow-auto p-4">
      <div class="table-card rounded-lg bg-white shadow-sm">
        <VxeGrid
          v-if="list.length || filterName"
          ref="gridRef"
          v-bind="gridOptions"
          @row-drag-end="handleRowDragend"
          @cell-click="handleRowClick"
        >
          <template #default_name="{ row }">
            <div class="tree-node flex items-center gap-2 py-2">
              <span class="node-name text-sm font-medium text-gray-800">{{
                row.name
              }}</span>
              <span
                class="node-code cursor-pointer text-xs text-gray-400 transition-colors hover:text-blue-500"
                @click.stop="copyCode(row.code)"
              >
                {{ row.code }}
              </span>
              <Tag
                :style="{
                  color: levelColors[row.level] || '#8c8c8c',
                  backgroundColor: `${levelColors[row.level]}0D`,
                  borderColor: `${levelColors[row.level]}30`,
                }"
                class="level-tag !ml-1 !mr-0 !rounded !px-1.5 !py-0 !text-xs !leading-5"
              >
                {{ levelNames[row.level] }}
              </Tag>
              <!-- 操作按钮（仅选中行显示） -->
              <transition name="fade">
                <span
                  v-if="currentRow?.id === row.id"
                  class="node-actions ml-2 flex items-center gap-0.5"
                >
                  <Button
                    v-if="canCreate && row.level < 7"
                    type="link"
                    size="small"
                    class="!h-6 !px-1.5 !text-xs"
                    @click.stop="openAdd(row)"
                  >
                    <template #icon>
                      <i class="icon-[mdi--plus-circle-outline] text-xs"></i>
                    </template>
                    下级
                  </Button>
                  <Button
                    v-if="canEdit"
                    type="link"
                    size="small"
                    class="!h-6 !px-1.5"
                    @click.stop="openEdit(row)"
                  >
                    <template #icon>
                      <i class="icon-[mdi--pencil-outline] text-xs"></i>
                    </template>
                  </Button>
                  <Button
                    v-if="canDelete"
                    type="link"
                    size="small"
                    danger
                    class="!h-6 !px-1.5"
                    @click.stop="handleDelete(row)"
                  >
                    <template #icon>
                      <i class="icon-[mdi--trash-can-outline] text-xs"></i>
                    </template>
                  </Button>
                </span>
              </transition>
            </div>
          </template>

          <template #empty>
            <div class="empty-state py-20 text-center">
              <i
                class="icon-[mdi--folder-open-outline] mb-3 text-4xl text-gray-300"
              ></i>
              <p class="text-gray-400">
                {{
                  projectId
                    ? '暂无项目划分，点击上方按钮开始创建'
                    : '请先选择项目'
                }}
              </p>
            </div>
          </template>
        </VxeGrid>

        <div v-else class="empty-state py-20 text-center">
          <i
            class="icon-[mdi--folder-open-outline] mb-3 text-4xl text-gray-300"
          ></i>
          <p class="text-gray-400">
            {{
              projectId ? '暂无项目划分，点击上方按钮开始创建' : '请先选择项目'
            }}
          </p>
        </div>
      </div>
    </div>

    <!-- 新增/编辑弹窗 -->
    <Modal
      :open="open"
      :title="isEdit ? '编辑节点' : '新建节点'"
      :width="420"
      @ok="submit"
      @cancel="closeDialog"
    >
      <div v-if="parentInfo" class="mb-4 rounded-lg bg-gray-50 p-3">
        <div class="text-xs text-gray-500">上级节点</div>
        <div class="mt-1 flex items-center gap-2">
          <span class="text-sm font-medium">{{ parentInfo.name }}</span>
          <Tag
            :style="{
              color: levelColors[parentInfo.level] || '#8c8c8c',
              backgroundColor: `${levelColors[parentInfo.level]}0D`,
              borderColor: `${levelColors[parentInfo.level]}30`,
            }"
            class="!rounded !px-1.5 !py-0 !text-xs !leading-5"
          >
            {{ levelNames[parentInfo.level] }}
          </Tag>
          <span class="text-xs text-gray-400">{{ parentInfo.code }}</span>
        </div>
      </div>
      <div>
        <div v-if="!isEdit && availableLevels.length > 1" class="mb-3">
          <div class="mb-2 text-sm font-medium text-gray-700">层级</div>
          <RadioGroup v-model:value="form.level" class="w-full">
            <div class="flex flex-wrap gap-2">
              <Radio
                v-for="opt in availableLevels"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </Radio>
            </div>
          </RadioGroup>
        </div>
        <div class="mb-3">
          <div class="mb-1.5 text-sm font-medium text-gray-700">
            名称 <span class="text-red-500">*</span>
          </div>
          <Input v-model:value="form.name" placeholder="请输入名称" />
        </div>
        <div>
          <div class="mb-1.5 text-sm font-medium text-gray-700">
            编号 <span class="text-red-500">*</span>
          </div>
          <Input v-model:value="form.code" placeholder="请输入编号（必填）" />
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.division-page {
  min-height: 0;
}

.toolbar {
  z-index: 10;
}

.search-input {
  width: 200px;
}

.search-input :deep(.ant-input) {
  font-size: 13px;
}

.save-btn {
  animation: slide-in 0.2s ease-out;
}

.table-container {
  min-height: 0;
}

.table-card {
  min-height: 300px;
}

/* 树节点样式 */
.tree-node {
  min-height: 40px;
}

.node-name {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-code {
  font-family: Monaco, Menlo, monospace;
}

/* 层级标签 */
.level-tag {
  font-weight: 500;
}

/* 操作按钮区域 */
.node-actions {
  animation: fade-in 0.15s ease-out;
}

/* VxeGrid 样式覆盖 */
:deep(.vxe-grid) {
  background: transparent !important;
  border: none !important;
}

:deep(.vxe-grid--body-wrapper) {
  overflow-y: auto !important;
}

:deep(.vxe-body--row) {
  transition: background-color 0.15s ease;
}

:deep(.vxe-body--row.row--current) {
  background-color: #f0f7ff !important;
}

:deep(.vxe-body--row:hover) {
  background-color: #fafbfc !important;
}

:deep(.vxe-cell--tree-node) {
  padding-left: 8px;
}

:deep(.vxe-tree--node-btn) {
  color: #bfbfbf;
  transition: color 0.15s ease;
}

:deep(.vxe-tree--node-btn:hover) {
  color: #1890ff;
}

:deep(.vxe-row--drag-trigger) {
  color: #d9d9d9;
  cursor: grab;
  transition: color 0.15s ease;
}

:deep(.vxe-row--drag-trigger:hover) {
  color: #8c8c8c;
}

:deep(.vxe-row--drag-trigger:active) {
  cursor: grabbing;
}

/* 空状态 */
.empty-state i {
  opacity: 0.5;
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
