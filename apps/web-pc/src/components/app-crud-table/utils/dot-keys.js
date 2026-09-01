import { cloneDeep, get, set } from '@vben/utils';

import { unset } from '#/utils/lodash';

/**
 * 将嵌套对象中声明的 dot 字段扁平化
 * 仅对 dotFieldNames 中声明的 dot key 处理，把 obj.user.name 复制到 obj['user.name']
 *
 * @param {Object} data - 原始数据对象
 * @param {string[]} dotFieldNames - 需要扁平化的 dot 字段名列表
 * @returns {Object} 扁平化后的数据（浅拷贝）
 */
export function flattenDotFieldValues(data, dotFieldNames) {
  if (!data || !dotFieldNames || dotFieldNames.length === 0) return data;
  const result = { ...data };
  for (const dotKey of dotFieldNames) {
    if (dotKey.includes('.')) {
      const value = get(data, dotKey);
      if (value !== undefined) {
        result[dotKey] = value;
      }
    }
  }
  return result;
}

/**
 * 把所有含 `.` 的键还原为嵌套结构
 * 遍历 obj 的所有 key，凡是包含 `.` 的还原为嵌套结构
 *
 * @param {Object} data - 包含 dot 键的扁平对象
 * @returns {Object} 还原后的嵌套对象（深拷贝）
 */
export function expandDotKeys(data) {
  if (!data) return data;
  const result = cloneDeep(data);
  const dotKeys = Object.keys(result).filter((k) => k.includes('.'));
  for (const dotKey of dotKeys) {
    const value = result[dotKey];
    set(result, dotKey, value);
    unset(result, dotKey);
  }
  return result;
}
