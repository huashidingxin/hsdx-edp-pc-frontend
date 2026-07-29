<template>
  <div class="app-free-date" :class="[className, `app-free-date--${currentPrecision}`]">
    <!-- 合并的输入框 -->
    <div class="app-free-date__input-wrapper" ref="wrapperRef">
      <!-- 年份选择 -->
      <div class="app-free-date__segment" @click="onSegmentClick('year')">
        <div
          class="app-free-date__trigger"
          :class="{
            'is-active': activePanel === 'year',
            'is-empty': !selectedYear,
          }"
        >
          <span class="app-free-date__value">{{ displayYear }}</span>
          <span class="app-free-date__label">年</span>
          <svg class="app-free-date__arrow" :class="{ 'is-rotate': activePanel === 'year' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <button v-if="showYearClear" class="app-free-date__clear" @click.stop="clearYear" title="清除年份">×</button>
        </div>
      </div>

      <!-- 月份选择 -->
      <div class="app-free-date__segment" @click="onSegmentClick('month')">
        <div
          class="app-free-date__trigger"
          :class="{
            'is-active': activePanel === 'month',
            'is-disabled': !canSelectMonth,
            'is-empty': !selectedMonth,
          }"
        >
          <span class="app-free-date__value">{{ displayMonth }}</span>
          <span class="app-free-date__label">月</span>
          <svg class="app-free-date__arrow" :class="{ 'is-rotate': activePanel === 'month' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <button v-if="showMonthClear" class="app-free-date__clear" @click.stop="clearMonth" title="清除月份">×</button>
        </div>
      </div>

      <!-- 日期选择 -->
      <div class="app-free-date__segment" @click="onSegmentClick('day')">
        <div
          class="app-free-date__trigger"
          :class="{
            'is-active': activePanel === 'day',
            'is-disabled': !canSelectDay,
            'is-empty': !selectedDay,
          }"
        >
          <span class="app-free-date__value">{{ displayDay }}</span>
          <span class="app-free-date__label">日</span>
          <svg class="app-free-date__arrow" :class="{ 'is-rotate': activePanel === 'day' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <button v-if="showDayClear" class="app-free-date__clear" @click.stop="clearDay" title="清除日期">×</button>
        </div>
      </div>
    </div>

    <!-- 农历显示 -->
    <div v-if="displayLunar" class="app-free-date__lunar">{{ displayLunar }}</div>

    <!-- 使用 Teleport 将弹出层渲染到 body -->
    <Teleport to="body">
      <!-- 遮罩层 -->
      <div v-if="activePanel" class="app-free-date__overlay" @mousedown.prevent="closePanel"></div>

      <!-- 年份面板 -->
      <div
        v-show="activePanel === 'year'"
        ref="yearPanelRef"
        class="app-free-date__panel app-free-date__panel--year"
        :style="panelStyle"
      >
        <div class="app-free-date__panel-header">
          <button class="app-free-date__nav-btn" @click="prevYearRange">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <span class="app-free-date__panel-title">
            <template v-if="calendarType === 'solar'">{{ yearRange[0] }} - {{ yearRange[yearRange.length - 1] }}</template>
            <template v-else>{{ getLunarYearGanZhi(currentLunarYearRange[0] ?? 0) }} - {{ getLunarYearGanZhi(currentLunarYearRange[currentLunarYearRange.length - 1] ?? 0) }}</template>
          </span>
          <button class="app-free-date__nav-btn" @click="nextYearRange">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
          </button>
          <!-- 阴历/阳历切换 -->
          <div v-if="props.showLunarToggle" class="app-free-date__switch" @click="toggleCalendarType">
            <span class="app-free-date__switch-option" :class="{ 'is-active': calendarType === 'lunar' }">阴历</span>
            <span class="app-free-date__switch-option" :class="{ 'is-active': calendarType === 'solar' }">阳历</span>
          </div>
        </div>
        <!-- 阳历模式 -->
        <div v-if="calendarType === 'solar'" class="app-free-date__grid app-free-date__grid--6cols">
          <div
            v-for="year in yearRange"
            :key="year"
            class="app-free-date__grid-item"
            :class="{ 'is-selected': year === selectedYear }"
            @click="selectYear(year)"
          >
            <span class="app-free-date__grid-main">{{ year }}</span>
            <span class="app-free-date__grid-sub">{{ getYearGanZhi(year) }}</span>
            <span class="app-free-date__grid-sub">{{ getYearShengXiao(year) }}</span>
          </div>
        </div>
        <!-- 阴历模式 -->
        <div v-else class="app-free-date__grid app-free-date__grid--6cols">
          <div
            v-for="ly in currentLunarYearRange"
            :key="ly"
            class="app-free-date__grid-item"
            :class="{ 'is-selected': ly === selectedLunarYear }"
            @click="selectLunarYear(ly)"
          >
            <span class="app-free-date__grid-main">{{ getLunarYearName(ly) }}</span>
            <span class="app-free-date__grid-sub">{{ getLunarYearGanZhi(ly) }}</span>
            <span class="app-free-date__grid-sub">{{ getLunarYearShengXiao(ly) }}</span>
          </div>
        </div>
      </div>

      <!-- 月份面板 -->
      <div
        v-show="activePanel === 'month'"
        ref="monthPanelRef"
        class="app-free-date__panel app-free-date__panel--month"
        :style="panelStyle"
      >
        <div class="app-free-date__panel-header">
          <button class="app-free-date__nav-btn" @click="openPanel('year')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <span class="app-free-date__panel-title">
            <template v-if="calendarType === 'solar'">{{ selectedYear || browseYear }}年</template>
            <template v-else>{{ getLunarYearName(selectedLunarYear) }}</template>
          </span>
          <button class="app-free-date__nav-btn" @click="closePanel">
            <span class="app-free-date__nav-close">✕</span>
          </button>
          <!-- 阴历/阳历切换 -->
          <div v-if="props.showLunarToggle" class="app-free-date__switch" @click="toggleCalendarType">
            <span class="app-free-date__switch-option" :class="{ 'is-active': calendarType === 'lunar' }">阴历</span>
            <span class="app-free-date__switch-option" :class="{ 'is-active': calendarType === 'solar' }">阳历</span>
          </div>
        </div>
        <!-- 阳历模式 -->
        <div v-if="calendarType === 'solar'" class="app-free-date__grid app-free-date__grid--6cols">
          <div
            v-for="month in 12"
            :key="month"
            class="app-free-date__grid-item"
            :class="{ 'is-selected': selectedYear > 0 && month === selectedMonth }"
            @click="selectMonth(month)"
          >
            <span class="app-free-date__grid-main">{{ month }}月</span>
            <span class="app-free-date__grid-sub">{{ getMonthGanZhi(selectedYear || browseYear, month) }}</span>
            <span class="app-free-date__grid-sub">{{ getLunarMonthUtil(selectedYear || browseYear, month) }}</span>
          </div>
        </div>
        <!-- 阴历模式 -->
        <div v-else class="app-free-date__grid app-free-date__grid--6cols">
          <div
            v-for="lm in lunarMonths"
            :key="lm.month"
            class="app-free-date__grid-item"
            :class="{ 'is-selected': lm.month === selectedLunarMonth }"
            @click="selectLunarMonth(lm.month)"
          >
            <span class="app-free-date__grid-main">{{ lm.name }}</span>
            <span class="app-free-date__grid-sub">{{ getLunarMonthGanZhi(selectedLunarYear, lm.month) }}</span>
            <span class="app-free-date__grid-sub">{{ getLunarMonthSolar(selectedLunarYear, lm.month) }}</span>
          </div>
        </div>
      </div>

      <!-- 日期面板 -->
      <div
        v-show="activePanel === 'day'"
        ref="dayPanelRef"
        class="app-free-date__panel app-free-date__panel--day"
        :style="panelStyle"
      >
        <div class="app-free-date__panel-header">
          <button class="app-free-date__nav-btn" @click="openPanel('month')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <span class="app-free-date__panel-title">
            <template v-if="calendarType === 'solar'">{{ selectedYear }}年{{ selectedMonth }}月</template>
            <template v-else>{{ getLunarYearName(selectedLunarYear) }}{{ getLunarMonthName(selectedLunarYear, selectedLunarMonth) }}</template>
          </span>
          <button class="app-free-date__nav-btn" @click="closePanel">
            <span class="app-free-date__nav-close">✕</span>
          </button>
          <!-- 阴历/阳历切换 -->
          <div v-if="props.showLunarToggle" class="app-free-date__switch" @click="toggleCalendarType">
            <span class="app-free-date__switch-option" :class="{ 'is-active': calendarType === 'lunar' }">阴历</span>
            <span class="app-free-date__switch-option" :class="{ 'is-active': calendarType === 'solar' }">阳历</span>
          </div>
        </div>
        <!-- 阳历模式 -->
        <div v-if="calendarType === 'solar'" class="app-free-date__grid app-free-date__grid--7cols">
          <div
            v-for="(day, index) in daysInMonth"
            :key="day"
            class="app-free-date__grid-item"
            :class="{ 'is-selected': selectedDay > 0 && day === selectedDay }"
            @click="selectDay(day)"
          >
            <span class="app-free-date__grid-main">{{ shouldShowConstellation(index, day) ? getSolarConstellation(selectedYear, selectedMonth, day) : day }}</span>
            <span class="app-free-date__grid-sub">{{ getLunarDayUtil(selectedYear, selectedMonth, day) }}</span>
          </div>
        </div>
        <!-- 阴历模式 -->
        <div v-else class="app-free-date__grid app-free-date__grid--7cols">
          <div
            v-for="day in lunarDays"
            :key="day"
            class="app-free-date__grid-item"
            :class="{ 'is-selected': day === selectedLunarDay }"
            @click="selectLunarDay(day)"
          >
            <span class="app-free-date__grid-main">{{ getLunarDayName(selectedLunarYear, selectedLunarMonth, day) }}</span>
            <span class="app-free-date__grid-sub" :class="{ 'is-jieqi': !!getLunarDayJieQi(selectedLunarYear, selectedLunarMonth, day) }">{{ getLunarDayJieQi(selectedLunarYear, selectedLunarMonth, day) || getLunarDaySolar(selectedLunarYear, selectedLunarMonth, day) }}</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';

