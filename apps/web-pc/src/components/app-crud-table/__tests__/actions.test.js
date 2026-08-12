import { describe, expect, it, vi } from 'vitest';

import {
  buildBuiltinActionDefs,
  resolveBool,
} from '../utils/action-types.js';

function createActions() {
  const callbacks = {
    audit: vi.fn(),
    deleteItem: vi.fn(),
    openAuditDialog: vi.fn(),
    openDetail: vi.fn(),
    refresh: vi.fn(),
    reload: vi.fn(),
  };
  const actions = buildBuiltinActionDefs({
    callbacks,
    props: { idKey: 'uuid' },
  });
  return { actions, callbacks };
}

describe('built-in CRUD actions', () => {
  it('uses the canonical edit and audit permission actions', () => {
    const { actions } = createActions();

    expect(actions.find((item) => item.key === 'edit').permission).toBe('edit');
    expect(actions.find((item) => item.key === 'audit').permission).toBe(
      'audit',
    );
    expect(
      actions.find((item) => item.key === 'reverse_audit').permission,
    ).toBe('audit');
  });

  it('passes the configured identity and edit state to detail callbacks', () => {
    const { actions, callbacks } = createActions();
    const row = { uuid: 'project-1' };

    actions.find((item) => item.key === 'view').onClick(row);
    actions.find((item) => item.key === 'edit').onClick(row);

    expect(callbacks.openDetail).toHaveBeenNthCalledWith(
      1,
      'project-1',
      false,
      null,
      row,
    );
    expect(callbacks.openDetail).toHaveBeenNthCalledWith(
      2,
      'project-1',
      true,
      null,
      row,
    );
  });

  it('shows audit actions only for their matching audit state', () => {
    const { actions } = createActions();
    const audit = actions.find((item) => item.key === 'audit');
    const reverseAudit = actions.find((item) => item.key === 'reverse_audit');

    expect(audit.visible({ audit_id: null })).toBe(true);
    expect(audit.visible({ audit_id: 5 })).toBe(false);
    expect(reverseAudit.visible({ audit_status: 1 })).toBe(true);
    expect(reverseAudit.visible({ audit_status: 0 })).toBe(false);
  });

  it('resolves static and callback boolean values', () => {
    expect(resolveBool(undefined, {}, false)).toBe(false);
    expect(resolveBool(1, {})).toBe(true);
    expect(resolveBool((row) => row.enabled, { enabled: false })).toBe(false);
  });
});
