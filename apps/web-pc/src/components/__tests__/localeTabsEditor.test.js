/**
 * LocaleTabsEditor 详情字段回显回归测试
 *
 * 背景：AppCrudTable 打开详情先用列表行数据填表单（index 的 locales 只带
 * title/slug 概览字段），详情接口随后才返回完整字段。曾因 mergeLocales
 * 「只登记一次」导致 summary/body/seo_* 永远不回显（仅标题/Slug 有值）。
 *
 * 运行前提：在前端仓库根目录跑（根 vitest.config.ts 才有 happy-dom）：
 *   cd apps/hsdx-edp-pc-frontend && pnpm vitest run --pool=forks \
 *     --maxWorkers=1 --no-file-parallelism \
 *     apps/web-pc/src/components/__tests__/localeTabsEditor.test.js
 */
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('#/api/request', () => ({ requestClient: api }));

// 组件库整体 stub：Input 需挂 TextArea 子组件（模板里用 Input.TextArea）
vi.mock('antdv-next', async () => {
  const { defineComponent, h } = await import('vue');
  const stub = (name, props = []) =>
    defineComponent({
      name,
      props,
      setup(_props, { slots }) {
        return () => h('div', slots.default?.());
      },
    });

  // Button 渲染真实 <button>，测试才能 trigger click（如参数对的添加/删除）
  const buttonStub = defineComponent({
    name: 'Button',
    props: ['type', 'size', 'danger', 'disabled'],
    setup(_props, { slots }) {
      return () => h('button', { type: 'button' }, slots.default?.());
    },
  });

  const valueInput = (tag) =>
    defineComponent({
      name: `Stub${tag === 'input' ? 'Input' : 'TextArea'}`,
      props: ['value', 'rows', 'placeholder'],
      emits: ['update:value'],
      setup(props, { emit }) {
        return () =>
          h(tag, {
            value: props.value ?? '',
            onInput: (event) => emit('update:value', event.target.value),
          });
      },
    });

  const Input = stub('Input', ['value', 'placeholder']);
  Input.TextArea = valueInput('textarea');
  const InputShell = defineComponent({
    name: 'InputWithTextArea',
    props: ['value', 'placeholder'],
    emits: ['update:value'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          value: props.value ?? '',
          onInput: (event) => emit('update:value', event.target.value),
        });
    },
  });
  InputShell.TextArea = Input.TextArea;

  // Modal 既要能当组件用（一键翻译弹窗），又要保留 Modal.confirm（重新加载确认）
  const modalStub = defineComponent({
    name: 'Modal',
    props: ['open', 'title', 'width', 'confirmLoading'],
    emits: ['update:open', 'ok', 'cancel'],
    setup(props, { slots }) {
      return () =>
        props.open ? h('div', { class: 'stub-modal' }, slots.default?.()) : null;
    },
  });
  modalStub.confirm = (cfg) => cfg?.onOk?.();

  return {
    Button: buttonStub,
    Empty: stub('Empty', ['description', 'image']),
    Input: InputShell,
    Modal: modalStub,
    Select: stub('Select', ['value', 'options', 'mode']),
    Spin: stub('Spin', ['spinning']),
    Tabs: stub('Tabs', ['activeKey', 'type', 'size', 'items']),
    message: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  };
});

vi.mock('#/components/AppUpload.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'AppUpload',
      props: ['modelValue', 'value', 'fileType', 'multiple'],
      setup: () => () => h('div', { class: 'stub-upload' }),
    }),
  };
});

vi.mock('#/components/app-editor/index.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'AppEditor',
      props: ['modelValue', 'value'],
      setup: () => () => h('div', { class: 'stub-editor' }),
    }),
  };
});

import LocaleTabsEditor from '../LocaleTabsEditor.vue';

const FIELDS = [
  { field: 'title', label: '标题', type: 'text' },
  { field: 'slug', label: 'Slug', type: 'text' },
  { field: 'summary', label: '摘要', type: 'textarea' },
  { field: 'body', label: '正文', type: 'textarea' },
  { field: 'attributes', label: '产品参数', type: 'pairs' },
];

/** 列表接口的 locales 概览（无 summary/body，后端 index 有意不序列化 body） */
const STUB_LOCALES = [
  { id: 1, locale: 'zh-CN', title: '彩涂板生产线', slug: 'caituban-line' },
];

/** 详情接口的 locales 完整内容 */
const DETAIL_LOCALES = [
  {
    id: 1,
    article_id: 850,
    locale: 'zh-CN',
    title: '彩涂板生产线',
    slug: 'caituban-line',
    summary: 'Color Coated Sheet Coils',
    body: '<p>公司拥有带钢彩色涂层生产线 5 条</p>',
    attributes: [
      { label: '成品厚度', value: '0.2mm-1.5mm' },
      { label: '主要产品', value: '彩涂板' },
    ],
    status: 1,
    status_label: '已发布',
  },
];

function mountEditor(props = {}) {
  return mount(LocaleTabsEditor, {
    props: {
      fields: FIELDS,
      locales: STUB_LOCALES,
      localesPool: [{ code: 'zh-CN', native_label: '中文' }],
      rowId: 850,
      ...props,
    },
  });
}

