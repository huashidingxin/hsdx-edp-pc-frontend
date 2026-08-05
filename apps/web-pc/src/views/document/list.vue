<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { Button, DatePicker, Drawer, message, Radio, Select, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppOffice from '#/components/AppOffice.vue';
import SubmissionEdit from '#/components/SubmissionEdit.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();

const currentProjectId = computed(() => appStore.defaultProject?.id || undefined);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

const editingItem = ref({});
const submissionRef = ref(null);
// 详情打开即填写（文档台账记录提交），查看/编辑同入口
const isEditing = ref(true);

function onShowDetail(editing) {
  isEditing.value = editing;
}

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

// ---- 详情：加载 values 到 editingItem（供 SubmissionEdit）----
const defaultValues = ref({});
function detailFormat(data) {
  // 备份（重置用）；values 为 submission_fields 数组（show 返回）
  defaultValues.value = JSON.parse(JSON.stringify(data.values || data.submission?.values || []));
  editingItem.value._values = JSON.parse(JSON.stringify(defaultValues.value));
  editingItem.value._formId = data.form_id || data.submission?.form_id;
  editingItem.value._projectId = data.project_id;
  return data;
}

function reset() {
  editingItem.value._values = JSON.parse(JSON.stringify(defaultValues.value));
}

// ---- 提交：PUT documents/{id} { values } → createSubmission('document') ----
async function save() {
  const formData = await submissionRef.value?.getFormData();
  if (!formData) return;
  if (!formData.validated) {
    message.error('请检查表单');
    return;
  }
  try {
    await new Resource('documents').update(editingItem.value.id, {
      form_id: editingItem.value._formId,
      values: formData.values,
    });
    message.success('提交成功');
    tableRef.value?.reload?.();
  } catch (e) {
    console.error(e);
  }
}

const tableRef = ref(null);

// ---- 已提交记录预览（AppOffice 打开渲染 docx）----
const previewOpen = ref(false);
const previewDocument = ref(null);

function openPreview() {
  const filePath = editingItem.value.submission?.file_path || editingItem.value.file_path;
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

onMounted(() => {
  loadForms();
  loadUsers();
});

watch(() => appStore.defaultProject?.id, loadUsers);
</script>

<template>
  <AppCrudTable
    ref="tableRef"
    v-model="editingItem"
    api-url="documents"
    permission-name="document"
    :list-scope="listScope"
    :extra-query="extraQuery"
    :filter-fields="filterFields"
    :fields="detailFields"
    :inline-actions="['view', 'edit']"
    :actions-config="[{ key: 'view', visible: () => true }, { key: 'edit', visible: () => true }]"
    :detail-format="detailFormat"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :toolbar="{ filter: true, create: false, refresh: true }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    title="项目文档台账"
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

    <template #form-default>
      <div v-if="editingItem.id" class="min-h-[300px]">
        <SubmissionEdit
          ref="submissionRef"
          :form-id="editingItem._formId"
          :project-id="editingItem._projectId"
          :values="editingItem._values || []"
          :rules="{}"
          :readonly="false"
        />
      </div>
    </template>

    <template #form-action>
      <Button v-if="editingItem.submission_id" @click="openPreview">预览</Button>
      <Button @click="reset">重置</Button>
      <Button type="primary" @click="save">提交</Button>
    </template>

    <template #default_code="{ row }">
      <span>{{ row.submission?.code || '-' }}</span>
    </template>

    <template #default_state="{ row }">
      <Tag :color="stateColorMap[row.state] || 'default'">{{ row.state_label || '-' }}</Tag>
    </template>
  </AppCrudTable>

  <!-- 已提交记录预览（AppOffice 只读） -->
  <Drawer
    v-model:open="previewOpen"
    title="记录预览"
    width="90%"
    destroy-on-close
  >
    <div v-if="previewDocument" class="h-[calc(100vh-120px)]">
      <AppOffice
        :document="previewDocument"
        :mode="'view'"
      />
    </div>
  </Drawer>
</template>
