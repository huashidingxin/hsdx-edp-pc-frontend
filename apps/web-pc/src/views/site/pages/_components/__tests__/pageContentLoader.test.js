import { describe, expect, it, vi } from 'vitest';

import { createContentLoader } from '../pageContentLoader';

/** 一份包含 card / 跨页 / 非静态 provider 的取数配置。 */
function makeSchema() {
  return {
    blocks: {
      hero: {
        provider: 'static_content',
        enabled: true,
        config: { content_key: 'home' },
        editor: {
          type: 'card',
          label: '主视觉',
          fields: { title: { label: '标题' }, image: { label: '图片' } },
        },
      },
      intro: {
        provider: 'static_content',
        enabled: true,
        config: { content_key: 'home', path: ['intro'] },
        editor: { type: 'card', label: '介绍', fields: { title: { label: '标题' } } },
      },
      missing: {
        provider: 'static_content',
        enabled: true,
        config: { content_key: 'home', path: ['nope'] },
        editor: { type: 'card', label: '空块', fields: { title: { label: '标题' } } },
      },
      cross: {
        provider: 'static_content',
        enabled: true,
        config: { content_key: 'home', page_code: 'other_page' },
        editor: { type: 'card', label: '跨页块', fields: { title: { label: '标题' } } },
      },
      banner: {
        provider: 'page_banner',
        enabled: true,
        config: { fallback: 'none' },
      },
    },
  };
}

const CONTENT = {
  hero: { title: 'H', image: 'a.png' },
  intro: { title: 'I' },
  sibling: 'keep-me',
};

function makeLoader(overrides = {}) {
  const fetchSchema = vi.fn(async () => ({ schema: makeSchema() }));
  const fetchContent = vi.fn(async () => CONTENT);

  const loader = createContentLoader({
    fetchSchema,
    fetchContent,
    ...overrides,
  });

  return { loader, fetchSchema, fetchContent };
}

const ctx = { pageId: 73, locale: 'zh-CN', pageCode: 'home' };

describe('pageContentLoader', () => {
  it('每个可编辑分组里的块都有草稿（回归：缺失草稿会让 card 分支崩溃）', async () => {
    const { loader } = makeLoader();
    const { groups, drafts } = await loader.load(ctx);

    const rendered = groups
      .filter((group) => group.editable)
      .flatMap((group) => group.blocks.map((block) => block.blockName));

    expect(rendered.toSorted()).toEqual(['hero', 'intro', 'missing']);
    for (const name of rendered) {
      // 关键不变量：渲染得到的块必须有草稿，且绝不是 undefined。
      expect(drafts[name]).toBeDefined();
    }
  });

  it('card 草稿始终是对象，即使数据缺失', async () => {
    const { loader } = makeLoader();
    const { drafts } = await loader.load(ctx);

    // hero 的 path 为空 → 整份 data
    expect(drafts.hero).toEqual(CONTENT);
    // intro 取 path=['intro']
    expect(drafts.intro).toEqual({ title: 'I' });
    // 路径不存在 → 仍返回 {}，模板取属性不会抛错
    expect(drafts.missing).toEqual({});
  });

  it('跨页块所在分组不可编辑，且不产生草稿', async () => {
    const { loader } = makeLoader();
    const { groups, drafts } = await loader.load(ctx);

    const crossGroup = groups.find((group) =>
      group.blocks.some((block) => block.blockName === 'cross'),
    );
    expect(crossGroup.editable).toBe(false);
    expect(drafts).not.toHaveProperty('cross');
  });

  it('只为可编辑分组拉取内容，且非 static_content 的块被忽略', async () => {
    const { loader, fetchContent } = makeLoader();
    const { groups, meta } = await loader.load(ctx);

    // 两个分组：本页 home::home（可编辑）+ 跨页 other_page::home（不可编辑）
    expect(groups).toHaveLength(2);
    expect(fetchContent).toHaveBeenCalledTimes(1);
    expect(fetchContent.mock.calls[0][0]).toMatchObject({
      pageId: 73,
      locale: 'zh-CN',
      contentKey: 'home',
    });
    // page_banner 不是静态块，不进入描述集
    expect(meta).not.toHaveProperty('banner');
  });

  it('内容接口失败时草稿仍然已定义（降级为空形状而非 undefined）', async () => {
    const { loader } = makeLoader({
      fetchContent: vi.fn(async () => {
        throw new Error('network down');
      }),
    });

    const { drafts, data } = await loader.load(ctx);

    expect(data['home::home']).toBeNull();
    for (const name of ['hero', 'intro', 'missing']) {
      expect(drafts[name]).toBeDefined();
    }
  });

  it('没有取数配置时返回空快照', async () => {
    const { loader, fetchContent } = makeLoader({
      fetchSchema: vi.fn(async () => null),
    });

    const { schema, groups, drafts, meta } = await loader.load(ctx);

    expect(schema).toBeNull();
    expect(groups).toEqual([]);
    expect(drafts).toEqual({});
    expect(meta).toEqual({});
    expect(fetchContent).not.toHaveBeenCalled();
  });

  it('groups 与 drafts 来自同一次快照，二者始终一致', async () => {
    const { loader } = makeLoader();
    const snapshot = await loader.load(ctx);

    // 同一对象里一起返回 → 结构上不可能出现「有分组、无草稿」的中间态
    expect(Object.keys(snapshot)).toEqual([
      'schema',
      'groups',
      'meta',
      'data',
      'drafts',
    ]);

    for (const group of snapshot.groups) {
      for (const block of group.blocks) {
        const hasDraft = Object.hasOwn(snapshot.drafts, block.blockName);
        expect(hasDraft).toBe(group.editable);
      }
    }
  });
});
