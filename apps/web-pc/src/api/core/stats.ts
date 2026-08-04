import { requestClient } from '../request';

/**
 * P6-010 数据统计接口：汇总/比率/趋势/穿透明细/后补统计
 */

export interface OverviewItem {
  title: string;
  icon: string;
  color: string;
  today: number;
  yesterday: number;
  total: number;
}

export interface StatsOverviews {
  supervision_log: OverviewItem;
  task: OverviewItem;
  nonconformance: OverviewItem;
  issue: OverviewItem;
}

export async function getStatsOverviews(params: {
  project_id?: number | string;
  date_from?: string;
  date_to?: string;
} = {}) {
  const res = await requestClient.get<{ data: StatsOverviews }>('/stats/overviews', { params });
  return res.data;
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

export async function getStatsRates(params: {
  project_id?: number | string;
  date_from?: string;
  date_to?: string;
} = {}) {
  const res = await requestClient.get<{ data: Record<string, RateCard> }>('/stats/rates', { params });
  return res.data;
}

export async function getStatsTrends(params: {
  project_id?: number | string;
  range?: string;
  type?: string;
} = {}) {
  const res = await requestClient.get<{ data: { values: Array<{ name: string; color: string; data: number[] }>; times: string[] } }>(
    '/stats/trends',
    { params },
  );
  return res.data;
}

export interface DrilldownRow {
  id: number;
  project_id: number;
  project_name: string;
  user_id: number;
  user_name: string;
  record_date: string;
  state: number | null;
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
  const res = await requestClient.get<{ data: DrilldownResult }>('/stats/drilldown', { params });
  return res.data;
}

export interface BackfillStatsResult {
  record_type: string;
  total: number;
  by_state: Array<{ state: number; total: number }>;
  by_project: Array<{ project_id: number; name: string; total: number }>;
  by_user: Array<{ user_id: number; name: string; total: number }>;
  by_date: Array<{ record_date: string; total: number }>;
}

export async function getTaskBackfillStats(params: { record_type?: string; scope?: number; project_id?: number | string } = {}) {
  const res = await requestClient.get<{ data: BackfillStatsResult | Record<string, BackfillStatsResult> }>(
    '/task-backfills/stats',
    { params },
  );
  return res.data;
}

export async function getStatsProjects(params: { type?: string; project_id?: number | string; date_range?: [string, string] } = {}) {
  const res = await requestClient.get<{ data: { list: Array<{ id: number; name: string; total: number; [k: string]: unknown }>; total: number } }>(
    '/stats/projects',
    { params },
  );
  return res.data;
}
