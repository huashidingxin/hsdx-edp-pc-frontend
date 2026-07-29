/**
 * AppCrudTable 统一导出
 *
 * 默认导出 AppCrudTable 组件
 * 命名导出工具函数、常量与 composables（用于二次开发）
 */

// 壳组件
export { default } from './AppCrudTable.vue';

// 工具函数
export { buildApiUrl } from './utils/api-url.js';
export { mergeListParams } from './utils/merge-list-params.js';
export { flattenDotFieldValues, expandDotKeys } from './utils/dot-keys.js';
export { buildColumns } from './utils/columns.js';
export { searchHighlight } from './utils/search-tree.js';
export {
  BUILTIN_ACTION_KEYS,
  buildBuiltinActionDefs,
  resolveBool,
} from './utils/action-types.js';

// Composables
export { useCrudTablePermission } from './composables/useCrudTablePermission.js';
export { useCrudTableForm } from './composables/useCrudTableForm.js';
export { useCrudTableFilters } from './composables/useCrudTableFilters.js';
export { useCrudTableData } from './composables/useCrudTableData.js';
export { useCrudTableRoute } from './composables/useCrudTableRoute.js';
export { useCrudTableActions } from './composables/useCrudTableActions.js';
export { useCrudTableDetail, resolveOpenMode } from './composables/useCrudTableDetail.js';
