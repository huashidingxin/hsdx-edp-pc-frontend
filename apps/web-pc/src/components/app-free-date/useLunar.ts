import { Lunar, Solar } from 'lunar-javascript';
import type { FreeDatePrecision } from './types';

/**
 * 农历计算工具集
 * 从 AppFreeDate 组件中抽离，便于复用和测试
 */

// ============ 阳历工具函数 ============

/** 获取年份的干支 */
export function getYearGanZhi(year: number): string {
  try {
    const lunar = Lunar.fromYmd(year, 1, 1);
    return lunar.getYearInGanZhi();
  } catch {
    return '';
  }
}

/** 获取年份的生肖 */
export function getYearShengXiao(year: number): string {
  try {
    const lunar = Lunar.fromYmd(year, 1, 1);
    return lunar.getYearShengXiao();
  } catch {
    return '';
  }
}

/** 获取月份的干支 */
export function getMonthGanZhi(year: number, month: number): string {
  try {
    const solar = Solar.fromYmd(year, month, 1);
    const lunar = solar.getLunar();
    return lunar.getMonthInGanZhi();
  } catch {
    return '';
  }
}

/** 获取农历月名 */
export function getLunarMonth(year: number, month: number): string {
  try {
    const solar = Solar.fromYmd(year, month, 1);
    const lunar = solar.getLunar();
    return lunar.getMonthInChinese();
  } catch {
    return '';
  }
}

/** 获取农历日名（初一显示月名） */
export function getLunarDay(year: number, month: number, day: number): string {
  try {
    const solar = Solar.fromYmd(year, month, day);
    const lunar = solar.getLunar();
    const dayInChinese = lunar.getDayInChinese();
    return dayInChinese === '初一' ? lunar.getMonthInChinese() : dayInChinese;
  } catch {
    return '';
  }
}

/** 获取阳历星座 */
export function getSolarConstellation(year: number, month: number, day: number): string {
  try {
    const solar = Solar.fromYmd(year, month, day);
    return solar.getXingZuo();
  } catch {
    return '';
  }
}

// ============ 阴历工具函数 ============

/** 获取阴历年的干支 */
export function getLunarYearGanZhi(lunarYear: number): string {
  try {
    const lunar = Lunar.fromYmd(lunarYear, 1, 1);
    return lunar.getYearInGanZhi();
  } catch {
    return '';
  }
}

/** 获取阴历年的中文名（如：二零二四） */
export function getLunarYearName(lunarYear: number): string {
  try {
    const lunar = Lunar.fromYmd(lunarYear, 1, 1);
    return lunar.getYearInChinese();
  } catch {
    return '';
  }
}

/** 获取阴历年的生肖 */
export function getLunarYearShengXiao(lunarYear: number): string {
  try {
    const lunar = Lunar.fromYmd(lunarYear, 1, 1);
    return lunar.getYearShengXiao() + '年';
  } catch {
    return '';
  }
}

/** 获取阴历月的干支 */
export function getLunarMonthGanZhi(lunarYear: number, lunarMonth: number): string {
  try {
    const isLeap = lunarMonth < 0;
    const absMonth = Math.abs(lunarMonth);
    const lunar = Lunar.fromYmd(lunarYear, isLeap ? -absMonth : absMonth, 1);
    return lunar.getMonthInGanZhi();
  } catch {
    return '';
  }
}

/** 获取阴历月名 */
export function getLunarMonthName(lunarYear: number, lunarMonth: number): string {
  try {
    const isLeap = lunarMonth < 0;
    const absMonth = Math.abs(lunarMonth);
    const lunar = Lunar.fromYmd(lunarYear, isLeap ? -absMonth : absMonth, 1);
    return isLeap ? '闰' + lunar.getMonthInChinese() : lunar.getMonthInChinese();
  } catch {
    return '';
  }
}

/** 获取阴历月对应的阳历月 */
export function getLunarMonthSolar(lunarYear: number, lunarMonth: number): string {
  try {
    const isLeap = lunarMonth < 0;
    const absMonth = Math.abs(lunarMonth);
    const lunar = Lunar.fromYmd(lunarYear, isLeap ? -absMonth : absMonth, 1);
    const solar = lunar.getSolar();
    return solar.getMonth() + '月';
  } catch {
    return '';
  }
}

/** 获取阴历日名 */
export function getLunarDayName(lunarYear: number, lunarMonth: number, lunarDay: number): string {
  try {
    const isLeap = lunarMonth < 0;
    const absMonth = Math.abs(lunarMonth);
    const lunar = Lunar.fromYmd(lunarYear, isLeap ? -absMonth : absMonth, lunarDay);
    const dayInChinese = lunar.getDayInChinese();
    return dayInChinese === '初一' ? `${lunar.getMonthInChinese()}月` : dayInChinese;
  } catch {
    return '';
  }
}

