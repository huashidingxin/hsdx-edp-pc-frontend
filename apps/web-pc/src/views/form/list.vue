<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Popover,
  Select,
  Switch,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'antdv-next';

import Resource from '#/api/resource';
import AppList from '#/components/AppList.vue';
import { useAppStore } from '#/store';

import FormTemplateList from './form-template-list.vue';

// P3-V06 合并页：左侧表单列表（新增/编辑/选中），右侧当前表单字段配置（属性/校验规则/删除）。
// 布局：Page 包裹、左右两栏均铺满高度。

const route = useRoute();
const userStore = useUserStore();
const appStore = useAppStore();

// P3-V09：通用规范（不指定项目）仅管理员可创建；非管理员新建规范强制归属当前项目
const isAdmin = computed(() => !!userStore.userInfo?.is_admin);

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

// 分页与筛选状态
const perPage = 20;
const currentPage = ref(0);
const lastPage = ref(1);
const total = ref(0);
const loadingForms = ref(false);
const filterOpen = ref(false);
const filterType = ref(undefined);
const filterCategory = ref(undefined);
const filterHasRules = ref(undefined);

function buildFormParams(pageNo) {
  const params = { page: pageNo, per_page: perPage };
  const kw = keyword.value.trim();
  if (kw) params.name = kw;
  if (filterType.value !== undefined && filterType.value !== null) {
    params.type = filterType.value;
  }
  if (filterCategory.value !== undefined && filterCategory.value !== null) {
    params.project_category_id = filterCategory.value;
  }
  if (filterHasRules.value !== undefined && filterHasRules.value !== null) {
    params.has_rules = filterHasRules.value;
  }
  return params;
}

async function loadForms(reset = false) {
  if (loadingForms.value) return;
  if (reset) {
    forms.value = [];
    currentPage.value = 0;
    lastPage.value = 1;
    total.value = 0;
  }
  if (currentPage.value >= lastPage.value) return;
  const nextPage = currentPage.value + 1;
  loadingForms.value = true;
  try {
    const res = await new Resource('forms').list(buildFormParams(nextPage));
    const items = (res.data || []).map((f) => ({
      value: f.id,
      label: f.name,
      type_desc: f.type_desc || typeDescMap[f.type] || '通用',
      _raw: f,
    }));
    forms.value = reset ? items : [...forms.value, ...items];
    total.value = res.meta?.total ?? 0;
    lastPage.value = res.meta?.last_page ?? 1;
    currentPage.value = res.meta?.current_page ?? nextPage;
  } finally {
    loadingForms.value = false;
    // 内容未撑满容器（无滚动条）时继续补载，保证滚动分页始终可用
    ensureFilled();
  }
}

// 左栏列表滚动容器（用于检测是否已可滚动）
const formListRef = ref(null);

function ensureFilled() {
  const el = formListRef.value;
  if (!el || loadingForms.value || !hasMore.value) return;
  if (el.scrollHeight <= el.clientHeight) {
    loadForms(false);
  }
}

const hasMore = computed(() => currentPage.value < lastPage.value);

// 左栏滚动触底自动加载下一页
function onListScroll(e) {
  const el = e.target;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 60 && hasMore.value) {
    loadForms(false);
  }
}

// 关键词防抖（服务端过滤）
let keywordTimer = null;
watch(keyword, () => {
  clearTimeout(keywordTimer);
  keywordTimer = setTimeout(() => loadForms(true), 300);
});

function applyFilter() {
  filterOpen.value = false;
  loadForms(true);
}

const filterActive = computed(
  () =>
    filterType.value !== undefined ||
    filterCategory.value !== undefined ||
    filterHasRules.value !== undefined,
);

function resetFilter() {
  filterType.value = undefined;
  filterCategory.value = undefined;
  filterHasRules.value = undefined;
  filterOpen.value = false;
  loadForms(true);
}

