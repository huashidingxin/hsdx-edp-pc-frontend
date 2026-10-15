// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { emojis, shortcodeToEmoji } from '@tiptap/extension-emoji';
import { createEditorExtensions } from '../app-editor/extensions';
import {
  findColumnsNodeAndPos,
  findImageNodeAndPos,
  findNodePosByDOM,
} from '../app-editor/dom-lookup';
import {
  cleanEmptyTopParagraphs,
  collectHeadingOutline,
  findTextRange,
  justifyAllContent,
  unifyAllLineHeight,
} from '../app-editor/doc-actions';
import { collectMatches } from '../app-editor/find-plugin';
import { SLASH_COMMANDS } from '../app-editor/slash-menu';
import { contentStylesCss, usesCustomStyleBlocks } from '../app-editor/content-styles.js';
import {
  appEditorSelectionKey,
  dispatchColumnsSelected,
  dispatchMediaSelected,
  dispatchSelectionCleared,
} from '../app-editor/selection-plugin';
import { sanitizePastedHtml } from '../app-editor/paste-preserve';

describe('app-editor 扩展与保真解析验证', () => {
  it('正确加载扩展集合，且包含原生 Section 与 RichImage', () => {
    const extensions = createEditorExtensions({ placeholder: '测试输入...' });
    expect(extensions.length).toBeGreaterThan(10);

    const hasSection = extensions.some((ext) => ext.name === 'section');
    const hasImage = extensions.some((ext) => ext.name === 'image');
    const hasPreserve = extensions.some((ext) => ext.name === 'preserveAttributes');
    expect(hasSection).toBe(true);
    expect(hasImage).toBe(true);
    expect(hasPreserve).toBe(true);
  });

  it('135 / 微信素材 HTML 解析与输出：保留 section 嵌套、style 与图片定位层级样式，无侵入性 wrapper div', () => {
    const extensions = createEditorExtensions();
    const rawHtml = [
      '<section style="display: flex; position: relative;">',
      '<section style="background-color: rgb(238, 246, 249);">寒露凝霜 秋深转凉</section>',
      '<img src="https://example.com/leaf.png" style="position: absolute; right: 0px; top: -15px; z-index: 10; width: 60px;" width="60" />',
      '</section>',
    ].join('');

    const editor = new Editor({
      extensions,
      content: rawHtml,
    });

    const outputHtml = editor.getHTML();
    // 验证 section 节点正常保留
    expect(outputHtml).toContain('<section');
    expect(outputHtml).toContain('display: flex');
    expect(outputHtml).toContain('寒露凝霜 秋深转凉');

    // 验证图片样式、src、width 完整保留，保证图一层级与图二尺寸
    expect(outputHtml).toContain('https://example.com/leaf.png');
    expect(outputHtml).toContain('position: absolute');
    expect(outputHtml).toContain('z-index: 10');
    expect(outputHtml).toContain('width: 60px');

    // 严禁存在破坏布局的 NodeView wrapper div
    expect(outputHtml).not.toContain('app-editor-image');
    expect(outputHtml).not.toContain('app-editor-section__content');

    editor.destroy();
  });

  it('清洗 Word / Office 来源的垃圾标签与样式', () => {
    const dirty =
      '<div style="mso-padding-alt: 0cm; font-size: 14px;"><o:p><span>内容</span></o:p></div>';
    const cleaned = sanitizePastedHtml(dirty);
    expect(cleaned).not.toContain('o:p');
    expect(cleaned).not.toContain('mso-padding-alt');
    expect(cleaned).toContain('font-size: 14px');
    expect(cleaned).toContain('内容');
  });

  it('CMS 多栏扩展：内联基线「一排 x 个」、perRow 切换与旧版 round-trip', () => {
    const extensions = createEditorExtensions();
    expect(extensions.some((ext) => ext.name === 'columns')).toBe(true);
    expect(extensions.some((ext) => ext.name === 'column')).toBe(true);

    const editor = new Editor({
      extensions,
      content: '<p>初始内容</p>',
    });

    // 默认 perRow=1：容器不带 display，列宽 100% 块流堆叠（无 CSS 环境原样保真）
    editor.commands.insertColumns({ cols: 2, layout: '1:2', gap: '24px', keepContent: true });
    let html = editor.getHTML();

    expect(html).toContain('cms-columns cms-columns--row1');
    expect(html).toContain('cms-column');
    expect(html).toContain('--cms-columns-gap: 24px');
    expect(html).not.toContain('display: flex');
    expect(html).not.toContain('data-');
    // 一排 1 个：列宽 100%，列间距由第 2 列的 margin-top 承载
    expect(html).toContain('width: 100%');
    expect(html).toContain('margin-top: 24px');
    // flex 权重常驻内联：宽屏被 class 适配为 flex 时按 1:2 分配
    // （happy-dom 序列化会把 flex 简写展开为 longhand，断言兼容两种形态）
    expect(html).toMatch(/flex(-grow)?\s*:\s*1\b/);
    expect(html).toMatch(/flex(-grow)?\s*:\s*2\b/);

    // 每行 2 个：浮动两列 + 对侧内衬距 + 百分比宽（1:2 → 33.33% / 66.67%）
    editor.commands.setColumnsPerRow(2);
    html = editor.getHTML();
    expect(html).toContain('cms-columns--row2');
    expect(html).not.toContain('cms-columns--row1');
    expect(html).toContain('float: left');
    expect(html).toContain('width: 33.33%');
    expect(html).toContain('width: 66.67%');
    expect(html).toContain('padding-right: 12px');
    expect(html).toContain('padding-left: 12px');
    expect(html).toContain('overflow: hidden');

    // 间隙变化同步重建内衬距（24px → 8px，对侧各 4px）
    editor.commands.setColumnsGap('8px');
    html = editor.getHTML();
    expect(html).toContain('--cms-columns-gap: 8px');
    expect(html).toContain('padding-right: 4px');

    // 旧版内容（--stack/--keep + 内联 flex）原样 round-trip，不被静默改写
    const legacy = new Editor({
      extensions,
      content: [
        '<div class="cms-columns cms-columns--stack" style="display: flex; gap: 16px; margin: 16px 0; box-sizing: border-box; width: 100%;">',
        '<div class="cms-column" style="flex: 1 1 0%; min-width: 0; box-sizing: border-box;"><p>11</p></div>',
        '<div class="cms-column" style="flex: 1 1 0%; min-width: 0; box-sizing: border-box;"><p>22</p></div>',
        '</div>',
      ].join(''),
    });
    expect(legacy.getHTML()).toContain('cms-columns--stack');
    expect(legacy.getHTML()).toContain('display: flex');
    // 被任一结构命令触碰即整体迁移到新基线（class 与内联样式原子切换）
    legacy.commands.setColumnsGap('8px');
    const migrated = legacy.getHTML();
    expect(migrated).toContain('cms-columns--row1');
    expect(migrated).not.toContain('cms-columns--stack');
    expect(migrated).not.toContain('display: flex');
    legacy.destroy();

    editor.commands.unsetColumns();
    html = editor.getHTML();
    expect(html).not.toContain('cms-columns');
    expect(html).toContain('初始内容');

    editor.destroy();
  });

  it('多栏结构命令（加列/右移/删列）后内联基线保持一致', () => {
    const extensions = createEditorExtensions();
    const editor = new Editor({ extensions, content: '<p>种子</p>' });

    editor.commands.insertColumns({ cols: 3, layout: '1:1:1', gap: '16px', perRow: 2, keepContent: false });
    // 3 列按一排 2 个：前两列各半（含对侧内衬距），落单末列占满整行
    let html = editor.getHTML();
    expect(html.match(/class="cms-column"/g)?.length).toBe(3);
    expect(html.match(/float: left/g)?.length).toBe(3);
    expect(html).toContain('width: 100%');

    editor.commands.addColumn('after');
    html = editor.getHTML();
    // 4 列两两一排：无落单列，全部 50% + 交替内衬距
    expect(html.match(/class="cms-column"/g)?.length).toBe(4);
    expect(html.match(/width: 50%/g)?.length).toBe(4);
    expect(html.match(/padding-right: 8px/g)?.length).toBe(2);
    expect(html.match(/padding-left: 8px/g)?.length).toBe(2);

    editor.commands.moveColumnRight();
    html = editor.getHTML();
    expect(html.match(/class="cms-column"/g)?.length).toBe(4);
    expect(html.match(/width: 50%/g)?.length).toBe(4);

    editor.commands.deleteColumnAtIndex(0);
    html = editor.getHTML();
    expect(html.match(/class="cms-column"/g)?.length).toBe(3);
    expect(html).toContain('cms-columns--row2');

    editor.destroy();
  });

  it('版式网格（web-article / web-bleed）：全宽标记切换与输出样式覆盖', () => {
    const extensions = createEditorExtensions();
    const editor = new Editor({
      extensions,
      content: '<p>段落</p>',
    });

    editor.commands.insertColumns({ cols: 2, layout: '1:1', gap: '16px' });
    let html = editor.getHTML();
    expect(html).not.toContain('web-bleed');
    expect(usesCustomStyleBlocks(html)).toBe(true);

    // 切换多栏为全宽通栏（web-bleed）
    editor.commands.toggleColumnsBleed();
    html = editor.getHTML();
    expect(html).toContain('cms-columns');
    expect(html).toContain('web-bleed');

    // 调整间距时 web-bleed 必须被原子保留
    editor.commands.setColumnsGap('24px');
    html = editor.getHTML();
    expect(html).toContain('web-bleed');
    expect(html).toContain('--cms-columns-gap: 24px');

    // 首/末列内收（外边距）：仅对全宽块有意义，切换后类被记录
    editor.commands.toggleColumnsInset('start');
    html = editor.getHTML();
    expect(html).toContain('cms-columns--inset-start');

    editor.commands.toggleColumnsInset('end');
    html = editor.getHTML();
    expect(html).toContain('cms-columns--inset-end');

    // 调整间距时 web-bleed 与首/末列内收必须被原子保留
    editor.commands.setColumnsGap('32px');
    html = editor.getHTML();
    expect(html).toContain('web-bleed');
    expect(html).toContain('cms-columns--inset-start');
    expect(html).toContain('cms-columns--inset-end');
    expect(html).toContain('--cms-columns-gap: 32px');

    // 关闭首/末列内收
    editor.commands.toggleColumnsInset('start');
    editor.commands.toggleColumnsInset('end');
    html = editor.getHTML();
    expect(html).not.toContain('cms-columns--inset-start');
    expect(html).not.toContain('cms-columns--inset-end');

    // 再次切换退出全宽
    editor.commands.toggleColumnsBleed();
    html = editor.getHTML();
    expect(html).not.toContain('web-bleed');

    // 多栏等高铺满：开启后类被记录，且在调整间距时被原子保留
    editor.commands.toggleColumnsEqualHeight();
    html = editor.getHTML();
    expect(html).toContain('cms-columns--equal-height');

    editor.commands.setColumnsGap('16px');
    html = editor.getHTML();
    expect(html).toContain('cms-columns--equal-height');

    editor.commands.toggleColumnsEqualHeight();
    html = editor.getHTML();
    expect(html).not.toContain('cms-columns--equal-height');

    // 输出样式表包含首/末列内收规则与容器 padding 及等高铺满规则
    expect(contentStylesCss).toContain('cms-columns--inset-start');
    expect(contentStylesCss).toContain('cms-columns--inset-end');
    expect(contentStylesCss).toContain('cms-columns--equal-height');
    expect(contentStylesCss).toContain('padding-left: var(--web-article-inset');
    expect(contentStylesCss).toContain('padding-right: var(--web-article-inset');

    // 纯 HTML 中仅含 web-bleed 也被识别为依赖样式表
    expect(usesCustomStyleBlocks('<section class="banner web-bleed">内容</section>')).toBe(true);
    expect(usesCustomStyleBlocks('<p>纯文本</p>')).toBe(false);

    // 输出样式表包含 web-article 与 web-bleed 网格定义
    expect(contentStylesCss).toContain('.web-article');
    expect(contentStylesCss).toContain('.web-bleed');
    expect(contentStylesCss).toContain('--web-article-width: 1200px');
    expect(contentStylesCss).toContain('--web-article-gutter: 24px');
    expect(contentStylesCss).toContain('section.web-bleed');
    expect(contentStylesCss).toContain('div.web-bleed:not(.cms-columns)');
    expect(contentStylesCss).toContain('img.web-bleed');

    // Slash 命令表中包含全宽命令
    const bleedCmd = SLASH_COMMANDS.find((c) => c.id === 'bleed');
    expect(bleedCmd).toBeDefined();
    expect(bleedCmd.title).toContain('全宽通栏');

    editor.destroy();
  });

  it('多栏嵌套图片节点查找与双重定位能力验证', () => {
    const extensions = createEditorExtensions();
    const editor = new Editor({
      extensions,
      content: '<p>前文</p>',
    });

    editor.commands.insertColumns({ cols: 2, layout: '1:1', gap: '16px' });
    // 在多栏第 1 栏内插入图片
    editor.commands.setImage({ src: 'https://example.com/column-img.png' });

    const html = editor.getHTML();
    expect(html).toContain('column-img.png');
    expect(html).toContain('cms-columns');

    // 验证能够精确匹配到内部的 image 节点
    let foundImg = null;
    let foundColumns = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image' && node.attrs.src === 'https://example.com/column-img.png') {
        foundImg = { node, pos };
      }
      if (node.type.name === 'columns') {
        foundColumns = { node, pos };
      }
    });

    expect(foundImg).not.toBeNull();
    expect(foundColumns).not.toBeNull();
    expect(foundImg.pos).toBeGreaterThan(foundColumns.pos);

    editor.destroy();
  });

  it('同 src 图片：栏内图片按 DOM 身份精确命中，不误匹配栏外图片', () => {
    const extensions = createEditorExtensions();
    const editor = new Editor({
      extensions,
      content: '<p>外部段落<img src="https://example.com/same.png"></p>',
    });

    editor.commands.insertColumns({ cols: 2, layout: '1:1', gap: '16px' });
    // 光标在第 1 栏内，插入相同 src 的图片
    editor.commands.setImage({ src: 'https://example.com/same.png' });

    const view = editor.view;
    const domImgs = Array.from(view.dom.querySelectorAll('img'));
    expect(domImgs.length).toBe(2);

    // 文档中两张同 src 图片的位置
    const docPositions = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') docPositions.push(pos);
    });
    expect(docPositions.length).toBe(2);
    const [firstPos, secondPos] = [...docPositions].sort((a, b) => a - b);

    // DOM 身份优先：第二张 DOM 图片必须命中第二个（栏内）位置，而非栏外第一张
    const hitInner = findImageNodeAndPos(view, domImgs[1]);
    expect(hitInner).not.toBeNull();
    expect(hitInner.pos).toBe(secondPos);

    const hitOuter = findImageNodeAndPos(view, domImgs[0]);
    expect(hitOuter).not.toBeNull();
    expect(hitOuter.pos).toBe(firstPos);

    // nodeDOM 身份直查同样精确
    expect(findNodePosByDOM(view, domImgs[1], 'image')?.pos).toBe(secondPos);

    // 多栏容器按 DOM 身份命中
    const columnsEl = view.dom.querySelector('.cms-columns');
    const hitColumns = findColumnsNodeAndPos(view, columnsEl);
    expect(hitColumns).not.toBeNull();
    expect(hitColumns.node.type.name).toBe('columns');

    // 脱离 view 的元素不盲猜，返回 null（宁可不选中也不删错）
    const detached = document.createElement('img');
    detached.setAttribute('src', 'https://example.com/same.png');
    expect(findImageNodeAndPos(view, detached)).toBeNull();

    editor.destroy();
  });

  it('选中高亮走 Decorations：dispatch 后视图带选中类，输出 HTML 保持纯净', () => {
    const extensions = createEditorExtensions();
    const editor = new Editor({
      extensions,
      content: '<p>前言</p>',
    });
    editor.commands.insertColumns({ cols: 2, layout: '1:1', gap: '16px' });

    let columnsPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'columns') columnsPos = pos;
    });
    expect(columnsPos).not.toBeNull();

    // 高亮多栏：视图 DOM 带类，但 getHTML 不污染
    dispatchColumnsSelected(editor, columnsPos);
    expect(
      editor.view.dom.querySelector('.cms-columns.app-editor-columns--selected'),
    ).not.toBeNull();
    expect(editor.getHTML()).not.toContain('app-editor-columns--selected');
    expect(appEditorSelectionKey.getState(editor.state)?.columnsPos).toBe(columnsPos);

    // 在栏内插入图片并高亮：图片带类
    editor.commands.setImage({ src: 'https://example.com/deco.png' });
    let imgPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imgPos = pos;
    });
    expect(imgPos).not.toBeNull();
    dispatchMediaSelected(editor, imgPos, 'image');
    const decoImg = editor.view.dom.querySelector('img.app-editor-image--selected');
    expect(decoImg).not.toBeNull();
    expect(decoImg.getAttribute('src')).toBe('https://example.com/deco.png');

    // 清除后两类高亮同时消失
    dispatchSelectionCleared(editor);
    expect(
      editor.view.dom.querySelector('.app-editor-columns--selected'),
    ).toBeNull();
    expect(editor.view.dom.querySelector('.app-editor-image--selected')).toBeNull();

    editor.destroy();
  });

  it('Dock 全局一键排版：两端对齐 / 统一行高 / 清除空段', () => {
    const extensions = createEditorExtensions();
    const editor = new Editor({
      extensions,
      content: '<p>第一段</p><p></p><p>第二段</p><p></p>',
    });

    expect(justifyAllContent(editor)).toBe(true);
    let html = editor.getHTML();
    expect(html).toContain('text-align: justify');

    expect(unifyAllLineHeight(editor, '1.75')).toBe(true);
    html = editor.getHTML();
    expect(html).toContain('line-height: 1.75');

    const removed = cleanEmptyTopParagraphs(editor);
    expect(removed).toBe(2);
    html = editor.getHTML();
    expect(html).toContain('第一段');
    expect(html).toContain('第二段');
    expect(html).not.toMatch(/<p><\/p>/);

    editor.destroy();
  });

  it('清除空段落：全空文档至少保留一个块', () => {
    const extensions = createEditorExtensions();
    const editor = new Editor({
      extensions,
      content: '<p></p>',
    });

    expect(cleanEmptyTopParagraphs(editor)).toBe(0);
    expect(editor.state.doc.childCount).toBe(1);

    editor.destroy();
  });

  it('最高兼容内联：裸图片输出自带 max-width，已有样式不重复追加', () => {
    const extensions = createEditorExtensions();

    const bare = new Editor({
      extensions,
      content: '<p><img src="https://example.com/a.png"></p>',
    });
    expect(bare.getHTML()).toContain('max-width: 100%');
    bare.destroy();

    const styled = new Editor({
      extensions,
      content: '<p><img src="https://example.com/b.png" style="width: 50%;"></p>',
    });
    const styledHtml = styled.getHTML();
    expect(styledHtml).toContain('width: 50%');
    expect(styledHtml).toContain('max-width: 100%');
    // max-width 只出现一次，不重复追加
    expect(styledHtml.match(/max-width/g)?.length).toBe(1);
    styled.destroy();

    const already = new Editor({
      extensions,
      content: '<p><img src="https://example.com/c.png" style="max-width: 80%;"></p>',
    });
    const alreadyHtml = already.getHTML();
    expect(alreadyHtml).toContain('max-width: 80%');
    expect(alreadyHtml.match(/max-width/g)?.length).toBe(1);
    already.destroy();
  });

  it('图片渲染类名：新插入使用 edp-editor__image，存量旧类保留（双类兼容）', () => {
    const extensions = createEditorExtensions();

    // 新插入（无 class attr）：仅输出新类
    const fresh = new Editor({
      extensions,
      content: '<p><img src="https://example.com/a.png"></p>',
    });
    const freshHtml = fresh.getHTML();
    expect(freshHtml).toContain('edp-editor__image');
    expect(freshHtml).not.toContain('vben-tiptap__image');
    fresh.destroy();

    // 存量内容带旧类：PreserveAttributes 保留旧类 + 渲染注入新类，两者并存
    const legacy = new Editor({
      extensions,
      content: '<p><img class="vben-tiptap__image" src="https://example.com/b.png"></p>',
    });
    const legacyHtml = legacy.getHTML();
    expect(legacyHtml).toContain('edp-editor__image');
    expect(legacyHtml).toContain('vben-tiptap__image');
    legacy.destroy();
  });

  it('输出样式定义可复制：多栏双轨（旧版兼容 + 新版宽屏适配）/图片兜底，不含编辑器内部类', () => {
    expect(typeof contentStylesCss).toBe('string');
    expect(contentStylesCss).toContain('.cms-columns');
    expect(contentStylesCss).toContain('.cms-column');
    // 旧版内容兼容（--stack/--keep + 内联 flex）
    expect(contentStylesCss).toContain('.cms-columns--stack');
    expect(contentStylesCss).toContain('.cms-columns--keep');
    expect(contentStylesCss).toContain('@media (max-width: 768px)');
    // 新版内容（--row1/--row2）：宽屏适配为 N 栏一排，间隙经 var 透传
    expect(contentStylesCss).toContain('.cms-columns--row1');
    expect(contentStylesCss).toContain('.cms-columns--row2');
    expect(contentStylesCss).toContain('@media (min-width: 769px)');
    expect(contentStylesCss).toContain('--cms-columns-gap');
    expect(contentStylesCss).toContain('float: none !important');
    expect(contentStylesCss).toContain('img.edp-editor__image');
    // 存量内容旧类保留兼容
    expect(contentStylesCss).toContain('img.vben-tiptap__image');
    expect(contentStylesCss).toContain('a.edp-mention');
    // 编辑器内部类（选中高亮/拖拽手柄/提示）不得混入对外样式
    expect(contentStylesCss).not.toContain('app-editor-columns--selected');
    expect(contentStylesCss).not.toContain('app-editor-image--selected');
    expect(contentStylesCss).not.toContain('cms-columns-resize-tooltip');
  });

  it('样式依赖检测：仅多栏布局触发提示，纯文本/纯图片不打扰', () => {
    expect(usesCustomStyleBlocks('<p>纯文本</p>')).toBe(false);
    expect(usesCustomStyleBlocks('<p><img src="https://example.com/a.png"></p>')).toBe(false);
    expect(usesCustomStyleBlocks('')).toBe(false);
    expect(usesCustomStyleBlocks(null)).toBe(false);
    expect(
      usesCustomStyleBlocks('<div class="cms-columns cms-columns--stack"><div class="cms-column"><p>11</p></div></div>'),
    ).toBe(true);
    expect(
      usesCustomStyleBlocks("<div class='cms-column'><p>22</p></div>"),
    ).toBe(true);
  });
});

