/**
 * docx 本地渲染共享逻辑（单条/批量复用）
 */
import { type Zippable, zipSync } from 'fflate';

import { requestClient } from '#/api/request';
import { normalizeDocxBlob } from '#/utils/docx-merge';
import { renderDocxFromBase64 } from '#/utils/docx-tamplate-render/index';

/** docx-handlebars 的 {{img}} 需要「去掉 data:image/...;base64, 前缀的裸 Base64」 */
export function stripDataUrlPrefix(value: string): string {
  const idx = value.indexOf('base64,');
  return idx === -1 ? value : value.slice(idx + 7);
}

/** 签名图为 URL 时抓取并转成裸 Base64；已是 Base64/dataURI 则原样返回；空值原样返回 */
export async function signatureToImageBase64(value: string): Promise<string> {
  if (!value) {
    return value;
  }
  if (!/^https?:\/\//i.test(value)) {
    return stripDataUrlPrefix(value);
  }
  const response = await fetch(value);
  if (!response.ok) {
    throw new Error(`签名图片加载失败: ${response.status}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () =>
      resolve(stripDataUrlPrefix(String(reader.result))),
    );
    reader.addEventListener('error', () =>
      reject(new Error('签名图片转 Base64 失败')),
    );
    reader.readAsDataURL(blob);
  });
}

/**
 * 用模板 base64 + 渲染数据在本地（WASM）渲染一份 docx。
 * @param withSignature false 时签名置空（{{img ''}} 输出为空）
 */
export async function renderSubmissionPayload(
  templateBase64: string,
  renderData: Record<string, unknown>,
  options: { withSignature?: boolean } = {},
): Promise<Blob> {
  const fields = renderData.fields as Record<string, unknown> | undefined;
  const data: Record<string, unknown> = {
    ...renderData,
    ...fields,
  };
  const signatureImage = data.signature_image as string | undefined;
  if (options.withSignature) {
    if (typeof signatureImage === 'string' && signatureImage) {
      try {
        data.signature_image = await signatureToImageBase64(signatureImage);
      } catch (error) {
        // 签名图加载失败不阻塞整篇文档渲染，{{img}} 空值输出为空
        console.warn('签名图转 Base64 失败，已忽略:', error);
        data.signature_image = '';
      }
    }
  } else {
    data.signature_image = '';
  }
  return normalizeDocxBlob(
    await renderDocxFromBase64(
      templateBase64,
      data as unknown as Record<string, string>,
    ),
  );
}

/** 规范化压缩包内的文件名，避免路径穿越和同名覆盖。 */
export function safeFileName(name: string, fallback = '附件') {
  const normalized = String(name || fallback)
    .replaceAll(/[\\/:*?"<>|]/g, '_')
    .replaceAll(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
}

/** 为压缩包中的文件分配不重复的名称。 */
export function uniqueFileName(name: string, usedNames: Set<string>) {
  const safeName = safeFileName(name);
  const dot = safeName.lastIndexOf('.');
  const stem = dot > 0 ? safeName.slice(0, dot) : safeName;
  const extension = dot > 0 ? safeName.slice(dot) : '';
  let result = safeName;
  let index = 2;
  while (usedNames.has(result)) {
    result = `${stem}(${index})${extension}`;
    index += 1;
  }
  usedNames.add(result);
  return result;
}

/**
 * 下载附件并转为压缩包可写入的字节。
 * 附件 url 为 CDN/OSS 可访问地址（跨域由文件服务器 CORS 配置解决）；
 * 非 http(s) 的本地相对路径走 requestClient.download。
 */
export async function fetchFileBytes(url: string): Promise<Uint8Array> {
  if (!/^https?:\/\//i.test(url)) {
    const blob = await requestClient.download(url);
    return new Uint8Array(await blob.arrayBuffer());
  }
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`附件下载失败（${response.status}）`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * 将文件集合压缩为 ZIP Blob。
 * 支持嵌套对象表达目录（键为文件夹名），fflate 会自动写出目录条目。
 */
export function zipFiles(files: Zippable): Blob {
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' });
}

/** 触发浏览器下载 Blob */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
