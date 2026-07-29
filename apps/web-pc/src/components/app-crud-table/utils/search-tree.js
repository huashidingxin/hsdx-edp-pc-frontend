import XEUtils from 'xe-utils';

const HIGHLIGHT_CLASS = 'keyword-highlight';
const HIGHLIGHT_REGEX = /<span class="keyword-highlight">([\s\S]*?)<\/span>/g;

/**
 * 关键字搜索 + 高亮
 *
 * 空 keyword 返回 list 的原始引用副本（无高亮）；
 * 非空时调用 XEUtils.searchTree，对命中字段以 <span class="keyword-highlight">…</span> 单层包裹（不嵌套）
 *
 * @param {Array} list - 原始列表数据
 * @param {string} keyword - 搜索关键字
 * @param {Object} [treeOptions] - searchTree 的配置选项
 * @param {string[]} [searchProps] - 需要搜索的属性名列表
 * @returns {Array}
 */
export function searchHighlight(list, keyword, treeOptions, searchProps) {
  if (!keyword || !keyword.trim()) {
    // 空 keyword 返回去除高亮的原始副本
    return removeHighlight(cloneList(list));
  }

  const kw = keyword.toLowerCase();

  const result = XEUtils.searchTree(
    list,
    (item) => {
      if (!searchProps || searchProps.length === 0) return false;
      return searchProps.some((prop) => {
        const val = XEUtils.toValueString(item[prop]).toLowerCase();
        return val.includes(kw);
      });
    },
    treeOptions,
  );

  // 对命中字段高亮包裹
  highlightTree(result, keyword, searchProps);

  return result;
}

/**
 * 对树形列表中命中字段进行高亮包裹（单层，不嵌套）
 */
function highlightTree(list, keyword, searchProps) {
  if (!list || !searchProps) return;
  XEUtils.eachTree(list, (item) => {
    if (!item) return;
    const kw = keyword.toLowerCase();
    for (const prop of searchProps) {
      const val = XEUtils.toValueString(item[prop]);
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
  });
}

/**
 * 移除列表中所有高亮标记
 */
function removeHighlight(list) {
  if (!list) return list;
  XEUtils.eachTree(list, (item) => {
    if (!item) return;
    for (const key of Object.keys(item)) {
      if (typeof item[key] === 'string') {
        item[key] = item[key].replace(HIGHLIGHT_REGEX, '$1');
      }
    }
  });
  return list;
}

/**
 * 浅克隆列表（保持树形结构）
 */
function cloneList(list) {
  if (!list) return list;
  return list.map((item) => ({ ...item }));
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
