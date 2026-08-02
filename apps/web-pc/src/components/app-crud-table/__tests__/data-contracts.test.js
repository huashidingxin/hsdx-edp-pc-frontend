import { describe, expect, it, vi } from 'vitest';

import { buildApiUrl } from '../utils/api-url.js';
import { buildColumns } from '../utils/columns.js';
import { expandDotKeys, flattenDotFieldValues } from '../utils/dot-keys.js';
import { mergeListParams } from '../utils/merge-list-params.js';

describe('CRUD data contracts', () => {
  it('uses prefixes only for collection endpoints', () => {
    const resource = { apiPrefix: 'project/10', apiUrl: 'tasks' };

    expect(buildApiUrl(resource, true)).toBe('project/10/tasks');
    expect(buildApiUrl(resource, false)).toBe('tasks');
  });

  it('merges list parameters in the documented priority order', () => {
    expect(
      mergeListParams({
        extraQuery: { page: 8, project_id: 1, state: 'extra' },
        filterState: { state: 'active' },
        page: 2,
        perPage: 30,
        routeQuery: { project_id: 9, scope: 7 },
        scope: 3,
        sortBy: [{ key: 'created_at', order: 'desc' }],
      }),
    ).toEqual({
      page: 2,
      per_page: 30,
      project_id: 1,
      scope: 3,
      sort_by: '[{"key":"created_at","order":"desc"}]',
      state: 'active',
    });
  });

  it('does not serialize an empty sort as a string value', () => {
    expect(mergeListParams({ sortBy: [] }).sort_by).toBeUndefined();
  });

  it('round-trips declared dot fields without mutating the source', () => {
    const source = { id: 1, staff: { name: 'Zhang' } };
    const flat = flattenDotFieldValues(source, ['staff.name']);
    const expanded = expandDotKeys(flat);

    expect(flat['staff.name']).toBe('Zhang');
    expect(expanded).toEqual(source);
    expect(source).toEqual({ id: 1, staff: { name: 'Zhang' } });
  });

  it('normalizes columns and adds exactly one action column', () => {
    const columnFormat = vi.fn((columns) => {
      columns[0].title = 'Project name';
    });
    const { columns, columnSlots } = buildColumns(
      [
        {
          customRender: { type: 'image' },
          field: 'avatar',
          slots: { default: 'avatar' },
          width: 0,
        },
      ],
      { columnFormat, showActions: true },
    );

    expect(columnFormat).toHaveBeenCalledOnce();
    expect(columns[0]).toMatchObject({
      cellRender: {
        name: 'CellImage',
        props: { height: 36, width: 36 },
      },
      title: 'Project name',
      width: undefined,
    });
    expect(columns.filter((column) => column.field === '_action')).toHaveLength(
      1,
    );
    expect(columnSlots).toEqual({ avatar: 'avatar' });
  });
});
