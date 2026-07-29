import { requestClient } from '../request';

/**
 * AI 生成图片
 */
export interface AIGenerateImageParams {
  /** 提示词/描述 */
  prompt: string;
  /** 风格 */
  style?: string;
  /** 参考图片 URL 列表（子嗣/父母头像） */
  reference_images?: string[];
  /** 负面提示词 */
  negative_prompt?: string;
  /** 图片宽度 */
  width?: number;
  /** 图片高度 */
  height?: number;
}

export interface AIGenerateImageResult {
  url: string;
  base64?: string;
}

/**
 * 调用 AI 生成图片
 */
export async function generateImageApi(
  params: AIGenerateImageParams,
): Promise<AIGenerateImageResult> {
  return await requestClient.request('/ai/generate-avatar', {
    method: 'post',
    data: params,
  });
}

/**
 * 获取可用的生图风格列表
 */
export async function getAIStylesApi(): Promise<
  { label: string; value: string; preview?: string }[]
> {
  return await requestClient.request('/ai/image-styles', {
    method: 'get',
    timeout: 30000,
  });
}
