import { requestClient } from '#/api/request';

/** 套餐特性 */
export interface PlanFeature {
  id: string | number;
  name: string;
  value: string;
}

/**
 * 套餐信息（来自后端 /plans 和 userInfo.subscription.plan）
 * 注意：price 在后端返回为字符串 "5999.00"
 */
export interface PlanInfo {
  id: number;
  name: string;
  /** 价格（字符串，如 "5999.00" 或 "0.00"） */
  price: string | number;
  /** 原价（可选） */
  original_price?: string | number;
  /** 套餐描述 */
  description?: string;
  /** 套餐有效天数 */
  duration_days?: number;
  /** 最大家族数 */
  max_families?: number;
  /** 每个家族最大成员数 */
  max_members_per_family?: number;
  /** 存储限制 MB */
  storage_limit_mb?: number;
  /** 是否可导出：1=是, 0=否 */
  can_export?: number;
  features?: PlanFeature[] | null;
  is_active?: number;
  sort_order?: number;
}

/** 用户信息中的订阅数据（userInfo.subscription） */
export interface UserSubscriptionRaw {
  id: number;
  user_id: number;
  plan_id: number;
  expires_at: string; // 格式: "2099-12-30 23:59:59"
  created_at: string | null;
  updated_at: string | null;
  plan: PlanInfo;
}

/** 内部使用的订阅状态（带 is_expired 计算） */
export interface SubscriptionInfo extends UserSubscriptionRaw {
  is_expired: boolean;
}

/** 订单信息 */
export interface OrderInfo {
  id: number;
  plan_id: number;
  price: number;
  status: string;
}

/**
 * 获取套餐列表
 */
export async function getPlansApi() {
  return requestClient.get<PlanInfo[]>('/plans');
}

/**
 * 创建订单
 */
export async function createOrderApi(data: { plan_id: number; price: number }) {
  return requestClient.post<OrderInfo>('/orders', data);
}

/**
 * 获取订单支付参数（返回微信支付二维码URL等）
 */
export async function getOrderPayApi(orderId: number) {
  return requestClient.post<any>(`/orders/${orderId}/pay`);
}

/**
 * 获取订单支付状态
 * @returns { status: 'pending' | 'paid' | 'expired' | 'closed', ... }
 */
export async function getPayStatusApi(orderId: number) {
  return requestClient.get<{ status: string }>(`/orders/${orderId}/pay-status`);
}

/**
 * 从 userInfo.subscription 原始数据构建 SubscriptionInfo
 * 自动计算 is_expired
 */
export function buildSubscriptionInfo(raw: UserSubscriptionRaw): SubscriptionInfo {
  // expires_at 为 null 表示永久有效
  if (!raw.expires_at) {
    return { ...raw, is_expired: false };
  }
  const now = new Date();
  const expireDate = new Date(raw.expires_at.replace(' ', 'T'));
  return {
    ...raw,
    is_expired: now > expireDate,
  };
}

/**
 * 解析价格字符串为数字
 * @example parsePrice("5999.00") => 5999
 */
export function parsePrice(price: string | number): number {
  if (typeof price === 'number') return price;
  return parseFloat(price) || 0;
}
