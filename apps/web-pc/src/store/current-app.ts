import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import {
  clearCurrentApplicationId,
  ensureCurrentApplicationId,
  getCurrentApplicationId,
  setCurrentApplicationId,
} from '#/api/application-context';
import Resource from '#/api/resource';

export interface ApplicationItem {
  id: number;
  name: string;
  code?: string;
  type: number;
  type_label?: string;
  status: number;
  status_label?: string;
  default_locale?: string;
  enabled_locales?: string[];
  domains?: Array<{
    id: number;
    host: string;
    is_primary?: number;
    redirect_to_primary?: number;
    ssl_status?: number;
  }>;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

/**
 * 管理端当前工作区应用状态。
 *
 * 作为管理后台的核心上下文：
 * 1. 维护租户内全部应用列表（applications）
 * 2. 维护当前选中的应用（currentApp / currentAppId），并与 localStorage 及 X-Application-Id 深度同步
 * 3. 支持平滑切换应用、新建应用通知及全局事件派发
 */
export const useCurrentAppStore = defineStore('current-app', () => {
  const applications = ref<ApplicationItem[]>([]);
  const loaded = ref(false);
  const currentAppId = ref<number | null>(getCurrentApplicationId());
  let loading: null | Promise<ApplicationItem[]> = null;

  const currentApp = computed<ApplicationItem | null>(() => {
    if (!currentAppId.value) {
      return applications.value[0] || null;
    }
    return (
      applications.value.find(
        (a) => Number(a.id) === Number(currentAppId.value),
      ) ||
      applications.value[0] ||
      null
    );
  });

  async function loadApplications(force = false): Promise<ApplicationItem[]> {
    if (loaded.value && !force) return applications.value;
    if (loading) return loading;
    loading = (async () => {
      try {
        const { data } = await new Resource('applications').list({
          per_page: 100,
        });
        applications.value = Array.isArray(data) ? data : [];
        // 自动校验当前选中的应用是否依然属于当前租户列表
        if (
          !currentAppId.value ||
          !applications.value.some((a) => Number(a.id) === currentAppId.value)
        ) {
          if (applications.value.length > 0) {
            selectApp(applications.value[0]!.id);
          }
        }
      } catch (error) {
        console.error('Failed to load applications:', error);
        applications.value = [];
      } finally {
        loaded.value = true;
        loading = null;
      }
      return applications.value;
    })();
    return loading;
  }

  function selectApp(id: number | string) {
    const num = Number(id);
    if (Number.isSafeInteger(num) && num > 0) {
      currentAppId.value = num;
      setCurrentApplicationId(num);
    }
  }

  function clearApp() {
    currentAppId.value = null;
    clearCurrentApplicationId();
  }

  async function initContext() {
    await loadApplications();
    const resolvedId = await ensureCurrentApplicationId();
    if (resolvedId) {
      currentAppId.value = resolvedId;
    }
  }

  return {
    applications,
    currentApp,
    currentAppId,
    loaded,
    loadApplications,
    selectApp,
    clearApp,
    initContext,
  };
});
