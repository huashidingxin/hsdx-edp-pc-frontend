/**
 * 内置 Action_Key 常量与默认 ActionDef 工厂
 *
 * 5 个内置 Action：view / edit / delete / audit / reverse_audit
 * actionsConfig 中的条目按 key 与内置 ActionDef 浅合并
 */

export const BUILTIN_ACTION_KEYS = [
  'view',
  'edit',
  'delete',
  'audit',
  'reverse_audit',
];

/**
 * 生成内置 ActionDef 列表
 *
 * @param {{ props: Object, callbacks: Object }} ctx
 *   - props: 壳组件 props（含 idKey, permissionName 等）
 *   - callbacks: { openDetail, deleteItem, openAuditDialog, audit, refresh, reload }
 * @returns {Array<ActionDef>}
 */
export function buildBuiltinActionDefs({ props, callbacks }) {
  const {
    openDetail,
    deleteItem,
    openAuditDialog,
    audit,
    refresh,
    reload,
  } = callbacks;

  return [
    {
      key: 'view',
      label: '查看',
      icon: 'mdi--eye',
      visible: () => true,
      permission: '',
      onClick: (row) => openDetail(row[props.idKey || 'id'], false, null, row),
      order: 10,
    },
    {
      key: 'edit',
      label: '编辑',
      icon: 'mdi--pencil-outline',
      visible: () => true,
      permission: 'edit',
      onClick: (row) => openDetail(row[props.idKey || 'id'], true, null, row),
      order: 20,
    },
    {
      key: 'delete',
      label: '删除',
      icon: 'mdi--delete-outline',
      danger: true,
      visible: () => true,
      permission: 'delete',
      confirm: true,
      confirmTitle: '确定要删除吗？',
      onClick: (row) => deleteItem(row),
      order: 30,
    },
    {
      key: 'audit',
      label: '审核',
      icon: 'mdi--check-circle-outline',
      visible: (row) => row && 'audit_id' in row && !row.audit_id,
      permission: 'audit',
      onClick: (row) => openAuditDialog(row),
      order: 40,
    },
    {
      key: 'reverse_audit',
      label: '反审核',
      icon: 'mdi--restart',
      visible: (row) => !!row?.audit_status,
      permission: 'audit',
      onClick: (row) => audit(row, false),
      order: 50,
    },
  ];
}

/**
 * 解析 ActionDef 中可能是函数的属性值
 *
 * @param {boolean|Function|undefined} value - 属性值（可能是函数）
 * @param {Object} row - 当前行数据
 * @param {boolean} defaultValue - 默认值
 * @returns {boolean}
 */
export function resolveBool(value, row, defaultValue = true) {
  if (typeof value === 'function') return !!value(row);
  if (value === undefined || value === null) return defaultValue;
  return !!value;
}
