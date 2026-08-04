<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { Card, Col, DatePicker, Empty, Modal, Row, Select, Table, Tag } from 'antdv-next';

import type {
  BackfillStatsResult,
  DrilldownResult,
  RateCard,
  StatsOverviews,
} from '#/api/core/stats';
import {
  getStatsDrilldown,
  getStatsOverviews,
  getStatsRates,
  getStatsTrends,
  getTaskBackfillStats,
} from '#/api/core/stats';
import { EchartsUI, type EchartsUIType, useEcharts } from '@vben/plugins/echarts';

import { useAppStore } from '#/store';

const appStore = useAppStore();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

const loading = ref(false);
const overviews = ref<StatsOverviews | null>(null);
const rates = ref<Record<string, RateCard> | null>(null);
const trends = ref<{ times: string[]; values: Array<{ name: string; color: string; data: number[] }> } | null>(null);
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

function projectFilterParams() {
  return projectId.value ? { project_id: projectId.value } : {};
}

const typeMeta = {
  supervision_log: { label: '监理日志', color: '#5ab1ef' },
  task: { label: '任务', color: '#36cfc9' },
  nonconformance: { label: '不符合项', color: '#ffa940' },
  issue: { label: '问题', color: '#73d13d' },
} satisfies Record<string, { label: string; color: string }>;

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
  } catch (e) {
    console.error(e);
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
  } catch (e) {
    console.error(e);
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
  } catch (e) {
    console.error(e);
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
  } catch (e) {
    console.error(e);
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
  const ov = overviews.value as StatsOverviews | null;
  if (!ov) return [] as Array<{ key: string; label: string; color: string; today: number; yesterday: number; total: number }>;
  const keys: Array<keyof StatsOverviews> = ['supervision_log', 'task', 'nonconformance', 'issue'];
  return keys.map((key) => ({
    key: key as string,
    label: typeMeta[key].label,
    color: typeMeta[key].color,
    today: ov[key].today,
    yesterday: ov[key].yesterday,
    total: ov[key].total,
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

onMounted(loadAll);
</script>

<template>
  <div class="p-4">
    <div class="mb-4 flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-600">统计范围</span>
        <Tag color="blue">{{ projectLabel }}</Tag>
        <span class="text-xs text-gray-400">跟随顶部全局项目选择</span>
      </div>
      <DatePicker.RangePicker
        v-model:value="dateRange"
        allow-clear
        class="w-64"
        :placeholder="['开始日期', '结束日期']"
        @change="onDateRangeChange"
      />
    </div>

    <Row :gutter="16" class="mb-4">
      <Col v-for="card in overviewCards" :key="card.key" :span="6">
        <Card hoverable class="cursor-pointer" @click="openDrilldown(card.key, card.label)">
          <div class="flex items-center justify-between">
            <div>
              <p class="mb-1 text-sm text-gray-500">{{ card.label }}</p>
              <p class="mb-1 text-2xl font-bold" :style="{ color: card.color }">{{ card.total }}</p>
              <p class="text-xs text-gray-400">
                今日 {{ card.today }} · 昨日 {{ card.yesterday }}
              </p>
            </div>
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full text-white"
              :style="{ backgroundColor: card.color }"
            >
              <span class="text-lg">⤴</span>
            </div>
          </div>
        </Card>
      </Col>
    </Row>

    <Row :gutter="16" class="mb-4">
      <Col :span="16">
        <Card title="数据趋势">
          <div class="mb-3 flex items-center gap-3">
            <Select
              v-model:value="trendType"
              class="w-36"
              :options="(Object.keys(typeMeta) as Array<keyof typeof typeMeta>).map((k) => ({ label: typeMeta[k].label, value: k as string }))"
              @change="loadTrends"
            />
            <Select
              v-model:value="range"
              class="w-28"
              :options="rangeOptions"
              @change="loadTrends"
            />
            <span v-if="trendType === 'supervision_log' || trendType === 'task'" class="text-xs text-gray-400">
              应提交 · 正常 · 超时提交 · 超时未提交
            </span>
          </div>
          <EchartsUI ref="chartRef" height="300px" class="w-full" />
          <Empty v-if="!trends" description="暂无数据" />
        </Card>
      </Col>
      <Col :span="8">
        <Card title="提交比率">
          <div v-if="rates" class="space-y-4">
            <div v-for="(card, key) in rates" :key="key">
              <p class="mb-2 text-sm font-medium text-gray-600">
                {{ (typeMeta as Record<string, { label: string }>)[key]?.label || key }}
              </p>
              <div v-for="(d, i) in card.data" :key="d.name" class="mb-2">
                <div class="mb-0.5 flex justify-between text-xs">
                  <span class="text-gray-500">{{ d.name }}</span>
                  <span class="font-medium">{{ ratePercent(card, i) }}%</span>
                </div>
                <div class="h-1.5 w-full rounded bg-gray-100">
                  <div
                    class="h-1.5 rounded transition-all"
                    :style="{ width: `${Math.min(ratePercent(card, i), 100)}%`, backgroundColor: d.color || '#5ab1ef' }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
          <Empty v-else description="暂无数据" />
        </Card>
      </Col>
    </Row>

    <Row :gutter="16">
      <Col :span="8">
        <Card title="后补任务记录" class="cursor-pointer" @click="openDrilldown('backfill', '后补任务记录')">
          <p class="mb-3 text-3xl font-bold">{{ backfill?.total ?? 0 }}</p>
          <div class="space-y-1">
            <div v-for="s in backfillByState" :key="s.state" class="flex items-center justify-between text-sm">
              <Tag :color="s.color">{{ s.label }}</Tag>
              <span class="font-medium">{{ s.total }}</span>
            </div>
          </div>
        </Card>
      </Col>
      <Col :span="8">
        <Card title="待办速览">
          <p class="text-sm text-gray-500">点击上方指标卡可查看对应明细</p>
          <div class="mt-3 space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">日志待审核</span>
              <Tag v-if="overviews" color="orange">{{ overviews.supervision_log.today }}</Tag>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">任务总数</span>
              <Tag v-if="overviews" color="blue">{{ overviews.task.total }}</Tag>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">不符合项总数</span>
              <Tag v-if="overviews" color="warning">{{ overviews.nonconformance.total }}</Tag>
            </div>
          </div>
        </Card>
      </Col>
      <Col :span="8">
        <Card title="后补记录按日">
          <div v-if="backfill?.by_date?.length" class="max-h-48 space-y-1 overflow-auto">
            <div v-for="d in backfill.by_date.slice().reverse().slice(0, 15)" :key="d.record_date" class="flex justify-between text-sm">
              <span class="text-gray-500">{{ d.record_date }}</span>
              <span class="font-medium">{{ d.total }}</span>
            </div>
          </div>
          <Empty v-else description="暂无后补记录" />
        </Card>
      </Col>
    </Row>

    <!-- 穿透明细弹窗 -->
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
  </div>
</template>
