<script setup>
import { computed, ref } from 'vue';

import { Radio, Tag } from 'antdv-next';

import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();

const currentProjectId = computed(
  () => appStore.defaultProject?.id || undefined,
);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

// 查询范围：2=项目范围（默认，审核者可见全部申请） 1=仅本人（后端 scope=1 按 user_id 过滤）
const listScope = ref(2);
const scopeOptions = [
  { label: '全部', value: 2 },
  { label: '只看自己的', value: 1 },
];

const stateOptions = [
  { value: 1, label: '待审核' },
  { value: 2, label: '已加入' },
  { value: 3, label: '已拒绝' },
];

const filterFields = ref([
  {
    field: 'states',
    label: '状态',
    type: 'select',
    span: 8,
    attrs: { options: stateOptions, multiple: true },
  },
]);

const gridColumns = ref([
  { field: 'user.name', title: '姓名', minWidth: 120 },
  { field: 'user.mobile', title: '手机号', width: 140 },
  { field: 'reason', title: '原因', minWidth: 200 },
  {
    field: 'state',
    title: '状态',
    width: 100,
    slots: { default: 'default_state' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

const stateColorMap = { 1: 'blue', 2: 'green', 3: 'red' };

// 详情字段：申请原因 + 申请人信息 + 审核信息（后端 show 已补 audits join）
const detailFields = ref([
  {
    field: 'reason',
    type: 'textarea',
    span: 24,
    label: '申请原因',
    attrs: { disabled: true },
  },
  { field: 'user_info', type: 'slot', span: 12, label: '申请人' },
  { field: 'audit_info', type: 'slot', span: 12, label: '审核信息' },
]);
</script>

<template>
  <AppCrudTable
    api-url="project-joins"
    permission-name="project_join"
    :list-scope="listScope"
    :extra-query="extraQuery"
    :filter-fields="filterFields"
    :fields="detailFields"
    :inline-actions="['view', 'audit']"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :toolbar="{ filter: true, create: false, refresh: true }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    title="项目加入申请"
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

    <template #default_state="{ row }">
      <Tag :color="stateColorMap[row.state] || 'default'">
{{
        row.state_label
      }}
</Tag>
    </template>

    <template #field_user_info="{ modelValue }">
      <div class="text-sm leading-6 text-gray-700">
        <div>{{ modelValue.user?.name || '-' }}</div>
        <div>{{ modelValue.user?.email || '-' }}</div>
        <div>{{ modelValue.user?.mobile || '-' }}</div>
      </div>
    </template>

    <template #field_audit_info="{ modelValue }">
      <div v-if="modelValue.audit" class="text-sm leading-6">
        <Tag :color="modelValue.audit.status ? 'green' : 'red'">
          {{ modelValue.audit.status ? '审核通过' : '审核不通过' }}
        </Tag>
        <div v-if="modelValue.audit.reason" class="text-red-500">
          {{ modelValue.audit.reason }}
        </div>
        <div class="text-gray-500">{{ modelValue.audit.audit_time }}</div>
      </div>
      <div v-else class="text-sm text-gray-400">待审核</div>
    </template>
  </AppCrudTable>
</template>
