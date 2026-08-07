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
 * 校验契约（P3-V01/V02 对齐后端 FormSchemaService 全量输出）：
 *   - field.required → 必填；field.rules[]（含规范 base_rules）全量参与校验，不再依赖前端勾选 rule_id
 *   - rule level=1 → errors 阻止提交；level=2 → warnings 触发业务层不符合项弹窗
 *   - ant Form.Item 接管失焦/变更实时校验（buildFieldValidation → toAntdRules）；提交前 evaluateAll 兜底
 *   - 顶部"规范适用"选择区降级为追溯用途：仅决定提交 rules 里的 rule_id，不再控制校验是否生效
 *
 * 暴露接口（与 web-admin submission/edit.vue 对齐）：formRef / formFields / getFormData / setFormData / validate
 */
import { computed, ref, watch } from 'vue';

import { Button, Form, Select } from 'antdv-next';
import { cloneDeep, isEqual } from 'lodash-es';

import Resource from '#/api/resource';
import AppField from '#/components/AppField.vue';
import { toAntdRules } from '#/composables/use-field-rules';

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

// ---- base_rules 选中状态（按 rule_category 互斥）----
const baseRuleSelected = ref({}); // { ruleCategoryId: rule_id }
const fieldBaseRule = ref({}); // { _fieldId: 当前应用的 rule_id }

// ---- 单位工程字段联动 ----
const unitProjectFieldId = ref(null);
const unitProjectCodeFieldId = ref(null);
const unitProjects = ref([]);

// ---- 字段 ref 集合（用于 AppField.upload 批次）----
const fieldRefs = ref({}); // _fieldId -> AppField 实例
const listFieldRefs = ref({}); // `${listFieldId}_${rowIndex}_${subFieldId}` -> AppField 实例

const formRef = ref(null);

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
      type === 'videos' || type === 'video'
        ? 'video'
        : type === 'images' || type === 'image'
          ? 'image'
          : 'file';
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
function buildFieldValidation(field) {
  const required = !!field.required && !props.readonly;
  const rules = props.readonly ? [] : toAntdRules(field, field.rules || []);
  return { required, rules };
}

// 初始化 base_rules（按 rule_category 互斥取一个 rule_id）
function initBaseRules() {
  const categories = {};
  for (const field of formFields.value) {
    const baseRules = field.rules?.filter((r) => r.rule_id > 0) || [];
    for (const r of baseRules) {
      const catId = r.rule_category_id;
      if (!categories[catId]) {
        categories[catId] = {
          id: catId,
          name: r.rule_category_name,
          rules: [],
        };
      }
      const exists = categories[catId].rules.find((x) => x.id === r.rule_id);
      if (!exists) {
        categories[catId].rules.push({
          id: r.rule_id,
          category_id: catId,
          name: r.rule_name,
          _initial: r, // 保留原始 base_rule（便于附加 level/message/type/value）
        });
      }
    }
  }
  // 默认选每个分类的第一条；若外部 rules 已指定，则取其匹配
  for (const catId in categories) {
    const list = categories[catId].rules;
    baseRuleSelected.value[catId] = list[0].id;
    for (const fieldKey in props.rules) {
      const matched = list.find(
        (r) => String(r.id) === String(props.rules[fieldKey]),
      );
      if (matched) {
        baseRuleSelected.value[catId] = matched.id;
        break;
      }
    }
  }
  // 为每个字段计算其当前应用的 base_rule rule_id
  recomputeFieldBaseRule();
}

function recomputeFieldBaseRule() {
  for (const field of formFields.value) {
    const baseRules = field.rules?.filter((r) => r.rule_id > 0) || [];
    if (baseRules.length === 0) {
      fieldBaseRule.value[fkey(field)] = null;
      continue;
    }
    const catId = baseRules[0].rule_category_id;
    fieldBaseRule.value[fkey(field)] = baseRuleSelected.value[catId] ?? null;
  }
}

function changeBaseRule(categoryId, ruleId) {
  baseRuleSelected.value[categoryId] = ruleId;
  recomputeFieldBaseRule();
}

