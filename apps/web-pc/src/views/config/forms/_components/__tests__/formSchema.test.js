import { describe, expect, it } from 'vitest';

import {
  bundleToEditorRows,
  countFieldRules,
  countFields,
  createFieldDraft,
  draftToField,
  editorRowsToBundle,
  fieldRuleEditorRows,
  fieldRuleLeaves,
  fieldToDraft,
  normalizeSchemaInput,
  parseOptionsText,
  optionsToText,
  ruleTypesFor,
  setFieldRuleLeaves,
  suggestFieldName,
  validateFieldDraft,
  validateRuleRows,
} from '../formSchema.js';

function draft(overrides = {}) {
  return {
    ...createFieldDraft('text', []),
    name: 'contact_name',
    label: '联系人',
    ...overrides,
  };
}

describe('schema 归一化', () => {
  it('兼容 { layout, fields } 与裸数组两种存储形态', () => {
    expect(normalizeSchemaInput({ fields: [{ name: 'a' }] }).fields).toHaveLength(1);
    expect(normalizeSchemaInput([{ name: 'a' }]).fields).toHaveLength(1);
    expect(normalizeSchemaInput(null)).toEqual({
      layout: {
        columns: 12,
        label_position: 'top',
        submit_align: 'left',
        gap: 'md',
      },
      fields: [],
    });
    expect(countFields({ fields: [{ name: 'a' }, { name: 'b' }] })).toBe(2);
  });

  it('过滤非法 layout 取值', () => {
    const schema = normalizeSchemaInput({
      layout: { label_position: 'bad', gap: 'lg' },
      fields: [],
    });
    expect(schema.layout.label_position).toBe('top');
    expect(schema.layout.gap).toBe('lg');
  });
});

describe('选项文本编解码', () => {
  it('支持 值 与 值=显示名 两种写法并去重', () => {
    const options = parseOptionsText('a=苹果\nb\n a ');
    expect(options).toEqual([
      { value: 'a', label: '苹果' },
      { value: 'b', label: 'b' },
    ]);
  });

  it('label 与 value 相同时只输出 value', () => {
    expect(optionsToText([{ value: 'a', label: 'a' }, { value: 'b', label: 'B' }])).toBe(
      'a\nb=B',
    );
  });
});

