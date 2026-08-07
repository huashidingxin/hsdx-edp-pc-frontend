<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';

import {
  Alert,
  Button,
  DatePicker,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Tag,
} from 'antdv-next';

import { useAccess } from '@vben/access';

import { requestClient } from '#/api/request';
import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();
const { hasAccessByCodes } = useAccess();

// 全局选择的项目 ID（"所有项目"时为空），列表请求自动携带
const currentProjectId = computed(
  () => appStore.defaultProject?.id || undefined,
);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

const stateOptions = [
  { label: '草稿', value: 0 },
  { label: '待审核', value: 1 },
  { label: '已签发', value: 2 },
  { label: '已退回', value: 3 },
];
const rectifyOptions = [
  { label: '待整改', value: 0 },
  { label: '整改中', value: 1 },
  { label: '已整改', value: 2 },
  { label: '已闭环', value: 3 },
];
const categoryOptions = [
  { label: '质量', value: 1 },
  { label: '安全', value: 2 },
  { label: '进度', value: 3 },
  { label: '文明施工', value: 4 },
];
const severityOptions = [
  { label: '一般', value: 1 },
  { label: '较严重', value: 2 },
  { label: '严重', value: 3 },
];
const sourceOptions = [
  { label: '任务记录', value: 1 },
  { label: '监理日志', value: 2 },
  { label: '巡视', value: 3 },
  { label: '旁站', value: 4 },
  { label: '平行检验', value: 5 },
  { label: '移动APP', value: 6 },
  { label: '手工录入', value: 7 },
];
const reviewResultOptions = [
  { label: '合格', value: 1 },
  { label: '不合格', value: 2 },
];

const categoryLabel = { 1: '质量', 2: '安全', 3: '进度', 4: '文明施工' };
const severityLabel = { 1: '一般', 2: '较严重', 3: '严重' };
const sourceLabel = {
  1: '任务记录',
  2: '监理日志',
  3: '巡视',
  4: '旁站',
  5: '平行检验',
  6: '移动APP',
  7: '手工录入',
};
const reviewResultLabel = { 1: '合格', 2: '不合格' };

// 相关方（项目范围远程加载）
const stakeholderOptions = ref([]);
async function loadStakeholders() {
  const { data } = await new Resource('stakeholders').list({
    per_page: 'all',
    project_id: currentProjectId.value,
  });
  stakeholderOptions.value = (data || []).map((s) => ({
    value: s.id,
    label: s.name,
  }));
}

// 桩号（项目范围远程加载）
const milepostOptions = ref([]);
async function loadMileposts() {
  const { data } = await new Resource('mileposts').list({
    per_page: 'all',
    project_id: currentProjectId.value,
  });
  milepostOptions.value = (data || []).map((m) => ({
    value: m.id,
    label: m.name,
  }));
}

const filterFields = ref([
  { field: 'code', label: '编号', type: 'text', span: 8 },
  {
    field: 'category',
    label: '类型',
    type: 'select',
    span: 8,
    attrs: { options: categoryOptions },
  },
  {
    field: 'severity',
    label: '严重等级',
    type: 'select',
    span: 8,
    attrs: { options: severityOptions },
  },
  {
    field: 'source',
    label: '发现来源',
    type: 'select',
    span: 8,
    attrs: { options: sourceOptions },
  },
  { field: 'stakeholder_id', label: '责任单位', type: 'slot', span: 8 },
  {
    field: 'state',
    label: '审核状态',
    type: 'select',
    span: 8,
    attrs: { options: stateOptions },
  },
  {
    field: 'rectify_state',
    label: '整改阶段',
    type: 'select',
    span: 8,
    attrs: { options: rectifyOptions },
  },
  {
    field: 'review_result',
    label: '复查结论',
    type: 'select',
    span: 8,
    attrs: { options: reviewResultOptions },
  },
  { field: 'keyword', label: '关键词', type: 'text', span: 8 },
]);

