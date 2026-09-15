import { ref } from 'vue';

import { defineStore } from 'pinia';

import Resource from '#/api/resource';

/**
 * 管理端应用列表（租户内全量，供各页应用筛选/发布弹窗复用，请求级缓存）。
 *
 * 说明：内容以租户全局管理为主，不再设全局“当前应用”；
 * 需要按应用筛选的内容页首筛选位即应用下拉。
 * 应用专属页（页面/菜单/设置等）仍经 localStorage
 *（`edp:current-application-id`）+ `X-Application-Id` 维持上下文。
 */
export const useCurrentAppStore = defineStore('current-app', () => {
  const applications = ref<any[]>([]);
  const loaded = ref(false);
  let loading: null | Promise<any[]> = null;

  async function loadApplications(force = false): Promise<any[]> {
    if (loaded.value && !force) return applications.value;
    if (loading) return loading;
    loading = (async () => {
      try {
        const { data } = await new Resource('applications').list({
          per_page: 100,
        });
        applications.value = Array.isArray(data) ? data : [];
      } catch (error) {
        console.error(error);
        applications.value = [];
      } finally {
        loaded.value = true;
        loading = null;
      }
      return applications.value;
    })();
    return loading;
  }

  return {
    applications,
    loadApplications,
    loaded,
  };
});
