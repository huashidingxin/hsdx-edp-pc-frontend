/**
 * 编辑器 DOM ↔ ProseMirror 位置反查工具
 *
 * 背景：图片是行内节点（常嵌套在 columns > column > paragraph 内），
 * 仅靠 `doc.nodeAt(posAtDOM)` 或按 `src` 匹配极易错位——文档中若存在多张
 * 相同 src 的图片（同素材复用很常见），按 src 取第一匹配会选中多栏外部的
 * 图片，导致“删的是外面那张”。因此所有查找统一按以下优先级：
 * 1. DOM 身份（`view.nodeDOM(pos) === el`）——最可靠，只要 el 属于当前 view；
 * 2. `posAtDOM` + `$pos.nodeAfter / nodeBefore`（感知行内嵌套）；
 * 3. 中心坐标 `posAtCoords`；
 * 4. 同 src + DOM 序号双重匹配（拒绝盲取第一匹配，避免删错节点）。
 */

/**
 * 在文档中按 DOM 身份反查指定类型节点的精确位置。
 * 先做严格身份匹配，再做 contains 包含匹配（应对点击落在 video > source 等子元素）。
 * @returns {{ pos: number, node: object } | null}
 */
export function findNodePosByDOM(view, el, typeName) {
  if (!view || !el || !typeName) return null;
  let containsMatch = null;
  try {
    let found = null;
    view.state.doc.descendants((node, pos) => {
      if (found) return false;
      if (node.type?.name !== typeName) return true;
      let dom = null;
      try {
        dom = view.nodeDOM(pos);
      } catch {
        dom = null;
      }
      if (!dom) return true;
      if (dom === el) {
        found = { pos, node };
        return false;
      }
      if (!containsMatch && typeof dom.contains === 'function') {
        try {
          if (dom.contains(el)) containsMatch = { pos, node };
        } catch {
          /* 忽略 */
        }
      }
      return true;
    });
    if (found) return found;
  } catch {
    /* 忽略，进入包含匹配回退 */
  }
  return containsMatch;
}

/**
 * 收集文档中与目标 el 同 src 且 DOM 序号一致的候选，避免同素材误匹配。
 */
function matchBySrcAndIndex(view, el, typeName, targetSrc, imgSelector) {
  if (!targetSrc) return null;
  try {
    const allEls = Array.from(view.dom.querySelectorAll(imgSelector));
    const elIndex = allEls.indexOf(el);
    const candidates = [];
    view.state.doc.descendants((node, pos) => {
      if (node.type?.name === typeName && node.attrs?.src === targetSrc) {
        candidates.push({ pos, node });
      }
      return true;
    });
    if (candidates.length === 0) return null;
    // el 本身就不在当前 view 内时，无法按序号对齐，宁可返回 null 也不盲取
    if (elIndex < 0) return null;
    if (elIndex < candidates.length) return candidates[elIndex];
    // 序号越界（如 DOM 与 doc 短暂不一致）同样拒绝盲取
    return null;
  } catch {
    return null;
  }
}

function resolveInlineAtPos(doc, pos, typeName) {
  try {
    const $pos = doc.resolve(pos);
    const after = $pos.nodeAfter;
    if (after?.type?.name === typeName) return { pos: $pos.pos, node: after };
    const before = $pos.nodeBefore;
    if (before?.type?.name === typeName) {
      return { pos: $pos.pos - before.nodeSize, node: before };
    }
    const direct = doc.nodeAt(pos);
    if (direct?.type?.name === typeName) return { pos, node: direct };
    if (pos > 0) {
      const prev = doc.nodeAt(pos - 1);
      if (prev?.type?.name === typeName) return { pos: pos - 1, node: prev };
    }
  } catch {
    /* 忽略 */
  }
  return null;
}

function resolveAtCoords(view, el, typeName) {
  try {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return null;
    const coord = view.posAtCoords({
      left: rect.left + rect.width / 2,
      top: rect.top + rect.height / 2,
    });
    if (coord && typeof coord.pos === 'number') {
      return resolveInlineAtPos(view.state.doc, coord.pos, typeName);
    }
  } catch {
    /* 忽略 */
  }
  return null;
}

/**
 * 反查图片节点位置（DOM 身份优先，拒绝同 src 盲匹配）。
 */