import dayjs from 'dayjs';
import { Lunar, Solar } from 'lunar-javascript';
import type { CalendarType, FreeDateChangePayload, FreeDatePrecision } from './types';
import {
  formatLunarDisplay,
  getLunarDayJieQi,
  getLunarDayName,
  getLunarDaySolar,
  getLunarDays,
  getLunarMonthGanZhi,
  getLunarMonthName,
  getLunarMonthSolar,
  getLunarMonths,
  getLunarYearGanZhi,
  getLunarYearList,
  getLunarYearName,
  getLunarYearShengXiao,
  getLunarDay as getLunarDayUtil,
  getLunarMonth as getLunarMonthUtil,
  getMonthGanZhi,
  getSolarConstellation,
  getYearGanZhi,
  getYearShengXiao,
  lunarToSolarDate,
} from './useLunar';

export type { FreeDatePrecision, FreeDateChangePayload, CalendarType } from './types';

interface Props {
  modelValue?: string | null;
  precision?: FreeDatePrecision;
  className?: string;
  startYear?: number;
  endYear?: number;
  yearPanelNumber?: number;
  showLunarToggle?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  precision: 'date',
  className: '',
  startYear: 1940,
  endYear: 2100,
  yearPanelNumber: 30,
  showLunarToggle: true,
});

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  change: [payload: FreeDateChangePayload];
  'update:precision': [value: FreeDatePrecision];
}>();

