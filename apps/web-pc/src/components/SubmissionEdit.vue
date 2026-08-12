<script setup>
/**
 * SubmissionEdit —— 动态表单填写引擎
 *
 * 数据契约（对齐后端 Submission::saveFields / SubmissionService::createSubmission）：
 *   - values 形如 { '_<fieldId>': scalar | array }
 *       * 普通字段：标量（text/number/switch 0|1/select 值/datetime 字符串/file → 单文件 url / images/file/multiselect → 数组）
 *       * list 字段：二维行数组 [ row, ... ]，row = { '_<subFieldId>': scalar|array } （saveFields 检测二维数组递归存储，parent_id 指向 list 字段的 submission_field.id）
 *   - rules 形如 { '_<fieldId>': rule_id | null | nested }（list 字段为嵌套 rules 数组，按行对应）
 *   - 文件字段值含 '?upload' 时，后端 saveFields 触发 UploadService.mapping 挂到 'submission_file'
 *
 * 校验契约（P3-V01/V02 全量输出，P3-V06 恢复"规范选择驱动"）：
 *   - field.required → 必填（恒生效）
 *   - rule_id=0 的基本校验恒生效；规范规则（rule_id>0）仅当顶部"校验规范"所选规范匹配时生效
 *     （getActiveRules 过滤；不选或单选一个规范）
 *   - rule level=1 → errors 阻止提交；level=2 → warnings 触发业务层不符合项弹窗
 *   - ant Form.Item 接管失焦/变更实时校验（buildFieldValidation → toAntdRules）；提交前 evaluateAll 兜底
 *   - 切换"校验规范"选择后重建各字段 ant 校验规则并清空旧提示；提交 rules 里的 rule_id 同时用于追溯
 *
 * 暴露接口（与 web-admin submission/edit.vue 对齐）：formRef / formFields / getFormData / setFormData / validate
 */
import { computed, nextTick, ref, watch } from 'vue';

import { Button, Form, Select } from 'antdv-next';
import { cloneDeep, isEqual } from 'lodash-es';

import Resource from '#/api/resource';
import AppField from '#/components/AppField.vue';
import {
  buildRuleEvaluator,
  toAntdRules,
} from '#/composables/use-field-rules';