function selectForm(id) {
  // 仅本地切换，不路由跳转（避免 vben 标签页按 query 区分而新开页面）
  formId.value = id;
  loadFields();
  loadFormRules();
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

// 展示用扁平行：顶层字段 + 列表字段的子字段（缩进紧随其后）
const tableRows = computed(() => {
  const childMap = {};
  for (const f of rows.value) {
    if (!f.parent_id) continue;
    childMap[f.parent_id] = childMap[f.parent_id] || [];
    childMap[f.parent_id].push(f);
  }
  const flat = [];
  for (const f of rows.value) {
    if (f.parent_id) continue;
    flat.push({ ...f, _indent: 0, _isChild: false });
    if (f.type === 'list' && childMap[f.id]?.length) {
      for (const c of childMap[f.id]) {
        flat.push({ ...c, _indent: 1, _isChild: true });
      }
    }
  }
  return flat;
});

// parentId -> 子字段列表（子字段管理弹窗用）
const childFieldsOf = (parentId) =>
  rows.value.filter((f) => String(f.parent_id) === String(parentId));

const columns = [
  { title: '名称', dataIndex: 'name', key: 'name', minWidth: 180 },
  { title: '类型', dataIndex: 'type', key: 'type', width: 130 },
  { title: '必填', dataIndex: 'required', key: 'required', width: 70 },
  {
    title: '规则数',
    dataIndex: 'ruleCount',
    key: 'ruleCount',
    width: 90,
  },
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
    rows.value = fres.data || [];
  } finally {
    loading.value = false;
  }
}

// 当前所选规范（或自定义）下该字段的条目数
function ruleCount(field) {
  const global = (schemaByField.value[field.id] || []).find(
    (s) => s.applicable_scope === 'global',
  );
  return (global?.rule_payload || []).filter(
    (r) => (r.rule_id ?? 0) === activeRuleId.value,
  ).length;
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
  parent_id: null,
  saving: false,
});

function openFieldCreate(parentId = null) {
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
    parent_id: parentId,
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
    parent_id: row.parent_id || null,
    saving: false,
  };
}

// ================= 列表字段子字段管理弹窗（P3-V10：可视化维护，替代填上级 ID） =================
const subFieldModal = ref({
  open: false,
  parentId: null,
  parentName: '',
  rows: [],
  saving: false,
});

const subFieldListFields = ref([
  {
    field: 'options',
    type: 'combobox',
    label: '选项列表',
    span: 10,
    attrs: { multiple: true, placeholder: '输入选项后按回车新增' },
  },
  { field: 'sort', type: 'number', label: '排序', span: 4 },
  { field: 'required', type: 'switch', label: '必填', span: 4 },
]);

const subFieldColumns = ref([
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
  { field: 'sort', title: '排序', width: 70 },
  { field: 'required', title: '必填', width: 70 },
]);

function openSubFieldDialog(listField) {
  subFieldModal.value = {
    open: true,
    parentId: listField.id,
    parentName: listField.name,
    rows: childFieldsOf(listField.id).map((c) => ({
      ...c,
      options: Array.isArray(c.options) ? [...c.options] : [],
    })),
    saving: false,
  };
}

function addSubFieldRow() {
  subFieldModal.value.rows.push({
    type: 'text',
    required: true,
    sort: subFieldModal.value.rows.length + 1,
    options: [],
  });
}