export function findImageNodeAndPos(view, imgEl) {
  if (!view || !imgEl) return null;
  const byDom = findNodePosByDOM(view, imgEl, 'image');
  if (byDom) return byDom;

  try {
    const pos = view.posAtDOM(imgEl, 0);
    const hit = resolveInlineAtPos(view.state.doc, pos, 'image');
    if (hit) return hit;
  } catch {
    /* 继续后续回退 */
  }

  const byCoords = resolveAtCoords(view, imgEl, 'image');
  if (byCoords) return byCoords;

  const targetSrc = imgEl.getAttribute?.('src') || imgEl.src;
  return matchBySrcAndIndex(view, imgEl, 'image', targetSrc, 'img');
}

/**
 * 反查视频节点位置（DOM 身份优先，拒绝同 src 盲匹配）。
 */
export function findVideoNodeAndPos(view, videoEl) {
  if (!view || !videoEl) return null;
  const byDom = findNodePosByDOM(view, videoEl, 'video');
  if (byDom) return byDom;

  try {
    const pos = view.posAtDOM(videoEl, 0);
    const hit = resolveInlineAtPos(view.state.doc, pos, 'video');
    if (hit) return hit;
  } catch {
    /* 继续后续回退 */
  }

  const byCoords = resolveAtCoords(view, videoEl, 'video');
  if (byCoords) return byCoords;

  const targetSrc = videoEl.getAttribute?.('src') || videoEl.src;
  return matchBySrcAndIndex(view, videoEl, 'video', targetSrc, 'video');
}

/**
 * 反查多栏容器节点位置（DOM 身份优先）。
 */export function findColumnsNodeAndPos(view, columnsEl) {
  if (!view || !columnsEl) return null;
  const byDom = findNodePosByDOM(view, columnsEl, 'columns');
  if (byDom) return byDom;

  try {
    const pos = view.posAtDOM(columnsEl, 0);
    const $pos = view.state.doc.resolve(pos);
    for (let d = $pos.depth; d >= 0; d -= 1) {
      const node = $pos.node(d);
      if (node && node.type.name === 'columns') {
        return { pos: $pos.before(d), node };
      }
    }
  } catch {
    /* 继续序号回退 */
  }

  // DOM 序号回退：el 脱离当前 view 时返回 null，不盲猜
  try {
    const allColumnsInDoc = Array.from(view.dom.querySelectorAll('.cms-columns'));
    const colIndexInDoc = allColumnsInDoc.indexOf(columnsEl);
    if (colIndexInDoc < 0) return null;
    let currentColIndex = 0;
    let fallbackMatched = null;
    view.state.doc.descendants((n, p) => {
      if (n.type?.name === 'columns') {
        if (currentColIndex === colIndexInDoc) {
          fallbackMatched = { pos: p, node: n };
          return false;
        }
        currentColIndex += 1;
      }
      return true;
    });
    return fallbackMatched;
  } catch {
    return null;
  }
}

/**
 * 反查表格容器节点位置（DOM 身份优先）。
 */
export function findTableNodeAndPos(view, tableEl) {
  if (!view || !tableEl) return null;
  const byDom = findNodePosByDOM(view, tableEl, 'table');
  if (byDom) return byDom;

  try {
    const pos = view.posAtDOM(tableEl, 0);
    const $pos = view.state.doc.resolve(pos);
    for (let d = $pos.depth; d >= 0; d -= 1) {
      const node = $pos.node(d);
      if (node && node.type.name === 'table') {
        return { pos: $pos.before(d), node };
      }
    }
  } catch {
    /* 继续序号回退 */
  }

  try {
    const allTablesInDoc = Array.from(view.dom.querySelectorAll('table'));
    const tableIndexInDoc = allTablesInDoc.indexOf(tableEl);
    if (tableIndexInDoc < 0) return null;
    let currentIndex = 0;
    let fallbackMatched = null;
    view.state.doc.descendants((n, p) => {
      if (n.type?.name === 'table') {
        if (currentIndex === tableIndexInDoc) {
          fallbackMatched = { pos: p, node: n };
          return false;
        }
        currentIndex += 1;
      }
      return true;
    });
    return fallbackMatched;
  } catch {
    return null;
  }
}