// ============ 状态 ============

/** 日历类型 */
const calendarType = ref<CalendarType>('solar');

const currentPrecision = ref<FreeDatePrecision>(props.precision);

// 阳历选择数据
const selectedYear = ref<number>(0);
const selectedMonth = ref<number>(0);
const selectedDay = ref<number>(0);

// 阴历选择数据
const selectedLunarYear = ref<number>(0);
const selectedLunarMonth = ref<number>(0); // 负数表示闰月
const selectedLunarDay = ref<number>(0);

// 年份面板浏览基准年
const browseYear = ref<number>(dayjs().year());
const lunarBrowseYear = ref<number>(2024);

/** 面板显示状态 */
const activePanel = ref<'year' | 'month' | 'day' | null>(null);

// DOM refs
const wrapperRef = ref<HTMLElement>();
const yearPanelRef = ref<HTMLElement>();
const monthPanelRef = ref<HTMLElement>();
const dayPanelRef = ref<HTMLElement>();

// 面板定位
const panelLeft = ref('0px');
const panelTop = ref('0px');
const panelPlacement = ref<'bottom' | 'top'>('bottom');

const panelStyle = computed(() => ({
  position: 'fixed' as const,
  left: panelLeft.value,
  top: panelTop.value,
  zIndex: 9999,
}));

