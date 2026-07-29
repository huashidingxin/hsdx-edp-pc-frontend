<script setup>
import { ref } from 'vue';

import { Image, Tag } from 'antdv-next';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const filterFields = ref([
  { field: 'mobile', label: '手机号', type: 'text', span: 12 },
  { field: 'email', label: '邮箱', type: 'text', span: 12 },
]);

const formFields = ref([
  { field: 'mobile', type: 'text', label: '手机号', span: 12, displayOnly: true },
  { field: 'email', type: 'text', label: '邮箱', span: 12, displayOnly: true },
  { field: 'realname', type: 'slot', label: '申请人', span: 24 },
  { field: 'user', type: 'slot', label: '账号信息', span: 24 },
  { field: 'audit', type: 'slot', label: '审核结果', span: 24 },
]);

const gridColumns = ref([
  { field: 'realname', title: '姓名', minWidth: 100, slots: { default: 'default_realname' } },
  { field: 'user', title: '用户名', minWidth: 120, slots: { default: 'default_username' } },
  { field: 'mobile', title: '手机号', width: 130 },
  { field: 'email', title: '邮箱', minWidth: 160 },
  { field: 'audit', title: '审核状态', width: 100, slots: { default: 'default_audit' } },
  { field: 'created_at', title: '申请时间', width: 160 },
]);

function audited(row) {
  return row && row.audit_id;
}
function auditStatus(row) {
  if (!audited(row)) return '待审核';
  return row.audit?.status ? '已通过' : '已拒绝';
}
function auditColor(row) {
  if (!audited(row)) return 'orange';
  return row.audit?.status ? 'green' : 'red';
}
</script>

<template>
  <AppCrudTable
    api-url="staff-applications"
    :filter-fields="filterFields"
    :fields="formFields"
    permission-name="staff_application"
    :inline-actions="['view', 'audit']"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="员工申请"
    class="p-4"
  >
    <template #default_realname="{ row }">
      {{ row.realname?.name || '-' }}
    </template>
    <template #default_username="{ row }">
      {{ row.user?.username || '-' }}
    </template>
    <template #default_audit="{ row }">
      <Tag :color="auditColor(row)">{{ auditStatus(row) }}</Tag>
    </template>

    <template #field_realname="{ modelValue }">
      <div class="space-y-1">
        <div>姓名：{{ modelValue?.name || '-' }}</div>
        <div>身份证号：{{ modelValue?.idcard || '-' }}</div>
      </div>
    </template>
    <template #field_user="{ modelValue }">
      <div class="flex items-start gap-4">
        <Image v-if="modelValue?.avatar" :src="modelValue.avatar" :width="80" />
        <div class="space-y-1">
          <div>用户名：{{ modelValue?.username || '-' }}</div>
          <Image v-if="modelValue?.id_photo" :src="modelValue.id_photo" :width="80" />
        </div>
      </div>
    </template>
    <template #field_audit="{ modelValue }">
      <div class="space-y-1">
        <Tag :color="modelValue?.status ? 'green' : 'red'">
          状态：{{ modelValue?.status ? '通过' : '未通过' }}
        </Tag>
        <div v-if="modelValue?.reason">审核意见：{{ modelValue.reason }}</div>
        <div v-if="modelValue?.audit_time">审核时间：{{ modelValue.audit_time }}</div>
      </div>
    </template>
  </AppCrudTable>
</template>
