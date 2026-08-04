<script setup>
/**
 * 任务记录（task-submissions 视角）
 *
 * 列表：任务 + 提交状态/超时/审核状态筛选，与 web-admin task/submission.vue 对齐（仅保留后端真正支持的筛选）
 * 详情：内嵌 SubmissionEdit 动态表单，提交 POST /task-submissions { task_id, form_id, values, rules, nonconformances }
 * 校验警告（rule level=2）触发不符合项弹窗，需上传整改证据后再次提交
 * 预览（OnlyOffice 渲染 docx）/批量打印/纸质版：依赖在线 Office 方案（P3-T06），登记阻塞
 */
import { computed, ref, watch } from 'vue';

import { Button, DatePicker, Input, message, Modal, Radio, Select, Tag } from 'antdv-next';

import { useUserStore } from '@vben/stores';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppUpload from '#/components/AppUpload.vue';
import SubmissionEdit from '#/components/SubmissionEdit.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();
const userStore = useUserStore();
const currentProjectId = computed(() => appStore.defaultProject?.id || undefined);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

// 查询范围：2=全部（默认，审核者看全部） 1=仅本人（后端 scope=1 按 executor_id 过滤）
const listScope = ref(2);
const scopeOptions = [
  { label: '全部', value: 2 },
  { label: '只看自己的', value: 1 },
];

const editingItem = ref({});
const submissionRef = ref(null);
// 详情打开时是否编辑模式（view=false / edit=true），决定 SubmissionEdit 只读
const isEditing = ref(true);

function onShowDetail(editing) {
  isEditing.value = editing;
}

// ---- 筛选（对齐后端 TaskSubmissionController::index filters）----
const executorOptions = ref([]);
async function loadExecutorOptions() {
  const { data } = await new Resource('project-users').list({
    per_page: 'all',
    project_id: currentProjectId.value,
  });
  executorOptions.value = (data || []).map((e) => ({
    value: e.user_id,
    label: e.user?.name || `#${e.user_id}`,
  }));
}

const procedureOptions = ref([]);
async function loadProcedures() {
  const { data } = await new Resource('procedures').list({
    per_page: 'all',
    project_id: currentProjectId.value,
  });
  procedureOptions.value = (data || []).map((p) => ({ value: p.id, label: p.name }));
}

const measureOptions = ref([]);
async function loadMeasures() {
  const { data } = await new Resource('measures').list({ per_page: 'all' });
  measureOptions.value = (data || []).map((m) => ({ value: m.id, label: m.name }));
}

const submissionStateOptions = [
  { value: 1, label: '待审核' },
  { value: 2, label: '审核通过' },
  { value: 3, label: '审核不通过' },
];

const filterFields = ref([
  { field: 'executor_id', label: '执行人', type: 'slot', span: 8 },
  { field: 'procedure_id', label: '工序', type: 'slot', span: 8 },
  { field: 'measure_id', label: '监理方式', type: 'slot', span: 8 },
  { field: 'date_range', label: '日期', type: 'slot', span: 8 },
  { field: 'submission_status', label: '提交状态', type: 'select', span: 8, default: 1, attrs: { options: [
    { value: 0, label: '待提交' },
    { value: 1, label: '已提交' },
  ] } },
  { field: 'submission_timeouts', label: '超时状态', type: 'select', span: 8, attrs: { multiple: true, options: [
    { value: 0, label: '正常' },
    { value: 1, label: '超时' },
  ] } },
  { field: 'submission_states', label: '审核状态', type: 'select', span: 8, attrs: { multiple: true, options: submissionStateOptions } },
]);