// ============ 计算属性 ============

const canSelectMonth = computed(() => selectedYear.value > 0);
const canSelectDay = computed(() => selectedYear.value > 0 && selectedMonth.value > 0);

const showYearClear = computed(() => selectedYear.value > 0);
const showMonthClear = computed(() => currentPrecision.value !== 'year' && selectedYear.value > 0 && selectedMonth.value > 0);
const showDayClear = computed(() => currentPrecision.value === 'date' && selectedMonth.value > 0 && selectedDay.value > 0);

const displayYear = computed(() => selectedYear.value > 0 ? String(selectedYear.value) : '--');
const displayMonth = computed(() => selectedMonth.value > 0 ? String(selectedMonth.value).padStart(2, '0') : '--');
const displayDay = computed(() => selectedDay.value > 0 ? String(selectedDay.value).padStart(2, '0') : '--');

/** 农历显示文本 */
const displayLunar = computed(() => {
  if (!selectedYear.value) return '';

  if (calendarType.value === 'lunar') {
    return formatSelectedLunarDisplay();
  }

  try {
    const m = selectedMonth.value || 1;
    const d = selectedDay.value || 1;
    const solar = Solar.fromYmd(selectedYear.value, m, d);
    return formatLunarDisplay(solar.getLunar(), currentPrecision.value);
  } catch {
    return '';
  }
});

/** 阳历年份范围 */
const yearRange = computed(() => {
  const rangeStart = Math.floor(browseYear.value / props.yearPanelNumber) * props.yearPanelNumber;
  const years: number[] = [];
  for (let i = 0; i < props.yearPanelNumber; i++) {
    const year = rangeStart + i;
    if (year >= props.startYear && year <= props.endYear) years.push(year);
  }
  return years;
});

/** 阴历年份列表（全部） */
const lunarYearList = computed(() => getLunarYearList(props.startYear, props.endYear));

/** 当前浏览的阴历年范围 */
const currentLunarYearRange = computed(() => {
  const start = Math.floor(lunarBrowseYear.value / props.yearPanelNumber) * props.yearPanelNumber;
  const years: number[] = [];
  const minYear = Math.min(...lunarYearList.value);
  const maxYear = Math.max(...lunarYearList.value);
  for (let i = 0; i < props.yearPanelNumber; i++) {
    const year = start + i;
    if (year >= minYear && year <= maxYear) years.push(year);
  }
  return years;
});

/** 阴历月份列表 */
const lunarMonths = computed(() => {
  if (selectedLunarYear.value === 0) return [];
  return getLunarMonths(selectedLunarYear.value);
});

/** 阴历日期天数 */
const lunarDays = computed(() => {
  if (selectedLunarYear.value === 0 || selectedLunarMonth.value === 0) return [];
  return getLunarDays(selectedLunarYear.value, selectedLunarMonth.value);
});

/** 当月天数（阳历） */
const daysInMonth = computed(() => {
  if (!selectedMonth.value || selectedMonth.value === 0) return 31;
  const year = selectedYear.value > 0 ? selectedYear.value : browseYear.value;
  return dayjs(`${year}-${String(selectedMonth.value).padStart(2, '0')}-01`).daysInMonth();
});

// ============ 面板定位 ============

function getEstimatedPanelHeight(panel: 'year' | 'month' | 'day'): number {
  return panel === 'day' ? 320 : 260;
}

