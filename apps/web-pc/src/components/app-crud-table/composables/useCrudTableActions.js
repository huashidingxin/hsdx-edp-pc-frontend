import { computed, ref, watchEffect } from 'vue';

import { buildBuiltinActionDefs, resolveBool } from '../utils/action-types.js';

/**
 * 行操作注册表 + Inline/More 划分 composable
 *
 * 关键算法：
 * 1. 合并「内置 ActionDef + props.actionsConfig（按 key 浅合并覆盖）+ 运行时 registry」→ allDefs
 * 2. 对当前 row 求出可见性
 * 3. 按 inlineActionKeys 划分为 inline / more
 * 4. 各自按 order 升序排序
 * 5. 开发模式下对未匹配 key console.warn 一次（按 key 去重）
 *
 * @param {object} props - 壳组件 props
 * @param {object} ctx - 上下文
 * @param {object} callbacks - { openDetail, deleteItem, openAuditDialog, audit, refresh, reload }
 * @param {object} permissionApi - useCrudTablePermission 返回值
 * @returns {{
 *   registry: import('vue').Ref<Map<string, Object>>,
 *   registerAction: (def: Object) => () => void,
 *   unregisterAction: (key: string) => void,
 *   resolveRowActions: (row: Object) => { inline: Array, more: Array },
 *   inlineActionKeys: import('vue').ComputedRef<string[]>,
 * }}
 */
export function useCrudTableActions(props, ctx, callbacks, permissionApi) {
  // 运行时注册表
  const registry = ref(new Map());

  // 已警告过的 key 集合（dev only 去重）
  const warnedKeys = new Set();

  /**
   * 获取 inlineActionKeys
   */
  const inlineActionKeys = computed(
    () => props.inlineActions || ['view', 'edit', 'delete'],
  );

  /**
   * 合并所有 ActionDef（内置 + 配置 + 运行时）
   */
  function getAllDefs() {
    const all = new Map();

    // 1. 内置 ActionDef
    const builtins = buildBuiltinActionDefs({
      props,
      callbacks,
    });
    for (const def of builtins) {
      all.set(def.key, def);
    }

    // 2. props.actionsConfig 浅合并覆盖
    for (const def of props.actionsConfig || []) {
      if (!def?.key) continue;
      const existing = all.get(def.key);
      if (existing) {
        all.set(def.key, { ...existing, ...def });
      } else {
        all.set(def.key, def);
      }
    }

    // 3. 运行时注册
    for (const [key, def] of registry.value.entries()) {
      all.set(key, def);
    }

    return all;
  }

  /**
   * 解析行操作（划分 inline / more）
   *
   * @param {object} row - 当前行数据
   * @returns {{ inline: Array<ResolvedAction>, more: Array<ResolvedAction> }}
   */
  function resolveRowActions(row) {
    const allDefs = getAllDefs();
    const inlineKeys = new Set(inlineActionKeys.value);

    // 解析每个 def 在当前 row 下的可见性
    const resolved = [];
    for (const [key, def] of allDefs.entries()) {
      // 检查自定义可见性
      const visibleByCustom = resolveBool(def.visible, row, true);
      // 检查权限
      const visibleByPerm =
        !def.permission ||
        permissionApi.checkPermission(
          def.permission,
          def.permissionName || props.permissionName,
        );

      if (!visibleByCustom || !visibleByPerm) continue;

      resolved.push({
        key,
        label: typeof def.label === 'function' ? def.label(row) : def.label,
        iconClass: def.icon
          ? `icon-[${typeof def.icon === 'function' ? def.icon(row) : def.icon}]`
          : undefined,
        danger: resolveBool(def.danger, row, false),
        disabled: resolveBool(def.disabled, row, false),
        confirm: !!def.confirm,
        confirmTitle:
          typeof def.confirmTitle === 'function'
            ? def.confirmTitle(row)
            : def.confirmTitle || '确定要执行该操作吗？',
        onClick: () => def.onClick(row, { row, props, ...callbacks }),
        order: def.order ?? 100,
      });
    }

    // 按 inlineActionKeys 划分
    const inline = resolved
      .filter((a) => inlineKeys.has(a.key))
      .sort((a, b) => a.order - b.order);
    const more = resolved
      .filter((a) => !inlineKeys.has(a.key))
      .sort((a, b) => a.order - b.order);

    return { inline, more };
  }

  /**
   * 运行时注册 Action
   *
   * @param {object} def - ActionDef
   * @returns {() => void} 反注册函数
   */
  function registerAction(def) {
    if (!def?.key) {
      throw new Error('[AppCrudTable] action.key is required');
    }
    registry.value.set(def.key, def);
    // 返回反注册函数
    return () => registry.value.delete(def.key);
  }

  /**
   * 运行时注销 Action
   */
  function unregisterAction(key) {
    registry.value.delete(key);
  }

  /**
   * 开发模式下，对 inlineActions 中未匹配的 key 输出一次 console.warn
   */
  if (import.meta.env.DEV) {
    watchEffect(() => {
      const allDefs = getAllDefs();
      const allKeys = new Set(allDefs.keys());
      for (const k of inlineActionKeys.value) {
        if (!allKeys.has(k) && !warnedKeys.has(k)) {
          warnedKeys.add(k);
          console.warn(
            `[AppCrudTable] inlineActions key "${k}" matches no registered action`,
          );
        }
      }
    });
  }

  return {
    registry,
    registerAction,
    unregisterAction,
    resolveRowActions,
    inlineActionKeys,
  };
}
