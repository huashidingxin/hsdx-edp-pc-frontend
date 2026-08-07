/**
 * useFieldRules —— 动态表单字段校验规则转换（P3-V02）
 *
 * 把后端 FormSchemaService::fields 输出每字段 rules[]（含 type/value/message/level/failed_proof）
 * 转换为 ant Form.Item 兼容的 rules 数组（含 validator/trigger）。
 *
 * 设计要点：
 *   - 与 SubmissionEdit.formatRule 同语义，但产出 ant 兼容 fn: (rule, value) => true | Promise.reject(msg)
 *   - trigger：required 用 'change'（输入即校验）；min/max/range/eq 用 'blur'（失焦校验）
 *   - level=1 → wheels 为正常 error rule；level=2 → itp warning，契机存 level 字段供业务层做不符合项弹窗分流
 *   - 失焦提示与提交前整表 evaluateAll 互为兜底；任意一方命中即显示红字
 *
 * 与 SubmissionEdit 旧 evaluateAll 评估链路并存：
 *   - ant Form.Item 接管失焦/变更实时反馈；
 *   - 提交按钮 getFormData() 仍跑一次 evaluateAll + validate，保证 list 子表、跨字段等都能算到
 *   - ant validate() 调用现在会真正生效（旧因 AppField FormItem.rules=undefined 而退化）
 */

const NUMERIC_TYPES = new Set([
  'digit',
  'humidity',
  'number',
  'temperature',
  'wind',
]);

/**
 * 同 SemanticSubmissionEdit.formatRule，但返回 ant rule 对象（含 validator/trigger）
 */
export function toAntdRules(field, rawRules = []) {
  const rules = [];
  const fieldType = field.type || 'text';
  const isNumeric = NUMERIC_TYPES.has(fieldType);

  // 必填项注入 ant required（让红 * 显示）
  if (field.required) {
    rules.push({
      required: true,
      trigger: 'change',
      message: `${field.name?.length <= 10 ? field.name : '该字段'}必填`,
      _level: 1,
      validator: (_rule, value) => {
        if (fieldType !== 'switch' && !isNumeric) {
          if (value === null || value === undefined)
            return Promise.reject(_rule.message);
          if (Array.isArray(value))
            return value.length > 0
              ? Promise.resolve()
              : Promise.reject(_rule.message);
          if (typeof value === 'string')
            return value.trim().length > 0
              ? Promise.resolve()
              : Promise.reject(_rule.message);
          return value ? Promise.resolve() : Promise.reject(_rule.message);
        }
        // switch 与数值字段恒有值（0 也是有效输入），只在 null/undefined 时报错
        return value === undefined || value === null
          ? Promise.reject(_rule.message)
          : Promise.resolve();
      },
    });
  }

  // base_rules（来自 FormSchemaService 输出，已全量；不再按 rule_id 过滤）
  for (const r of rawRules || []) {
    if (r.type === 'required') continue; // required 已由上段注入，避免重复
    const antRule = buildAntRule(r, fieldType, isNumeric);
    if (antRule) rules.push(antRule);
  }

  return rules;
}

function buildAntRule(rule, fieldType, isNumeric) {
  const type = rule.type;
  const errMsg = rule.message || '格式有误';
  const level =
    rule.level === null || rule.level === undefined ? 1 : Number(rule.level);
  const base = {
    trigger: type === 'eq' ? 'change' : 'blur',
    _level: level,
    _raw: rule,
  };

  switch (type) {
    case 'eq': {
      return {
        ...base,
        validator: (_r, v) =>
          String(v) === String(rule.value)
            ? Promise.resolve()
            : Promise.reject(errMsg),
      };
    }
    case 'max':
    case 'maxLength': {
      return {
        ...base,
        validator: (_r, v) => {
          if (v === null || v === undefined || v === '')
            return Promise.resolve();
          if (isNumeric)
            return Number(v) <= Number.parseFloat(rule.value)
              ? Promise.resolve()
              : Promise.reject(errMsg);
          return String(v).length <= Number(rule.value)
            ? Promise.resolve()
            : Promise.reject(errMsg);
        },
      };
    }
    case 'min':
    case 'minLength': {
      return {
        ...base,
        validator: (_r, v) => {
          if (v === null || v === undefined || v === '')
            return Promise.resolve();
          if (isNumeric)
            return Number(v) >= Number.parseFloat(rule.value)
              ? Promise.resolve()
              : Promise.reject(errMsg);
          return String(v).length >= Number(rule.value)
            ? Promise.resolve()
            : Promise.reject(errMsg);
        },
      };
    }
    case 'range': {
      const range = Array.isArray(rule.value)
        ? rule.value
        : String(rule.value).split('-');
      const lo = Number.parseFloat(range[0]);
      const hi = Number.parseFloat(range[1]);
      return {
        ...base,
        validator: (_r, v) => {
          if (v === null || v === undefined || v === '')
            return Promise.resolve();
          const n = Number(v);
          return n >= lo && n <= hi
            ? Promise.resolve()
            : Promise.reject(errMsg);
        },
      };
    }
    default: {
      return {
        ...base,
        validator: (_r, v) =>
          String(v) === String(rule.value)
            ? Promise.resolve()
            : Promise.reject(errMsg),
      };
    }
  }
}

/**
 * 把 ant rule 数组拆分为 errorsRules(1) / warningsRules(2)，供业务层提取 warning 字段
 */
export function splitByLevel(antdRules = []) {
  const errors = [];
  const warnings = [];
  for (const r of antdRules || []) {
    if (r._level === 2) warnings.push(r);
    else errors.push(r);
  }
  return { errors, warnings };
}
