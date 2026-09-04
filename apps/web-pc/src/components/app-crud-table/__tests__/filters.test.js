import { nextTick } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import { useCrudTableFilters } from '../composables/useCrudTableFilters.js';

function createFilters(overrides = {}) {
  const props = {
    excludeFilters: ['hidden'],
    filterCollapseRows: 1,
    filterExpandDefault: false,
    filterActionable: true,
    filterFields: [
      { col: 12, default: 'active', field: 'state' },
      { col: 12, field: 'keyword' },
      { col: 8, field: 'owner' },
      { col: 8, field: 'hidden' },
    ],
    ...overrides,
  };
  const emit = vi.fn();
  const handlePageData = vi.fn();
  const dataApi = {
    gridOptions: { pagerConfig: { currentPage: 4 } },
    handlePageData,
  };
  return {
    api: useCrudTableFilters(props, { emit }, dataApi),
    dataApi,
    emit,
    handlePageData,
  };
}

describe('useCrudTableFilters', () => {
  it('computes collapsed fields by grid capacity and exclusions', () => {
    const { api } = createFilters();

    expect(api.visibleFilterFields.value.map((field) => field.field)).toEqual([
      'state',
    ]);
    expect(api.canToggleExpand.value).toBe(true);
    api.toggleExpand();
    expect(api.visibleFilterFields.value.map((field) => field.field)).toEqual([
      'state',
      'keyword',
      'owner',
    ]);
  });

  it('does not expose expand controls when fields fit or actions are hidden', () => {
    const fitting = createFilters({
      filterFields: [
        { col: 6, field: 'one' },
        { col: 6, field: 'two' },
        { col: 6, field: 'three' },
      ],
    });

    expect(fitting.api.canToggleExpand.value).toBe(false);
    expect(fitting.api.visibleFilterFields.value).toHaveLength(3);

    const exactlyOneRow = createFilters({
      filterFields: [
        { col: 12, field: 'left' },
        { col: 12, field: 'right' },
      ],
    });
    expect(exactlyOneRow.api.canToggleExpand.value).toBe(false);
    expect(exactlyOneRow.api.visibleFilterFields.value).toHaveLength(2);

    const withoutActions = createFilters({ filterActionable: false });
    expect(withoutActions.api.canToggleExpand.value).toBe(false);
    expect(withoutActions.api.visibleFilterFields.value).toHaveLength(3);
  });

  it('applies, resets, and emits filter state', async () => {
    const { api, dataApi, emit, handlePageData } = createFilters();

    api.setFilterState({ keyword: 'bridge', state: 'disabled' });
    await nextTick();
    expect(emit).toHaveBeenCalledWith('update:filters', {
      hidden: undefined,
      keyword: 'bridge',
      owner: undefined,
      state: 'disabled',
    });

    api.apply();
    expect(dataApi.gridOptions.pagerConfig.currentPage).toBe(1);
    expect(handlePageData).toHaveBeenCalledOnce();

    api.reset();
    expect(api.filters.value).toEqual({
      hidden: undefined,
      keyword: undefined,
      owner: undefined,
      state: 'active',
    });
    expect(handlePageData).toHaveBeenCalledTimes(2);
  });
});
