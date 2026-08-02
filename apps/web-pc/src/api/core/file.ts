import type { RequestClientConfig } from '@vben/request';

import { requestClient } from '#/api/request';
import { calculateFileHash } from '#/utils/file.js';

type UploadFile = File & { ret?: any };

export async function upload(
  file: File | File[],
  params: Record<string, any> = {},
  onUploadProgress?: RequestClientConfig['onUploadProgress'],
) {
  const files: UploadFile[] = (Array.isArray(file) ? file : [file]) as UploadFile[];
  const hashSuccess: any[] = [];
  for (const uploadFile of files) {
    try {
      const hash = await calculateFileHash(uploadFile);
      const data = await requestClient.post('/uploads', {
        hash,
        name: uploadFile.name,
      });
      if (data) {
        uploadFile.ret = data;
        hashSuccess.push(data);
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (hashSuccess.length === files.length) {
    return Array.isArray(file) ? hashSuccess : hashSuccess[0];
  }

  const formData = new FormData();
  const uploadIndexList: number[] = [];
  if (Array.isArray(file)) {
    files.forEach((uploadFile, index) => {
      if (uploadFile.ret) {
        return;
      }
      uploadIndexList.push(index);
      formData.append('file[]', uploadFile);
    });
  } else {
    formData.append('file', file);
  }
  for (const key in params) {
    formData.append(key, params[key] as string | Blob);
  }

  const data = await requestClient.post('/uploads', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60_000,
    onUploadProgress,
  });

  if (!Array.isArray(file)) {
    return data;
  }

  uploadIndexList.forEach((fileIndex, responseIndex) => {
    files[fileIndex]!.ret = data[responseIndex];
  });
  return files.map((item) => item.ret);
}