describe('app-editor P0/P1 新增能力验证', () => {
  function makeEditor(content, options = {}) {
    return new Editor({
      extensions: createEditorExtensions(options),
      content,
    });
  }

  it('注册表：新扩展齐备，无重复 id 污染', () => {
    const editor = makeEditor('<p>hi</p>');
    const names = editor.extensionManager.extensions.map((e) => e.name);
    for (const n of [
      'taskList',
      'taskItem',
      'details',
      'detailsSummary',
      'detailsContent',
      'textIndent',
      'appEditorFind',
      'appEditorSlash',
      'mention',
      'emoji',
      'characterCount',
      'fileHandler',
    ]) {
      expect(names).toContain(n);
    }
    // trailingNode 仅 StarterKit 内置一份（不重复注册）
    expect(names.filter((n) => n === 'trailingNode')).toHaveLength(1);
    // 大纲按位置跳转，不引入 id 属性污染输出
    expect(names).not.toContain('uniqueID');
    expect(names).not.toContain('tableOfContents');
    editor.destroy();
  });

  it('文末兜底：多栏结尾自动补空段落', () => {
    const editor = makeEditor('<p>前言</p>');
    editor.commands.insertColumns({ cols: 2, layout: '1:1', gap: '16px' });
    expect(editor.state.doc.lastChild?.type.name).toBe('paragraph');
    editor.destroy();
  });

  it('字数统计 storage 可用', () => {
    const editor = makeEditor('<p>标题一</p><p>正文</p>');
    expect(editor.storage.characterCount.characters()).toBeGreaterThan(0);
    editor.destroy();
  });

  it('待办清单切换与输出', () => {
    const editor = makeEditor('<p>买牛奶</p>');
    expect(editor.commands.toggleTaskList()).toBe(true);
    const html = editor.getHTML();
    expect(html).toContain('taskList');
    editor.destroy();
  });

  it('折叠块插入与原生输出', () => {
    const editor = makeEditor('<p>问答内容</p>');
    expect(editor.commands.setDetails()).toBe(true);
    const html = editor.getHTML();
    expect(html).toContain('<details>');
    expect(html).toContain('<summary>');
    editor.destroy();
  });

  it('Emoji 数据集可用（短码可解析）', () => {
    expect(Array.isArray(emojis) && emojis.length).toBeGreaterThan(0);
    const item = shortcodeToEmoji('smile', emojis);
    expect(item?.emoji).toBeTruthy();
  });

  it('Mention 内链：输出原生 a.edp-mention，回解析正常', () => {
    const editor = makeEditor('<p>看看这个</p>', {
      getFetchMentions: () => async () => [{ url: 'https://site/p/1', label: '产品一' }],
    });
    editor.commands.insertContent({
      type: 'mention',
      attrs: { id: 'https://site/p/1', label: '产品一' },
    });
    const html = editor.getHTML();
    expect(html).toContain('class="edp-mention"');
    expect(html).toContain('https://site/p/1');
    expect(html).toContain('产品一');
    expect(html).not.toContain('data-');

    const editor2 = makeEditor(html);
    let foundMention = false;
    editor2.state.doc.descendants((node) => {
      if (node.type.name === 'mention') foundMention = true;
      return true;
    });
    expect(foundMention).toBe(true);
    editor.destroy();
    editor2.destroy();
  });

  it('首行缩进：设置/切换/取消均走内联 style', () => {
    const editor = makeEditor('<p>需要缩进的段落</p>');
    expect(editor.commands.setTextIndent()).toBe(true);
    expect(editor.getHTML()).toContain('text-indent');
    // 再切一次即取消
    expect(editor.commands.toggleTextIndent()).toBe(true);
    expect(editor.getHTML()).not.toContain('text-indent');
    // 显式取消（无缩进时返回 false，不报错）
    expect(editor.commands.unsetTextIndent()).toBe(false);
    editor.destroy();
  });

  it('查找：collectMatches 命中位置正确', () => {
    const editor = makeEditor('<p>苹果香蕉苹果</p><p>菠萝</p>');
    const matches = collectMatches(editor.state.doc, '苹果');
    expect(matches).toHaveLength(2);
    expect(matches[0].to - matches[0].from).toBe(2);
    expect(collectMatches(editor.state.doc, '')).toHaveLength(0);
    editor.destroy();
  });

  it('查找替换往返：替换后命中更新', () => {
    const editor = makeEditor('<p>猫和猫</p>');
    const before = collectMatches(editor.state.doc, '猫');
    expect(before).toHaveLength(2);
    const tr = editor.state.tr;
    [...before]
      .sort((a, b) => b.from - a.from)
      .forEach((m) => {
        tr.replaceWith(m.from, m.to, editor.schema.text('狗'));
      });
    editor.view.dispatch(tr);
    expect(collectMatches(editor.state.doc, '猫')).toHaveLength(0);
    expect(collectMatches(editor.state.doc, '狗')).toHaveLength(2);
    editor.destroy();
  });

  it('Slash 命令表完整且 h2 可执行', () => {
    const ids = SLASH_COMMANDS.map((c) => c.id);
    for (const id of [
      'paragraph', 'h1', 'h2', 'bulletList', 'taskList', 'blockquote',
      'codeBlock', 'details', 'image', 'video', 'table', 'columns2', 'hr',
    ]) {
      expect(ids).toContain(id);
    }
    const editor = makeEditor('<p></p>');
    const h2 = SLASH_COMMANDS.find((c) => c.id === 'h2');
    const { from } = editor.state.selection;
    h2.run({ editor, range: { from, to: from } });
    expect(editor.getHTML()).toContain('<h2>');
    editor.destroy();
  });

  it('大纲收集：层级/文本/位置齐备', () => {
    const editor = makeEditor('<h1>一</h1><p>x</p><h3>三</h3>');
    const items = collectHeadingOutline(editor.state.doc);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ level: 1, text: '一' });
    expect(items[1]).toMatchObject({ level: 3, text: '三' });
    expect(items[1].pos).toBeGreaterThan(items[0].pos);
    editor.destroy();
  });

  it('标题输出纯净：无 data-id / data-toc-id 冗余', () => {
    const editor = makeEditor('<h1>干净标题</h1>');
    const html = editor.getHTML();
    expect(html).toContain('干净标题');
    expect(html).not.toContain('data-id');
    expect(html).not.toContain('data-toc-id');
    editor.destroy();
  });

  it('校对定位：findTextRange 找到片段位置', () => {
    const editor = makeEditor('<p>这是一个测试句子</p>');
    const range = findTextRange(editor.state.doc, '测试');
    expect(range).not.toBeNull();
    expect(range.to - range.from).toBe(2);
    expect(findTextRange(editor.state.doc, '不存在')).toBeNull();
    editor.destroy();
  });
});

