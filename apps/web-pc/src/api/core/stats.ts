import { requestClient } from '../request';

/**
 * P6-010 数据统计接口：汇总/比率/趋势/穿透明细/后补统计
 *
 * 注意：requestClient 配置了 responseReturn:'data' + dataField:'data'，
 * 响应已自动解包一层 `data`，因此各函数直接返回 requestClient.get 的结果，
 * 不要再 `return res.data`（否则拿到 undefined）。
 */

export interface OverviewItem {
  title: string;
  icon: string;
  color: string;
  today: number;
  yesterday: number;
  total: number;
  submitted?: number;
  to_submit?: number;
  timeout_submit?: number;
  timeout_no_submit?: number;
  pending_audit?: number;
  pending?: number;
  processing?: number;
  pending_review?: number;
  completed?: number;
  approved?: number;
  rejected?: number;
}

export interface StatsOverviews {
  supervision_log: OverviewItem;
  task: OverviewItem;
  nonconformance: OverviewItem;
  backfill: OverviewItem;
  document: OverviewItem;
}

export async function getStatsOverviews(
  params: {
    company_id?: number | string;
    date_from?: string;
    date_to?: string;
    project_id?: number | string;
  } = {},
) {
  return requestClient.get<StatsOverviews>('/stats/overviews', { params });
}

export interface RateConfigItem {
  max?: number;
  label: string;
  color: string;
}

export interface RateDataItem {
  name: string;
  value: number;
  color?: string;
}

export interface RateCard {
  title: string;
  config?: RateConfigItem[];
  data: RateDataItem[];
}

export async function getStatsRates(
  params: {
    company_id?: number | string;
    date_from?: string;
    date_to?: string;
    project_id?: number | string;
  } = {},
) {
  return requestClient.get<Record<string, RateCard>>('/stats/rates', {
    params,
  });
}

export interface TrendsResult {
  times: string[];
  values: Array<{ color: string; data: number[]; name: string }>;
}

export async function getStatsTrends(
  params: {
    project_id?: number | string;
    range?: string;
    type?: string;
  } = {},
) {
  return requestClient.get<TrendsResult>('/stats/trends', { params });
}

export interface DrilldownRow {
  id: number;
  project_id: number;
  project_name: string;
  user_id: number;
  user_name: string;
  record_date: string;
  state: null | number;
  state_label: string;
  extra: string;
  extra_label?: string;
}

export interface DrilldownResult {
  list: DrilldownRow[];
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
}

export async function getStatsDrilldown(params: Record<string, unknown> = {}) {
  return requestClient.get<DrilldownResult>('/stats/drilldown', { params });
}

export interface BackfillStatsResult {
  record_type: string;
  total: number;
  by_state: Array<{ state: number; total: number }>;
  by_project: Array<{ name: string; project_id: number; total: number }>;
  by_user: Array<{ name: string; total: number; user_id: number }>;
  by_date: Array<{ record_date: string; total: number }>;
}

export async function getTaskBackfillStats(
  params: {
    company_id?: number | string;
    date_from?: string;
    date_to?: string;
    project_id?: number | string;
    record_type?: string;
    scope?: number;
  } = {},
) {
  return requestClient.get<
    BackfillStatsResult | Record<string, BackfillStatsResult>
  >('/task-backfills/stats', { params });
}

export interface ProjectStatsRow {
  [k: string]: unknown;
  id: number;
  name: string;
  total: number;
}

export async function getStatsProjects(
  params: {
    company_id?: number | string;
    date_from?: string;
    date_to?: string;
    project_id?: number | string;
    type?: string;
  } = {},
) {
  return requestClient.get<{
    list: ProjectStatsRow[];
    total: number;
  }>('/stats/projects', { params });
}