function updatePanelPosition(panel: 'year' | 'month' | 'day') {
  if (!wrapperRef.value) return;

  const rect = wrapperRef.value.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const estimatedH = getEstimatedPanelHeight(panel);
  const gap = 8;

  const spaceBelow = viewportH - rect.bottom - gap;
  const spaceAbove = rect.top - gap;

  if (spaceBelow >= estimatedH || spaceBelow >= spaceAbove) {
    panelPlacement.value = 'bottom';
    panelTop.value = `${rect.bottom + gap}px`;
  } else {
    panelPlacement.value = 'top';
    panelTop.value = `${rect.top - gap - estimatedH}px`;
  }

  panelLeft.value = `${Math.max(8, Math.min(rect.left, window.innerWidth - 400))}px`;

  nextTick(() => {
    const panelRef = panel === 'year' ? yearPanelRef.value
      : panel === 'month' ? monthPanelRef.value
      : dayPanelRef.value;
    if (panelPlacement.value === 'top' && panelRef) {
      panelTop.value = `${rect.top - gap - panelRef.offsetHeight}px`;
    }
  });
}

// ============ 面板操作 ============

function openPanel(panel: 'year' | 'month' | 'day') {
  if (panel === 'year') {
    browseYear.value = selectedYear.value > 0 ? selectedYear.value : dayjs().year();
    if (selectedLunarYear.value > 0) lunarBrowseYear.value = selectedLunarYear.value;
  }
  activePanel.value = panel;
  nextTick(() => updatePanelPosition(panel));
}

function closePanel() {
  activePanel.value = null;
}

function onSegmentClick(segment: 'year' | 'month' | 'day') {
  if (segment === 'month' && !canSelectMonth.value) return;
  if (segment === 'day' && !canSelectDay.value) return;

  if (segment === 'year') {
    return activePanel.value === 'year' ? closePanel() : openPanel('year');
  }

  if (segment === 'month') {
    if (!selectedYear.value || selectedYear.value === 0) {
      return activePanel.value === 'year' ? closePanel() : openPanel('year');
    }
    return activePanel.value === 'month' ? closePanel() : openPanel('month');
  }

  // segment === 'day'
  if (!selectedYear.value || selectedYear.value === 0) {
    return activePanel.value === 'year' ? closePanel() : openPanel('year');
  }
  if (!selectedMonth.value || selectedMonth.value === 0) {
    return activePanel.value === 'month' ? closePanel() : openPanel('month');
  }
  return activePanel.value === 'day' ? closePanel() : openPanel('day');
}

function prevYearRange() {
  if (calendarType.value === 'solar') {
    const newYear = browseYear.value - props.yearPanelNumber;
    if (newYear >= props.startYear) browseYear.value = newYear;
  } else {
    const newYear = lunarBrowseYear.value - props.yearPanelNumber;
    if (newYear >= Math.min(...lunarYearList.value)) lunarBrowseYear.value = newYear;
  }
}

function nextYearRange() {
  if (calendarType.value === 'solar') {
    const newYear = browseYear.value + props.yearPanelNumber;
    if (newYear <= props.endYear) browseYear.value = newYear;
  } else {
    const newYear = lunarBrowseYear.value + props.yearPanelNumber;
    if (newYear <= Math.max(...lunarYearList.value)) lunarBrowseYear.value = newYear;
  }
}

// 切换阴历/阳历
function toggleCalendarType() {
  calendarType.value = calendarType.value === 'solar' ? 'lunar' : 'solar';
}

// ============ 选择 ============

function selectYear(year: number) {
  selectedYear.value = year;
  selectedMonth.value = 0;
  selectedDay.value = 0;
  browseYear.value = year;

  currentPrecision.value = 'year';
  emit('update:precision', 'year');
  emitChange();

  openPanel('month');
}

function selectLunarYear(lunarYear: number) {
  selectedLunarYear.value = lunarYear;
  lunarBrowseYear.value = lunarYear;

  try {
    const lunar = Lunar.fromYmd(lunarYear, 1, 1);
    const solar = lunar.getSolar();
    selectedYear.value = solar.getYear();
  } catch {
    // ignore
  }

  selectedMonth.value = 0;
  selectedDay.value = 0;
  selectedLunarMonth.value = 0;
  selectedLunarDay.value = 0;

  currentPrecision.value = 'year';
  emit('update:precision', 'year');
  emitChange();

  openPanel('month');
}

function selectMonth(month: number) {
  if (!selectedYear.value || selectedYear.value === 0) {
    selectedYear.value = browseYear.value;
  }

  selectedMonth.value = month;
  selectedDay.value = 0;

  currentPrecision.value = 'month';
  emit('update:precision', 'month');
  emitChange();

  openPanel('day');
}

