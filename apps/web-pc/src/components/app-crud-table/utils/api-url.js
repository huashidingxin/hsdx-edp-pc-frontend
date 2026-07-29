/**
 * 构建 API URL
 * 列表与新增请求使用 apiPrefix；详情/更新/删除/审核不使用前缀
 *
 * @param {{ apiUrl: string, apiPrefix?: string }} options
 * @param {boolean} [usePrefix=false]
 * @returns {string}
 */
export function buildApiUrl({ apiUrl, apiPrefix }, usePrefix = false) {
  const prefix = usePrefix && apiPrefix ? `${apiPrefix}/` : '';
  return `${prefix}${apiUrl}`;
}