const formFields = ref([
  { field: 'code', type: 'text', label: '编号', span: 12 },
  {
    field: 'category',
    type: 'select',
    label: '类型',
    span: 12,
    required: true,
    attrs: { options: categoryOptions },
  },
  {
    field: 'severity',
    type: 'select',
    label: '严重等级',
    span: 12,
    required: true,
    attrs: { options: severityOptions },
  },
  {
    field: 'source',
    type: 'select',
    label: '发现来源',
    span: 12,
    attrs: { options: sourceOptions },
  },
  {
    field: 'milepost_id',
    type: 'select',
    label: '工程部位桩号',
    span: 12,
    attrs: { options: [] },
  },
  {
    field: 'stakeholder_id',
    type: 'slot',
    label: '整改责任单位',
    span: 12,
    required: true,
  },
  { field: 'deadline', type: 'datetime', label: '整改期限', span: 12 },
  {
    field: 'content',
    type: 'textarea',
    label: '内容描述',
    span: 24,
    required: true,
  },
  {
    field: 'requirement',
    type: 'textarea',
    label: '整改要求',
    span: 24,
  },
  {
    field: 'proof',
    type: 'image',
    label: '现场证据',
    span: 24,
    attrs: { multiple: true },
  },
  {
    field: 'correction',
    type: 'image',
    label: '整改证据',
    span: 24,
    attrs: { multiple: true },
  },
  { field: 'notice_no', type: 'text', label: '通知单编号', span: 12 },
  { field: 'notice', type: 'image', label: '通知单附件', span: 12 },
  {
    field: 'notice_reply_no',
    type: 'text',
    label: '回复单编号',
    span: 12,
  },
  { field: 'notice_reply', type: 'image', label: '回复单附件', span: 12 },
  {
    field: 'state_label',
    type: 'text',
    label: '审核状态',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'rectify_state_label',
    type: 'text',
    label: '整改阶段',
    span: 12,
    displayOnly: true,
  },
  { field: 'audits', type: 'slot', label: '审核历史', span: 24 },
]);

const stateColors = {
  0: 'default',
  1: 'orange',
  2: 'green',
  3: 'red',
};
const rectifyColors = {
  0: 'orange',
  1: 'blue',
  2: 'purple',
  3: 'default',
};
const severityColors = { 1: 'blue', 2: 'orange', 3: 'red' };
const categoryColors = { 1: 'blue', 2: 'red', 3: 'orange', 4: 'default' };

const gridColumns = ref([
  { field: 'code', title: '编号', minWidth: 120 },
  { field: 'milepost_name', title: '工程部位', minWidth: 120 },
  {
    field: 'category',
    title: '类型',
    width: 80,
    slots: { default: 'default_category' },
  },
  {
    field: 'severity',
    title: '严重等级',
    width: 90,
    slots: { default: 'default_severity' },
  },
  {
    field: 'state',
    title: '审核状态',
    width: 100,
    slots: { default: 'default_state' },
  },
  {
    field: 'rectify_state',
    title: '整改阶段',
    width: 100,
    slots: { default: 'default_rectify' },
  },
  { field: 'content', title: '内容', minWidth: 200 },
  { field: 'stakeholder.name', title: '责任单位', minWidth: 120 },
  { field: 'deadline', title: '整改期限', width: 160 },
  { field: 'closed_at', title: '闭环时间', width: 160 },
  { field: 'creator.name', title: '创建人', width: 100 },
  { field: 'created_at', title: '创建时间', minWidth: 160 },
]);

function saveFormat(payload) {
  const p = { ...payload };
  // 整改阶段不允许直接经 update 跳闭环——闭环由 review 动作驱动
  delete p.rectify_state;
  delete p.state;
  delete p.review_result;
  p.project_id = p.project_id || currentProjectId.value;
  // source 默认手工录入（独立登记页创建时）
  if (p.source === undefined || p.source === null) p.source = 7;
  return p;
}

// 状态时间线（草稿/待审→签发→整改回复→复查→闭环），按 audits + 字段时间展示
function timeline(row) {
  if (!row) return [];
  const items = [];
  items.push({
    label: '发现',
    time: row.created_at || '',
    user: row.creator?.name || row.staff__name || '',
    color: 'blue',
  });
  if (row.audit_id && row.audit?.audit_time) {
    items.push({
      label: '签发',
      time: row.audit.audit_time,
      user: row.audit?.user?.name || '',
      color: 'green',
    });
  }
  if (row.rectify_at) {
    items.push({
      label: '整改回复',
      time: row.rectify_at,
      user: '', // 整改人姓名需 join，详情接口可加
      color: 'purple',
    });
  }
  if (row.review_at) {
    items.push({
      label:
        row.review_result === 1
          ? '复查合格(闭环)'
          : '复查不合格(退回整改)',
      time: row.review_at,
      user: '', // 复查人姓名
      color: row.review_result === 1 ? 'gold' : 'red',
    });
  }
  return items;
}