function selectLunarMonth(lunarMonth: number) {
  selectedLunarMonth.value = lunarMonth;

  try {
    const lunar = Lunar.fromYmd(selectedLunarYear.value, lunarMonth, 1);
    const solar = lunar.getSolar();
    selectedYear.value = solar.getYear();
    selectedMonth.value = solar.getMonth();
  } catch {
    // ignore
  }

  selectedDay.value = 0;
  selectedLunarDay.value = 0;

  currentPrecision.value = 'month';
  emit('update:precision', 'month');
  emitChange();

  openPanel('day');
}

function selectDay(day: number) {
  selectedDay.value = day;

  currentPrecision.value = 'date';
  emit('update:precision', 'date');
  emitChange();

  closePanel();
}

function selectLunarDay(lunarDay: number) {
  selectedLunarDay.value = lunarDay;

  try {
    const lunar = Lunar.fromYmd(selectedLunarYear.value, selectedLunarMonth.value, lunarDay);
    const solar = lunar.getSolar();
    selectedYear.value = solar.getYear();
    selectedMonth.value = solar.getMonth();
    selectedDay.value = solar.getDay();

    currentPrecision.value = 'date';
    emit('update:precision', 'date');
    emitChange();
    closePanel();
  } catch {
    // ignore
  }
}

// ============ 清除 ============

function clearYear() {
  selectedYear.value = 0;
  selectedMonth.value = 0;
  selectedDay.value = 0;
  selectedLunarYear.value = 0;
  selectedLunarMonth.value = 0;
  selectedLunarDay.value = 0;
  currentPrecision.value = props.precision;
  emit('update:precision', props.precision);
  emit('update:modelValue', null);
}

function clearMonth() {
  selectedMonth.value = 0;
  selectedDay.value = 0;
  selectedLunarMonth.value = 0;
  selectedLunarDay.value = 0;
  currentPrecision.value = 'year';
  emit('update:precision', 'year');
  emitChange();
}

function clearDay() {
  selectedDay.value = 0;
  selectedLunarDay.value = 0;
  currentPrecision.value = 'month';
  emit('update:precision', 'month');
  emitChange();
}

// ============ 值解析 & 格式化 ============

function parseDateValue(value: string | null) {
  if (!value) {
    selectedYear.value = 0;
    selectedMonth.value = 0;
    selectedDay.value = 0;
    selectedLunarYear.value = 0;
    selectedLunarMonth.value = 0;
    selectedLunarDay.value = 0;
    return;
  }

  const date = dayjs(value);
  if (!date.isValid()) return;

  const dateYear = date.year();
  const dateMonth = date.month() + 1;
  const dateDay = date.date();

  selectedYear.value = dateYear;
  browseYear.value = dateYear;

  const parts = value.split('-');
  selectedMonth.value = (currentPrecision.value === 'month' || currentPrecision.value === 'date') && parts.length >= 2
    ? dateMonth : 0;
  selectedDay.value = currentPrecision.value === 'date' && parts.length >= 3
    ? dateDay : 0;

  // 同步阴历日期
  try {
    const solar = Solar.fromYmd(dateYear, dateMonth, dateDay);
    const lunar = solar.getLunar();
    selectedLunarYear.value = lunar.getYear();
    selectedLunarMonth.value = (currentPrecision.value === 'month' || currentPrecision.value === 'date') && parts.length >= 2
      ? lunar.getMonth() : 0;
    selectedLunarDay.value = currentPrecision.value === 'date' && parts.length >= 3
      ? lunar.getDay() : 0;
  } catch {
    // ignore
  }
}

