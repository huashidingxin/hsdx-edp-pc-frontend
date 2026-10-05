import type { RequestClientConfig } from '@vben/request';

import { baseRequestClient, requestClient } from '#/api/request';
import { calculateFileHash } from '#/utils/file.js';

type UploadFile = File & { ret?: any };

type UploadLimits = { max_file_size: number; max_file_size_human: string };

let limitsPromise: Promise<UploadLimits | null> | null = null;

/**
 * 服务器真实上传上限（读 php.ini 的 upload_max_filesize / post_max_size）。
 *
 * 一个会话内只取一次；取不到就返回 null 并放弃预检，绝不因为预检本身失败而挡住上传。
 */
async function fetchUploadLimits(): Promise<UploadLimits | null> {
  limitsPromise ??= requestClient
    .get('/uploads/limits')
    .then((data: any) => ({
      max_file_size: Number(data?.max_file_size) || 0,
      max_file_size_human: String(data?.max_file_size_human || ''),
    }))
    .catch(() => null);

  return limitsPromise;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

/**
 * 上传前预检：超过服务器上限就直接抛出可读错误，不浪费一次请求。
 *
 * 之前这里没有任何预检，前端也不知道真实上限（后端配置写着 512MB，
 * 实际 php.ini 只给 2MB），用户只能等传完拿到一句
 * "The file failed to upload."，完全看不出是大小问题。
 */
async function assertWithinUploadLimit(file: File): Promise<void> {
  const limits = await fetchUploadLimits();
  const max = limits?.max_file_size ?? 0;
  if (max > 0 && file.size > max) {
    const readable = limits?.max_file_size_human || formatBytes(max);

    throw new Error(
      `「${file.name}」${formatBytes(file.size)} 超过服务器允许的上传大小 ${readable}，请压缩后重试`,
    );
  }
}

function appendParams(
  target: FormData | Record<string, any>,
  params: Record<string, any>,
) {
  for (const [key, value] of Object.entries(params || {})) {
    if (key === 'categoryId') {
      if (value !== undefined && value !== null) {
        target instanceof FormData
          ? target.append('category_id', String(value))
          : (target.category_id = String(value));
      }
      continue;
    }
    if (value !== undefined && value !== null) {
      target instanceof FormData
        ? target.append(key, String(value))
        : (target[key] = String(value));
    }
  }
}

function resolveUrl(result: any): string {
  if (!result) return '';
  if (typeof result === 'string') return result;
  return result.url || '';
}

/**
 * 统一上传：预检（秒传）-> 直传（OSS 等）-> 后端落地（local）
 * 1. 先仅携带 hash + name + size 预检，后端命中（秒传/直传）直接返回 url 或 method；
 * 2. 预检未命中且未返回 url（file 不存在）时，携带文件重新发起真实上传；
 *    注意：真实上传阶段不能携带 hash，否则旧版后端会将其拦截为纯 hash 预检，
 *    永远返回 {url:"",isNew:false,exists:false,isDuplicate:false} 而得不到文件地址。
 * 最终返回可访问的 url 字符串。
 */
export async function upload(
  file: File | File[],
  params: Record<string, any> = {},
  onUploadProgress?: RequestClientConfig['onUploadProgress'],
) {
  const files: UploadFile[] = (Array.isArray(file) ? file : [file]) as UploadFile[];
  const result: string[] = [];

  for (const uploadFile of files) {
    // 先按真实上限挡掉超大文件：算 hash 对大文件很贵，没必要白算一遍
    await assertWithinUploadLimit(uploadFile);

    const hash = await calculateFileHash(uploadFile);

    // 1. 预检（秒传）：仅 hash + name + size，不携带文件
    const prePayload: Record<string, any> = {
      hash,
      name: uploadFile.name,
      size: String(uploadFile.size),
    };
    appendParams(prePayload, params);

    const pre = await requestClient.post('/uploads', prePayload, {
      timeout: 60_000,
    });

    if (pre?.method) {
      await uploadToServer(pre, uploadFile);
    }
    const preUrl = resolveUrl(pre);
    if (preUrl) {
      result.push(preUrl);
      continue;
    }

    // 2. 上传：预检未命中（file 不存在）且未返回 url，携带文件重新发起上传
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('name', uploadFile.name);
    formData.append('size', String(uploadFile.size));
    appendParams(formData, params);

    const ret = await requestClient.post('/uploads', formData, {
      // 必须显式声明 multipart：实例默认头是 application/json;charset=utf-8，
      // 不覆盖的话 axios 会把 FormData 按 JSON 内容类型发送（无 boundary），后端收不到文件
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
      onUploadProgress,
    });

    if (ret?.method) {
      await uploadToServer(ret, uploadFile);
    }
    const retUrl = resolveUrl(ret);
    if (!retUrl) {
      throw new Error(`上传失败：后端未返回有效的文件地址（${uploadFile.name}）`);
    }
    result.push(retUrl);
  }

  return Array.isArray(file) ? result : result[0];
}

/** 直传到远程存储（OSS 等），后端已预创建文件槽位并返回预签名信息 */
async function uploadToServer(data: any, file: File) {
  const { method, uploadUrl, formDataParams, headers } = data;
  const form = new FormData();
  if (formDataParams) {
    for (const key in formDataParams) {
      form.append(key, formDataParams[key]);
    }
  }
  form.append('file', file);

  if (method === 'PUT') {
    // baseRequestClient 实例默认头是 JSON，直传二进制必须显式覆盖，否则存储端收不到内容
    await baseRequestClient.put(uploadUrl, file, {
      headers: { 'Content-Type': 'application/octet-stream', ...(headers || {}) },
    });
  } else {
    await baseRequestClient.post(uploadUrl, form, {
      headers: { 'Content-Type': 'multipart/form-data', ...(headers || {}) },
    });
  }
}

export const uploadFile = upload;
