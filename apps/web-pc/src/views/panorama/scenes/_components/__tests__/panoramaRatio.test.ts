import { describe, expect, it } from 'vitest';

import {
  describeCrop,
  isEquirectangular,
  planCrop,
} from '../panoramaRatio';

/**
 * 裁切算法必须与后端 `PanoramaTiler::centerCropEquirect()` 一致。
 *
 * 后端侧同样的用例在 `tests/Feature/V1/PanoramaAdminTest.php`
 * 的 `test_tiling_reports_the_source_size_and_whether_it_was_cropped`：
 *   - 1024×512  → 不裁
 *   - 3072×1024 → 左右各裁 512，保留 2048×1024
 *   - 1024×1024 → 上下各裁 256，保留 1024×512
 */
describe('planCrop', () => {
  it('严格 2:1 时返回 null（无需提示）', () => {
    expect(planCrop(1024, 512)).toBeNull();
    expect(planCrop(12000, 6000)).toBeNull();
    expect(planCrop(2, 1)).toBeNull();
  });

  it('过宽时裁左右，保留 height*2 × height', () => {
    expect(planCrop(3072, 1024)).toEqual({
      axis: 'horizontal',
      cutPerSide: 512,
      width: 2048,
      height: 1024,
    });
    expect(planCrop(3600, 1200)).toEqual({
      axis: 'horizontal',
      cutPerSide: 600,
      width: 2400,
      height: 1200,
    });
  });

  it('过高时裁上下，保留 width × floor(width/2)', () => {
    expect(planCrop(1024, 1024)).toEqual({
      axis: 'vertical',
      cutPerSide: 256,
      width: 1024,
      height: 512,
    });
    expect(planCrop(2048, 2048)).toEqual({
      axis: 'vertical',
      cutPerSide: 512,
      width: 2048,
      height: 1024,
    });
  });

  it('宽高相差 1px 也算不合规，要如实报告', () => {
    // 1025 宽只能保留 1024，虽然每侧「裁 0 px」，但尺寸确实变了
    expect(planCrop(1025, 512)).toEqual({
      axis: 'horizontal',
      cutPerSide: 0,
      width: 1024,
      height: 512,
    });
  });

  it('尺寸无效时返回 null，绝不猜', () => {
    expect(planCrop(0, 0)).toBeNull();
    expect(planCrop(1024, 0)).toBeNull();
    expect(planCrop(-100, 50)).toBeNull();
    expect(planCrop(1024.5, 512)).toBeNull();
  });
});

describe('isEquirectangular', () => {
  it('只有严格 2:1 为真', () => {
    expect(isEquirectangular(12000, 6000)).toBe(true);
    expect(isEquirectangular(1024, 512)).toBe(true);
    expect(isEquirectangular(1025, 512)).toBe(false);
    expect(isEquirectangular(1024, 513)).toBe(false);
    expect(isEquirectangular(0, 0)).toBe(false);
  });
});

describe('describeCrop', () => {
  it('过宽时说明裁左右与保留尺寸', () => {
    expect(describeCrop(3072, 1024)).toBe(
      '3072×1024 不是 2:1（过宽），左右各裁 512 px，只保留 2048×1024',
    );
  });

  it('过高时说明裁上下与保留尺寸', () => {
    expect(describeCrop(1024, 1024)).toBe(
      '1024×1024 不是 2:1（过高），上下各裁 256 px，只保留 1024×512',
    );
  });

  it('合规或尺寸无效时返回空串（调用方据此隐藏提示）', () => {
    expect(describeCrop(12000, 6000)).toBe('');
    expect(describeCrop(0, 0)).toBe('');
  });
});
