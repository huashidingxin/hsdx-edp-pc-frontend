import { describe, expect, it, vi } from 'vitest';

vi.mock('vue-router', () => ({ useRouter: vi.fn() }));
vi.mock('@vben/common-ui', () => ({
  useVbenDrawer: vi.fn(),
  useVbenModal: vi.fn(),
}));
vi.mock('@vben/hooks', () => ({ useTabs: vi.fn() }));
vi.mock('antdv-next', () => ({ message: { error: vi.fn() } }));
vi.mock('#/api/resource', () => ({ default: class Resource {} }));

import { resolveOpenMode } from '../composables/useCrudTableDetail.js';

describe('resolveOpenMode', () => {
  it.each(['modal', 'drawer', 'page'])(
    'keeps supported mode %s in a top-level route',
    (mode) => {
      expect(resolveOpenMode(mode)).toBe(mode);
    },
  );

  it('uses a drawer instead of a page for nested details', () => {
    expect(resolveOpenMode('page', { isNested: true })).toBe('drawer');
  });

  it('falls back to a modal for missing or invalid modes', () => {
    expect(resolveOpenMode()).toBe('modal');
    expect(resolveOpenMode('window')).toBe('modal');
  });
});
