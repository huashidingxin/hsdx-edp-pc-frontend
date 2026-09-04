import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * 清理渲染产物中的「内容控件占位文本 = 字段 label」隐患。
 *
 * 模板设计时字段以内容控件（w:sdt）插入，OnlyOffice/Word 会把占位文本存成
 * word/glossary 图库 docPart（正文即字段 label），控件通过
 * `<w:placeholder><w:docPart w:val="uuid"/></w:placeholder>` 引用。
 * 值渲染为空时，阅读器会对空控件回显该占位文本 → 文档里出现 label。
 *
 * 这里在渲染后把 glossary 图库、w:placeholder 标记及相关引用全部移除，
 * 空值控件不再回显 label（w:alias 保留，点击控件仍可查看字段名以核对映射）。
 */
export function stripPlaceholderLabels(docxBytes: Uint8Array): Uint8Array {
  try {
    const allEntries = unzipSync(docxBytes);

    // 1) 剔除 glossary 图库（placeholder docPart 正文 = label 的来源）
    const entries = Object.fromEntries(
      Object.entries(allEntries).filter(
        ([name]) => !name.startsWith('word/glossary/'),
      ),
    );
    let changed = Object.keys(entries).length !== Object.keys(allEntries).length;

    // 2) 移除 document.xml 中的 <w:placeholder>…</w:placeholder>
    const docKey = Object.keys(entries).find(
      (name) => name === 'word/document.xml',
    );
    if (docKey) {
      const docBytes = entries[docKey];
      if (docBytes) {
        const docXml = strFromU8(docBytes);
        const cleaned = docXml.replaceAll(
          /<w:placeholder>[\s\S]*?<\/w:placeholder>|<w:placeholder\s*\/>/g,
          '',
        );
        if (cleaned !== docXml) {
          entries[docKey] = strToU8(cleaned);
          changed = true;
        }
      }
    }

    // 3) [Content_Types].xml：移除所有 glossary 相关的 Override
    const ctKey = Object.keys(entries).find(
      (name) => name === '[Content_Types].xml',
    );
    if (ctKey) {
      const ctBytes = entries[ctKey];
      if (ctBytes) {
        const ctXml = strFromU8(ctBytes);
        const cleaned = ctXml.replaceAll(
          /<Override\s+PartName="\/word\/glossary\/[^"]*"[^>]*\/>/g,
          '',
        );
        if (cleaned !== ctXml) {
          entries[ctKey] = strToU8(cleaned);
          changed = true;
        }
      }
    }

    // 4) document.xml.rels：移除 glossaryDocument 关系
    const relsKey = Object.keys(entries).find(
      (name) => name === 'word/_rels/document.xml.rels',
    );
    if (relsKey) {
      const relsBytes = entries[relsKey];
      if (relsBytes) {
        const relsXml = strFromU8(relsBytes);
        const cleaned = relsXml
          .replaceAll(
            /<Relationship\b[^>]*glossaryDocument[^>]*><\/Relationship>/g,
            '',
          )
          .replaceAll(/<Relationship\b[^>]*glossaryDocument[^>]*\/>/g, '');
        if (cleaned !== relsXml) {
          entries[relsKey] = strToU8(cleaned);
          changed = true;
        }
      }
    }

    return changed ? zipSync(entries, { level: 6 }) : docxBytes;
  } catch (error) {
    // 清理失败不阻塞渲染，原样返回
    console.warn('占位 label 清理失败，已忽略:', error);
    return docxBytes;
  }
}
