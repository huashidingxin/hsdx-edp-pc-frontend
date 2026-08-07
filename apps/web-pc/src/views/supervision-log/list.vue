<script setup>
import { computed, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { useUserStore } from '@vben/stores';

import {
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Input,
  message,
  Modal,
  Radio,
  Select,
  Tag,
  Tooltip,
} from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppOffice from '#/components/AppOffice.vue';
import SubmissionEdit from '#/components/SubmissionEdit.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();
const userStore = useUserStore();
const { hasAccessByCodes } = useAccess();

const editingItem = ref({});
const submissionRef = ref(null);
// 详情打开是否编辑模式（view=false / edit=true）
const isEditing = ref(false);
function onShowDetail(editing) {
  isEditing.value = editing;
}

// ---- 详情：解析 values/form_id 供 SubmissionEdit ----
const defaultValues = ref([]);
// P3-L03 日志关键字警告（命中关键字且当天无对应工序任务时标记）
const warnings = ref([]);

function detailFormat(data) {
  // 注意：不能只在 editingItem 上挂 _values，loadDetail 会用返回值整体替换 modelValue，
  // 挂在原对象上的字段会随替换丢失，导致 props.values 变回 []、回显被清空。
  // 因此把 _values/_formId/_projectId 并入返回值，随 detailFormat 返回的对象一起保留。
  const submission = data.submission || {};
  const values = submission.values || [];
  defaultValues.value = JSON.parse(JSON.stringify(values));
  warnings.value = data.warnings || [];
  return {
    ...data,
    _values: JSON.parse(JSON.stringify(values)),
    _formId:
      data.form_id ||
      submission.form_id ||
      data.project?.supervision_log_form_id,
    _projectId: data.project_id,
  };
}

// ---- 提交：PUT supervision-logs/{id} { form_id, values } ----
async function save() {
  const formData = await submissionRef.value?.getFormData();
  if (!formData) return;
  if (!formData.validated) {
    message.error('请检查表单');
    return;
  }
  // 当前版本仍待审核且内容未修改：不做真实提交，避免重复生成待审核版本
  // （已退回/已通过版本允许再次提交进入审核队列，不受此拦截）
  if (formData.changed === false && Number(editingItem.value.submission?.state) === 1) {
    message.info('内容未修改，无需重复提交');
    return;
  }
  // P3-L03 提交前关键字预检测：命中工序关键字且当天无该工序任务时提醒，但不阻断提交
  try {
    const res = await new Resource(
      `supervision-logs/${editingItem.value.id}/keyword-precheck`,
    ).store({ content: buildContentText(formData.values) });
    const hits = res?.data || [];
    const missing = hits.filter((h) => !h.has_task);
    if (missing.length && !(await confirmMissingTaskWarnings(missing))) {
      return;
    }
  } catch (error) {
    console.error('关键字预检测失败:', error);
  }
  try {
    const prevSubmissionId = editingItem.value.submission?.id;
    const res = await new Resource('supervision-logs').update(
      editingItem.value.id,
      {
        form_id: effectiveFormId.value,
        values: formData.values,
      },
    );
    // 后端按归一化内容判定未变化时不会新增版本（返回的仍是当前版本 id 相同），
    // 此时提示未生成新版本，避免用户误以为产生了新提交
    const createdNewVersion =
      !prevSubmissionId || res?.data?.submission?.id !== prevSubmissionId;
    if (createdNewVersion) {
      message.success('提交成功');
    } else {
      message.info('内容未修改，未生成新版本');
    }
    warnings.value = res?.data?.warnings || [];
    // 提交成功后刷新基线，后续未修改重复提交可继续被识别为无变化
    const savedValues = res?.data?.submission?.values;
    if (Array.isArray(savedValues)) {
      defaultValues.value = JSON.parse(JSON.stringify(savedValues));
      editingItem.value._values = JSON.parse(JSON.stringify(savedValues));
    }
    tableRef.value?.reload?.();
  } catch (error) {
    console.error(error);
    const msg = error?.response?.data?.message;
    if (msg) {
      message.error(msg);
    }
  }
}

// ---- P3-L03 内容文本提取（与后端 buildContentText 同口径）----
function buildContentText(values) {
  const parts = [];
  const walk = (v) => {
    if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (typeof v === 'string' || typeof v === 'number') {
      if (String(v).trim() !== '') parts.push(String(v));
    }
  };
  for (const key in values || {}) walk(values[key]);
  return parts.join('\n');
}

function confirmMissingTaskWarnings(missing) {
  return new Promise((resolve) => {
    Modal.confirm({
      title: '工序任务核对提醒',
      content: `以下工序命中关键字，但当天未查询到该工序任务记录：\n\n${missing
        .map((m, i) => `${i + 1}. ${m.procedure_name}（关键字"${m.keyword}"）`)
        .join('\n')}\n\n可以继续提交。提交后补充该工序当天任务可自动解除，或由管理员/有权限成员手动解除。`,
      okText: '继续提交',
      cancelText: '取消',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

function reset() {
  editingItem.value._values = JSON.parse(JSON.stringify(defaultValues.value));
}

const tableRef = ref(null);

// ---- 已提交记录预览（AppOffice 打开渲染 docx）----
const previewOpen = ref(false);
const previewDocument = ref(null);

async function openPreview(row = editingItem.value) {
  let submission = row?.submission;
  if (!submission?.file_path) {
    try {
      const { data } = await new Resource('supervision-logs').get(
        String(row.id),
      );
      submission = data?.submission || {};
    } catch (error) {
      console.error(error);
    }
  }
  const filePath = submission?.file_path;
  if (!filePath) {
    message.warning('该记录未配置打印模板或渲染失败');
    return;
  }
  previewDocument.value = {
    fileType: 'docx',
    key: `submission-${submission?.id || row.id}`,
    url: filePath,
    title: `${submission?.code || '记录'}.docx`,
  };
  previewOpen.value = true;
}

// ---- 批量导出 / 批量打印（submission/batch）----
const selectedRows = ref([]);
const withSignature = ref(false);

function batchIds() {
  return selectedRows.value
    .filter((r) => r.submission_id > 0)
    .map((r) => r.submission_id);
}

async function batchExport() {
  const ids = batchIds();
  if (!ids.length) {
    message.error('请至少选择一条已提交的记录');
    return;
  }
  try {
    const { data } = await new Resource('submission').get('batch', {
      merge: 1,
      signature: withSignature.value ? 1 : 0,
      list: ids.join(','),
    });
    const link = window.document.createElement('a');
    link.href = data.url;
    link.setAttribute('download', data.name);
    window.document.body.append(link);
    link.click();
    link.remove();
    message.success('导出成功');
  } catch (error) {
    console.error(error);
    message.error(error?.response?.data?.message || '导出失败');
  }
}

async function batchPrint() {
  const ids = batchIds();
  if (!ids.length) {
    message.error('请至少选择一条已提交的记录');
    return;
  }
  try {
    const { data } = await new Resource('submission').get('batch', {
      merge: 0,
      signature: withSignature.value ? 1 : 0,
      list: ids.join(','),
    });
    previewDocument.value = {
      fileType: 'docx',
      key: `batch-${Date.now()}`,
      url: data.url,
      title: data.name,
    };
    previewOpen.value = true;
  } catch (error) {
    console.error(error);
    message.error(error?.response?.data?.message || '批量打印失败');
  }
}

// ---- P3-L03 关键字警告手动解除（总监/有权限成员，必须填原因，保留记录）----
const canResolveWarning = computed(
  () =>
    !!userStore.userInfo?.is_admin ||
    hasAccessByCodes(['log_warning.resolve', 'submission.audit']),
);

const resolveDialog = ref(false);
const resolveTarget = ref(null);
const resolveReason = ref('');
const resolveSubmitting = ref(false);

function openResolve(w) {
  resolveTarget.value = w;
  resolveReason.value = '';
  resolveDialog.value = true;
}

async function submitResolve() {
  if (!resolveReason.value.trim()) {
    message.error('请输入解除原因');
    return;
  }
  if (resolveSubmitting.value) return;
  resolveSubmitting.value = true;
  try {
    await new Resource(
      `log-warnings/${resolveTarget.value.id}/resolve`,
    ).store({ remark: resolveReason.value.trim() });
    message.success('已解除');
    warnings.value = warnings.value.filter(
      (x) => x.id !== resolveTarget.value.id,
    );
    resolveDialog.value = false;
  } catch (error) {
    console.error(error);
    message.error(error?.response?.data?.message || '解除失败');
  } finally {
    resolveSubmitting.value = false;
  }
}

// ---- 记录审核（submissions/{id}/audit）----
const auditDialog = ref(false);
const auditRow = ref(null);
const auditData = ref({ status: 1, reason: '' });
const auditSubmitting = ref(false);

function canAudit(row) {
  return (
    Number(row.submission_id) > 0 &&
    Number(row.submission?.audit_id) === 0 &&
    hasAccessByCodes(['submission.audit'])
  );
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
    await new Resource(
      `submissions/${auditRow.value?.submission_id}/audit`,
    ).store({
      status: auditData.value.status,
      reason: auditData.value.reason,
    });
    message.success('审核成功');
    auditDialog.value = false;
    tableRef.value?.reload?.();
  } catch (error) {
    console.error(error);
  } finally {
    auditSubmitting.value = false;
  }
}

// 全局选择的项目 ID（"所有项目"时为空）
const currentProjectId = computed(
  () => appStore.defaultProject?.id || undefined,
);

// 查询参数：computed 保持引用稳定，避免页面重渲染（如打开详情抽屉）时每次生成新对象、
// 触发 AppCrudTable 对 extraQuery 的 deep watch 导致列表被无故刷新
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

// 查询范围：2=项目范围（最大权限，默认） 1=仅本人
const listScope = ref(2);
const scopeOptions = [
  { label: '全部', value: 2 },
  { label: '只看自己的', value: 1 },
];

// 记录人选项（项目成员）
const userOptions = ref([]);
async function loadUsers() {
  try {
    const api = new Resource('project-users');
    const { data } = await api.list({
      per_page: 'all',
      project_id: currentProjectId.value,
    });
    userOptions.value = (data || []).map((e) => ({
      value: e.user_id,
      label: e.user?.name || `#${e.user_id}`,
    }));
  } catch (error) {
    console.error('加载项目成员失败:', error);
  }
}
watch(currentProjectId, loadUsers);
loadUsers();

// 列表列（参考 web-admin：编号/日期/记录人/状态/记录时间/项目/超时）
const gridColumns = computed(() => {
  const columns = [
    {
      type: 'checkbox',
      width: 44,
      fixed: 'left',
    },
    {
      field: 'submission.code',
      title: '编号',
      width: 140,
      slots: { default: 'default_code' },
    },
    { field: 'date', title: '日期', width: 120, sortable: true },
    {
      field: 'user.name',
      title: '记录人',
      width: 100,
      slots: { default: 'default_user' },
    },
    {
      field: 'submission.state',
      title: '记录状态',
      width: 110,
      slots: { default: 'default_state' },
    },
    {
      field: 'submission.created_at',
      title: '记录时间',
      minWidth: 180,
      slots: { default: 'default_submitted' },
    },
    {
      field: 'submission_timeout',
      title: '超时',
      width: 80,
      slots: { default: 'default_timeout' },
    },
    {
      field: 'has_warning',
      title: '警告',
      width: 100,
      slots: { default: 'default_warning' },
    },
  ];
  if (!currentProjectId.value) {
    columns.splice(3, 0, {
      field: 'project.name',
      title: '项目',
      minWidth: 160,
      slots: { default: 'default_project' },
    });
  }
  return columns;
});

// 筛选字段（参考 web-admin：编号/记录人/日期范围/提交状态/审核状态/超时状态）
const filterFields = computed(() => [
  { field: 'submission_code', label: '编号', type: 'text', span: 6 },
  { field: 'user_id', label: '记录人', type: 'slot', span: 6 },
  { field: 'date_range', label: '日期', type: 'slot', span: 6 },
  {
    field: 'submission_status',
    label: '提交状态',
    type: 'select',
    span: 6,
    // 未选择项目（全部项目）时默认只看"已提交"，避免大量待提交记录
    default: currentProjectId.value ? undefined : 1,
    attrs: {
      options: [
        { id: 0, name: '待提交' },
        { id: 1, name: '已提交' },
      ],
    },
  },
  {
    field: 'submission_states',
    label: '审核状态',
    type: 'select',
    span: 6,
    attrs: {
      multiple: true,
      options: [
        { id: 1, name: '待审核' },
        { id: 2, name: '审核通过' },
        { id: 3, name: '审核不通过' },
      ],
    },
  },
  {
    field: 'submission_timeouts',
    label: '超时状态',
    type: 'select',
    span: 6,
    attrs: {
      multiple: true,
      options: [
        { id: 0, name: '正常' },
        { id: 1, name: '超时' },
      ],
    },
  },
  {
    field: 'has_warning',
    label: '警告状态',
    type: 'select',
    span: 6,
    attrs: {
      options: [
        { id: 1, name: '有警告' },
        { id: 0, name: '无警告' },
      ],
    },
  },
]);

const formFields = ref([
  { field: 'content', type: 'slot', label: '记录内容', span: 24 },
  { field: 'warnings', type: 'slot', label: '关键字任务核对', span: 24 },
  { field: 'timeline', type: 'slot', label: '提交/审核历史时间线', span: 24 },
]);

// 表单 ID（行数据即时可用，不依赖详情异步加载）
const effectiveFormId = computed(() => {
  const item = editingItem.value;
  return (
    item._formId ||
    item.submission?.form_id ||
    item.form_id ||
    item.project?.supervision_log_form_id
  );
});

const stateMap = {
  0: { text: '待提交', color: 'default' },
  1: { text: '待审核', color: 'orange' },
  2: { text: '审核通过', color: 'green' },
  3: { text: '已退回', color: 'red' },
  4: { text: '已作废', color: 'default' },
};

function stateLabel(state) {
  return stateMap[state ?? 0]?.text ?? `状态${state}`;
}

// 列表行状态：已提交取 submission.state（1待审/2通过/3退回），未提交为 0
function rowState(row) {
  const submission = row.submission;
  if (submission?.state != null) return Number(submission.state);
  return 0;
}

// P3-L03 警告列 tooltip：解析后端返回的 warning_procedures JSON 字符串
function warningTooltip(procsJson) {
  try {
    const list = JSON.parse(procsJson || '[]');
    return list
      .map((p) => `${p.procedure_name}（关键字"${p.keyword}"）`)
      .join('；');
  } catch {
    return '';
  }
}
</script>

<template>
  <AppCrudTable
    ref="tableRef"
    v-model="editingItem"
    v-model:selected="selectedRows"
    api-url="supervision-logs"
    :filter-fields="filterFields"
    :fields="formFields"
    :extra-query="extraQuery"
    :list-scope="listScope"
    :toolbar="{ create: false, refresh: true }"
    :inline-actions="['view', 'edit']"
    :actions-config="[
      { key: 'view', visible: () => true },
      {
        key: 'edit',
        permission: '',
        visible: (row) =>
          String(row.user_id) === String(userStore.userInfo?.id) &&
          (Number(row.submission_id) === 0 ||
            (Number(row.submission_id) > 0 &&
              Number(row.submission?.state) !== 2)),
      },
      {
        key: 'preview',
        label: '预览',
        icon: 'mdi--file-eye-outline',
        permission: '',
        visible: (row) => row.submission_id > 0,
        onClick: (row) => openPreview(row),
        order: 25,
      },
    ]"
    :detail-format="detailFormat"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
      checkboxConfig: { highlight: true, showHeader: true },
    }"
    :open-mode="{ create: false, detail: 'drawer' }"
    :detail-props="{ width: 960 }"
    title="监理日志"
    class="p-4"
    @show-detail="onShowDetail"
  >
    <template #filter-prepend>
      <div class="mb-3 flex items-center gap-2">
        <span class="text-sm text-gray-500">查询范围</span>
        <Radio.Group
          v-model:value="listScope"
          :options="scopeOptions"
          option-type="button"
          size="small"
        />
      </div>
    </template>

    <!-- 批量导出/打印 -->
    <template #toolbar-append>
      <Checkbox v-model:checked="withSignature">打印/导出包含签名</Checkbox>
      <Button :disabled="!selectedRows.length" @click="batchPrint">
        批量打印
      </Button>
      <Button :disabled="!selectedRows.length" @click="batchExport">
        批量导出
      </Button>
    </template>

    <!-- 记录人（项目成员选择） -->
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

    <!-- 日期范围 -->
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
      <Tag
        v-if="row.submission_id > 0"
        color="blue"
        class="cursor-pointer"
        @click="openPreview(row)"
      >
        {{ row.submission?.code || '-' }}
      </Tag>
      <span v-else>-</span>
    </template>
    <template #default_state="{ row }">
      <Tag :color="stateMap[rowState(row)]?.color || 'default'">
        {{ stateLabel(rowState(row)) }}
      </Tag>
    </template>
    <template #default_user="{ row }">
      {{ row.user?.name || '-' }}
    </template>
    <template #default_project="{ row }">
      {{ row.project?.name || '-' }}
    </template>
    <template #default_submitted="{ row }">
      {{ row.submission?.created_at || '-' }}
    </template>
    <template #default_timeout="{ row }">
      <Tag :color="row.submission_timeout ? 'error' : 'processing'">
        {{ row.submission_timeout ? '超时' : '正常' }}
      </Tag>
    </template>
    <template #default_warning="{ row }">
      <template v-if="Number(row.has_warning) === 1">
        <Tooltip :title="warningTooltip(row.warning_procedures)">
          <Tag color="orange" class="cursor-pointer">
            {{
              Number(row.active_warning_count) > 1
                ? `有警告(${row.active_warning_count})`
                : '有警告'
            }}
          </Tag>
        </Tooltip>
      </template>
      <span v-else>-</span>
    </template>

    <template #form-description>
      <div
        v-if="editingItem.id"
        class="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 px-3 py-2"
      >
        <span class="text-sm font-medium">{{ editingItem.date || '-' }}</span>
        <span class="text-sm text-gray-500">
          记录人：{{ editingItem.user?.name || '-' }}
        </span>
        <Tag :color="stateMap[rowState(editingItem)]?.color || 'default'">
          {{ stateLabel(rowState(editingItem)) }}
        </Tag>
        <span
          v-if="editingItem.submission?.code"
          class="text-xs text-gray-400"
        >
          {{ editingItem.submission.code }}
        </span>
      </div>
    </template>

    <template #field_content>
      <div v-if="editingItem.id" class="min-h-[200px]">
        <SubmissionEdit
          v-if="effectiveFormId"
          ref="submissionRef"
          :form-id="effectiveFormId"
          :project-id="editingItem._projectId || editingItem.project_id"
          :values="editingItem._values || []"
          :rules="editingItem.submission?.rules || {}"
          :readonly="!isEditing"
        />
        <div v-else class="py-6 text-center text-gray-400">
          该项目未配置监理日志表单
        </div>
      </div>
    </template>

    <template #form-actions>
      <Button
        v-if="Number(editingItem.submission_id) > 0"
        @click="openPreview(editingItem)"
      >
        预览
      </Button>
      <template v-if="isEditing">
        <Button @click="reset">重置</Button>
        <Button type="primary" @click="save">提交</Button>
      </template>
    </template>

    <template #field_warnings>
      <div v-if="editingItem.id" class="space-y-2">
        <div v-if="warnings.length" class="space-y-2">
          <div
            v-for="w in warnings"
            :key="w.id"
            class="flex items-start gap-2 rounded border border-orange-200 bg-orange-50 p-2"
          >
            <Tag color="orange" class="mt-0.5 shrink-0">待补充任务</Tag>
            <div class="min-w-0 flex-1 text-sm">
              <div>
                日志描述了
                <span class="font-medium">{{ w.procedure_name }}</span>
                工序工作（命中关键字"{{ w.keyword }}"），但当天未查询到该工序任务记录。
              </div>
              <div class="text-xs text-gray-500">
                请补充该工序当天任务后自动解除，或由总监/有权限成员解除。
              </div>
            </div>
            <Button
              v-if="canResolveWarning"
              size="small"
              type="link"
              :disabled="false"
              @click="openResolve(w)"
            >
              解除警告
            </Button>
          </div>
        </div>
        <div v-else class="text-xs text-gray-400">
          无关键字任务核对警告。日志内容命中工序关键字且当天无对应工序任务时，此处会提示补充任务（不影响提交）。
        </div>
      </div>
    </template>

    <!-- P3-L02 提交/审核历史时间线 -->
    <template #field_timeline="{ modelValue }">
      <div v-if="modelValue?.length" class="text-sm">
        <div
          v-for="item in modelValue"
          :key="item.version_no"
          class="mb-3 flex gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
        >
          <div class="w-14 shrink-0 text-center">
            <span
              class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white"
            >
              v{{ item.version_no }}
            </span>
            <Tag v-if="item.is_current" color="blue" class="mt-1 !text-xs">
              当前
            </Tag>
          </div>
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex items-center gap-2">
              <Tag :color="stateMap[item.state]?.color || 'default'">
                {{ stateLabel(item.state) }}
              </Tag>
              <span class="text-xs text-gray-400">提交于 {{ item.submitted_at || '-' }}</span>
            </div>
            <div v-if="item.audit" class="text-xs text-gray-500">
              审核于 {{ item.audit.audit_time || '-' }} ·
              {{ item.audit.auditor_name || '未知审核人' }}
              <span
                :class="item.audit.status ? 'text-green-600' : 'text-red-500'"
              >
                {{ item.audit.status ? '通过' : '退回' }}
              </span>
              <span v-if="item.audit.reason" class="text-gray-400">（{{ item.audit.reason }}）</span>
            </div>
            <div v-else class="text-xs text-gray-400">
              {{
                item.state === 1
                  ? '待审核'
                  : item.state === 4
                    ? '已被新版本取代'
                    : '尚未审核'
              }}
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-gray-400">暂无提交历史</div>
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

  <!-- P3-L03 关键字警告手动解除（必须填原因） -->
  <Modal
    v-model:open="resolveDialog"
    title="解除关键字任务核对警告"
    ok-text="确认解除"
    cancel-text="取消"
    :confirm-loading="resolveSubmitting"
    @ok="submitResolve"
  >
    <div class="space-y-3">
      <p v-if="resolveTarget" class="text-sm">
        确认解除
        <span class="font-medium">{{ resolveTarget.procedure_name }}</span>
        （关键字"{{ resolveTarget.keyword }}"）的警告？解除记录将保留。
      </p>
      <label class="mb-1 block text-sm text-gray-500">
        解除原因<span class="text-red-500">*</span>
      </label>
      <Input.TextArea
        v-model:value="resolveReason"
        :rows="3"
        placeholder="请输入解除原因"
      />
    </div>
  </Modal>

  <!-- 已提交记录预览（AppOffice 只读） -->
  <Drawer
    v-model:open="previewOpen"
    title="记录预览"
    width="880px"
    destroy-on-close
  >
    <div v-if="previewDocument" class="h-[calc(100vh-120px)]">
      <AppOffice :document="previewDocument" mode="view" />
    </div>
  </Drawer>
</template>