// ---- 加载 form.fields ----
async function loadForm() {
  if (!props.formId) return;
  const { data } = await new Resource('forms').get(props.formId, {
    project_id: props.projectId,
  });
  formFields.value = data.fields || [];
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
function onFieldUpdate(field, value) {
  formData.value[fkey(field)] = value;
  // 单位工程 code 联动
  if (field.type === 'unit_project' && unitProjectCodeFieldId.value) {
    const up = unitProjects.value.find((u) => u.name === value);
    if (up) {
      formData.value[fkey({ id: unitProjectCodeFieldId.value })] = up.code;
    }
  }
}

function onListFieldUpdate(listField, rowIndex, subField, value) {
  const listKey = fkey(listField);
  if (!listRows.value[listKey]) listRows.value[listKey] = [];
  if (!listRows.value[listKey][rowIndex])
    listRows.value[listKey][rowIndex] = {};
  listRows.value[listKey][rowIndex][fkey(subField)] = value;
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
// 普通字段：内置规则（required）+ schema 全量 rules + level 区分
function formatRule(rule, fieldType) {
  const type = rule.type;
  const isNumeric = [
    'digit',
    'humidity',
    'number',
    'temperature',
    'wind',
  ].includes(fieldType);
  const errMsg = rule.message || '格式有误';
  switch (type) {
    case 'eq': {
      return (v) => String(v) === String(rule.value) || errMsg;
    }
    case 'max':
    case 'maxLength': {
      if (isNumeric) return (v) => v <= Number.parseFloat(rule.value) || errMsg;
      return (v) => (!!v && String(v).length <= Number(rule.value)) || errMsg;
    }
    case 'min':
    case 'minLength': {
      if (isNumeric) return (v) => v >= Number.parseFloat(rule.value) || errMsg;
      return (v) => (!!v && String(v).length >= Number(rule.value)) || errMsg;
    }
    case 'range': {
      const range = Array.isArray(rule.value)
        ? rule.value
        : String(rule.value).split('-');
      const lo = Number.parseFloat(range[0]);
      const hi = Number.parseFloat(range[1]);
      return (v) => (v >= lo && v <= hi) || errMsg;
    }
    case 'required': {
      if (fieldType !== 'switch' && !isNumeric) {
        return (v) => {
          if (v === null || v === undefined) return errMsg;
          if (Array.isArray(v)) return v.length > 0 || errMsg;
          if (typeof v === 'string') return v.trim().length > 0 || errMsg;
          return !!v || errMsg;
        };
      }
      return (v) => (v !== undefined && v !== null) || errMsg;
    }
    default: {
      return (v) => String(v) === String(rule.value) || errMsg;
    }
  }
}

function getFieldRules(field) {
  const list = { errors: [], warnings: [] };
  const builtin = field.required
    ? [
        {
          type: 'required',
          message: `${field.name.length < 10 ? field.name : '该字段'}必填`,
          level: 1,
        },
      ]
    : [];
  // P3-V01/V02：base_rules 不再按 rule_id 过滤——FormSchemaService 已全量输出，前端全量校验
  const baseRules = field.rules || [];
  const all = [...builtin, ...baseRules];
  for (const r of all) {
    if (r.type === 'required') continue; // required 已由 builtin 注入，避免重复
    const fn = formatRule(r, field.type);
    if (r.level === 2) list.warnings.push({ rule: r, fn });
    else list.errors.push({ rule: r, fn });
  }
  return list;
}

// 计算所有字段的 warnings/errors
function evaluateAll() {
  const errors = {};
  const warnings = {};
  for (const field of renderFields.value) {
    if (field._renderType === 'list') continue;
    const { errors: fe, warnings: fw } = getFieldRules(field);
    const v = formData.value[fkey(field)];
    for (const item of fe) {
      const r = item.fn(v);
      if (r !== true && r !== undefined) {
        errors[fkey(field)] = { rule: item.rule, value: v, message: r };
      }
    }
    if (!errors[fkey(field)]) {
      const ws = [];
      for (const item of fw) {
        const r = item.fn(v);
        if (r !== true && r !== undefined) {
          ws.push({ rule: item.rule, value: v, message: r });
        }
      }
      if (ws.length > 0) warnings[fkey(field)] = ws;
    }
  }
  return { errors, warnings };
}

function evaluateList(listField, rowIndex) {
  const errors = {};
  const warnings = [];
  const row = (listRows.value[fkey(listField)] || [])[rowIndex] || {};
  for (const sub of listField._subFields || []) {
    const builtin = sub.required
      ? [{ type: 'required', message: `${sub.name}必填`, level: 1 }]
      : [];
    // P3-V01/V02：base_rules 不再按 rule_id 过滤——FormSchemaService 已全量输出，前端全量校验
    const baseRules = sub.rules || [];
    const all = [...builtin, ...baseRules];
    const v = row[fkey(sub)];
    for (const r of all) {
      const fn = formatRule(r, sub.type);
      const res = fn(v);
      if (res !== true && res !== undefined) {
        if (r.level === 2) {
          warnings.push({ rule: r, value: v, message: res });
        } else {
          errors[subListKey(listField.id, rowIndex, sub.id)] = {
            rule: r,
            message: res,
          };
        }
      }
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

const baseRuleGroups = computed(() => {
  const groups = {};
  for (const catId in baseRuleSelected.value) {
    const cat = { id: catId, name: '', rules: [] };
    for (const f of formFields.value) {
      const baseRules = f.rules?.filter((r) => r.rule_id > 0) || [];
      for (const r of baseRules) {
        if (String(r.rule_category_id) === String(catId)) {
          cat.name = r.rule_category_name;
          if (!cat.rules.some((x) => x.id === r.rule_id)) {
            cat.rules.push({ id: r.rule_id, name: r.rule_name });
          }
        }
      }
    }
    groups[catId] = cat;
  }
  return groups;
});

// 监听 values 外部变化（如切换编辑行）
watch(
  () => props.values,
  (v) => {
    if (formFields.value.length > 0) setValues(v || []);
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
    if (formFields.value.length > 0) initBaseRules();
  },
  { deep: true },
);

loadForm();
</script>

<template>
  <div class="submission-edit">
    <!-- base_rules 顶部选择区（按 rule_category 互斥）-->
    <div
      v-if="Object.keys(baseRuleGroups).length"
      class="mb-4 rounded border border-gray-200 bg-gray-50 p-3"
    >
      <div class="mb-2 text-sm font-semibold text-gray-600">规范适用</div>
      <div class="flex flex-wrap gap-4">
        <div
          v-for="(cat, catId) in baseRuleGroups"
          :key="catId"
          class="flex items-center gap-2"
        >
          <span class="text-sm text-gray-500">{{ cat.name }}</span>
          <Select
            :value="baseRuleSelected[catId]"
            style="width: 160px"
            size="small"
            @change="(v) => changeBaseRule(catId, v)"
          >
            <Select.Option v-for="r in cat.rules" :key="r.id" :value="r.id">
              {{ r.name }}
            </Select.Option>
          </Select>
        </div>
      </div>
    </div>

    <Form ref="formRef" :model="formModel" layout="vertical">
      <template v-for="field in renderFields" :key="field._key">
        <!-- list 字段：嵌套子表 -->
        <div
          v-if="field._renderType === 'list'"
          class="mb-4 rounded border p-3"
        >
          <div class="mb-2 flex items-center justify-between">
            <div class="text-sm font-semibold text-gray-600">
              {{ field.name
              }}<span v-if="field.required" class="text-red-500">*</span>
            </div>
            <Button
              v-if="!readonly"
              size="small"
              type="dashed"
              @click="addListRow(field)"
            >
              + 新增行
            </Button>
          </div>
          <div
            v-for="(row, rowIndex) in listRows[field._key] || []"
            :key="rowIndex"
            class="mb-3 rounded bg-gray-50 p-3"
          >
            <div class="flex flex-wrap gap-3">
              <div
                v-for="sub in field._subFields || []"
                :key="sub.id"
                class="min-w-[120px] flex-1"
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
              </div>
            </div>
            <div v-if="!readonly" class="mt-2 text-right">
              <Button
                type="link"
                danger
                size="small"
                @click="removeListRow(field, rowIndex)"
              >
                删除本行
              </Button>
            </div>
          </div>
          <div
            v-if="!(listRows[field._key] || []).length"
            class="py-4 text-center text-sm text-gray-400"
          >
            暂无数据，点击"+ 新增行"
          </div>
        </div>

        <!-- 常规字段 -->
        <AppField
          v-else
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
      </template>
    </Form>
  </div>
</template>