describe('app-editor 表格增强验证', () => {
  const TABLE_HTML = [
    '<table><tbody>',
    '<tr><th><p>姓名</p></th><th><p>年龄</p></th></tr>',
    '<tr><td><p>张三</p></td><td><p>20</p></td></tr>',
    '<tr><td><p>李四</p></td><td><p>30</p></td></tr>',
    '</tbody></table>',
  ].join('');

  function makeTableEditor(html = TABLE_HTML) {
    return new Editor({
      extensions: createEditorExtensions(),
      content: html,
    });
  }

  function setCursorInCell(editor, cellText) {
    let target = null;
    editor.state.doc.descendants((node, pos) => {
      if (target) return false;
      if ((node.type.name === 'tableCell' || node.type.name === 'tableHeader') && node.textContent.includes(cellText)) {
        target = pos + 2;
      }
      return true;
    });
    expect(target).not.toBeNull();
    editor.commands.setTextSelection(target);
  }

  it('复制行：内容完整复制，行数+1', () => {
    const editor = makeTableEditor();
    setCursorInCell(editor, '张三');
    expect(editor.commands.duplicateRow()).toBe(true);
    const html = editor.getHTML();
    expect(html.match(/张三/g)?.length).toBe(2);
    let rows = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'tableRow') rows += 1;
      return true;
    });
    expect(rows).toBe(4);
    editor.destroy();
  });

  it('复制列：内容完整复制，列数+1', () => {
    const editor = makeTableEditor();
    setCursorInCell(editor, '张三');
    expect(editor.commands.duplicateColumn()).toBe(true);
    const html = editor.getHTML();
    expect(html.match(/张三/g)?.length).toBe(2);
    expect(html.match(/李四/g)?.length).toBe(2);
    editor.destroy();
  });

  it('合并单元格的列拒绝复制（防非法表）', () => {
    const editor = makeTableEditor(
      '<table><tbody><tr><td colspan="2"><p>通栏</p></td></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>',
    );
    setCursorInCell(editor, '通栏');
    expect(editor.commands.duplicateColumn()).toBe(false);
    setCursorInCell(editor, 'A');
    expect(editor.commands.duplicateRow()).toBe(true);
    editor.destroy();
  });

  it('单元格底色：设置与清除均走内联 style', () => {
    const editor = makeTableEditor();
    setCursorInCell(editor, '张三');
    expect(editor.commands.setCellBackground('#fef08a')).toBe(true);
    let html = editor.getHTML();
    expect(html).toContain('background-color: #fef08a');
    expect(editor.commands.setCellBackground(null)).toBe(true);
    html = editor.getHTML();
    expect(html).not.toContain('background-color');
    editor.destroy();
  });

  it('多格拖选统一设底色：矩形内全部格子生效', () => {
    const editor = makeTableEditor();
    // 选中“张三”所在格到“30”所在格的矩形（2行×2列，共4格）
    const posOf = (text) => {
      let target = null;
      editor.state.doc.descendants((node, pos) => {
        if (target !== null) return false;
        if ((node.type.name === 'tableCell' || node.type.name === 'tableHeader') && node.textContent.includes(text)) {
          target = pos;
        }
        return true;
      });
      return target;
    };
    const anchorCell = posOf('张三');
    const headCell = posOf('30');
    expect(anchorCell).not.toBeNull();
    expect(headCell).not.toBeNull();
    expect(editor.commands.setCellSelection({ anchorCell, headCell })).toBe(true);
    expect(editor.commands.setCellBackground('#bae6fd')).toBe(true);
    const html = editor.getHTML();
    // 4 格全部带底色
    expect(html.match(/background-color: #bae6fd/g)?.length).toBe(4);
    editor.destroy();
  });

  it('表格维度统计与查找定位', async () => {
    const { getTableDimensions } = await import('../app-editor/table-tools.js');
    const { findTableNodeAndPos } = await import('../app-editor/dom-lookup.js');
    const editor = makeTableEditor();
    let tableNode = null;
    editor.state.doc.descendants((node) => {
      if (!tableNode && node.type.name === 'table') tableNode = node;
      return true;
    });
    expect(getTableDimensions(tableNode)).toEqual({ rows: 3, cols: 2 });

    const tableEl = editor.view.dom.querySelector('table');
    expect(tableEl).not.toBeNull();
    const found = findTableNodeAndPos(editor.view, tableEl);
    expect(found).not.toBeNull();
    expect(found.node.type.name).toBe('table');
    editor.destroy();
  });

  it('表格高亮走 Decorations：dispatch 后带类，输出不受影响', async () => {
    const { dispatchTableSelected, dispatchSelectionCleared, appEditorSelectionKey } = await import(
      '../app-editor/selection-plugin.js'
    );
    const editor = makeTableEditor();
    let tablePos = null;
    editor.state.doc.descendants((node, pos) => {
      if (tablePos === null && node.type.name === 'table') tablePos = pos;
      return true;
    });
    dispatchTableSelected(editor, tablePos);
    // 注意：TableKit 的 table 包在 div.tableWrapper 内，高亮类落在 wrapper 上
    expect(
      editor.view.dom.querySelector('.tableWrapper.app-editor-table--selected'),
    ).not.toBeNull();
    expect(editor.getHTML()).not.toContain('app-editor-table--selected');
    expect(editor.getHTML()).not.toContain('tableWrapper');
    expect(appEditorSelectionKey.getState(editor.state)?.tablePos).toBe(tablePos);
    dispatchSelectionCleared(editor, 'table');
    expect(editor.view.dom.querySelector('.tableWrapper.app-editor-table--selected')).toBeNull();
    editor.destroy();
  });
});

