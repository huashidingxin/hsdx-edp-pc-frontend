import { useAccess } from '@vben/access';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCrudTablePermission } from '../composables/useCrudTablePermission.js';

vi.mock('@vben/access', () => ({
  useAccess: vi.fn(),
}));

const baseProps = {
  permissionName: 'project',
  superRoleExcludeActions: [],
  superRoles: [],
};

describe('useCrudTablePermission', () => {
  beforeEach(() => {
    vi.mocked(useAccess).mockReset();
  });

  it('checks dot-notation action codes and permission-name overrides', () => {
    const hasAccessByCodes = vi.fn((codes) => codes[0] === 'project.edit');
    vi.mocked(useAccess).mockReturnValue({
      hasAccessByCodes,
      hasAccessByRoles: () => false,
    });
    const permission = useCrudTablePermission(baseProps);

    expect(permission.checkPermission('edit')).toBe(true);
    expect(permission.checkPermission('delete')).toBe(false);
    expect(permission.checkPermission('edit', 'staff')).toBe(false);
    expect(hasAccessByCodes).toHaveBeenCalledWith(['staff.edit']);
  });

  it('allows super roles except for explicitly excluded actions', () => {
    vi.mocked(useAccess).mockReturnValue({
      hasAccessByCodes: () => false,
      hasAccessByRoles: (roles) => roles.includes('Super Admin'),
    });
    const permission = useCrudTablePermission({
      ...baseProps,
      superRoleExcludeActions: ['delete'],
      superRoles: ['Super Admin'],
    });

    expect(permission.isSuperRole.value).toBe(true);
    expect(permission.checkPermission('edit')).toBe(true);
    expect(permission.checkPermission('delete')).toBe(false);
  });

  it('combines row visibility with action permissions', () => {
    vi.mocked(useAccess).mockReturnValue({
      hasAccessByCodes: (codes) => codes.includes('project.audit'),
      hasAccessByRoles: () => false,
    });
    const permission = useCrudTablePermission(baseProps);
    const row = { state: 'submitted' };

    expect(
      permission.checkItemAction(
        (item) => item.state === 'submitted',
        row,
        'audit',
      ),
    ).toBe(true);
    expect(permission.checkItemAction(false, row, 'audit')).toBe(false);
    expect(permission.checkItemAction(true, row, 'delete')).toBe(false);
  });

  it('falls back to allowing actions when access context is unavailable', () => {
    vi.mocked(useAccess).mockImplementation(() => {
      throw new Error('No active application context');
    });

    const permission = useCrudTablePermission(baseProps);

    expect(permission.checkPermission('delete')).toBe(true);
  });
});
