/**
 * 静态内容编辑：字段展示必须按块级 `editor.fields` 声明。
 *
 * 契约（docs/saas-website-api.md §1.2A）：`editor.fields` 是管理端编辑提示，
 * 声明「该块要展示哪些字段、用什么名字展示」。因此内容编辑页必须：
 *   1. 字段集合与顺序以声明为准（不再由数据形状决定）；
 *   2. label 以声明为准（不再走 FIELD_LABELS 词典猜测）；
 *   3. 未声明的已有字段不展示，但**不得从草稿里删掉**（保存时原样写回，不丢数据）。
 * 没有声明的块（真实数据里占多数）继续按数据形状推断 —— 这条不能回退。
 *
 * 运行前提：必须在**前端仓库根目录**跑（根 vitest.config.ts 才有 happy-dom）：
 *   cd apps/hsdx-edp-pc-frontend && ./node_modules/.bin/vitest run --pool=forks \
 *     --maxWorkers=1 --no-file-parallelism \
 *     apps/web-pc/src/views/site/pages/_components/__tests__/pageContentDeclaredFields.test.js
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import AutoFormValue from '../AutoFormValue.vue';
import {
  blankFieldValue,
  blankItemForFields,
  describeDeclaredFields,
  editorFieldList,
} from '../pageContentAutoForm';

// antdv-next 与两个重组件按仓库既有做法 stub 掉（避免真实组件库与上传/富文本链路的耗时）。
vi.mock('antdv-next', async () => {
  const { defineComponent, h } = await import('vue');
  const stub = (name, emits = []) =>
    defineComponent({
      emits,
      name,
      props: ['value', 'checked', 'label'],
      setup(_props, { slots }) {
        return () => h('div', slots.default?.());
      },
    });
  const Input = stub('Input');
  Input.TextArea = stub('InputTextArea');

  return {
    Button: stub('Button', ['click']),
    Card: stub('Card'),
    Empty: stub('Empty'),
    Input,
    InputNumber: stub('InputNumber'),
    Select: stub('Select'),
    Space: stub('Space'),
    Switch: stub('Switch'),
    TextArea: stub('TextArea'),
  };
});

vi.mock('#/components/AppUpload.vue', () => ({
  default: { name: 'AppUpload', props: ['value'], template: '<div />' },
}));

vi.mock('#/components/app-editor/index.vue', () => ({
  default: { name: 'AppEditor', props: ['value'], template: '<div />' },
}));

describe('editorFieldList：把 editor.fields 规范成声明列表', () => {
  it('保留声明顺序，label 原样取出', () => {
    expect(
      editorFieldList({
        type: 'array',
        label: '核心特点',
        fields: {
          title: { label: '特点标题' },
          content: { label: '详细说明' },
          image: { label: '配图' },
        },
      }),
    ).toEqual([
      { key: 'title', label: '特点标题' },
      { key: 'content', label: '详细说明' },
      { key: 'image', label: '配图' },
    ]);
  });

  it('没有声明、空声明或形状不对时返回 null（调用方退回按数据形状推断）', () => {
    expect(editorFieldList(null)).toBeNull();
    expect(editorFieldList(undefined)).toBeNull();
    expect(editorFieldList({ type: 'object', label: '关于页内容' })).toBeNull();
    expect(editorFieldList({ type: 'array', label: 'x', fields: {} })).toBeNull();
    expect(editorFieldList({ type: 'array', label: 'x', fields: [] })).toBeNull();
  });

  it('label 为空的字段被跳过（后端也只接受非空 label）', () => {
    expect(
      editorFieldList({
        type: 'array',
        label: 'x',
        fields: { title: { label: '标题' }, subtitle: { label: '   ' }, extra: {} },
      }),
    ).toEqual([{ key: 'title', label: '标题' }]);
  });
});

describe('describeDeclaredFields：只渲染声明的字段，顺序与 label 全按声明', () => {
  it('未声明的键不出现在表单里', () => {
    const fields = describeDeclaredFields(
      { title: 'A', subtitle: 'B', description: '不该出现' },
      [
        { key: 'title', label: '特点标题' },
        { key: 'subtitle', label: '副标题' },
      ],
    );
    expect(fields.map((item) => item.key)).toEqual(['title', 'subtitle']);
    expect(fields.map((item) => item.label)).toEqual(['特点标题', '副标题']);
  });

  it('数据里缺声明键时也照样出现（editor.fields 即编辑契约）', () => {
    const fields = describeDeclaredFields({}, [
      { key: 'image', label: '配图' },
      { key: 'images', label: '图集' },
    ]);
    expect(fields.map((item) => [item.key, item.kind])).toEqual([
      ['image', 'image'],
      ['images', 'images'],
    ]);
  });

  it('控件仍按值的证据推断，声明只决定「展示哪些、叫什么」', () => {
    const fields = describeDeclaredFields(
      { content: '<p>富文本</p>', tags: ['a', 'b'] },
      [
        { key: 'content', label: '详细说明' },
        { key: 'tags', label: '标签' },
      ],
    );
    expect(fields.map((item) => item.kind)).toEqual(['richtext', 'tags']);
  });

  it('值不是对象时按空对象处理，不抛错', () => {
    const fields = describeDeclaredFields(null, [{ key: 'title', label: '标题' }]);
    expect(fields).toHaveLength(1);
    expect(fields[0].value).toBeUndefined();
  });
});

describe('blankFieldValue / blankItemForFields：新增条目按声明生成', () => {
  it('按键名提示给对形状（图片集/标签给数组，开关给布尔）', () => {
    expect(blankFieldValue('images')).toEqual([]);
    expect(blankFieldValue('tags')).toEqual([]);
    expect(blankFieldValue('title')).toBe('');
    expect(blankFieldValue('image')).toBe('');
  });

  it('新增条目只含声明字段', () => {
    expect(
      blankItemForFields([
        { key: 'title', label: '标题' },
        { key: 'images', label: '图集' },
      ]),
    ).toEqual({ title: '', images: [] });
  });
});

describe('组件渲染（AutoFormValue）：按声明渲染 label', () => {
  it('有声明时只渲染声明的字段，并用声明的 label', () => {
    const parent = {
      hero: { title: '原值', subtitle: '原值', description: '未声明的字段' },
    };
    const wrapper = mount(AutoFormValue, {
      props: {
        fieldKey: 'hero',
        fields: [
          { key: 'title', label: '主标题' },
          { key: 'subtitle', label: '副标题' },
        ],
        parent,
      },
    });
    const text = wrapper.text();
    expect(text).toContain('主标题');
    expect(text).toContain('副标题');
    // 未声明的 description 不渲染（其词典 label 是「描述」）
    expect(text).not.toContain('描述');
    wrapper.unmount();
  });

  it('没有声明时退回数据形状推断（含词典 label），不因缺少声明而少渲染', () => {
    const parent = { hero: { title: '原值', description: '一段说明' } };
    const wrapper = mount(AutoFormValue, {
      props: { fieldKey: 'hero', parent },
    });
    const text = wrapper.text();
    expect(text).toContain('标题');
    expect(text).toContain('描述');
    wrapper.unmount();
  });

  it('列表块（cards）的每个条目都按声明渲染', () => {
    const parent = {
      features: [
        { title: 'A', content: 'x', hidden: '不该出现' },
        { title: 'B', content: 'y', hidden: '不该出现' },
      ],
    };
    const wrapper = mount(AutoFormValue, {
      props: {
        fieldKey: 'features',
        fields: [
          { key: 'title', label: '特点标题' },
          { key: 'content', label: '详细说明' },
        ],
        parent,
      },
    });
    // 两个条目 × 两个声明字段
    expect(wrapper.findAll('span').filter((n) => n.text() === '特点标题')).toHaveLength(2);
    expect(wrapper.findAll('span').filter((n) => n.text() === '详细说明')).toHaveLength(2);
    wrapper.unmount();
  });
});
