/**
 * PC 动态表单规则引擎。
 *
 * 规则结构与移动端保持一致：
 *   bundle = { rule_id, expr: { connector: 'and'|'or', children: [...] } }
 *   leaf   = { type, value, message, level: 1|2 }
 *
 * level=1 是错误，阻止提交；level=2 是警告，只提示不阻止提交。
 * And/Or 使用惰性求值：AND 首个失败即止，OR 首个通过即止。
 */

const NUMERIC_TYPES = new Set([
  'number',
  'digit',
  'decimal',
  'integer',
  'float',
  'numeric',
  'humidity',
  'temperature',
  'wind',
]);

function normalizeFieldType(fieldType) {
  if (fieldType && typeof fieldType === 'object') {
    return String(fieldType.value || fieldType.type || '').toLowerCase();
  }
  return String(fieldType || '').toLowerCase();
}

export function isEmptyVal(value) {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** 将同一 rule_id 的多个规则表达式合并为 AND，兼容旧版扁平叶子。 */
export function normalizeRuleBundles(rules = []) {
  const grouped = {};
  const metadata = {};

  for (const entry of rules || []) {
    if (!entry || typeof entry !== 'object') continue;
    const ruleId = Number(entry.rule_id || 0);
    grouped[ruleId] ||= [];
    metadata[ruleId] ||= entry;

    if (entry.expr && Array.isArray(entry.expr.children)) {
      grouped[ruleId].push(entry.expr);
    } else if (typeof entry.type === 'string') {
      grouped[ruleId].push({
        connector: 'and',
        children: [
          {
            ...entry,
            rule_id: undefined,
          },
        ],
      });
    }
  }

  return Object.entries(grouped).map(([ruleId, exprs]) => ({
    rule_id: Number(ruleId),
    expr:
      exprs.length === 1 ? exprs[0] : { connector: 'and', children: exprs },
    rule_name: metadata[ruleId]?.rule_name ?? metadata[ruleId]?.name,
    rule_category_id: metadata[ruleId]?.rule_category_id,
    rule_category_name: metadata[ruleId]?.rule_category_name,
  }));
}

/** 单个叶子求值：通过返回 true，失败返回提示文本。 */
export function checkLeaf(leaf, value, fieldType = 'text') {
  const type = leaf.type;
  const message = leaf.message || '格式有误';
  const numeric = NUMERIC_TYPES.has(normalizeFieldType(fieldType));
  const text = () =>
    value === null || value === undefined ? '' : String(value);

  switch (type) {
    case 'required': {
      if (fieldType !== 'switch' && !numeric) {
        if (value === null || value === undefined) return message;
        if (Array.isArray(value)) return value.length > 0 ? true : message;
        if (typeof value === 'string')
          return value.trim().length > 0 ? true : message;
        return value ? true : message;
      }
      return value !== undefined && value !== null ? true : message;
    }
    case 'eq': {
      return String(value) === String(leaf.value) ? true : message;
    }
    case 'ne': {
      return String(value) === String(leaf.value) ? message : true;
    }
    case 'min':
    case 'minLength': {
      if (numeric) {
        return Number(value) >= Number.parseFloat(leaf.value) ? true : message;
      }
      return text().length >= Number(leaf.value) ? true : message;
    }
    case 'max':
    case 'maxLength': {
      if (numeric) {
        return Number(value) <= Number.parseFloat(leaf.value) ? true : message;
      }
      return text().length <= Number(leaf.value) ? true : message;
    }
    case 'gt': {
      return Number(value) > Number.parseFloat(leaf.value) ? true : message;
    }
    case 'lt': {
      return Number(value) < Number.parseFloat(leaf.value) ? true : message;
    }
    case 'ge': {
      return Number(value) >= Number.parseFloat(leaf.value) ? true : message;
    }
    case 'le': {
      return Number(value) <= Number.parseFloat(leaf.value) ? true : message;
    }
    case 'range': {
      const range = Array.isArray(leaf.value)
        ? leaf.value
        : String(leaf.value).split('-');
      const number = Number(value);
      return number >= Number.parseFloat(range[0]) &&
        number <= Number.parseFloat(range[1])
        ? true
        : message;
    }
    case 'contains': {
      return text().includes(String(leaf.value)) ? true : message;
    }
    case 'not_contains': {
      return text().includes(String(leaf.value)) ? message : true;
    }
    case 'starts_with': {
      return text().startsWith(String(leaf.value)) ? true : message;
    }
    case 'not_starts_with': {
      return text().startsWith(String(leaf.value)) ? message : true;
    }
    case 'ends_with': {
      return text().endsWith(String(leaf.value)) ? true : message;
    }
    case 'not_ends_with': {
      return text().endsWith(String(leaf.value)) ? message : true;
    }
    case 'in': {
      const values = Array.isArray(leaf.value)
        ? leaf.value.map(String)
        : String(leaf.value ?? '')
            .split(/[,，]/)
            .map((item) => item.trim())
            .filter(Boolean);
      if (Array.isArray(value)) {
        return value.length > 0 && value.every((item) => values.includes(String(item)))
          ? true
          : message;
      }
      return values.includes(String(value)) ? true : message;
    }
    default: {
      return true;
    }
  }
}

/** 递归惰性求值，返回 { pass, error: { leaf, message } | null }。 */
export function evalNode(node, value, fieldType = 'text') {
  if (node && Array.isArray(node.children)) {
    const isAnd = node.connector !== 'or';
    let firstError = null;
    for (const child of node.children) {
      const result = evalNode(child, value, fieldType);
      if (result.pass) {
        if (!isAnd) return { pass: true, error: null };
      } else {
        firstError ||= result.error;
        if (isAnd) return { pass: false, error: firstError };
      }
    }
    return isAnd
      ? { pass: true, error: null }
      : { pass: false, error: firstError };
  }

  if (node && typeof node.type === 'string') {
    // 非必填字段为空时，跳过普通规则；required 仍然必须校验。
    if (isEmptyVal(value) && node.type !== 'required') {
      return { pass: true, error: null };
    }
    const result = checkLeaf(node, value, fieldType);
    return result === true
      ? { pass: true, error: null }
      : { pass: false, error: { leaf: node, message: result } };
  }

  return { pass: true, error: null };
}

/**
 * 构造字段求值函数。selectedRuleId 为 null/undefined 时表示调用方已经完成规范过滤。
 */
export function buildRuleEvaluator(
  rules = [],
  fieldType = 'text',
  selectedRuleId = 0,
) {
  const bundles = normalizeRuleBundles(rules);
  const active = bundles.filter(
    (bundle) =>
      selectedRuleId === null ||
      selectedRuleId === undefined ||
      Number(bundle.rule_id || 0) === 0 ||
      String(bundle.rule_id) === String(selectedRuleId),
  );
  const root = { connector: 'and', children: active.map((bundle) => bundle.expr) };
  return (value) => evalNode(root, value, fieldType);
}

/** 保留给需要按等级拆分 Ant 规则的调用方。 */
export function splitByLevel(rules = []) {
  const result = { errors: [], warnings: [] };
  for (const rule of rules || []) {
    (Number(rule?._level) === 2 ? result.warnings : result.errors).push(rule);
  }
  return result;
}

/**
 * 将整个表达式转换为一个 Ant validator，避免把 OR 拆成多个 AND 规则。
 * warning 失败时 resolve，只在 level=1 失败时 reject。
 */
export function toAntdRules(field, rawRules = [], selectedRuleId = 0) {
  const required = field.required
    ? [
        {
          type: 'required',
          message: `${field.name?.length <= 10 ? field.name : '该字段'}必填`,
          level: 1,
        },
      ]
    : [];
  const evaluate = buildRuleEvaluator(
    [...required, ...(rawRules || [])],
    field.type || 'text',
    selectedRuleId,
  );

  return [
    {
      trigger: ['change', 'blur'],
      validator: (_rule, value) => {
        const result = evaluate(value);
        if (result.pass || Number(result.error?.leaf?.level) === 2) {
          return Promise.resolve();
        }
        return Promise.reject(result.error?.message || '格式有误');
      },
    },
  ];
}
