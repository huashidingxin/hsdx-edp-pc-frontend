/**
 * 等距圆柱（equirectangular）底图 ↔ 球面坐标（yaw / pitch，单位：度）的换算。
 *
 * 热点编辑器的核心就是这两个函数：
 *   1. 在 2:1 的底图上点击/拖拽 → 换算成球面坐标存库（pixelToSpherical）；
 *   2. 打开已有热点时把球面坐标画回底图上的位置（sphericalToPixel）。
 *
 * 约定必须与 Photo Sphere Viewer 的纹理坐标换算保持一致，否则「编辑器里放这儿、
 * 播放页出现在那儿」。PSV 的实现（AbstractAdapter::textureCoordsToSphericalCoords）为：
 *
 *   relativeX = textureX / fullWidth  * 2π
 *   yaw       = relativeX >= π ? relativeX - π : relativeX + π
 *   relativeY = textureY / fullHeight * π
 *   pitch     = π/2 - relativeY
 *
 * 化简后即：底图**水平中点 = yaw 0**，**上边缘 = pitch +90**（天顶），
 * **下边缘 = pitch −90**（地面）。yaw 归一化到 [-180, 180)。
 *
 * 纯函数、无副作用，单独成文件以便 node 侧单测（见 __tests__）。
 */

export interface SphericalPosition {
  /** 经度，单位度，取值 [-180, 180)。 */
  yaw: number;
  /** 纬度，单位度，取值 [-90, 90]，+90 为天顶。 */
  pitch: number;
}

export interface PixelPosition {
  x: number;
  y: number;
}

/** yaw 归一化到 [-180, 180)。 */
export function normalizeYaw(value: number): number {
  if (!Number.isFinite(value)) return 0;

  const normalized = ((((value + 180) % 360) + 360) % 360) - 180;

  // 避免 -0（会让「值相等」的比较与序列化结果看起来不一致）
  return normalized === 0 ? 0 : normalized;
}

/** pitch 夹紧到 [-90, 90]。 */
export function clampPitch(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return Math.min(90, Math.max(-90, value));
}

/** 底图像素坐标 → 球面坐标。 */
export function pixelToSpherical(
  x: number,
  y: number,
  width: number,
  height: number,
): SphericalPosition {
  if (!(width > 0) || !(height > 0)) {
    return { yaw: 0, pitch: 0 };
  }

  return {
    yaw: normalizeYaw((x / width) * 360 + 180),
    pitch: clampPitch(90 - (y / height) * 180),
  };
}

/** 球面坐标 → 底图像素坐标（pixelToSpherical 的逆运算）。 */
export function sphericalToPixel(
  yaw: number,
  pitch: number,
  width: number,
  height: number,
): PixelPosition {
  if (!(width > 0) || !(height > 0)) {
    return { x: 0, y: 0 };
  }

  const wrappedYaw = ((((yaw - 180) % 360) + 360) % 360) / 360;

  return {
    x: wrappedYaw * width,
    y: ((90 - clampPitch(pitch)) / 180) * height,
  };
}

/**
 * 罗盘方位角（0 = 正北，顺时针）。
 *
 * `northOffset` 是「底图上哪个 yaw 指向正北」——由编辑器里的北向校正采集。
 */
export function yawToBearing(yaw: number, northOffset: number): number {
  return ((yaw - northOffset) % 360 + 360) % 360;
}

/**
 * 把热点从 fromYaw 拖到 toYaw 时，是否跨越了底图左右接缝（等距圆柱首尾相连）。
 *
 * 判据是「底图上的直线距离超过半圈」：这时用户想走的是绕过接缝的短路径，
 * 编辑器应当把坐标环绕过去，而不是让热点横穿整张底图。
 */
export function crossesSeam(fromYaw: number, toYaw: number): boolean {
  return Math.abs(toYaw - fromYaw) > 180;
}

/* ===================== 视场角 ↔ Photo Sphere Viewer zoom 等级 ===================== */

/** PSV 默认 minFov / maxFov（见 core DEFAULTS）。 */
export const MIN_FOV = 30;
export const MAX_FOV = 90;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 垂直视场角（度）→ PSV zoom 等级（0 = 拉到最远，100 = 推到最近）。
 *
 * 公式取自 PSV `DataHelper::fovToZoomLevel`：
 *   temp = round((fov - minFov) / (maxFov - minFov) * 100)
 *   level = clamp(100 - temp, 0, 100)
 * 注意 PSV 的 `defaultZoomLvl` 作用在**垂直**视场角上，与容器宽高比无关。
 */
export function vFovToZoom(
  vFov: number,
  minFov: number = MIN_FOV,
  maxFov: number = MAX_FOV,
): number {
  const span = maxFov - minFov;
  if (!(span > 0)) return 50;

  const fov = Number.isFinite(vFov) ? vFov : maxFov;
  const temp = Math.round(((fov - minFov) / span) * 100);

  return clamp(100 - temp, 0, 100);
}

/** PSV zoom 等级 → 垂直视场角（度），vFovToZoom 的逆运算。 */
export function zoomToVFov(
  level: number,
  minFov: number = MIN_FOV,
  maxFov: number = MAX_FOV,
): number {
  const clamped = clamp(Number.isFinite(level) ? level : 50, 0, 100);

  return maxFov + (clamped / 100) * (minFov - maxFov);
}

/**
 * 水平视场角 → 垂直视场角（与 PSV `DataHelper::hFovToVFov` 一致）。
 *
 * 编辑器和播放页存的是「水平视场角」（人对 360 全景的直觉单位），
 * 但 PSV 的 zoom 只认垂直视场角，所以必须按当前容器宽高比换算，
 * 否则同一份数据在宽屏与竖屏上会得到完全不同的观感。
 */
export function hFovToVFov(hFov: number, aspect: number): number {
  if (!(aspect > 0) || !Number.isFinite(hFov)) return hFov;

  return (2 * Math.atan(Math.tan((hFov * Math.PI) / 360) / aspect) * 180) / Math.PI;
}

/** 垂直视场角 → 水平视场角。 */
export function vFovToHFov(vFov: number, aspect: number): number {
  if (!(aspect > 0) || !Number.isFinite(vFov)) return vFov;

  return (2 * Math.atan(Math.tan((vFov * Math.PI) / 360) * aspect) * 180) / Math.PI;
}

/** 水平视场角（度）→ PSV zoom 等级。 */
export function hFovToZoom(
  hFov: number,
  aspect: number,
  minFov: number = MIN_FOV,
  maxFov: number = MAX_FOV,
): number {
  return vFovToZoom(hFovToVFov(hFov, aspect), minFov, maxFov);
}

/** PSV zoom 等级 → 水平视场角（度）。 */
export function zoomToHFov(
  level: number,
  aspect: number,
  minFov: number = MIN_FOV,
  maxFov: number = MAX_FOV,
): number {
  return vFovToHFov(zoomToVFov(level, minFov, maxFov), aspect);
}