describe('app-editor 元素检查器验证', () => {
  const docHtml = [
    '<h1>大标题</h1>',
    '<p>第一段</p>',
    '<p>第二段</p>',
    '<ul><li><p>列表项一</p></li><li><p>列表项二</p></li></ul>',
  ].join('');

  function makeInspectorEditor(html = docHtml) {
    return new Editor({ extensions: createEditorExtensions(), content: html });
  }

  it('样式合并：增删改键精确，不动其他声明', async () => {
    const { mergeStyleDecls, parsePx, MANAGED_STYLE_KEYS } = await import(
      '../app-editor/element-inspector.js'
    );
    expect(mergeStyleDecls('color: red;', [['margin-top', '8px']])).toContain('margin-top: 8px');
    expect(mergeStyleDecls('color: red;', [['margin-top', '8px']])).toContain('color: red');
    expect(mergeStyleDecls('margin-top: 8px; color: red;', [['margin-top', null]])).not.toContain(
      'margin-top',
    );
    expect(mergeStyleDecls('', [], MANAGED_STYLE_KEYS)).toBeNull();
    expect(parsePx('16px')).toBe(16);
    expect(parsePx('auto')).toBeNull();
    expect(parsePx('')).toBeNull();
  });

  it('目标解析：段落/标题/单元格各归其位', async () => {
    const { resolveInspectorTarget, friendlyNodeName, ancestorChain } = await import(
      '../app-editor/element-inspector.js'
    );
    const { findImageNodeAndPos, findVideoNodeAndPos, findColumnsNodeAndPos, findTableNodeAndPos } =
      await import('../app-editor/dom-lookup.js');
    const finders = { findImageNodeAndPos, findVideoNodeAndPos, findColumnsNodeAndPos, findTableNodeAndPos };
    const editor = makeInspectorEditor(
      '<p>段落</p><table><tbody><tr><td><p>格子</p></td></tr></tbody></table>',
    );
    const view = editor.view;

    const p = view.dom.querySelector('p');
    const hitP = resolveInspectorTarget(view, p, finders);
    expect(hitP?.node.type.name).toBe('paragraph');

    const td = view.dom.querySelector('td');
    const hitTd = resolveInspectorTarget(view, td, finders);
    expect(hitTd?.node.type.name).toBe('tableCell');

    const h1Editor = makeInspectorEditor('<h1>题</h1>');
    const h1 = h1Editor.view.dom.querySelector('h1');
    const hitH = resolveInspectorTarget(h1Editor.view, h1, finders);
    expect(friendlyNodeName(hitH.node)).toBe('标题 H1');

    // 面包屑：格子段落 -> 单元格 -> 行 -> 表格（由近及远）
    const innerP = view.dom.querySelector('td p');
    const hitInner = resolveInspectorTarget(view, innerP, finders);
    expect(hitInner?.node.type.name).toBe('paragraph');
    const chain = ancestorChain(view.state.doc, hitInner.pos).map((c) => c.label);
    expect(chain[0]).toBe('段落');
    expect(chain).toContain('单元格');
    expect(chain.some((l) => l.startsWith('表格'))).toBe(true);

    editor.destroy();
    h1Editor.destroy();
  });

  it('块操作：上下移/复制/删除/插行，非法拒绝', async () => {
    const { moveElement, duplicateElement, deleteElement, insertParagraphBeside } = await import(
      '../app-editor/element-inspector.js'
    );
    const editor = makeInspectorEditor();
    const posOf = (text) => {
      let target = null;
      editor.state.doc.descendants((node, pos) => {
        if (target !== null) return false;
        if (node.isTextblock && node.textContent.includes(text)) target = pos;
        return true;
      });
      return target;
    };

    // 下移第一段
    const p1 = posOf('第一段');
    const moved = moveElement(editor, p1, 1);
    expect(moved.ok).toBe(true);
    expect(editor.getHTML().indexOf('第二段')).toBeLessThan(editor.getHTML().indexOf('第一段'));

    // 复制标题
    const h = posOf('大标题');
    const dup = duplicateElement(editor, h);
    expect(dup.ok).toBe(true);
    expect(editor.getHTML().match(/大标题/g)?.length).toBe(2);

    // 删除列表项二（同级还有项，合法；注意定位到列表项节点本身，
    // 若删的是其内部段落会因掏空容器被拒绝）
    let li2 = null;
    editor.state.doc.descendants((node, pos) => {
      if (li2 !== null) return false;
      if (node.type.name === 'listItem' && node.textContent.includes('列表项二')) li2 = pos;
      return true;
    });
    expect(deleteElement(editor, li2).ok).toBe(true);
    expect(editor.getHTML()).not.toContain('列表项二');

    // 连续删到只剩一个子节点时拒绝（保 schema 合法）
    let li1 = null;
    editor.state.doc.descendants((node, pos) => {
      if (li1 !== null) return false;
      if (node.type.name === 'listItem') li1 = pos;
      return true;
    });
    expect(deleteElement(editor, li1).ok).toBe(false);

    // 段落旁插空行合法；在列表项旁直接插段落非法（ul 子节点只能是 li）
    expect(insertParagraphBeside(editor, posOf('第二段'), 1).ok).toBe(true);
    let liPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (liPos === null && node.type.name === 'listItem') liPos = pos;
      return true;
    });
    expect(insertParagraphBeside(editor, liPos, 1).ok).toBe(false);

    editor.destroy();
  });
});

