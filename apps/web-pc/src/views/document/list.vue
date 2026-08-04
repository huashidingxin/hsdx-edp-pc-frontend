<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { DatePicker, Radio, Select, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();

const currentProjectId = computed(() => appStore.defaultProject?.id || undefined);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

// 查询范围：2=项目范围（默认） 1=仅本人
const listScope = ref(2);
const scopeOptions = [
  { label: '全部', value: 2 },
  { label: '只看自己的', value: 1 },
];

// 文档类型（forms?type=4）
const formOptions = ref([]);
async function loadForms() {
  const { data } = await new Resource('forms').list({ per_page: 'all', type: 4 });
  formOptions.value = (data || []).map((f) => ({ value: f.id, label: f.name }));
  const field = filterFields.value.find((f) => f.field === 'form_id');
  if (field) field.attrs.options = formOptions.value;
}

// 记录人（项目成员）
const userOptions = ref([]);
async function loadUsers() {
  const { data } = await new Resource('project-users').list({
    per_page: 'all',
    project_id: currentProjectId.value,
  });
  userOptions.value = (data || []).map((u) => ({
    value: u.user_id,
    label: u.user?.name || `#${u.user_id}`,
  }));
}

const filterFields = ref([
  { field: 'form_id', label: '类型', type: 'select', span: 6, attrs: { options: [] } },
  { field: 'user_id', label: '记录人', type: 'slot', span: 6 },
  { field: 'date_range', label: '日期', type: 'slot', span: 6 },
  { field: 'submission_status', label: '提交状态', type: 'select', span: 6, default: currentProjectId.value ? undefined : 1, attrs: { options: [
    { value: 0, label: '待提交' },
    { value: 1, label: '已提交' },
  ] } },
]);

const detailFields = ref([
  { field: 'submission.code', type: 'text', span: 12, label: '编号' },
  { field: 'form.name', type: 'text', span: 12, label: '文档类型' },
  { field: 'deadline_time', type: 'text', span: 12, label: '截止提交日期' },
  { field: 'user.name', type: 'text', span: 12, label: '记录人' },
  { field: 'state', type: 'text', span: 12, label: '记录状态' },
  { field: 'submission.created_at', type: 'text', span: 12, label: '记录时间' },
  { field: 'project.name', type: 'text', span: 12, label: '项目' },
]);

const gridColumns = ref([
  { field: 'submission.code', title: '编号', width: 130, slots: { default: 'default_code' } },
  { field: 'form.name', title: '文档类型', minWidth: 150 },
  { field: 'deadline_time', title: '截止提交日期', width: 150 },
  { field: 'user.name', title: '记录人', minWidth: 100 },
  { field: 'state', title: '记录状态', width: 100, slots: { default: 'default_state' } },
  { field: 'submission.created_at', title: '记录时间', width: 160 },
  { field: 'project.name', title: '项目', minWidth: 150 },
]);

const stateColorMap = { 0: 'default', 1: 'blue', 2: 'green', 3: 'red' };

onMounted(() => {
  loadForms();
  loadUsers();
});

watch(() => appStore.defaultProject?.id, loadUsers);
</script>

<template>
  <AppCrudTable
    api-url="documents"
    permission-name="document"
    :list-scope="listScope"
    :extra-query="extraQuery"
    :filter-fields="filterFields"
    :fields="detailFields"
    :inline-actions="['view']"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :toolbar="{ filter: true, create: false, refresh: true }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    title="项目文档台账"
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

    <template #filter_user_id="{ modelValue, update }">
      <Select
        :value="modelValue"
        :options="userOptions"
        placeholder="记录人"
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

    <template #default_code="{ row }">
      <span>{{ row.submission?.code || '-' }}</span>
    </template>

    <template #default_state="{ row }">
      <Tag :color="stateColorMap[row.state] || 'default'">{{ row.state_label || '-' }}</Tag>
    </template>
  </AppCrudTable>
</template>
