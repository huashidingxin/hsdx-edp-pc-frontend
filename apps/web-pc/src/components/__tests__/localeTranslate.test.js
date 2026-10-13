// @vitest-environment happy-dom
/**
 * LocaleTabsEditor「一键翻译」回归
 *
 * 覆盖：可翻译字段的挑选（仅 text/textarea/editor）、请求负载形状、
 * 按语种预览、采纳后回填（含不覆盖非翻译字段）并调用主表单保存通道。
 *
 * 运行前提：在前端仓库根目录跑（根 vitest.config.ts 才有 happy-dom）：
 *   cd apps/hsdx-edp-pc-frontend && ./node_modules/.bin/vitest run --dom \
 *     apps/web-pc/src/components/__tests__/localeTranslate.test.js
 */
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

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
    emits: ['click'],
    setup(_props, { slots, emit }) {
      return () =>
        h(
          'button',
          { type: 'button', onClick: () => emit('click') },
          slots.default?.(),
        );
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
  InputShell.TextArea = defineComponent({
    name: 'TextArea',
    props: ['value', 'rows', 'placeholder'],
    emits: ['update:value'],
    setup(props, { emit }) {
      return () =>
        h('textarea', {
          value: props.value ?? '',
          onInput: (event) => emit('update:value', event.target.value),
        });
    },
  });

  // Tabs 渲染可点击的 tab 按钮并上抛 change，测试才能切语种核对回填结果
  const tabsStub = defineComponent({
    name: 'Tabs',
    props: ['activeKey', 'type', 'size', 'items'],
    emits: ['change'],
    setup(props, { slots, emit }) {
      return () =>
        h('div', { class: 'stub-tabs' }, [
          ...(props.items || []).map((item) =>
            h(
              'button',
              {
                type: 'button',
                class: 'stub-tab',
                'data-key': item.key,
                onClick: () => emit('change', item.key),
              },
              item.label,
            ),
          ),
          slots.default?.(),
        ]);
    },
  });

  const modalStub = defineComponent({
    name: 'Modal',
    props: [
      'open',
      'title',
      'width',
      'confirmLoading',
      'okText',
      'cancelText',
      'okButtonProps',
    ],
    emits: ['update:open', 'ok', 'cancel'],
    setup(props, { slots, emit }) {
      return () =>
        props.open
          ? h('div', { class: 'stub-modal' }, [
              slots.default?.(),
              h('div', { class: 'stub-modal-footer' }, [
                h(
                  'button',
                  { type: 'button', onClick: () => emit('cancel') },
                  props.cancelText || '取消',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    disabled: Boolean(props.okButtonProps?.disabled),
                    onClick: () => emit('ok'),
                  },
                  props.okText || '确定',
                ),
              ]),
            ])
          : null;
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
    Tabs: tabsStub,
    message: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      loading: vi.fn(),
    },
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

import { DETAIL_SYNC_KEY } from '#/components/app-crud-table/composables/useCrudTableDetail.js';

import LocaleTabsEditor from '../LocaleTabsEditor.vue';

const FIELDS = [
  { field: 'title', label: '标题', type: 'text' },
  { field: 'body', label: '正文', type: 'editor' },
  { field: 'cover', label: '封面', type: 'image' },
];

const LOCALES = [
  {
    id: 1,
    locale: 'zh-CN',
    title: '关于我们',
    body: '<p>公司简介</p>',
    cover: '101/image/a.png',
  },
];

const POOL = [
  { code: 'zh-CN', native_label: '中文' },
  { code: 'en-US', native_label: 'English' },
  { code: 'ja-JP', native_label: '日本語' },
];

async function settle(rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    await flushPromises();
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 15));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function findButton(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text().includes(text));
}

function mountEditor(provide = {}) {
  return mount(LocaleTabsEditor, {
    attachTo: document.body,
    props: { fields: FIELDS, locales: LOCALES, localesPool: POOL, rowId: 12 },
    global: { provide },
  });
}

