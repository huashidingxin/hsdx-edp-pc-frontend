<script setup>
import { onMounted, ref } from 'vue';

import { Button, message, Modal, Select } from 'antdv-next';

import Resource from '#/api/resource';
import AppList from '#/components/AppList.vue';

const props = defineProps({
  ruleCategoryId: {
    type: [String, Number],
    default: undefined,
  },
  ruleId: {
    type: [String, Number],
    default: undefined,
  },
});

// 规则字段类型（与 form 字段子集一致）
const typeOptions = [
  { value: 'text', label: '单行文本' },
  { value: 'switch', label: '是否' },
  { value: 'number', label: '整数' },
  { value: 'digit', label: '小数' },
  { value: 'select', label: '选项' },
];

const rows = ref([]);
const loading = ref(false);
const saving = ref(false);
const snapshotIds = ref([]);

const listFields = ref([
  { field: 'options', type: 'combobox', label: '选项列表', span: 10, attrs: { multiple: true, placeholder: '输入选项后按回车新增' } },
  { field: 'sort', type: 'number', label: '排序', span: 4, attrs: { hint: '升序排列' } },
  { field: 'required', type: 'switch', label: '必填', span: 8 },
]);

const listColumns = ref([
  { field: 'id', title: 'ID', width: 60 },
  { field: 'name', title: '名称', minWidth: 140, slots: { default: 'default_name' } },
  { field: 'type', title: '类型', width: 110, slots: { default: 'default_type' } },
  { field: 'options', title: '选项', minWidth: 140 },
  { field: 'sort', title: '排序', width: 60 },
  { field: 'required', title: '必填', width: 70 },
  { field: 'rules', title: '校验规则', width: 100, slots: { default: 'default_rules' } },
]);

async function loadFields() {
  if (!props.ruleCategoryId) return;
  loading.value = true;
  try {
    const { data } = await new Resource('fields').list({
      per_page: 'all',
      rule_category_id: props.ruleCategoryId,
    });
    rows.value = (data || []).map((f) => ({ ...f }));
    snapshotIds.value = rows.value.map((r) => r.id).filter(Boolean);
  } finally {
    loading.value = false;
  }
}

function addRow() {
  rows.value.push({ type: 'text', required: true, sort: rows.value.length + 1, options: [] });
}

async function saveFields() {
  if (saving.value) return;
  for (const row of rows.value) {
    if (!row.name || !row.type) {
      message.error('每行需填写名称和字段类型');
      return;
    }
    if (row.type === 'select' && (!row.options || !row.options.length)) {
      message.error(`字段「${row.name}」类型为选项时，选项列表不能为空`);
      return;
    }
  }

  saving.value = true;
  try {
    const api = new Resource('fields');
    const currentIds = rows.value.map((r) => r.id).filter(Boolean);
    const removedIds = snapshotIds.value.filter((id) => !currentIds.includes(id));

    const tasks = [];
    for (const id of removedIds) tasks.push(api.destroy(id));
    for (const row of rows.value) {
      const payload = {
        name: row.name,
        type: row.type,
        hint: row.hint,
        placeholder: row.placeholder,
        options: row.options,
        sort: row.sort || 0,
        required: row.required ? 1 : 0,
        failed_proof: row.failed_proof ? 1 : 0,
        rule_category_id: props.ruleCategoryId,
      };
      tasks.push(row.id ? api.update(row.id, payload) : api.store(payload));
    }
    await Promise.all(tasks);
    message.success('字段已保存');
    await loadFields();
  } catch {
    message.error('字段保存失败');
  } finally {
    saving.value = false;
  }
}

// ---- 校验规则弹窗（field-rules）----
const ruleDialog = ref(false);
const ruleField = ref(null);
const ruleRows = ref([]);
const ruleSnapshot = ref([]);
const ruleSaving = ref(false);

const ruleTypeOptions = [
  { value: 'range', label: '范围' },
  { value: 'min', label: '最小值' },
  { value: 'max', label: '最大值' },
  { value: 'eq', label: '等于' },
];
const levelOptions = [
  { value: 1, label: '错误' },
  { value: 2, label: '警告' },
];

