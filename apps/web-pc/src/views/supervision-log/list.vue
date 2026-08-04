<script setup lang="ts">
import { computed, ref } from 'vue';

import { Tag } from 'antdv-next';

import { useAppStore } from '#/store';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const appStore = useAppStore();

// 全局选择的项目 ID（"所有项目"时为空）
const currentProjectId = computed(() => appStore.defaultProject?.id || undefined);

// 仅当未明确选择项目（全部项目）时显示"项目"列
type GridColumn = { field: string; title: string; width?: number; minWidth?: number; slots?: { default: string } };
const gridColumns = computed<GridColumn[]>(() => {
  const columns: GridColumn[] = [
    { field: 'date', title: '日志日期', width: 120 },
    {
      field: 'user.name',
      title: '填写人',
      width: 100,
      slots: { default: 'default_user' },
    },
    {
      field: 'submission.state',
      title: '状态',
      width: 100,
      slots: { default: 'default_state' },
    },
    {
      field: 'submission.created_at',
      title: '最近提交时间',
      width: 160,
      slots: { default: 'default_submitted' },
    },
  ];
  if (!currentProjectId.value) {
    columns.splice(1, 0, {
      field: 'project.name',
      title: '项目',
      minWidth: 160,
      slots: { default: 'default_project' },
    });
  }
  return columns;
});

const filterFields = ref([
  { field: 'date', label: '日志日期', type: 'date', span: 8 },
  { field: 'user_id', label: '填写人ID', type: 'number', span: 8 },
  {
    field: 'submission_state',
    label: '审核状态',
    type: 'select',
    span: 8,
    options: [
      { label: '未提交', value: 0 },
      { label: '待审核', value: 1 },
      { label: '已通过', value: 2 },
      { label: '已退回', value: 3 },
    ],
  },
  {
    field: 'submission_status',
    label: '是否已提交',
    type: 'select',
    span: 8,
    options: [
      { label: '已提交', value: 1 },
      { label: '未提交', value: 0 },
    ],
  },
]);

const formFields = ref([
  { field: 'date', type: 'text', label: '日志日期', span: 12, displayOnly: true },
  { field: 'user_id', type: 'text', label: '填写人ID', span: 12, displayOnly: true },
  { field: 'submission_state', type: 'text', label: '审核状态', span: 12, displayOnly: true },
  { field: 'submission_id', type: 'text', label: '提交记录', span: 12, displayOnly: true },
  { field: 'timeline', type: 'slot', label: '提交/审核历史时间线', span: 24 },
]);

const stateMap: Record<number, { text: string; color: string }> = {
  0: { text: '未提交', color: 'default' },
  1: { text: '待审核', color: 'orange' },
  2: { text: '审核通过', color: 'green' },
  3: { text: '已退回', color: 'red' },
};

function stateLabel(state: number | null) {
  return stateMap[state ?? 0]?.text ?? `状态${state}`;
}

// 列表行状态：已提交取 submission.state（1待审/2通过/3退回），未提交为 0
function rowState(row: Record<string, unknown>): number {
  const submission = row.submission as { state?: number } | null;
  if (submission?.state != null) return Number(submission.state);
  return 0;
}
</script>

<template>
  <AppCrudTable
    api-url="supervision-logs"
    :filter-fields="filterFields"
    :fields="formFields"
    :extra-query="{ project_id: currentProjectId }"
    :list-scope="2"
    permission-name="supervision_log"
    :inline-actions="['view']"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: false, detail: 'modal' }"
    title="监理日志"
    class="p-4"
  >
    <template #default_state="{ row }">
      <Tag :color="stateMap[rowState(row)]?.color || 'default'">
        {{ stateLabel(rowState(row)) }}
      </Tag>
    </template>
    <template #default_user="{ row }">
      {{ row.user?.name || '-' }}
    </template>
    <template #default_project="{ row }">
      {{ row.project?.name || '-' }}
    </template>
    <template #default_submitted="{ row }">
      {{ row.submission?.created_at || '-' }}
    </template>

    <!-- P3-L02 提交/审核历史时间线 -->
    <template #field_timeline="{ modelValue }">
      <div v-if="modelValue?.length" class="text-sm">
        <div
          v-for="item in modelValue"
          :key="item.version_no"
          class="mb-3 flex gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
        >
          <div class="w-14 shrink-0 text-center">
            <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
              v{{ item.version_no }}
            </span>
            <Tag v-if="item.is_current" color="blue" class="mt-1 !text-xs">当前</Tag>
          </div>
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex items-center gap-2">
              <Tag :color="stateMap[item.state]?.color || 'default'">
                {{ stateLabel(item.state) }}
              </Tag>
              <span class="text-xs text-gray-400">提交于 {{ item.submitted_at || '-' }}</span>
            </div>
            <div v-if="item.audit" class="text-xs text-gray-500">
              审核于 {{ item.audit.audit_time || '-' }} ·
              {{ item.audit.auditor_name || '未知审核人' }}
              <span :class="item.audit.status ? 'text-green-600' : 'text-red-500'">
                {{ item.audit.status ? '通过' : '退回' }}
              </span>
              <span v-if="item.audit.reason" class="text-gray-400">（{{ item.audit.reason }}）</span>
            </div>
            <div v-else class="text-xs text-gray-400">
              {{ item.state === 1 ? '待审核' : '尚未审核' }}
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-gray-400">暂无提交历史</div>
    </template>
  </AppCrudTable>
</template>
