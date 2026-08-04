<script setup>
import { computed, reactive, ref } from 'vue';

import { Button, DatePicker, Input, InputNumber, message, Modal, Select, Tag } from 'antdv-next';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

import { useAppStore } from '#/store';
import { requestClient } from '#/api/request';

// 全局选择的项目 ID（"所有项目"时为空），列表请求自动携带
const currentProjectId = computed(() => useAppStore().defaultProject?.id || undefined);

const stateOptions = [
  { label: '草稿', value: 0 },
  { label: '待审核', value: 1 },
  { label: '已通过', value: 2 },
  { label: '已退回', value: 3 },
];
const rectifyOptions = [
  { label: '待整改', value: 0 },
  { label: '整改中', value: 1 },
  { label: '已整改', value: 2 },
  { label: '已关闭', value: 3 },
];

const filterFields = ref([
  { field: 'project_id', label: '项目ID', type: 'number', span: 8 },
  { field: 'state', label: '审核状态', type: 'select', span: 8, options: [
    { label: '草稿', value: 0 },
    { label: '待审核', value: 1 },
    { label: '已通过', value: 2 },
    { label: '已退回', value: 3 },
  ]},
  { field: 'rectify_state', label: '整改状态', type: 'select', span: 8, options: [
    { label: '待整改', value: 0 },
    { label: '整改中', value: 1 },
    { label: '已整改', value: 2 },
    { label: '已关闭', value: 3 },
  ]},
  { field: 'keyword', label: '关键词', type: 'text', span: 8 },
]);

const formFields = ref([
  { field: 'code', type: 'text', label: '编号', span: 12, displayOnly: true },
  { field: 'state_label', type: 'text', label: '审核状态', span: 12, displayOnly: true },
  { field: 'rectify_state_label', type: 'text', label: '整改状态', span: 12, displayOnly: true },
  { field: 'content', type: 'textarea', label: '内容', span: 24 },
  { field: 'proof', type: 'image', label: '现场证据', span: 24, attrs: { multiple: true } },
  { field: 'correction', type: 'image', label: '整改证据', span: 24, attrs: { multiple: true } },
  { field: 'audits', type: 'slot', label: '审核历史', span: 24 },
]);

const stateColors = {
  0: 'default',
  1: 'orange',
  2: 'green',
  3: 'red',
};
const rectifyColors = {
  0: 'orange',
  1: 'blue',
  2: 'green',
  3: 'default',
};

