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

const INSPECT_HTML = '<h1>大标题</h1><p>普通段落</p>';

async function mountInspector(html = INSPECT_HTML) {
  const { default: AppEditor } = await import('../app-editor/index.vue');
  return mount(AppEditor, {
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

describe('app-editor 表格 Dock', () => {
  const TABLE_HTML = [
    '<p>表前文字</p>',
    '<table><tbody>',
    '<tr><th><p>姓名</p></th><th><p>年龄</p></th></tr>',
    '<tr><td><p>张三</p></td><td><p>20</p></td></tr>',
    '</tbody></table>',
    '<p>表后文字</p>',
  ].join('');

  async function mountTable() {
    const { default: AppEditor } = await import('../app-editor/index.vue');
    return mount(AppEditor, {
      attachTo: document.body,
      props: { modelValue: TABLE_HTML },
      global: {
        stubs: {
          EditorToolbar: true,
          MediaLibraryModal: true,
          ExternalAssetsModal: true,
          VbenTiptap: VbenTiptapStub,
        },
      },
    });
  }

  it('点击表格弹出表格卡并显示行列数，点外部收起', async () => {
    const wrapper = await mountTable();
    await settle();
    await waitForEditorReady();

    const cellP = wrapper.find('table td p');
    expect(cellP.exists()).toBe(true);
    // 真实点击顺序：mousedown 落光标，click 选中（合成 click 不带 selection）
    await cellP.trigger('mousedown');
    await cellP.trigger('click');
    await settle();

    const card = bodyQuery('.app-editor-table-toolbar');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('2 行');
    expect(card.textContent).toContain('2 列');
    // 表格高亮落在 wrapper 上（TableKit 结构），输出不受影响
    expect(bodyQuery('.tableWrapper.app-editor-table--selected')).not.toBeNull();

    // 点击表格外部：卡片收起，回到全局
    const outside = wrapper.find('.vben-tiptap-content > p');
    await outside.trigger('click');
    await settle();
    expect(bodyQuery('.app-editor-table-toolbar')).toBeNull();
    expect(bodyQuery('.app-editor-global-toolbar')).not.toBeNull();

    wrapper.unmount();
  }, 60000);

  it('表格行列命令走官方 TableKit（单测覆盖），此处仅确认卡片按钮齐备', async () => {
    const wrapper = await mountTable();
    await settle();
    await waitForEditorReady();

    const cellP2 = wrapper.find('table td p');
    await cellP2.trigger('mousedown');
    await cellP2.trigger('click');
    await settle();

    const labels = Array.from(
      document.body.querySelectorAll('.app-editor-table-toolbar button'),
    ).map((b) => (b.textContent || '').trim());
    for (const t of ['上插行', '下插行', '复制行', '删行', '左插列', '右插列', '复制列', '删列', '合并/拆分', '表头行', '无']) {
      expect(labels.some((l) => l.includes(t))).toBe(true);
    }

    wrapper.unmount();
  }, 60000);
});

describe('app-editor 元素检查器', () => {
  // Dock 已在编辑器树内（不再 teleport），一律用 wrapper 作用域查询；
  // 每个用例 finally 卸载，避免残留编辑器污染后续用例。
  async function clickInspect(wrapper, selector) {
    const target = wrapper.find(selector);
    expect(target.exists()).toBe(true);
    await target.trigger('mousedown');
    await target.trigger('click');
    await settle();
    return target;
  }

  function dockCard(wrapper, cls) {
    const card = wrapper.find(cls);
    expect(card.exists()).toBe(true);
    return card;
  }

  it('点击段落弹出检查器卡并可设置外边距', async () => {
    const wrapper = await mountInspector();
    try {
      await settle();
      await waitForEditorReady();

      await clickInspect(wrapper, '.vben-tiptap-content > p');
      const card = dockCard(wrapper, '.app-editor-inspector-toolbar');
      expect(card.text()).toContain('段落');
      expect(wrapper.find('.app-editor-columns-toolbar').exists()).toBe(false);

      // 设置上外边距 24px（v-model 吃 input 事件，提交走 change）
      const mtInput = card.element.querySelector('label[title="上"] input');
      expect(mtInput).not.toBeNull();
      mtInput.value = '24';
      mtInput.dispatchEvent(new Event('input', { bubbles: true }));
      mtInput.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      expect(wrapper.find('.vben-tiptap-content').element.innerHTML).toContain(
        'margin-top: 24px',
      );
    } finally {
      wrapper.unmount();
    }
  }, 60000);

  it('单节点元素可点选：hr', async () => {
    const wrapper = await mountInspector('<p>上</p><hr><p>下</p>');
    try {
      await settle();
      await waitForEditorReady();

      await clickInspect(wrapper, 'hr');
      const card = dockCard(wrapper, '.app-editor-inspector-toolbar');
      expect(card.text()).toContain('分割线');
    } finally {
      wrapper.unmount();
    }
  }, 60000);

  it('显示类型切换输出内联', async () => {
    const wrapper = await mountInspector();
    try {
      await settle();
      await waitForEditorReady();

      await clickInspect(wrapper, '.vben-tiptap-content > p');
      dockCard(wrapper, '.app-editor-inspector-toolbar');

      const inlineBtn = wrapper
        .findAll('.app-editor-inspector-toolbar button')
        .find((b) => b.text() === '行内块');
      expect(inlineBtn).toBeTruthy();
      await inlineBtn.trigger('click');
      await settle();
      expect(wrapper.find('.vben-tiptap-content').element.innerHTML).toContain(
        'display: inline-block',
      );
    } finally {
      wrapper.unmount();
    }
  }, 60000);

  it('面包屑可切换到祖先块', async () => {
    const wrapper = await mountInspector(
      '<ul><li><p>列表文字</p></li><li><p>第二项</p></li></ul>',
    );
    try {
      await settle();
      await waitForEditorReady();

      await clickInspect(wrapper, '.vben-tiptap-content li p');
      const card = dockCard(wrapper, '.app-editor-inspector-toolbar');
      const crumb = wrapper
        .findAll('.app-editor-inspector-toolbar button')
        .find((b) => b.text().includes('列表项'));
      expect(crumb).toBeTruthy();
      await crumb.trigger('click');
      await settle();
      expect(
        wrapper.find('.app-editor-inspector-toolbar').text(),
      ).toContain('列表项');
      expect(card.exists()).toBe(true);
    } finally {
      wrapper.unmount();
    }
  }, 60000);

  it('速写边距回显与祖先样式圆点', async () => {
    const wrapper = await mountInspector(
      '<section style="background-color: #fef08a;"><p style="margin: 10px 20px;">速写段落</p></section>',
    );
    try {
      await settle();
      await waitForEditorReady();

      await clickInspect(wrapper, '.vben-tiptap-content p');
      // 段落自带 margin 但仍上浮（叶子文本不锚定），落到带背景的 section
      let card = dockCard(wrapper, '.app-editor-inspector-toolbar');
      expect(card.text()).toContain('版块');
      // 经面包屑切回段落后，速写 margin: 10px 20px 展开为 上10右20下10左20
      const backCrumb = wrapper
        .findAll('.app-editor-inspector-toolbar button')
        .find((b) => b.text().includes('段落'));
      expect(backCrumb).toBeTruthy();
      await backCrumb.trigger('click');
      await settle();
      card = dockCard(wrapper, '.app-editor-inspector-toolbar');
      const inputs = card.element.querySelectorAll(
        '.app-editor-inspector__group input',
      );
      expect(inputs[0].value).toBe('10');
      expect(inputs[1].value).toBe('20');
      // 祖先 section 有背景色，面包屑带圆点
      expect(
        card.element.querySelectorAll('.bg-emerald-500').length,
      ).toBeGreaterThan(0);
    } finally {
      wrapper.unmount();
    }
  }, 60000);

  it('带特效父容器可选中：点父容器选中版块，点图片选中图片', async () => {
    const wrapper = await mountInspector(
      `<section style="box-shadow: 0 4px 16px rgba(0,0,0,.2);"><p><img src="${OUTSIDE_IMG}"></p></section>`,
    );
    try {
      await settle();
      await waitForEditorReady();

      // 点父容器本体 -> 版块（含阴影，可配）
      const section = wrapper.find('section');
      await section.trigger('mousedown');
      await section.trigger('click');
      await settle();
      const card = wrapper.find('.app-editor-inspector-toolbar');
      expect(card.exists()).toBe(true);
      expect(card.text()).toContain('版块');

      // 点图片本体 -> 图片卡（不受父容器影响）
      const img = wrapper.find(`img[src="${OUTSIDE_IMG}"]`);
      await img.trigger('mousedown');
      await img.trigger('click');
      await settle();
      expect(wrapper.find('.app-editor-image-toolbar').exists()).toBe(true);
    } finally {
      wrapper.unmount();
    }
  }, 60000);

  it('图片宽高支持px单位', async () => {
    const wrapper = await mountInspector(
      `<p>前</p><p><img src="${OUTSIDE_IMG}"></p>`,
    );
    try {
      await settle();
      await waitForEditorReady();

      const img = wrapper.find(`img[src="${OUTSIDE_IMG}"]`);
      await img.trigger('mousedown');
      await img.trigger('click');
      await settle();

      dockCard(wrapper, '.app-editor-image-toolbar');
      // 打开尺寸面板
      const sizePill = wrapper.find(
        '.app-editor-image-toolbar button[title="尺寸调节"]',
      );
      expect(sizePill.exists()).toBe(true);
      await sizePill.trigger('click');
      await settle();
      // 切到 px，设宽 300
      const pxBtn = wrapper
        .findAll('.app-editor-image-toolbar button')
        .find((b) => b.text() === 'px');
      expect(pxBtn).toBeTruthy();
      await pxBtn.trigger('click');
      await settle();

      const widthInput = wrapper.find(
        '.app-editor-image-toolbar input[placeholder="宽"]',
      );
      expect(widthInput.exists()).toBe(true);
      widthInput.element.value = '300';
      widthInput.element.dispatchEvent(new Event('input', { bubbles: true }));
      widthInput.element.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      expect(
        wrapper.find('.vben-tiptap-content').element.innerHTML,
      ).toContain('width: 300px');

      // 高度固定 200px
      const fixedBtn = wrapper
        .findAll('.app-editor-image-toolbar button')
        .find((b) => b.text() === '固定');
      await fixedBtn.trigger('click');
      await settle();
      const heightInput = wrapper.find(
        '.app-editor-image-toolbar input[placeholder="高 px"]',
      );
      heightInput.element.value = '200';
      heightInput.element.dispatchEvent(new Event('input', { bubbles: true }));
      heightInput.element.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      const html = wrapper.find('.vben-tiptap-content').element.innerHTML;
      expect(html).toContain('width: 300px');
      expect(html).toContain('height: 200px');
    } finally {
      wrapper.unmount();
    }
  }, 60000);
});
