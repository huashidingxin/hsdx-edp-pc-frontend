/**
 * 静态内容控件：**字段键规范在所有块类型下一致**。
 *
 * 回归（用户反馈）：`video` 块的 `video` 字段被渲染成单行文本框，用户没法传视频；
 * `card/cards` 里纯文本的 `content` 也退化成文本框，而不是富文本。
 *
 * 这里挂真实组件（只 stub 组件库与上传/富文本），按块断言渲染出来的控件类型：
 *   image 键 → 图片上传，image2 键 → 图片上传，video 键 → 视频上传，content 键 → 富文本。
 *
 * 运行前提：必须在**前端仓库根目录**跑（根 vitest.config.ts 才有 happy-dom）：
 *   cd apps/hsdx-edp-pc-frontend && ./node_modules/.bin/vitest run --pool=forks \
 *     --maxWorkers=1 --no-file-parallelism \
 *     apps/web-pc/src/views/site/pages/_components/__tests__/pageContentBlockControls.test.js
 */
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));

vi.mock('#/api/request', () => ({ requestClient: api }));

vi.mock('#/api/application-context', () => ({
  getCurrentApplicationId: () => null,
}));

vi.mock('@vben/access', () => ({
  useAccess: () => ({ hasAccessByCodes: () => true }),
}));

// 组件库整体 stub：只需要把插槽透传出来，控件断言靠 AppUpload / AppEditor 的 props。
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

  return {
    Alert: stub('Alert', ['type', 'showIcon', 'message', 'description']),
    Button: stub('Button', [
      'type',
      'size',
      'danger',
      'loading',
      'disabled',
      'block',
    ]),
    Card: stub('Card', ['size', 'bordered']),
    Collapse: stub('Collapse', ['activeKey', 'accordion']),
    CollapsePanel: defineComponent({
      name: 'CollapsePanel',
      props: ['activeKey'],
      setup(_props, { slots }) {
        // 保留 header（块名），测试按块名定位面板。
        return () =>
          h('section', { class: 'stub-panel' }, [
            h('header', slots.header?.()),
            slots.default?.(),
          ]);
      },
    }),
    Drawer: stub('Drawer', ['open', 'width', 'title', 'destroyOnClose']),
    Empty: stub('Empty', ['description']),
    Input: stub('Input', ['value', 'placeholder']),
    InputNumber: stub('InputNumber', ['value']),
    Select: stub('Select', ['value', 'options', 'mode', 'placeholder']),
    Space: stub('Space', ['size', 'direction']),
    Spin: stub('Spin', ['spinning', 'tip']),
    Switch: stub('Switch', ['checked']),
    Tag: stub('Tag', ['color']),
    TextArea: stub('TextArea', ['value', 'rows']),
    message: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  };
});

vi.mock('#/components/AppUpload.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'AppUpload',
      props: ['modelValue', 'value', 'fileType', 'multiple', 'disabled'],
      setup: () => () => h('div', { class: 'stub-upload' }),
    }),
  };
});

vi.mock('#/components/app-editor/index.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'AppEditor',
      props: ['modelValue', 'value', 'disabled'],
      setup: () => () => h('div', { class: 'stub-editor' }),
    }),
  };
});

const PAGE = { id: 1, code: 'home', locales: [{ locale: 'zh-CN' }] };

/** 三个块共用一份内容键，覆盖「专用类型」「自定义表单类型」两条渲染路径。 */
const SCHEMA_ROW = {
  locale: 'zh-CN',
  schema: {
    blocks: {
      'home-hero': {
        provider: 'static_content',
        enabled: true,
        config: { content_key: 'home', path: ['hero'] },
        editor: {
          type: 'image',
          label: '首页大图',
          fields: { image: { label: '大图' } },
        },
      },
      'home-promo': {
        provider: 'static_content',
        enabled: true,
        config: { content_key: 'home', path: ['promo'] },
        editor: { type: 'video', label: '宣传片' },
      },
      'home-features': {
        provider: 'static_content',
        enabled: true,
        config: { content_key: 'home', path: ['features'] },
        editor: {
          type: 'cards',
          label: '核心特点',
          fields: {
            title: { label: '标题' },
            content: { label: '说明' },
            image: { label: '配图' },
            image2: { label: '配图 2' },
            video: { label: '视频' },
          },
        },
      },
    },
  },
};

const CONTENT = {
  hero: 'image/hero.png',
  promo: { video: '', image: '' },
  // content 是**没有 HTML 标签的纯文本**：旧实现会因此退化成单行文本框
  features: [
    { title: 'A', content: '纯文本说明', image: '', image2: '', video: '' },
  ],
};

async function setup() {
  api.get.mockImplementation(async (url) => {
    if (url === '/page-data-schema') return { items: [SCHEMA_ROW] };
    if (url.startsWith('/pages/1/content/')) return { data: CONTENT };
    throw new Error(`未预期的 GET ${url}`);
  });
  api.put.mockResolvedValue({});

  const { default: PageContentManager } =
    await import('../PageContentManager.vue');
  const wrapper = mount(PageContentManager, {
    props: { open: true, embed: true, page: PAGE, currentLocale: 'zh-CN' },
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

/** 按块名（editor.label）定位该块的折叠面板。 */
function panelOf(wrapper, label) {
  return wrapper
    .findAll('section.stub-panel')
    .find((panel) => panel.text().includes(label));
}

function uploadTypes(panel) {
  return panel
    .findAllComponents({ name: 'AppUpload' })
    .map((item) => item.props('fileType'));
}

describe('字段键规范跨块类型一致（PageContentManager 实际渲染）', () => {
  it('video 块：video 键是视频上传控件（不再是文本框），image 键是封面图上传', async () => {
    const wrapper = await setup();
    const promo = panelOf(wrapper, '宣传片');
    expect(promo, '未渲染出 video 块面板').toBeTruthy();

    expect(uploadTypes(promo)).toEqual(['video', 'image']);
    const videoUpload = promo.findAllComponents({ name: 'AppUpload' })[0];
    expect(videoUpload.props('modelValue')).toBe('');
    // 视频地址不再让用户手填：该块里不该出现任何文本框
    expect(promo.findComponent({ name: 'Input' }).exists()).toBe(false);

    wrapper.unmount();
  });

  it('cards 块：image/image2 → 图片上传，video → 视频上传，content → 富文本', async () => {
    const wrapper = await setup();
    const features = panelOf(wrapper, '核心特点');
    expect(features, '未渲染出 cards 块面板').toBeTruthy();

    expect(uploadTypes(features)).toEqual(['image', 'image', 'video']);

    const editors = features.findAllComponents({ name: 'AppEditor' });
    expect(editors).toHaveLength(1);
    // 纯文本 content 也必须在富文本控件里编辑
    expect(editors[0].props('modelValue')).toBe('纯文本说明');

    wrapper.unmount();
  });

  it('image 块：image 键仍是图片上传（规范没把既有行为改坏）', async () => {
    const wrapper = await setup();
    const hero = panelOf(wrapper, '首页大图');
    expect(hero, '未渲染出 image 块面板').toBeTruthy();

    expect(uploadTypes(hero)).toEqual(['image']);

    wrapper.unmount();
  });
});
