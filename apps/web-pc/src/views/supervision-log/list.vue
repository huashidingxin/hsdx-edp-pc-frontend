<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { DatePicker, Radio, Select, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import { useAppStore } from '#/store';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const appStore = useAppStore();

// 全局选择的项目 ID（"所有项目"时为空）
const currentProjectId = computed(() => appStore.defaultProject?.id || undefined);

// 查询范围：2=项目范围（最大权限，默认） 1=仅本人
const listScope = ref(2);
const scopeOptions = [
  { label: '全部', value: 2 },
  { label: '只看自己的', value: 1 },
];

// 记录人选项（项目成员）
const userOptions = ref<{ id: number; name: string }[]>([]);
async function loadUsers() {
  try {
    const api = new Resource('project-users');
    const { data } = await api.list({
      per_page: 'all',
      project_id: currentProjectId.value,
    });
    userOptions.value = (data || []).map((e) => ({
      id: e.user?.id,
      name: e.user?.name,
    }));
  } catch (error) {
    console.error('加载项目成员失败:', error);
  }
}
watch(currentProjectId, loadUsers);
loadUsers();

// 列表列（参考 web-admin：编号/日期/记录人/状态/记录时间/项目/超时）
type GridColumn = { field: string; title: string; width?: number; minWidth?: number; sortable?: boolean; slots?: { default: string } };
const gridColumns = computed<GridColumn[]>(() => {
  const columns: GridColumn[] = [
    {
      field: 'submission.code',
      title: '编号',
      width: 140,
      slots: { default: 'default_code' },
    },
    { field: 'date', title: '日期', width: 120, sortable: true },
    {
      field: 'user.name',
      title: '记录人',
      width: 100,
      slots: { default: 'default_user' },
    },
    {
      field: 'submission.state',
      title: '记录状态',
      width: 110,
      slots: { default: 'default_state' },
    },
    {
      field: 'submission.created_at',
      title: '记录时间',
      width: 160,
      slots: { default: 'default_submitted' },
    },
    {
      field: 'submission_timeout',
      title: '超时',
      width: 80,
      slots: { default: 'default_timeout' },
    },
  ];
  if (!currentProjectId.value) {
    columns.splice(3, 0, {
      field: 'project.name',
      title: '项目',
      minWidth: 160,
      slots: { default: 'default_project' },
    });
  }
  return columns;
});

// 筛选字段（参考 web-admin：编号/记录人/日期范围/提交状态/审核状态/超时状态）
const filterFields = computed(() => [
  { field: 'submission_code', label: '编号', type: 'text', span: 6 },
  { field: 'user_id', label: '记录人', type: 'slot', span: 6 },
  { field: 'date_range', label: '日期', type: 'slot', span: 6 },
  {
    field: 'submission_status',
    label: '提交状态',
    type: 'select',
    span: 6,
    // 未选择项目（全部项目）时默认只看"已提交"，避免大量待提交记录
    default: currentProjectId.value ? undefined : 1,
    attrs: {
      options: [
        { id: 0, name: '待提交' },
        { id: 1, name: '已提交' },
      ],
    },
  },
  {
    field: 'submission_states',
    label: '审核状态',
    type: 'select',
    span: 6,
    attrs: {
      multiple: true,
      options: [
        { id: 1, name: '待审核' },
        { id: 2, name: '审核通过' },
        { id: 3, name: '审核不通过' },
      ],
    },
  },
  {
    field: 'submission_timeouts',
    label: '超时状态',
    type: 'select',
    span: 6,
    attrs: {
      multiple: true,
      options: [
        { id: 0, name: '正常' },
        { id: 1, name: '超时' },
      ],
    },
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
  0: { text: '待提交', color: 'default' },
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
    :list-scope="listScope"
    permission-name="supervision_log"
    :inline-actions="['view']"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: false, detail: 'modal' }"
    title="监理日志"
    class="p-4"
  >
    <template #filter-prepend>
      <div class="mb-3 flex items-center gap-2">
        <span class="text-sm text-gray-500">查询范围</span>
        <Radio.Group
          v-model:value="listScope"
          :options="scopeOptions"
          option-type="button"
          size="small"
        />
      </div>
    </template>

    <!-- 记录人（项目成员选择） -->
    <template #filter_user_id="{ modelValue, update }">
      <Select
        :value="modelValue"
        :options="userOptions"
        placeholder="记录人"
        allow-clear
        show-search
        option-filter-prop="name"
        style="width: 100%"
        @change="update"
      />
    </template>

    <!-- 日期范围 -->
    <template #filter_date_range="{ modelValue, update }">
      <DatePicker.RangePicker
        :value="modelValue"
        value-format="YYYY-MM-DD"
        style="width: 100%"
        placeholder="['开始日期', '结束日期']"
        allow-clear
        @change="update"
      />
    </template>

    <template #default_code="{ row }">
      <span>{{ row.submission?.code || '-' }}</span>
    </template>
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
    <template #default_timeout="{ row }">
      <Tag :color="row.submission_timeout ? 'error' : 'processing'">
        {{ row.submission_timeout ? '超时' : '正常' }}
      </Tag>
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
