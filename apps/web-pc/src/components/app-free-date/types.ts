/** 日期精度：年 / 月 / 日 */
export type FreeDatePrecision = 'year' | 'month' | 'date';

/** 日历类型：阳历 / 阴历 */
export type CalendarType = 'solar' | 'lunar';

/** 组件 Props */
export interface FreeDateProps {
  /** 绑定值，格式 YYYY-MM-DD（精度不足部分补 01） */
  modelValue?: string | null;
  /** 日期精度，默认 date */
  precision?: FreeDatePrecision;
  /** 自定义 class */
  className?: string;
  /** 可选起始年份 */
  startYear?: number;
  /** 可选截止年份 */
  endYear?: number;
  /** 年份面板每页显示数量，默认 30 */
  yearPanelNumber?: number;
  /** 是否显示阴历/阳历切换按钮，默认 true */
  showLunarToggle?: boolean;
}

/** change 事件载荷 */
export interface FreeDateChangePayload {
  value: string;
  precision: FreeDatePrecision;
}