// 最近一次审核不通过时表单顶部警告
function lastAuditRejected(audits) {
  if (!audits || audits.length === 0) return null;
  return audits[audits.length - 1]?.status === 0
    ? audits[audits.length - 1]
    : null;
}

// =================== 三阶段动作：签发 / 整改回复 / 复查 ===================
// 签发
const signDialog = ref(false);
const signRow = ref(null);
const signForm = reactive({
  notice_no: '',
  requirement: '',
  deadline: '',
  stakeholder_id: undefined,
  notice: '',
});

function canSign(row) {
  const state = row?.state;
  return (
    hasAccessByCodes(['nonconformance.sign']) &&
    (state === 0 || state === 1)
  );
}

function openSign(row) {
  signRow.value = row;
  signForm.notice_no = row.notice_no || '';
  signForm.requirement = row.requirement || '';
  signForm.deadline = row.deadline || '';
  signForm.stakeholder_id = row.stakeholder_id || undefined;
  signForm.notice = '';
  signDialog.value = true;
}

async function submitSign() {
  if (!signRow.value) return;
  const payload = {};
  if (signForm.notice_no) payload.notice_no = signForm.notice_no;
  if (signForm.requirement) payload.requirement = signForm.requirement;
  if (signForm.deadline) payload.deadline = signForm.deadline;
  if (signForm.stakeholder_id) payload.stakeholder_id = signForm.stakeholder_id;
  if (signForm.notice) payload.notice = signForm.notice;
  try {
    await requestClient.post(
      `/nonconformances/${signRow.value.id}/sign`,
      payload,
    );
    message.success('签发成功');
    signDialog.value = false;
    reloadList();
  } catch (e) {
    message.error(e?.response?.data?.message || '签发失败');
  }
}

// 整改回复
const rectifyDialog = ref(false);
const rectifyRow = ref(null);
const rectifyForm = reactive({
  correction: '',
  notice_reply_no: '',
  notice_reply: '',
});

function canRectify(row) {
  const state = row?.state;
  const rectify = row?.rectify_state;
  return (
    hasAccessByCodes(['nonconformance.rectify']) &&
    state === 2 &&
    (rectify === 0 || rectify === 1)
  );
}

function openRectify(row) {
  rectifyRow.value = row;
  rectifyForm.correction = '';
  rectifyForm.notice_reply_no = row.notice_reply_no || '';
  rectifyForm.notice_reply = '';
  rectifyDialog.value = true;
}

async function submitRectify() {
  if (!rectifyForm.correction && !rectifyForm.notice_reply) {
    message.warning('请上传整改证据或回复单附件');
    return;
  }
  const payload = { correction: rectifyForm.correction };
  if (rectifyForm.notice_reply_no) payload.notice_reply_no = rectifyForm.notice_reply_no;
  if (rectifyForm.notice_reply) payload.notice_reply = rectifyForm.notice_reply;
  try {
    await requestClient.post(
      `/nonconformances/${rectifyRow.value.id}/rectify`,
      payload,
    );
    message.success('整改回复已提交，待监理复查');
    rectifyDialog.value = false;
    reloadList();
  } catch (e) {
    message.error(e?.response?.data?.message || '提交失败');
  }
}

// 复查
const reviewDialog = ref(false);
const reviewRow = ref(null);
const reviewForm = reactive({ result: 1, reason: '' });

function canReview(row) {
  const state = row?.state;
  const rectify = row?.rectify_state;
  return (
    hasAccessByCodes(['nonconformance.review']) &&
    state === 2 &&
    rectify === 2
  );
}

function openReview(row) {
  reviewRow.value = row;
  reviewForm.result = 1;
  reviewForm.reason = '';
  reviewDialog.value = true;
}

async function submitReview() {
  const payload = { result: reviewForm.result };
  if (reviewForm.result === 2 && !reviewForm.reason) {
    message.warning('复查不合格必须填写原因');
    return;
  }
  if (reviewForm.reason) payload.reason = reviewForm.reason;
  try {
    await requestClient.post(
      `/nonconformances/${reviewRow.value.id}/review`,
      payload,
    );
    message.success(
      reviewForm.result === 1 ? '复查合格，已闭环' : '已退回整改',
    );
    reviewDialog.value = false;
    reloadList();
  } catch (e) {
    message.error(e?.response?.data?.message || '复查失败');
  }
}

