/**
 * 构建 VXE Grid 列配置
 *
 * 执行步骤：
 * 1. 复制源列；将 width: 0|null 归一为 undefined
 * 2. 处理 customRender：type === 'image' → cellRender = { name: 'CellImage', props: { width: 36, height: 36 } }
 *    其它 → cellRender = { name: 'CellRender', customRender }；保留写好的 cellRender 不被覆盖
 * 3. 应用 columnFormat(columns)（恰好一次）
 * 4. 收集 columnSlots（除 _action 列外所有 slots.* ）
 * 5. 若 _action 列不存在且 showActions === true，则尾部追加操作列
 * 6. 返回 { columns, columnSlots }
 *
 * @param {Array} sourceColumns - 来自 props.gridOptions.columns
 * @param {{ showActions?: boolean, columnFormat?: Function|null, idKey?: string }} ctx
 * @returns {{ columns: Array, columnSlots: Record<string, string> }}
 */
export function buildColumns(sourceColumns, ctx = {}) {
  const { showActions = true, columnFormat = null, idKey = 'id' } = ctx;
  const columns = (sourceColumns || []).map((col) => {
    const c = { ...col };

    // 1. width = 0 | null 归一为 undefined
    if (c.width === 0 || c.width === null) {
      c.width = undefined;
    }

    // 2. customRender → cellRender 映射（保留已写好的 cellRender 不被覆盖）
    if (c.customRender && !c.cellRender) {
      if (c.customRender.type === 'image') {
        c.cellRender = {
          name: 'CellImage',
          props: {
            width: 36,
            height: 36,
            ...(c.customRender.props || {}),
          },
        };
      } else {
        c.cellRender = {
          name: 'CellRender',
          customRender: c.customRender,
        };
      }
    }

    return c;
  });

  // 3. 应用 columnFormat（恰好一次）
  if (typeof columnFormat === 'function') {
    columnFormat(columns);
  }

  // 4. 收集 columnSlots（除 _action 列外所有 slots.*）
  const columnSlots = {};
  for (const col of columns) {
    if (col.field === '_action') continue;
    if (col.slots) {
      for (const slotType of Object.values(col.slots)) {
        if (typeof slotType === 'string' && slotType) {
          columnSlots[slotType] = slotType;
        }
      }
    }
  }

  // 5. 追加 _action 操作列
  const hasActionCol = columns.some((c) => c.field === '_action');
  if (showActions && !hasActionCol) {
    columns.push({
      title: '操作',
      field: '_action',
      width: 180,
      fixed: 'right',
      slots: { default: 'default_action' },
    });
  }

  return { columns, columnSlots };
}
