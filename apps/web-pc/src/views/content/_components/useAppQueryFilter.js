import { computed, onActivated, ref } from 'vue';
import { useRoute } from 'vue-router';

/**
 * 内容页应用筛选联动。
 *
 * 两种用法：
 * - 独立页面（无 appId prop）：读 `?app=` 初始化 + keepalive 切回同步
 * - 抽屉嵌入（有 appId prop）：以 prop 为准，隐藏应用筛选，自动发布到该应用
 *
 * @param {import('vue').Ref} crudRef AppCrudTable 实例 ref
 * @param {() => number|null} [getExplicitAppId] 抽屉模式下返回固定 appId
 */
function toAppId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function useAppQueryFilter(crudRef, getExplicitAppId) {
  const route = useRoute();
  const activeFilters = ref({});

  const explicitAppId = computed(() => (getExplicitAppId ? toAppId(getExplicitAppId()) : null));
  const routeAppId = computed(() => toAppId(route.query.app));

  const appFilterDefault = explicitAppId.value ?? routeAppId.value ?? undefined;
  const lastApplied = ref(appFilterDefault);

  const embedded = computed(() => explicitAppId.value !== null);

  const suggestedAppId = computed(() => {
    return (
      toAppId(activeFilters.value.application_id) ??
      explicitAppId.value ??
      routeAppId.value
    );
  });

  function onFiltersUpdate(next) {
    // next 为 null / undefined 时对象展开结果就是 {}（对 nullish 展开是合法且无副作用的），
    // 再写 `|| {}` 属冗余，unicorn/no-useless-fallback-in-spread 会报错。
    activeFilters.value = { ...next };
  }

  function syncFromQuery() {
    if (embedded.value) return;
    const id = routeAppId.value;
    if (!id || id === lastApplied.value) return;
    lastApplied.value = id;
    crudRef.value?.setFilterState({ application_id: id });
    crudRef.value?.applyFilters();
  }

  onActivated(syncFromQuery);

  return { appFilterDefault, suggestedAppId, onFiltersUpdate, syncFromQuery, embedded };
}
