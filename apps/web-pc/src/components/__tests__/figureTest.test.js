// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Editor, Node } from '@tiptap/core';
import { createEditorExtensions } from '../app-editor/extensions';
import { friendlyNodeName, floatToStyledAncestor } from '../app-editor/element-inspector';

describe('figure and figcaption preservation', () => {
  it('preserves figure and figcaption with classes, inline styles, and attributes', () => {
    const html = '<figure class="my-fig" style="margin: 20px; text-align: center;"><img class="edp-editor__image" referrerpolicy="no-referrer" src="https://example.com/test.png" style="max-width: 100%;"><figcaption class="my-cap" style="color: rgb(102, 102, 102); font-size: 14px;">测试图注</figcaption></figure>';
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: html,
    });

    const output = editor.getHTML();
    expect(output).toContain('<figure');
    expect(output).toContain('class="my-fig"');
    expect(output).toContain('margin: 20px');
    expect(output).toContain('text-align: center');
    expect(output).toContain('<figcaption');
    expect(output).toContain('class="my-cap"');
    expect(output).toContain('color: rgb(102, 102, 102)');
    expect(output).toContain('font-size: 14px');
    expect(output).toContain('测试图注');

    // Roundtrip verification: re-feeding the output preserves figure and figcaption identically
    const editor2 = new Editor({
      extensions: createEditorExtensions(),
      content: output,
    });
    expect(editor2.getHTML()).toBe(output);

    editor.destroy();
    editor2.destroy();
  });

  it('unwraps accidental block tags (e.g. p) inside figcaption into inline content', () => {
    const html = '<figure><img class="edp-editor__image" referrerpolicy="no-referrer" src="https://example.com/test.png" style="max-width: 100%;"><figcaption><p>内部段落文本</p></figcaption></figure>';
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: html,
    });

    const output = editor.getHTML();
    expect(output).toContain('<figure>');
    expect(output).toContain('<figcaption>内部段落文本</figcaption>');
    expect(output).not.toContain('<figcaption><p>');

    editor.destroy();
  });

  it('provides friendly names and boundary protection in element inspector', () => {
    const html = '<figure style="margin: 20px;"><img class="edp-editor__image" referrerpolicy="no-referrer" src="https://example.com/test.png"><figcaption>图注文字</figcaption></figure>';
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: html,
    });

    const doc = editor.state.doc;
    const figureNode = doc.firstChild;
    expect(figureNode.type.name).toBe('figure');
    expect(friendlyNodeName(figureNode)).toBe('配图容器');

    const figcaptionNode = figureNode.lastChild;
    expect(figcaptionNode.type.name).toBe('figcaption');
    expect(friendlyNodeName(figcaptionNode)).toBe('图注说明');

    // figcaption should not float up to figure even if figure has styles
    const figcaptionPos = 1 + figureNode.firstChild.nodeSize;
    const floated = floatToStyledAncestor(doc, figcaptionPos, figcaptionNode);
    expect(floated.node.type.name).toBe('figcaption');

    editor.destroy();
  });

  it('preserves styled span containers (e.g. badges, flex wrappers around media) as block containers', () => {
    const html = `<section style="display: flex; flex-direction: column; align-items: center; min-height: 419px; margin: 0px; padding: 36px 0px 0px; background: rgb(255, 255, 255); border-radius: 8px; box-shadow: 0px 0px 10px 2px rgba(0, 0, 0, 0.25); box-sizing: border-box;">
        <span style="display: flex; align-items: center; justify-content: center; width: 100px; height: 100px; border: 2px solid rgb(187, 0, 0); border-radius: 50%; background: rgb(255, 255, 255); box-sizing: border-box;"><span style="display: flex; align-items: center; justify-content: center; width: 91px; height: 91px; border-radius: 50%; background: rgb(187, 0, 0);"><img class="edp-editor__image" src="https://cdn-edp.hsdxchina.com/101/image/c0558ee63b729fd185683c708e5163a79dcbff1b.svg" alt="" width="57" height="52" style="display: inline-block; width: 57px; height: 52px; max-width: 100%; margin: 0px;" loading="lazy"></span></span>
        <h3 style="text-align: center; margin: 23px 0px 0px; font-size: 20px; font-size: clamp(20px, 2.5vw, 32px); font-weight: 700; color: rgb(0, 0, 0);"><strong>独立仓储</strong>
        </h3>
        <div style="width: 208px; height: 1px; margin: 42px 0px 0px; background: rgb(0, 0, 0);"></div>
        <p style="text-align: center; margin: 23px 0px 0px; max-width: 264px; font-size: 18px; font-size: clamp(18px, 1.875vw, 24px); line-height: 1.4; color: rgb(0, 0, 0);">拥有独立的仓库储放货物
        </p>
      </section>`;
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: html,
    });
    const output = editor.getHTML();

    // Verify outer circular badge container is preserved
    expect(output).toContain('border-radius: 50%');
    expect(output).toContain('width: 100px');
    expect(output).toContain('height: 100px');
    expect(output).toContain('rgb(187, 0, 0)');
    // Verify inner circular badge container is preserved
    expect(output).toContain('width: 91px');
    expect(output).toContain('height: 91px');
    // Verify image inside is preserved
    expect(output).toContain('https://cdn-edp.hsdxchina.com/101/image/c0558ee63b729fd185683c708e5163a79dcbff1b.svg');

    editor.destroy();
  });

  it('ensures regular inline text spans are still treated as text marks, not sections', () => {
    const html = '<p>正常段落中带有<span style="color: rgb(255, 0, 0); font-size: 18px;">红色彩色文字</span>和普通文字</p>';
    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: html,
    });
    const json = editor.getJSON();
    // Root doc should only have 1 paragraph node, NOT broken up by sections
    expect(json.content.length).toBe(1);
    expect(json.content[0].type).toBe('paragraph');
    const marks = json.content[0].content[1].marks;
    expect(marks.some((m) => m.type === 'textStyle')).toBe(true);

    editor.destroy();
  });
});