describe('app-editor 检查器显示类型与 state 解析', () => {
  it('resolveElementFromSelection：文本光标/原子节点/hr 边界', async () => {
    const { resolveElementFromSelection } = await import('../app-editor/element-inspector.js');
    const { NodeSelection } = await import('@tiptap/pm/state');
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: '<p>段落</p><hr><p><img src="https://example.com/x.png"></p>',
    });

    // 文本光标 -> 段落
    editor.commands.setTextSelection(2);
    expect(resolveElementFromSelection(editor.state)?.node.type.name).toBe('paragraph');

    // 图片 NodeSelection -> 图片
    let imgPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (imgPos === null && node.type.name === 'image') imgPos = pos;
      return true;
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imgPos)),
    );
    expect(resolveElementFromSelection(editor.state)?.node.type.name).toBe('image');

    // hr NodeSelection -> 分割线
    let hrPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (hrPos === null && node.type.name === 'horizontalRule') hrPos = pos;
      return true;
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, hrPos)),
    );
    expect(resolveElementFromSelection(editor.state)?.node.type.name).toBe('horizontalRule');

    editor.destroy();
  });

  it('display 切换输出内联且受管（重置可清）', async () => {
    const { MANAGED_STYLE_KEYS } = await import('../app-editor/element-inspector.js');
    expect(MANAGED_STYLE_KEYS).toContain('display');
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: '<p>并排段</p>',
    });
    let pPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (pPos === null && node.type.name === 'paragraph') pPos = pos;
      return true;
    });
    const node = editor.state.doc.nodeAt(pPos);
    const tr = editor.state.tr.setNodeMarkup(pPos, null, {
      ...node.attrs,
      style: 'display: inline-block;',
    });
    editor.view.dispatch(tr);
    expect(editor.getHTML()).toContain('display: inline-block');
    editor.destroy();
  });
});

