// @vitest-environment happy-dom
/**
 * LocaleTabsEditor → 真实 AppEditor 的详情回显回归
 *
 * 背景：products 详情接口返回了 body，但编辑器内空白。旧回归用例把
 * AppEditor 整体 stub 掉（stub-editor），只覆盖了 textarea，editor
 * 类型走的 v-model → content → VbenTiptap setContent 晚到链路从未被验证。
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
    Modal: {
      confirm: (cfg) => {
        cfg?.onOk?.();
      },
    },
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
  const stub = (name) => dc({ name, setup: (_, { slots }) => () => hh('span', slots.default?.()) });
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
import { DETAIL_SYNC_KEY } from '#/components/app-crud-table/composables/useCrudTableDetail.js';

const FIELDS = [
  { field: 'title', label: '标题', type: 'text' },
  { field: 'body', label: '详情', type: 'editor' },
];

const STUB_LOCALES = [
  { id: 1, locale: 'zh-CN', title: '测试产品', slug: 'test' },
];

const DETAIL_LOCALES = [
  {
    id: 1,
    locale: 'zh-CN',
    title: '测试产品',
    slug: 'test',
    body: '<p>详情正文内容</p>',
  },
];

async function settle(rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    await flushPromises();
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 15));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
}

describe('LocaleTabsEditor 真实编辑器回显', () => {
  it('列表快照先行，详情 body 到达后编辑器内可见', async () => {
    api.get.mockResolvedValue({
      default_locale: 'zh-CN',
      enabled_locales: ['zh-CN'],
    });
    const wrapper = mount(LocaleTabsEditor, {
      attachTo: document.body,
      props: {
        fields: FIELDS,
        locales: STUB_LOCALES,
        localesPool: [{ code: 'zh-CN', native_label: '中文' }],
        rowId: 7,
      },
    });
    await settle();

    // 快照阶段：标题在，编辑器空
    const titleInput = wrapper.findAll('input')[0];
    expect(titleInput.element.value).toBe('测试产品');
    expect(
      document.body.querySelector('.vben-tiptap-content')?.innerHTML || '',
    ).not.toContain('详情正文内容');

    // 详情到达（含 body）
    await wrapper.setProps({ locales: DETAIL_LOCALES });
    await settle();

    const editorHtml =
      document.body.querySelector('.vben-tiptap-content')?.innerHTML || '';
    expect(editorHtml).toContain('详情正文内容');

    wrapper.unmount();
  }, 60000);
});

describe('LocaleTabsEditor 详情内重载', () => {
  const V1 = [
    { id: 1, locale: 'zh-CN', title: '旧标题', slug: 'old', body: '<p>旧正文</p>' },
  ];
  const V2 = [
    { id: 1, locale: 'zh-CN', title: '新标题', slug: 'new', body: '<p>新正文</p>' },
  ];

  function mountWithLocales(locales, provide = {}) {
    return mount(LocaleTabsEditor, {
      attachTo: document.body,
      props: {
        fields: FIELDS,
        locales,
        localesPool: [{ code: 'zh-CN', native_label: '中文' }],
        rowId: 7,
      },
      global: {
        provide,
        stubs: {
          EditorToolbar: true,
          MediaLibraryModal: true,
          ExternalAssetsModal: true,
        },
      },
    });
  }

  it('applyRemoteLocales 强覆盖已填字段（脏态下用户明确点的重载）', async () => {
    const wrapper = mountWithLocales(V1);
    await settle();
    const getBody = () =>
      document.body.querySelector('.vben-tiptap-content')?.innerHTML || '';
    expect(getBody()).toContain('旧正文');

    // 脏态（用户改过）时常规 props 更新会被脏保护挡住，强合并用于「重新加载」按钮
    wrapper.vm.applyRemoteLocales(V2);
    await settle();
    expect(getBody()).toContain('新正文');
    expect(getBody()).not.toContain('旧正文');

    wrapper.unmount();
  }, 60000);

  it('无同步通道时不显示重载按钮', async () => {
    const wrapper = mountWithLocales(V1);
    await settle();
    const buttons = Array.from(document.body.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('重新加载'),
    );
    expect(buttons.length).toBe(0);
    wrapper.unmount();
  }, 60000);

  it('有通道时重载：干净态直接更新，脏态确认后更新', async () => {
    const reload = vi.fn(async () => true);
    const wrapper = mountWithLocales(V1, { [DETAIL_SYNC_KEY]: { reload } });
    await settle();

    const reloadBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('重新加载'),
    );
    expect(reloadBtn).toBeTruthy();

    // 脏态（改标题）→ 确认框自动通过 → 重载并强合并
    const titleInput = wrapper.findAll('input')[0];
    titleInput.element.value = '用户改动';
    titleInput.element.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();

    // 先把远端换成 V2 再点重载（模拟重载后 props 到达）
    reloadBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
    expect(reload).toHaveBeenCalled();
    await wrapper.setProps({ locales: V2 });
    wrapper.vm.applyRemoteLocales(V2);
    await settle();
    expect(
      document.body.querySelector('.vben-tiptap-content')?.innerHTML || '',
    ).toContain('新正文');

    wrapper.unmount();
  }, 90000);
});
