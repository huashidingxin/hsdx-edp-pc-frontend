<script setup>
/**
 * 知识条目（来源索引）列表：按知识库收敛。
 *
 * 双状态机可见即可排障：
 *  - sync_status  本项目 ↔ 外部知识服务的内容同步（pending/syncing/synced/failed）
 *  - parse_status 外部分块 / 向量化进度（webhook 回传或主动拉取兜底）
 * 失败态给「重新同步」与「刷新状态」两个手动入口。
 */
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Alert, Select, Tag, message } from 'antdv-next';

import { requestClient } from '#/api/request';
import Resource from '#/api/resource';

const crudRef = ref(null);
const route = useRoute();

const bases = ref([]);
const baseId = ref(Number(route.query.base) || null);

const syncColor = {
  pending: 'default',
  syncing: 'processing',
  synced: 'green',
  failed: 'red',
};
const parseColor = {
  not_required: 'default',
  queued: 'default',
  parsing: 'processing',
  parsed: 'green',
  failed: 'red',
};

const syncStatusItems = [
  { id: 'pending', name: '待同步' },
  { id: 'syncing', name: '同步中' },
  { id: 'synced', name: '已同步' },
  { id: 'failed', name: '同步失败' },
];
const parseStatusItems = [
  { id: 'not_required', name: '无需解析' },
  { id: 'queued', name: '排队中' },
  { id: 'parsing', name: '解析中' },
  { id: 'parsed', name: '已解析' },
  { id: 'failed', name: '解析失败' },
];

const filterFields = ref([
  {
    field: 'keyword',
    label: '关键词',
    type: 'input',
    span: 8,
    attrs: { placeholder: '标题', allowClear: true },
  },
  {
    field: 'sync_status',
    label: '同步状态',
    type: 'select',
    span: 8,
    attrs: { options: syncStatusItems, allowClear: true, placeholder: '全部' },
  },
  {
    field: 'parse_status',
    label: '解析状态',
    type: 'select',
    span: 8,
    attrs: { options: parseStatusItems, allowClear: true, placeholder: '全部' },
  },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'title', type: 'text', label: '标题', span: 12, required: true },
  {
    field: 'source_type',
    type: 'select',
    label: '来源类型',
    span: 12,
    attrs: { options: [{ id: 'text', name: '文本' }, { id: 'file', name: '文件' }] },
  },
  {
    field: 'content_text',
    type: 'textarea',
    label: '正文（文本来源）',
    span: 24,
    attrs: { rows: 6 },
  },
  {
    field: 'file_id',
    type: 'number',
    label: '文件 ID（文件来源）',
    span: 12,
    attrs: { style: 'width: 100%' },
  },
  { field: 'sync_error', type: 'text', label: '同步错误', span: 12, displayOnly: true },
  { field: 'parse_error', type: 'text', label: '解析错误', span: 12, displayOnly: true },
  {
    field: 'chunk_count',
    type: 'text',
    label: '分块数',
    span: 12,
    displayOnly: true,
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'title', title: '标题', minWidth: 180, formatter: emptyText },
  {
    field: 'source_type',
    title: '来源',
    width: 80,
    formatter: ({ cellValue }) => (cellValue === 'file' ? '文件' : '文本'),
  },
  {
    field: 'sync_status',
    title: '同步',
    width: 100,
    slots: { default: 'default_sync' },
  },
  {
    field: 'parse_status',
    title: '解析',
    width: 100,
    slots: { default: 'default_parse' },
  },
  { field: 'chunk_count', title: '分块', width: 70 },
  { field: 'created_at', title: '创建时间', minWidth: 160 },
]);

const formData = ref(null);

const baseOptions = computed(() =>
  bases.value.map((b) => ({ id: b.id, name: b.name })),
);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

// 换库即重载（列表接口要求 knowledge_base_id）
watch(baseId, () => {
  crudRef.value?.refresh();
});

/* ===================== 同步 / 状态 手动入口 ===================== */
async function runSourceAction(row, action) {
  try {
    if (action === 'resync') {
      await requestClient.post(`/knowledge/sources/${row.id}/resync`);
      message.success('已重新入队同步');
    } else {
      await requestClient.post(`/knowledge/sources/${row.id}/refresh-status`);
      message.success('解析状态已刷新');
    }
    crudRef.value?.refresh();
  } catch {
    message.error('操作失败');
  }
}

/**
 * 内置 edit/delete 的默认权限动作名是 `.edit` / `.delete`，后端知识条目只有
 * `.read` / `.write`，这里显式覆盖成 write；条目 Mutation 后端逐个校验
 * knowledge.source.write。
 */
const actionsConfig = ref([
  {
    key: 'edit',
    label: '编辑',
    icon: 'mdi--pencil-outline',
    permission: 'write',
    order: 20,
  },
  {
    key: 'delete',
    label: '删除',
    icon: 'mdi--delete-outline',
    danger: true,
    confirm: true,
    confirmTitle: '确定要删除吗？外部文档会一并删除。',
    permission: 'write',
    order: 90,
  },
  {
    key: 'resync',
    label: '重新同步',
    icon: 'mdi--refresh',
    permission: 'write',
    onClick: (row) => runSourceAction(row, 'resync'),
    order: 30,
  },
  {
    key: 'refresh_status',
    label: '刷新状态',
    icon: 'mdi--cloud-sync-outline',
    permission: 'write',
    onClick: (row) => runSourceAction(row, 'refresh_status'),
    order: 40,
  },
]);

onMounted(async () => {
  try {
    const { data } = await new Resource('knowledge/bases').list({ per_page: 100 });
    bases.value = data || [];
    if (!baseId.value && bases.value.length > 0) {
      baseId.value = bases.value[0].id;
    }
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center gap-3 p-4 pb-0">
      <span class="text-sm text-gray-500">知识库</span>
      <Select
        v-model:value="baseId"
        :options="baseOptions"
        :field-names="{ label: 'name', value: 'id' }"
        style="width: 260px"
        placeholder="选择知识库"
      />
      <span v-if="!bases.length" class="text-xs text-gray-400">
        还没有知识库，请先到「知识库」创建
      </span>
    </div>

    <Alert
      v-if="!baseId && bases.length === 0"
      class="mx-4 mt-3"
      type="info"
      show-icon
      message="知识条目按库管理：先创建知识库，再往库里添加文本或文件来源。"
    />

    <AppCrudTable
      v-if="baseId"
      ref="crudRef"
      api-url="knowledge/sources"
      v-model="formData"
      :extra-query="{ knowledge_base_id: baseId }"
      :filter-fields="filterFields"
      :fields="formFields"
      :grid-options="{
        columns: gridColumns,
        showOverflow: false,
        columnConfig: { resizable: true },
      }"
      :open-mode="{ create: 'modal', detail: 'modal' }"
      :form-attrs="{ layout: 'vertical', size: 'medium' }"
      :actions-config="actionsConfig"
      :inline-actions="['edit', 'delete']"
      :save-format="
        (e) => ({ ...e, knowledge_base_id: baseId })
      "
      title="知识条目"
      class="p-4"
    >
      <template #default_sync="{ row }">
        <Tag :color="syncColor[row.sync_status] || 'default'">
          {{ row.sync_status_label || '-' }}
        </Tag>
      </template>
      <template #default_parse="{ row }">
        <Tag :color="parseColor[row.parse_status] || 'default'">
          {{ row.parse_status_label || '-' }}
        </Tag>
      </template>
    </AppCrudTable>
  </div>
</template>
