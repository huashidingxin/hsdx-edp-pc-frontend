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