async function saveSubFields() {
  const m = subFieldModal.value;
  if (m.saving) return;
  for (const row of m.rows) {
    if (!row.name || !row.type) {
      message.error('每行需填写名称和字段类型');
      return;
    }
  }
  m.saving = true;
  try {
    const api = new Resource('fields');
    const currentIds = new Set(m.rows.map((r) => r.id).filter(Boolean));
    const removedIds = childFieldsOf(m.parentId)
      .map((c) => c.id)
      .filter((id) => !currentIds.has(id));
    const jobs = [];
    for (const id of removedIds) jobs.push(api.destroy(id));
    for (const row of m.rows) {
      const payload = {
        name: row.name,
        type: row.type,
        hint: row.hint,
        placeholder: row.placeholder,
        options: row.options,
        sort: row.sort || 0,
        required: row.required ? 1 : 0,
        failed_proof: row.failed_proof ? 1 : 0,
        parent_id: m.parentId,
        form_id: formId.value,
      };
      if (row.id) jobs.push(api.update(row.id, payload));
      else jobs.push(api.store(payload));
    }
    await Promise.all(jobs);
    message.success('子字段已保存');
    subFieldModal.value.open = false;
    await loadFields();
  } catch (error) {
    const msg = error?.response?.data?.message || error?.message;
    message.error(typeof msg === 'string' && msg ? msg : '子字段保存失败');
  } finally {
    m.saving = false;
  }
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
      parent_id: m.parent_id,
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
    // 列表字段：先删其子字段（避免孤儿），再删自身
    if (row.type === 'list') {
      const children = childFieldsOf(row.id);
      for (const c of children) {
        await new Resource('fields').destroy(c.id);
      }
      if (children.length > 0) {
        message.info(`已一并删除 ${children.length} 个子字段`);
      }
    }
    await new Resource('fields').destroy(row.id);
    message.success(`字段「${row.name}」已删除（含其校验规则）`);
    await loadFields();
  } catch (error) {
    const msg = error?.response?.data?.message || error?.message;
    message.error(typeof msg === 'string' && msg ? msg : '字段删除失败');
  }
}

// ================= 校验规范（P3-V08：表单拥有规范，右栏集中配置） =================
// activeRuleId：0 = 自定义规则（恒生效），>0 = 本表单的规范
const activeRuleId = ref(0);
const formRules = ref([]);
const ruleCategoryOptions = ref([]);

async function loadRuleCategories() {
  const { data } = await new Resource('categories').list({
    per_page: 'all',
    type: 'rule',
  });
  ruleCategoryOptions.value = (data || []).map((c) => ({
    value: c.id,
    label: c.name,
  }));
}

async function loadFormRules() {
  if (!formId.value) {
    formRules.value = [];
    activeRuleId.value = 0;
    return;
  }
  const { data } = await new Resource('rules').list({
    per_page: 'all',
    form_id: formId.value,
  });
  formRules.value = data || [];
  if (!formRules.value.some((r) => r.id === activeRuleId.value)) {
    activeRuleId.value = 0; // 规范被删除或切换表单后回到自定义
  }
}

const ruleSelectOptions = computed(() => [
  { value: 0, label: '自定义规则（恒生效）' },
  ...formRules.value.map((r) => ({
    value: r.id,
    label: r.status ? r.name : `${r.name}（已停用）`,
  })),
]);

// 规范新增/编辑弹窗（右栏新建 + 表单弹窗 Tab 共用；formId 来源不同）
const ruleModal = ref({
  open: false,
  id: null,
  name: '',
  category_id: undefined,
  formId: undefined,
  saving: false,
});

function openRuleCreate(sourceFormId) {
  ruleModal.value = {
    open: true,
    id: null,
    name: '',
    category_id: undefined,
    formId: sourceFormId,
    saving: false,
  };
}

function openRuleEdit(r, sourceFormId) {
  ruleModal.value = {
    open: true,
    id: r.id,
    name: r.name || '',
    category_id: r.category_id,
    formId: sourceFormId,
    saving: false,
  };
}

