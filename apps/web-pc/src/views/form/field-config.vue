<script setup>
import { onMounted, ref } from 'vue';

import { Alert, Button, message, Modal, Select, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppList from '#/components/AppList.vue';

// P3-V04 配置端合并：字段→校验规则一站配置（读写 field_schemas 单一事实源）。
// 旧链路（categories(rule)/rules/field-rules）不再承担配置生效职责，本页为唯一合法写入口。

// ---- 表单选择 ----
const forms = ref([]);
const formId = ref(undefined);
async function loadForms() {
  const { data } = await new Resource('forms').list({ per_page: 'all' });
  forms.value = (data || []).map((f) => ({ value: f.id, label: f.name }));
}

// ---- 字段类型（与后端 Field 枚举一致）----
const typeOptions = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'switch', label: '是否' },
  { value: 'number', label: '数字' },
  { value: 'select', label: '选项' },
  { value: 'list', label: '列表' },
  { value: 'stakeholder', label: '相关单位' },
  { value: 'construction', label: '施工单位' },
  { value: 'unit_project', label: '单位工程' },
  { value: 'unit_project_code', label: '单位工程编号' },
  { value: 'date', label: '日期' },
  { value: 'time', label: '时间（不带日期）' },
  { value: 'datetime', label: '时间（带日期）' },
  { value: 'image', label: '单图片' },
  { value: 'images', label: '多图片' },
  { value: 'file', label: '文件' },
  { value: 'video', label: '视频' },
];

const rows = ref([]);
const loading = ref(false);
const saving = ref(false);
const snapshotIds = ref([]);

const listFields = ref([
  {
    field: 'options',
    type: 'combobox',
    label: '选项列表',
    span: 10,
    attrs: { multiple: true, placeholder: '输入选项后按回车新增' },
  },
  {
    field: 'sort',
    type: 'number',
    label: '排序',
    span: 4,
    attrs: { hint: '升序排列' },
  },
  { field: 'required', type: 'switch', label: '必填', span: 4 },
  { field: 'failed_proof', type: 'switch', label: '不通过时上传证明', span: 8 },
]);

const listColumns = ref([
  { field: 'id', title: 'ID', width: 60 },
  {
    field: 'name',
    title: '名称',
    minWidth: 140,
    slots: { default: 'default_name' },
  },
  {
    field: 'type',
    title: '类型',
    width: 110,
    slots: { default: 'default_type' },
  },
  { field: 'options', title: '选项', minWidth: 160 },
  { field: 'sort', title: '排序', width: 60 },
  { field: 'required', title: '必填', width: 70 },
  {
    field: 'rules',
    title: '校验规则',
    width: 170,
    slots: { default: 'default_rules' },
  },
]);

// 该字段全部 field_schemas 行（含项目覆盖 scope），按 field_id 分组
const schemaByField = ref({});

async function loadFields() {
  if (!formId.value) {
    rows.value = [];
    schemaByField.value = {};
    return;
  }
  loading.value = true;
  try {
    const [fres, sres] = await Promise.all([
      new Resource('fields').list({ per_page: 'all', form_id: formId.value }),
      new Resource('field-schemas').list({
        per_page: 'all',
        form_id: formId.value,
      }),
    ]);
    rows.value = (fres.data || []).map((f) => ({ ...f }));
    snapshotIds.value = rows.value.map((r) => r.id).filter(Boolean);
    schemaByField.value = {};
    for (const s of sres.data || []) {
      if (!schemaByField.value[s.field_id])
        schemaByField.value[s.field_id] = [];
      schemaByField.value[s.field_id].push(s);
    }
  } finally {
    loading.value = false;
  }
}

function addRow() {
  rows.value.push({
    type: 'text',
    required: true,
    sort: rows.value.length + 1,
    options: [],
  });
}

