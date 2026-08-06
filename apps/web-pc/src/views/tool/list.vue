<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { Button, DatePicker, message, Modal, Select, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppList from '#/components/AppList.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();
const tableRef = ref(null);
const editingItem = ref({});

const currentProjectId = computed(
  () => appStore.defaultProject?.id || undefined,
);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

const stateOptions = [
  { value: 1, label: '正常' },
  { value: 2, label: '待检' },
  { value: 3, label: '损坏' },
  { value: 4, label: '报废' },
];

const categories = ref([]);
async function loadCategories() {
  const { data } = await new Resource('categories').list({
    per_page: 'all',
    type: 'tool',
  });
  categories.value = (data || []).map((c) => ({ value: c.id, label: c.name }));
  const field = formFields.value.find((f) => f.field === 'category_id');
  if (field) field.attrs.options = categories.value;
}

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
  {
    field: 'states',
    label: '状态',
    type: 'select',
    span: 8,
    attrs: { options: stateOptions, multiple: true },
  },
]);

const formFields = ref([
  { field: 'name', type: 'text', span: 12, label: '名称', required: true },
  { field: 'code', type: 'text', span: 12, label: '编号', required: true },
  {
    field: 'category_id',
    type: 'select',
    span: 12,
    label: '分类',
    required: true,
    attrs: { options: [] },
  },
  {
    field: 'calibration_days',
    type: 'number',
    span: 12,
    label: '检定周期（天）',
    required: true,
  },
  {
    field: 'state',
    type: 'select',
    span: 12,
    label: '状态',
    attrs: { options: stateOptions },
  },
  { field: 'maintenances', type: 'slot', span: 24, label: '维护记录' },
]);

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 160 },
  { field: 'code', title: '编号', width: 110 },
  { field: 'project.name', title: '项目', minWidth: 140 },
  { field: 'category.name', title: '分类', minWidth: 100 },
  {
    field: 'state',
    title: '状态',
    width: 90,
    slots: { default: 'default_state' },
  },
  { field: 'calibration_days', title: '检定周期', width: 90 },
  { field: 'last_calibration_time', title: '最后检定时间', width: 160 },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

const stateColorMap = { 1: 'green', 2: 'orange', 3: 'red', 4: 'default' };

// ========================= 维护记录（内嵌子表 + 新增弹窗） =========================
const maintenances = ref([]);
const maintenanceTypeOptions = [
  { value: 1, label: '保养' },
  { value: 2, label: '维修' },
];

async function loadMaintenances() {
  const { data } = await new Resource('maintenances').list({
    maintenanceable_type: 'tool',
    maintenanceable_id: editingItem.value.id,
    per_page: 'all',
  });
  maintenances.value = data || [];
}

watch(
  () => editingItem.value?.id,
  (id) => {
    if (id) loadMaintenances();
  },
);

const maintenanceDialog = ref(false);
const maintenanceForm = ref({ type: 1, start_end_time: [] });

async function submitMaintenance() {
  const [start_time, end_time] = maintenanceForm.value.start_end_time || [];
  if (!start_time || !end_time) {
    message.warning('请选择起止时间');
    return;
  }
  try {
    await new Resource('maintenances').store({
      maintenanceable_type: 'tool',
      maintenanceable_id: editingItem.value.id,
      type: maintenanceForm.value.type,
      start_time,
      end_time,
    });
    message.success('操作成功');
    maintenanceDialog.value = false;
    maintenanceForm.value = { type: 1, start_end_time: [] };
    await loadMaintenances();
    tableRef.value?.reload?.();
  } catch (error) {
    console.error(error);
  }
}

const maintenanceListOptions = ref({
  columns: [
    { field: 'type_label', title: '类型', width: 90 },
    { field: 'start_time', title: '开始时间', minWidth: 160 },
    { field: 'end_time', title: '结束时间', minWidth: 160 },
    { field: 'created_at', title: '创建时间', minWidth: 180 },
  ],
  showFooter: false,
});

onMounted(loadCategories);
</script>

<template>
  <AppCrudTable
    ref="tableRef"
    v-model="editingItem"
    api-url="tools"
    permission-name="tool"
    :extra-query="extraQuery"
    :filter-fields="filterFields"
    :fields="formFields"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="工具管理"
    class="p-4"
  >
    <template #field_maintenances>
      <div v-if="editingItem?.id" class="flex flex-col gap-2">
        <div class="flex justify-end">
          <Button type="primary" size="small" @click="maintenanceDialog = true">
登记维护
</Button>
        </div>
        <AppList
          v-model="maintenances"
          :options="maintenanceListOptions"
          :show-action="false"
          row-key="id"
          height="240"
        />
      </div>
    </template>

    <template #default_state="{ row }">
      <Tag :color="stateColorMap[row.state] || 'default'">
{{
        row.state_label || '-'
      }}
</Tag>
    </template>

    <Modal
      v-model:open="maintenanceDialog"
      title="登记维护"
      ok-text="提交"
      @ok="submitMaintenance"
    >
      <div class="space-y-4 py-2">
        <div>
          <div class="mb-1 text-sm text-gray-600">类型</div>
          <Select
            v-model:value="maintenanceForm.type"
            :options="maintenanceTypeOptions"
            style="width: 100%"
          />
        </div>
        <div>
          <div class="mb-1 text-sm text-gray-600">起止时间</div>
          <DatePicker.RangePicker
            v-model:value="maintenanceForm.start_end_time"
            value-format="YYYY-MM-DD HH:mm:ss"
            show-time
            format="YYYY-MM-DD HH:mm"
            style="width: 100%"
          />
        </div>
      </div>
    </Modal>
  </AppCrudTable>
</template>
