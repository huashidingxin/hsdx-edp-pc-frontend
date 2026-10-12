// @vitest-environment happy-dom
/**
 * LocaleTabsEditor「远端更新自动生效」回归
 *
 * 背景：合并策略曾是「只补空字段」（新数据必须能填上表单里的空位才接受）。
 * 但列表接口与详情接口共用同一个 transform()，locales 形状完全一致
 * （都含 body / custom_fields / seo_*），快照里已非空的字段永远不再被接受 ——
 * 别的终端改了内容、重新打开详情也刷不进来，只有刷新浏览器才恢复。
 *
 * 本文件覆盖修复后的行为：
 *   1. 同一条记录、不重挂载，远端内容变了 → 表单（含编辑器正文）跟着变；
 *   2. 列表快照是旧的（A → B → A 回来）→ 详情到达后仍能覆盖成最新；
 *   3. 用户真的改过的语种不被远端覆盖；
 *   4. 干净打开详情不应被标成「未保存」；
 *   5. 残缺快照不得抹掉表单里已有的正文。
 */
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('#/api/request', () => ({ requestClient: api }));
vi.mock('#/api', () => ({ upload: vi.fn() }));
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
  InputShell.TextArea = valueInput('textarea');
  return {
    Button: buttonStub,
    Empty: stub('Empty', ['description', 'image']),
    Input: InputShell,
    Spin: stub('Spin', ['spinning']),
    Tabs: stub('Tabs', ['activeKey', 'type', 'size', 'items']),
    Modal: { confirm: (cfg) => cfg?.onOk?.() },
    message: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      loading: vi.fn(),
    },
  };
});
vi.mock('@vben/icons', async () => {
  const { defineComponent: dc, h: hh } = await import('vue');
  const stub = (name) =>
    dc({ name, setup: (_, { slots }) => () => hh('span', slots.default?.()) });
  return {
    AlignCenter: stub('AlignCenter'),
    AlignLeft: stub('AlignLeft'),
    AlignRight: stub('AlignRight'),
    ArrowDown: stub('ArrowDown'),
    ArrowUp: stub('ArrowUp'),
    ChevronDown: stub('ChevronDown'),
    Copy: stub('Copy'),
    Expand: stub('Expand'),
    ImagePlus: stub('ImagePlus'),
    LayoutGrid: stub('LayoutGrid'),
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

import LocaleTabsEditor from '../LocaleTabsEditor.vue';

const FIELDS = [
  { field: 'title', label: '标题', type: 'text' },
  { field: 'summary', label: '英文标语', type: 'text' },
  { field: 'body', label: '正文', type: 'editor' },
];

/** 详情/列表同形状（后端 transform() 共用），区别只在内容新旧 */
function locale(title, summary, body) {
  return [
    { id: 1, locale: 'zh-CN', title, slug: 'line', summary, body, status: 1 },
  ];
}

const V1 = locale('旧标题', 'Old Slogan', '<p>旧正文</p>');
const V2 = locale('新标题', 'New Slogan', '<p>新正文</p>');
const V3 = locale('最新标题', 'Newest Slogan', '<p>最新正文</p>');

async function settle(rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    await flushPromises();
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 15));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function mountEditor(locales, rowId = 7) {
  return mount(LocaleTabsEditor, {
    attachTo: document.body,
    props: {
      fields: FIELDS,
      locales,
      localesPool: [{ code: 'zh-CN', native_label: '中文' }],
      rowId,
    },
  });
}

const editorBody = () =>
  document.body.querySelector('.vben-tiptap-content')?.innerHTML || '';
const titleValue = (wrapper) => wrapper.findAll('input')[0].element.value;
const summaryValue = (wrapper) => wrapper.findAll('input')[1].element.value;

describe('LocaleTabsEditor 远端更新自动生效', () => {
  it('同一条记录、不重挂载：远端改了标题/标语/正文，表单全部跟着变', async () => {
    api.get.mockResolvedValue({
      default_locale: 'zh-CN',
      enabled_locales: ['zh-CN'],
    });
    const wrapper = mountEditor(V1);
    await settle();
    expect(titleValue(wrapper)).toBe('旧标题');
    expect(editorBody()).toContain('旧正文');

    // 详情接口返回了别处改动后的内容（rowId 未变、组件未重挂载）
    await wrapper.setProps({ locales: V2 });
    await settle();
    expect(titleValue(wrapper)).toBe('新标题');
    expect(summaryValue(wrapper)).toBe('New Slogan');
    expect(editorBody()).toContain('新正文');
    expect(editorBody()).not.toContain('旧正文');

    wrapper.unmount();
  }, 60000);

  it('列表快照是旧的：A → B → A 回来，详情到达后仍覆盖成最新', async () => {
    api.get.mockResolvedValue({
      default_locale: 'zh-CN',
      enabled_locales: ['zh-CN'],
    });
    const wrapper = mountEditor(V1);
    await settle();

    // 切到另一条记录再切回来：列表没刷新 → 先用「A 的旧快照」打底
    await wrapper.setProps({
      locales: [{ id: 2, locale: 'zh-CN', title: 'B 标题', body: '<p>B</p>' }],
      rowId: 8,
    });
    await settle();
    await wrapper.setProps({ locales: V1, rowId: 7 });
    await settle();
    expect(titleValue(wrapper)).toBe('旧标题');

    // 详情随后到达（内容已被别的终端改过）
    await wrapper.setProps({ locales: V3 });
    await settle();
    expect(titleValue(wrapper)).toBe('最新标题');
    expect(editorBody()).toContain('最新正文');

    wrapper.unmount();
  }, 60000);

  it('用户改过的语种不会被远端更新覆盖', async () => {
    api.get.mockResolvedValue({
      default_locale: 'zh-CN',
      enabled_locales: ['zh-CN'],
    });
    const wrapper = mountEditor(V1);
    await settle();

    const titleInput = wrapper.findAll('input')[0];
    titleInput.element.value = '用户正在编辑的标题';
    titleInput.element.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();

    await wrapper.setProps({ locales: V2 });
    await settle();
    expect(titleValue(wrapper)).toBe('用户正在编辑的标题');

    wrapper.unmount();
  }, 60000);

  it('干净打开详情不产生「未保存」脏标记（编辑器回声不算改动）', async () => {
    api.get.mockResolvedValue({
      default_locale: 'zh-CN',
      enabled_locales: ['zh-CN'],
    });
    // 先用残缺快照打开，详情再补上正文：这条链路最容易把回声记成用户改动
    const wrapper = mountEditor([
      { id: 1, locale: 'zh-CN', title: '旧标题', slug: 'line' },
    ]);
    await settle();
    await wrapper.setProps({ locales: V1 });
    await settle();

    expect(editorBody()).toContain('旧正文');
    expect(wrapper.text()).not.toContain('个语种未保存');

    wrapper.unmount();
  }, 60000);

  it('残缺快照不得抹掉表单里已有的正文与标语', async () => {
    api.get.mockResolvedValue({
      default_locale: 'zh-CN',
      enabled_locales: ['zh-CN'],
    });
    const wrapper = mountEditor(V1);
    await settle();

    // 只带 title/slug 的快照（缺 summary/body）到达：不能把已有内容清空
    await wrapper.setProps({
      locales: [{ id: 1, locale: 'zh-CN', title: '旧标题', slug: 'line' }],
    });
    await settle();
    expect(editorBody()).toContain('旧正文');
    expect(summaryValue(wrapper)).toBe('Old Slogan');

    wrapper.unmount();
  }, 60000);
});
