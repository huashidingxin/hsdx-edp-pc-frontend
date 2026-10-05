import { describe, expect, it } from 'vitest';

import {
  clampPitch,
  crossesSeam,
  hFovToVFov,
  hFovToZoom,
  normalizeYaw,
  pixelToSpherical,
  sphericalToPixel,
  vFovToHFov,
  vFovToZoom,
  yawToBearing,
  zoomToHFov,
  zoomToVFov,
} from '../panoramaProjection';

const WIDTH = 4096;
const HEIGHT = 2048;

describe('normalizeYaw', () => {
  it('归一化到 [-180, 180)', () => {
    expect(normalizeYaw(0)).toBe(0);
    expect(normalizeYaw(90)).toBe(90);
    expect(normalizeYaw(-90)).toBe(-90);
    expect(normalizeYaw(270)).toBe(-90);
    expect(normalizeYaw(450)).toBe(90);
    expect(normalizeYaw(-450)).toBe(-90);
  });

  it('±180 收敛到同一个值，且不产生 -0', () => {
    expect(normalizeYaw(180)).toBe(-180);
    expect(normalizeYaw(-180)).toBe(-180);
    expect(Object.is(normalizeYaw(-360), -0)).toBe(false);
  });

  it('非有限值退化为 0', () => {
    expect(normalizeYaw(Number.NaN)).toBe(0);
    expect(normalizeYaw(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('clampPitch', () => {
  it('夹紧到 [-90, 90]', () => {
    expect(clampPitch(120)).toBe(90);
    expect(clampPitch(-120)).toBe(-90);
    expect(clampPitch(12.5)).toBe(12.5);
    expect(clampPitch(Number.NaN)).toBe(0);
  });
});

describe('pixelToSpherical', () => {
  it('底图水平中点 = yaw 0，垂直中点 = pitch 0', () => {
    expect(pixelToSpherical(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT)).toEqual({ yaw: 0, pitch: 0 });
  });

  it('上边缘为天顶、下边缘为地面', () => {
    expect(pixelToSpherical(WIDTH / 2, 0, WIDTH, HEIGHT).pitch).toBe(90);
    expect(pixelToSpherical(WIDTH / 2, HEIGHT, WIDTH, HEIGHT).pitch).toBe(-90);
  });

  it('左右边缘是同一条经线（首尾相接）', () => {
    const left = pixelToSpherical(0, HEIGHT / 2, WIDTH, HEIGHT).yaw;
    const right = pixelToSpherical(WIDTH, HEIGHT / 2, WIDTH, HEIGHT).yaw;
    expect(left).toBe(-180);
    expect(right).toBe(-180);
  });

  it('1/4 处对应 -90 度', () => {
    expect(pixelToSpherical(WIDTH / 4, HEIGHT / 2, WIDTH, HEIGHT).yaw).toBe(-90);
  });

  it('尺寸非法时退化为 0', () => {
    expect(pixelToSpherical(10, 10, 0, 0)).toEqual({ yaw: 0, pitch: 0 });
  });
});

describe('sphericalToPixel', () => {
  it('yaw 0 / pitch 0 落在底图正中', () => {
    expect(sphericalToPixel(0, 0, WIDTH, HEIGHT)).toEqual({ x: WIDTH / 2, y: HEIGHT / 2 });
  });

  it('与 pixelToSpherical 互逆', () => {
    const samples: Array<[number, number]> = [
      [0, 0],
      [-90, 30],
      [45, -45],
      [179, 89],
      [-179, -89],
    ];

    for (const [yaw, pitch] of samples) {
      const pixel = sphericalToPixel(yaw, pitch, WIDTH, HEIGHT);
      const back = pixelToSpherical(pixel.x, pixel.y, WIDTH, HEIGHT);

      expect(back.yaw).toBeCloseTo(yaw, 6);
      expect(back.pitch).toBeCloseTo(pitch, 6);
    }
  });

  it('pitch 越界时按边界取值', () => {
    expect(sphericalToPixel(0, 200, WIDTH, HEIGHT).y).toBe(0);
    expect(sphericalToPixel(0, -200, WIDTH, HEIGHT).y).toBe(HEIGHT);
  });
});

describe('yawToBearing', () => {
  it('northOffset 指向的 yaw 方位角为 0，顺时针增加', () => {
    expect(yawToBearing(30, 30)).toBe(0);
    expect(yawToBearing(120, 30)).toBe(90);
    expect(yawToBearing(-60, 30)).toBe(270);
  });
});

describe('crossesSeam', () => {
  it('跨越底图接缝时返回 true', () => {
    expect(crossesSeam(-179, 179)).toBe(true);
    expect(crossesSeam(179, -179)).toBe(true);
    expect(crossesSeam(10, 20)).toBe(false);
  });
});

describe('vFovToZoom / zoomToVFov', () => {
  it('与 PSV 的默认 minFov=30 / maxFov=90 对齐', () => {
    // maxFov 对应 zoom 0（拉最远），minFov 对应 zoom 100（推最近）
    expect(vFovToZoom(90)).toBe(0);
    expect(vFovToZoom(30)).toBe(100);
    expect(vFovToZoom(60)).toBe(50);

    expect(zoomToVFov(0)).toBe(90);
    expect(zoomToVFov(100)).toBe(30);
    expect(zoomToVFov(50)).toBe(60);
  });

  it('越界输入被夹紧，非有限值退化到中间档', () => {
    expect(vFovToZoom(200)).toBe(0);
    expect(vFovToZoom(1)).toBe(100);
    expect(vFovToZoom(Number.NaN)).toBe(0);
    expect(zoomToVFov(999)).toBe(30);
    expect(zoomToVFov(-999)).toBe(90);
    expect(zoomToVFov(Number.NaN)).toBe(60);
  });

  it('互为逆运算（取整误差 ±1）', () => {
    for (const level of [0, 12, 37, 50, 73, 100]) {
      expect(vFovToZoom(zoomToVFov(level))).toBeCloseTo(level, -1);
    }
  });
});

describe('hFovToVFov / vFovToHFov', () => {
  it('宽高比为 1 时两者相等', () => {
    expect(hFovToVFov(80, 1)).toBeCloseTo(80, 6);
    expect(vFovToHFov(80, 1)).toBeCloseTo(80, 6);
  });

  it('宽屏（aspect > 1）下水平视场角更大', () => {
    const vFov = hFovToVFov(90, 16 / 9);
    expect(vFov).toBeLessThan(90);
    expect(vFovToHFov(vFov, 16 / 9)).toBeCloseTo(90, 6);
  });

  it('竖屏（aspect < 1）下水平视场角更小', () => {
    const vFov = hFovToVFov(60, 0.5);
    expect(vFov).toBeGreaterThan(60);
    expect(vFovToHFov(vFov, 0.5)).toBeCloseTo(60, 6);
  });

  it('宽高比非法时原样返回，不做换算', () => {
    expect(hFovToVFov(80, 0)).toBe(80);
    expect(vFovToHFov(80, -1)).toBe(80);
  });
});

describe('hFovToZoom / zoomToHFov', () => {
  it('把水平视场角换算成 zoom 等级（宽屏下同一水平角需要更远的 zoom）', () => {
    expect(hFovToZoom(90, 1)).toBe(0);
    expect(hFovToZoom(30, 1)).toBe(100);
    // 宽屏下 90° 水平视场角对应的垂直视场角更小 → zoom 更靠近
    expect(hFovToZoom(90, 16 / 9)).toBeGreaterThan(0);
  });

  it('与 zoomToHFov 互逆', () => {
    const aspect = 16 / 9;
    for (const level of [0, 25, 50, 75, 100]) {
      expect(hFovToZoom(zoomToHFov(level, aspect), aspect)).toBeCloseTo(level, -1);
    }
  });
});
