<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { Alert, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { useAppStore } from '#/store';

/**
 * 问题跟踪(历史) —— DEC-012 + STEP 2 已退役为只读视图：
 * 不符合项整改/通知/级别等业务属性已直接并入 nonconformances 表自闭环管理。
 * 本页保留仅供历史反查，不可新建/编辑/删除（后端接口已 410 化）。
 */
const appStore = useAppStore();

const currentProjectId = computed(
  () => appStore.defaultProject?.id || undefined,
);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

const levelOptions = ref([]);
const stakeholderOptions = ref([]);

async function loadLevels() {
  try {
    const { data } = await new Resource('issue-levels').list({
      per_page: 'all',
    });
    levelOptions.value = (data || []).map((l) => ({
      value: l.id,
      label: l.name,
    }));
    const field = formFields.value.find((f) => f.field === 'level_id');
    if (field) field.attrs.options = levelOptions.value;
    const f2 = filterFields.value.find((f) => f.field === 'level_id');
    if (f2) f2.attrs.options = levelOptions.value;
  } catch {
    // issue-levels 接口也可能退役，弱化处理
  }
}

async function loadStakeholders() {
  try {
    const { data } = await new Resource('stakeholders').list({
      per_page: 'all',
      project_id: currentProjectId.value,
    });
    stakeholderOptions.value = (data || []).map((s) => ({
      value: s.id,
      label: s.name,
    }));
  } catch {}
}

const filterFields = ref([
  { field: 'code', label: '编号', type: 'text', span: 8 },
  {
    field: 'states',
    label: '状态',
    type: 'select',
    span: 8,
    attrs: {
      multiple: true,
      options: [
        { label: '待处理', value: 1 },
        { label: '处理中', value: 2 },
        { label: '已完成', value: 3 },
      ],
    },
  },
  {
    field: 'level_id',
    label: '问题级别',
    type: 'select',
    span: 8,
    attrs: { options: [] },
  },
]);

const formFields = ref([
  {
    field: 'code',
    type: 'text',
    label: '问题编号',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'state_label',
    type: 'text',
    label: '状态',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'stakeholder_id',
    type: 'slot',
    label: '相关方',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'level_id',
    type: 'select',
    label: '问题级别',
    span: 12,
    displayOnly: true,
    attrs: { options: [] },
  },
  {
    field: 'deadline',
    type: 'datetime',
    label: '整改期限',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'description',
    type: 'textarea',
    label: '问题描述',
    span: 24,
    displayOnly: true,
  },
  {
    field: 'requirement',
    type: 'textarea',
    label: '整改要求',
    span: 24,
    displayOnly: true,
  },
  {
    field: 'notice',
    type: 'image',
    label: '通知单',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'notice_reply',
    type: 'image',
    label: '通知回复单',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'nonconformances',
    type: 'slot',
    label: '关联不符合项',
    span: 24,
    displayOnly: true,
  },
]);

const stateColors = {
  1: 'orange',
  2: 'blue',
  3: 'green',
};

const ncStateLabel = (s) =>
  ({ 0: '草稿', 1: '待审核', 2: '已签发', 3: '已退回' })[s] ?? '-';
const ncRectifyLabel = (s) =>
  ({ 0: '待整改', 1: '整改中', 2: '已整改', 3: '已闭环' })[s] ?? '-';
const NC_RECTIFY_COLORS = { 1: 'blue', 2: 'purple', 3: 'green' };
const ncRectifyColor = (s) => NC_RECTIFY_COLORS[s] || 'orange';

const gridColumns = ref([
  { field: 'code', title: '编号', minWidth: 120 },
  { field: 'stakeholder.name', title: '相关方', minWidth: 120 },
  { field: 'issue_levels.name', title: '级别', width: 80 },
  {
    field: 'state',
    title: '状态',
    width: 100,
    slots: { default: 'default_state' },
  },
  { field: 'description', title: '问题描述', minWidth: 200 },
  { field: 'deadline', title: '整改期限', width: 120 },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

onMounted(() => {
  loadLevels();
  loadStakeholders();
});
watch(() => appStore.defaultProject?.id, loadStakeholders);
</script>

<template>
  <Alert
    type="warning"
    show-icon
    class="m-4 mb-0"
    message="本功能已退役为只读历史视图"
    description="问题(Issue) 聚合层已废弃，不符合项的整改/通知/级别/责任单位/复查等信息已直接并入「不符合项」详情并按三阶段（发现→签发→整改回复→复查→闭环）独立闭环。本页仅供历史归档反查，不可新建/编辑/删除。"
  />

  <AppCrudTable
    api-url="issues"
    :filter-fields="filterFields"
    :fields="formFields"
    :extra-query="extraQuery"
    :list-scope="2"
    permission-name="issue"
    :inline-actions="['view']"
    :exclude-fields="['nonconformances', 'stakeholder_id', 'code']"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ detail: 'drawer' }"
    :toolbar-config="{
      create: false,
      refresh: true,
      print: false,
      export: false,
    }"
    :form-attrs="{ layout: 'vertical', size: 'medium', disabled: true }"
    title="问题跟踪(历史)"
    class="p-4"
  >
    <template #default_state="{ row }">
      <Tag :color="stateColors[row.state] || 'default'">
        {{ row.state_label || row.state_desc || '-' }}
      </Tag>
    </template>

    <template #field_stakeholder_id="{ modelValue }">
      <span>{{ modelValue || '-' }}</span>
    </template>

    <template #field_nonconformances="{ modelValue }">
      <div v-if="modelValue && modelValue.length" class="space-y-2">
        <div
          v-for="(nc, i) in modelValue"
          :key="i"
          class="rounded border p-2 text-sm"
        >
          <div class="flex items-center justify-between">
            <span>{{ nc.code || '-' }}</span>
            <span class="space-x-1">
              <Tag
                :color="
                  nc.state === 2 ? 'green' : nc.state === 3 ? 'red' : 'orange'
                "
              >
                {{ ncStateLabel(nc.state) }}
              </Tag>
              <Tag :color="ncRectifyColor(nc.rectify_state)">
                {{ ncRectifyLabel(nc.rectify_state) }}
              </Tag>
            </span>
          </div>
          <div class="mt-1 text-gray-500">{{ nc.content }}</div>
        </div>
      </div>
      <div v-else class="text-sm text-gray-400">无关联不符合项</div>
    </template>
  </AppCrudTable>
</template>
