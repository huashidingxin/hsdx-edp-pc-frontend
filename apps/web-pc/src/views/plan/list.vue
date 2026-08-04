<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { DatePicker, Button, message, Modal, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import { useAppStore } from '#/store';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const appStore = useAppStore();
const tableRef = ref(null);

const currentProjectId = computed(() => appStore.defaultProject?.id || undefined);

const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

// ========================= 远程选项 =========================
const stakeholders = ref([]);
const divisions = ref([]);
const procedures = ref([]);
const measures = ref([]);
const procedureForms = ref({});
const executors = ref([]);
const mileposts = ref([]);
const projectCategories = ref([]);

function buildTree(list) {
  const map = {};
  const roots = [];
  list.forEach((n) => {
    map[n.id] = { ...n, children: [] };
  });
  list.forEach((n) => {
    if (n.parent_id && map[n.parent_id]) map[n.parent_id].children.push(map[n.id]);
    else roots.push(map[n.id]);
  });
  return roots;
}

async function loadStakeholders() {
  const { data } = await new Resource('stakeholders').list({
    project_id: currentProjectId.value,
    per_page: 'all',
  });
  stakeholders.value = data || [];
  setOptions('stakeholder_id', stakeholders.value);
}

async function loadDivisions() {
  const { data } = await new Resource('divisions').list({
    project_id: currentProjectId.value,
    levels: [1, 2],
    per_page: 'all',
  });
  divisions.value = buildTree(data || []);
  setOptions('unit_project_id', divisions.value);
}

async function loadProcedures() {
  const { data } = await new Resource('procedures').list({
    categories: projectCategories.value,
    per_page: 'all',
  });
  procedures.value = data || [];
  setOptions('procedure_id', procedures.value);
}

async function loadMeasures() {
  const { data } = await new Resource('measures').list({
    project_id: currentProjectId.value,
    per_page: 'all',
  });
  measures.value = data || [];
  syncMeasureOptions();
}

async function loadProcedureForms(procedureId) {
  if (!procedureId) return;
  const { data } = await new Resource('procedure-forms').list({
    procedure_id: procedureId,
    project_id: currentProjectId.value,
  });
  procedureForms.value = {};
  (data || []).forEach((item) => {
    procedureForms.value[item.measure_id] = item;
  });
  syncMeasureOptions();
}

function syncMeasureOptions() {
  const validMeasures = measures.value.filter((m) => procedureForms.value[m.id]);
  setOptions('measure_id', validMeasures.length ? validMeasures : measures.value);
  const field = formFields.value.find((f) => f.field === 'measure_id');
  const hasValid = validMeasures.some((m) => m.id === editingItem.value?.measure_id);
  if (editingItem.value?.measure_id && !hasValid) editingItem.value.measure_id = undefined;
}

async function loadExecutors() {
  const { data } = await new Resource('project-users').list({
    project_id: currentProjectId.value,
    per_page: 'all',
  });
  executors.value = (data || []).map((e) => ({
    value: e.user_id,
    label: e.user?.name || `#${e.user_id}`,
  }));
  setOptions('executors', executors.value);
}

async function loadMileposts() {
  const { data } = await new Resource('mileposts').list({
    project_id: currentProjectId.value,
    per_page: 'all',
  });
  mileposts.value = data || [];
  setOptions('mileposts', mileposts.value);
}

function setOptions(field, options) {
  const f = formFields.value.find((x) => x.field === field);
  if (f) f.attrs.options = options;
}

async function loadProjectData() {
  if (!appStore.defaultProject) return;
  projectCategories.value =
    appStore.defaultProject.categories?.map((v) => v.id) ||
    (appStore.defaultProject.category_id ? [appStore.defaultProject.category_id] : []);
  await Promise.all([
    loadStakeholders(),
    loadDivisions(),
    loadProcedures(),
    loadMeasures(),
    loadExecutors(),
    loadMileposts(),
  ]);
}

// ========================= 表单联动 =========================
const editingItem = ref({});
watch(
  () => editingItem.value?.procedure_id,
  async (pid) => {
    if (pid) await loadProcedureForms(pid);
  },
);

// ========================= 字段定义 =========================
const formFields = ref([
  { field: 'start_end_time', type: 'slot', span: 12, label: '起止日期' },
  { field: 'start_time', type: 'time', span: 6, label: '开始时间', required: true },
  { field: 'end_time', type: 'time', span: 6, label: '结束时间', required: true },
  { field: 'stakeholder_id', type: 'select', span: 8, label: '相关单位', attrs: { options: [] } },
  { field: 'unit_project_id', type: 'tree-select', span: 8, label: '单位工程', required: true, attrs: { options: [] } },
  { field: 'procedure_id', type: 'select', span: 8, label: '工序', required: true, attrs: { options: [] } },
  { field: 'measure_id', type: 'select', span: 8, label: '监理方式', required: true, attrs: { options: [] } },
  { field: 'executors', type: 'select', span: 16, label: '执行人', required: true, attrs: { options: [], multiple: true } },
  { field: 'mileposts', type: 'select', span: 16, label: '桩号/地点', required: true, attrs: { options: [], multiple: true } },
  { field: 'content', type: 'textarea', span: 24, label: '任务内容' },
  { field: 'form', type: 'slot', span: 24, label: '任务表单' },
]);

const gridColumns = ref([
  { field: 'start_date', title: '日期', width: 190, slots: { default: 'default_date' } },
  { field: 'start_time', title: '时间', width: 160, slots: { default: 'default_time' } },
  { field: 'executors', title: '执行人', minWidth: 160, slots: { default: 'default_executors' } },
  { field: 'creator.name', title: '指派人', minWidth: 100 },
  { field: 'state', title: '状态', width: 100, slots: { default: 'default_state' } },
  { field: 'project.name', title: '项目', minWidth: 150 },
  { field: 'unitProject.name', title: '单位工程', minWidth: 150 },
  { field: 'content', title: '内容', minWidth: 180 },
  { field: 'measure.name', title: '监理方式', width: 100 },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

const stateColorMap = { 1: 'blue', 2: 'blue', 3: 'green', 4: 'orange' };

// ========================= 数据转换 =========================
function detailFormat(e) {
  const data = { ...e };
  if (data.start_date) data.start_end_time = [data.start_date, data.end_date];
  if (Array.isArray(data.executors)) data.executors = data.executors.map((x) => x.user_id);
  if (Array.isArray(data.mileposts)) data.mileposts = data.mileposts.map((x) => x.id);
  return data;
}

function saveFormat(e) {
  const payload = { ...e };
  if (Array.isArray(payload.start_end_time)) {
    payload.start_date = payload.start_end_time[0];
    payload.end_date = payload.start_end_time[1];
  }
  delete payload.start_end_time;
  if (Array.isArray(payload.executors)) payload.executors = payload.executors.map((id) => ({ id }));
  if (Array.isArray(payload.mileposts)) payload.mileposts = payload.mileposts.map((id) => ({ id }));
  payload.project_id = payload.project_id || currentProjectId.value;
  return payload;
}

// 行操作：编辑仅待执行可改，取消后不可编辑/删除
const actionsConfig = [
  { key: 'edit', visible: (row) => !row?.id || (row.status && row.state < 2) },
  { key: 'delete', visible: (row) => row.state < 2 },
];

// 取消任务
function cancelPlan() {
  Modal.confirm({
    title: '确定取消该任务？',
    onOk: async () => {
      try {
        await new Resource(`plans/${editingItem.value.id}/cancel`).store();
        message.success('取消成功');
        tableRef.value?.reload?.();
      } catch (error) {
        console.error(error);
      }
    },
  });
}

watch(() => appStore.defaultProject?.id, loadProjectData);
onMounted(loadProjectData);
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
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
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
        任务表单：{{ procedureForms[editingItem.measure_id]?.form?.name || '未配置该监理方式的表单' }}
      </div>
    </template>

    <template #form-action>
      <Button v-if="editingItem?.id && editingItem.status" danger @click="cancelPlan">
        取消任务
      </Button>
    </template>

    <template #default_date="{ row }">
      <span class="text-xs">{{ row.start_date }} ~ {{ row.end_date }}</span>
    </template>

    <template #default_time="{ row }">
      <Tag color="blue">{{ row.start_time }} ~ {{ row.end_time }}</Tag>
    </template>

    <template #default_executors="{ row }">
      <span class="text-sm">
        {{ row.executors?.map((e) => e.user?.name || e.name).join('、') || '-' }}
      </span>
    </template>

    <template #default_state="{ row }">
      <Tag :color="!row.status ? 'red' : stateColorMap[row.state] || 'default'">
        {{ !row.status ? '已取消' : row.state_label || '未知' }}
      </Tag>
    </template>
  </AppCrudTable>
</template>