async function saveRule() {
  const m = ruleModal.value;
  if (!m.name.trim()) {
    message.error('请填写规范名称');
    return;
  }
  if (!m.formId) {
    message.error('请先保存表单再创建规范');
    return;
  }
  m.saving = true;
  try {
    const api = new Resource('rules');
    const payload = {
      name: m.name.trim(),
      category_id: m.category_id,
      form_id: m.formId,
    };
    // P3-V09：非管理员创建规范必须归属项目（默认当前项目）
    if (!isAdmin.value) {
      payload.project_id = m.projectId || appStore.defaultProject?.id || null;
      if (!payload.project_id) {
        message.error('未找到当前项目，无法创建规范');
        return;
      }
    }
    if (m.id) {
      await api.update(m.id, payload);
      message.success('规范已保存');
    } else {
      const res = await api.store(payload);
      m.id = res?.data?.id || res?.id || m.id;
      message.success('规范已创建');
    }
    ruleModal.value.open = false;
    if (m.formId === formId.value) {
      await loadFormRules();
      if (m.id) activeRuleId.value = m.id;
      await loadFields();
    } else {
      await loadModalRules(m.formId);
    }
  } catch (error) {
    const msg = error?.response?.data?.message || error?.message;
    message.error(typeof msg === 'string' && msg ? msg : '规范保存失败');
  } finally {
    m.saving = false;
  }
}

async function removeRule(r, sourceFormId) {
  try {
    await new Resource('rules').destroy(r.id);
    message.success(`规范「${r.name}」已删除，其字段规则条目同步清理`);
    if (sourceFormId === formId.value) {
      if (activeRuleId.value === r.id) activeRuleId.value = 0;
      await loadFormRules();
      await loadFields();
    } else {
      await loadModalRules(sourceFormId);
    }
  } catch (error) {
    const msg = error?.response?.data?.message || error?.message;
    message.error(typeof msg === 'string' && msg ? msg : '规范删除失败');
  }
}

// 表单编辑弹窗「校验规范」Tab：按 formModal.id 加载
const modalRules = ref([]);
async function loadModalRules(fid) {
  if (!fid) {
    modalRules.value = [];
    return;
  }
  const { data } = await new Resource('rules').list({
    per_page: 'all',
    form_id: fid,
  });
  modalRules.value = data || [];
}
watch(
  () => formModal.value.id,
  (id) => loadModalRules(id),
);

// 校验规则弹窗（读写 field-schemas；条目归属 activeRuleId）
const ruleDialog = ref(false);
const ruleField = ref(null);
const ruleRows = ref([]);
const ruleSaving = ref(false);

// P3-V11：规则类型语义化——按字段类型只给可用的类型，文案贴近业务
const ruleTypeOptions = computed(() => {
  const t = ruleField.value?.type;
  if (['number', 'digit', 'temperature', 'humidity', 'wind'].includes(t)) {
    return [
      { value: 'range', label: '区间（最小 ~ 最大）' },
      { value: 'min', label: '最小值（不低于）' },
      { value: 'max', label: '最大值（不高于）' },
      { value: 'eq', label: '等于指定值' },
    ];
  }
  if (['select', 'multiselect', 'stakeholder', 'construction'].includes(t)) {
    return [{ value: 'eq', label: '等于指定值' }];
  }
  // 文本/文本域/长文本等：min/max 按字符长度校验
  return [
    { value: 'min', label: '最短长度（字符）' },
    { value: 'max', label: '最长长度（字符）' },
    { value: 'eq', label: '等于指定值' },
  ];
});
const ruleTypeLabel = (t) =>
  ruleTypeOptions.value.find((o) => o.value === t)?.label || t || '-';

// 值输入框 label/占位随规则类型联动
const ruleValueField = computed(() => {
  const t = ruleField.value?.type;
  const numeric = [
    'number',
    'digit',
    'temperature',
    'humidity',
    'wind',
  ].includes(t);
  if (!numeric) {
    return { label: '长度（字符数）', placeholder: '如 50' };
  }
  return { label: '值', placeholder: '输入数值，区间填 最小-最大（如 0-100）' };
});
const levelOptions = [
  { value: 1, label: '错误' },
  { value: 2, label: '警告' },
];

