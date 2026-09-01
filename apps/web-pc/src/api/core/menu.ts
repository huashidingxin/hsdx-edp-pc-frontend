import type { RouteRecordStringComponent } from '@vben/types';

import { requestClient } from '#/api/request';

/**
 * 后端菜单字段归一化。
 *
 * 后端 (Laravel AdminMenu::toRoute) 因 Eloquent 内置 `$hidden` 属性与数据列 `hidden`
 * 同名冲突，`meta.hideInMenu` 会返回空数组 `[]`，导致 vben 的
 * `show: !meta.hideInMenu` 把全部菜单当成隐藏项。这里把各种取值
 * （`[]` / `0` / `1` / `true` / `false` / `null`）统一为 boolean；
 * 同时兼容其他项目示例中的 `hidden` 顶层字段，以及小写 `keepalive` → `keepAlive`。
 */
function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    // 空数组表示"未隐藏"（后端字段冲突产物）
    return value.length > 0;
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1';
  }
  return Boolean(value);
}

function normalizeMenuRoute(
  route: RouteRecordStringComponent,
): RouteRecordStringComponent {
  const raw = route as RouteRecordStringComponent & {
    hidden?: unknown;
    meta?: Record<string, unknown>;
  };

  const meta = { ...(raw.meta ?? {}) };

  // hideInMenu：后端可能返回 [] / 0 / 1 / true / false；缺失时回退到顶层 hidden 字段
  const hideInMenu =
    toBoolean(meta.hideInMenu) ?? toBoolean(raw.hidden) ?? false;
  meta.hideInMenu = hideInMenu;

  // keepAlive：兼容后端小写 keepalive 与数值 0/1
  const keepAlive =
    toBoolean(meta.keepAlive) ?? toBoolean(meta.keepalive) ?? false;
  meta.keepAlive = keepAlive;
  delete meta.keepalive;

  const result = { ...raw, meta } as RouteRecordStringComponent;

  if (Array.isArray(raw.children)) {
    result.children = raw.children.map((child) => normalizeMenuRoute(child));
  }

  return result;
}

function normalizeMenuRoutes(
  routes: RouteRecordStringComponent[],
): RouteRecordStringComponent[] {
  return (routes ?? []).map((route) => normalizeMenuRoute(route));
}

/**
 * 获取用户所有菜单
 */
export async function getAllMenusApi() {
  const menus =
    await requestClient.get<RouteRecordStringComponent[]>('/auth/menus');
  return normalizeMenuRoutes(menus);
}
