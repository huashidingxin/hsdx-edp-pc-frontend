// @vitest-environment happy-dom
/**
 * 多栏点击选中回归测试（组件级，真实 ProseMirror 视图）
 *
 * 用户反馈：单独点击多栏无反应；先点外部图片再点多栏才弹出，且栏外图片
 * 工具条还残留。本测试用真实 Editor 视图仿真点击，断言：
 * 1. 直接点击多栏内段落 → 多栏工具条出现；
 * 2. 点栏外图片 → 图片工具条出现、多栏工具条不出现；
 * 3. 再点多栏 → 多栏工具条出现、图片工具条消失（不残留）；
 * 4. 点栏内图片 → 多栏 + 图片双工具条堆叠。
 */
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';

vi.mock('#/api/request', () => ({ requestClient: { get: vi.fn() } }));
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

// 轻量 VbenTiptap 替身：挂载真实 Editor（沿用传入的 extensions，
// 其中包含 editorBridge，onEditorReady 能正常拿到实例）
const VbenTiptapStub = defineComponent({
  name: 'VbenTiptap',
  props: {
    modelValue: { type: String, default: '' },
    editable: { type: Boolean, default: true },
    placeholder: { type: String, default: '' },
    minHeight: { type: [Number, String], default: 240 },
    maxHeight: { type: [Number, String], default: 480 },
    toolbar: { type: Boolean, default: false },
    previewable: { type: Boolean, default: false },
    extensions: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { emit }) {
    const el = ref(null);
    let editor = null;
    onMounted(() => {
      editor = new Editor({
        element: el.value,
        extensions: props.extensions,
        content: props.modelValue || '',
      });
      editor.on('update', ({ editor: e }) => {
        const html = e.getHTML();
        emit('update:modelValue', html);
        emit('change', html);
      });
    });
    onBeforeUnmount(() => {
      try {
        editor?.destroy();
      } catch {}
    });
    watch(
      () => props.modelValue,
      (v) => {
        if (editor && typeof v === 'string' && v !== editor.getHTML()) {
          editor.commands.setContent(v, { emitUpdate: false });
        }
      },
    );
    return () => h('div', { ref: el, class: 'vben-tiptap-stub' });
  },
});

const COLUMNS_HTML = [
  '<div class="cms-columns cms-columns--stack" style="display: flex; gap: 16px; margin: 16px 0; box-sizing: border-box; width: 100%;">',
  '<div class="cms-column" style="flex: 1 1 0%; min-width: 0; box-sizing: border-box;"><p>11</p></div>',
  '<div class="cms-column" style="flex: 1 1 0%; min-width: 0; box-sizing: border-box;"><p>22</p></div>',
  '<div class="cms-column" style="flex: 1 1 0%; min-width: 0; box-sizing: border-box;"><p>33</p></div>',
  '</div>',
].join('');
const OUTSIDE_IMG = 'https://example.com/outside.png';
const INITIAL_HTML = `<p>前言</p>${COLUMNS_HTML}<p><img src="${OUTSIDE_IMG}"></p>`;

