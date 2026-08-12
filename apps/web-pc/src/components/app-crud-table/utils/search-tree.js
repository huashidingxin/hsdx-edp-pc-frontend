const HIGHLIGHT_CLASS = 'keyword-highlight';
const HIGHLIGHT_REGEX = /<span class="keyword-highlight">([\s\S]*?)<\/span>/g;

/**
 * 关键字搜索 + 高亮
 *
 * 空 keyword 返回 list 的原始引用副本（无高亮）；
 * 非空时搜索树形数据，对命中字段以 <span class="keyword-highlight">…</span> 单层包裹（不嵌套）
 *
 * @param {Array} list - 原始列表数据
 * @param {string} keyword - 搜索关键字
 * @param {Object} [treeOptions] - 树形搜索的配置选项 { children: 'children' }
 * @param {string[]} [searchProps] - 需要搜索的属性名列表
 * @returns {Array}
 */
export function searchHighlight(list, keyword, treeOptions, searchProps) {
  const childrenKey = treeOptions?.children || 'children';

  if (!keyword || !keyword.trim()) {
    // 空 keyword 返回去除高亮的原始副本
    return removeHighlight(
      cloneDeep(list, childrenKey),
      childrenKey,
    );
  }

  const kw = keyword.toLowerCase();
  const result = searchTree(
    list,
    (item) => {
      if (!searchProps || searchProps.length === 0) return false;
      return searchProps.some((prop) => {
        const val = toValueString(item[prop]).toLowerCase();
        return val.includes(kw);
      });
    },
    childrenKey,
  );

  // 对命中字段高亮包裹
  highlightTree(result, keyword, searchProps, childrenKey);

  return result;
}

/**
 * 搜索树形数据
 * @param {Array} list - 树形数据列表
 * @param {Function} predicate - 匹配函数
 * @param {string} childrenKey - 子节点的键名
 * @returns {Array} 匹配的结果（包含父节点）
 */
function searchTree(list, predicate, childrenKey = 'children') {
  if (!list || !Array.isArray(list)) return [];

  const result = [];

  for (const item of list) {
    const matched = predicate(item);
    const children = item[childrenKey];
    const hasChildren = children && Array.isArray(children) && children.length > 0;

    if (hasChildren) {
      const matchedChildren = searchTree(children, predicate, childrenKey);
      if (matchedChildren.length > 0) {
        // 子节点有匹配，包含当前节点和匹配的子节点
        result.push({
          ...item,
          [childrenKey]: matchedChildren,
        });
      } else if (matched) {
        // 当前节点匹配，包含所有子节点
        result.push(cloneDeep([item])[0]);
      }
    } else if (matched) {
      // 叶子节点匹配
      result.push({ ...item });
    }
  }

  return result;
}

/**
 * 遍历树形数据
 * @param {Array} list - 树形数据列表
 * @param {Function} callback - 回调函数
 * @param {string} childrenKey - 子节点的键名
 */
function eachTree(list, callback, childrenKey = 'children') {
  if (!list || !Array.isArray(list)) return;

  for (const item of list) {
    callback(item);
    const children = item[childrenKey];
    if (children && Array.isArray(children)) {
      eachTree(children, callback, childrenKey);
    }
  }
}

/**
 * 对树形列表中命中字段进行高亮包裹（单层，不嵌套）
 */
function highlightTree(list, keyword, searchProps, childrenKey = 'children') {
  if (!list || !searchProps) return;
  eachTree(
    list,
    (item) => {
      if (!item) return;
      const kw = keyword.toLowerCase();
      for (const prop of searchProps) {
        const val = toValueString(item[prop]);
        if (val.toLowerCase().includes(kw)) {
          // 先移除已有高亮，再重新包裹
          const clean = val.replace(HIGHLIGHT_REGEX, '$1');
          const escaped = escapeRegex(keyword);
          const regex = new RegExp(`(${escaped})`, 'gi');
          item[prop] = clean.replace(
            regex,
            `<span class="${HIGHLIGHT_CLASS}">$1</span>`,
          );
        }
      }
    },
    childrenKey,
  );
}

/**
 * 移除列表中所有高亮标记
 */
function removeHighlight(list, childrenKey = 'children') {
  if (!list) return list;
  eachTree(
    list,
    (item) => {
      if (!item) return;
      for (const key of Object.keys(item)) {
        if (typeof item[key] === 'string') {
          item[key] = item[key].replace(HIGHLIGHT_REGEX, '$1');
        }
      }
    },
    childrenKey,
  );
  return list;
}

/**
 * 深度克隆树形数据
 * @param {Array} list - 树形数据列表
 * @param {string} childrenKey - 子节点的键名
 * @returns {Array}
 */
function cloneDeep(list, childrenKey = 'children') {
  if (!list || !Array.isArray(list)) return list;

  return list.map((item) => {
    const cloned = { ...item };
    if (item[childrenKey] && Array.isArray(item[childrenKey])) {
      cloned[childrenKey] = cloneDeep(item[childrenKey], childrenKey);
    }
    return cloned;
  });
}

/**
 * 将值转换为字符串
 * @param {*} value - 任意值
 * @returns {string}
 */
function toValueString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
