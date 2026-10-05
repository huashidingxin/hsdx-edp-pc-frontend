/**
 * 全景原图的 2:1 体检。
 *
 * 等距圆柱（equirectangular）投影必须是严格 2:1，比例不符时后端
 * `PanoramaTiler::centerCropEquirect()` 会**静默中心裁切** —— 用户不看球面
 * 根本发现不了内容被裁掉了。所以前端在选完文件时就把「会裁掉多少」算清楚，
 * 让他自己决定要不要继续。
 *
 * ⚠️ 这里的裁切算法必须与后端逐字对应，否则提示的保留尺寸是错的，
 * 比不提示更糟。改动任何一边都要同步改另一边。
 */

export type CropAxis = 'horizontal' | 'vertical';

export type CropPlan = {
  /** 裁切方向：`horizontal` = 原图过宽，裁左右；`vertical` = 原图过高，裁上下。 */
  axis: CropAxis;
  /** 每侧被裁掉的像素。 */
  cutPerSide: number;
  /** 裁切后保留的尺寸。 */
  width: number;
  height: number;
};

/** 是否严格 2:1（唯一「不会被裁」的比例）。 */
export function isEquirectangular(width: number, height: number): boolean {
  return width > 0 && height > 0 && width === height * 2;
}

/**
 * 复刻 `PanoramaTiler::centerCropEquirect()`：算出会怎么裁。
 *
 * 已经严格 2:1（裁完与原图一致）时返回 `null`，表示无需提示。
 */
export function planCrop(width: number, height: number): CropPlan | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return null;
  }

  // 太高：上下各裁一部分，保留中线
  const targetHeight = Math.floor(width / 2);
  if (height > targetHeight) {
    return {
      axis: 'vertical',
      cutPerSide: Math.floor((height - targetHeight) / 2),
      width,
      height: targetHeight,
    };
  }

  // 过宽（或刚好 2:1）：左右各裁一部分
  const targetWidth = height * 2;
  if (targetWidth === width) {
    return null;
  }

  return {
    axis: 'horizontal',
    cutPerSide: Math.floor((width - targetWidth) / 2),
    width: targetWidth,
    height,
  };
}

/**
 * 「3072×1024 不是 2:1（过宽），左右各裁 512 px，只保留 2048×1024」这种人话。
 *
 * 尺寸无效或本来就合规时返回空串，调用方据此决定要不要显示提示。
 */
export function describeCrop(width: number, height: number): string {
  const plan = planCrop(width, height);
  if (!plan) {
    return '';
  }

  const shape = plan.axis === 'horizontal' ? '过宽' : '过高';
  const side = plan.axis === 'horizontal' ? '左右' : '上下';

  return `${width}×${height} 不是 2:1（${shape}），${side}各裁 ${plan.cutPerSide} px，只保留 ${plan.width}×${plan.height}`;
}