describe('默认校验规则编解码', () => {
  it('只读写 rule_id = 0 的 bundle，其他规范原样保留', () => {
    const field = {
      name: 'age',
      rules: [
        { rule_id: 0, expr: { connector: 'and', children: [{ type: 'min', value: 1, message: 'm1', level: 1 }] } },
        { rule_id: 7, expr: { connector: 'or', children: [{ type: 'max', value: 9, message: 'm2', level: 2 }] } },
      ],
    };

    expect(fieldRuleLeaves(field)).toEqual([
      { type: 'min', value: 1, message: 'm1', level: 1 },
    ]);
    expect(countFieldRules(field)).toBe(1);

    const next = setFieldRuleLeaves(field, [
      { type: 'min', value: '2', message: '太小' },
    ]);
    // 行式模型：根固定 or、组内固定 and
    expect(next.rules[0]).toEqual({
      rule_id: 0,
      expr: {
        connector: 'or',
        children: [
          {
            connector: 'and',
            children: [{ type: 'min', value: 2, message: '太小', level: 1 }],
          },
        ],
      },
    });
    // rule_id=7 的 bundle 未被改动
    expect(next.rules[1]).toEqual(field.rules[1]);
  });

  it('行式先后连接：连续 And 同组（组内 AND），遇到 Or 拆组（组间 OR）', () => {
    // A AND B OR C => [A,B] -- Or -- [C]
    const bundle = editorRowsToBundle([
      { type: 'minLength', value: 2, message: 'a', level: 1, connector: 'and' },
      { type: 'maxLength', value: 5, message: 'b', level: 1, connector: 'or' },
      { type: 'contains', value: 'x', message: 'c', level: 1, connector: 'and' },
    ]);
    expect(bundle).toEqual({
      rule_id: 0,
      expr: {
        connector: 'or',
        children: [
          {
            connector: 'and',
            children: [
              { type: 'minLength', value: 2, message: 'a', level: 1 },
              { type: 'maxLength', value: 5, message: 'b', level: 1 },
            ],
          },
          {
            connector: 'and',
            children: [{ type: 'contains', value: 'x', message: 'c', level: 1 }],
          },
        ],
      },
    });

    // bundle → 编辑器行：outgoing connector（跨组边界 = 根 connector or）
    const rows = bundleToEditorRows(bundle);
    expect(rows).toEqual([
      { type: 'minLength', value: 2, message: 'a', level: 1, connector: 'and' },
      { type: 'maxLength', value: 5, message: 'b', level: 1, connector: 'or' },
      { type: 'contains', value: 'x', message: 'c', level: 1, connector: 'and' },
    ]);
    // 行 → bundle → 行 往返一致
    expect(bundleToEditorRows(editorRowsToBundle(rows))).toEqual(rows);

    // 字段级读取：fieldRuleEditorRows 供规则弹窗初始化
    const field = setFieldRuleLeaves({ name: 'age', type: 'number' }, rows);
    expect(fieldRuleEditorRows(field)).toEqual(rows);
    expect(fieldRuleEditorRows({ name: 'age' })).toEqual([]);
  });

  it('规则清空时移除默认规则但保留其他规范', () => {
    const field = setFieldRuleLeaves(
      { name: 'age', rules: [{ rule_id: 9, expr: { connector: 'and', children: [{ type: 'min', value: 1, message: 'x', level: 1 }] } }] },
      [{ type: 'min', value: 1, message: 'x' }],
    );
    expect(field.rules).toHaveLength(2);

    const cleared = setFieldRuleLeaves(field, []);
    expect(cleared.rules).toHaveLength(1);
    expect(cleared.rules[0].rule_id).toBe(9);

    const onlyDefault = setFieldRuleLeaves(
      { name: 'age' },
      [{ type: 'min', value: 1, message: 'x' }],
    );
    expect(setFieldRuleLeaves(onlyDefault, [])).not.toHaveProperty('rules');
  });

  it('数值型规则的值转数字，其余保持字符串', () => {
    const field = setFieldRuleLeaves(
      { name: 'name', type: 'text' },
      [
        { type: 'minLength', value: '3', message: '太短' },
        { type: 'contains', value: 'abc', message: '需包含' },
      ],
    );
    const leaves = fieldRuleLeaves(field);
    expect(leaves[0].value).toBe(3);
    expect(leaves[1].value).toBe('abc');
  });

  it('规则类型按字段类型收敛，容器与文件不支持规则', () => {
    expect(ruleTypesFor('number').map((o) => o.value)).toContain('min');
    expect(ruleTypesFor('number').map((o) => o.value)).not.toContain('contains');
    expect(ruleTypesFor('text').map((o) => o.value)).toContain('minLength');
    expect(ruleTypesFor('group')).toEqual([]);
    expect(ruleTypesFor('file')).toEqual([]);
    expect(ruleTypesFor('address')).toEqual([]);
  });

  it('校验规则行：必填无需值，数值型必须为数字', () => {
    // 行模型固定携带 level（FormRuleModal 新建行给 1，fieldRuleEditorRows 归一为 1|2），
    // 夹具必须带上，否则会先被「请为每行选择级别」拦下、测不到值相关分支。
    const row = (overrides) => ({ level: 1, ...overrides });
    expect(validateRuleRows([row({ type: 'required', value: '', message: '必填' })], 'text')).toBeNull();
    expect(validateRuleRows([row({ type: 'min', value: '', message: 'x' })], 'number')).toBe(
      '「最小值（不低于）」需要填写值',
    );
    expect(validateRuleRows([row({ type: 'min', value: 'abc', message: 'x' })], 'number')).toBe(
      '「最小值（不低于）」的值需为数字',
    );
    expect(validateRuleRows([row({ type: 'contains', value: '', message: 'x' })], 'text')).toBe(
      '「包含」需要填写值',
    );
    expect(validateRuleRows([row({ type: 'contains', value: 'x', message: 'x' })], 'group')).toBe(
      '字段类型不支持规则「contains」',
    );
  });

  it('校验规则行：级别必须显式选择，缺失或越界都拦下', () => {
    // level 不是可选装饰：它决定不通过时是「错误」还是「警告」，缺失即视为未选择。
    expect(validateRuleRows([{ type: 'required', value: '', message: '必填' }], 'text')).toBe(
      '请为每行选择级别（错误/警告）',
    );
    expect(
      validateRuleRows([{ type: 'required', value: '', message: '必填', level: 3 }], 'text'),
    ).toBe('请为每行选择级别（错误/警告）');
    expect(
      validateRuleRows([{ type: 'required', value: '', message: '必填', level: 2 }], 'text'),
    ).toBeNull();
  });
});

