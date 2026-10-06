import { reactive, ref, toValue, watch } from 'vue';

import { cloneDeep } from 'lodash-es';

import Resource from '#/api/resource';

import { buildApiUrl } from '../utils/api-url.js';
import { buildColumns } from '../utils/columns.js';
import { mergeListParams } from '../utils/merge-list-params.js';
import { searchHighlight } from '../utils/search-tree.js';

/**
 * 列表数据管理 composable
 *
 * @param {object} props - 壳组件 props
 * @param {object} ctx - 上下文（emit 等）
 * @returns {{
 *   list: import('vue').Ref<Array>,
 *   gridOptions: Object,
 *   columnSlots: import('vue').Ref<Record<string, string>>,
 *   handlePageData: (sortBy?: any[]) => Promise<void>,
 *   loadList: (page: number, perPage: number, params: Object) => Promise<{data: Array, meta: Object}>,
 *   search: (keyword: string, treeOptions?: Object, searchProps?: string[]) => void,
 *   setSelected: () => void,
 *   selectedRowKeys: import('vue').Ref<Array>,
 *   refresh: () => void,
 *   reload: () => void,
 * }}
 */
export function useCrudTableData(props, ctx) {
  const list = ref([]);
  const columnSlots = ref({});
  const selectedRowKeys = ref([]);

  // 原始列表数据（搜索前的备份）
  let rawList = [];

  // VXE Grid 配置（reactive）
  const gridOptions = reactive({
    columns: [],
    data: [],
    border: undefined,
    stripe: undefined,
    size: undefined,
    showOverflow: true,
    rowConfig: { isHover: true },
    columnConfig: { resizable: true },
    pagerConfig: {
      enabled: true,
      total: 0,
      currentPage: 1,
      pageSize: 15,
      pageSizes: [15, 30, 50, 100],
    },
    sortConfig: {
      remote: true,
    },
    ...props.gridOptions,
  });

  // 当前排序状态
  let currentSortBy = [];

  /**
   * 重建列配置
   */
  function rebuildColumns() {
    const sourceColumns = props.gridOptions?.columns || [];
    
    // 判断是否显示操作列：优先检查 props.showActions，再检查列配置
    let showActions = props.showActions;
    if (showActions === undefined) {
      // 如果没有显式设置 showActions，则根据列配置判断
      showActions = sourceColumns.every((c) => c.field !== '_action')
        ? true
        : sourceColumns.some((c) => c.field === '_action');
    }

    const { columns, columnSlots: slots } = buildColumns(sourceColumns, {
      showActions,
      columnFormat: props.columnFormat,
      idKey: props.idKey || 'id',
    });

    gridOptions.columns = columns;
    columnSlots.value = slots;
  }

  // 初始化列
  rebuildColumns();

  // watch gridOptions.columns 或 showActions 变化重建列
  watch(
    [() => props.gridOptions?.columns, () => props.showActions],
    () => {
      rebuildColumns();
    },
    { deep: true },
  );

  // 同步 gridOptions 非列配置
  watch(
    () => props.gridOptions,
    (newVal) => {
      if (!newVal) return;
      const skipKeys = new Set(['columns', 'data', 'pagerConfig']);
      for (const key of Object.keys(newVal)) {
        if (!skipKeys.has(key) && !(key in gridOptions)) {
          gridOptions[key] = newVal[key];
        }
      }
    },
    { deep: true, immediate: true },
  );

  /**
   * 加载列表数据
   */
  async function loadList(page, perPage, params) {
    const url = buildApiUrl(
      { apiUrl: props.apiUrl, apiPrefix: props.apiPrefix },
      true,
    );
    const resource = new Resource(url);
    const response = await resource.list(params);

    const raw = response?.items || response?.data || [];
    // 防御：个别接口曾把 LengthAwarePaginator 直接包在 data 下（{ data: { current_page, data: [...], ... } }），
    // 取不到数组会让 vxe-table 对非数组调用 .slice() 抛 TypeError，此处统一展开兜底。
    const items = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : [];
    const meta = response?.meta || {};

    return { data: items, meta };
  }

  /**
   * 处理分页数据请求
   */
  async function handlePageData(sortBy) {
    if (sortBy !== undefined) {
      currentSortBy = sortBy;
    }

    const currentPage = gridOptions.pagerConfig?.currentPage || 1;
    const pageSize = gridOptions.pagerConfig?.pageSize || 15;

    const params = mergeListParams({
      filterState: getFilterState(),
      sortBy: currentSortBy,
      page: currentPage,
      perPage: pageSize,
      scope: props.listScope ?? 1,
      extraQuery: props.extraQuery || {},
      routeQuery: getRouteQuery(),
    });

    try {
      gridOptions.loading = true;
      const { data, meta } = await loadList(currentPage, pageSize, params);

      // 应用 listFormat 转换
      const formattedData =
        typeof props.listFormat === 'function' ? props.listFormat(data) : data;

      // flatField 平铺
      const flatData = props.flatField
        ? flatList(formattedData, props.flatField)
        : formattedData;

      list.value = flatData;
      rawList = cloneDeep(flatData);
      gridOptions.data = flatData;

      // 同步分页信息
      if (meta) {
        if (meta.total !== undefined) {
          gridOptions.pagerConfig.total = meta.total;
        }
        if (meta.current_page !== undefined) {
          gridOptions.pagerConfig.currentPage = meta.current_page;
        }
        if (meta.per_page !== undefined) {
          gridOptions.pagerConfig.pageSize = meta.per_page;
        }
      }

      ctx.emit('update:list', flatData);
      if (meta) {
        ctx.emit('update:meta', meta);
      }
      ctx.emit('update:pagination', {
        total: gridOptions.pagerConfig.total,
        currentPage: gridOptions.pagerConfig.currentPage,
        pageSize: gridOptions.pagerConfig.pageSize,
      });
    } catch (error) {
      console.error('[AppCrudTable] loadList error:', error);
      // 保留前一次成功数据
    } finally {
      gridOptions.loading = false;
    }
  }

  /**
   * 获取当前筛选状态
   * 注意：实际使用时由壳组件注入 filters
   */
  const filtersRef = ref({});
  function setFiltersRef(f) {
    filtersRef.value = f;
  }
  function getFilterState() {
    const raw = toValue(filtersRef.value) || {};
    // 将每个值通过 toValue 解包，并过滤掉 Vue 内部属性和无效值
    const result = {};
    for (const [key, val] of Object.entries(raw)) {
      if (key.startsWith('__v_')) continue;
      const unwrapped = toValue(val);
      if (unwrapped !== undefined && unwrapped !== '') {
        result[key] = unwrapped;
      }
    }
    return result;
  }

  /**
   * 获取当前路由 query
   * 注意：实际使用时由壳组件注入 route
   */
  let routeRef = null;
  function setRouteRef(r) {
    routeRef = r;
  }
  function getRouteQuery() {
    return routeRef?.query || {};
  }

  /**
   * 搜索关键字高亮
   */
  function search(keyword, treeOptions, searchProps) {
    if (!keyword || !keyword.trim()) {
      // 恢复原始列表
      gridOptions.data = cloneDeep(rawList);
      list.value = gridOptions.data;
      return;
    }

    const result = searchHighlight(
      cloneDeep(rawList),
      keyword,
      treeOptions,
      searchProps,
    );
    gridOptions.data = result;
    list.value = result;
  }

  /**
   * flatField 平铺
   * 把每行 [flatField] 数组项展开为多行，每行附加 _<flatField> 字段
   */
  function flatList(data, flatField) {
    if (!flatField || !data) return data;

    const result = [];
    for (const item of data) {
      const subItems = item[flatField];
      if (Array.isArray(subItems) && subItems.length > 0) {
        for (const sub of subItems) {
          result.push({ ...item, [`_${flatField}`]: sub });
        }
      } else {
        result.push({ ...item });
      }
    }
    return result;
  }

  /**
   * 同步选中行
   */
  function setSelected() {
    const selected = props.selected || [];
    selectedRowKeys.value = selected.map((row) => row[props.idKey || 'id']);
  }

  /**
   * 刷新列表
   */
  function refresh() {
    handlePageData();
  }

  /**
   * 重载列表
   */
  function reload() {
    gridOptions.pagerConfig.currentPage = 1;
    handlePageData();
  }

  return {
    list,
    gridOptions,
    columnSlots,
    handlePageData,
    loadList,
    search,
    setSelected,
    selectedRowKeys,
    refresh,
    reload,
    setFiltersRef,
    setRouteRef,
    flatList,
  };
}