async function saveFields() {
  if (saving.value) return;
  for (const row of rows.value) {
    if (!row.name || !row.type) {
      message.error('每行需填写名称和字段类型');
      return;
    }
    if (row.type === 'select' && (!row.options || row.options.length === 0)) {
      message.error(`字段「${row.name}」类型为选项时，选项列表不能为空`);
      return;
    }
  }

  saving.value = true;
  try {
    const api = new Resource('fields');
    const currentIds = new Set(rows.value.map((r) => r.id).filter(Boolean));
    const removedIds = snapshotIds.value.filter((id) => !currentIds.has(id));

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
      };
      tasks.push(
        row.id
          ? api.update(row.id, payload)
          : api.store({ ...payload, form_id: formId.value }),
      );
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

// ---- 校验规则弹窗（读写 field-schemas）----
const ruleDialog = ref(false);
const ruleField = ref(null);
const ruleRows = ref([]);
const ruleScopeRows = ref([]);
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
  {
    field: 'type',
    type: 'select',
    label: '类型',
    span: 5,
    required: true,
    attrs: { options: ruleTypeOptions },
  },
  { field: 'value', type: 'text', label: '比对值', span: 5, required: true },
  {
    field: 'level',
    type: 'select',
    label: '级别',
    span: 5,
    required: true,
    attrs: { options: levelOptions },
  },
  { field: 'failed_proof', type: 'switch', label: '需证明', span: 5 },
  {
    field: 'message',
    type: 'text',
    label: '不通过提示',
    span: 14,
    required: true,
  },
]);

const ruleColumns = ref([
  { field: 'type', title: '类型', width: 90 },
  { field: 'value', title: '比对值', width: 90 },
  { field: 'level', title: '级别', width: 70 },
  { field: 'failed_proof', title: '需证明', width: 80 },
  { field: 'message', title: '不通过提示', minWidth: 160 },
]);

async function openRuleDialog(row) {
  ruleField.value = row;
  const scopes = schemaByField.value[row.id] || [];
  const global = scopes.find((s) => s.applicable_scope === 'global');
  ruleRows.value = (global?.rule_payload || []).map((r) => ({ ...r }));
  ruleScopeRows.value = scopes.filter((s) => s.applicable_scope !== 'global');
  ruleDialog.value = true;
}

function addRuleRow() {
  ruleRows.value.push({ type: 'min', level: 1, failed_proof: false });
}

// 规范库降级为"规则来源"：从已绑定该规范的字段复制 rule_payload（跨表单复制）
const standardOptions = ref([]);
async function loadStandards() {
  const { data } = await new Resource('rules').list({ per_page: 'all' });
  standardOptions.value = (data || []).map((r) => ({
    value: r.id,
    label: `${r.name}${r.project?.name ? `（${r.project.name}）` : ''}`,
  }));
}

async function applyStandard(ruleId) {
  if (!ruleId) return;
  const { data } = await new Resource('field-schemas').list({
    per_page: 'all',
    standard_binding_id: ruleId,
  });
  const src = data?.[0];
  if (!src?.rule_payload?.length) {
    message.warning('该规范暂无已配置字段，无可复制内容');
    return;
  }
  ruleRows.value = src.rule_payload.map((r) => ({ ...r }));
  message.success('已从规则来源复制，保存后生效');
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
    const api = new Resource('field-schemas');
    const payload = {
      rule_payload: ruleRows.value,
      applicable_scope: 'global',
    };
    const scopes = schemaByField.value[ruleField.value.id] || [];
    const global = scopes.find((s) => s.applicable_scope === 'global');
    const saveOp = global
      ? api.update(global.id, payload)
      : api.store({
          ...payload,
          form_id: formId.value,
          field_id: ruleField.value.id,
        });
    await saveOp;
    message.success('校验规则已保存');
    ruleDialog.value = false;
    await loadFields();
  } catch {
    message.error('校验规则保存失败');
  } finally {
    ruleSaving.value = false;
  }
}

async function removeScope(row) {
  await new Resource('field-schemas').destroy(row.id);
  message.success('已移除项目覆盖，全局规则恢复生效');
  ruleScopeRows.value = ruleScopeRows.value.filter((s) => s.id !== row.id);
  await loadFields();
}

onMounted(async () => {
  await loadForms();
  await loadStandards();
});
</script>

