<script setup>
import { onMounted, ref } from 'vue';

import { Button, message, Modal, Select, Switch } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppList from '#/components/AppList.vue';

const editingItem = ref({});

const scopeOptions = [
  { value: 'global', label: '全局' },
  { value: 'category', label: '按分类' },
  { value: 'project', label: '按项目' },
];
const projectOptions = ref([]);
async function loadProjects() {
  const { data } = await new Resource('projects').list({ per_page: 'all' });
  projectOptions.value = (data || []).map((p) => ({
    value: p.id,
    label: p.name,
  }));
}

const categories = ref([]);
async function loadCategories() {
  try {
    const { data } = await new Resource('categories').list({
      per_page: 'all',
      type: 'project',
    });
    categories.value = data || [];
    const field = formFields.value.find((f) => f.field === 'category_id');
    if (field) field.attrs.options = categories.value;
  } catch (error) {
    console.error(error);
  }
}

// P3-T01 前置工序配置
const procedureOptions = ref([]);
const prereqDialog = ref(false);
const prereqList = ref([]); // [{prerequisite_id, scope, project_category_id, project_id, required}]

async function loadProcedures() {
  const { data } = await new Resource('procedures').list({ per_page: 'all' });
  procedureOptions.value = (data || []).map((p) => ({
    value: p.id,
    label: p.name,
  }));
}

function openPrereqDialog() {
  prereqList.value = (editingItem.value.prerequisites || []).map((r) => ({
    prerequisite_id: r.prerequisite_id,
    scope: r.project_id
      ? 'project'
      : r.project_category_id
        ? 'category'
        : 'global',
    project_category_id: r.project_category_id || null,
    project_id: r.project_id || null,
    required: r.required === 0 ? false : true,
  }));
  prereqDialog.value = true;
}

function addPrereqRow() {
  prereqList.value.push({
    prerequisite_id: null,
    scope: 'global',
    project_category_id: null,
    project_id: null,
    required: true,
  });
}

function removePrereqRow(index) {
  prereqList.value.splice(index, 1);
}

function confirmPrereq() {
  for (const r of prereqList.value) {
    if (!r.prerequisite_id) {
      message.error('每行需选择前置工序');
      return;
    }
  }
  editingItem.value.prerequisites = prereqList.value.map((r) => ({
    prerequisite_id: r.prerequisite_id,
    project_category_id: r.scope === 'category' ? r.project_category_id : null,
    project_id: r.scope === 'project' ? r.project_id : null,
    required: r.required ? 1 : 0,
    sort: 0,
  }));
  prereqDialog.value = false;
}

// 监理方式选项（行内 select）
const measureOptions = ref([]);
async function loadMeasures() {
  const { data } = await new Resource('measures').list({ per_page: 'all' });
  measureOptions.value = (data || []).map((m) => ({
    value: m.id,
    label: m.name,
  }));
  const field = listFields.value.find((f) => f.field === 'measure_id');
  if (field) field.attrs.options = measureOptions.value;
}

// 监理方式-表单子表（procedure_forms）
const listColumns = ref([
  {
    field: 'measure_id',
    title: '监理方式',
    minWidth: 200,
    slots: { default: 'default_measure_id' },
  },
  {
    field: 'form_id',
    title: '表单',
    minWidth: 220,
    slots: { default: 'default_form_id' },
  },
]);

const listFields = ref([
  {
    field: 'measure_id',
    type: 'select',
    label: '监理方式',
    span: 8,
    required: true,
    attrs: { options: [] },
  },
]);

// 表单选择弹窗（forms?project_category_id=当前工序分类）
const formDialog = ref(false);
const formList = ref([]);
const formColumns = ref([
  { field: 'name', title: '名称', minWidth: 200 },
  { field: 'template_count', title: '模板数', width: 100 },
]);
const formRowIndex = ref(0);

async function openFormPicker(rowIndex) {
  formRowIndex.value = rowIndex;
  const { data } = await new Resource('forms').list({
    per_page: 'all',
    project_category_id: editingItem.value.category_id,
  });
  formList.value = data || [];
  formDialog.value = true;
}

function confirmForm() {
  const selected = formList.value.find((f) => f.id === formPickerId.value);
  if (!selected) return;
  const measures = editingItem.value.measures || [];
  if (!measures[formRowIndex.value]) return;
  measures[formRowIndex.value].form = { id: selected.id, name: selected.name };
  measures[formRowIndex.value].form_id = selected.id;
  formDialog.value = false;
}

const formPickerId = ref(null);
function openFormModal(rowIndex) {
  formRowIndex.value = rowIndex;
  formPickerId.value = null;
  openFormPicker(rowIndex);
}

function addMeasureRow() {
  if (!editingItem.value.measures) editingItem.value.measures = [];
  editingItem.value.measures.push({});
}

function saveFormat(payload) {
  const measures = payload.measures || [];
  if (measures.length === 0) {
    message.error('工序至少有一个监理方式');
    return false;
  }
  const seen = new Set();
  for (const m of measures) {
    if (!m.measure_id || !m.form_id) {
      message.error('每行需选择监理方式和表单');
      return false;
    }
    if (seen.has(m.measure_id)) {
      message.error('监理方式不能重复');
      return false;
    }
    seen.add(m.measure_id);
  }
  return payload;
}