const ruleListFields = computed(() => [
  {
    field: 'type',
    type: 'select',
    label: '类型',
    span: 5,
    required: true,
    attrs: { options: ruleTypeOptions.value },
  },
  {
    field: 'value',
    type: 'text',
    label: ruleValueField.value.label,
    span: 5,
    required: true,
    attrs: { placeholder: ruleValueField.value.placeholder },
  },
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
  {
    field: 'type',
    title: '类型',
    width: 140,
    slots: { default: 'default_rule_type' },
  },
  { field: 'value', title: '值', width: 110 },
  { field: 'level', title: '级别', width: 70 },
  { field: 'failed_proof', title: '需证明', width: 80 },
  { field: 'message', title: '不通过提示', minWidth: 160 },
]);

async function openRuleDialog(row) {
  ruleField.value = row;
  const global = (schemaByField.value[row.id] || []).find(
    (s) => s.applicable_scope === 'global',
  );
  const payload = global?.rule_payload || [];
  ruleRows.value = payload
    .filter((r) => (r.rule_id ?? 0) === activeRuleId.value)
    .map((r) => ({ ...r }));
  ruleDialog.value = true;
}

function addRuleRow() {
  ruleRows.value.push({
    type: ruleTypeOptions.value[0]?.value || 'min',
    level: 1,
    failed_proof: false,
  });
}