describe('草稿 ⇄ 存储', () => {
  it('选项类字段保存时写入 options，切换类型后清理残留键', () => {
    const stored = draftToField({
      ...draft({ type: 'select', optionsText: 'a=苹果\nb=香蕉', multiple: true }),
    });
    expect(stored.options).toEqual([
      { value: 'a', label: '苹果' },
      { value: 'b', label: '香蕉' },
    ]);
    expect(stored.multiple).toBe(true);
    expect(stored.layout).toEqual({ span: 12, span_tablet: 12, span_mobile: 12 });

    const asText = draftToField({
      ...fieldToDraft(stored),
      type: 'text',
      optionsText: '',
    });
    expect(asText).not.toHaveProperty('options');
    expect(asText).not.toHaveProperty('multiple');
  });

  it('保留编辑器未覆盖的键（visible_when 等）', () => {
    const original = {
      name: 'country',
      type: 'text',
      label: '国家',
      visible_when: { field: 'other', operator: 'equals', value: '1' },
    };
    const stored = draftToField({
      ...fieldToDraft(original),
      label: '国家/地区',
    });
    expect(stored.label).toBe('国家/地区');
    expect(stored.visible_when).toEqual(original.visible_when);
  });

  it('文件字段按必填收敛 min_files，并保证 min <= max', () => {
    const stored = draftToField({
      ...draft({ type: 'file', required: true, min_files: 0, max_files: 3 }),
    });
    expect(stored.min_files).toBe(1);
    expect(stored.max_files).toBe(3);
    expect(stored.accept).toEqual(['image/*']);
  });

  it('字段组保存子字段与 repeatable', () => {
    const stored = draftToField({
      ...draft({ type: 'list' }),
      fields: [
        { ...createFieldDraft('text', []), name: 'item_name', label: '名称', required: true },
      ],
      repeatable: { min_items: 1, max_items: 5, add_text: '加', remove_text: '删', item_label: '第 {index} 项' },
    });
    expect(stored.fields).toHaveLength(1);
    expect(stored.fields[0].name).toBe('item_name');
    expect(stored.repeatable.max_items).toBe(5);
    expect(stored.render).toBe('grid');
    expect(stored.default).toEqual([]);
  });

  it('循环转换不丢规则', () => {
    const withRule = setFieldRuleLeaves(
      { name: 'phone', type: 'text', label: '手机' },
      [{ type: 'minLength', value: '11', message: '手机号长度不足' }],
    );
    const roundTrip = draftToField(fieldToDraft(withRule));
    expect(countFieldRules(roundTrip)).toBe(1);
  });
});

describe('字段草稿校验', () => {
  it('字段名需合法且不重复', () => {
    expect(validateFieldDraft(draft({ name: '2bad' }))).toContain('字段名需以字母开头');
    expect(validateFieldDraft(draft(), { existingNames: ['contact_name'] })).toContain(
      '已存在',
    );
    expect(validateFieldDraft(draft())).toBeNull();
  });

  it('选项类字段必须有选项', () => {
    expect(validateFieldDraft(draft({ type: 'select', optionsText: '' }))).toContain(
      '至少需要一个选项',
    );
    expect(validateFieldDraft(draft({ type: 'select', optionsText: 'a=甲' }))).toBeNull();
  });

  it('基础校验区间交叉检查', () => {
    expect(
      validateFieldDraft(draft({ validation: { min_length: 5, max_length: 2 } })),
    ).toContain('最少字符数不能大于最多字符数');
    expect(
      validateFieldDraft(draft({ type: 'number', validation: { min: 5, max: 2 } })),
    ).toContain('最小值不能大于最大值');
    expect(
      validateFieldDraft(
        draft({ type: 'date', validation: { min_date: '2026-01-02', max_date: '2026-01-01' } }),
      ),
    ).toContain('最早日期不能晚于最晚日期');
    expect(
      validateFieldDraft(draft({ type: 'date', validation: { min_date: '2026/01/01' } })),
    ).toContain('YYYY-MM-DD');
    expect(validateFieldDraft(draft({ validation: { pattern: '[' } }))).toContain(
      '正则表达式格式无效',
    );
  });

  it('字段组：子字段必填校验', () => {
    expect(validateFieldDraft(draft({ type: 'group', fields: [] }))).toContain(
      '至少需要一个子字段',
    );
    const child = { ...createFieldDraft('text', []), name: 'a', label: 'A' };
    const dup = { ...createFieldDraft('text', []), name: 'a', label: 'A2' };
    expect(validateFieldDraft(draft({ type: 'group', fields: [child, dup] }))).toContain(
      '重复',
    );
    expect(
      validateFieldDraft(draft({ type: 'group', fields: [{ ...child, label: '' }] })),
    ).toContain('未填写标签');
    expect(validateFieldDraft(draft({ type: 'group', fields: [child] }))).toBeNull();
    expect(
      validateFieldDraft(
        draft({ type: 'group', fields: [child], repeatable: { min_items: 3, max_items: 2 } }),
      ),
    ).toContain('最少项数不能大于最多项数');
  });
});

describe('工具函数', () => {
  it('生成不重复字段名', () => {
    expect(suggestFieldName([])).toBe('field_1');
    expect(suggestFieldName([{ name: 'field_1' }, { name: 'field_2' }])).toBe('field_3');
  });
});