// 触发 AppCrudTable 重新拉取
const reloadFlag = ref(0);
function reloadList() {
  reloadFlag.value += 1;
}

// =================== P3-N04 异步 Excel 导出 ===================
const filters = ref({});
const exportOpen = ref(false);
const exportForm = reactive({
  project_id: null,
  state: undefined,
  rectify_state: undefined,
  category: undefined,
  severity: undefined,
  source: undefined,
  review_result: undefined,
  keyword: '',
  date_range: [],
});
const exporting = ref(false);

function openExport() {
  exportForm.project_id = filters.value?.project_id ?? null;
  exportForm.state = filters.value?.state ?? undefined;
  exportForm.rectify_state = filters.value?.rectify_state ?? undefined;
  exportForm.category = filters.value?.category ?? undefined;
  exportForm.severity = filters.value?.severity ?? undefined;
  exportForm.source = filters.value?.source ?? undefined;
  exportForm.review_result = filters.value?.review_result ?? undefined;
  exportForm.keyword = filters.value?.keyword ?? '';
  exportOpen.value = true;
}

async function submitExport() {
  const params = {};
  if (exportForm.project_id) params.project_id = exportForm.project_id;
  if (exportForm.state !== undefined && exportForm.state !== null)
    params.state = exportForm.state;
  if (exportForm.rectify_state !== undefined && exportForm.rectify_state !== null)
    params.rectify_state = exportForm.rectify_state;
  if (exportForm.category !== undefined && exportForm.category !== null)
    params.category = exportForm.category;
  if (exportForm.severity !== undefined && exportForm.severity !== null)
    params.severity = exportForm.severity;
  if (exportForm.source !== undefined && exportForm.source !== null)
    params.source = exportForm.source;
  if (
    exportForm.review_result !== undefined &&
    exportForm.review_result !== null
  )
    params.review_result = exportForm.review_result;
  if (exportForm.keyword) params.keyword = exportForm.keyword;
  if (exportForm.date_range?.length === 2) {
    params.date_from = exportForm.date_range[0];
    params.date_to = exportForm.date_range[1];
  }

  exporting.value = true;
  message.loading('正在创建导出任务...', 0);
  try {
    const res = await requestClient.post('/export-jobs', {
      export_type: 'nonconformance',
      params,
    });
    const id = res?.data?.id;
    if (!id) {
      message.destroy();
      message.error('发起导出失败');
      return;
    }
    exportOpen.value = false;
    message.destroy();
    message.loading('后台导出中，请稍候...', 0);
    pollExport(id);
  } catch {
    message.destroy();
    message.error('发起导出失败');
  } finally {
    exporting.value = false;
  }
}

function pollExport(id) {
  const timer = setInterval(() => {
    requestClient
      .get(`/export-jobs/${id}`)
      .then((res) => {
        const d = res?.data;
        if (!d) return;
        if (d.status === 2) {
          clearInterval(timer);
          message.destroy();
          message.success('导出完成');
          if (d.download_url) window.open(d.download_url, '_blank');
        } else if (d.status === 3) {
          clearInterval(timer);
          message.destroy();
          message.error(`导出失败：${d.error_message || ''}`);
        }
      })
      .catch(() => {});
  }, 2000);
}

onMounted(() => {
  loadStakeholders();
  loadMileposts();
});
watch(() => appStore.defaultProject?.id, () => {
  loadStakeholders();
  loadMileposts();
});

// 把 milepostOptions 注入到 form 字段
watch(milepostOptions, (opts) => {
  const field = formFields.value.find((f) => f.field === 'milepost_id');
  if (field) field.attrs.options = opts;
});
</script>