const ruleListFields = ref([
  { field: 'type', type: 'select', label: '类型', span: 6, required: true, attrs: { options: ruleTypeOptions } },
  { field: 'value', type: 'text', label: '比对值', span: 6, required: true },
  { field: 'level', type: 'select', label: '级别', span: 6, required: true, attrs: { options: levelOptions } },
  { field: 'message', type: 'text', label: '不通过提示', span: 10, required: true },
]);

const ruleColumns = ref([
  { field: 'id', title: 'ID', width: 60 },
  { field: 'type', title: '类型', width: 100 },
  { field: 'value', title: '比对值', width: 100 },
  { field: 'level', title: '级别', width: 80 },
  { field: 'message', title: '错误提示', minWidth: 160 },
]);

async function openRuleDialog(row) {
  if (!row.id) {
    message.warning('请先保存字段后再配置校验规则');
    return;
  }
  ruleField.value = row;
  const { data } = await new Resource('field-rules').list({
    per_page: 'all',
    field_id: row.id,
    rule_id: props.ruleId,
  });
  ruleRows.value = (data || []).map((r) => ({ ...r }));
  ruleSnapshot.value = ruleRows.value.map((r) => r.id).filter(Boolean);
  ruleDialog.value = true;
}

function addRuleRow() {
  ruleRows.value.push({ type: 'min', level: 1 });
}

async function saveRules() {
  if (ruleSaving.value) return;
  for (const r of ruleRows.value) {
    if (!r.type || !r.level || !r.message) {
      message.error('每行需填写类型、级别和不通过提示');
      return;
    }
    if (!r.value && r.value !== 0) {
      message.error('比对值不能为空');
      return;
    }
  }
  ruleSaving.value = true;
  try {
    const api = new Resource('field-rules');
    const currentIds = ruleRows.value.map((r) => r.id).filter(Boolean);
    const removedIds = ruleSnapshot.value.filter((id) => !currentIds.includes(id));

    const tasks = [];
    for (const id of removedIds) tasks.push(api.destroy(id));
    for (const r of ruleRows.value) {
      const payload = {
        type: r.type,
        value: r.value,
        level: r.level,
        message: r.message,
        field_id: ruleField.value.id,
        rule_id: props.ruleId,
      };
      tasks.push(r.id ? api.update(r.id, payload) : api.store(payload));
    }
    await Promise.all(tasks);
    message.success('校验规则已保存');
    ruleDialog.value = false;
  } catch {
    message.error('校验规则保存失败');
  } finally {
    ruleSaving.value = false;
  }
}

onMounted(loadFields);
</script>

<template>
  <div class="rounded border p-3">
    <div class="mb-2 flex items-center justify-between">
      <div class="text-sm font-semibold text-gray-500">字段列表</div>
      <div class="space-x-2">
        <Button size="small" @click="addRow">+ 新增字段</Button>
        <Button size="small" type="primary" :loading="saving" @click="saveFields">保存字段</Button>
      </div>
    </div>

    <AppList
      v-model="rows"
      :options="{ columns: listColumns, showFooter: false }"
      :fields="listFields"
      :loading="loading"
      :show-delete="true"
      :show-edit="false"
      row-key="id"
      height="240"
    >
      <template #default_name="{ row, rowIndex }">
        <input
          v-model="row.name"
          placeholder="字段名称"
          class="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </template>
      <template #default_type="{ row, rowIndex }">
        <Select v-model:value="row.type" :options="typeOptions" size="small" style="width: 100%" />
      </template>
      <template #default_rules="{ row, rowIndex }">
        <Button type="link" size="small" class="p-0" @click="openRuleDialog(row)">校验规则</Button>
      </template>
    </AppList>

    <!-- 校验规则弹窗 -->
    <Modal
      v-model:open="ruleDialog"
      :title="`校验规则 - ${ruleField?.name || ''}`"
      ok-text="保存"
      cancel-text="关闭"
      width="760px"
      :confirm-loading="ruleSaving"
      @ok="saveRules"
    >
      <div class="mb-2 flex justify-end">
        <Button size="small" @click="addRuleRow">+ 新增规则</Button>
      </div>
      <AppList
        v-model="ruleRows"
        :options="{ columns: ruleColumns, showFooter: false }"
        :fields="ruleListFields"
        :show-delete="true"
        :show-edit="false"
        row-key="id"
        height="260"
      />
      <div class="mt-2 text-xs text-gray-400">警告（级别 2）可以提交，错误（级别 1）无法提交</div>
    </Modal>
  </div>
</template>
