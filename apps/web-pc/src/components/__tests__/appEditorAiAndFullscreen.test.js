// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';

vi.mock('#/api/request', () => ({ requestClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('#/api', () => ({ upload: vi.fn() }));
vi.mock('antdv-next', () => ({
  message: {
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));
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

import AiChatBar from '../app-editor/ai-chat-bar.vue';

const VbenTiptapStub = defineComponent({
  name: 'VbenTiptap',
  props: ['modelValue', 'minHeight', 'maxHeight'],
  setup(props) {
    return () =>
      h('div', { class: 'vben-tiptap' }, [
        h('div', [
          h('div', {
            class: 'vben-tiptap-content',
            innerHTML: props.modelValue || '<p>测试内容</p>',
          }),
        ]),
      ]);
  },
});

describe('app-editor AI 样式与交互能力', () => {
  it('AiChatBar 拥有单一根节点，正确继承 class 与 style', () => {
    const wrapper = mount(AiChatBar, {
      attrs: {
        class: 'app-editor-ai-float custom-class',
        style: { zIndex: 40 },
      },
      props: {
        fetchAi: vi.fn(),
      },
    });

    // 检查根节点与属性继承
    expect(wrapper.element.classList.contains('app-editor-ai-chat')).toBe(true);
    expect(wrapper.element.classList.contains('app-editor-ai-float')).toBe(true);
    expect(wrapper.element.classList.contains('custom-class')).toBe(true);
  });

  it('AiChatBar 折叠态展示胶囊按钮与 AI 助手标识，点击展开且支持预设灵感填充', async () => {
    const wrapper = mount(AiChatBar, {
      props: {
        fetchAi: vi.fn(),
        resolveScope: () => ({ label: 'H2 标题', text: '标题文本', html: '<h2>标题文本</h2>' }),
      },
    });

    // 折叠态：展示 AI 助手与当前节点 chip
    const fab = wrapper.find('.app-editor-ai-fab');
    expect(fab.exists()).toBe(true);
    expect(fab.text()).toContain('AI 助手');
    expect(fab.text()).toContain('H2 标题');

    // 点击展开
    await fab.trigger('click');
    await nextTick();

    const box = wrapper.find('.app-editor-ai-box');
    expect(box.exists()).toBe(true);

    // 预设灵感按钮展示
    const presetBtns = wrapper.findAll('.app-editor-ai-box button').filter((b) =>
      b.text().includes('润色排版'),
    );
    expect(presetBtns.length).toBeGreaterThan(0);

    // 点击预设自动填入输入框
    await presetBtns[0].trigger('click');
    await nextTick();

    const textarea = wrapper.find('textarea');
    expect(textarea.element.value).toContain('优化排版');
  });

  it('AiChatBar 流式生成态展示动态状态与停止按钮', async () => {
    let resolveAi;
    const fetchAiMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveAi = resolve;
        }),
    );

    const wrapper = mount(AiChatBar, {
      props: {
        fetchAi: fetchAiMock,
        resolveScope: () => ({ label: '段落', text: '正文', html: '<p>正文</p>' }),
      },
    });

    await wrapper.find('.app-editor-ai-fab').trigger('click');
    await nextTick();

    const textarea = wrapper.find('textarea');
    await textarea.setValue('请润色本段');

    // 点击发送
    const sendBtn = wrapper.findAll('button').find((b) => b.attributes('title')?.includes('发送'));
    expect(sendBtn).toBeTruthy();
    await sendBtn.trigger('click');
    await nextTick();

    // 处于运行中状态
    expect(wrapper.text()).toContain('AI 正在构思修改建议');
    const stopBtn = wrapper.findAll('button').find((b) => b.text().includes('停止'));
    expect(stopBtn).toBeTruthy();

    // 模拟生成完成
    resolveAi('<p>润色后的正文</p>');
    await nextTick();
  });
});

describe('app-editor 全屏模式工具栏与排版结构', () => {
  it('全屏模式下 app-editor-wrapper 不带 overflow-y-auto，确保底部 Dock 工具栏不跟随滚动', async () => {
    const { default: AppEditor } = await import('../app-editor/index.vue');
    const wrapper = mount(AppEditor, {
      props: {
        modelValue: '<p>段落内容</p>',
      },
      global: {
        stubs: {
          EditorToolbar: true,
          MediaLibraryModal: true,
          ExternalAssetsModal: true,
          VbenTiptap: VbenTiptapStub,
        },
      },
    });

    const editorContainer = wrapper.find('.app-editor-tiptap');
    const editorWrapper = wrapper.find('.app-editor-wrapper');

    // 初始状态非全屏
    expect(editorContainer.classes()).not.toContain('app-editor--fullscreen');
    expect(editorWrapper.classes()).not.toContain('overflow-y-auto');

    // 通过组件实例切换全屏
    wrapper.vm.toggleFullscreen();
    await nextTick();

    expect(editorContainer.classes()).toContain('app-editor--fullscreen');
    // 关键修复点：全屏下 wrapper 不应有 overflow-y-auto 类
    expect(editorWrapper.classes()).not.toContain('overflow-y-auto');

    // 验证全屏下外层容器 flex 纵向布局结构存在
    expect(editorWrapper.classes()).toContain('flex');
    expect(editorWrapper.classes()).toContain('flex-col');
  });
});
