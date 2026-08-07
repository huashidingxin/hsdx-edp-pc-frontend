<script setup lang="ts">
import type { EchartsUIType } from '@vben/plugins/echarts';

import type {
  BackfillStatsResult,
  DrilldownResult,
  RateCard,
  StatsOverviews,
} from '#/api/core/stats';

import { computed, onMounted, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { DatePicker, Modal, Radio, Select, Table, Tag } from 'antdv-next';

import {
  getStatsDrilldown,
  getStatsOverviews,
  getStatsRates,
  getStatsTrends,
  getTaskBackfillStats,
} from '#/api/core/stats';
import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

const loading = ref(false);
const overviews = ref<null | StatsOverviews>(null);
const rates = ref<null | Record<string, RateCard>>(null);
const trends = ref<null | { times: string[]; values: Array<{ color: string; data: number[]; name: string; }> }>(null);
const trendType = ref('supervision_log');
const backfill = ref<BackfillStatsResult | null>(null);

const rangeOptions = [
  { label: '近一周', value: 'week' },
  { label: '近一月', value: 'month' },
  { label: '近一年', value: 'year' },
];
const range = ref('month');

// 日期范围筛选（用于 rates/overviews，P3-S05）
const dateRange = ref<[string, string] | null>(null);

// 组织（项目）筛选：跟随全局项目，切换项目时页面重挂载自动重新加载
const projectId = computed(() => appStore.defaultProject?.id || undefined);
const projectLabel = computed(() => appStore.defaultProject?.name || '所有项目');

// P3-S02 公司（所属单位）筛选：总公司可汇总分公司
const companyId = ref<number | undefined>(undefined);
const companyOptions = ref<Array<{ label: string; value: number; }>>([]);

async function loadCompanies() {
  try {
    const res = await new Resource('companies').list({ per_page: 'all' });
    companyOptions.value = (res.data || []).map((c: { id: number; name: string }) => ({ value: c.id, label: c.name }));
  } catch {
    companyOptions.value = [];
  }
}

function projectFilterParams() {
  return {
    ...(projectId.value ? { project_id: projectId.value } : {}),
    ...(companyId.value ? { company_id: companyId.value } : {}),
  };
}

const typeMeta = {
  supervision_log: { label: '监理日志', color: '#4f8ef7', icon: '📋' },
  task: { label: '任务', color: '#36cfc9', icon: '✅' },
  nonconformance: { label: '不符合项', color: '#faad14', icon: '⚠️' },
} satisfies Record<string, { color: string; icon: string; label: string; }>;

function dateFilterParams() {
  if (!dateRange.value?.[0] || !dateRange.value?.[1]) return {};
  return { date_from: dateRange.value[0], date_to: dateRange.value[1] };
}

function onDateRangeChange(values: unknown) {
  const arr = values as Array<{ format?: (f: string) => string }> | null;
  if (arr?.length === 2 && arr[0]?.format && arr[1]?.format) {
    dateRange.value = [arr[0].format('YYYY-MM-DD'), arr[1].format('YYYY-MM-DD')];
  } else {
    dateRange.value = null;
  }
  loadAll();
}

// ── 穿透明细 ─────────────────────────────────────────────────────────
const drillOpen = ref(false);
const drillType = ref('');
const drillTitle = ref('');
const drillLoading = ref(false);
const drill = ref<DrilldownResult>({ list: [], total: 0, per_page: 10, current_page: 1, last_page: 1 });
const drillParams = ref<Record<string, unknown>>({});

async function openDrilldown(type: string, title: string, params: Record<string, unknown> = {}) {
  drillType.value = type;
  drillTitle.value = title;
  drillParams.value = params;
  drillOpen.value = true;
  await loadDrilldown(1);
}

async function loadDrilldown(page: number) {
  drillLoading.value = true;
  try {
    const res = await getStatsDrilldown({
      type: drillType.value,
      per_page: 10,
      page,
      ...drillParams.value,
      ...projectFilterParams(),
    });
    drill.value = res;
  } catch (error) {
    console.error(error);
  } finally {
    drillLoading.value = false;
  }
}

const drillColumns = [
  { title: '项目', dataIndex: 'project_name', key: 'project_name' },
  { title: '人员', dataIndex: 'user_name', key: 'user_name' },
  { title: '日期', dataIndex: 'record_date', key: 'record_date' },
  { title: '状态', dataIndex: 'state_label', key: 'state_label' },
];

// ── 加载数据 ──────────────────────────────────────────────────────────
async function loadAll() {
  loading.value = true;
  try {
    const dateParams = dateFilterParams();
    const projectParams = projectFilterParams();
    const [ov, rt] = await Promise.all([
      getStatsOverviews({ ...dateParams, ...projectParams }),
      getStatsRates({ ...dateParams, ...projectParams }),
    ]);
    overviews.value = ov;
    rates.value = rt;
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
  await Promise.all([loadTrends(), loadBackfill()]);
}

async function loadTrends() {
  try {
    trends.value = await getStatsTrends({
      type: trendType.value,
      range: range.value,
      ...projectFilterParams(),
    });
    renderChart();
  } catch (error) {
    console.error(error);
  }
}

async function loadBackfill() {
  try {
    const res = await getTaskBackfillStats({
      scope: 2,
      ...projectFilterParams(),
    });
    if (res && 'total' in res && res.record_type) {
      backfill.value = res as BackfillStatsResult;
    }
  } catch (error) {
    console.error(error);
  }
}

function renderChart() {
  if (!trends.value || !chartRef.value) return;
  const { times, values } = trends.value;
  renderEcharts({
    tooltip: { trigger: 'axis' },
    legend: { data: values.map((v) => v.name), bottom: 0 },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', boundaryGap: false, data: times },
    yAxis: { type: 'value', minInterval: 1 },
    series: values.map((v) => ({
      name: v.name,
      type: 'line',
      smooth: true,
      data: v.data,
      itemStyle: { color: v.color },
    })),
  } as never);
}

const overviewCards = computed(() => {
  const ov = overviews.value as null | StatsOverviews;
  const keys: Array<keyof StatsOverviews> = ['supervision_log', 'task', 'nonconformance'];
  return keys.map((key) => ({
    key: key as string,
    label: typeMeta[key].label,
    color: typeMeta[key].color,
    icon: typeMeta[key].icon,
    today: ov?.[key]?.today ?? 0,
    yesterday: ov?.[key]?.yesterday ?? 0,
    total: ov?.[key]?.total ?? 0,
  }));
});

const backfillByState = computed(() => {
  if (!backfill.value?.by_state?.length) return [];
  const labels: Record<number, string> = { 0: '待审批', 1: '已通过', 2: '已驳回' };
  const colors: Record<number, string> = { 0: 'orange', 1: 'green', 2: 'red' };
  return backfill.value.by_state.map((s) => ({
    state: s.state,
    label: labels[s.state] ?? String(s.state),
    total: s.total,
    color: colors[s.state] ?? 'default',
  }));
});

function ratePercent(card: RateCard, index: number) {
  return card.data?.[index]?.value ?? 0;
}

// ── 项目数据统计（原 stats.vue 合并）─────────────────────────────────
const statsActiveType = ref('supervision_log');

const statsTypes = [
  {
    value: 'supervision_log',
    label: '监理日志',
    columns: [
      { field: 'project.name', title: '项目', minWidth: 200 },
      { field: 'total', title: '应提交数', width: 110 },
      { field: 'normal_log', title: '正常提交数', width: 120 },
      { field: 'timeout_log', title: '超时提交数', width: 120 },
      { field: 'timeout_no_log', title: '超时未提交数', width: 120 },
    ],
  },
  {
    value: 'task',
    label: '任务',
    columns: [
      { field: 'project.name', title: '项目', minWidth: 200 },
      { field: 'total', title: '任务数', width: 110 },
      { field: 'normal_log', title: '正常提交数', width: 120 },
      { field: 'timeout_log', title: '超时提交数', width: 120 },
      { field: 'timeout_no_log', title: '超时未提交数', width: 120 },
    ],
  },
  {
    value: 'nonconformance',
    label: '不符合项',
    columns: [
      { field: 'project.name', title: '项目', minWidth: 200 },
      { field: 'total', title: '总数', width: 100 },
      { field: 'pending', title: '待处理', width: 100 },
      { field: 'processing', title: '处理中', width: 100 },
      { field: 'completed', title: '已完成', width: 100 },
      { field: 'completed_in_7_days', title: '7日内完成', width: 110 },
      { field: 'rate', title: '7日闭合率', width: 100, slots: { default: 'stats_default_rate' } },
    ],
  },
];

const statsGridColumns = ref(statsTypes[0]!.columns);
watch(statsActiveType, (t) => {
  statsGridColumns.value = statsTypes.find((x) => x.value === t)?.columns || [];
});

const statsExtraQuery = computed(() => ({
  type: statsActiveType.value,
  project_id: projectId.value,
  ...dateFilterParams(),
}));

onMounted(() => {
  loadCompanies();
  loadAll();
});
</script>

<template>
  <div class="analytics-page">
    <!-- ── 顶部筛选栏 ────────────────────────────────────── -->
    <div class="filter-bar">
      <div class="filter-left">
        <span class="filter-label">统计范围</span>
        <Tag color="blue" class="!ml-0">{{ projectLabel }}</Tag>
        <span class="filter-hint">跟随顶部全局项目选择</span>
        <Select
          v-model:value="companyId"
          :options="companyOptions"
          allow-clear
          placeholder="所属单位"
          show-search
          option-filter-prop="label"
          class="w-48"
          @change="loadAll"
        />
      </div>
      <DatePicker.RangePicker
        v-model:value="dateRange"
        allow-clear
        class="w-64"
        :placeholder="['开始日期', '结束日期']"
        @change="onDateRangeChange"
      />
    </div>

    <!-- ── 概览指标卡 ────────────────────────────────────── -->
    <div class="overview-grid">
      <div
        v-for="card in overviewCards"
        :key="card.key"
        class="overview-card"
        :class="`overview-card--${card.key}`"
        @click="openDrilldown(card.key, card.label)"
      >
        <div class="overview-card__icon">
          <span>{{ card.icon }}</span>
        </div>
        <div class="overview-card__body">
          <p class="overview-card__label">{{ card.label }}</p>
          <p class="overview-card__total" :style="{ color: card.color }">{{ card.total }}</p>
          <div class="overview-card__meta">
            <span class="meta-item">
              <span class="meta-dot" style="background: #52c41a"></span>
              今日 {{ card.today }}
            </span>
            <span class="meta-item">
              <span class="meta-dot" style="background: #faad14"></span>
              昨日 {{ card.yesterday }}
            </span>
          </div>
        </div>
        <div class="overview-card__trend">
          <svg width="48" height="32" viewBox="0 0 48 32" fill="none">
            <path d="M4 28L16 18L24 22L44 4" :stroke="card.color" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3" />
            <path d="M4 28L16 18L24 22L44 4" :stroke="card.color" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      </div>
    </div>

    <!-- ── 趋势图 + 提交比率 ────────────────────────────── -->
    <div class="chart-section">
      <!-- 数据趋势 -->
      <div class="chart-card">
        <div class="card-header">
          <h3 class="card-title">
            <span class="card-title-icon">📈</span>
            数据趋势
          </h3>
          <div class="card-controls">
            <Select
              v-model:value="trendType"
              class="w-32"
              size="small"
              :options="(Object.keys(typeMeta) as Array<keyof typeof typeMeta>).map((k) => ({ label: typeMeta[k].label, value: k as string }))"
              @change="loadTrends"
            />
            <Select
              v-model:value="range"
              class="w-24"
              size="small"
              :options="rangeOptions"
              @change="loadTrends"
            />
          </div>
        </div>
        <div class="chart-body">
          <EchartsUI v-if="trends" ref="chartRef" height="280px" class="w-full" />
          <div v-else class="chart-empty">
            <div class="chart-empty__icon">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <rect x="8" y="40" width="8" height="16" rx="2" fill="#e6f7ff" />
                <rect x="20" y="32" width="8" height="24" rx="2" fill="#bae7ff" />
                <rect x="32" y="24" width="8" height="32" rx="2" fill="#91d5ff" />
                <rect x="44" y="16" width="8" height="40" rx="2" fill="#69c0ff" />
                <path d="M12 36L24 28L36 20L48 12" stroke="#1890ff" stroke-width="2" stroke-linecap="round" />
              </svg>
            </div>
            <p class="chart-empty__text">暂无趋势数据</p>
            <p class="chart-empty__hint">选择类型和时间范围查看数据趋势</p>
          </div>
        </div>
      </div>

      <!-- 提交比率 -->
      <div class="rate-card">
        <div class="card-header">
          <h3 class="card-title">
            <span class="card-title-icon">📊</span>
            提交比率
          </h3>
        </div>
        <div class="rate-body">
          <template v-if="rates">
            <div v-for="(card, key) in rates" :key="key" class="rate-section">
              <p class="rate-section__title">
                {{ (typeMeta as Record<string, { label: string }>)[key]?.label || key }}
              </p>
              <div v-for="(d, i) in card.data" :key="d.name" class="rate-item">
                <div class="rate-item__header">
                  <span class="rate-item__name">{{ d.name }}</span>
                  <span class="rate-item__value" :style="{ color: d.color || '#4f8ef7' }">{{ ratePercent(card, i) }}%</span>
                </div>
                <div class="rate-item__bar">
                  <div
                    class="rate-item__fill"
                    :style="{ width: `${Math.min(ratePercent(card, i), 100)}%`, background: `linear-gradient(90deg, ${d.color || '#4f8ef7'}88, ${d.color || '#4f8ef7'})` }"
                  ></div>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="rate-empty">
            <div class="rate-empty__icon">📊</div>
            <p class="rate-empty__text">暂无比率数据</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ── 底部三栏 ────────────────────────────────────── -->
    <div class="bottom-grid">
      <!-- 后补任务记录 -->
      <div class="stat-card stat-card--purple" @click="openDrilldown('backfill', '后补任务记录')">
        <div class="stat-card__header">
          <span class="stat-card__icon">📝</span>
          <span class="stat-card__title">后补任务记录</span>
        </div>
        <div class="stat-card__value">{{ backfill?.total ?? 0 }}</div>
        <div class="stat-card__tags">
          <div v-for="s in backfillByState" :key="s.state" class="stat-tag">
            <span class="stat-tag__dot" :style="{ background: s.color === 'orange' ? '#faad14' : s.color === 'green' ? '#52c41a' : '#ff4d4f' }"></span>
            <span class="stat-tag__label">{{ s.label }}</span>
            <span class="stat-tag__value">{{ s.total }}</span>
          </div>
          <div v-if="!backfillByState.length" class="stat-card__empty">暂无后补记录</div>
        </div>
      </div>

      <!-- 待办速览 -->
      <div class="stat-card stat-card--orange">
        <div class="stat-card__header">
          <span class="stat-card__icon">🔔</span>
          <span class="stat-card__title">待办速览</span>
        </div>
        <div class="stat-card__list">
          <div class="stat-list-item">
            <span class="stat-list-item__label">日志待审核</span>
            <span class="stat-list-item__value stat-list-item__value--orange">{{ overviews?.supervision_log.today ?? 0 }}</span>
          </div>
          <div class="stat-list-item">
            <span class="stat-list-item__label">任务总数</span>
            <span class="stat-list-item__value stat-list-item__value--blue">{{ overviews?.task.total ?? 0 }}</span>
          </div>
          <div class="stat-list-item">
            <span class="stat-list-item__label">不符合项总数</span>
            <span class="stat-list-item__value stat-list-item__value--yellow">{{ overviews?.nonconformance.total ?? 0 }}</span>
          </div>
        </div>
      </div>

      <!-- 后补记录按日 -->
      <div class="stat-card stat-card--green">
        <div class="stat-card__header">
          <span class="stat-card__icon">📅</span>
          <span class="stat-card__title">后补记录按日</span>
        </div>
        <div v-if="backfill?.by_date?.length" class="stat-card__scroll">
          <div v-for="d in backfill.by_date.slice().reverse().slice(0, 12)" :key="d.record_date" class="daily-item">
            <span class="daily-item__date">{{ d.record_date }}</span>
            <span class="daily-item__value">{{ d.total }}</span>
          </div>
        </div>
        <div v-else class="stat-card__empty-block">
          <span>📭</span>
          <p>暂无后补记录</p>
        </div>
      </div>
    </div>

    <!-- ── 穿透明细弹窗 ────────────────────────────────── -->
    <Modal
      v-model:open="drillOpen"
      :title="`${drillTitle} · 明细 (${drill.total})`"
      :width="860"
      :footer="null"
    >
      <Table
        :columns="drillColumns"
        :data-source="drill.list"
        :loading="drillLoading"
        :pagination="{
          current: drill.current_page,
          pageSize: drill.per_page,
          total: drill.total,
          onChange: loadDrilldown,
        }"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'project_name'">
            <span class="text-sm">{{ record.project_name || '-' }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'state_label'">
            <Tag color="blue">{{ record.state_label || '-' }}</Tag>
          </template>
        </template>
      </Table>
    </Modal>

    <!-- ── 项目数据统计（原 stats.vue 合并） ────────────── -->
    <div class="stats-table-section">
      <div class="card-header">
        <h3 class="card-title">
          <span class="card-title-icon">📋</span>
          项目数据统计
        </h3>
        <div class="card-controls">
          <Radio.Group
            :value="statsActiveType"
            option-type="button"
            button-style="solid"
            :options="statsTypes.map((t) => ({ label: t.label, value: t.value }))"
            @change="(e: any) => (statsActiveType = e.target.value)"
          />
          <span class="text-xs text-gray-400">日期筛选跟随顶部「日期范围」</span>
        </div>
      </div>
      <AppCrudTable
        api-url="stats/projects"
        permission-name="stats"
        :extra-query="statsExtraQuery"
        :filter-fields="[]"
        :fields="[]"
        :grid-options="{ columns: statsGridColumns, showOverflow: false, columnConfig: { resizable: true } }"
        :toolbar="{ filter: false, create: false, refresh: true }"
        :inline-actions="[]"
        :open-mode="{ detail: 'drawer' }"
      >
        <template #stats_default_rate="{ row }">
          <Tag>{{ row.completed_in_7_days && row.total ? Math.round((row.completed_in_7_days / row.total) * 100) : 0 }}%</Tag>
        </template>
      </AppCrudTable>
    </div>
  </div>
</template>

<style scoped>
/* ── 页面容器 ── */
.analytics-page {
  min-height: 100vh;
  padding: 20px;
  background: #f5f7fa;
}

/* ── 筛选栏 ── */
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  margin-bottom: 20px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 4%);
}