describe('app-editor 装饰上浮验证', () => {
  function makeFloatEditor(html) {
    return new Editor({ extensions: createEditorExtensions(), content: html });
  }

  async function resolveAtText(editor, text) {
    const { resolveInspectorTarget, floatToStyledAncestor } = await import(
      '../app-editor/element-inspector.js'
    );
    const { findImageNodeAndPos, findVideoNodeAndPos, findColumnsNodeAndPos, findTableNodeAndPos } =
      await import('../app-editor/dom-lookup.js');
    void floatToStyledAncestor;
    let el = null;
    editor.view.dom.querySelectorAll('p').forEach((p) => {
      if (p.textContent.includes(text)) el = p;
    });
    expect(el).not.toBeNull();
    return resolveInspectorTarget(editor.view, el, {
      findImageNodeAndPos,
      findVideoNodeAndPos,
      findColumnsNodeAndPos,
      findTableNodeAndPos,
    });
  }

  it('无装饰祖先：留守段落本身', async () => {
    const editor = makeFloatEditor('<section><div><p>纯文本</p></div></section>');
    const found = await resolveAtText(editor, '纯文本');
    expect(found?.node.type.name).toBe('paragraph');
    editor.destroy();
  });

  it('最近装饰祖先：上浮到带 margin 的 section', async () => {
    const editor = makeFloatEditor(
      '<section style="margin: 60px 0px 0px;"><div><p>横幅文字</p></div></section>',
    );
    const found = await resolveAtText(editor, '横幅文字');
    expect(found?.node.type.name).toBe('section');
    editor.destroy();
  });

  it('flex 容器透明：display 不触发上浮（flex 场景谨慎）', async () => {
    const editor = makeFloatEditor(
      '<div style="display: flex;"><div><p>弹性文字</p></div></div>',
    );
    const found = await resolveAtText(editor, '弹性文字');
    expect(found?.node.type.name).toBe('paragraph');
    editor.destroy();
  });

  it('text-align 容器透明：居中 section 不吞内部点击', async () => {
    const editor = makeFloatEditor(
      '<section style="text-align: center;"><p>居中文字</p></section>',
    );
    const found = await resolveAtText(editor, '居中文字');
    expect(found?.node.type.name).toBe('paragraph');
    editor.destroy();
  });

  it('叶子文本不锚定：段落自带边距仍上浮到装饰 section（段落经面包屑回切）', async () => {
    const editor = makeFloatEditor(
      '<section style="margin: 60px;"><p style="margin-top: 8px;">自带边距</p></section>',
    );
    const found = await resolveAtText(editor, '自带边距');
    expect(found?.node.type.name).toBe('section');
    editor.destroy();
  });

  it('最近者胜：单元格背景优先于外层 section', async () => {
    const editor = makeFloatEditor(
      '<section style="margin: 40px;"><table><tbody><tr><td style="background-color: #fef08a;"><p>格文</p></td></tr></tbody></table></section>',
    );
    const found = await resolveAtText(editor, '格文');
    expect(found?.node.type.name).toBe('tableCell');
    editor.destroy();
  });

  it('上报结构：section>多栏>列>带边距段落，点击正文选中 section', async () => {
    const { resolveInspectorTarget } = await import('../app-editor/element-inspector.js');
    const { findImageNodeAndPos, findVideoNodeAndPos, findColumnsNodeAndPos, findTableNodeAndPos } =
      await import('../app-editor/dom-lookup.js');
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: [
        '<section style="margin: 158px 0px 0px;">',
        '<div class="cms-columns cms-columns--stack" style="display: flex; gap: 40px; margin: 16px 0; box-sizing: border-box; width: 100%;">',
        '<div class="cms-column" style="flex: 1 1 0%; min-width: 0; box-sizing: border-box;">',
        '<p style="text-align: center; margin: 14px 0px 0px;">成品厚度</p>',
        '</div>',
        '<div class="cms-column" style="flex: 1 1 0%; min-width: 0; box-sizing: border-box;">',
        '<p style="text-align: center; margin: 4px 0px 0px;">产量可达</p>',
        '</div>',
        '</div>',
        '</section>',
      ].join(''),
    });
    const view = editor.view;
    let target = null;
    view.dom.querySelectorAll('p').forEach((el) => {
      if (el.textContent.includes('成品厚度')) target = el;
    });
    const found = resolveInspectorTarget(view, target, {
      findImageNodeAndPos, findVideoNodeAndPos, findColumnsNodeAndPos, findTableNodeAndPos,
    });
    // 段落自带 margin 也不锚定；columns 容器结构透明穿过；落到 section
    expect(found?.node.type.name).toBe('section');
    editor.destroy();
  });

  it('结构容器透明：columns 自带 margin 也不拦截上浮', async () => {
    const { resolveInspectorTarget } = await import('../app-editor/element-inspector.js');
    const { findImageNodeAndPos, findVideoNodeAndPos, findColumnsNodeAndPos, findTableNodeAndPos } =
      await import('../app-editor/dom-lookup.js');
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: [
        '<section style="margin: 60px;"><div class="cms-columns" style="display: flex; margin: 16px 0;">',
        '<div class="cms-column" style="flex: 1;">',
        '<p>栏内文字</p>',
        '</div></div></section>',
      ].join(''),
    });
    const view = editor.view;
    let target = null;
    view.dom.querySelectorAll('p').forEach((el) => {
      if (el.textContent.includes('栏内文字')) target = el;
    });
    const found = resolveInspectorTarget(view, target, {
      findImageNodeAndPos, findVideoNodeAndPos, findColumnsNodeAndPos, findTableNodeAndPos,
    });
    // 穿过 column（flex 透明）与 columns（结构透明），落到 section
    expect(found?.node.type.name).toBe('section');
    editor.destroy();
  });

  it('面包屑含上浮来源：可点回原段落', async () => {
    const { buildCrumbChain } = await import('../app-editor/element-inspector.js');
    const editor = makeFloatEditor(
      '<section style="margin: 40px;"><p>幂等</p></section>',
    );
    let pPos = null;
    let pNode = null;
    editor.state.doc.descendants((node, pos) => {
      if (pPos === null && node.type.name === 'paragraph') {
        pPos = pos;
        pNode = node;
      }
      return true;
    });
    const { floatToStyledAncestor } = await import('../app-editor/element-inspector.js');
    const floated = floatToStyledAncestor(editor.state.doc, pPos, pNode);
    expect(floated.node.type.name).toBe('section');
    const chain = buildCrumbChain(editor.state.doc, floated.pos, floated.node, {
      pos: pPos,
      node: pNode,
    });
    expect(chain[0].label).toBe('段落');
    expect(chain[1].label).toBe('版块');
    editor.destroy();
  });

  it('floatToStyledAncestor 幂等', async () => {
    const { floatToStyledAncestor } = await import('../app-editor/element-inspector.js');
    const editor = makeFloatEditor(
      '<section style="margin: 40px;"><p>幂等</p></section>',
    );
    let pPos = null;
    let pNode = null;
    editor.state.doc.descendants((node, pos) => {
      if (pPos === null && node.type.name === 'paragraph') {
        pPos = pos;
        pNode = node;
      }
      return true;
    });
    const once = floatToStyledAncestor(editor.state.doc, pPos, pNode);
    expect(once.node.type.name).toBe('section');
    const twice = floatToStyledAncestor(editor.state.doc, once.pos, once.node);
    expect(twice.pos).toBe(once.pos);
    expect(twice.node).toBe(once.node);
    editor.destroy();
  });
});

