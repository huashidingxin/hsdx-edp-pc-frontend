// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from '../app-editor/extensions';
import {
  findColumnsNodeAndPos,
  findImageNodeAndPos,
  findNodePosByDOM,
} from '../app-editor/dom-lookup';
import {
  cleanEmptyTopParagraphs,
  justifyAllContent,
  unifyAllLineHeight,
} from '../app-editor/doc-actions';
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

  it('CMS 多栏扩展：标准 HTML 输出、无 data-*、间隙 gap 与 768px 自适应模式验证', () => {
    const extensions = createEditorExtensions();
    expect(extensions.some((ext) => ext.name === 'columns')).toBe(true);
    expect(extensions.some((ext) => ext.name === 'column')).toBe(true);

    const editor = new Editor({
      extensions,
      content: '<p>初始内容</p>',
    });

    editor.commands.insertColumns({ cols: 2, layout: '1:2', gap: '24px', responsive: 'stack', keepContent: true });
    let html = editor.getHTML();

    expect(html).toContain('cms-columns');
    expect(html).toContain('cms-columns--stack');
    expect(html).toContain('cms-column');
    expect(html).toContain('gap: 24px');
    expect(html).not.toContain('data-');

    editor.commands.setColumnsResponsive('keep');
    html = editor.getHTML();
    expect(html).toContain('cms-columns--keep');
    expect(html).not.toContain('cms-columns--stack');

    editor.commands.setColumnsGap('8px');
    html = editor.getHTML();
    expect(html).toContain('gap: 8px');

    editor.commands.unsetColumns();
    html = editor.getHTML();
    expect(html).not.toContain('cms-columns');
    expect(html).toContain('初始内容');

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

  it('输出样式定义可复制：包含多栏/响应式/图片兜底，不含编辑器内部类', () => {
    expect(typeof contentStylesCss).toBe('string');
    expect(contentStylesCss).toContain('.cms-columns');
    expect(contentStylesCss).toContain('.cms-column');
    expect(contentStylesCss).toContain('.cms-columns--stack');
    expect(contentStylesCss).toContain('.cms-columns--keep');
    expect(contentStylesCss).toContain('@media (max-width: 768px)');
    expect(contentStylesCss).toContain('img.vben-tiptap__image');
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