.filter-left {
  display: flex;
  gap: 12px;
  align-items: center;
}

.filter-label {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.filter-hint {
  font-size: 12px;
  color: #999;
}

/* ── 概览指标卡 ── */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.overview-card {
  position: relative;
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 20px;
  overflow: hidden;
  cursor: pointer;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 4%);
  transition: all 0.3s ease;
}

.overview-card::before {
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  content: '';
  border-radius: 4px 0 0 4px;
}

.overview-card--supervision_log::before { background: linear-gradient(180deg, #4f8ef7, #69b1ff); }

.overview-card--task::before { background: linear-gradient(180deg, #36cfc9, #5cdbd3); }

.overview-card--nonconformance::before { background: linear-gradient(180deg, #faad14, #ffc53d); }

.overview-card:hover {
  box-shadow: 0 4px 12px rgb(0 0 0 / 8%);
  transform: translateY(-2px);
}

.overview-card__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  font-size: 24px;
  border-radius: 12px;
}

.overview-card--supervision_log .overview-card__icon { background: linear-gradient(135deg, #e6f7ff, #bae7ff); }

.overview-card--task .overview-card__icon { background: linear-gradient(135deg, #e6fffb, #b5f5ec); }

.overview-card--nonconformance .overview-card__icon { background: linear-gradient(135deg, #fffbe6, #fff1b8); }

.overview-card__body {
  flex: 1;
  min-width: 0;
}

.overview-card__label {
  margin-bottom: 4px;
  font-size: 13px;
  color: #666;
}

.overview-card__total {
  margin-bottom: 6px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.overview-card__meta {
  display: flex;
  gap: 12px;
}

.meta-item {
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 12px;
  color: #999;
}

.meta-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.overview-card__trend {
  flex-shrink: 0;
  opacity: 0.6;
}

/* ── 图表区域 ── */
.chart-section {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.chart-card,
.rate-card {
  overflow: hidden;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 4%);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.card-title {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.card-title-icon {
  font-size: 16px;
}

.card-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.chart-body {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  padding: 20px;
}

.chart-empty {
  padding: 40px;
  text-align: center;
}

.chart-empty__icon {
  margin-bottom: 16px;
  opacity: 0.6;
}

.chart-empty__text {
  margin: 0 0 4px;
  font-size: 14px;
  color: #666;
}

.chart-empty__hint {
  margin: 0;
  font-size: 12px;
  color: #999;
}

/* ── 提交比率 ── */
.rate-body {
  max-height: 320px;
  padding: 16px 20px;
  overflow-y: auto;
}

.rate-section {
  margin-bottom: 16px;
}

.rate-section:last-child {
  margin-bottom: 0;
}

.rate-section__title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.rate-item {
  margin-bottom: 10px;
}

.rate-item:last-child {
  margin-bottom: 0;
}

.rate-item__header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.rate-item__name {
  font-size: 12px;
  color: #666;
}

.rate-item__value {
  font-size: 12px;
  font-weight: 600;
}

.rate-item__bar {
  height: 6px;
  overflow: hidden;
  background: #f0f0f0;
  border-radius: 3px;
}

.rate-item__fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.6s ease;
}

.rate-empty {
  padding: 60px 20px;
  text-align: center;
}

.rate-empty__icon {
  margin-bottom: 12px;
  font-size: 48px;
  opacity: 0.4;
}

.rate-empty__text {
  margin: 0;
  font-size: 13px;
  color: #999;
}

/* ── 底部三栏 ── */
.bottom-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  padding: 20px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 4%);
  transition: all 0.3s ease;
}

.stat-card:hover {
  box-shadow: 0 4px 12px rgb(0 0 0 / 8%);
}

.stat-card--purple { border-left: 4px solid #722ed1; }

.stat-card--orange { border-left: 4px solid #fa8c16; }

.stat-card--green { border-left: 4px solid #52c41a; }

.stat-card__header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.stat-card__icon {
  font-size: 18px;
}

.stat-card__title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.stat-card__value {
  margin-bottom: 16px;
  font-size: 36px;
  font-weight: 700;
  color: #333;
}

.stat-card__tags {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-tag {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.stat-tag__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.stat-tag__label {
  flex: 1;
  color: #666;
}

.stat-tag__value {
  font-weight: 600;
  color: #333;
}

.stat-card__empty {
  padding: 20px;
  font-size: 13px;
  color: #999;
  text-align: center;
}

.stat-card__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 8px;
}

.stat-list-item__label {
  font-size: 13px;
  color: #666;
}

.stat-list-item__value {
  font-size: 18px;
  font-weight: 700;
}

.stat-list-item__value--orange { color: #fa8c16; }

.stat-list-item__value--blue { color: #1890ff; }

.stat-list-item__value--yellow { color: #faad14; }

.stat-list-item__value--green { color: #52c41a; }

.stat-card__scroll {
  max-height: 200px;
  overflow-y: auto;
}

.daily-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
  border-bottom: 1px dashed #f0f0f0;
}

.daily-item:last-child {
  border-bottom: none;
}

.daily-item__date {
  color: #666;
}

.daily-item__value {
  font-weight: 600;
  color: #333;
}

.stat-card__empty-block {
  padding: 40px 20px;
  font-size: 13px;
  color: #999;
  text-align: center;
}

.stat-card__empty-block span {
  display: block;
  margin-bottom: 8px;
  font-size: 32px;
  opacity: 0.5;
}

/* ── 项目数据统计 ── */
.stats-table-section {
  overflow: hidden;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 4%);
}
</style>
