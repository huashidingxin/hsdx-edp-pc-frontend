<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { DatePicker, message, Radio, Select, Tag, Tooltip } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppCancelDialog from '#/components/AppCancelDialog.vue';
import SubmissionPreviewDrawer from '#/components/SubmissionPreviewDrawer.vue';
import { useTaskFormLoader } from '#/composables/use-task-form';
import { useAppStore } from '#/store';

const appStore = useAppStore();
const tableRef = ref(null);
const previewRef = ref(null);

const editingItem = ref({});

const {
  currentProjectId,
  formFields,
  detailFormat,
  saveFormat,
  loadAll,
  procedureForms,
} = useTaskFormLoader({ editingItem, timeMode: 'combined' });

const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

// 查询范围：2=项目范围（默认，可看全部） 1=仅本人（后端 scope=1 按 executor_id 过滤）
const listScope = ref(2);
const scopeOptions = [
  { label: '全部', value: 2 },
  { label: '只看自己的', value: 1 },
];

// 执行人选项（列表筛选用，对齐后端 filters executor_id=tasks.executor_id）
const executorOptions = ref([]);
async function loadExecutorOptions() {
  const { data } = await new Resource('project-users').list({
    project_id: currentProjectId.value,
    per_page: 'all',
  });
  executorOptions.value = (data || []).map((e) => ({
    value: e.user_id,
    label: e.user?.name || `#${e.user_id}`,
  }));
}

// 任务状态筛选（后端支持 state in states）
const stateOptions = [
  { value: 1, label: '待执行' },
  { value: 2, label: '进行中' },
  { value: 3, label: '已完成' },
  { value: 4, label: '异常' },
];

const filterFields = ref([
  {
    field: 'executor_id',
    label: '执行人',
    type: 'select',
    span: 8,
    attrs: { options: [] },
  },
  {
    field: 'states',
    label: '状态',
    type: 'select',
    span: 8,
    attrs: { options: stateOptions, multiple: true },
  },
  { field: 'date_range', label: '日期', type: 'slot', span: 8 },
]);

