/**
 * 本地实现的 lodash 兼容工具函数。
 *
 * 项目源码（components/ 下）原先直接 import 'lodash-es'，但该依赖并未声明且未链接，
 * 这里提供用到的少量函数，其余（cloneDeep / isEqual / get / set）从 @vben/utils 引入。
 */

type AnyFn = (...args: any[]) => void;

/**
 * 删除对象中指定点路径（如 'user.name'）的属性，返回是否删除成功。
 */
export function unset(obj: Record<string, any>, path: string): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  const parts = path.split('.');
  let current: any = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current === null || typeof current !== 'object') {
      return false;
    }
    current = current[parts[i]];
  }
  if (current === null || typeof current !== 'object') {
    return false;
  }
  return delete current[parts[parts.length - 1]];
}

/**
 * 防抖函数。
 */
export function debounce<T extends AnyFn>(fn: T, wait = 300): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const wrapped = (...args: Parameters<T>) => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };

  wrapped.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return wrapped as T & { cancel: () => void };
}
