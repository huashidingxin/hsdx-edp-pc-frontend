<script setup>
import { computed, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { useUserStore } from '@vben/stores';

import {
  Button,
  DatePicker,
  Drawer,
  Input,
  message,
  Modal,
  Radio,
  Select,
  Tag,
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
  defaultValues.value = JSON.parse(
    JSON.stringify(data.submission?.values || []),
  );
  editingItem.value._values = JSON.parse(JSON.stringify(defaultValues.value));
  editingItem.value._formId =
    data.form_id ||
    data.submission?.form_id ||
    data.projects?.supervision_log_form_id;
  editingItem.value._projectId = data.project_id;
  warnings.value = data.warnings || [];
  return data;
}

// ---- 提交：PUT supervision-logs/{id} { form_id, values } ----
async function save() {
  const formData = await submissionRef.value?.getFormData();
  if (!formData) return;
  if (!formData.validated) {
    message.error('请检查表单');
    return;
  }
  try {
    const res = await new Resource('supervision-logs').update(
      editingItem.value.id,
      {
        form_id: editingItem.value._formId,
        values: formData.values,
      },
    );
    message.success('提交成功');
    warnings.value = res?.data?.warnings || [];
    tableRef.value?.reload?.();
  } catch (error) {
    console.error(error);
    const msg = error?.response?.data?.message;
    if (msg) {
      message.error(msg);
    }
  }
}

function reset() {
  editingItem.value._values = JSON.parse(JSON.stringify(defaultValues.value));
}

const tableRef = ref(null);

// ---- 已提交记录预览（AppOffice 打开渲染 docx）----
const previewOpen = ref(false);
const previewDocument = ref(null);

function openPreview() {
  const filePath = editingItem.value.submission?.file_path;
  if (!filePath) {
    message.warning('该记录未配置打印模板或渲染失败');
    return;
  }
  previewDocument.value = {
    fileType: 'docx',
    key: `submission-${editingItem.value.submission?.id || editingItem.value.id}`,
    url: filePath,
    title: `${editingItem.value.submission?.code || '记录'}.docx`,
  };
  previewOpen.value = true;
}

// ---- P3-L03 关键字警告手动解除（总监/有权限成员，保留记录）----
const canResolveWarning = computed(
  () =>
    appStore.isAdmin ||
    hasAccessByCodes(['log_warning.resolve', 'submission.audit']),
);

async function resolveWarning(w) {
  Modal.confirm({
    title: '解除关键字任务核对警告',
    content: `确认解除"${w.procedure_name}"（${w.keyword}）的警告？操作将保留记录。`,
    okText: '确认解除',
    cancelText: '取消',
    onOk: async () => {
      await new Resource(`log-warnings/${w.id}/resolve`).store({});
      message.success('已解除');
      warnings.value = warnings.value.filter((x) => x.id !== w.id);
    },
  });
}

// ---- 记录审核（submissions/{id}/audit）----
const auditDialog = ref(false);
const auditRow = ref(null);
const auditData = ref({ status: 1, reason: '' });
const auditSubmitting = ref(false);

function canAudit(row) {
  return (
    row.submission_id > 0 &&
    !row.submission?.audit_id &&
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
      width: 160,
      slots: { default: 'default_submitted' },
    },
    {
      field: 'submission_timeout',
      title: '超时',
      width: 80,
      slots: { default: 'default_timeout' },
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
]);

const formFields = ref([
  {
    field: 'date',
    type: 'text',
    label: '日志日期',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'user_id',
    type: 'text',
    label: '填写人ID',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'submission_state',
    type: 'text',
    label: '审核状态',
    span: 12,
    displayOnly: true,
  },
  { field: 'content', type: 'slot', label: '记录内容', span: 24 },
  { field: 'warnings', type: 'slot', label: '关键字任务核对', span: 24 },
  { field: 'timeline', type: 'slot', label: '提交/审核历史时间线', span: 24 },
]);

const stateMap = {
  0: { text: '待提交', color: 'default' },
  1: { text: '待审核', color: 'orange' },
  2: { text: '审核通过', color: 'green' },
  3: { text: '已退回', color: 'red' },
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
</script>

<template>
  <AppCrudTable
    ref="tableRef"
    v-model="editingItem"
    api-url="supervision-logs"
    :filter-fields="filterFields"
    :fields="formFields"
    :extra-query="{ project_id: currentProjectId }"
    :list-scope="listScope"
    permission-name="supervision_log"
    :inline-actions="['view', 'edit']"
    :actions-config="[
      { key: 'view', visible: () => true },
      {
        key: 'edit',
        visible: (row) =>
          row.user_id === userStore.userInfo?.id &&
          (row.submission_id === 0 ||
            (row.submission_id > 0 && row.submission?.state !== 2)),
      },
    ]"
    :detail-format="detailFormat"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: false, detail: 'modal' }"
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
      <span>{{ row.submission?.code || '-' }}</span>
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

    <template #field_content>
      <div v-if="editingItem.id" class="min-h-[200px]">
        <SubmissionEdit
          v-if="editingItem._formId"
          ref="submissionRef"
          :form-id="editingItem._formId"
          :project-id="editingItem._projectId"
          :values="editingItem._values || []"
          :rules="editingItem.submission?.rules || {}"
          :readonly="!isEditing"
        />
        <div v-else class="py-6 text-center text-gray-400">
          该项目未配置监理日志表单
        </div>
      </div>
    </template>

    <template #form-action>
      <Button v-if="editingItem.submission_id" @click="openPreview">
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
              @click="resolveWarning(w)"
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
              {{ item.state === 1 ? '待审核' : '尚未审核' }}
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

  <!-- 已提交记录预览（AppOffice 只读） -->
  <Drawer
    v-model:open="previewOpen"
    title="记录预览"
    width="90%"
    destroy-on-close
  >
    <div v-if="previewDocument" class="h-[calc(100vh-120px)]">
      <AppOffice :document="previewDocument" mode="view" />
    </div>
  </Drawer>
</template>
