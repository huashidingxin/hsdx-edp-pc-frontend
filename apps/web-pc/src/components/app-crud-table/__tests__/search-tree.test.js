import { describe, expect, it } from 'vitest';

import { searchHighlight } from '../utils/search-tree.js';

describe('searchHighlight', () => {
  it('keeps matching ancestors and does not mutate source rows', () => {
    const source = [
      {
        id: 1,
        name: 'Projects',
        children: [
          { id: 2, name: 'Permission management' },
          { id: 3, name: 'Role management' },
        ],
      },
    ];

    const result = searchHighlight(source, 'permission', undefined, ['name']);

    expect(result).toEqual([
      {
        id: 1,
        name: 'Projects',
        children: [
          {
            id: 2,
            name: '<span class="keyword-highlight">Permission</span> management',
          },
        ],
      },
    ]);
    expect(source[0].children[0].name).toBe('Permission management');
  });

  it('keeps all descendants when the parent matches', () => {
    const result = searchHighlight(
      [{ name: 'System settings', children: [{ name: 'Roles' }] }],
      'system',
      undefined,
      ['name'],
    );

    expect(result[0].children).toEqual([{ name: 'Roles' }]);
  });

  it('escapes regular expression characters and avoids nested highlights', () => {
    const once = searchHighlight(
      [{ name: 'Task (A+) review' }],
      '(A+)',
      undefined,
      ['name'],
    );
    const twice = searchHighlight(once, '(A+)', undefined, ['name']);

    expect(twice[0].name).toBe(
      'Task <span class="keyword-highlight">(A+)</span> review',
    );
  });

  it('supports custom children keys when clearing highlights', () => {
    const source = [
      {
        name: 'Parent',
        nodes: [
          {
            name: '<span class="keyword-highlight">Child</span>',
          },
        ],
      },
    ];

    const result = searchHighlight(source, '', { children: 'nodes' }, ['name']);

    expect(result[0].nodes[0].name).toBe('Child');
    expect(source[0].nodes[0].name).toContain('keyword-highlight');
  });
});