async function saveRules() {
  if (ruleSaving.value) return;
  for (const r of ruleRows.value) {
    if (!r.type || !r.level || !r.message) {
      message.error('每行需填写类型、级别和不通过提示');
      return;
    }
    if (!r.value && r.value !== 0) {
      message.error('值不能为空');
      return;
    }
    if (
      r.type === 'range' &&
      !/^-?\d+(\.\d+)?\s*-\s*-?\d+(\.\d+)?$/.test(String(r.value))
    ) {
      message.error('区间类型的值需填写「最小-最大」（如 0-100）');
      return;
    }
  }
  ruleSaving.value = true;
  try {
    const fid = ruleField.value.id;
    const ruleId = activeRuleId.value;
    const scopes = schemaByField.value[fid] || [];
    const global = scopes.find((s) => s.applicable_scope === 'global');
    // 合并：只替换当前规范（或自定义）的条目，保留其他规范归属的条目
    const oldPayload = global?.rule_payload || [];
    const merged = [
      ...oldPayload.filter((r) => (r.rule_id ?? 0) !== ruleId),
      ...ruleRows.value.map((r) => ({ ...r, rule_id: ruleId })),
    ];
    const api = new Resource('field-schemas');
    const payload = {
      rule_payload: merged,
      applicable_scope: 'global',
    };
    const saveOp = global
      ? api.update(global.id, payload)
      : api.store({
          ...payload,
          form_id: formId.value,
          field_id: fid,
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

onMounted(async () => {
  await Promise.all([loadCategories(), loadForms(), loadRuleCategories()]);
  const q = Number(route.query.form_id);
  if (q) {
    formId.value = q;
    await loadFields();
    await loadFormRules();
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
          <Popover
            v-model:open="filterOpen"
            trigger="click"
            placement="bottomLeft"
            :destroy-on-hidden="true"
          >
            <Button :type="filterActive ? 'primary' : 'default'">筛选</Button>
            <template #content>
              <div class="w-64">
                <div class="mb-2">
                  <div class="config-label">表单类型</div>
                  <Select
                    v-model:value="filterType"
                    :options="formTypeOptions"
                    style="width: 100%"
                    allow-clear
                    placeholder="全部类型"
                  />
                </div>
                <div class="mb-3">
                  <div class="config-label">项目分类</div>
                  <Select
                    v-model:value="filterCategory"
                    :options="categoryOptions"
                    style="width: 100%"
                    allow-clear
                    placeholder="全部分类"
                  />
                </div>
                <div class="mb-3">
                  <div class="config-label">规范状态</div>
                  <Select
                    v-model:value="filterHasRules"
                    :options="[
                      { value: 1, label: '有规范' },
                      { value: 0, label: '无规范' },
                    ]"
                    style="width: 100%"
                    allow-clear
                    placeholder="全部"
                  />
                </div>
                <div class="flex justify-end gap-2">
                  <Button size="small" @click="resetFilter">重置</Button>
                  <Button size="small" type="primary" @click="applyFilter">
                    应用
                  </Button>
                </div>
              </div>
            </template>
          </Popover>
          <Button type="primary" @click="openFormCreate">+ 新增</Button>
        </div>
        <div
          ref="formListRef"
          class="flex-1 overflow-y-auto"
          @scroll="onListScroll"
        >
          <div
            v-for="f in forms"
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
            v-if="loadingForms"
            class="px-3 py-4 text-center text-sm text-gray-400"
          >
            加载中…
          </div>
          <div
            v-else-if="!forms.length"
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
          <div
            class="flex items-center justify-between gap-2 border-b px-3 py-2"
          >
            <div class="flex min-w-0 items-center gap-2">
              <span class="shrink-0 text-sm font-semibold text-gray-500">
                字段列表（{{ rows.length }}）
              </span>
              <Select
                v-model:value="activeRuleId"
                :options="ruleSelectOptions"
                style="width: 240px"
                class="shrink-0"
              />
              <Button size="small" @click="openRuleCreate(formId)">
                + 新建规范
              </Button>
            </div>
            <Button type="primary" size="small" @click="openFieldCreate">
              + 新增字段
            </Button>
          </div>
          <div class="flex-1 overflow-auto">
            <Table
              :columns="columns"
              :data-source="tableRows"
              :loading="loading"
              :pagination="false"
              row-key="id"
              size="small"
              :scroll="{ y: '100%' }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <span
                    v-if="record._isChild"
                    class="inline-flex items-center gap-1 text-gray-500"
                  >
                    <span class="text-gray-300">└─</span>
                    <span class="inline-block text-xs text-gray-400"
                      >子字段</span
                    >
                    {{ record.name }}
                  </span>
                  <span v-else>{{ record.name }}</span>
                </template>
                <template v-else-if="column.key === 'type'">
                  <span>{{ fieldTypeLabel(record.type) }}</span>
                </template>
                <template v-else-if="column.key === 'required'">
                  <span>{{ record.required ? '是' : '否' }}</span>
                </template>
                <template v-else-if="column.key === 'ruleCount'">
                  <Tag v-if="ruleCount(record)" color="blue">
                    {{ ruleCount(record) }} 条
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
                      v-if="record.type === 'list' && !record._isChild"
                      type="link"
                      size="small"
                      class="p-0"
                      @click="openSubFieldDialog(record)"
                    >
                      子字段<span
                        v-if="childFieldsOf(record.id).length"
                        class="text-gray-400"
                        >({{ childFieldsOf(record.id).length }})</span
                      >
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
                      :description="
                        record.type === 'list' && !record._isChild
                          ? `将一并删除其 ${childFieldsOf(record.id).length} 个子字段及校验规则`
                          : '其校验规则将一并删除'
                      "
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
        <TabPane key="rules" tab="校验规范" :disabled="!formModal.id">
          <Alert
            v-if="!formModal.id"
            type="info"
            show-icon
            class="mb-2"
            message="保存表单后可创建校验规范"
          />
          <template v-else>
            <div class="mb-2 flex items-center justify-between">
              <div class="text-sm font-semibold text-gray-500">
                本表单的校验规范（{{ modalRules.length }}）
              </div>
              <Button
                type="primary"
                size="small"
                @click="openRuleCreate(formModal.id)"
              >
                + 新建规范
              </Button>
            </div>
            <div v-if="!modalRules.length" class="text-sm text-gray-400">
              暂无规范，创建后右侧字段可配置规则条目
            </div>
            <div
              v-for="r in modalRules"
              :key="r.id"
              class="mb-1 flex items-center justify-between rounded border px-2 py-1 text-sm"
            >
              <span>
                <Tag :color="r.status ? 'blue' : 'red'" class="mr-2">
                  {{ r.status ? '正常' : '已停用' }}
                </Tag>
                {{ r.name }}
                <span v-if="r.category" class="ml-2 text-xs text-gray-400">
                  {{ r.category.name }}
                </span>
              </span>
              <div class="flex items-center gap-1">
                <Button
                  type="link"
                  size="small"
                  class="p-0"
                  @click="openRuleEdit(r, formModal.id)"
                >
                  编辑
                </Button>
                <Popconfirm
                  :title="`确定删除规范「${r.name}」？`"
                  description="其已配置的字段规则条目将同步清理"
                  ok-text="删除"
                  cancel-text="取消"
                  @confirm="removeRule(r, formModal.id)"
                >
                  <Button type="link" size="small" danger class="p-0">
                    删除
                  </Button>
                </Popconfirm>
              </div>
            </div>
          </template>
        </TabPane>
      </Tabs>
    </Modal>

    <!-- 校验规范新增/编辑弹窗 -->
    <Modal
      v-model:open="ruleModal.open"
      :title="ruleModal.id ? `编辑规范 - ${ruleModal.name}` : '新建校验规范'"
      ok-text="保存"
      cancel-text="取消"
      width="480px"
      :confirm-loading="ruleModal.saving"
      @ok="saveRule"
    >
      <div class="grid grid-cols-12 gap-4">
        <div class="col-span-12">
          <label class="config-label">规范名称 *</label>
          <Input
            v-model:value="ruleModal.name"
            placeholder="如：焊接工艺规程"
          />
        </div>
        <div class="col-span-12">
          <label class="config-label">分类</label>
          <Select
            v-model:value="ruleModal.category_id"
            :options="ruleCategoryOptions"
            style="width: 100%"
            allow-clear
            placeholder="未分类"
          />
        </div>
      </div>
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
          <div
            v-if="fieldModal.type === 'list'"
            class="mt-1 text-xs text-gray-400"
          >
            保存后可在字段列表中点击「子字段」添加列表内字段
          </div>
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

    <!-- 列表字段子字段管理弹窗（P3-V10：可视化维护子字段，替代填上级 ID） -->
    <Modal
      v-model:open="subFieldModal.open"
      :title="`子字段 - ${subFieldModal.parentName}（列表）`"
      ok-text="保存子字段"
      cancel-text="关闭"
      width="860px"
      :confirm-loading="subFieldModal.saving"
      @ok="saveSubFields"
    >
      <Alert
        type="info"
        show-icon
        class="mb-3"
        message="列表字段的子字段"
        description="填表时每个列表行将按下方字段展开填写。直接在此维护子字段，无需填写上级 ID。"
      />
      <div class="mb-2 flex justify-end">
        <Button size="small" type="dashed" @click="addSubFieldRow">
          + 新增子字段
        </Button>
      </div>
      <AppList
        v-model="subFieldModal.rows"
        :options="{ columns: subFieldColumns, showFooter: false }"
        :fields="subFieldListFields"
        :show-delete="true"
        :show-edit="false"
        row-key="id"
        height="320"
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
            :options="fieldTypeOptions"
            size="small"
            style="width: 100%"
          />
        </template>
      </AppList>
    </Modal>

    <!-- 校验规则弹窗 -->
    <Modal
      v-model:open="ruleDialog"
      :title="`校验规则 - ${ruleField?.name || ''}（${
        activeRuleId
          ? formRules.find((r) => r.id === activeRuleId)?.name || '规范'
          : '自定义规则'
      }）`"
      ok-text="保存"
      cancel-text="关闭"
      width="1120px"
      :confirm-loading="ruleSaving"
      @ok="saveRules"
    >
      <div class="mb-2 flex items-center justify-between">
        <div class="text-xs text-gray-500">
          {{
            activeRuleId
              ? `以下规则归属「${formRules.find((r) => r.id === activeRuleId)?.name || ''}」，填表时选择该规范后生效`
              : '自定义规则恒生效（不依赖填表时选择规范）'
          }}
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
      >
        <template #default_rule_type="{ row }">
          {{ ruleTypeLabel(row.type) }}
        </template>
      </AppList>
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
