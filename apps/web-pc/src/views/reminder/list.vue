<script setup>
/**
 * P3-L06/L07/P5-010 提醒发送记录（web-pc /reminder/list）：
 * 未填写日志（06:00）、总监未审核日志（12:00）、定位开启提醒（08:00）的短信+站内通知发送记录，只读。
 */
import { ref } from 'vue';

import { Tag } from 'antdv-next';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const typeOptions = [
  { value: 'log_missing', label: '未填写日志' },
  { value: 'log_unaudited', label: '未审核日志' },
  { value: 'location_open', label: '定位开启提醒' },
];

const statusOptions = [
  { value: 1, label: '已发送' },
  { value: 0, label: '失败/待发送' },
];

const filterFields = ref([
  { field: 'type', label: '类型', type: 'select', span: 8, attrs: { options: typeOptions } },
  { field: 'target_date', label: '目标日期', type: 'date', span: 8 },
  { field: 'user_id', label: '收件人ID', type: 'number', span: 8 },
  { field: 'project_id', label: '项目ID', type: 'number', span: 8 },
  { field: 'status', label: '状态', type: 'select', span: 8, attrs: { options: statusOptions } },
]);

const gridColumns = ref([
  { field: 'type_label', title: '类型', width: 120 },
  { field: 'target_date', title: '目标日期', width: 120 },
  { field: 'user_name', title: '收件人', width: 140 },
  { field: 'project_name', title: '项目', minWidth: 140 },
  { field: 'mobile', title: '手机号', width: 130 },
  { field: 'content', title: '内容', minWidth: 220 },
  { field: 'status', title: '状态', width: 100, slots: { default: 'default_status' } },
  { field: 'sent_at', title: '发送时间', width: 170 },
  { field: 'error', title: '错误信息', minWidth: 140 },
]);

const statusColorMap = { 1: 'green', 0: 'red' };
</script>

<template>
  <AppCrudTable
    api-url="reminder-logs"
    :filter-fields="filterFields"
    :fields="[]"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :show-actions="false"
    :toolbar="{ filter: true, create: false, refresh: true, print: false, export: false, more: false }"
    title="提醒记录"
    class="p-4"
  >
    <template #default_status="{ row }">
      <Tag :color="statusColorMap[row.status] || 'default'">{{ row.status_label || '-' }}</Tag>
    </template>
  </AppCrudTable>
</template>
