/**
 * 本地 docx 合并（docxcompose 的前端等价实现）。
 *
 * docx 本质是 zip：逐份解包 → 取 body 内容拼接到第一份 body 后 → 图片关系/媒体重命名防冲突 →
 * 重打包为单个 docx。合并 = 把多个文档拼接为一个文档（每份之间插分页符，保留各自节属性）。
 *
 * 说明：
 * - 以第一份文档为主体，其后文档仅拼接 body；样式/settings/styles/numbering 等沿用主体文档。
 * - 每份文档的图片关系统一加前缀 m{i}_ 重命名，避免 word/media 冲突。
 * - 后续文档 body 内的 headerReference/footerReference 会被移除（页眉页脚沿用主体文档），
 *   避免悬挂引用导致 Word 报修复。
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const DOCUMENT_XML = 'word/document.xml';
const RELS_XML = 'word/_rels/document.xml.rels';

/** 统计一组边框属性字符串中出现次数最多的那个（含属性串本身） */
function mostCommon(borders: string[]): string {
  if (borders.length === 0) return '';
  const counts = new Map<string, number>();
  let best = borders[0] ?? '';
  let bestCount = 0;
  for (const b of borders) {
    const n = (counts.get(b) ?? 0) + 1;
    counts.set(b, n);
    if (n > bestCount) {
      best = b;
      bestCount = n;
    }
  }
  return best;
}

/** 表级边框是否包含任一有效边框（非 none/nil/clear）。全 none 视为无表级边框 */
function hasRealTableBorders(tbXml: string): boolean {
  return /<w:(?:top|left|bottom|right|insideH|insideV)\b[^>]*w:val="(?!none|nil|clear)"/.test(
    tbXml,
  );
}

/**
 * 取表格内所有格子 tcBorders 中指定边的属性串（众数由调用方统计）。
 */
function collectCellSide(tbl: string, side: string): string[] {
  const sideRe = new RegExp(`<w:${side} ([^>]*?)\\s*/?>`);
  const out: string[] = [];
  for (const cell of tbl.matchAll(/<w:tcBorders>[\s\S]*?<\/w:tcBorders>/g)) {
    const sideVal = cell[0].match(sideRe)?.[1];
    if (sideVal) out.push(sideVal);
  }
  return out;
}

/**
 * 补齐只写了部分单元格边框（tcBorders）的文档表格。
 *
 * OnlyOffice 保存 docx 时遵循「共享边只写一次」模型：相邻单元格共享的边只在其中一个格子
 * 上声明，其余格子的 tcBorders 为空（或表级 tblBorders 被置成全 none/删除）。
 * Word/WPS/OnlyOffice 渲染时，存在但为空的 tcBorders 会覆盖表级边框、缺一条边就不画，
 * 于是出现「边框不全」。这里做两件事：
 * 1. 表级重建：表格没有有效表级边框时，从所有格子四边边框的众数推导出完整的 tblBorders
 *    （top/bottom 取各行顶部/底部、left/right 取各列两侧、insideH/insideV 取内部格的边）；
 * 2. 格子补边：对每个格子，缺失的边（空 tcBorders 也算全缺）按表级边框/众数补全，
 *    保证每个格子四条边都有显式声明。
 */
