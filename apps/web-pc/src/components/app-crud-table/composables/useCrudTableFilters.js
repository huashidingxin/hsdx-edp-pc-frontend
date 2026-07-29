import { computed, ref, watch } from 'vue';

/**
 * 筛选区状态管理 composable
 *
 * @param {object} props - 壳组件 props
 * @param {object} ctx - 上下文（emit 等）
 * @param {object} dataApi - useCrudTableData 返回的 API
 * @returns {{
 *   filters: import('vue').Ref<Object>,
 *   formatedFilterFields: import('vue').ComputedRef<Array>,
 *   filterExpand: import('vue').Ref<boolean>,
 *   visibleFilterFields: import('vue').ComputedRef<Array>,
 *   canToggleExpand: import('vue').ComputedRef<boolean>,
 *   reset: () => void,
 *   apply: () => void,
 *   refresh: () => void,
 *   setFilterState: (partial: Object) => void,
 * }}
 */
export function useCrudTableFilters(props, ctx, dataApi) {
  const ROW_TOTAL_COLS = 24;

  // 筛选状态
  const filters = ref(buildInitialFilters());

  // 展开/收起状态
  const filterExpand = ref(props.filterExpandDefault || false);

  /**
   * 根据 filterFields 构建初始 filter 值
   */
  function buildInitialFilters() {
    const result = {};
    for (const f of props.filterFields || []) {
      result[f.field] = f.default === undefined ? undefined : f.default;
    }
    return result;
  }

  /**
   * 过滤后的筛选字段
   */
  const formatedFilterFields = computed(() => {
    const excludeSet = new Set(props.excludeFilters || []);
    return (props.filterFields || []).filter((f) => !excludeSet.has(f.field));
  });

  /**
   * 计算收起态下能显示多少字段
   */
  function computeCollapseCount(fields, rows) {
    const r = rows ?? props.filterCollapseRows ?? 1;
    const capacity = ROW_TOTAL_COLS * r;
    let used = 0;
    let count = 0;
    for (const f of fields) {
      const c = Number.isFinite(f.col) ? f.col : 6;
      if (used + c > capacity) break;
      used += c;
      count += 1;
    }
    return Math.max(0, count);
  }

  const collapsedCount = computed(() =>
    computeCollapseCount(formatedFilterFields.value),
  );

  /**
   * 当前可见的筛选字段
   */
  const visibleFilterFields = computed(() => {
    if (filterExpand.value) {
      return formatedFilterFields.value;
    }
    return formatedFilterFields.value.slice(0, collapsedCount.value);
  });

  /**
   * 是否可以切换展开/收起
   */
  const canToggleExpand = computed(
    () => formatedFilterFields.value.length > collapsedCount.value,
  );

  /**
   * 重置筛选状态
   * 把每个字段恢复为 field.default（未声明 default → undefined），然后 apply
   */
  function reset() {
    for (const f of props.filterFields || []) {
      filters.value[f.field] = f.default === undefined ? undefined : f.default;
    }
    apply();
  }

  /**
   * 应用筛选
   * 把 pagerConfig.currentPage = 1，然后触发 handlePageData
   */
  function apply() {
    if (dataApi && dataApi.gridOptions && dataApi.gridOptions.pagerConfig) {
      dataApi.gridOptions.pagerConfig.currentPage = 1;
    }
    if (dataApi && dataApi.handlePageData) {
      dataApi.handlePageData();
    }
  }

  /**
   * 刷新（重置 + 应用）
   */
  function refresh() {
    reset();
  }

  /**
   * 设置部分筛选状态
   */
  function setFilterState(partial) {
    if (!partial || typeof partial !== 'object') return;
    for (const [key, value] of Object.entries(partial)) {
      filters.value[key] = value;
    }
  }

  /**
   * 切换展开/收起
   */
  function toggleExpand() {
    filterExpand.value = !filterExpand.value;
  }

  // 深 watch filters → emit update:filters
  watch(
    filters,
    (val) => {
      ctx.emit('update:filters', { ...val });
    },
    { deep: true },
  );

  return {
    filters,
    formatedFilterFields,
    filterExpand,
    visibleFilterFields,
    canToggleExpand,
    reset,
    apply,
    refresh,
    setFilterState,
    toggleExpand,
    computeCollapseCount,
  };
}