const formFields = ref([
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  {
    field: 'category_id',
    type: 'select',
    label: '分类',
    span: 12,
    attrs: { options: [] },
  },
  { field: 'measures', type: 'slot', label: '监理表单', span: 24 },
  { field: 'prerequisites', type: 'slot', label: '前置工序', span: 24 },
]);

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
  {
    field: 'category_id',
    label: '分类',
    type: 'select',
    span: 8,
    attrs: { options: [] },
  },
]);

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 200 },
  {
    field: 'category.name',
    title: '分类',
    minWidth: 140,
    slots: { default: 'default_category' },
  },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

onMounted(() => {
  loadCategories();
  loadMeasures();
  loadProcedures();
  loadProjects();
});
</script>

<template>
  <AppCrudTable
    v-model="editingItem"
    api-url="procedures"
    :filter-fields="filterFields"
    :fields="formFields"
    permission-name="procedure"
    :inline-actions="['view', 'edit']"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :save-format="saveFormat"
    title="工序管理"
    class="p-4"
  >
    <template #default_category="{ row }">
      {{ row.category?.name || '-' }}
    </template>

    <template #field_measures>
      <AppList
        v-model="editingItem.measures"
        :options="{ columns: listColumns, showFooter: false }"
        :fields="listFields"
        :show-delete="true"
        :show-edit="false"
        row-key="id"
        height="240"
      >
        <template #default_measure_id="{ row }">
          <span>{{
            measureOptions.find((m) => m.value === row.measure_id)?.label || '-'
          }}</span>
        </template>
        <template #default_form_id="{ row, rowIndex }">
          <Button
            type="link"
            size="small"
            class="p-0"
            @click="openFormModal(rowIndex)"
          >
            {{ row.form?.name || '选择表单' }}
          </Button>
        </template>
        <template #footer>
          <div class="flex justify-center py-2">
            <Button type="dashed" size="small" block @click="addMeasureRow">
              + 增加一行
            </Button>
          </div>
        </template>
      </AppList>
    </template>

    <template #field_prerequisites>
      <div class="flex flex-wrap items-center gap-2 rounded border p-3">
        <span class="text-sm text-gray-500">
          前置工序：任务记录提交时将校验前置工序是否已完成，缺项阻止提交。
        </span>
        <Button size="small" @click="openPrereqDialog">
          配置（{{ (editingItem.prerequisites || []).length }}）
        </Button>
      </div>
    </template>
  </AppCrudTable>

  <!-- 前置工序配置弹窗 -->
  <Modal
    v-model:open="prereqDialog"
    title="配置前置工序"
    ok-text="确定"
    cancel-text="取消"
    width="760px"
    @ok="confirmPrereq"
  >
    <div v-if="prereqList.length" class="space-y-2">
      <div
        v-for="(row, index) in prereqList"
        :key="index"
        class="flex flex-wrap items-center gap-2 rounded border p-2"
      >
        <Select
          v-model:value="row.prerequisite_id"
          :options="procedureOptions"
          placeholder="选择前置工序"
          style="width: 200px"
          :disabled="procedureOptions.length === 0"
        />
        <Select
          v-model:value="row.scope"
          style="width: 110px"
          :options="scopeOptions"
        />
        <Select
          v-if="row.scope === 'category'"
          v-model:value="row.project_category_id"
          :options="categories.map((c) => ({ value: c.id, label: c.name }))"
          placeholder="项目分类"
          style="width: 160px"
        />
        <Select
          v-if="row.scope === 'project'"
          v-model:value="row.project_id"
          :options="projectOptions"
          placeholder="选择项目"
          show-search
          option-filter-prop="label"
          style="width: 180px"
        />
        <Switch
          v-model:checked="row.required"
          checked-children="必需"
          un-checked-children="可选"
        />
        <Button type="text" danger size="small" @click="removePrereqRow(index)">
          删除
        </Button>
      </div>
    </div>
    <div v-else class="py-4 text-center text-gray-400">暂无前置工序配置</div>
    <div class="mt-3">
      <Button type="dashed" block @click="addPrereqRow">+ 增加一行</Button>
    </div>
  </Modal>

  <!-- 表单选择弹窗（按工序分类过滤） -->
  <Modal
    v-model:open="formDialog"
    title="选择表单"
    ok-text="确定"
    cancel-text="取消"
    width="640px"
    @ok="confirmForm"
  >
    <div v-if="formList.length" class="space-y-2">
      <label
        v-for="f in formList"
        :key="f.id"
        class="flex cursor-pointer items-center justify-between rounded border p-2"
        :class="formPickerId === f.id ? 'border-blue-500 bg-blue-50' : ''"
      >
        <span>
          <input
            v-model="formPickerId"
            type="radio"
            :value="f.id"
            class="mr-2"
          />
          {{ f.name }}
        </span>
        <span class="text-sm text-gray-400">模板数：{{ f.template_count ?? '-' }}</span>
      </label>
    </div>
    <div v-else class="py-4 text-center text-gray-400">该分类下无表单</div>
  </Modal>
</template>