const props = defineProps({
  // 已存在 submission 的字段值（后端 show 返回 submission_fields 数组，扁平 [{id, field_id, type, name, parent_id, content, rule_id, ...}]）
  values: {
    type: Array,
    default: () => [],
  },
  // 已存在 submission 的 rules 快照（{ _field_id: rule_id }），用于回显 base_rule 选中
  rules: {
    type: Object,
    default: () => ({}),
  },
  // 表单 ID（用于加载 form.fields 配置 + base_rules）
  formId: {
    type: [String, Number],
    default: undefined,
  },
  projectId: {
    type: [String, Number],
    default: undefined,
  },
  // 只读模式（详情/审核场景仅展示）
  readonly: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['saved', 'saveDraft', 'restoreDraft']);

// ---- 表单字段配置 ----
const formFields = ref([]); // 后端 form.show 的 fields 数组（含 rules/base_rules/options）

// ---- 渲染用字段（按 sort 排序，list 字段提取子字段列表）----
const renderFields = ref([]); // 顶层渲染字段
const listChildren = ref({}); // field_id -> 子字段配置数组（list 字段的 children）

// ---- 表单数据模型 ----
const formData = ref({}); // { _fieldId: scalar | array }
const listRows = ref({}); // { _listFieldId: [ row, row, ... ] }

// 初始值快照（setValues 每次载入时更新），用于检测“未修改即重复提交”
const pristineFormData = ref({});
const pristineListRows = ref({});

// ---- 校验规范选择（P3-V08 优化：不选或单选一个规范，选择后按该规范校验对应字段）----
// 0 = 不选择（仅规则恒生效的 rule_id=0 条目参与校验）
const selectedRuleId = ref(0);
const fieldBaseRule = ref({}); // { _fieldId: 当前应用的 rule_id }
// 表单级规范列表（form.show.base_rules：rules 表 form_id 关联的启用规范）
const formBaseRules = ref([]);

// ---- 单位工程字段联动 ----
const unitProjectFieldId = ref(null);
const unitProjectCodeFieldId = ref(null);
const unitProjects = ref([]);

// ---- 字段 ref 集合（用于 AppField.upload 批次）----
const fieldRefs = ref({}); // _fieldId -> AppField 实例
const listFieldRefs = ref({}); // `${listFieldId}_${rowIndex}_${subFieldId}` -> AppField 实例

const formRef = ref(null);
// level=2 规则的独立提示，不交给 Ant validator（否则会被当成阻断错误）。
const liveWarnings = ref({});

// P3-V02：ant Form 的 model 需覆盖 list 子表行值（list 行存于 listRows，行内子字段的 ant Form.Item
// 通过动态 name=subListKey 取校验值）；top-level 仍直读 formData
const formModel = computed(() => {
  const m = { ...formData.value };
  for (const field of renderFields.value) {
    if (field._renderType !== 'list') continue;
    const rows = listRows.value[fkey(field)] || [];
    for (let i = 0; i < rows.length; i++) {
      for (const sub of field._subFields || []) {
        m[subListKey(field.id, i, sub.id)] = rows[i][fkey(sub)];
      }
    }
  }
  return m;
});

// ---- 工具 ----
function fkey(f) {
  return `_${f.id}`;
}

function subListKey(listFieldId, rowIndex, subFieldId) {
  return `_${listFieldId}__${rowIndex}__${subFieldId}`;
}

// 字段类型映射（保留后端 type 语义；AppField 已支持大部分类型，少量映射）
function mapType(field) {
  const type = field.type || 'text';
  // 后端 FormController.show 对 type=stakeholder/construction 已转为 multiselect 并填好 options
  switch (type) {
    case 'construction':
    case 'multiselect':
    case 'stakeholder': {
      return 'multiselect';
    }
    case 'date':
    case 'datetime':
    case 'digit':
    case 'file':
    case 'image':
    case 'images':
    case 'number':
    case 'select':
    case 'switch':
    case 'text':
    case 'textarea':
    case 'time':
    case 'video':
    case 'videos': {
      return type;
    }
    case 'humidity':
    case 'temperature':
    case 'wind': {
      return 'number';
    }
    case 'list': {
      return 'list';
    }
    case 'unit_project': {
      return 'select';
    }
    case 'unit_project_code': {
      return 'text';
    }
    default: {
      return 'text';
    }
  }
}

// 短字段（数字/时间等）占 1/4 行宽；其余类型整行。顶级字段与列表子字段共用。
function isShortFieldType(type) {
  return [
    'number',
    'digit',
    'decimal',
    'time',
    'date',
    'datetime',
    'switch',
    'temperature',
    'humidity',
    'wind',
  ].includes(type);
}

function fieldSpanClass(field) {
  return isShortFieldType(field?.type || mapType(field))
    ? 'field-span-quarter'
    : 'field-span-full';
}

function mapAttrs(field) {
  const type = field.type || 'text';
  const attrs = { ...field.attrs };
  attrs.placeholder = field.placeholder || `请输入${field.name}`;
  if (field.hint) attrs.hint = field.hint;
  if (type === 'select' || type === 'multiselect') {
    attrs.options = (field.options || []).map((o) => {
      if (typeof o === 'object') return o;
      return { value: o, label: o };
    });
    if (
      type === 'multiselect' ||
      (field.type === 'construction' && field.options?.length)
    ) {
      attrs.mode = 'multiple';
    }
  } else if (type === 'unit_project') {
    attrs.options = unitProjects.value.map((u) => ({
      value: u.name,
      label: u.name,
    }));
  } else if (type === 'digit') {
    attrs.step = 0.01;
  } else if (type === 'image') {
    attrs.limit = 1;
    attrs.fileType = 'image';
  } else if (
    type === 'file' ||
    type === 'images' ||
    type === 'video' ||
    type === 'videos'
  ) {
    attrs.multiple = type !== 'image' && type !== 'video';
    attrs.fileType =
      { video: 'video', videos: 'video', image: 'image', images: 'image' }[
        type
      ] || 'file';
  }
  if (props.readonly) {
    attrs.disabled = true;
    attrs.readonly = true;
  }
  return attrs;
}

/**
 * P3-V02：把后端 schema 输出的 field.required / field.rules 转换为 ant Form.Item 兼容规则，
 * 透传到 AppField 的 props.field.required / props.field.rules，让 ant Form 接管失焦/变更即时校验。
 * ant 失焦校验与提交按钮 getFormData() 内部 evaluateAll 互为兜底——任一命中即红字。
 */
// P3-V06/P3-V14：保留 bundle 的 expr 结构，不能展平为叶子，否则 OR 会被错误当成 AND。
// 规则规范由 fieldBaseRule 决定：基本校验 rule_id=0 恒生效，当前字段未配置所选规范时只执行基本校验。
function getActiveRules(field) {
  return field.rules || [];
}

function buildFieldValidation(field) {
  const required = !!field.required && !props.readonly;
  const selectedRuleId = fieldBaseRule.value[fkey(field)] ?? 0;
  const rules = props.readonly
    ? []
    : toAntdRules(field, getActiveRules(field), selectedRuleId);
  return { required, rules };
}

// 初始化所选规范（P3-V08 优化：全局单选）：外部 rules 已指定时回显，取第一个非空 rule_id
function initBaseRules() {
  const externalIds = Object.values(props.rules || {})
    .map((v) => String(v ?? ''))
    .filter(Boolean);
  selectedRuleId.value =
    externalIds.length > 0 ? Number(externalIds[0]) : 0;
  recomputeFieldBaseRule();
  // 首次自动选中也需重建 ant 校验规则，否则所选规范的规则不会生效
  rebuildValidation();
}

// 每个字段应用所选规范：该字段存在所选规范条目则应用，否则 null（仅 rule_id=0 恒生效）
function recomputeFieldBaseRule() {
  const sid = selectedRuleId.value;
  for (const field of formFields.value) {
    const baseRules =
      field.rules?.filter((r) => Number(r.rule_id) > 0) || [];
    const picked =
      sid > 0 ? baseRules.find((r) => Number(r.rule_id) === Number(sid)) : null;
    fieldBaseRule.value[fkey(field)] = picked ? picked.rule_id : null;
  }
}

// 重建所有字段（含 list 子字段）的 ant 校验规则
function rebuildValidation() {
  for (const f of renderFields.value) {
    f._validation = buildFieldValidation(f);
  }
  for (const listId in listChildren.value) {
    for (const sub of listChildren.value[listId]) {
      sub._validation = buildFieldValidation(sub);
    }
  }
}

// 切换规范（含首次自动选中）后，按当前值立即校验一次，展示该值的提示信息；
// 仅校验已有值的字段（含 list 子字段），避免空必填字段的“必填”噪音
function recheckCurrentValues() {
  nextTick(() => {
    try {
      if (!formRef.value) return;
      formRef.value.clearValidate?.();
      const names = [];
      for (const field of renderFields.value) {
        if (field._renderType === 'list') continue;
        if (hasValue(formData.value[fkey(field)])) names.push(fkey(field));
      }
      for (const field of renderFields.value) {
        if (field._renderType !== 'list') continue;
        const rows = listRows.value[fkey(field)] || [];
        for (let i = 0; i < rows.length; i++) {
          for (const sub of field._subFields || []) {
            if (hasValue(rows[i][fkey(sub)])) {
              names.push(subListKey(field.id, i, sub.id));
            }
          }
        }
      }
      if (names.length > 0) {
        formRef.value.validateFields(names).catch(() => {});
      }
    } catch {
      // 字段未注册/时序问题：静默忽略，下次交互或提交兜底
    }
  });
}

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function changeBaseRule(ruleId) {
  selectedRuleId.value = Number(ruleId) || 0;
  recomputeFieldBaseRule();
  // 切换规范后重建各字段 ant 校验规则，并立即按当前值检查一次显示提示信息
  rebuildValidation();
  refreshAllWarnings();
  recheckCurrentValues();
}

// ---- 加载 form.fields ----
async function loadForm() {
  if (!props.formId) return;
  const { data } = await new Resource('forms').get(props.formId, {
    project_id: props.projectId,
  });
  formFields.value = data.fields || [];
  // 表单级规范列表（rules 表 form_id 关联的启用规范，用于填写端"校验规范"单选器）。
  // 优先取 form.show.base_rules；后端未部署该字段（旧版本）时回退直接查 rules 列表，
  // 保证选择器不依赖后端版本即可显示。
  formBaseRules.value = data.base_rules || [];
  if (formBaseRules.value.length === 0) {
    try {
      const { data: ruleData } = await new Resource('rules').list({
        per_page: 'all',
        form_id: props.formId,
      });
      formBaseRules.value = (ruleData || []).map((r) => ({
        id: r.id,
        name: r.name || r.rule_name,
        category_name: r.category_name || r.rule_category_name || '',
      }));
    } catch {
      // 规则列表查询失败不阻断表单加载
    }
  }
  // 提取 list 字段的子字段（parent_id 指向 list 字段 id 的子字段）
  const topLevel = [];
  const childrenOf = {};
  for (const f of formFields.value) {
    if (f.parent_id) {
      childrenOf[f.parent_id] = childrenOf[f.parent_id] || [];
      childrenOf[f.parent_id].push({
        ...f,
        _validation: buildFieldValidation(f),
      });
    }
  }
  for (const f of formFields.value) {
    if (f.type === 'list') {
      listChildren.value[f.id] = childrenOf[f.id] || [];
      f._subFields = listChildren.value[f.id];
    }
  }
  // 顶层字段（排除 list 的子字段）
  for (const f of formFields.value) {
    if (
      f.parent_id &&
      formFields.value.some((p) => p.id === f.parent_id && p.type === 'list')
    ) {
      continue;
    }
    topLevel.push(f);
  }
  // 渲染字段
  renderFields.value = topLevel.map((f) => ({
    ...f,
    _renderType: mapType(f),
    _attrs: mapAttrs(f),
    _key: fkey(f),
    _validation: buildFieldValidation(f),
  }));

  // 单位工程字段联动记录
  unitProjectFieldId.value =
    formFields.value.find((f) => f.type === 'unit_project')?.id || null;
  unitProjectCodeFieldId.value =
    formFields.value.find((f) => f.type === 'unit_project_code')?.id || null;

  initBaseRules();

  // 单位工程选项加载（只有需要时）
  if (unitProjectFieldId.value) {
    await loadUnitProjects();
  }

  setValues(props.values || []);
  refreshAllWarnings();
  // 首次自动选中规范后，若已有值则立即检查一次，显示该值的提示信息
  if ((props.values || []).length > 0) {
    recheckCurrentValues();
  }
}

async function loadUnitProjects() {
  const { data } = await new Resource('divisions').list({
    per_page: 'all',
    project_id: props.projectId,
    level: 1,
  });
  unitProjects.value = data || [];
  for (const f of renderFields.value) {
    if (f.type === 'unit_project') {
      f._attrs.options = unitProjects.value.map((u) => ({
        value: u.name,
        label: u.name,
      }));
    }
  }
}

// ---- values 回填（submission_fields 数组 → formData + listRows）----
// submission_fields 行按 parent_id 关联：list 字段的子字段 parent_id 指向 list 字段的 submission_field.id
function setValues(subFields) {
  liveWarnings.value = {};
  formData.value = {};
  listRows.value = {};

  // 索引：submission_field.id -> row
  const sfIndex = {};
  for (const sf of subFields) sfIndex[sf.id] = sf;

  // 顶层字段（parent_id=null 或 ==0）
  for (const sf of subFields) {
    if (sf.parent_id) continue;
    const key = fkey({ id: sf.field_id });
    const config = formFields.value.find((f) => f.id === sf.field_id);
    if (!config) continue;

    if (config.type === 'list') {
      // list 字段的占位 entry，content 通常为 null，行收集见下
      continue;
    }
    formData.value[key] = coerceContent(config, sf.content);
  }

  // list 行：找出所有 list 字段的 submission_field.id，再收集其子字段按行分组
  for (const config of formFields.value) {
    if (config.type !== 'list') continue;
    const listKey = fkey(config);
    listRows.value[listKey] = [];
    // 该 list 字段的所有 submission_field entry（顶层 parent_id=null/0，field_id=config.id）
    const listFieldEntries = subFields.filter(
      (sf) => !sf.parent_id && sf.field_id === config.id,
    );
    // 每行：以 list entry 的 id 为 parent_id 的所有子字段
    for (const entry of listFieldEntries) {
      const row = {};
      const children = subFields.filter((sf) => sf.parent_id === entry.id);
      for (const c of children) {
        const subConfig = (config._subFields || []).find(
          (sf) => sf.id === c.field_id,
        );
        if (!subConfig) continue;
        row[fkey(subConfig)] = coerceContent(subConfig, c.content);
        // 子字段 rule_id
        // 暂不处理子字段 base_rule 回显（保存结构中保存 nested rules）
      }
      listRows.value[listKey].push(row);
    }
  }

  // 快照当前载入值作为初始基线：未做任何修改时提交应判定为无变化
  pristineFormData.value = cloneDeep(formData.value);
  pristineListRows.value = cloneDeep(listRows.value);
}

// 内容按字段类型反序列化（参考 TaskSubmissionController::show）
function coerceContent(config, content) {
  const type = config.type;
  if (content === null || content === undefined) {
    if (
      type === 'multiselect' ||
      type === 'images' ||
      type === 'file' ||
      type === 'videos'
    )
      return [];
    if (type === 'switch') return 0;
    if (type === 'list') return [];
    return '';
  }
  if (type === 'construction' || type === 'multiselect') {
    if (Array.isArray(content)) return content;
    try {
      return JSON.parse(content) || [];
    } catch {
      return [];
    }
  }
  if (type === 'images' || type === 'videos' || type === 'file') {
    if (Array.isArray(content)) return content;
    if (typeof content === 'string' && content.startsWith('[')) {
      try {
        return JSON.parse(content) || [];
      } catch {
        return [];
      }
    }
    // 单文件：返回字符串
    return content;
  }
  if (type === 'switch') {
    return Number(!!Number(content) || content === true || content === 'true');
  }
  if (
    type === 'number' ||
    type === 'digit' ||
    type === 'temperature' ||
    type === 'humidity' ||
    type === 'wind'
  ) {
    const n = Number(content);
    return Number.isNaN(n) ? '' : n;
  }
  return content;
}

// ---- 字段值变化 ----
function refreshFieldWarning(field, fieldName, value) {
  if (props.readonly) return;
  const result = evaluateField(field, value);
  if (!result.pass && Number(result.error?.leaf?.level) === 2) {
    liveWarnings.value[fieldName] = result.error.message || '格式有误';
  } else {
    Reflect.deleteProperty(liveWarnings.value, fieldName);
  }
}

function refreshAllWarnings() {
  liveWarnings.value = {};
  for (const field of renderFields.value) {
    if (field._renderType !== 'list') {
      refreshFieldWarning(field, fkey(field), formData.value[fkey(field)]);
      continue;
    }
    const rows = listRows.value[fkey(field)] || [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      for (const sub of field._subFields || []) {
        const fieldName = subListKey(field.id, rowIndex, sub.id);
        refreshFieldWarning(sub, fieldName, rows[rowIndex][fkey(sub)]);
      }
    }
  }
}

function validateFieldOnChange(fieldName, field, value) {
  refreshFieldWarning(field, fieldName, value);
  nextTick(() => {
    formRef.value?.validateFields?.([fieldName]).catch(() => {});
  });
}

function onFieldUpdate(field, value) {
  formData.value[fkey(field)] = value;
  // 单位工程 code 联动
  if (field.type === 'unit_project' && unitProjectCodeFieldId.value) {
    const up = unitProjects.value.find((u) => u.name === value);
    if (up) {
      formData.value[fkey({ id: unitProjectCodeFieldId.value })] = up.code;
    }
  }
  validateFieldOnChange(fkey(field), field, value);
}

function onListFieldUpdate(listField, rowIndex, subField, value) {
  const listKey = fkey(listField);
  if (!listRows.value[listKey]) listRows.value[listKey] = [];
  if (!listRows.value[listKey][rowIndex])
    listRows.value[listKey][rowIndex] = {};
  listRows.value[listKey][rowIndex][fkey(subField)] = value;
  validateFieldOnChange(
    subListKey(listField.id, rowIndex, subField.id),
    subField,
    value,
  );
}

// ---- list 行操作 ----
function addListRow(listField) {
  const key = fkey(listField);
  if (!listRows.value[key]) listRows.value[key] = [];
  const row = {};
  for (const sf of listField._subFields || []) {
    row[fkey(sf)] = defaultForType(sf.type);
  }
  listRows.value[key].push(row);
}

function removeListRow(listField, rowIndex) {
  const key = fkey(listField);
  listRows.value[key].splice(rowIndex, 1);
}

function defaultForType(type) {
  if (type === 'switch') return 0;
  const arrTypes = ['multiselect', 'images', 'file', 'videos', 'list'];
  if (arrTypes.includes(type)) return [];
  return '';
}

// ---- ref 收集 ----
function setFieldRef(field, el) {
  if (el) fieldRefs.value[fkey(field)] = el;
  else Reflect.deleteProperty(fieldRefs.value, fkey(field));
}

function setListFieldRef(listField, rowIndex, subField, el) {
  const key = subListKey(listField.id, rowIndex, subField.id);
  if (el) listFieldRefs.value[key] = el;
  else Reflect.deleteProperty(listFieldRefs.value, key);
}

// ---- 校验引擎 ----
// 普通字段和列表子字段统一使用递归求值，保留 And/Or 短路语义。
function evaluateField(field, value) {
  const builtin = field.required
    ? [
        {
          type: 'required',
          message: `${field.name?.length < 10 ? field.name : '该字段'}必填`,
          level: 1,
        },
      ]
    : [];
  const selectedRuleId = fieldBaseRule.value[fkey(field)] ?? 0;
  return buildRuleEvaluator(
    [...builtin, ...getActiveRules(field)],
    mapType(field),
    selectedRuleId,
  )(value);
}

function addEvaluationResult(target, fieldKey, value, result) {
  if (result.pass || !result.error) return;
  const item = {
    rule: result.error.leaf,
    value,
    message: result.error.message,
  };
  if (Number(result.error.leaf?.level) === 2) {
    target.warnings[fieldKey] = [item];
  } else {
    target.errors[fieldKey] = item;
  }
}

function evaluateAll() {
  const errors = {};
  const warnings = {};
  for (const field of renderFields.value) {
    if (field._renderType === 'list') continue;
    addEvaluationResult(
      { errors, warnings },
      fkey(field),
      formData.value[fkey(field)],
      evaluateField(field, formData.value[fkey(field)]),
    );
  }
  return { errors, warnings };
}

function evaluateList(listField, rowIndex) {
  const errors = {};
  const warnings = [];
  const row = (listRows.value[fkey(listField)] || [])[rowIndex] || {};
  for (const sub of listField._subFields || []) {
    const fieldKey = subListKey(listField.id, rowIndex, sub.id);
    const value = row[fkey(sub)];
    const result = evaluateField(sub, value);
    if (result.pass || !result.error) continue;
    const item = { rule: result.error.leaf, value, message: result.error.message };
    if (Number(result.error.leaf?.level) === 2) {
      warnings.push(item);
    } else {
      errors[fieldKey] = item;
    }
  }
  return { errors, warnings };
}

function evaluateAllList() {
  const errors = {};
  const warnings = {};
  for (const field of renderFields.value) {
    if (field._renderType !== 'list') continue;
    const rows = listRows.value[fkey(field)] || [];
    for (let i = 0; i < rows.length; i++) {
      const r = evaluateList(field, i);
      Object.assign(errors, r.errors);
      if (r.warnings.length > 0) {
        warnings[fkey(field)] = [
          ...(warnings[fkey(field)] || []),
          ...r.warnings,
        ];
      }
    }
  }
  return { errors, warnings };
}

async function validate() {
  const { errors } = evaluateAll();
  const listEval = evaluateAllList();
  const allErrors = { ...errors, ...listEval.errors };
  // ant Form 已接管 required+base_rules 实时校验；此处与 evaluateAll 互为兜底
  let antValid = true;
  if (formRef.value) {
    try {
      await formRef.value.validate();
    } catch {
      antValid = false;
    }
  }
  return antValid && Object.keys(allErrors).length === 0;
}

// ---- 文件字段上传前置 ----
async function uploadPendingFiles() {
  // 常规字段
  const tasks = [];
  for (const field of renderFields.value) {
    if (
      !['file', 'image', 'images', 'video', 'videos'].includes(
        field._renderType,
      )
    )
      continue;
    const ref = fieldRefs.value[fkey(field)];
    if (ref?.fieldRef?.upload) {
      tasks.push(ref.fieldRef.upload());
    }
  }
  // list 子字段 file
  for (const field of renderFields.value) {
    if (field._renderType !== 'list') continue;
    const rows = listRows.value[fkey(field)] || [];
    for (let i = 0; i < rows.length; i++) {
      for (const sub of field._subFields || []) {
        if (
          !['file', 'image', 'images', 'video', 'videos'].includes(mapType(sub))
        )
          continue;
        const ref = listFieldRefs.value[subListKey(field.id, i, sub.id)];
        if (ref?.fieldRef?.upload) tasks.push(ref.fieldRef.upload());
      }
    }
  }
  await Promise.all(tasks);
}

// ---- 输出提交数据（对齐 saveFields 入参）----
function buildValues() {
  const out = {};
  for (const field of renderFields.value) {
    const key = fkey(field);
    if (field._renderType === 'list') {
      // list：[[子字段组], ...] 每组满足 {子字段key: value}
      const rows = listRows.value[key] || [];
      out[key] = rows.map((row) => {
        const r = {};
        for (const sub of field._subFields || []) {
          r[fkey(sub)] = serializeValue(sub, row[fkey(sub)]);
        }
        return r;
      });
    } else {
      out[key] = serializeValue(field, formData.value[key]);
    }
  }
  return out;
}

function serializeValue(field, value) {
  const type = field.type;
  if (
    type === 'multiselect' ||
    type === 'images' ||
    type === 'videos' ||
    type === 'file' ||
    type === 'construction'
  ) {
    // 数组：后端 json_encode 存储；含 ?upload 的字符串后端会 mapping 单值
    if (Array.isArray(value)) {
      return value.filter((v) => v !== null && v !== undefined && v !== '');
    }
    return value;
  }
  return value;
}

function buildRules(values) {
  // rules: { _fieldId: rule_id | null | nested(list 按 [行: rule_id| null] 对应) }
  const out = {};
  for (const field of renderFields.value) {
    const key = fkey(field);
    if (field._renderType === 'list') {
      const rows = listRows.value[key] || [];
      out[key] = rows.map(() => null); // list 子字段的 base_rule 回显暂不支持嵌套选择
    } else {
      out[key] = fieldBaseRule.value[key] || null;
    }
  }
  return out;
}

async function getFormData() {
  const validated = await validate();
  await uploadPendingFiles();
  const { errors, warnings } = evaluateAll();
  const listEval = evaluateAllList();
  return {
    values: buildValues(),
    rules: buildRules(),
    warnings: { ...warnings, ...listEval.warnings },
    errors: { ...errors, ...listEval.errors },
    validated,
    // 相对初始基线是否有修改（用于无修改重复提交拦截）
    changed:
      !isEqual(formData.value, pristineFormData.value) ||
      !isEqual(listRows.value, pristineListRows.value),
  };
}

function setFormData(data) {
  if (data?.values) {
    // 假设 values 已经是 { _fieldId: ... }
    for (const key in data.values) {
      formData.value[key] = data.values[key];
    }
  }
  if (data?.rules) {
    for (const key in data.rules) {
      fieldBaseRule.value[key] = data.rules[key];
    }
  }
}

defineExpose({
  formRef,
  formFields,
  getFormData,
  setFormData,
  validate,
  uploadPendingFiles,
});

// P3-V08 优化：规范列表 = 表单级规范（form.show.base_rules）+ 字段规则条目里出现的规范，合并去重
const baseRuleList = computed(() => {
  const rules = [];
  const seen = {};
  const push = (id, name, categoryName) => {
    if (!id || seen[id]) return;
    seen[id] = true;
    rules.push({ id, name, category_name: categoryName });
  };
  for (const r of formBaseRules.value) {
    push(r.id, r.name, r.category_name);
  }
  for (const f of formFields.value) {
    for (const r of f.rules || []) {
      if (Number(r.rule_id) > 0) {
        push(r.rule_id, r.rule_name, r.rule_category_name);
      }
    }
  }
  return rules;
});

// 校验规范下拉选项（0=基本校验恒生效；规范较多时用下拉而非平铺）
const ruleSelectOptions = computed(() => [
  { value: 0, label: '基本校验（恒生效）' },
  ...baseRuleList.value.map((r) => ({
    value: r.id,
    label: r.category_name ? `${r.name}（${r.category_name}）` : r.name,
  })),
]);

// 监听 values 外部变化（如切换编辑行）
watch(
  () => props.values,
  (v) => {
    if (formFields.value.length > 0) {
      setValues(v || []);
      refreshAllWarnings();
      // 外部回填值后（如编辑回显）按当前值检查一次，显示提示信息
      if ((v || []).length > 0) recheckCurrentValues();
    }
  },
  { deep: true },
);

watch(
  () => props.formId,
  () => {
    loadForm();
  },
  { immediate: false },
);

watch(
  () => props.rules,
  () => {
    if (formFields.value.length > 0) {
      initBaseRules();
      refreshAllWarnings();
      // 规则快照到达后（编辑回显）按当前值检查一次，显示提示信息
      if ((props.values || []).length > 0) recheckCurrentValues();
    }
  },
  { deep: true },
);

loadForm();
</script>

<template>
  <div class="submission-edit">
    <!-- 校验规范顶部选择区（P3-V08 优化：不选或单选一个规范） -->
    <div
      v-if="baseRuleList.length"
      class="mb-4 rounded border border-gray-200 bg-gray-50 p-3"
    >
      <div class="mb-2 text-sm font-semibold text-gray-600">
        校验规范<span class="ml-1 text-xs font-normal text-gray-400"
          >（选择后按该规范校验对应字段，默认基本校验恒生效）</span
        >
      </div>
      <Select
        :value="selectedRuleId"
        :disabled="readonly"
        :options="ruleSelectOptions"
        style="width: 280px"
        @change="changeBaseRule"
      />
    </div>

    <Form
      ref="formRef"
      :model="formModel"
      layout="vertical"
      class="field-grid"
    >
      <template v-for="field in renderFields" :key="field._key">
        <!-- list 字段：嵌套子表 -->
        <div
          v-if="field._renderType === 'list'"
          class="field-span-full mb-4 rounded border p-3"
        >
          <div class="mb-2 flex items-center justify-between">
            <div class="text-sm font-semibold text-gray-600">
              {{ field.name
              }}<span v-if="field.required" class="text-red-500">*</span>
            </div>
            <Button
              v-if="(listRows[field._key] || []).length === 0 && !readonly"
              size="small"
              type="dashed"
              @click="addListRow(field)"
            >
              + 新增组
            </Button>
          </div>
          <div
            v-for="(row, rowIndex) in listRows[field._key] || []"
            :key="rowIndex"
            class="mb-3 rounded bg-gray-50 p-3"
          >
            <div class="list-field-grid">
              <div
                v-for="sub in field._subFields || []"
                :key="sub.id"
                :class="fieldSpanClass(sub)"
              >
                <AppField
                  :field="{
                    field: subListKey(field.id, rowIndex, sub.id),
                    type: mapType(sub),
                    label: `${sub.name}${sub.required ? '*' : ''}`,
                    attrs: mapAttrs(sub),
                    required: sub._validation.required,
                    rules: sub._validation.rules,
                  }"
                  :model-value="row[fkey(sub)]"
                  :with-form-item="true"
                  :ref="(el) => setListFieldRef(field, rowIndex, sub, el)"
                  @update:model-value="
                    (v) => onListFieldUpdate(field, rowIndex, sub, v)
                  "
                />
                <div
                  v-if="!readonly && liveWarnings[subListKey(field.id, rowIndex, sub.id)]"
                  class="warning-tip mt-1 text-xs text-orange-500"
                >
                  {{ liveWarnings[subListKey(field.id, rowIndex, sub.id)] }}
                </div>
              </div>
            </div>
            <div v-if="!readonly" class="mt-2 text-right">
              <Button
                type="link"
                danger
                size="small"
                @click="removeListRow(field, rowIndex)"
              >
                删除本组
              </Button>
            </div>
          </div>
          <div
            v-if="(listRows[field._key] || []).length > 0 && !readonly"
            class="mt-1 flex justify-center"
          >
            <Button
              size="small"
              type="dashed"
              @click="addListRow(field)"
            >
              + 新增组
            </Button>
          </div>
          <div
            v-if="!(listRows[field._key] || []).length"
            class="py-4 text-center text-sm text-gray-400"
          >
            暂无数据，点击"+ 新增行"
          </div>
        </div>

        <!-- 常规字段 -->
        <div v-else :class="fieldSpanClass(field)">
          <AppField
            :field="{
              field: field._key,
              type: field._renderType,
              label: field.name,
              attrs: field._attrs,
              required: field._validation.required,
              rules: field._validation.rules,
            }"
            :model-value="formData[field._key]"
            :with-form-item="true"
            :ref="(el) => setFieldRef(field, el)"
            @update:model-value="(v) => onFieldUpdate(field, v)"
          />
          <div
            v-if="!readonly && liveWarnings[field._key]"
            class="warning-tip mt-1 text-xs text-orange-500"
          >
            {{ liveWarnings[field._key] }}
          </div>
        </div>
      </template>
    </Form>
  </div>
</template>

<style scoped>
/* 表单网格：4 列等宽，短字段占 1 列，其余字段整行 */
.field-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.field-span-quarter {
  grid-column: span 1;
  min-width: 0;
}

.field-span-full {
  grid-column: 1 / -1;
  min-width: 0;
}

/* 网格内由 gap 控制间距，抵消 ant Form.Item 默认底部留白 */
.field-grid :deep(.ant-form-item),
.list-field-grid :deep(.ant-form-item) {
  margin-bottom: 0;
}

/* 列表子字段使用同一套按类型定宽规则 */
.list-field-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

/* 警告提示与控件间不留大空隙：ant Form.Item 默认 margin-bottom 较大，
   有警告时压缩其底部留白，使橙色提示紧贴控件下方。 */
.warning-tip {
  margin-top: -22px;
  line-height: 1.4;
  padding-bottom: 16px;
}
</style>
