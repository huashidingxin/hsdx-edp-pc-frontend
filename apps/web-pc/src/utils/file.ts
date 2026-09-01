/**
 * 文件处理工具函数（AppUpload 使用）。
 * 参考 web-admin 的 src/utils/file.js 实现，仅保留本项目用到的方法，
 * 去掉对 crypto-js 的依赖。
 */

 import CryptoJS from 'crypto-js';

/** 通过 HEAD 请求获取文件大小与类型 */
export async function getInfo(url: string): Promise<{
  size: number;
  type: string;
} | null> {
  try {
    const response = await fetch(url, { method: 'HEAD' });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 获取 Content-Length 头部
    const contentLength = response.headers.get('Content-Length');
    const contentType = response.headers.get('Content-Type');

    if (contentLength) {
      const sizeInBytes = parseInt(contentLength, 10);
      return {
        size: sizeInBytes,
        type: contentType || '',
      };
    }
    console.error('Content-Length header not found.');
    return null;
  } catch (error) {
    console.error('Error fetching image size:', error);
    return null;
  }
}

/** 将 Blob URL 转为 File 对象 */
export async function blobUrlToFile(
  blobUrl: string,
  filename = 'image.png',
  mimeType = 'image/webp',
): Promise<File | null> {
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const blob = await response.blob();
    return new File([blob], filename, { type: mimeType });
  } catch (error) {
    console.error('Error converting Blob URL to File:', error);
    return null;
  }
}

/** Base64 字符串转为 File 对象 */
export function base64ToFile(
  base64String: string,
  filename?: string,
  mimetype = 'image/webp',
): File {
  // 去掉 Base64 字符串前面的 "data:image/jpeg;base64," 等前缀
  const base64Data = base64String.split(',')[1] || base64String;

  const regex = /^data:([^;]+);base64,/;
  const match = base64String.match(regex);

  // 如果匹配成功，返回 MIME 类型；否则使用默认
  const resolvedMime = match ? match[1] : mimetype;
  let extension = resolvedMime.replace('image/', '');
  if (extension === 'jpeg') {
    extension = 'jpg';
  }

  // 将 Base64 字符串解码为二进制数据
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);

  const blob = new Blob([byteArray], { type: resolvedMime });
  return new File([blob], filename || `${Date.now()}.${extension}`, {
    type: resolvedMime,
  });
}

/** 将视频 URL 转为 Blob URL */
export async function videoUrlToBlobUrl(
  videoUrl: string,
): Promise<string | null> {
  try {
    const response = await fetch(videoUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error converting video URL to Blob URL:', error);
    return null;
  }
}

/** 判断字符串是否为 Base64 编码 */
export function isBase64(str: string): boolean {
  try {
    const cleaned = str.replace(/^data:image\/\w+;base64,/, '');
    const decoded = atob(cleaned);
    const reencoded = btoa(decoded);
    return reencoded === cleaned;
  } catch {
    return false;
  }
}

/** 为 File/Blob 创建对象 URL */
export function createObjectURL(file: Blob | File): string {
  const urlConstructor: typeof URL =
    (window as any).URL || (window as any).webkitURL;
  return urlConstructor.createObjectURL(file);
}

/** 格式化文件大小 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}b`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)}kb`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)}mb`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}gb`;
}

async function calculatePartialHash(file, start, end) {
	const slice = file.slice(start, end);
	const arrayBuffer = await slice.arrayBuffer();
	const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
	return CryptoJS.SHA1(wordArray).toString();
}

export async function calculateFileHash(file) {
	const fileSize = file.size;

	// 计算前 1MB 和最后 1MB 的哈希值
	const firstMBHash = await calculatePartialHash(file, 0, Math.min(1024 * 1024, fileSize));
	const lastMBHash = await calculatePartialHash(file, Math.max(fileSize - 1024 * 1024, 0), fileSize);

	// 合并并计算 SHA-1 哈希
	const combinedString = firstMBHash + lastMBHash + fileSize;
	return CryptoJS.SHA1(combinedString).toString();
}