function formatDateByPrecision(): string | null {
  if (calendarType.value === 'lunar' && selectedLunarYear.value > 0) {
    return formatLunarDateByPrecision();
  }

  const year = selectedYear.value;
  const month = selectedMonth.value;
  const day = selectedDay.value;

  if (!year || year === 0) return null;

  if (currentPrecision.value === 'year') {
    return `${year}-01-01`;
  }
  if (currentPrecision.value === 'month') {
    if (!month || month === 0) return `${year}-01-01`;
    return `${year}-${String(month).padStart(2, '0')}-01`;
  }
  if (!month || !day || month === 0 || day === 0) return `${year}-01-01`;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatLunarDateByPrecision(): string | null {
  if (currentPrecision.value === 'year') {
    return lunarToSolarDate(selectedLunarYear.value, 1, 1);
  }
  if (currentPrecision.value === 'month') {
    if (!selectedLunarMonth.value || selectedLunarMonth.value === 0) {
      return lunarToSolarDate(selectedLunarYear.value, 1, 1);
    }
    return lunarToSolarDate(selectedLunarYear.value, selectedLunarMonth.value, 1);
  }
  if (!selectedLunarMonth.value || !selectedLunarDay.value || selectedLunarMonth.value === 0 || selectedLunarDay.value === 0) {
    return lunarToSolarDate(selectedLunarYear.value, 1, 1);
  }
  return lunarToSolarDate(selectedLunarYear.value, selectedLunarMonth.value, selectedLunarDay.value);
}

function formatSelectedLunarDisplay(): string {
  if (!selectedLunarYear.value) return '';

  try {
    const month = selectedLunarMonth.value || 1;
    const day = selectedLunarDay.value || 1;
    const lunar = Lunar.fromYmd(selectedLunarYear.value, month, day);
    return formatLunarDisplay(lunar, currentPrecision.value);
  } catch {
    return '';
  }
}

function emitChange() {
  const value = formatDateByPrecision();
  if (value) {
    emit('update:modelValue', value);
    emit('change', { value, precision: currentPrecision.value });
  }
}

// ============ 星座显示逻辑 ============

let prevConstellation = '';

function shouldShowConstellation(index: number, day: number): boolean {
  if (index === 0) prevConstellation = '';
  const current = getSolarConstellation(selectedYear.value, selectedMonth.value, day);
  if (prevConstellation === '' || prevConstellation !== current) {
    prevConstellation = current;
    return true;
  }
  prevConstellation = current;
  return false;
}

// ============ 全局事件 ============

function handleScrollUpdate() {
  if (activePanel.value) updatePanelPosition(activePanel.value);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && activePanel.value) closePanel();
}

// ============ 监听 ============

watch(() => props.modelValue, parseDateValue, { immediate: true });

watch(
  () => props.precision,
  (val) => {
    currentPrecision.value = val;
    if (val === 'year') {
      selectedMonth.value = 0;
      selectedDay.value = 0;
    } else if (val === 'month') {
      selectedDay.value = 0;
    }
  },
);

onMounted(() => {
  document.addEventListener('scroll', handleScrollUpdate, true);
  window.addEventListener('resize', handleScrollUpdate);
  document.addEventListener('keydown', handleKeydown);
  parseDateValue(props.modelValue);
});

onUnmounted(() => {
  document.removeEventListener('scroll', handleScrollUpdate, true);
  window.removeEventListener('resize', handleScrollUpdate);
  document.removeEventListener('keydown', handleKeydown);
  closePanel();
});
</script>

<style scoped>
/* 输入框区域样式 */
.app-free-date {
  @apply inline-flex flex-col;
}

.app-free-date__input-wrapper {
  @apply relative inline-flex items-center;
  @apply border border-gray-300 rounded-md overflow-hidden;
  @apply hover:border-blue-500;
  @apply transition-colors duration-200;
  @apply bg-white;
}

.app-free-date__input-wrapper:focus-within {
  @apply border-blue-500;
  @apply ring-2 ring-blue-500/20;
}

.app-free-date__segment {
  @apply relative;
  @apply border-r border-gray-200;
  @apply cursor-pointer;
  @apply select-none;
}

.app-free-date__segment:last-of-type {
  @apply border-r-0;
}

.app-free-date__trigger {
  @apply inline-flex items-center gap-1 px-3 py-2;
  @apply transition-colors duration-200;
  @apply bg-white;
}

.app-free-date__segment:hover .app-free-date__trigger:not(.is-disabled) {
  @apply bg-gray-50;
}

.app-free-date__trigger.is-active {
  @apply bg-blue-50;
}

.app-free-date__trigger.is-disabled {
  @apply opacity-30 cursor-not-allowed;
}