<template>
  <AppCrudTable
    :key="reloadFlag"
    api-url="nonconformances"
    :filter-fields="filterFields"
    :fields="formFields"
    :extra-query="extraQuery"
    :list-scope="2"
    permission-name="nonconformance"
    :inline-actions="['view', 'edit', 'audit']"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :save-format="saveFormat"
    title="不符合项"
    class="p-4"
    @update:filters="(v) => (filters.value = v)"
  >
    <template #toolbar-append>
      <Button type="primary" ghost @click="openExport">导出</Button>
    </template>

    <template #default_state="{ row }">
      <Tag :color="stateColors[row.state] || 'default'">
        {{ row.state_label || stateOptions.find(s => s.value === row.state)?.label || '-' }}
      </Tag>
    </template>
    <template #default_rectify="{ row }">
      <Tag :color="rectifyColors[row.rectify_state] || 'default'">
        {{
          row.rectify_state_label ||
          rectifyOptions.find(r => r.value === row.rectify_state)?.label ||
          '-'
        }}
      </Tag>
    </template>
    <template #default_category="{ row }">
      <Tag :color="categoryColors[row.category] || 'default'">
        {{ categoryLabel[row.category] || '-' }}
      </Tag>
    </template>
    <template #default_severity="{ row }">
      <Tag :color="severityColors[row.severity] || 'default'">
        {{ severityLabel[row.severity] || '-' }}
      </Tag>
    </template>

    <template #filter_stakeholder_id="{ modelValue, update }">
      <Select
        :value="modelValue"
        :options="stakeholderOptions"
        placeholder="责任单位"
        allow-clear
        show-search
        option-filter-prop="label"
        style="width: 100%"
        @change="update"
      />
    </template>

    <template #field_stakeholder_id="{ modelValue, update }">
      <Select
        :value="modelValue"
        :options="stakeholderOptions"
        placeholder="请选择整改责任单位"
        allow-clear
        show-search
        option-filter-prop="label"
        style="width: 100%"
        @change="update"
      />
    </template>

    <template #field_audits="{ modelValue }">
      <Alert
        v-if="lastAuditRejected(modelValue)"
        type="error"
        class="mb-2"
        :message="`最近审核不通过：${lastAuditRejected(modelValue).reason || '无原因'}`"
        :description="`审核时间：${lastAuditRejected(modelValue).audit_time || lastAuditRejected(modelValue).created_at}`"
      />
      <div v-if="modelValue && modelValue.length" class="space-y-2">
        <div v-for="(a, i) in modelValue" :key="i" class="rounded border p-2">
          <div>
            <Tag :color="a.status ? 'green' : 'red'">
              {{ a.status ? '通过' : '不通过' }}
            </Tag>
            <span class="ml-2 text-sm text-gray-500">
              {{ a.audit_time || a.created_at }}
            </span>
          </div>
          <div class="text-sm">
            审核人：{{ a.auditor_name || a.user?.name || '-' }}
          </div>
          <div v-if="a.reason" class="text-sm text-red-500">{{ a.reason }}</div>
        </div>
      </div>
      <div v-else class="text-sm text-gray-400">无审核记录</div>
    </template>

    <template #row-action-extra="{ row }">
      <Button v-if="canSign(row)" type="link" size="small" @click="openSign(row)">
        签发
      </Button>
      <Button
        v-if="canRectify(row)"
        type="link"
        size="small"
        @click="openRectify(row)"
      >
        整改回复
      </Button>
      <Button
        v-if="canReview(row)"
        type="link"
        size="small"
        @click="openReview(row)"
      >
        复查
      </Button>
    </template>
  </AppCrudTable>

  <!-- 签发弹窗 -->
  <Modal
    v-model:open="signDialog"
    title="监理签发"
    :confirm-loading="false"
    ok-text="签发"
    cancel-text="取消"
    width="640px"
    @ok="submitSign"
  >
    <Form layout="vertical" :model="signForm">
      <FormItem label="监理通知单编号">
        <Input v-model:value="signForm.notice_no" placeholder="如 TZ-2026-001" />
      </FormItem>
      <FormItem label="整改期限">
        <DatePicker
          v-model:value="signForm.deadline"
          show-time
          value-format="YYYY-MM-DD HH:mm:ss"
          style="width: 100%"
        />
      </FormItem>
      <FormItem label="整改责任单位">
        <Select
          v-model:value="signForm.stakeholder_id"
          :options="stakeholderOptions"
          placeholder="选择施工单位"
          allow-clear
          show-search
          option-filter-prop="label"
        />
      </FormItem>
      <FormItem label="整改要求">
        <Input.TextArea
          v-model:value="signForm.requirement"
          :rows="3"
          placeholder="监理对整改的具体要求"
        />
      </FormItem>
    </Form>
    <Alert
      type="info"
      message="签发后状态将变为「已签发」并进入待整改阶段，可重新编辑要求/责任单位/期限，由后续整改回复+复查闭环。"
      class="mt-2"
    />
  </Modal>

  <!-- 整改回复弹窗 -->
  <Modal
    v-model:open="rectifyDialog"
    title="提交整改回复"
    :confirm-loading="false"
    ok-text="提交"
    cancel-text="取消"
    width="640px"
    @ok="submitRectify"
  >
    <Form layout="vertical" :model="rectifyForm">
      <FormItem label="回复单编号">
        <Input
          v-model:value="rectifyForm.notice_reply_no"
          placeholder="如 RP-2026-001"
        />
      </FormItem>
      <FormItem label="整改证据 (图片/视频 URL)" required>
        <Input
          v-model:value="rectifyForm.correction"
          placeholder="上传附件后自动填入 URL"
        />
      </FormItem>
      <FormItem label="回复单附件 URL">
        <Input
          v-model:value="rectifyForm.notice_reply"
          placeholder="上传附件后自动填入 URL"
        />
      </FormItem>
    </Form>
    <Alert
      type="info"
      message="提交后状态变为「已整改，待监理复查」，监理将在「复查」动作中决定合格闭环或退回整改。"
      class="mt-2"
    />
  </Modal>

  <!-- 复查弹窗 -->
  <Modal
    v-model:open="reviewDialog"
    title="监理复查"
    :confirm-loading="false"
    ok-text="提交复查"
    cancel-text="取消"
    width="640px"
    @ok="submitReview"
  >
    <Form layout="vertical" :model="reviewForm">
      <FormItem label="复查结论" required>
        <Select v-model:value="reviewForm.result">
          <Select.Option :value="1">合格（闭环）</Select.Option>
          <Select.Option :value="2">不合格（退回整改）</Select.Option>
        </Select>
      </FormItem>
      <FormItem v-if="reviewForm.result === 2" label="不合格原因" required>
        <Input.TextArea
          v-model:value="reviewForm.reason"
          :rows="3"
          placeholder="说明复查不合格原因，施工单位需再次整改"
        />
      </FormItem>
    </Form>
  </Modal>

  <!-- P3-N04 导出筛选弹窗 -->
  <Modal
    :open="exportOpen"
    title="导出不符合项"
    :confirm-loading="exporting"
    ok-text="开始导出"
    cancel-text="取消"
    @ok="submitExport"
    @cancel="exportOpen = false"
  >
    <div class="space-y-4">
      <div>
        <label class="mb-1 block text-sm text-gray-500">审核状态</label>
        <Select
          v-model:value="exportForm.state"
          :options="stateOptions"
          style="width: 100%"
          allow-clear
          placeholder="全部"
        />
      </div>
      <div>
        <label class="mb-1 block text-sm text-gray-500">整改阶段</label>
        <Select
          v-model:value="exportForm.rectify_state"
          :options="rectifyOptions"
          style="width: 100%"
          allow-clear
          placeholder="全部"
        />
      </div>
      <div>
        <label class="mb-1 block text-sm text-gray-500">类型</label>
        <Select
          v-model:value="exportForm.category"
          :options="categoryOptions"
          style="width: 100%"
          allow-clear
          placeholder="全部"
        />
      </div>
      <div>
        <label class="mb-1 block text-sm text-gray-500">严重等级</label>
        <Select
          v-model:value="exportForm.severity"
          :options="severityOptions"
          style="width: 100%"
          allow-clear
          placeholder="全部"
        />
      </div>
      <div>
        <label class="mb-1 block text-sm text-gray-500">发现来源</label>
        <Select
          v-model:value="exportForm.source"
          :options="sourceOptions"
          style="width: 100%"
          allow-clear
          placeholder="全部"
        />
      </div>
      <div>
        <label class="mb-1 block text-sm text-gray-500">项目ID</label>
        <InputNumber
          v-model:value="exportForm.project_id"
          style="width: 100%"
          placeholder="全部"
        />
      </div>
      <div>
        <label class="mb-1 block text-sm text-gray-500">关键词</label>
        <Input v-model:value="exportForm.keyword" placeholder="内容关键词" />
      </div>
      <div>
        <label class="mb-1 block text-sm text-gray-500">创建日期范围</label>
        <DatePicker.RangePicker
          v-model:value="exportForm.date_range"
          style="width: 100%"
          value-format="YYYY-MM-DD"
        />
      </div>
    </div>
  </Modal>
</template>
