import { requestClient } from '../request';

/**
 * P3-L02 监理日志 API：列表/详情（含提交历史时间线）
 */

export interface LogTimelineItem {
  version_no: number;
  is_current: boolean;
  state: number;
  submitted_at: string;
  created_at: string;
  audit: {
    status: number;
    audit_time: string;
    auditor_name: string;
    reason: string;
  } | null;
}

export interface SupervisionLogDetail {
  id: number;
  project_id: number;
  user_id: number;
  date: string;
  state: number;
  submission_state?: number;
  submission_id: number | null;
  submission?: Record<string, unknown> | null;
  tasks?: Array<{ title: string; items: string[] }>;
  timeline?: LogTimelineItem[];
}

export interface SupervisionLogListItem {
  id: number;
  project_id: number;
  user_id: number;
  date: string;
  state: number;
  submission_id: number | null;
  project?: { name: string };
  user?: { name: string };
  submission?: { id: number; code: string; created_at: string; state: number } | null;
  [k: string]: unknown;
}

export async function getSupervisionLogs(params: Record<string, unknown> = {}) {
  const res = await requestClient.get<{ data: { list: SupervisionLogListItem[]; total: number } }>(
    '/supervision-logs',
    { params },
  );
  return res.data;
}

export async function getSupervisionLogDetail(id: number | string) {
  const res = await requestClient.get<{ data: SupervisionLogDetail }>(`/supervision-logs/${id}`);
  return res.data;
}
