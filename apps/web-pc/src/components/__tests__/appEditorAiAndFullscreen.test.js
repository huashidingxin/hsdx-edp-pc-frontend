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

  it('AiChatBar 移除预设提示词与按钮，支持选区删除与未选中任何内容时正常发送', async () => {
    const fetchAiMock = vi.fn().mockResolvedValue('<p>已润色</p>');
    const wrapper = mount(AiChatBar, {
      props: {
        fetchAi: fetchAiMock,
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

    // 1. 验证移除预设提示词与预设按钮：不应存在包含预设文本的按钮
    const presetKeywords = ['润色排版', '扩写深入', '翻译精炼', '总结要点'];
    const allButtonsText = wrapper.findAll('.app-editor-ai-box button').map((b) => b.text());
    for (const kw of presetKeywords) {
      expect(allButtonsText.some((t) => t.includes(kw))).toBe(false);
    }

    // 2. 选中的内容作用域展示定位与删除按钮
    const clearBtn = wrapper.find('button[title*="删除选中的内容范围"]');
    expect(clearBtn.exists()).toBe(true);
    expect(clearBtn.text()).toContain('✕');

    // 点击删除选中的内容范围
    await clearBtn.trigger('click');
    await nextTick();

    // 变为未选中任何内容（全文）
    expect(wrapper.text()).toContain('未选中任何内容 (全文)');
    expect(wrapper.vm.nodeInfo).toBeNull();

    // 3. 未选中任何内容时，输入内容可正常发送
    const textarea = wrapper.find('textarea');
    await textarea.setValue('请帮我写一段引言');
    expect(wrapper.vm.canSend).toBe(true);

    const sendBtn = wrapper.find('button[title*="发送"]');
    expect(sendBtn.attributes('disabled')).toBeUndefined();
    await sendBtn.trigger('click');
    await nextTick();

    expect(fetchAiMock).toHaveBeenCalled();
    const callArg = fetchAiMock.mock.calls[0][0];
    expect(callArg.scope).toBe('full');
    expect(callArg.instruction).toContain('请帮我写一段引言');
  });

  it('AiChatBar 附加的设计稿图片支持点击放大预览与角落独立删除按钮', async () => {
    const wrapper = mount(AiChatBar, {
      props: {
        fetchAi: vi.fn(),
      },
    });

    // 点击展开
    await wrapper.find('.app-editor-ai-fab').trigger('click');
    await nextTick();

    // 注入图片
    const testImgUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    wrapper.vm.images.push({ url: testImgUrl });
    await nextTick();

    // 缩略图容器与图片元素
    const imgContainer = wrapper.find('.group.relative.inline-flex');
    expect(imgContainer.exists()).toBe(true);
    const img = imgContainer.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe(testImgUrl);

    // 点击缩略图触发大图灯箱预览
    await imgContainer.trigger('click');
    await nextTick();
    expect(wrapper.vm.lightboxUrl).toBe(testImgUrl);

    // 独立删除按钮（不覆盖主体）
    const deleteBtn = imgContainer.find('button[title="移除此图"]');
    expect(deleteBtn.exists()).toBe(true);

    // 点击删除按钮移除图片
    await deleteBtn.trigger('click');
    await nextTick();
    expect(wrapper.vm.images.length).toBe(0);
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
  it(
    '全屏模式下 app-editor-wrapper 不带 overflow-y-auto，且底部状态条常驻显示页面设置',
    async () => {
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
            BubbleMenu: true,
            FloatingMenu: true,
          },
        },
      });

      const editorContainer = wrapper.find('.app-editor-tiptap');
      const editorWrapper = wrapper.find('.app-editor-wrapper');

      // 1. 验证最底部状态条常驻显示「页面设置:」及切换按钮
      const statusbar = wrapper.find('.app-editor-statusbar');
      expect(statusbar.exists()).toBe(true);
      expect(statusbar.text()).toContain('字符数:');
      expect(statusbar.text()).toContain('页面设置:');
      expect(statusbar.text()).toContain('公众号 (677px)');
      expect(statusbar.text()).toContain('手机 (375px)');

      // 点击状态条中的手机视口按钮
      const mobileBtn = statusbar.findAll('button').find((b) => b.text().includes('手机'));
      expect(mobileBtn).toBeTruthy();
      await mobileBtn.trigger('click');
      await nextTick();
      expect(wrapper.vm.editorCanvasWidth).toBe('375px');

      // 2. 初始状态非全屏
      expect(editorContainer.classes()).not.toContain('app-editor--fullscreen');
      expect(editorWrapper.classes()).not.toContain('overflow-y-auto');

      // 3. 通过组件实例切换全屏
      wrapper.vm.toggleFullscreen();
      await nextTick();

      expect(editorContainer.classes()).toContain('app-editor--fullscreen');
      // 关键修复点：全屏下 wrapper 不应有 overflow-y-auto 类
      expect(editorWrapper.classes()).not.toContain('overflow-y-auto');

      // 验证全屏下外层容器 flex 纵向布局结构存在
      expect(editorWrapper.classes()).toContain('flex');
      expect(editorWrapper.classes()).toContain('flex-col');
    },
    20000,
  );

  it('AI 作用域与节点选择彻底解耦，无选区时为全文，支持任意起止位置选区', async () => {
    const { default: AppEditor } = await import('../app-editor/index.vue');
    const wrapper = mount(AppEditor, {
      props: {
        modelValue: '<p>京华企业在追求现代化技术装备和先进工艺的同时</p>',
      },
      global: {
        stubs: {
          EditorToolbar: true,
          MediaLibraryModal: true,
          ExternalAssetsModal: true,
          VbenTiptap: VbenTiptapStub,
          BubbleMenu: true,
          FloatingMenu: true,
        },
      },
    });

    // 模拟光标无选区状态（光标闪烁，selection.empty = true）
    const dummyEditor = {
      isDestroyed: false,
      registerPlugin: vi.fn(),
      unregisterPlugin: vi.fn(),
      state: {
        doc: {
          textBetween: (from, to) => '现代化技术装备',
          content: { size: 100 },
        },
        selection: {
          from: 5,
          to: 5,
          empty: true,
        },
        schema: {},
      },
    };
    wrapper.vm.editorInstance = dummyEditor;

    // 光标未拉选区时：作用域为 null（显示未选中任何内容 / 全文），与节点检查器解耦
    expect(wrapper.vm.resolveAiScopeTarget()).toBeNull();

    // 划选任意起止位置文本（from: 5, to: 12）
    dummyEditor.state.selection = {
      from: 5,
      to: 12,
      empty: false,
      content: () => ({ content: [] }),
    };

    const target = wrapper.vm.resolveAiScopeTarget();
    expect(target).not.toBeNull();
    expect(target.kind).toBe('range');
    expect(target.from).toBe(5);
    expect(target.to).toBe(12);
    expect(target.label).toContain('选区');
    expect(target.label).toContain('现代化技术装备');
    expect(target.container).toBeDefined();
  });

  it('computeTokenDiff 准确执行中英文词级差分比对', async () => {
    const { computeTokenDiff } = await import('../app-editor/ai-diff-plugin');
    const ops = computeTokenDiff('现代化技术装备', '现代化高端装备');
    expect(ops.some((op) => op.type === 'equal' && op.text.includes('现代化'))).toBe(true);
    expect(ops.some((op) => op.type === 'delete' && op.text.includes('技术'))).toBe(true);
    expect(ops.some((op) => op.type === 'insert' && op.text.includes('高端'))).toBe(true);
  });

  it('方案 A：onAiSuggestionReady 针对划选范围生成内联比对，并支持接受与恢复原文', async () => {
    const { default: AppEditor } = await import('../app-editor/index.vue');
    const wrapper = mount(AppEditor, {
      props: {
        modelValue: '<p>现代化技术装备和先进工艺</p>',
      },
      global: {
        stubs: {
          EditorToolbar: true,
          MediaLibraryModal: true,
          ExternalAssetsModal: true,
          VbenTiptap: VbenTiptapStub,
          BubbleMenu: true,
          FloatingMenu: true,
        },
      },
    });

    const chainRunMock = vi.fn();
    const mockChain = {
      focus: () => mockChain,
      deleteRange: () => mockChain,
      insertContentAt: () => mockChain,
      run: chainRunMock,
    };
    const dummyEditor = {
      isDestroyed: false,
      registerPlugin: vi.fn(),
      unregisterPlugin: vi.fn(),
      chain: () => mockChain,
      getHTML: () => '<p>现代化技术装备和先进工艺</p>',
      getText: () => '现代化技术装备和先进工艺',
      view: {
        dispatch: vi.fn(),
        coordsAtPos: () => ({ top: 100, bottom: 120, left: 200, right: 300 }),
      },
      state: {
        doc: {
          textBetween: () => '现代化技术装备',
          content: { size: 100 },
        },
        tr: {
          setMeta: vi.fn(),
        },
      },
    };
    wrapper.vm.editorInstance = dummyEditor;

    // AI 生成新内容
    wrapper.vm.onAiSuggestionReady({
      html: '现代化高端装备',
      scope: {
        kind: 'range',
        from: 0,
        to: 7,
        text: '现代化技术装备',
      },
    });

    // 验证落入内联比对会话
    expect(wrapper.vm.aiSession).not.toBeNull();
    expect(wrapper.vm.aiSession.scopeKind).toBe('range');
    expect(wrapper.vm.aiSession.hunks[0].delCount).toBeGreaterThan(0);
    expect(wrapper.vm.aiSession.hunks[0].insCount).toBeGreaterThan(0);
    expect(chainRunMock).toHaveBeenCalled();

    // 接受修改
    wrapper.vm.acceptAiCurrent();
    expect(wrapper.vm.aiSession).toBeNull();
  });

  it('双栏模式开关与全屏解耦，左右并排且富文本始终可见', async () => {
    const { default: AppEditor } = await import('../app-editor/index.vue');
    const wrapper = mount(AppEditor, {
      props: {
        modelValue: '<p>双栏模式测试内容</p>',
      },
      global: {
        stubs: {
          EditorToolbar: true,
          MediaLibraryModal: true,
          ExternalAssetsModal: true,
          VbenTiptap: VbenTiptapStub,
          BubbleMenu: true,
          FloatingMenu: true,
        },
      },
    });

    const dummyEditor = {
      isDestroyed: false,
      registerPlugin: vi.fn(),
      unregisterPlugin: vi.fn(),
      getHTML: () => '<p>双栏模式测试内容</p>',
      state: {
        doc: {
          textBetween: () => '双栏模式测试内容',
          content: { size: 50 },
        },
        selection: { from: 1, to: 1, empty: true },
      },
    };
    wrapper.vm.editorInstance = dummyEditor;

    expect(wrapper.vm.isSplitView).toBe(false);
    expect(wrapper.vm.showEditor).toBe(true);
    expect(wrapper.vm.showSource).toBe(false);
    expect(wrapper.vm.isFullscreen).toBe(false);

    // 切换进入双栏模式：不强制要求全屏
    wrapper.vm.toggleSplitView();
    await nextTick();

    expect(wrapper.vm.isSplitView).toBe(true);
    expect(wrapper.vm.showEditor).toBe(true);
    expect(wrapper.vm.showSource).toBe(true);
    expect(wrapper.vm.isFullscreen).toBe(false);

    const rootEl = wrapper.find('.app-editor-tiptap');
    expect(rootEl.classes()).toContain('app-editor--split');

    // 退出双栏模式
    wrapper.vm.toggleSplitView();
    await nextTick();
    expect(wrapper.vm.isSplitView).toBe(false);
    expect(wrapper.vm.showSource).toBe(false);
  });

  it('工具栏已移除独立源码按钮，保留并支持双栏模式按钮', async () => {
    const { default: EditorToolbar } = await import('../app-editor/editor-toolbar.vue');
    const wrapper = mount(EditorToolbar, {
      props: {
        editor: null,
        editable: true,
        isSplitView: false,
        isFullscreen: false,
      },
    });

    // 验证独立源码模式按钮不存在
    const sourceBtn = wrapper.find('button[title*="编辑 HTML 源代码"]');
    expect(sourceBtn.exists()).toBe(false);

    // 验证双栏模式按钮存在
    const splitBtn = wrapper.find('button[title*="双栏模式"]');
    expect(splitBtn.exists()).toBe(true);

    // 点击双栏模式按钮触发 toggle-split-view emit
    await splitBtn.trigger('click');
    expect(wrapper.emitted('toggle-split-view')).toBeTruthy();
  });

  it('点击右侧源码时解除右侧高亮并清理左侧选中，防止回弹定位', async () => {
    const { default: AppEditor } = await import('../app-editor/index.vue');
    const wrapper = mount(AppEditor, {
      props: {
        modelValue: '<p>测试段落</p>',
      },
      global: {
        stubs: {
          EditorToolbar: true,
          MediaLibraryModal: true,
          ExternalAssetsModal: true,
          VbenTiptap: VbenTiptapStub,
          BubbleMenu: true,
          FloatingMenu: true,
        },
      },
    });

    const dummyEditor = {
      isDestroyed: false,
      registerPlugin: vi.fn(),
      unregisterPlugin: vi.fn(),
      getHTML: () => '<p>测试段落</p>',
      state: {
        doc: {
          textBetween: () => '测试段落',
          content: { size: 20 },
        },
        selection: { from: 1, to: 1, empty: true },
      },
    };
    wrapper.vm.editorInstance = dummyEditor;

    wrapper.vm.toggleSplitView();
    await nextTick();

    // 模拟左侧选中一个元素
    wrapper.vm.selectedElementTarget = {
      kind: 'node',
      pos: 1,
      node: {
        type: { name: 'paragraph' },
        textContent: '测试段落',
        attrs: {},
      },
    };

    const clearLocateMock = vi.fn();
    const locateElementMock = vi.fn();
    wrapper.vm.sourceAiApi = {
      clearLocate: clearLocateMock,
      locateRange: vi.fn(),
      locateElementAt: locateElementMock,
    };
    wrapper.vm.sourceView = {
      hasFocus: false,
      state: {
        doc: {
          toString: () => '<p>测试段落</p>',
        },
      },
    };

    // 触发左侧向右侧定位
    wrapper.vm.locateSelectedInSource();
    expect(locateElementMock).toHaveBeenCalled();

    // 模拟点击右侧源码区域 (触发 onSourceEditorInteract)
    wrapper.vm.onSourceEditorInteract();
    expect(clearLocateMock).toHaveBeenCalled();
    expect(wrapper.vm.selectedElementTarget).toBeNull();

    // 当右侧聚焦时，再次尝试定位应被拦截，绝不跳回
    wrapper.vm.sourceView.hasFocus = true;
    locateElementMock.mockClear();
    wrapper.vm.locateSelectedInSource();
    expect(locateElementMock).not.toHaveBeenCalled();
  });
});
