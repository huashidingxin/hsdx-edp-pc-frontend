import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from '../app-editor/extensions';
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
});