async function settle(rounds = 3) {
  for (let i = 0; i < rounds; i += 1) {
    await flushPromises();
    await nextTick();
    // 让出宏任务：Tiptap v3 的 create 事件在 setTimeout(0) 中触发，
    // 桥接就绪（editorInstance）依赖它，必须等宏任务
    await new Promise((resolve) => setTimeout(resolve, 10));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function waitForEditorReady() {
  for (let i = 0; i < 50; i += 1) {
    const root = document.body.querySelector('.app-editor-tiptap');
    if (root?.dataset?.editorReady === 'true') return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('editor bridge never became ready');
}

function bodyQuery(sel) {
  return document.body.querySelector(sel);
}

describe('app-editor 多栏点击选中', () => {
  it('点击路径回归', async () => {
    const { default: AppEditor } = await import('../app-editor/index.vue');
    const wrapper = mount(AppEditor, {
      attachTo: document.body,
      props: { modelValue: INITIAL_HTML },
      global: {
        stubs: {
          EditorToolbar: true,
          MediaLibraryModal: true,
          ExternalAssetsModal: true,
          VbenTiptap: VbenTiptapStub,
        },
      },
    });
    await settle();

    // 前置：多栏与栏外图片都渲染出来
    expect(wrapper.find('.cms-columns').exists()).toBe(true);
    const outsideImg = wrapper.find(`img[src="${OUTSIDE_IMG}"]`);
    expect(outsideImg.exists()).toBe(true);
    // 桥接就绪（Tiptap v3 create 事件延迟场景下由 pending 回放覆盖）
    await waitForEditorReady();

    // 1. 直接点击多栏内段落 → 多栏工具条出现
    const colP = wrapper.find('.cms-columns p');
    expect(colP.exists()).toBe(true);
    await colP.trigger('click');
    await settle();
    expect(bodyQuery('.app-editor-columns-toolbar')).not.toBeNull();

    // 1b. 点击 Dock 中的选项（比例）→ 面板展开，工具条不得被关闭
    const ratioBtn = wrapper.find('button[title="调整列宽比例"]');
    expect(ratioBtn.exists()).toBe(true);
    await ratioBtn.trigger('click');
    await settle();
    expect(bodyQuery('.app-editor-columns-toolbar')).not.toBeNull();
    expect(document.body.innerHTML).toContain('快捷比例切换');

    // 2. 点击栏外图片 → 图片工具条出现、多栏工具条消失
    await outsideImg.trigger('click');
    await settle();
    expect(bodyQuery('.app-editor-image-toolbar')).not.toBeNull();
    expect(bodyQuery('.app-editor-columns-toolbar')).toBeNull();

    // 3. 再点多栏 → 多栏出现、图片工具条消失（不残留）
    await colP.trigger('click');
    await settle();
    expect(bodyQuery('.app-editor-columns-toolbar')).not.toBeNull();
    expect(bodyQuery('.app-editor-image-toolbar')).toBeNull();

    // 4. 点空白处回到全局模式：上下文卡消失，全局卡（页面设置）出现
    const preface = wrapper.find('.vben-tiptap-content > p');
    await preface.trigger('click');
    await settle();
    expect(bodyQuery('.app-editor-columns-toolbar')).toBeNull();
    expect(bodyQuery('.app-editor-image-toolbar')).toBeNull();
    expect(bodyQuery('.app-editor-global-toolbar')).not.toBeNull();

    // 5. 全局一键排版：点击两端对齐，正文出现 text-align
    const justifyBtn = Array.from(
      document.body.querySelectorAll('.app-editor-global-toolbar button'),
    ).find((b) => b.textContent?.includes('两端对齐'));
    expect(justifyBtn).toBeTruthy();
    justifyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
    expect(
      document.body.querySelector('.vben-tiptap-content').innerHTML,
    ).toContain('text-align: justify');

    wrapper.unmount();
  }, 60000);

  it('复制样式按钮状态：用多栏才高亮呼吸，纯文本保持常态', async () => {
    const { default: AppEditor } = await import('../app-editor/index.vue');
    const mountOne = (html) =>
      mount(AppEditor, {
        attachTo: document.body,
        props: { modelValue: html },
        global: {
          stubs: {
            EditorToolbar: true,
            MediaLibraryModal: true,
            ExternalAssetsModal: true,
            VbenTiptap: VbenTiptapStub,
          },
        },
      });
    const copyBtnOf = () =>
      document.body.querySelector('.app-editor-copy-styles-btn');

    // 含多栏 → 按钮高亮（is-active）+ 呼吸点
    const withColumns = mountOne(INITIAL_HTML);
    await settle();
    const activeBtn = copyBtnOf();
    expect(activeBtn).not.toBeNull();
    expect(activeBtn.classList.contains('is-active')).toBe(true);
    expect(activeBtn.querySelector('.animate-pulse')).not.toBeNull();
    withColumns.unmount();

    // 纯文本 → 按钮常态，无高亮无呼吸点（不打扰，但功能仍在）
    const plain = mountOne('<p>纯文本，无多栏</p>');
    await settle();
    const calmBtn = copyBtnOf();
    expect(calmBtn).not.toBeNull();
    expect(calmBtn.classList.contains('is-active')).toBe(false);
    expect(calmBtn.querySelector('.animate-pulse')).toBeNull();
    plain.unmount();
  }, 90000);
});