export function normalizeTableBorders(xml: string): string {
  return xml.replaceAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    if (!/<w:tcBorders>/.test(tbl)) return tbl;
    const tb = tbl.match(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/);
    const hasTableBorders = !!tb && hasRealTableBorders(tb[0]);

    const top = mostCommon(collectCellSide(tbl, 'top'));
    const bottom = mostCommon(collectCellSide(tbl, 'bottom'));
    const left = mostCommon(collectCellSide(tbl, 'left'));
    const right = mostCommon(collectCellSide(tbl, 'right'));
    if (!top && !bottom && !left && !right) return tbl;

    // 表级边框缺失/全 none，且四边众数齐全时重建
    let result = tbl;
    if (!hasTableBorders && top && bottom && left && right) {
      const insideH = mostCommon(collectCellSide(tbl, 'bottom'));
      const insideV = mostCommon(collectCellSide(tbl, 'right'));
      const borders =
        `<w:tblBorders>` +
        `<w:top ${top}/>` +
        `<w:left ${left}/>` +
        `<w:bottom ${bottom}/>` +
        `<w:right ${right}/>${insideH ? `<w:insideH ${insideH}/>` : ''}${
          insideV ? `<w:insideV ${insideV}/>` : ''
        }</w:tblBorders>`;
      result = tb
        ? tbl.replace(tb[0], borders)
        : tbl.replace('<w:tblPr>', `<w:tblPr>${borders}`);
    }

    // 格子补边：缺失的边按「该边已有声明的众数」补全；空 tcBorders 视为四边全缺。
    // 显式声明了 none/nil 的格子是故意无边框（或部分无边框），保持原样不动。
    const sideAttrs: ReadonlyArray<readonly [string, string]> = [
      ['top', top],
      ['left', left],
      ['bottom', bottom],
      ['right', right],
    ];
    return result.replaceAll(/<w:tcBorders>[\s\S]*?<\/w:tcBorders>/g, (tc) => {
      if (
        /<w:(?:top|left|bottom|right)\b[^>]*w:val="(?:none|nil|clear)"/.test(tc)
      ) {
        return tc;
      }
      let out = tc;
      for (const [side, attrs] of sideAttrs) {
        if (attrs && !new RegExp(`<w:${side} `).test(out)) {
          out = out.replace(
            '</w:tcBorders>',
            `<w:${side} ${attrs}/></w:tcBorders>`,
          );
        }
      }
      return out;
    });
  });
}

const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  tiff: 'image/tiff',
  emf: 'image/x-emf',
  wmf: 'image/x-wmf',
  svg: 'image/svg+xml',
};

type Unzipped = Record<string, Uint8Array>;

function parseBodyAndSect(xml: string): { hasSectPr: boolean; inner: string } {
  // <w:body ...>...</w:body>，取 body 内部内容（含结尾 sectPr）
  const openMatch = xml.match(/<w:body\b[^>]*>/);
  if (!openMatch) {
    throw new Error('document.xml 缺少 <w:body>');
  }
  const start = (openMatch.index ?? 0) + openMatch[0].length;
  const closeIdx = xml.lastIndexOf('</w:body>');
  if (closeIdx === -1) {
    throw new Error('document.xml 缺少 </w:body>');
  }
  return {
    inner: xml.slice(start, closeIdx),
    hasSectPr: /<\/w:sectPr>\s*$/.test(xml.slice(start, closeIdx)),
  };
}

/** 解析 rels 中的图片关系：{ rId: media 原路径(相对 word/) }。
 *  兼容两种写法：word 自产 `<Relationship .../>` 自闭合，
 *  docx-handlebars {{img}} 追加的是 `<Relationship ...></Relationship>` 显式闭合。 */
function parseImageRels(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!relsXml) return map;
  const relRe = /<Relationship\s+([^>]*)>/g;
  for (const m of relsXml.matchAll(relRe)) {
    const attrs = (m[1] ?? '').trimEnd();
    const id = attrs.match(/Id="([^"]+)"/)?.[1];
    const type = attrs.match(/Type="([^"]+)"/)?.[1];
    const target = attrs.match(/Target="([^"]+)"/)?.[1];
    if (
      id &&
      type?.includes('/image') &&
      target &&
      !target.startsWith('http')
    ) {
      map.set(id, target);
    }
  }
  return map;
}

function ensureContentTypes(ctXml: string, extensions: string[]): string {
  let out = ctXml;
  const existing = new Set(
    [...out.matchAll(/<Default\s+Extension="([^"]+)"[^>]*\/>/g)].map(
      (m) => m[1]?.toLowerCase() ?? '',
    ),
  );
  const missing = extensions.filter(
    (ext) => ext && !existing.has(ext.toLowerCase()),
  );
  for (const ext of missing) {
    const mime = EXT_MIME[ext.toLowerCase()] || 'application/octet-stream';
    out = out.replace(
      '</Types>',
      `<Default Extension="${ext}" ContentType="${mime}" /></Types>`,
    );
  }
  return out;
}

/** 对已渲染的 docx Blob 重跑一次表格边框补齐（单文档预览/下载场景） */
export async function normalizeDocxBlob(blob: Blob): Promise<Blob> {
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  if (files[DOCUMENT_XML]) {
    files[DOCUMENT_XML] = strToU8(
      normalizeTableBorders(strFromU8(files[DOCUMENT_XML])),
    );
  }
  return new Blob([zipSync(files, { level: 6 })], { type: blob.type });
}

