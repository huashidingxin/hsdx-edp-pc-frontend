import { computed } from 'vue';

import { useAccess } from '@vben/access';

/**
 * 权限校验 composable
 *
 * 通过 try/catch 包裹 useAccess()，失败回退「全部允许」
 * 实现 design § 3.7 决策矩阵
 *
 * @param {object} props - 壳组件 props
 * @returns {{
 *   hasAccessByCodes: (codes: string[]) => boolean,
 *   hasAccessByRoles: (roles: string[]) => boolean,
 *   checkPermission: (action: string, actName?: string) => boolean,
 *   checkItemAction: (value: any, row: Object, action?: string, actName?: string) => boolean,
 *   isSuperRole: import('vue').ComputedRef<boolean>,
 * }}
 */
export function useCrudTablePermission(props) {
  let hasAccessByCodes = /** @type {(codes: string[]) => boolean} */ (
    () => true
  );
  let hasAccessByRoles = /** @type {(roles: string[]) => boolean} */ (
    () => true
  );

  try {
    const access = useAccess();
    hasAccessByCodes = access.hasAccessByCodes || (() => true);
    hasAccessByRoles = access.hasAccessByRoles || (() => true);
  } catch {
    // useAccess 不可用（可能不在 Vue 上下文中），回退为「全部允许」
  }

  const isSuperRole = computed(() => {
    if (!props.superRoles || props.superRoles.length === 0) return false;
    return hasAccessByRoles(props.superRoles);
  });

  /**
   * 权限决策矩阵
   *
   * 优先级：
   * 1. useAccess 不可用 → true
   * 2. 超级角色 + 不在排除列表 → true
   * 3. action && permissionName && !hasAccessByCodes → false
   * 4. 其他 → true
   *
   * @param {string} action - 操作类型，如 'update', 'delete', 'audit'
   * @param {string} [actName] - 权限名覆盖（替代 props.permissionName）
   * @returns {boolean}
   */
  function checkPermission(action, actName) {
    // 超级角色 + 不在排除列表
    if (
      props.superRoles &&
      props.superRoles.length > 0 &&
      hasAccessByRoles(props.superRoles) &&
      !(props.superRoleExcludeActions || []).includes(action)
    ) {
      return true;
    }

    // action + permissionName 校验
    // 规范（与后端 Permission::initPermissions 一致）：权限码为「资源.动作」点分格式，
    // 例如 project.create / project.view / project.delete / project.audit
    const name = actName || props.permissionName;
    if (action && name) {
      return hasAccessByCodes([`${name}.${action}`]);
    }

    // 缺省允许
    return true;
  }

  /**
   * 检查行级操作权限
   * 用于按行求 ActionDef 可见性
   *
   * @param {any} value - ActionDef.visible 字段值
   * @param {object} row - 当前行数据
   * @param {string} [action] - permission 字段值
   * @param {string} [actName] - permissionName 字段值
   * @returns {boolean}
   */
  function checkItemAction(value, row, action, actName) {
    // 先检查自定义可见性
    let visible = true;
    if (typeof value === 'function') {
      visible = !!value(row);
    } else if (value !== undefined && value !== null) {
      visible = !!value;
    }

    if (!visible) return false;

    // 再检查权限
    if (action) {
      return checkPermission(action, actName);
    }

    return true;
  }

  return {
    hasAccessByCodes,
    hasAccessByRoles,
    checkPermission,
    checkItemAction,
    isSuperRole,
  };
}