<template>
  <div class="p-4">
    <Alert
      type="info"
      show-icon
      class="mb-3"
      message="字段与校验规则一站配置（P3-V04）"
      description="校验规则保存后立即生效（含移动端/PC 提交校验）。旧的标准库分类/规范规则页面仅保留历史数据，不再承担配置职责。"
    />

    <div class="mb-3 flex items-center gap-3">
      <span class="text-sm font-semibold text-gray-600">选择表单</span>
      <Select
        v-model:value="formId"
        :options="forms"
        placeholder="请选择表单"
        style="width: 320px"
        show-search
        option-filter-prop="label"
        allow-clear
        @change="loadFields"
      />
    </div>

    <div v-if="formId" class="rounded border p-3">
      <div class="mb-2 flex items-center justify-between">
        <div class="text-sm font-semibold text-gray-500">
          字段列表（{{ rows.length }}）
        </div>
        <div class="space-x-2">
          <Button size="small" @click="addRow">+ 新增字段</Button>
          <Button
            size="small"
            type="primary"
            :loading="saving"
            @click="saveFields"
          >
            保存字段
          </Button>
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
        height="480"
      >
        <template #default_name="{ row }">
          <input
            v-model="row.name"
            placeholder="字段名称"
            class="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </template>
        <template #default_type="{ row }">
          <Select
            v-model:value="row.type"
            :options="typeOptions"
            size="small"
            style="width: 100%"
          />
        </template>
        <template #default_rules="{ row }">
          <div class="flex items-center gap-1">
            <Button
              type="link"
              size="small"
              class="p-0"
              @click="openRuleDialog(row)"
            >
              配置
            </Button>
            <template v-for="s in schemaByField[row.id] || []" :key="s.id">
              <Tag
                v-if="s.applicable_scope === 'global' && s.rule_payload?.length"
                color="blue"
              >
                {{ s.rule_payload.length }} 条
              </Tag>
              <Tag v-else-if="s.applicable_scope !== 'global'" color="orange">
                项目覆盖 {{ s.rule_payload?.length || 0 }} 条
              </Tag>
            </template>
          </div>
        </template>
      </AppList>
    </div>

    <!-- 校验规则弹窗 -->
    <Modal
      v-model:open="ruleDialog"
      :title="`校验规则 - ${ruleField?.name || ''}`"
      ok-text="保存"
      cancel-text="关闭"
      width="860px"
      :confirm-loading="ruleSaving"
      @ok="saveRules"
    >
      <div class="mb-2 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-500">从规则来源复制：</span>
          <Select
            :options="standardOptions"
            placeholder="选择规范规则"
            style="width: 260px"
            show-search
            option-filter-prop="label"
            allow-clear
            @change="applyStandard"
          />
        </div>
        <Button size="small" @click="addRuleRow">+ 新增规则</Button>
      </div>
      <AppList
        v-model="ruleRows"
        :options="{ columns: ruleColumns, showFooter: false }"
        :fields="ruleListFields"
        :show-delete="true"
        :show-edit="false"
        row-key="id"
        height="240"
      />
      <div v-if="ruleScopeRows.length" class="mt-2">
        <div class="text-xs font-semibold text-gray-500 mb-1">
          项目级覆盖（优先级高于全局，运行期对指定项目生效）
        </div>
        <div
          v-for="s in ruleScopeRows"
          :key="s.id"
          class="mb-1 flex items-center justify-between rounded border px-2 py-1 text-xs"
        >
          <span>
            <Tag color="orange">{{ s.applicable_scope }}</Tag>
            {{ s.rule_payload?.length || 0 }} 条规则
          </span>
          <Button
            type="link"
            size="small"
            class="p-0 text-red-500"
            @click="removeScope(s)"
          >
            移除覆盖
          </Button>
        </div>
      </div>
      <div class="mt-2 text-xs text-gray-400">
        警告（级别 2）可以提交，错误（级别
        1）无法提交；「需证明」的规则命中时要求上传现场证明。
      </div>
    </Modal>
  </div>
</template>