/** 把多个渲染好的 docx Blob 合并为一个 docx Blob（每份之间加分页符） */
export async function mergeDocxBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error('无可合并的文档');
  const firstBlob = blobs[0];
  if (!firstBlob) throw new Error('无可合并的文档');
  if (blobs.length === 1) return firstBlob;

  const files: Unzipped = unzipSync(
    new Uint8Array(await firstBlob.arrayBuffer()),
  );

  let masterBodyInner = '';
  for (let i = 0; i < blobs.length; i += 1) {
    const blob = blobs[i];
    if (!blob) throw new Error(`第 ${i + 1} 份文档为空`);
    const unzipped = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const xmlBytes = unzipped[DOCUMENT_XML];
    if (!xmlBytes) {
      throw new Error(`第 ${i + 1} 份文档缺少 word/document.xml`);
    }
    const xml = strFromU8(xmlBytes);
    const { inner } = parseBodyAndSect(xml);

    if (i === 0) {
      masterBodyInner = inner;
      // 主文档附加内容时会用到其 rels/文档 xml，存放引用
      continue;
    }

    // 处理第 i 份文档的图片：关系重命名 + media 文件重前缀
    let docBody = inner;
    const relsXml = strFromU8(unzipped[RELS_XML] || strToU8(''));
    const imageRels = parseImageRels(relsXml);
    const extensions: string[] = [];
    let relsAdditions = '';
    const seenMedia = new Set<string>();

    for (const [oldId, target] of imageRels) {
      const newId = `m${i}x${oldId}`;
      // 媒体文件原始路径相对 word/（如 media/xxx.png）
      const base = target.split('/').pop() ?? 'file';
      const ext = (base.split('.').pop() ?? '').toLowerCase();
      const newMediaPath = `word/media/m${i}_${base}`;
      if (seenMedia.has(newMediaPath)) continue;
      seenMedia.add(newMediaPath);

      const oldPath = target.startsWith('/')
        ? target.slice(1).replace(/^word\//, 'word/')
        : `word/${target}`;
      const bytes = unzipped[oldPath];
      if (bytes) {
        files[newMediaPath] = bytes;
        extensions.push(ext);
        relsAdditions += `<Relationship Id="${newId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/m${i}_${base}"></Relationship>`;
      }
      // body 内引用替换（r:embed / r:id 均按图片关系重命名）
      docBody = docBody.replaceAll(`r:embed="${oldId}"`, `r:embed="${newId}"`);
      docBody = docBody.replaceAll(`r:id="${oldId}"`, `r:id="${newId}"`);
    }

    // 移除后续文档 body 里的页眉/页脚引用（沿用主体文档，避免悬挂引用）
    docBody = docBody.replaceAll(/<w:headerReference\b[^>]*\/>/g, '');
    docBody = docBody.replaceAll(/<w:footerReference\b[^>]*\/>/g, '');

    // 分页符 + 该文档 body
    masterBodyInner += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>${docBody}`;

    if (relsAdditions) {
      if (files[RELS_XML]) {
        const masterRels = strFromU8(files[RELS_XML]);
        files[RELS_XML] = strToU8(
          masterRels.replace(
            '</Relationships>',
            `${relsAdditions}</Relationships>`,
          ),
        );
      } else {
        files[RELS_XML] = strToU8(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsAdditions}</Relationships>`,
        );
      }
    }
    const ct = files['[Content_Types].xml'];
    if (ct) {
      const ctXml = strFromU8(ct);
      files['[Content_Types].xml'] = strToU8(
        ensureContentTypes(ctXml, extensions),
      );
    }
  }

  // 拼回主体 document.xml
  const masterDocXml = files[DOCUMENT_XML];
  if (!masterDocXml) throw new Error('主体 document.xml 缺失');
  const masterXml = strFromU8(masterDocXml);
  const openMatch = masterXml.match(/<w:body\b[^>]*>/);
  if (!openMatch) throw new Error('主体 document.xml 缺少 <w:body>');
  const start = (openMatch.index ?? 0) + openMatch[0].length;
  const mergedXml =
    masterXml.slice(0, start) +
    masterBodyInner +
    masterXml.slice(masterXml.lastIndexOf('</w:body>'));
  files[DOCUMENT_XML] = strToU8(normalizeTableBorders(mergedXml));

  const out = zipSync(files, { level: 6 });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