describe('app-editor 特效与父容器选中验证', () => {
  function makeFxEditor(html) {
    return new Editor({ extensions: createEditorExtensions(), content: html });
  }

  async function fxDeps() {
    const { resolveInspectorTarget, hasManagedStyles, hasFloatTriggerStyles } = await import(
      '../app-editor/element-inspector.js'
    );
    const { findImageNodeAndPos, findVideoNodeAndPos, findColumnsNodeAndPos, findTableNodeAndPos } =
      await import('../app-editor/dom-lookup.js');
    return {
      resolveInspectorTarget,
      hasManagedStyles,
      hasFloatTriggerStyles,
      finders: { findImageNodeAndPos, findVideoNodeAndPos, findColumnsNodeAndPos, findTableNodeAndPos },
    };
  }

  it('特效键识别：shadow/opacity/filter/transform/overflow-hidden 触发，visible/static/none 不触发', async () => {
    const { hasManagedStyles, hasFloatTriggerStyles } = await fxDeps();
    expect(hasFloatTriggerStyles('box-shadow: 0 2px 8px rgba(0,0,0,.15);')).toBe(true);
    expect(hasFloatTriggerStyles('opacity: 0.9;')).toBe(true);
    expect(hasFloatTriggerStyles('filter: grayscale(1);')).toBe(true);
    expect(hasFloatTriggerStyles('transform: rotate(2deg);')).toBe(true);
    expect(hasFloatTriggerStyles('overflow: hidden;')).toBe(true);
    expect(hasFloatTriggerStyles('position: relative;')).toBe(true);
    expect(hasFloatTriggerStyles('overflow: visible;')).toBe(false);
    expect(hasFloatTriggerStyles('position: static;')).toBe(false);
    expect(hasFloatTriggerStyles('filter: none;')).toBe(false);
    expect(hasManagedStyles('overflow: hidden;')).toBe(true);
    expect(hasManagedStyles('position: static;')).toBe(false);
  });

  it('wrapper 留白点击：不再误判为内部图片，选中 wrapper 本体', async () => {
    const { resolveInspectorTarget, finders } = await fxDeps();
    const editor = makeFxEditor(
      '<section style="box-shadow: 0 2px 8px rgba(0,0,0,.15);"><img src="https://example.com/w.png"></section>',
    );
    const view = editor.view;
    const sectionEl = view.dom.querySelector('section');
    expect(sectionEl).not.toBeNull();
    const found = resolveInspectorTarget(view, sectionEl, finders);
    expect(found?.node.type.name).toBe('section');
    // 且自动上浮稳定（section 自带阴影即留守）
    editor.destroy();
  });

  it('阴影提交走内联且可清除', () => {
    const editor = makeFxEditor('<p>阴影段</p>');
    let pPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (pPos === null && node.type.name === 'paragraph') pPos = pos;
      return true;
    });
    const node = editor.state.doc.nodeAt(pPos);
    const tr = editor.state.tr.setNodeMarkup(pPos, null, {
      ...node.attrs,
      style: 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);',
    });
    editor.view.dispatch(tr);
    expect(editor.getHTML()).toContain('box-shadow:');
    editor.destroy();
  });
});