const gridColumns = ref([
  { field: 'submission.code', title: '编号', width: 140, slots: { default: 'default_code' } },
  { field: 'measure.name', title: '监理方式', minWidth: 100 },
  { field: 'procedure.name', title: '工序', minWidth: 100 },
  { field: 'form.name', title: '名称', minWidth: 120 },
  { field: 'executor', title: '执行人', minWidth: 100, slots: { default: 'default_executor' } },
  { field: 'state', title: '任务状态', width: 100, slots: { default: 'default_state' } },
  { field: 'submission.state', title: '记录状态', width: 100, slots: { default: 'default_submission_state' } },
  { field: 'submission_timeout', title: '超时', width: 80, slots: { default: 'default_timeout' } },
  { field: 'date', title: '日期', width: 110 },
  { field: 'start_time', title: '开始时间', width: 100 },
  { field: 'end_time', title: '结束时间', width: 100 },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

const stateColorMap = { 1: 'blue', 2: 'blue', 3: 'green', 4: 'orange' };
const submissionStateColorMap = { 1: 'orange', 2: 'green', 3: 'red' };

// 行操作：编辑 = 本人执行 + 已签到(任务 state>1) + 未审核通过（含未提交的首次填写）
const actionsConfig = [
  {
    key: 'edit',
    visible: (row) =>
      row.executor?.id === userStore.userInfo?.id &&
      row.state > 1 &&
      (row.submission_id === 0 || (row.submission_id > 0 && row.submission?.state !== 2)),
  },
  { key: 'view', visible: (row) => row.submission_id > 0 },
];

// ---- 提交链路 ----
const defaultValues = ref({});

function detailFormat(data) {
  // 备份原始值（重置用）
  defaultValues.value = JSON.parse(JSON.stringify(data.submission?.values || []));
  return data;
}

async function save() {
  const formData = await submissionRef.value?.getFormData();
  if (!formData) return;
  if (!formData.validated) {
    message.error('请检查表单');
    return;
  }

  const hasWarnings = Object.keys(formData.warnings || {}).length > 0;
  if (hasWarnings) {
    if (!nonconformanceDialog.value || !nonconformanceReady.value) {
      setNonconformanceFields(formData.warnings);
      nonconformanceDialog.value = true;
      return;
    }
  }

  nonconformanceDialog.value = false;
  try {
    await new Resource('task-submissions').store({
      task_id: editingItem.value.id,
      form_id: editingItem.value.form_id,
      ...formData,
      nonconformances: nonconformanceEditing.value,
    });
    message.success('保存成功');
    tableRef.value?.reload?.();
  } catch (e) {
    console.error(e);
  }
}

function reset() {
  if (editingItem.value.submission) {
    editingItem.value.submission.values = JSON.parse(JSON.stringify(defaultValues.value));
  }
}

// ---- 记录审核（submissions/{id}/audit）----
const auditDialog = ref(false);
const auditRow = ref(null);
const auditData = ref({ status: 1, reason: '' });
const auditSubmitting = ref(false);

function canAudit(row) {
  return row.submission_id > 0 && !row.submission?.audit_id;
}

function openAudit(row) {
  auditRow.value = row;
  auditData.value = { status: 1, reason: '' };
  auditDialog.value = true;
}

async function submitAudit() {
  if (auditSubmitting.value) return;
  if (auditData.value.status === 0 && !auditData.value.reason) {
    message.error('退回时请输入原因');
    return;
  }
  auditSubmitting.value = true;
  try {
    await new Resource(`submissions/${auditRow.value.submission_id}/audit`).store({
      status: auditData.value.status,
      reason: auditData.value.reason,
    });
    message.success('审核成功');
    auditDialog.value = false;
    tableRef.value?.reload?.();
  } catch (e) {
    console.error(e);
  } finally {
    auditSubmitting.value = false;
  }
}

// ---- 不符合项弹窗（校验警告触发）----
const nonconformanceDialog = ref(false);
const nonconformanceEditing = ref({});
const nonconformanceFields = ref([]);
const nonconformanceReady = ref(false);

function setNonconformanceFields(warnings) {
  nonconformanceEditing.value = {};
  nonconformanceFields.value = [];
  for (const fieldKey in warnings) {
    const field = submissionRef.value?.formFields?.find((f) => `_${f.id}` === fieldKey);
    if (!field) continue;
    const warns = warnings[fieldKey] || [];
    let tips = '';
    if (field.type === 'switch') {
      const options = field.options || ['是', '否'];
      tips = `检查结果：${options[warns[0]?.value == 1 ? 0 : 1] || '否'}（要求：${warns[0]?.message || ''}）`;
    } else {
      tips = warns
        .map((w) => `检查结果：${w.value || '未填写'}，${w.message}`)
        .join('；');
    }
    nonconformanceFields.value.push({
      field: `_${field.id}`,
      label: field.name,
      type: 'image',
      attrs: { fileType: 'image', multiple: true, hint: tips },
      required: field.failed_proof,
    });
  }
  nonconformanceReady.value = true;
}

const tableRef = ref(null);

function refreshAll() {
  return Promise.all([loadExecutorOptions(), loadProcedures(), loadMeasures()]);
}

watch(() => appStore.defaultProject?.id, refreshAll);
</script>

<template>
  <div>
    <AppCrudTable
      ref="tableRef"
      v-model="editingItem"
      api-url="task-submissions"
      permission-name="task_submission"
      :list-scope="listScope"
      :extra-query="extraQuery"
      :filter-fields="filterFields"
      :actions-config="actionsConfig"
      :detail-format="detailFormat"
      :fields="[]"
      :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
      :open-mode="{ create: 'drawer', detail: 'drawer' }"
      :toolbar="{ filter: true, create: false, refresh: true }"
      title="任务记录"
      class="p-4"
      @show-detail="onShowDetail"
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

      <template #filter_procedure_id="{ modelValue, update }">
        <Select
          :value="modelValue"
          :options="procedureOptions"
          placeholder="工序"
          allow-clear
          show-search
          option-filter-prop="label"
          style="width: 100%"
          @change="update"
        />
      </template>

      <template #filter_measure_id="{ modelValue, update }">
        <Select
          :value="modelValue"
          :options="measureOptions"
          placeholder="监理方式"
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

      <template #form-default>
        <div v-if="editingItem.id" class="min-h-[300px]">
          <SubmissionEdit
            v-if="editingItem.form_id"
            ref="submissionRef"
            :form-id="editingItem.form_id || editingItem.submission?.form_id"
            :project-id="editingItem.project_id"
            :values="editingItem.submission?.values || []"
            :rules="editingItem.submission?.rules || {}"
            :readonly="!isEditing"
          />
          <div v-else class="py-10 text-center text-gray-400">该任务未配置表单</div>
        </div>
      </template>

      <template #form-action>
        <template v-if="isEditing">
          <Button @click="reset">重置</Button>
          <Button type="primary" @click="save">提交</Button>
        </template>
      </template>

      <template #default_code="{ row }">
        <Tag v-if="row.submission_id" color="blue">{{ row.submission?.code || '-' }}</Tag>
        <span v-else>-</span>
      </template>

      <template #default_executor="{ row }">
        <span class="text-sm">{{ row.executor?.name || '-' }}</span>
      </template>

      <template #default_state="{ row }">
        <Tag :color="!row.status ? 'red' : stateColorMap[row.state] || 'default'">
          {{ !row.status ? '已取消' : row.state_label || '未知' }}
        </Tag>
      </template>

      <template #default_submission_state="{ row }">
        <Tag v-if="row.submission_id" :color="submissionStateColorMap[row.submission?.state] || 'default'">
          {{ row.submission?.state_label || '-' }}
        </Tag>
        <span v-else>-</span>
      </template>

      <template #default_timeout="{ row }">
        <Tag :color="row.submission_timeout ? 'red' : 'green'">
          {{ row.submission_timeout ? '超时' : '正常' }}
        </Tag>
      </template>

      <template #row-action-extra="{ row }">
        <Button
          v-if="canAudit(row)"
          type="link"
          size="small"
          @click="openAudit(row)"
        >
          审核
        </Button>
      </template>
    </AppCrudTable>

    <!-- 记录审核弹窗 -->
    <Modal
      v-model:open="auditDialog"
      title="记录审核"
      ok-text="提交"
      cancel-text="取消"
      :confirm-loading="auditSubmitting"
      @ok="submitAudit"
    >
      <div class="space-y-4">
        <Radio.Group
          v-model:value="auditData.status"
          :options="[
            { label: '通过', value: 1 },
            { label: '退回', value: 0 },
          ]"
          option-type="button"
        />
        <div v-if="auditData.status === 0">
          <label class="mb-1 block text-sm text-gray-500">退回原因</label>
          <Input.TextArea
            v-model:value="auditData.reason"
            :rows="3"
            placeholder="请输入退回原因"
          />
        </div>
      </div>
    </Modal>

    <!-- 不符合项弹窗 -->
    <Modal
      v-model:open="nonconformanceDialog"
      title="不符合项"
      ok-text="提交"
      cancel-text="关闭"
      width="680px"
      @ok="save"
    >
      <div class="space-y-4">
        <div
          v-for="f in nonconformanceFields"
          :key="f.field"
          class="rounded border border-orange-200 bg-orange-50 p-3"
        >
          <div class="mb-2 text-sm text-orange-700">{{ f.attrs?.hint }}</div>
          <div class="text-sm font-medium">{{ f.label }}</div>
          <div class="mt-2">
            <AppUpload
              :model-value="nonconformanceEditing[f.field]"
              file-type="image"
              :limit="1"
              @update:model-value="(v) => (nonconformanceEditing[f.field] = v)"
            />
          </div>
        </div>
        <div v-if="!nonconformanceFields.length" class="py-6 text-center text-gray-400">
          无不符合项字段
        </div>
      </div>
    </Modal>
  </div>
</template>