const gridColumns = ref([
  { field: 'date', title: '日期', width: 110 },
  {
    field: 'executor',
    title: '执行人',
    minWidth: 110,
    slots: { default: 'default_executor' },
  },
  { field: 'creator.name', title: '指派人', minWidth: 100 },
  {
    field: 'state',
    title: '状态',
    width: 100,
    slots: { default: 'default_state' },
  },
  { field: 'project.name', title: '项目', minWidth: 140 },
  { field: 'content', title: '内容', minWidth: 180 },
  { field: 'measure.name', title: '监理方式', width: 100 },
  { field: 'attendance_in.check_time', title: '签到', width: 150 },
  { field: 'attendance_out.check_time', title: '签退', width: 150 },
  {
    field: 'submission',
    title: '日志',
    width: 150,
    slots: { default: 'default_submission' },
  },
  {
    field: 'has_prereq_warning',
    title: '前置警告',
    width: 100,
    slots: { default: 'default_prereq_warning' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

const stateColorMap = { 1: 'blue', 2: 'blue', 3: 'green', 4: 'orange' };
const submissionStateColorMap = { 1: 'orange', 2: 'green', 3: 'red' };

// P3-T02 前置警告列 tooltip：解析后端返回的 prereq_warning_procedures JSON 字符串
function prereqWarningTooltip(procsJson) {
  try {
    const list = JSON.parse(procsJson || '[]');
    return list
      .map((p) => {
        const scope = p.milepost_name ? `桩号${p.milepost_name}` : '项目整体';
        return `${scope}缺前置工序"${p.prerequisite_name}"`;
      })
      .join('；');
  } catch {
    return '';
  }
}

// 行操作：编辑仅待执行可改，取消后不可编辑/删除
const actionsConfig = [
  { key: 'edit', visible: (row) => !row?.id || (row.status && row.state < 2) },
  { key: 'delete', visible: (row) => row.state < 2 },
];

// 预览提交记录
function openSubmissionPreview(submission) {
  previewRef.value?.open(submission);
}

// 编辑时不可修改执行人（后端 update 不保存 executor_id，去除无效字段）
const excludeFields = computed(() =>
  editingItem.value?.id ? ['executors'] : [],
);

// 取消任务（需选择取消原因）
async function cancelTask({ reason_id, other_reason }) {
  try {
    await new Resource(`tasks/${editingItem.value.id}/cancel`).store({
      reason_id,
      other_reason,
    });
    message.success('取消成功');
    tableRef.value?.reload?.();
  } catch (error) {
    console.error(error);
  }
}

async function refreshAll() {
  await Promise.all([loadAll(), loadExecutorOptions()]);
}

watch(() => appStore.defaultProject?.id, refreshAll);
onMounted(refreshAll);
</script>

<template>
  <AppCrudTable
    ref="tableRef"
    v-model="editingItem"
    api-url="tasks"
    permission-name="task"
    :list-scope="listScope"
    :extra-query="extraQuery"
    :filter-fields="filterFields"
    :exclude-fields="excludeFields"
    :actions-config="actionsConfig"
    :detail-format="detailFormat"
    :save-format="saveFormat"
    :fields="formFields"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="任务执行"
    class="p-4"
  >
    <template #filter-prepend>
      <Radio.Group
        :value="listScope"
        option-type="button"
        button-style="solid"
        :options="scopeOptions"
        @change="(e) => (listScope = e.target.value)"
      />
    </template>

    <template #filter_executor_id="{ modelValue, update }">
      <Select
        :value="modelValue"
        :options="executorOptions"
        placeholder="执行人"
        allow-clear
        show-search
        option-filter-prop="label"
        style="width: 100%"
        @change="update"
      />
    </template>

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

    <template #field_start_end_time="{ modelValue, update }">
      <DatePicker.RangePicker
        :value="modelValue"
        value-format="YYYY-MM-DD HH:mm:ss"
        show-time
        format="YYYY-MM-DD HH:mm"
        style="width: 100%"
        placeholder="['开始时间', '结束时间']"
        @change="update"
      />
    </template>

    <template #field_form>
      <div v-if="editingItem?.measure_id" class="text-sm text-gray-600">
        任务表单：{{
          procedureForms[editingItem.measure_id]?.form?.name ||
          '未配置该监理方式的表单'
        }}
      </div>
    </template>

    <template #form-action>
      <AppCancelDialog
        v-if="editingItem?.id && editingItem.status"
        type="task"
        @confirm="cancelTask"
      />
    </template>

    <template #default_executor="{ row }">
      <span class="text-sm">{{ row.executor?.name || '-' }}</span>
    </template>

    <template #default_state="{ row }">
      <Tag :color="!row.status ? 'red' : stateColorMap[row.state] || 'default'">
        {{ !row.status ? '已取消' : row.state_label || '未知' }}
      </Tag>
    </template>

    <template #default_submission="{ row }">
      <template v-if="row.submission?.code">
        <Tag
          :color="submissionStateColorMap[row.submission.state] || 'default'"
          class="cursor-pointer"
          @click="openSubmissionPreview(row.submission)"
        >
          {{ row.submission.code }}
        </Tag>
      </template>
      <span v-else>-</span>
    </template>

    <template #default_prereq_warning="{ row }">
      <template v-if="Number(row.has_prereq_warning) === 1">
        <Tooltip :title="prereqWarningTooltip(row.prereq_warning_procedures)">
          <Tag color="orange" class="cursor-pointer">
            {{
              Number(row.active_prereq_warning_count) > 1
                ? `有警告(${row.active_prereq_warning_count})`
                : '有警告'
            }}
          </Tag>
        </Tooltip>
      </template>
      <span v-else>-</span>
    </template>
  </AppCrudTable>

  <SubmissionPreviewDrawer ref="previewRef" />
</template>
