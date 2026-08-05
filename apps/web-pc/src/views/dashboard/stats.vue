<script setup>
/**
 * 数据统计（项目维度）—— 对齐 web-admin dashboard/stats.vue
 * stats/projects API，4 类指标 Tab 切换：监理日志/任务/不符合项/问题
 */
import { computed, ref, watch } from 'vue';

import { DatePicker, Radio, Tag } from 'antdv-next';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();
const currentProjectId = computed(() => appStore.defaultProject?.id || undefined);

// 4 类指标列定义
const types = ref([
  {
    value: 'supervision_log',
    title: '监理日志',
    columns: [
      { field: 'project.name', title: '项目', minWidth: 200 },
      { field: 'total', title: '应提交数', width: 110 },
      { field: 'normal_log', title: '正常提交数', width: 120 },
      { field: 'timeout_log', title: '超时提交数', width: 120 },
      { field: 'timeout_no_log', title: '超时未提交数', width: 120 },
    ],
  },
  {
    value: 'task',
    title: '任务',
    columns: [
      { field: 'project.name', title: '项目', minWidth: 200 },
      { field: 'total', title: '任务数', width: 110 },
      { field: 'normal_log', title: '正常提交数', width: 120 },
      { field: 'timeout_log', title: '超时提交数', width: 120 },
      { field: 'timeout_no_log', title: '超时未提交数', width: 120 },
    ],
  },
  {
    value: 'nonconformance',
    title: '不符合项',
    columns: [
      { field: 'project.name', title: '项目', minWidth: 200 },
      { field: 'total', title: '总数', width: 100 },
      { field: 'pending', title: '待处理', width: 100 },
      { field: 'processing', title: '处理中', width: 100 },
      { field: 'completed', title: '已完成', width: 100 },
      { field: 'completed_in_7_days', title: '7日内完成', width: 110 },
      { field: 'rate', title: '7日闭合率', width: 100, slots: { default: 'default_rate' } },
    ],
  },
  {
    value: 'issue',
    title: '问题',
    columns: [
      { field: 'project.name', title: '项目', minWidth: 200 },
      { field: 'total', title: '总数', width: 100 },
      { field: 'processing', title: '处理中', width: 100 },
      { field: 'completed', title: '已完成', width: 100 },
    ],
  },
]);

const activeType = ref('supervision_log');

const filterFields = ref([
  { field: 'date_from', label: '开始日期', type: 'slot', span: 6 },
  { field: 'date_to', label: '结束日期', type: 'slot', span: 6 },
]);

const gridColumns = ref(types.value[0].columns);
watch(
  () => activeType.value,
  (t) => {
    gridColumns.value = types.value.find((x) => x.value === t)?.columns || [];
  },
);

// 统计请求参数：项目范围 + 类型
const extraQuery = computed(() => ({
  type: activeType.value,
  project_id: currentProjectId.value,
}));
</script>

<template>
  <div>
    <div class="mb-4">
      <Radio.Group
        :value="activeType"
        :options="types.map((t) => ({ label: t.title, value: t.value }))"
        option-type="button"
        button-style="solid"
        @change="(e) => (activeType = e.target.value)"
      />
    </div>

    <AppCrudTable
      api-url="stats/projects"
      permission-name="stats"
      :extra-query="extraQuery"
      :filter-fields="filterFields"
      :fields="[]"
      :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
      :toolbar="{ filter: true, create: false, refresh: true }"
      :inline-actions="[]"
      :open-mode="{ detail: 'drawer' }"
      title="项目数据统计"
      class="p-4"
    >
      <template #filter_date_from="{ modelValue, update }">
        <DatePicker
          :value="modelValue"
          value-format="YYYY-MM-DD"
          style="width: 100%"
          placeholder="开始日期"
          @change="update"
        />
      </template>
      <template #filter_date_to="{ modelValue, update }">
        <DatePicker
          :value="modelValue"
          value-format="YYYY-MM-DD"
          style="width: 100%"
          placeholder="结束日期"
          @change="update"
        />
      </template>
      <template #default_rate="{ row }">
        <Tag>{{ row.completed_in_7_days && row.total ? Math.round((row.completed_in_7_days / row.total) * 100) : 0 }}%</Tag>
      </template>
    </AppCrudTable>
  </div>
</template>
