/**
 * 表单字段定义（forms.fields_schema）的纯逻辑层：类型元数据、草稿 ⇄ 存储转换、
 * 选项文本编解码、默认校验规则的编解码与校验。
 *
 * 协议对齐后端 `App\Services\FormSchemaService`（normalize / normalizeField /
 * normalizeValidation / normalizeRules）与前端 `packages/website/ui/src/lib/rules.ts`。
 *
 * 规则设计（严格对齐 zyzz 表单管理 P3-V15/V16 行式先后连接编辑器）：
 * - 只保留「默认规则」：bundle 的 rule_id 恒为 0（恒生效），不做多规范管理；
 * - 行式编辑器模型：每行 = { type, value, level, message, connector }，
 *   connector 为 outgoing 语义（rows[N].connector = 第 N 行连接到第 N+1 行的方式）：
 *   连续 and 同组（组内 AND 全部须满足），遇到 or 另起一组（组间 OR）；
 * - 存储 bundle：expr = { connector: 'or', children: [{ connector: 'and', children: leaves }] }，
 *   根固定 or、组内固定 and；规则引擎（rules.ts / 后端 normalizeRuleExpr）支持任意嵌套树；
 * - 级别：1 = 错误（阻断提交）、2 = 警告（仅提示），引擎与后端均支持。
 */

export const DEFAULT_RULE_ID = 0;
export const RULE_LEVELS = [
  { value: 1, label: '错误' },
  { value: 2, label: '警告' },
];

/** 后端 FormSchemaService::FIELD_TYPES */
export const FIELD_TYPES = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'email', label: '邮箱' },
  { value: 'tel', label: '电话' },
  { value: 'url', label: '网址' },
  { value: 'number', label: '数字' },
  { value: 'radio', label: '单选' },
  { value: 'checkbox', label: '多选' },
  { value: 'select', label: '下拉选择' },
  { value: 'date', label: '日期' },
  { value: 'time', label: '时间' },
  { value: 'datetime', label: '日期时间' },
  { value: 'address', label: '地址' },
  { value: 'consent', label: '同意项' },
  { value: 'file', label: '文件' },
  { value: 'group', label: '字段组（可重复）' },
  { value: 'list', label: '列表（可重复，表格）' },
];

/** 后端 FormSchemaService::FILE_ACCEPTS */
export const FILE_ACCEPTS = [
  { value: 'image/*', label: '图片' },
  { value: 'video/*', label: '视频' },
  { value: 'audio/*', label: '音频' },
  { value: 'application/pdf', label: 'PDF' },
  { value: 'text/plain', label: 'TXT' },
  { value: 'text/csv', label: 'CSV' },
  { value: 'application/msword', label: 'DOC' },
  {
    value:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'DOCX',
  },
  { value: 'application/vnd.ms-excel', label: 'XLS' },
  {
    value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'XLSX',
  },
];

/** 字段组内不允许再嵌套 group / list / file（后端 normalizeField 同样限制） */
export const CHILD_FIELD_TYPES = FIELD_TYPES.filter(
  (item) => !['group', 'list', 'file'].includes(item.value),
);

export const SPAN_OPTIONS = [
  { value: 12, label: '整行（12/12）' },
  { value: 8, label: '三分之二（8/12）' },
  { value: 6, label: '二分之一（6/12）' },
  { value: 4, label: '三分之一（4/12）' },
  { value: 3, label: '四分之一（3/12）' },
];

export const DATE_TYPE_OPTIONS = [
  { value: 'date', label: '年月日' },
  { value: 'month', label: '年月' },
  { value: 'year', label: '年份' },
];

export const LABEL_POSITION_OPTIONS = [
  { value: 'top', label: '标签在上' },
  { value: 'left', label: '标签在左' },
  { value: 'hidden', label: '隐藏标签' },
];

export const SUBMIT_ALIGN_OPTIONS = [
  { value: 'left', label: '居左' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '居右' },
  { value: 'stretch', label: '撑满' },
];

export const GAP_OPTIONS = [
  { value: 'sm', label: '紧凑' },
  { value: 'md', label: '标准' },
  { value: 'lg', label: '宽松' },
];