/** 获取阴历日对应的阳历日 */
export function getLunarDaySolar(lunarYear: number, lunarMonth: number, lunarDay: number): string {
  try {
    const isLeap = lunarMonth < 0;
    const absMonth = Math.abs(lunarMonth);
    const lunar = Lunar.fromYmd(lunarYear, isLeap ? -absMonth : absMonth, lunarDay);
    const solar = lunar.getSolar();
    return solar.getDay() + '日';
  } catch {
    return '';
  }
}

/** 获取阴历日的节气 */
export function getLunarDayJieQi(lunarYear: number, lunarMonth: number, lunarDay: number): string {
  try {
    const isLeap = lunarMonth < 0;
    const absMonth = Math.abs(lunarMonth);
    const lunar = Lunar.fromYmd(lunarYear, isLeap ? -absMonth : absMonth, lunarDay);
    const jieQi = lunar.getCurrentJieQi();
    return jieQi ? jieQi.getName() : '';
  } catch {
    return '';
  }
}

// ============ 格式化函数 ============

/** 格式化农历显示文本 */
export function formatLunarDisplay(lunar: Lunar, precision: FreeDatePrecision): string {
  const yearStr = lunar.getYearInChinese();
  const monthStr = lunar.getMonthInChinese() + '月';
  const shengXiao = lunar.getYearShengXiao();

  if (precision === 'date') {
    const dayStr = lunar.getDayInChinese();
    return dayStr === '初一'
      ? `${yearStr}${monthStr} ${shengXiao}年`
      : `${yearStr}${monthStr}${dayStr} ${shengXiao}年`;
  }

  if (precision === 'month') {
    return `${yearStr}${monthStr} ${shengXiao}年`;
  }

  return `${yearStr} ${shengXiao}年`;
}

/** 获取阴历月份列表（含闰月） */
export function getLunarMonths(lunarYear: number): Array<{ month: number; name: string; isLeap: boolean }> {
  const months: Array<{ month: number; name: string; isLeap: boolean }> = [];
  try {
    for (let m = 1; m <= 12; m++) {
      const lunar = Lunar.fromYmd(lunarYear, m, 1);
      months.push({
        month: m,
        name: lunar.getMonthInChinese(),
        isLeap: false,
      });

      // 检查是否存在闰月
      try {
        const leapLunar = Lunar.fromYmd(lunarYear, -m, 1);
        months.push({
          month: -m,
          name: '闰' + leapLunar.getMonthInChinese(),
          isLeap: true,
        });
      } catch {
        // 没有该闰月
      }
    }
  } catch {
    // ignore
  }
  return months;
}

/** 获取阴历月份的天数 */
export function getLunarDays(lunarYear: number, lunarMonth: number): number[] {
  const days: number[] = [];
  try {
    const isLeap = lunarMonth < 0;
    const absMonth = Math.abs(lunarMonth);
    for (let d = 1; d <= 30; d++) {
      try {
        Lunar.fromYmd(lunarYear, isLeap ? -absMonth : absMonth, d);
        days.push(d);
      } catch {
        break;
      }
    }
  } catch {
    for (let d = 1; d <= 30; d++) days.push(d);
  }
  return days;
}

/** 获取阴历年份列表 */
export function getLunarYearList(startYear: number, endYear: number): number[] {
  const years: number[] = [];
  try {
    const startLunar = Solar.fromYmd(startYear, 1, 1).getLunar();
    const endLunar = Solar.fromYmd(endYear, 12, 31).getLunar();
    for (let ly = startLunar.getYear(); ly <= endLunar.getYear(); ly++) {
      years.push(ly);
    }
  } catch {
    const added = new Set<number>();
    for (let sy = startYear; sy <= endYear; sy++) {
      try {
        const lunar = Solar.fromYmd(sy, 1, 1).getLunar();
        const ly = lunar.getYear();
        if (!added.has(ly)) {
          added.add(ly);
          years.push(ly);
        }
      } catch {
        // skip
      }
    }
    years.sort((a, b) => a - b);
  }
  return years;
}

/** 阴历转阳历日期字符串 */
export function lunarToSolarDate(lunarYear: number, lunarMonth: number, lunarDay: number): string | null {
  try {
    const isLeap = lunarMonth < 0;
    const absMonth = Math.abs(lunarMonth);
    const lunar = Lunar.fromYmd(lunarYear, isLeap ? -absMonth : absMonth, lunarDay);
    const solar = lunar.getSolar();
    return `${solar.getYear()}-${String(solar.getMonth()).padStart(2, '0')}-${String(solar.getDay()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}
