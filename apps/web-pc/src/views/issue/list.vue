<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { Button, Modal, Select, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppList from '#/components/AppList.vue';

import { useAppStore } from '#/store';

const appStore = useAppStore();

// 全局选择的项目 ID（"所有项目"时为空），列表请求自动携带
const currentProjectId = computed(() => appStore.defaultProject?.id || undefined);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

const levelOptions = ref([]);
const stakeholderOptions = ref([]);

async function loadLevels() {
  const { data } = await new Resource('issue-levels').list({ per_page: 'all' });
  levelOptions.value = (data || []).map((l) => ({ value: l.id, label: l.name }));
  const field = formFields.value.find((f) => f.field === 'level_id');
  if (field) field.attrs.options = levelOptions.value;
  const f2 = filterFields.value.find((f) => f.field === 'level_id');
  if (f2) f2.attrs.options = levelOptions.value;
}

async function loadStakeholders() {
  const { data } = await new Resource('stakeholders').list({
    per_page: 'all',
    project_id: currentProjectId.value,
  });
  stakeholderOptions.value = (data || []).map((s) => ({ value: s.id, label: s.name }));
}

const filterFields = ref([
  { field: 'code', label: '编号', type: 'text', span: 8 },
  { field: 'states', label: '状态', type: 'select', span: 8, attrs: { multiple: true, options: [
    { label: '处理中', value: 2 },
    { label: '已完成', value: 3 },
  ] } },
  { field: 'level_id', label: '问题级别', type: 'select', span: 8, attrs: { options: [] } },
]);

const formFields = ref([
  { field: 'code', type: 'text', label: '问题编号', span: 12 },
  { field: 'state_label', type: 'text', label: '状态', span: 12, displayOnly: true },
  { field: 'stakeholder_id', type: 'slot', label: '相关方', span: 12, required: true },
  { field: 'level_id', type: 'select', label: '问题级别', span: 12, required: true, attrs: { options: [] } },
  { field: 'deadline', type: 'datetime', label: '整改期限', span: 12, required: true },
  { field: 'description', type: 'textarea', label: '问题描述', span: 24, required: true },
  { field: 'requirement', type: 'textarea', label: '整改要求', span: 24, required: true },
  { field: 'notice', type: 'image', label: '通知单', span: 12 },
  { field: 'notice_reply', type: 'image', label: '通知回复单', span: 12 },
  { field: 'nonconformances', type: 'slot', label: '关联不符合项', span: 24 },
]);

const stateColors = {
  1: 'orange',
  2: 'blue',
  3: 'green',
};

// 后端子项关系序列化不含 label，本地映射（P3-N01 状态语义）
const ncStateLabel = (s) => ({ 0: '草稿', 1: '待审核', 2: '已通过', 3: '已退回' }[s] ?? '-');
const ncRectifyLabel = (s) => ({ 0: '待整改', 1: '整改中', 2: '已整改', 3: '已关闭' }[s] ?? '-');
const ncRectifyColor = (s) => (s === 3 ? 'green' : s === 1 ? 'blue' : s === 2 ? 'green' : 'orange');

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
  { field: 'created_at', title: '创建时间', width: 160 },
]);

function saveFormat(payload) {
  const p = { ...payload };
  // 后端 store 需对象数组（pluck('id')），编辑时后端不支持修改关联
  p.nonconformances = (p.nonconformances || []).map((n) =>
    typeof n === 'object' ? { id: n.id } : { id: n }
  );
  p.project_id = p.project_id || currentProjectId.value;
  return p;
}

// 创建时从"待审核"不符合项中选择（编辑/详情时后端不可修改关联）
const ncDialog = ref(false);
const ncAll = ref([]);
const ncSelected = ref([]);
const ncConfirmUpdate = ref(null);
const emptyRows = ref([]);
const pickerColumns = ref([
  { field: 'code', title: '编号', width: 130 },
  { field: 'content', title: '内容', minWidth: 200 },
  { field: 'state_label', title: '审核状态', width: 100 },
]);

async function openNcPicker(update) {
  ncConfirmUpdate.value = update;
  const { data } = await new Resource('nonconformances').list({
    per_page: 'all',
    state: 1,
    project_id: currentProjectId.value,
  });
  ncAll.value = data || [];
  ncSelected.value = [];
  ncDialog.value = true;
}

function confirmNc() {
  const picked = ncAll.value.filter((n) => ncSelected.value.includes(n.id));
  ncConfirmUpdate.value?.(picked);
  ncDialog.value = false;
}

onMounted(() => {
  loadLevels();
  loadStakeholders();
});
watch(() => appStore.defaultProject?.id, loadStakeholders);
</script>

<template>
  <AppCrudTable
    api-url="issues"
    :filter-fields="filterFields"
    :fields="formFields"
    :extra-query="extraQuery"
    :list-scope="2"
    permission-name="issue"
    :inline-actions="['view', 'edit']"
    :exclude-fields="['nonconformances', 'stakeholder_id', 'code']"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :save-format="saveFormat"
    title="问题跟踪"
    class="p-4"
  >
    <template #default_state="{ row }">
      <Tag :color="stateColors[row.state] || 'default'">{{ row.state_label || row.state_desc || '-' }}</Tag>
    </template>

    <template #field_stakeholder_id="{ modelValue, update }">
      <Select
        :value="modelValue"
        :options="stakeholderOptions"
        placeholder="请选择相关方"
        allow-clear
        show-search
        option-filter-prop="label"
        style="width: 100%"
        @change="update"
      />
    </template>

    <template #field_nonconformances="{ modelValue, update }">
      <div v-if="modelValue && modelValue.length" class="space-y-2">
        <div v-for="(nc, i) in modelValue" :key="i" class="rounded border p-2 text-sm">
          <div class="flex items-center justify-between">
            <span>{{ nc.code || '-' }}</span>
            <!-- P3-N06 子项整改状态驱动问题关闭 -->
            <span class="space-x-1">
              <Tag :color="nc.state === 2 ? 'green' : nc.state === 3 ? 'red' : 'orange'">
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
      <div v-else>
        <Button type="primary" ghost size="small" @click="openNcPicker(update)">
          选择不符合项
        </Button>
        <div class="mt-1 text-sm text-gray-400">从"待审核"的不符合项中选择（至少 1 项），保存后不可修改</div>
      </div>
    </template>
  </AppCrudTable>

  <!-- 关联不符合项选择器 -->
  <Modal
    v-model:open="ncDialog"
    title="选择不符合项"
    ok-text="确定"
    cancel-text="取消"
    width="720px"
    @ok="confirmNc"
  >
    <AppList
      :model-value="emptyRows"
      :options="{ columns: pickerColumns, data: ncAll, showFooter: false }"
      :fields="[]"
      :selected="ncSelected"
      show-checkbox
      :show-action="false"
      :show-seq="true"
      row-key="id"
      height="420"
      @update:selected="(rows) => (ncSelected = rows.map((r) => r.id))"
    />
  </Modal>
</template>
