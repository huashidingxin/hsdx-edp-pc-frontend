<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Switch,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'antdv-next';

import Resource from '#/api/resource';
import AppList from '#/components/AppList.vue';

import FormTemplateList from './form-template-list.vue';

// P3-V06 合并页：左侧表单列表（新增/编辑/选中），右侧当前表单字段配置（属性/校验规则/删除）。
// 布局：Page 包裹、左右两栏均铺满高度。

const route = useRoute();

// ================= 左栏：表单列表 =================
const forms = ref([]);
const keyword = ref('');
const formId = ref(undefined);

const typeDescMap = { 1: '通用', 2: '任务', 3: '日志', 4: '文档' };
const formTypeOptions = [
  { value: 1, label: '通用' },
  { value: 2, label: '任务' },
  { value: 3, label: '日志' },
  { value: 4, label: '文档' },
];

const categoryOptions = ref([]);
async function loadCategories() {
  const { data } = await new Resource('categories').list({
    per_page: 'all',
    type: 'project',
  });
  categoryOptions.value = (data || []).map((c) => ({
    value: c.id,
    label: c.name,
  }));
}

async function loadForms() {
  const { data } = await new Resource('forms').list({ per_page: 'all' });
  forms.value = (data || []).map((f) => ({
    value: f.id,
    label: f.name,
    type_desc: f.type_desc || typeDescMap[f.type] || '通用',
    _raw: f,
  }));
}

const filteredForms = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return forms.value;
  return forms.value.filter((f) => f.label.toLowerCase().includes(kw));
});

function selectForm(id) {
  // 仅本地切换，不路由跳转（避免 vben 标签页按 query 区分而新开页面）
  formId.value = id;
  loadFields();
}

// ================= 表单新增/编辑弹窗 =================
const formModal = ref({
  open: false,
  id: null,
  name: '',
  type: 2,
  project_category_id: undefined,
  saving: false,
});