describe('LocaleTabsEditor 一键翻译', () => {
  it('取主语种可翻译字段发请求，按语种预览，采纳后回填并调用主表单保存', async () => {
    api.get.mockResolvedValue({
      default_locale: 'zh-CN',
      enabled_locales: ['zh-CN', 'en-US', 'ja-JP'],
    });
    api.post.mockResolvedValue({
      source_locale: 'zh-CN',
      target_locales: ['en-US', 'ja-JP'],
      provider: 'ai',
      translations: {
        'en-US': { title: 'About us', body: '<p>Company profile</p>' },
        'ja-JP': { title: '会社概要', body: '<p>会社紹介</p>' },
      },
    });

    const save = vi.fn(async () => {});
    const wrapper = mountEditor({ [DETAIL_SYNC_KEY]: { save } });
    await settle();

    // 打开弹窗
    const openBtn = findButton(wrapper, '一键翻译');
    expect(openBtn).toBeTruthy();
    await openBtn.trigger('click');
    await settle();
    expect(document.body.querySelector('.stub-modal')).toBeTruthy();

    // 开始翻译：只发 text/textarea/editor 三类字段（cover 是图片，不发）
    await findButton(wrapper, '开始翻译').trigger('click');
    await settle();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('ai/translate', {
      source_locale: 'zh-CN',
      target_locales: ['en-US', 'ja-JP'],
      fields: [
        { key: 'title', type: 'text', value: '关于我们' },
        { key: 'body', type: 'editor', value: '<p>公司简介</p>' },
      ],
    });

    // 默认预览第一个语种：纯文本直接可见，富文本进 sandbox iframe
    expect(document.body.textContent).toContain('About us');
    const iframe = document.body.querySelector('.stub-modal iframe');
    // srcdoc 可能被 Vue 写成 DOM 属性而非 attribute，两种取法都兼容
    const srcdoc = iframe?.srcdoc || iframe?.getAttribute('srcdoc') || '';
    expect(srcdoc).toContain('<p>Company profile</p>');

    // 切到日语 Tab 预览
    const jaTab = wrapper
      .findAll('.stub-modal .stub-tab')
      .find((b) => b.attributes('data-key') === 'ja-JP');
    await jaTab.trigger('click');
    await settle();
    expect(document.body.textContent).toContain('会社概要');

    // 采纳：回填 + 关闭弹窗 + 调用主表单保存
    await findButton(wrapper, '采纳并保存').trigger('click');
    await settle();
    expect(document.body.querySelector('.stub-modal')).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);

    const payload = wrapper.emitted('update:locales').at(-1)[0];
    const en = payload.find((l) => l.locale === 'en-US');
    const ja = payload.find((l) => l.locale === 'ja-JP');
    expect(en.title).toBe('About us');
    expect(en.body).toBe('<p>Company profile</p>');
    expect(ja.title).toBe('会社概要');
    // 非翻译字段不被覆盖（目标语种原本没有封面）
    expect(en.cover).toBe('');
    // 主语种内容不动
    expect(payload.find((l) => l.locale === 'zh-CN').title).toBe('关于我们');

    // 主表单切到 en-US 能看到回填结果
    const enTab = wrapper
      .findAll('.stub-tabs .stub-tab')
      .find((b) => b.attributes('data-key') === 'en-US');
    await enTab.trigger('click');
    await settle();
    expect(wrapper.findAll('input')[0].element.value).toBe('About us');

    wrapper.unmount();
  }, 60_000);

  it('没有保存通道时只回填，不自动提交', async () => {
    api.get.mockResolvedValue({
      default_locale: 'zh-CN',
      enabled_locales: ['zh-CN', 'en-US'],
    });
    api.post.mockResolvedValue({
      source_locale: 'zh-CN',
      target_locales: ['en-US'],
      provider: 'mock',
      translations: { 'en-US': { title: '【en-US】关于我们' } },
    });

    const wrapper = mountEditor();
    await settle();
    await findButton(wrapper, '一键翻译').trigger('click');
    await settle();
    await findButton(wrapper, '开始翻译').trigger('click');
    await settle();
    expect(document.body.textContent).toContain('演示模式');

    await findButton(wrapper, '采纳并保存').trigger('click');
    await settle();

    const payload = wrapper.emitted('update:locales').at(-1)[0];
    expect(payload.find((l) => l.locale === 'en-US').title).toBe(
      '【en-US】关于我们',
    );
    expect(document.body.querySelector('.stub-modal')).toBeNull();

    wrapper.unmount();
  }, 60_000);

  it('仅启用一个语种时不显示一键翻译入口', async () => {
    api.get.mockResolvedValue({
      default_locale: 'zh-CN',
      enabled_locales: ['zh-CN'],
    });

    const wrapper = mountEditor();
    await settle();
    expect(findButton(wrapper, '一键翻译')).toBeUndefined();

    wrapper.unmount();
  }, 60_000);
});
