/**
 * 合并 List_Request_Params，按优先级（高→低）：
 *   filterState > sortBy > { page, per_page, scope } > extraQuery > routeQuery
 *
 * sort_by 在排序为空时输出 undefined（被 axios 序列化时丢弃），避免后端收到 '[]'
 *
 * @param {{
 *   filterState?: Object,
 *   sortBy?: Array,
 *   page?: number,
 *   perPage?: number,
 *   scope?: string|number,
 *   extraQuery?: Object,
 *   routeQuery?: Object,
 * }} params
 * @returns {Object}
 */
export function mergeListParams({
  filterState = {},
  sortBy,
  page = 1,
  perPage = 15,
  scope = 1,
  extraQuery = {},
  routeQuery = {},
}) {
  return {
    ...routeQuery,
    ...extraQuery,
    page,
    per_page: perPage,
    scope,
    sort_by:
      sortBy && sortBy.length > 0 ? JSON.stringify(sortBy) : undefined,
    ...filterState,
  };
}
