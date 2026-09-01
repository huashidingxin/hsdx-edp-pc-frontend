<script setup>
import { ref } from 'vue';

import { Button, Drawer, Tag, message } from 'antdv-next';

import { requestClient } from '#/api/request';

const crudRef = ref(null);
const detailOpen = ref(false);
const detailData = ref(null);
const detailLoading = ref(false);

const statusMap = { 1: '进行中', 0: '已关闭' };
const statusColor = { 1: 'green', 0: 'default' };

const filterFields = ref([]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'visitor_id', type: 'text', label: '访客', span: 12, displayOnly: true },
  { field: 'status', type: 'text', label: '状态', span: 12, displayOnly: true },
  { field: 'message_count', type: 'text', label: '消息数', span: 12, displayOnly: true },
  { field: 'last_message_at', type: 'datetime', label: '最后消息', span: 12, displayOnly: true },
  { field: 'created_at', type: 'datetime', label: '创建时间', span: 12, displayOnly: true },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 80 },
  { field: 'visitor_id', title: '访客', minWidth: 160, formatter: emptyText },
  {
    field: 'status',
    title: '状态',
    width: 100,
    slots: { default: 'default_status' },
  },
  { field: 'message_count', title: '消息数', width: 90 },
  { field: 'last_message_at', title: '最后消息', minWidth: 170, formatter: emptyText },
  { field: 'created_at', title: '创建时间', minWidth: 170 },
]);

const formData = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

async function openDetail(row) {
  detailOpen.value = true;
  detailLoading.value = true;
  detailData.value = null;
  try {
    detailData.value = await requestClient.get(`/ai/sessions/${row.id}`);
  } catch {
    message.error('加载会话失败');
  } finally {
    detailLoading.value = false;
  }
}

const actionsConfig = ref([
  {
    key: 'view_messages',
    label: '消息',
    icon: 'mdi--message-text-outline',
    onClick: (row) => openDetail(row),
    order: 20,
  },
]);
</script>

<template>
  <div class="h-full">
    <AppCrudTable
      ref="crudRef"
      api-url="ai/sessions"
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
      :actions-config="actionsConfig"
      :inline-actions="['view_messages']"
      :toolbar="{ create: false, more: false }"
      permission-name="ai.chat"
      title="AI 客服会话"
      class="p-4"
    >
      <template #default_status="{ row }">
        <Tag :color="statusColor[row.status] || 'default'">
          {{ statusMap[row.status] || '-' }}
        </Tag>
      </template>
    </AppCrudTable>

    <Drawer
      :open="detailOpen"
      :title="`会话 #${detailData?.id ?? ''}`"
      width="560"
      @close="detailOpen = false"
    >
      <div v-if="detailLoading" class="py-8 text-center text-gray-400">加载中...</div>
      <div v-else-if="detailData" class="space-y-3">
        <div class="flex items-center gap-2 text-xs text-gray-500">
          <span>访客：{{ detailData.visitor_id || '-' }}</span>
          <Tag :color="statusColor[detailData.status] || 'default'">
            {{ statusMap[detailData.status] || '-' }}
          </Tag>
        </div>
        <div
          v-for="m in detailData.messages || []"
          :key="m.id"
          class="rounded border border-gray-200 p-3 dark:border-gray-600"
        >
          <div class="mb-1 flex items-center justify-between">
            <span class="text-xs font-medium text-gray-700">
              {{ m.role === 'assistant' ? 'AI 客服' : '访客' }}
            </span>
            <span class="text-xs text-gray-400">{{ m.created_at }}</span>
          </div>
          <div class="whitespace-pre-wrap text-sm text-gray-800">{{ m.content }}</div>
          <div v-if="m.token_in || m.token_out" class="mt-1 text-xs text-gray-400">
            输入 {{ m.token_in || 0 }} / 输出 {{ m.token_out || 0 }} token
          </div>
        </div>
        <div v-if="!detailData.messages?.length" class="py-6 text-center text-gray-400">
          暂无消息
        </div>
      </div>
    </Drawer>
  </div>
</template>