export const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const OPTION_TYPES = ['radio', 'checkbox', 'select'];
const NUMERIC_VALIDATION_KEYS = new Set([
  'min_length',
  'max_length',
  'min',
  'max',
  'min_selected',
  'max_selected',
  'min_level',
  'max_level',
]);
const NUMERIC_RULE_TYPES = new Set([
  'min',
  'max',
  'gt',
  'lt',
  'ge',
  'le',
  'minLength',
  'maxLength',
]);
/** 随字段类型出现/消失的键，切换类型时需清理旧类型的残留 */
const TYPE_SPECIFIC_KEYS = [
  'options',
  'multiple',
  'rows',
  'date_type',
  'accept',
  'min_files',
  'max_files',
  'max_file_size_mb',
  'fields',
  'repeatable',
  'render',
];

function clampNum(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export function isOptionType(type) {
  return OPTION_TYPES.includes(type);
}

export function isContainerType(type) {
  return type === 'group' || type === 'list';
}

/** 规则引擎只作用于标量字段（后端同样跳过 group / list） */
export function isRuleSupported(type) {
  return !isContainerType(type) && type !== 'file' && type !== 'address';
}

export function fieldTypeLabel(type) {
  return FIELD_TYPES.find((item) => item.value === type)?.label || type || '-';
}

/* ------------------------------------------------------------------ *
 * schema
 * ------------------------------------------------------------------ */

/** 归一化为 { layout, fields }，兼容裸数组（后端 normalize 同样兼容）。 */
export function normalizeSchemaInput(raw) {
  const source = Array.isArray(raw)
    ? { fields: raw }
    : raw && typeof raw === 'object'
      ? raw
      : {};
  const fields = Array.isArray(source.fields)
    ? source.fields.filter((f) => f && typeof f === 'object')
    : [];
  const layout =
    source.layout && typeof source.layout === 'object' ? source.layout : {};
  const pick = (value, allowed, fallback) =>
    allowed.includes(value) ? value : fallback;

  return {
    layout: {
      columns: 12,
      label_position: pick(layout.label_position, ['top', 'left', 'hidden'], 'top'),
      submit_align: pick(
        layout.submit_align,
        ['left', 'center', 'right', 'stretch'],
        'left',
      ),
      gap: pick(layout.gap, ['sm', 'md', 'lg'], 'md'),
    },
    fields,
  };
}

export function emptySchema() {
  return normalizeSchemaInput(null);
}

/** 字段数（兼容 { fields } 与裸数组两种存储形态） */
export function countFields(schema) {
  const normalized = normalizeSchemaInput(schema);
  return normalized.fields.length;
}

/** 生成同层级不重复的字段名，如 field_1、field_2 */
export function suggestFieldName(fields = [], base = 'field') {
  const used = new Set((fields || []).map((f) => f?.name).filter(Boolean));
  let index = 1;
  while (used.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

/* ------------------------------------------------------------------ *
 * 选项（options）
 * ------------------------------------------------------------------ */

/** [{ value, label }] → 文本，每行一个；label 与 value 相同时只写 value */
export function optionsToText(options) {
  return (options || [])
    .map((option) => {
      const value = String(option?.value ?? '').trim();
      const label = String(option?.label ?? '').trim();
      if (!value) return '';
      return label && label !== value ? `${value}=${label}` : value;
    })
    .filter(Boolean)
    .join('\n');
}

/** 文本 → [{ value, label }]：支持 `值` 与 `值=显示名` 两种写法，去重、去空 */
export function parseOptionsText(text) {
  const out = [];
  const seen = new Set();
  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf('=');
    let value = line;
    let label = line;
    if (separator > 0) {
      value = line.slice(0, separator).trim();
      label = line.slice(separator + 1).trim();
    }
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label: label || value });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 基础校验（field.validation，后端 validateValue 消费）
 * ------------------------------------------------------------------ */

/** 按字段类型给出可配置的基础校验项 */
export function validationFieldsFor(type, options = {}) {
  const multiple = !!options.multiple;
  const num = (key, label, min, max) => ({
    key,
    label,
    type: 'number',
    min,
    max,
  });
  const str = (key, label, placeholder) => ({
    key,
    label,
    type: 'text',
    placeholder,
  });
  const message = str('message', '错误提示', '不通过时的提示文案');

  switch (type) {
    case 'number':
      return [num('min', '最小值'), num('max', '最大值'), message];
    case 'text':
    case 'textarea':
    case 'email':
    case 'tel':
    case 'url':
      return [
        num('min_length', '最少字符数', 0, 100000),
        num('max_length', '最多字符数', 0, 100000),
        str('pattern', '正则表达式', '如 ^1[3-9]\\d{9}$'),
        message,
      ];
    case 'date':
    case 'datetime':
      return [
        str('min_date', '最早日期', 'YYYY-MM-DD'),
        str('max_date', '最晚日期', 'YYYY-MM-DD'),
        message,
      ];
    case 'checkbox':
    case 'select':
      return multiple
        ? [
            num('min_selected', '最少选择', 0, 100),
            num('max_selected', '最多选择', 0, 100),
            message,
          ]
        : [message];
    case 'address':
      return [
        num('min_level', '最少层级', 1, 5),
        num('max_level', '最多层级', 1, 5),
        message,
      ];
    case 'radio':
      return [message];
    default:
      return [];
  }
}

/** 去掉空值，数值键转数字 */
export function cleanValidation(validation) {
  const out = {};
  for (const [key, raw] of Object.entries(validation || {})) {
    if (raw === '' || raw === null || raw === undefined) continue;
    if (NUMERIC_VALIDATION_KEYS.has(key)) {
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      out[key] = n;
      continue;
    }
    out[key] = typeof raw === 'string' ? raw.trim() : raw;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 默认校验规则（field.rules，规则引擎消费）
 * ------------------------------------------------------------------ */

function ruleOption(value, label, needsValue = true) {
  return { value, label, needsValue };
}

/** 按字段类型给出可用的规则类型（叶子 type） */
export function ruleTypesFor(type) {
  if (!isRuleSupported(type)) return [];
  const required = ruleOption('required', '必填（不能为空）', false);
  if (type === 'consent') return [required];
  if (type === 'number') {
    return [
      required,
      ruleOption('min', '最小值（不低于）'),
      ruleOption('max', '最大值（不高于）'),
      ruleOption('gt', '大于'),
      ruleOption('lt', '小于'),
      ruleOption('ge', '大于等于'),
      ruleOption('le', '小于等于'),
      ruleOption('eq', '等于'),
      ruleOption('ne', '不等于'),
    ];
  }
  if (['date', 'datetime', 'time'].includes(type)) {
    return [required, ruleOption('eq', '等于'), ruleOption('ne', '不等于')];
  }
  if (isOptionType(type)) {
    return [
      required,
      ruleOption('eq', '等于'),
      ruleOption('ne', '不等于'),
      ruleOption('in', '属于（多值逗号分隔）'),
      ruleOption('not_in', '不属于（多值逗号分隔）'),
    ];
  }
  return [
    required,
    ruleOption('minLength', '最短长度（字符）'),
    ruleOption('maxLength', '最长长度（字符）'),
    ruleOption('eq', '等于'),
    ruleOption('ne', '不等于'),
    ruleOption('contains', '包含'),
    ruleOption('not_contains', '不包含'),
    ruleOption('starts_with', '以…开头'),
    ruleOption('not_starts_with', '不以…开头'),
    ruleOption('ends_with', '以…结尾'),
    ruleOption('not_ends_with', '不以…结尾'),
    ruleOption('in', '属于（多值逗号分隔）'),
    ruleOption('not_in', '不属于（多值逗号分隔）'),
  ];
}

export function ruleTypeLabel(type, fieldType) {
  return (
    ruleTypesFor(fieldType).find((item) => item.value === type)?.label ||
    type ||
    '-'
  );
}

/** 递归收集表达式里的叶子（兼容任意嵌套树与遗留扁平结构），用于规则计数 */
function collectLeaves(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectLeaves(child, out);
    return out;
  }
  if (typeof node.type === 'string') {
    out.push(node);
  }
  return out;
}

/** 取字段的默认规则（rule_id = 0）叶子列表 */
export function fieldRuleLeaves(field) {
  const rules = Array.isArray(field?.rules) ? field.rules : [];
  const bundle = rules.find(
    (rule) => Number(rule?.rule_id ?? 0) === DEFAULT_RULE_ID,
  );
  if (!bundle) return [];
  return collectLeaves(bundle.expr);
}

/**
 * bundle → 行式编辑器行（严格对齐 zyzz P3-V16 bundleToEditorRows）：
 *   rows[N].connector = 从第 N 行连接到第 N+1 行的方式（outgoing 语义）
 *   - 组内连续行 connector = 该组的 connector（AND/OR）
 *   - 跨组边界行 connector = 根 connector（组之间的连接方式）
 *   - 末尾行 connector 与下一行无关，默认 and
 * 兼容迁移：遗留扁平叶子包成单行；range 叶子拆成 min + max 两行。
 */
export function bundleToEditorRows(bundle) {
  if (!bundle) return [];
  const expr = bundle.expr || { connector: 'and', children: [] };

  function migrate(node) {
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'string') {
      if (node.type === 'range') {
        const range = Array.isArray(node.value)
          ? node.value
          : String(node.value ?? '').split('-');
        const lo = Number.parseFloat(range[0]);
        const hi = Number.parseFloat(range[1]);
        const base = {
          level: Number(node.level ?? 1),
          message: node.message || '',
        };
        return [
          { ...base, type: 'min', value: Number.isNaN(lo) ? '' : lo },
          { ...base, type: 'max', value: Number.isNaN(hi) ? '' : hi },
        ];
      }
      return { ...node };
    }
    const children = [];
    for (const child of node.children || []) {
      const migrated = migrate(child);
      if (Array.isArray(migrated)) children.push(...migrated);
      else children.push(migrated);
    }
    return { connector: node.connector === 'or' ? 'or' : 'and', children };
  }

  const migrated = migrate(expr);
  function getLeaves(node) {
    if (!node) return [];
    if (typeof node.type === 'string') return [node];
    const out = [];
    for (const child of node.children || []) out.push(...getLeaves(child));
    return out;
  }

  const topGroups = (migrated.children || []).filter(
    (child) => getLeaves(child).length > 0,
  );
  if (topGroups.length === 0) return [];
  const groupCount = topGroups.length;
  const rows = [];
  for (let gi = 0; gi < groupCount; gi++) {
    const group = topGroups[gi];
    const leaves = getLeaves(group);
    for (let li = 0; li < leaves.length; li++) {
      const lastInGroup = li === leaves.length - 1;
      const lastGroup = gi === groupCount - 1;
      const row = { ...leaves[li] };
      if (!lastInGroup) {
        row.connector = group.connector === 'or' ? 'or' : 'and';
      } else if (lastGroup) {
        row.connector = 'and';
      } else {
        row.connector = migrated.connector === 'or' ? 'or' : 'and';
      }
      rows.push(row);
    }
  }
  return rows;
}

/** 清洗编辑器行 → 存储叶子（数字类型值转 number，message/level 兜底） */
function cleanEditorLeaf(row) {
  const leaf = {
    type: row.type,
    message: String(row.message ?? '').trim() || '格式有误',
    level: Number(row.level) === 2 ? 2 : 1,
  };
  const raw = row.value;
  if (raw !== '' && raw !== null && raw !== undefined) {
    leaf.value = NUMERIC_RULE_TYPES.has(row.type) ? Number(raw) : raw;
  }
  return leaf;
}

/**
 * 行式编辑器行 → bundle（严格对齐 zyzz P3-V16 fromEditorRows）：
 * rows[N].connector 为「第 N 行 → 第 N+1 行」的连接方式，
 * 「上一行与本行」的连接 = rows[N-1].connector，据此拆分组。
 * 根默认 Or，组内默认 And；行列表为空返回 null。
 */
export function editorRowsToBundle(rows, ruleId = DEFAULT_RULE_ID) {
  const valid = (rows || []).filter(
    (row) => row && row.type && String(row.message ?? '').trim(),
  );
  if (valid.length === 0) return null;
  const groups = [];
  let current = [];
  for (let i = 0; i < valid.length; i++) {
    // connector 只用于上面推算分组边界（下一行读 valid[i-1].connector），
    // 这里把它摘掉，避免混进规则体；下划线前缀表示有意不用。
    const { connector: _connector, ...rest } = valid[i];
    if (i === 0) {
      current.push(rest);
    } else {
      const forward = (valid[i - 1].connector || 'and') === 'or' ? 'or' : 'and';
      if (forward === 'and') {
        current.push(rest);
      } else {
        groups.push(current);
        current = [rest];
      }
    }
  }
  if (current.length > 0) groups.push(current);
  return {
    rule_id: Number(ruleId) || 0,
    expr: {
      connector: 'or',
      children: groups.map((group) => ({
        connector: 'and',
        children: group.map(cleanEditorLeaf),
      })),
    },
  };
}

/** 取字段的默认规则编辑器行（outgoing connector），供行式规则弹窗初始化 */
export function fieldRuleEditorRows(field) {
  const rules = Array.isArray(field?.rules) ? field.rules : [];
  const bundle = rules.find(
    (rule) => Number(rule?.rule_id ?? 0) === DEFAULT_RULE_ID,
  );
  return bundleToEditorRows(bundle || null).map((row) => ({
    type: row.type,
    value: row.value ?? '',
    level: Number(row.level) === 2 ? 2 : 1,
    message: row.message || '格式有误',
    connector: row.connector === 'or' ? 'or' : 'and',
  }));
}

export function countFieldRules(field) {
  return fieldRuleLeaves(field).length;
}

/**
 * 把编辑器里的规则行写回字段：始终生成 rule_id = 0 的默认 bundle
 * （行式 And/Or 分组，根 or、组内 and）。行列表为空则移除默认规则
 * （其他 rule_id 的 bundle 原样保留）。
 */
export function setFieldRuleLeaves(field, rows) {
  // 对象展开对 nullish 本身合法（结果就是 {}），`|| {}` 属冗余。
  const next = { ...field };
  const others = (Array.isArray(next.rules) ? next.rules : []).filter(
    (rule) => Number(rule?.rule_id ?? 0) !== DEFAULT_RULE_ID,
  );
  const bundle = editorRowsToBundle(rows || [], DEFAULT_RULE_ID);
  if (!bundle) {
    if (others.length) next.rules = others;
    else delete next.rules;
    return next;
  }
  next.rules = [bundle, ...others];
  return next;
}

/* ------------------------------------------------------------------ *
 * 草稿 ⇄ 存储
 * ------------------------------------------------------------------ */

export function createFieldDraft(type = 'text', fields = []) {
  return {
    _original: null,
    name: suggestFieldName(fields),
    type,
    label: '',
    placeholder: '',
    help: '',
    required: false,
    default: '',
    optionsText: '',
    multiple: false,
    rows: 5,
    date_type: 'date',
    span: 12,
    validation: {},
    accept: ['image/*'],
    min_files: 0,
    max_files: 1,
    max_file_size_mb: 10,
    fields: [],
    repeatable: {
      min_items: 0,
      max_items: 10,
      add_text: '添加一项',
      remove_text: '删除',
      item_label: '第 {index} 项',
    },
    rules: [],
  };
}

export function fieldToDraft(field) {
  const source = field && typeof field === 'object' ? field : {};
  const type = FIELD_TYPES.some((item) => item.value === source.type)
    ? source.type
    : 'text';

  return {
    _original: source,
    name: String(source.name ?? '').trim(),
    type,
    label: String(source.label ?? ''),
    placeholder: String(source.placeholder ?? ''),
    help: String(source.help ?? ''),
    required: !!source.required,
    default:
      source.default === null || source.default === undefined
        ? ''
        : source.default,
    optionsText: optionsToText(source.options),
    multiple: !!source.multiple,
    rows: clampNum(source.rows, 2, 20, 5),
    date_type: ['date', 'month', 'year'].includes(source.date_type)
      ? source.date_type
      : 'date',
    span: clampNum(source.layout?.span, 1, 12, 12),
    validation: { ...source.validation },
    accept:
      Array.isArray(source.accept) && source.accept.length
        ? [...source.accept]
        : ['image/*'],
    min_files: clampNum(source.min_files, 0, 10, 0),
    max_files: clampNum(source.max_files, 1, 10, 1),
    max_file_size_mb: clampNum(source.max_file_size_mb, 1, 50, 10),
    fields: Array.isArray(source.fields) ? source.fields.map(fieldToDraft) : [],
    repeatable: {
      min_items: clampNum(source.repeatable?.min_items, 0, 20, 0),
      max_items: clampNum(source.repeatable?.max_items, 1, 20, 10),
      add_text: source.repeatable?.add_text || '添加一项',
      remove_text: source.repeatable?.remove_text || '删除',
      item_label: source.repeatable?.item_label || '第 {index} 项',
    },
    rules: Array.isArray(source.rules) ? source.rules : [],
  };
}

function applicableKeys(type) {
  const keys = [];
  if (isOptionType(type)) keys.push('options');
  if (type === 'select') keys.push('multiple');
  if (type === 'textarea') keys.push('rows');
  if (type === 'date') keys.push('date_type');
  if (type === 'file') {
    keys.push('accept', 'min_files', 'max_files', 'max_file_size_mb');
  }
  if (isContainerType(type)) keys.push('fields', 'repeatable', 'render');
  return keys;
}

/**
 * 草稿 → 存储字段。以原字段为底稿覆盖已知键，保留编辑器未覆盖的键
 * （visible_when / required_when / disabled_when / style 等）；
 * 切换类型后清理新类型不适用的键。
 */
export function draftToField(draft) {
  const type = draft.type;
  const original =
    draft._original && typeof draft._original === 'object'
      ? draft._original
      : {};
  const out = { ...original };

  out.name = String(draft.name ?? '').trim();
  out.type = type;
  out.label = String(draft.label ?? '').trim() || out.name;
  out.placeholder = String(draft.placeholder ?? '').trim();
  out.help = String(draft.help ?? '').trim();
  out.required = !!draft.required;
  // 平板沿用桌面栅格，手机恒为整行（后端 span_mobile 缺省 12）
  out.layout = {
    span: clampNum(draft.span, 1, 12, 12),
    span_tablet: clampNum(draft.span, 1, 12, 12),
    span_mobile: 12,
  };
  out.validation = cleanValidation(draft.validation);

  const empty = draft.default === '' || draft.default === null || draft.default === undefined;
  if (isContainerType(type)) {
    out.default = [];
  } else if (type === 'consent') {
    out.default = !!draft.default;
  } else if (empty) {
    delete out.default;
  } else {
    out.default = type === 'number' ? Number(draft.default) : draft.default;
  }

  const keep = new Set(applicableKeys(type));
  for (const key of TYPE_SPECIFIC_KEYS) {
    if (!keep.has(key)) delete out[key];
  }
  if (isOptionType(type)) out.options = parseOptionsText(draft.optionsText);
  if (type === 'select') out.multiple = !!draft.multiple;
  if (type === 'textarea') out.rows = clampNum(draft.rows, 2, 20, 5);
  if (type === 'date') out.date_type = draft.date_type;
  if (type === 'file') {
    out.accept = (draft.accept || []).filter((item) =>
      FILE_ACCEPTS.some((allowed) => allowed.value === item),
    );
    if (out.accept.length === 0) out.accept = ['image/*'];
    out.min_files = clampNum(draft.min_files, out.required ? 1 : 0, 10, 0);
    out.max_files = clampNum(draft.max_files, 1, 10, 1);
    if (out.min_files > out.max_files) out.min_files = out.max_files;
    out.max_file_size_mb = clampNum(draft.max_file_size_mb, 1, 50, 10);
  }
  if (isContainerType(type)) {
    out.fields = (draft.fields || []).map(draftToField);
    out.render = original.render || (type === 'list' ? 'grid' : 'stacked');
    const minItems = clampNum(draft.repeatable?.min_items, 0, 20, 0);
    const maxItems = clampNum(draft.repeatable?.max_items, 1, 20, 10);
    out.repeatable = {
      min_items: Math.min(minItems, maxItems),
      max_items: maxItems,
      add_text: String(draft.repeatable?.add_text || '添加一项').slice(0, 40),
      remove_text: String(draft.repeatable?.remove_text || '删除').slice(0, 40),
      item_label: String(draft.repeatable?.item_label || '第 {index} 项').slice(
        0,
        60,
      ),
    };
  }

  if (Array.isArray(draft.rules) && draft.rules.length) out.rules = draft.rules;
  else delete out.rules;

  return out;
}

/* ------------------------------------------------------------------ *
 * 校验（保存前的前端守卫）
 * ------------------------------------------------------------------ */

function validateName(name) {
  if (!NAME_PATTERN.test(String(name ?? '').trim())) {
    return '字段名需以字母开头，仅含字母/数字/下划线（最长 64 位）';
  }
  return null;
}

function validateValidation(draft) {
  const v = draft.validation || {};
  const has = (key) => v[key] !== '' && v[key] !== null && v[key] !== undefined;

  for (const key of ['min_date', 'max_date']) {
    if (has(key) && !DATE_PATTERN.test(String(v[key]))) {
      return '日期需为 YYYY-MM-DD 格式';
    }
  }

  const numberPairs = [
    ['min_length', 'max_length', '最少字符数不能大于最多字符数'],
    ['min', 'max', '最小值不能大于最大值'],
    ['min_selected', 'max_selected', '最少选择数不能大于最多选择数'],
    ['min_level', 'max_level', '最少层级不能大于最多层级'],
  ];
  for (const [minKey, maxKey, message] of numberPairs) {
    if (
      has(minKey) &&
      has(maxKey) &&
      Number(v[minKey]) > Number(v[maxKey])
    ) {
      return message;
    }
  }
  if (
    has('min_date') &&
    has('max_date') &&
    String(v.min_date) > String(v.max_date)
  ) {
    return '最早日期不能晚于最晚日期';
  }

  if (has('pattern')) {
    try {
      new RegExp(String(v.pattern));
    } catch {
      return '正则表达式格式无效';
    }
  }
  return null;
}

/** 字段草稿校验：返回错误文案或 null（子字段只做轻量校验） */
export function validateFieldDraft(draft, options = {}) {
  const existingNames = options.existingNames || [];
  const nameError = validateName(draft?.name);
  if (nameError) return nameError;
  const name = String(draft.name).trim();
  if (existingNames.includes(name)) return `字段名 ${name} 已存在`;
  if (!FIELD_TYPES.some((item) => item.value === draft.type)) {
    return '请选择字段类型';
  }
  if (!String(draft.label ?? '').trim()) return '请填写字段标签';
  if (
    isOptionType(draft.type) &&
    parseOptionsText(draft.optionsText).length === 0
  ) {
    return '「单选/多选/下拉选择」至少需要一个选项';
  }
  const validationError = validateValidation(draft);
  if (validationError) return validationError;

  if (draft.type === 'file') {
    const minFiles = Number(draft.min_files ?? 0);
    const maxFiles = Number(draft.max_files ?? 1);
    if (minFiles > maxFiles) return '最少文件数不能大于最多文件数';
  }

  if (isContainerType(draft.type)) {
    const children = draft.fields || [];
    if (children.length === 0) return '字段组至少需要一个子字段';
    const seen = new Set();
    for (const child of children) {
      const childError = validateName(child?.name);
      if (childError) return `子字段：${childError}`;
      const childName = String(child.name).trim();
      if (seen.has(childName)) return `子字段名 ${childName} 重复`;
      seen.add(childName);
      if (!String(child.label ?? '').trim()) {
        return `子字段 ${childName} 未填写标签`;
      }
      if (
        isOptionType(child.type) &&
        parseOptionsText(child.optionsText).length === 0
      ) {
        return `子字段 ${childName} 至少需要一个选项`;
      }
    }
    const minItems = Number(draft.repeatable?.min_items ?? 0);
    const maxItems = Number(draft.repeatable?.max_items ?? 10);
    if (minItems > maxItems) return '最少项数不能大于最多项数';
  }

  return null;
}

/** 规则行校验：每行需有类型、级别和不通过提示；值按需校验 */
export function validateRuleRows(rows, fieldType) {
  const allowed = ruleTypesFor(fieldType);
  for (const row of rows || []) {
    if (!row?.type) return '请为每行选择规则类型';
    const meta = allowed.find((item) => item.value === row.type);
    if (!meta) return `字段类型不支持规则「${row.type}」`;
    if (!String(row.message ?? '').trim()) return '每行需填写不通过提示';
    if (Number(row.level) !== 1 && Number(row.level) !== 2) {
      return '请为每行选择级别（错误/警告）';
    }
    const emptyValue =
      row.value === '' || row.value === null || row.value === undefined;
    if (meta.needsValue && emptyValue) return `「${meta.label}」需要填写值`;
    if (
      meta.needsValue &&
      NUMERIC_RULE_TYPES.has(row.type) &&
      !Number.isFinite(Number(row.value))
    ) {
      return `「${meta.label}」的值需为数字`;
    }
  }
  return null;
}
