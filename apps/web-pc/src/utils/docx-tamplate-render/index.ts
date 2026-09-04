/**
 * docx-handlebars WASM 渲染封装。
 *
 * 用法：
 *   import { renderDocxFromBase64 } from '#/utils/docx-tamplate-render';
 *   const blob = await renderDocxFromBase64(templateBase64, data);
 *
 * 说明：
 *   - WASM 仅在首次渲染时懒加载（init() 才会 fetch docx_handlebars_bg.wasm）；
 *   - 输入模板字节 + JSON 数据，输出渲染后的 docx Blob；
 *   - 渲染产物会做「内容控件占位 label」清理（见 docx-placeholder-clean）。
 */
import { stripPlaceholderLabels } from '../docx-placeholder-clean';
import initWasm, { render_template } from './docx_handlebars.js';

let initPromise: null | Promise<unknown> = null;

function ensureInit(): Promise<unknown> {
  if (!initPromise) {
    initPromise = initWasm().catch((error) => {
      // 失败后允许下次重试
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

/** base64 → Uint8Array（浏览器环境无 Buffer） */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** 渲染模板并返回 docx 字节 */
export async function renderDocx(
  templateBytes: Uint8Array,
  data: unknown,
): Promise<Uint8Array> {
  await ensureInit();
  const result = render_template(templateBytes, JSON.stringify(data ?? {}));
  const bytes = result instanceof Uint8Array ? result : new Uint8Array(result);
  return stripPlaceholderLabels(bytes);
}

/** 渲染模板并返回 docx Blob */
export async function renderDocxToBlob(
  templateBytes: Uint8Array,
  data: unknown,
): Promise<Blob> {
  const bytes = await renderDocx(templateBytes, data);
  // 拷贝到独立 ArrayBuffer，满足 BlobPart 对 Uint8Array<ArrayBuffer> 的类型要求
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** 从 base64 模板直接渲染为 docx Blob */
export async function renderDocxFromBase64(
  templateBase64: string,
  data: unknown,
): Promise<Blob> {
  if (!templateBase64) {
    throw new Error('模板内容为空');
  }
  return renderDocxToBlob(base64ToBytes(templateBase64), data);
}
