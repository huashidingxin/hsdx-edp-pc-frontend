<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { DatePicker, message, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppCancelDialog from '#/components/AppCancelDialog.vue';
import { useTaskFormLoader } from '#/composables/use-task-form';
import { useAppStore } from '#/store';

const appStore = useAppStore();
const tableRef = ref(null);

const editingItem = ref({});

const {
  currentProjectId,
  formFields,
  detailFormat,
  saveFormat,
  loadAll,
  procedureForms,
} = useTaskFormLoader({ editingItem, timeMode: 'separate' });

const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

const gridColumns = ref([
  {
    field: 'start_date',
    title: '日期',
    width: 190,
    slots: { default: 'default_date' },
  },
  {
    field: 'start_time',
    title: '时间',
    width: 160,
    slots: { default: 'default_time' },
  },
  {
    field: 'executors',
    title: '执行人',
    minWidth: 160,
    slots: { default: 'default_executors' },
  },
  { field: 'creator.name', title: '指派人', minWidth: 100 },
  {
    field: 'state',
    title: '状态',
    width: 100,
    slots: { default: 'default_state' },
  },
  { field: 'project.name', title: '项目', minWidth: 150 },
  { field: 'unitProject.name', title: '单位工程', minWidth: 150 },
  { field: 'content', title: '内容', minWidth: 180 },
  { field: 'measure.name', title: '监理方式', width: 100 },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

const stateColorMap = { 1: 'blue', 2: 'blue', 3: 'green', 4: 'orange' };

// 行操作：编辑仅待执行可改，取消后不可编辑/删除
const actionsConfig = [
  { key: 'edit', visible: (row) => !row?.id || (row.status && row.state < 2) },
  { key: 'delete', visible: (row) => row.state < 2 },
];

// 取消任务（需选择取消原因，对齐后端校验 reason_id 必填）
async function cancelPlan({ reason_id, other_reason }) {
  try {
    await new Resource(`plans/${editingItem.value.id}/cancel`).store({
      reason_id,
      other_reason,
    });
    message.success('取消成功');
    tableRef.value?.reload?.();
  } catch (error) {
    console.error(error);
  }
}

watch(() => appStore.defaultProject?.id, loadAll);
onMounted(loadAll);
</script>

<template>
  <AppCrudTable
    ref="tableRef"
    v-model="editingItem"
    api-url="plans"
    permission-name="plan"
    :extra-query="extraQuery"
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
    title="计划任务"
    class="p-4"
  >
    <template #field_start_end_time="{ modelValue, update }">
      <DatePicker.RangePicker
        :value="modelValue"
        value-format="YYYY-MM-DD"
        style="width: 100%"
        placeholder="['开始日期', '结束日期']"
        allow-clear
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
        type="plan"
        @confirm="cancelPlan"
      />
    </template>

    <template #default_date="{ row }">
      <span class="text-xs">{{ row.start_date }} ~ {{ row.end_date }}</span>
    </template>

    <template #default_time="{ row }">
      <Tag color="blue">{{ row.start_time }} ~ {{ row.end_time }}</Tag>
    </template>

    <template #default_executors="{ row }">
      <span class="text-sm">
        {{
          row.executors?.map((e) => e.user?.name || e.name).join('、') || '-'
        }}
      </span>
    </template>

    <template #default_state="{ row }">
      <Tag :color="!row.status ? 'red' : stateColorMap[row.state] || 'default'">
        {{ !row.status ? '已取消' : row.state_label || '未知' }}
      </Tag>
    </template>
  </AppCrudTable>
</template>
