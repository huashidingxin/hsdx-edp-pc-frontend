declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    getLunar(): Lunar;
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getXingZuo(): string;
  }

  export class JieQi {
    getName(): string;
  }

  export class Lunar {
    static fromYmd(year: number, month: number, day: number): Lunar;
    getSolar(): Solar;
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getYearInGanZhi(): string;
    getYearInChinese(): string;
    getYearShengXiao(): string;
    getMonthInGanZhi(): string;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    getCurrentJieQi(): JieQi | null;
    getJieQi(): string;
  }
}