const gridColumns = ref([
  { field: 'code', title: '编号', minWidth: 120 },
  {
    field: 'state',
    title: '审核状态',
    width: 100,
    slots: { default: 'default_state' },
  },
  {
    field: 'rectify_state',
    title: '整改状态',
    width: 100,
    slots: { default: 'default_rectify' },
  },
  { field: 'content', title: '内容', minWidth: 200 },
  { field: 'staff__name', title: '创建人', width: 100 },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

// 当前筛选值（来自 AppCrudTable 筛选栏）
const filters = ref({});

// P3-N04 异步 Excel 导出：弹出筛选 → 发起任务 → 轮询状态 → 完成后跳转下载
const exportOpen = ref(false);
const exportForm = reactive({
  project_id: null,
  state: undefined,
  rectify_state: undefined,
  keyword: '',
  date_range: [],
});
const exporting = ref(false);

function openExport() {
  // 打开弹窗时带入当前列表筛选作为默认值
  exportForm.project_id = filters.value?.project_id ?? null;
  exportForm.state = filters.value?.state ?? undefined;
  exportForm.rectify_state = filters.value?.rectify_state ?? undefined;
  exportForm.keyword = filters.value?.keyword ?? '';
  exportOpen.value = true;
}

async function submitExport() {
  const params = {};
  if (exportForm.project_id) params.project_id = exportForm.project_id;
  if (exportForm.state !== undefined && exportForm.state !== null) params.state = exportForm.state;
  if (exportForm.rectify_state !== undefined && exportForm.rectify_state !== null) {
    params.rectify_state = exportForm.rectify_state;
  }
  if (exportForm.keyword) params.keyword = exportForm.keyword;
  if (exportForm.date_range?.length === 2) {
    params.date_from = exportForm.date_range[0];
    params.date_to = exportForm.date_range[1];
  }

  exporting.value = true;
  message.loading('正在创建导出任务...', 0);
  try {
    const res = await requestClient.post('/export-jobs', {
      export_type: 'nonconformance',
      params,
    });
    const id = res?.data?.id;
    if (!id) {
      message.destroy();
      message.error('发起导出失败');
      return;
    }
    exportOpen.value = false;
    message.destroy();
    message.loading('后台导出中，请稍候...', 0);
    pollExport(id);
  } catch {
    message.destroy();
    message.error('发起导出失败');
  } finally {
    exporting.value = false;
  }
}

function pollExport(id) {
  const timer = setInterval(() => {
    requestClient
      .get(`/export-jobs/${id}`)
      .then((res) => {
        const d = res?.data;
        if (!d) return;
        if (d.status === 2) {
          clearInterval(timer);
          message.destroy();
          message.success('导出完成');
          if (d.download_url) window.open(d.download_url, '_blank');
        } else if (d.status === 3) {
          clearInterval(timer);
          message.destroy();
          message.error('导出失败：' + (d.error_message || ''));
        }
      })
      .catch(() => {});
  }, 2000);
}
</script>

<template>
  <AppCrudTable
    api-url="nonconformances"
    :filter-fields="filterFields"
    :fields="formFields"
    :extra-query="{ project_id: currentProjectId }"
    :list-scope="2"
    permission-name="nonconformance"
    :inline-actions="['view', 'audit']"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="不符合项"
    class="p-4"
    @update:filters="(v) => (filters.value = v)"
  >
    <template #toolbar-append>
      <Button type="primary" ghost @click="openExport">导出</Button>
    </template>

    <template #default_state="{ row }">
      <Tag :color="stateColors[row.state] || 'default'">{{ row.state_label || '-' }}</Tag>
    </template>
    <template #default_rectify="{ row }">
      <Tag :color="rectifyColors[row.rectify_state] || 'default'">{{ row.rectify_state_label || '-' }}</Tag>
    </template>

    <template #field_audits="{ modelValue }">
      <div v-if="modelValue && modelValue.length" class="space-y-2">
        <div v-for="(a, i) in modelValue" :key="i" class="rounded border p-2">
          <div>
            <Tag :color="a.status ? 'green' : 'red'">{{ a.status ? '通过' : '不通过' }}</Tag>
            <span class="ml-2 text-sm text-gray-500">{{ a.audit_time || a.created_at }}</span>
          </div>
          <div class="text-sm">审核人：{{ a.auditor_name || a.user?.name || '-' }}</div>
          <div v-if="a.reason" class="text-sm text-red-500">{{ a.reason }}</div>
        </div>
      </div>
      <div v-else class="text-sm text-gray-400">无审核记录</div>
    </template>
  </AppCrudTable>

  <!-- P3-N04 导出筛选弹窗 -->
  <Modal
    :open="exportOpen"
    title="导出不符合项"
    :confirm-loading="exporting"
    ok-text="开始导出"
    cancel-text="取消"
    @ok="submitExport"
    @cancel="exportOpen = false"
  >
    <div class="space-y-4">
      <div>
        <label class="mb-1 block text-sm text-gray-500">审核状态</label>
        <Select
          v-model:value="exportForm.state"
          :options="stateOptions"
          style="width: 100%"
          allow-clear
          placeholder="全部"
        />
      </div>
      <div>
        <label class="mb-1 block text-sm text-gray-500">整改状态</label>
        <Select
          v-model:value="exportForm.rectify_state"
          :options="rectifyOptions"
          style="width: 100%"
          allow-clear
          placeholder="全部"
        />
      </div>
      <div>
        <label class="mb-1 block text-sm text-gray-500">项目ID</label>
        <InputNumber v-model:value="exportForm.project_id" style="width: 100%" placeholder="全部" />
      </div>
      <div>
        <label class="mb-1 block text-sm text-gray-500">关键词</label>
        <Input v-model:value="exportForm.keyword" placeholder="内容关键词" />
      </div>
      <div>
        <label class="mb-1 block text-sm text-gray-500">创建日期范围</label>
        <DatePicker.RangePicker
          v-model:value="exportForm.date_range"
          style="width: 100%"
          value-format="YYYY-MM-DD"
        />
      </div>
    </div>
  </Modal>
</template>