async function readInputs(wrapper) {
  await wrapper.vm.$nextTick();
  const inputs = wrapper.findAll('input').map((node) => node.element.value);
  const areas = wrapper.findAll('textarea').map((node) => node.element.value);
  return { inputs, areas };
}

describe('LocaleTabsEditor 详情字段回显', () => {
  it('列表行快照先填表单，详情到达后补齐其余字段', async () => {
    api.get.mockResolvedValue({
      default_locale: 'zh-CN',
      enabled_locales: ['zh-CN'],
    });
    const wrapper = mountEditor();

    let { inputs, areas } = await readInputs(wrapper);
    expect(inputs).toEqual(['彩涂板生产线', 'caituban-line']);
    expect(areas).toEqual(['', '']);

    await wrapper.setProps({ locales: DETAIL_LOCALES });
    ({ inputs, areas } = await readInputs(wrapper));
    // 详情到达后参数对也回显：title/slug + 2 行参数（每行 label/value）
    expect(inputs).toEqual([
      '彩涂板生产线',
      'caituban-line',
      '成品厚度',
      '0.2mm-1.5mm',
      '主要产品',
      '彩涂板',
    ]);
    expect(areas).toEqual([
      'Color Coated Sheet Coils',
      '<p>公司拥有带钢彩色涂层生产线 5 条</p>',
    ]);

    wrapper.unmount();
  });

  it('用户输入后的 update:locales 回声不得重刷表单', async () => {
    api.get.mockResolvedValue({
      default_locale: 'zh-CN',
      enabled_locales: ['zh-CN'],
    });
    const wrapper = mountEditor({ locales: DETAIL_LOCALES });
    await readInputs(wrapper);

    const areas = wrapper.findAll('textarea');
    await areas[0].setValue('用户改过的摘要');
    // 父级把负载原样写回 props（真实流程中的回声）
    await wrapper.vm.$nextTick();
    const payload = wrapper.emitted('update:locales').at(-1)[0];
    await wrapper.setProps({ locales: payload });

    const { areas: after } = await readInputs(wrapper);
    expect(after[0]).toBe('用户改过的摘要');

    wrapper.unmount();
  });

  it('rowId 变化时重置内部状态，展示新行数据', async () => {
    api.get.mockResolvedValue({
      default_locale: 'zh-CN',
      enabled_locales: ['zh-CN'],
    });
    const wrapper = mountEditor({ locales: DETAIL_LOCALES });
    await readInputs(wrapper);

    const nextStub = [
      { id: 2, locale: 'zh-CN', title: '镀铝锌生产线', slug: 'galvalume-line' },
    ];
    await wrapper.setProps({ rowId: 851, locales: nextStub });
    let { inputs, areas } = await readInputs(wrapper);
    expect(inputs).toEqual(['镀铝锌生产线', 'galvalume-line']);
    expect(areas).toEqual(['', '']);

    await wrapper.setProps({
      locales: [
        {
          ...DETAIL_LOCALES[0],
          id: 2,
          title: '镀铝锌生产线',
          slug: 'galvalume-line',
          summary: 'GL Coil',
          body: '<p>GL</p>',
        },
      ],
    });
    ({ areas } = await readInputs(wrapper));
    expect(areas).toEqual(['GL Coil', '<p>GL</p>']);

    wrapper.unmount();
  });

  it('参数对：详情回显、添加行、全空行过滤与删除', async () => {
    api.get.mockResolvedValue({
      default_locale: 'zh-CN',
      enabled_locales: ['zh-CN'],
    });
    const wrapper = mountEditor({ locales: DETAIL_LOCALES });
    await readInputs(wrapper);

    // 详情回显：title/slug + 2 行参数（每行 label/value）= 6 个输入框
    let inputs = wrapper.findAll('input');
    expect(inputs).toHaveLength(6);
    expect(inputs[2].element.value).toBe('成品厚度');

    // 追加一行空参数
    const addButton = () =>
      wrapper.findAll('button').find((b) => b.text().includes('+ 添加'));
    await addButton().trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    inputs = wrapper.findAll('input');
    expect(inputs).toHaveLength(8);

    // 新行输入内容 → 负载包含 3 行
    await inputs[6].setValue('涂层体系');
    await inputs[7].setValue('聚酯');
    await flushPromises();
    await wrapper.vm.$nextTick();
    let attributes = wrapper.emitted('update:locales').at(-1)[0][0].attributes;
    expect(attributes).toEqual([
      { label: '成品厚度', value: '0.2mm-1.5mm' },
      { label: '主要产品', value: '彩涂板' },
      { label: '涂层体系', value: '聚酯' },
    ]);

    // 再加一行但不输入 → 全空行被过滤，不进负载
    await addButton().trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    attributes = wrapper.emitted('update:locales').at(-1)[0][0].attributes;
    expect(attributes).toHaveLength(3);

    // 删除第 2 行（主要产品）
    const deleteButtons = wrapper
      .findAll('button')
      .filter((b) => b.text() === '删除');
    await deleteButtons[1].trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    attributes = wrapper.emitted('update:locales').at(-1)[0][0].attributes;
    expect(attributes).toEqual([
      { label: '成品厚度', value: '0.2mm-1.5mm' },
      { label: '涂层体系', value: '聚酯' },
    ]);

    wrapper.unmount();
  });
});
