import { describe, expect, it, vi } from 'vitest';

vi.mock('../composables/useCrudTablePermission.js', () => ({
  useCrudTablePermission: () => ({ checkPermission: () => true }),
}));

import { useCrudTableActions } from '../composables/useCrudTableActions.js';

function createApi(overrides = {}) {
  const callbacks = {
    audit: vi.fn(),
    deleteItem: vi.fn(),
    openAuditDialog: vi.fn(),
    openDetail: vi.fn(),
    refresh: vi.fn(),
    reload: vi.fn(),
  };
  const props = {
    idKey: 'id',
    permissionName: 'project',
    inlineActions: ['view', 'edit', 'delete'],
    actionsConfig: [],
    actionOverflow: 'more',
    maxInlineActions: 3,
    ...overrides,
  };
  const permissionApi = { checkPermission: () => true };
  const api = useCrudTableActions(props, { emit: vi.fn() }, callbacks, permissionApi);
  return { api, callbacks, props };
}

describe('action overflow policy', () => {
  it('wrap mode flattens all visible actions inline and keeps more empty', () => {
    // 启用全部 5 个内置 action：让 audit / reverse_audit 可见
    const { api } = createApi({
      inlineActions: ['view', 'edit', 'delete', 'audit', 'reverse_audit'],
      actionOverflow: 'wrap',
    });
    const row = { id: 1, audit_id: null, audit_status: 1 };
    const { inline, more } = api.resolveRowActions(row);

    expect(inline.map((a) => a.key)).toEqual([
      'view',
      'edit',
      'delete',
      'audit',
      'reverse_audit',
    ]);
    expect(more).toHaveLength(0);
  });

  it('more mode keeps the split when inline count is within the threshold', () => {
    const { api } = createApi({
      inlineActions: ['view', 'edit', 'delete'],
      actionOverflow: 'more',
      maxInlineActions: 3,
    });
    const row = { id: 1, audit_id: 1, audit_status: 0 };
    const { inline, more } = api.resolveRowActions(row);

    expect(inline.map((a) => a.key)).toEqual(['view', 'edit', 'delete']);
    expect(more).toHaveLength(0);
  });

  it('more mode pushes extra inline actions (by order) into the more menu', () => {
    const { api } = createApi({
      inlineActions: ['view', 'edit', 'delete', 'audit', 'reverse_audit'],
      actionOverflow: 'more',
      maxInlineActions: 3,
    });
    const row = { id: 1, audit_id: null, audit_status: 1 };
    const { inline, more } = api.resolveRowActions(row);

    // order 升序：view(10) edit(20) delete(30) 留在 inline
    expect(inline.map((a) => a.key)).toEqual(['view', 'edit', 'delete']);
    // audit(40) reverse_audit(50) 被收进更多
    expect(more.map((a) => a.key)).toEqual(['audit', 'reverse_audit']);
  });

  it('more mode merges overflowed inline actions with the original more group', () => {
    const { api } = createApi({
      inlineActions: ['view', 'edit', 'delete', 'audit'],
      actionsConfig: [
        { key: 'export', label: '导出', order: 60, onClick: () => {} },
      ],
      actionOverflow: 'more',
      maxInlineActions: 2,
    });
    // reverse_audit 因 audit_status=1 可见，且不在 inlineActions 内 → 归入原 more 组
    const row = { id: 1, audit_id: null, audit_status: 1 };
    const { inline, more } = api.resolveRowActions(row);

    // 仅保留 order 最小的前 2 个 inline：view / edit
    expect(inline.map((a) => a.key)).toEqual(['view', 'edit']);
    // delete(30) audit(40) 转入更多；reverse_audit(50) 本属 more；export(60) 也在 more
    expect(more.map((a) => a.key)).toEqual([
      'delete',
      'audit',
      'reverse_audit',
      'export',
    ]);
  });

  it('maxInlineActions falls back to 3 for invalid values', () => {
    const { api } = createApi({
      inlineActions: ['view', 'edit', 'delete', 'audit', 'reverse_audit'],
      actionOverflow: 'more',
      maxInlineActions: 'NaN-like',
    });
    const row = { id: 1, audit_id: null, audit_status: 1 };
    const { inline, more } = api.resolveRowActions(row);

    expect(inline).toHaveLength(3);
    expect(more).toHaveLength(2);
  });
});