.app-free-date__trigger.is-disabled .app-free-date__value,
.app-free-date__trigger.is-disabled .app-free-date__label,
.app-free-date__trigger.is-disabled .app-free-date__arrow {
  @apply text-gray-300;
}

.app-free-date__trigger.is-empty .app-free-date__value {
  @apply text-gray-400;
}

.app-free-date__value {
  @apply text-base font-medium text-gray-900;
}

.app-free-date__label {
  @apply text-sm text-gray-500;
}

.app-free-date__arrow {
  @apply w-4 h-4 text-gray-400;
  @apply transition-transform duration-200;
}

.app-free-date__arrow.is-rotate {
  @apply transform rotate-180;
}

.app-free-date__clear {
  @apply ml-1 w-4 h-4;
  @apply flex items-center justify-center;
  @apply text-gray-400 hover:text-red-500;
  @apply text-sm leading-none;
  @apply rounded-full;
  @apply hover:bg-red-50;
  @apply transition-colors duration-150;
  @apply cursor-pointer;
  @apply bg-transparent border-none;
  @apply p-0;
}

/* 农历显示 */
.app-free-date__lunar {
  @apply mt-1 text-xs text-gray-500 select-none tracking-wide;
}
</style>

<!-- Teleport 渲染到 body，样式必须全局生效 -->
<style>
.app-free-date__overlay {
  @apply fixed inset-0;
  @apply z-[9998];
}

.app-free-date__panel {
  @apply bg-white rounded-lg shadow-2xl;
  @apply border border-gray-200;
  @apply p-3;
  @apply max-h-[70vh] overflow-y-auto;
}

.app-free-date__panel--year {
  @apply min-w-[420px];
}

.app-free-date__panel--month {
  @apply min-w-[320px];
}

.app-free-date__panel--day {
  @apply min-w-[380px];
}

.app-free-date__panel-header {
  @apply flex items-center justify-between mb-3;
  @apply pb-2 border-b border-gray-100;
  @apply gap-2;
}

.app-free-date__panel-title {
  @apply text-sm font-medium text-gray-900;
  @apply flex-1 text-center;
}

.app-free-date__nav-btn {
  @apply w-8 h-8;
  @apply flex items-center justify-center;
  @apply bg-gray-100 hover:bg-gray-200;
  @apply rounded-full;
  @apply transition-colors duration-150;
  @apply cursor-pointer;
  @apply border-none;
  @apply p-0;
  @apply shrink-0;
}

.app-free-date__nav-btn svg {
  @apply w-4 h-4;
  @apply text-gray-600;
}

.app-free-date__nav-close {
  @apply text-sm text-gray-600 font-bold;
}

/* 阴历/阳历切换开关 */
.app-free-date__switch {
  @apply flex;
  @apply ml-2;
  @apply rounded-full overflow-hidden;
  @apply border border-gray-300;
  @apply shrink-0;
  @apply cursor-pointer;
}

.app-free-date__switch-option {
  @apply px-3 py-1;
  @apply text-xs;
  @apply text-gray-500;
  @apply bg-gray-50;
  @apply transition-all duration-150;
}

.app-free-date__switch-option.is-active {
  @apply text-white bg-blue-500;
  @apply font-medium;
}

.app-free-date__grid--6cols {
  @apply grid grid-cols-6 gap-1;
}

.app-free-date__grid--7cols {
  @apply grid grid-cols-7 gap-1;
}

.app-free-date__grid-item {
  @apply flex flex-col items-center;
  @apply px-1 py-2;
  @apply rounded-md;
  @apply cursor-pointer;
  @apply hover:bg-blue-50;
  @apply transition-colors duration-150;
}

.app-free-date__grid-item.is-selected {
  @apply bg-blue-500 text-white;
  @apply hover:bg-blue-600;
}

.app-free-date__grid-item.is-selected .app-free-date__grid-sub {
  @apply text-blue-100;
}

.app-free-date__grid-main {
  @apply text-sm font-medium;
}

.app-free-date__grid-sub {
  @apply text-xs text-gray-500;
  @apply mt-0.5;
}

.app-free-date__grid-sub.is-jieqi {
  @apply text-blue-500;
}

.app-free-date__grid-item.is-selected .app-free-date__grid-sub.is-jieqi {
  @apply text-blue-200;
}
</style>