// 文档表单（type=4）填写频率设置
const frequencyOptions = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
  { value: 'start', label: '项目开始' },
  { value: 'end', label: '项目结束' },
];
const weekDayOptions = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 0, label: '周日' },
];
const dayIndexOptions = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}日`,
}));
const formSetting = ref({
  frequency: 'monthly',
  interval: 1,
  day_index: 25,
  deadline_time: '20:00:00',
});

function openFormCreate() {
  formModal.value = {
    open: true,
    id: null,
    name: '',
    type: 2,
    project_category_id: undefined,
    saving: false,
  };
  formSetting.value = {
    frequency: 'monthly',
    interval: 1,
    day_index: 25,
    deadline_time: '20:00:00',
  };
}

function openFormEdit(row) {
  const detail = row._raw || {};
  formModal.value = {
    open: true,
    id: row.id,
    name: detail.name || row.label || '',
    type: detail.type || 2,
    project_category_id: detail.project_category_id,
    saving: false,
  };
  formSetting.value = detail.setting
    ? {
        frequency: detail.setting.frequency || 'monthly',
        interval: detail.setting.interval || 1,
        day_index: detail.setting.day_index || 25,
        deadline_time: detail.setting.deadline_time || '20:00:00',
      }
    : {
        frequency: 'monthly',
        interval: 1,
        day_index: 25,
        deadline_time: '20:00:00',
      };
}

async function saveForm() {
  const m = formModal.value;
  if (!m.name.trim()) {
    message.error('请填写表单名称');
    return;
  }
  if (!m.type) {
    message.error('请选择表单类型');
    return;
  }
  m.saving = true;
  try {
    const api = new Resource('forms');
    const payload = {
      name: m.name.trim(),
      type: m.type,
      project_category_id: m.project_category_id,
    };
    if (m.type === 4) payload.setting = formSetting.value;
    if (m.id) {
      await api.update(m.id, payload);
      message.success('表单已保存');
    } else {
      const res = await api.store(payload);
      m.id = res?.data?.id || res?.id || m.id;
      message.success('表单已创建');
    }
    formModal.value.open = false;
    await loadForms();
    if (m.id) selectForm(m.id);
  } catch (error) {
    const msg = error?.response?.data?.message || error?.message;
    message.error(typeof msg === 'string' && msg ? msg : '表单保存失败');
  } finally {
    m.saving = false;
  }
}

// ================= 右栏：字段配置 =================
// 字段类型（与后端 Field 枚举一致）
const fieldTypeOptions = [
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
const fieldTypeLabel = (t) =>
  fieldTypeOptions.find((o) => o.value === t)?.label || t || '-';

const rows = ref([]);
const loading = ref(false);
const schemaByField = ref({});

const columns = [
  { title: '名称', dataIndex: 'name', key: 'name', minWidth: 180 },
  { title: '类型', dataIndex: 'type', key: 'type', width: 130 },
  { title: '必填', dataIndex: 'required', key: 'required', width: 70 },
  {
    title: '全局规则',
    dataIndex: 'globalCount',
    key: 'globalCount',
    width: 90,
  },
  { title: '项目覆盖', dataIndex: 'scopeCount', key: 'scopeCount', width: 100 },
  { title: '排序', dataIndex: 'sort', key: 'sort', width: 70 },
  { title: '操作', key: 'action', width: 190 },
];

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
    schemaByField.value = {};
    for (const s of sres.data || []) {
      if (!schemaByField.value[s.field_id])
        schemaByField.value[s.field_id] = [];
      schemaByField.value[s.field_id].push(s);
    }
    rows.value = (fres.data || []).map((f) => ({
      ...f,
      globalCount:
        (schemaByField.value[f.id] || []).find(
          (s) => s.applicable_scope === 'global',
        )?.rule_payload?.length || 0,
      scopeCount: (schemaByField.value[f.id] || []).filter(
        (s) => s.applicable_scope !== 'global',
      ).length,
    }));
  } finally {
    loading.value = false;
  }
}

// 字段新增/编辑弹窗
const fieldModal = ref({
  open: false,
  id: null,
  name: '',
  type: 'text',
  options: [],
  sort: 0,
  required: true,
  failed_proof: false,
  hint: '',
  placeholder: '',
  saving: false,
});

function openFieldCreate() {
  fieldModal.value = {
    open: true,
    id: null,
    name: '',
    type: 'text',
    options: [],
    sort: rows.value.length + 1,
    required: true,
    failed_proof: false,
    hint: '',
    placeholder: '',
    saving: false,
  };
}

function openFieldEdit(row) {
  fieldModal.value = {
    open: true,
    id: row.id,
    name: row.name || '',
    type: row.type || 'text',
    options: Array.isArray(row.options) ? [...row.options] : [],
    sort: row.sort || 0,
    required: !!row.required,
    failed_proof: !!row.failed_proof,
    hint: row.hint || '',
    placeholder: row.placeholder || '',
    saving: false,
  };
}

async function saveField() {
  const m = fieldModal.value;
  if (!m.name.trim()) {
    message.error('请填写字段名称');
    return;
  }
  if (!m.type) {
    message.error('请选择字段类型');
    return;
  }
  if (m.type === 'select' && (!m.options || m.options.length === 0)) {
    message.error('字段类型为「选项」时，选项列表不能为空');
    return;
  }
  m.saving = true;
  try {
    const api = new Resource('fields');
    const payload = {
      name: m.name.trim(),
      type: m.type,
      hint: m.hint,
      placeholder: m.placeholder,
      options: m.options,
      sort: m.sort || 0,
      required: m.required ? 1 : 0,
      failed_proof: m.failed_proof ? 1 : 0,
    };
    if (m.id) {
      await api.update(m.id, payload);
      message.success('字段已保存');
    } else {
      await api.store({ ...payload, form_id: formId.value });
      message.success('字段已创建');
    }
    fieldModal.value.open = false;
    await loadFields();
  } catch (error) {
    const msg = error?.response?.data?.message || error?.message;
    message.error(typeof msg === 'string' && msg ? msg : '字段保存失败');
  } finally {
    m.saving = false;
  }
}

async function removeField(row) {
  try {
    await new Resource('fields').destroy(row.id);
    message.success(`字段「${row.name}」已删除（含其校验规则）`);
    await loadFields();
  } catch (error) {
    const msg = error?.response?.data?.message || error?.message;
    message.error(typeof msg === 'string' && msg ? msg : '字段删除失败');
  }
}

// 校验规则弹窗（读写 field-schemas）
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

// 从已绑定该规范的字段复制 rule_payload（跨表单复制）
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
  message.success('已从规范规则复制，保存后生效');
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
  await Promise.all([loadCategories(), loadForms(), loadStandards()]);
  const q = Number(route.query.form_id);
  if (q) {
    formId.value = q;
    await loadFields();
  }
});
</script>

<template>
  <Page auto-content-height>
    <div class="flex h-full gap-3">
      <!-- 左栏：表单列表 -->
      <div
        class="flex w-80 shrink-0 flex-col overflow-hidden rounded border bg-card"
      >
        <div class="flex gap-2 border-b p-2">
          <Input
            v-model:value="keyword"
            placeholder="搜索表单名称"
            allow-clear
            class="flex-1"
          />
          <Button type="primary" @click="openFormCreate">+ 新增</Button>
        </div>
        <div class="flex-1 overflow-y-auto">
          <div
            v-for="f in filteredForms"
            :key="f.value"
            class="flex cursor-pointer items-center border-b px-3 py-2 transition-colors hover:bg-gray-50"
            :class="formId === f.value ? 'bg-blue-50' : ''"
            @click="selectForm(f.value)"
          >
            <span class="min-w-0 flex-1 truncate text-sm">{{ f.label }}</span>
            <Tag color="blue" class="shrink-0">{{ f.type_desc }}</Tag>
            <Button
              type="link"
              size="small"
              class="shrink-0 p-0 pl-1"
              @click.stop="openFormEdit(f)"
            >
              编辑
            </Button>
          </div>
          <div
            v-if="!filteredForms.length"
            class="px-3 py-6 text-center text-sm text-gray-400"
          >
            无匹配表单
          </div>
        </div>
      </div>

      <!-- 右栏：字段配置 -->
      <div
        class="flex min-w-0 flex-1 flex-col overflow-hidden rounded border bg-card"
      >
        <div
          v-if="!formId"
          class="flex flex-1 items-center justify-center text-sm text-gray-400"
        >
          请先在左侧选择表单（或点击「+ 新增」创建）
        </div>

        <template v-else>
          <div class="flex items-center justify-between border-b px-3 py-2">
            <div class="text-sm font-semibold text-gray-500">
              字段列表（{{ rows.length }}）
            </div>
            <Button type="primary" size="small" @click="openFieldCreate">
              + 新增字段
            </Button>
          </div>
          <div class="flex-1 overflow-auto">
            <Table
              :columns="columns"
              :data-source="rows"
              :loading="loading"
              :pagination="false"
              row-key="id"
              size="small"
              :scroll="{ y: '100%' }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'type'">
                  <span>{{ fieldTypeLabel(record.type) }}</span>
                </template>
                <template v-else-if="column.key === 'required'">
                  <span>{{ record.required ? '是' : '否' }}</span>
                </template>
                <template v-else-if="column.key === 'globalCount'">
                  <Tag v-if="record.globalCount" color="blue">
                    {{ record.globalCount }} 条
                  </Tag>
                  <span v-else class="text-gray-400">无</span>
                </template>
                <template v-else-if="column.key === 'scopeCount'">
                  <Tag v-if="record.scopeCount" color="orange">
                    {{ record.scopeCount }} 项
                  </Tag>
                  <span v-else class="text-gray-400">无</span>
                </template>
                <template v-else-if="column.key === 'action'">
                  <div class="flex items-center gap-1">
                    <Button
                      type="link"
                      size="small"
                      class="p-0"
                      @click="openFieldEdit(record)"
                    >
                      编辑
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      class="p-0"
                      @click="openRuleDialog(record)"
                    >
                      校验规则
                    </Button>
                    <Popconfirm
                      :title="`确定删除字段「${record.name}」？`"
                      description="其校验规则（含项目覆盖）将一并删除"
                      ok-text="删除"
                      cancel-text="取消"
                      @confirm="removeField(record)"
                    >
                      <Button type="link" size="small" danger class="p-0">
                        删除
                      </Button>
                    </Popconfirm>
                  </div>
                </template>
              </template>
            </Table>
          </div>
        </template>
      </div>
    </div>

    <!-- 表单新增/编辑弹窗 -->
    <Modal
      v-model:open="formModal.open"
      :title="formModal.id ? `编辑表单 - ${formModal.name}` : '新增表单'"
      ok-text="保存"
      cancel-text="取消"
      width="920px"
      :confirm-loading="formModal.saving"
      @ok="saveForm"
    >
      <Tabs default-active-key="basic">
        <TabPane key="basic" tab="基础信息">
          <div class="grid grid-cols-12 gap-4">
            <div class="col-span-12">
              <label class="config-label">表单名称 *</label>
              <Input v-model:value="formModal.name" placeholder="表单名称" />
            </div>
            <div class="col-span-6">
              <label class="config-label">表单类型 *</label>
              <Select
                v-model:value="formModal.type"
                :options="formTypeOptions"
                style="width: 100%"
              />
            </div>
            <div class="col-span-6">
              <label class="config-label">项目分类</label>
              <Select
                v-model:value="formModal.project_category_id"
                :options="categoryOptions"
                style="width: 100%"
                allow-clear
                placeholder="不指定"
              />
            </div>
            <template v-if="formModal.type === 4">
              <div class="col-span-3">
                <label class="config-label">填写频率</label>
                <Select
                  v-model:value="formSetting.frequency"
                  :options="frequencyOptions"
                  style="width: 100%"
                />
              </div>
              <div v-if="formSetting.frequency === 'weekly'" class="col-span-3">
                <label class="config-label">星期</label>
                <Select
                  v-model:value="formSetting.day_index"
                  :options="weekDayOptions"
                  style="width: 100%"
                />
              </div>
              <div
                v-if="
                  formSetting.frequency === 'monthly' ||
                  formSetting.frequency === 'yearly'
                "
                class="col-span-3"
              >
                <label class="config-label">截止日期</label>
                <Select
                  v-model:value="formSetting.day_index"
                  :options="dayIndexOptions"
                  style="width: 100%"
                />
              </div>
              <div
                v-if="
                  formSetting.frequency !== 'start' &&
                  formSetting.frequency !== 'end'
                "
                class="col-span-3"
              >
                <label class="config-label">截止时间</label>
                <input
                  v-model="formSetting.deadline_time"
                  type="time"
                  class="w-full rounded border border-gray-300 px-2 py-1"
                />
              </div>
            </template>
          </div>
        </TabPane>
        <TabPane key="templates" tab="打印模板" :disabled="!formModal.id">
          <Alert
            v-if="!formModal.id"
            type="info"
            show-icon
            class="mb-2"
            message="保存表单后可配置打印模板"
          />
          <FormTemplateList
            v-else
            :form-id="formModal.id"
            :type="formModal.type"
          />
        </TabPane>
      </Tabs>
    </Modal>

    <!-- 字段新增/编辑弹窗 -->
    <Modal
      v-model:open="fieldModal.open"
      :title="fieldModal.id ? `编辑字段 - ${fieldModal.name}` : '新增字段'"
      ok-text="保存"
      cancel-text="取消"
      width="560px"
      :confirm-loading="fieldModal.saving"
      @ok="saveField"
    >
      <div class="grid grid-cols-12 gap-4">
        <div class="col-span-12">
          <label class="config-label">字段名称 *</label>
          <Input v-model:value="fieldModal.name" placeholder="字段名称" />
        </div>
        <div class="col-span-6">
          <label class="config-label">字段类型 *</label>
          <Select
            v-model:value="fieldModal.type"
            :options="fieldTypeOptions"
            style="width: 100%"
          />
        </div>
        <div class="col-span-3">
          <label class="config-label">排序</label>
          <InputNumber
            v-model:value="fieldModal.sort"
            :min="0"
            style="width: 100%"
          />
        </div>
        <div class="col-span-3">
          <label class="config-label">必填</label>
          <div class="pt-1">
            <Switch v-model:checked="fieldModal.required" />
          </div>
        </div>
        <div v-if="fieldModal.type === 'select'" class="col-span-12">
          <label class="config-label">选项列表 *（输入后回车新增）</label>
          <Select
            v-model:value="fieldModal.options"
            mode="tags"
            placeholder="输入选项后回车"
            style="width: 100%"
            :open="false"
          />
        </div>
        <div class="col-span-12">
          <label class="config-label">不通过时上传证明</label>
          <div class="pt-1">
            <Switch v-model:checked="fieldModal.failed_proof" />
          </div>
        </div>
        <div class="col-span-6">
          <label class="config-label">填写提示（hint）</label>
          <Input v-model:value="fieldModal.hint" placeholder="填写提示" />
        </div>
        <div class="col-span-6">
          <label class="config-label">占位文案</label>
          <Input
            v-model:value="fieldModal.placeholder"
            placeholder="占位文案"
          />
        </div>
      </div>
    </Modal>

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
          <span class="text-sm text-gray-500">从规范规则复制：</span>
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
        <div class="mb-1 text-xs font-semibold text-gray-500">
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
  </Page>
</template>

<style scoped>
.config-label {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  color: rgb(107 114 128);
}
</style>