describe('app-editor 盒模型 overlay 计算', () => {
  it('三层矩形按边距展开、无样式归零、空矩形返回 null', async () => {
    const { computeBoxOverlay } = await import('../app-editor/element-inspector.js');
    const rect = { left: 100, top: 200, width: 300, height: 60 };

    // 无样式：三层重合
    const plain = computeBoxOverlay(rect, '');
    expect(plain.margin).toEqual({ left: 100, top: 200, width: 300, height: 60 });
    expect(plain.padding).toEqual({ left: 100, top: 200, width: 300, height: 60 });
    expect(plain.content).toEqual({ left: 100, top: 200, width: 300, height: 60 });

    // 边距展开（含速写）
    const styled = computeBoxOverlay(rect, 'margin: 10px 20px; padding-top: 5px;');
    expect(styled.margin).toEqual({ left: 80, top: 190, width: 340, height: 80 });
    expect(styled.content).toEqual({ left: 100, top: 205, width: 300, height: 55 });

    // 非 px 单位按 0 计，不误导
    const em = computeBoxOverlay(rect, 'margin-top: 2em; padding-left: 10%;');
    expect(em.margin).toEqual({ left: 100, top: 200, width: 300, height: 60 });
    expect(em.content).toEqual({ left: 100, top: 200, width: 300, height: 60 });

    // 空矩形返回 null（调用方隐藏）
    expect(computeBoxOverlay({ left: 0, top: 0, width: 0, height: 0 }, '')).toBeNull();
    expect(computeBoxOverlay(null, '')).toBeNull();
  });
});
