/**
 * 管理端「当前应用」上下文（X-Application-Id）。
 *
 * Application 是页面/菜单/主题/站点设置等资源的边界：所有应用级接口
 * （settings、page-data-schema、menus、files、ui-strings…）都要求该请求头。
 * 选中的应用持久化在 localStorage（`edp:current-application-id`），
 * 请求层（request.ts）统一注入，无需每个页面手动携带。
 */

const STORAGE_KEY = 'edp:current-application-id';

export function getCurrentApplicationId(): null | number {
  const id = Number(localStorage.getItem(STORAGE_KEY));

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function setCurrentApplicationId(id: number | string): void {
  const num = Number(id);
  if (Number.isSafeInteger(num) && num > 0) {
    localStorage.setItem(STORAGE_KEY, String(num));
  }
}

export function clearCurrentApplicationId(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 确保已选择当前应用：登录后/页面刷新时调用一次。
 *
 * 已存的 id 必须仍属于当前租户（applications 列表按租户隔离），
 * 否则（如切换账号）自动回落到该租户的第一个应用，避免跨租户 404。
 */
export async function ensureCurrentApplicationId(): Promise<null | number> {
  // 动态导入避免 request.ts <-> application-context.ts 循环依赖
  const { requestClient } = await import('./request');

  const data = await requestClient.get('/applications', {
    params: { per_page: 100 },
  });
  const list: Array<Record<string, any>> = Array.isArray(data)
    ? data
    : (data?.data ?? []);

  const current = getCurrentApplicationId();
  if (current && list.some((a) => Number(a?.id) === current)) {
    return current;
  }

  const first = Number(list[0]?.id) || null;
  if (first) {
    setCurrentApplicationId(first);
  }

  return first;
}
