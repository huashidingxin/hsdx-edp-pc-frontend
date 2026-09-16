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

  /**
   * 回归：草稿与基线**不能共享引用**。
   *
   * `unwrap` 的 default 分支原样返回入参，所以不深拷贝的话 `drafts[name]`
   * 与 `data[key]` 里的值就是同一个对象。用户改草稿 = 改基线，
   * 于是 `isDirty` 恒为 false、保存按钮永远点不动（浏览器实测复现过）。
   */
  it('草稿是基线的深拷贝，改草稿不会污染基线', async () => {
    const { loader } = makeLoader();
    const { drafts, data } = await loader.load(ctx);
    // intro 的 path 是 ['intro'] → 草稿就是那个子对象
    const baseline = data['home::home'].intro;

    expect(drafts.intro).not.toBe(baseline);
    expect(drafts.intro).toEqual(baseline);

    drafts.intro.title = '改过了';
    expect(baseline.title).toBe('I');
  });

  it('路径为空的块：草稿是整份内容的副本，同样不共享引用', async () => {
    const { loader } = makeLoader();
    const { drafts, data } = await loader.load(ctx);
    const baseline = data['home::home'];

    // hero 没有 path → 草稿是整份 data
    expect(drafts.hero).toEqual(CONTENT);
    expect(drafts.hero).not.toBe(baseline);

    drafts.hero.hero.title = '改过了';
    expect(baseline.hero.title).toBe('H');
  });

  it('嵌套的对象/数组也被深拷贝隔离（浅拷贝会漏掉）', async () => {
    const nested = {
      hero: {
        title: 'H',
        actions: [{ label: '提交', href: '/a' }],
        items: [{ name: 'n', tags: ['x'] }],
      },
    };
    const { loader } = makeLoader({
      fetchSchema: vi.fn(async () => ({
        schema: {
          blocks: {
            hero: {
              provider: 'static_content',
              enabled: true,
              // 带 path，草稿才是那个嵌套对象本身
              config: { content_key: 'home', path: ['hero'] },
            },
          },
        },
      })),
      fetchContent: vi.fn(async () => nested),
    });

    const { drafts, data } = await loader.load(ctx);
    const baseline = data['home::home'].hero;

    // 没有 editor 提示 → 'auto' → 原样对象，但必须是副本
    expect(drafts.hero).not.toBe(baseline);
    expect(drafts.hero.actions[0]).not.toBe(baseline.actions[0]);
    expect(drafts.hero.items[0].tags).not.toBe(baseline.items[0].tags);

    drafts.hero.actions[0].label = '改了';
    drafts.hero.items[0].tags.push('y');
    expect(baseline.actions[0].label).toBe('提交');
    expect(baseline.items[0].tags).toEqual(['x']);
  });

  it('没有 editor 提示的块，草稿是对象本身而不是 JSON 文本', async () => {
    const { loader } = makeLoader({
      fetchSchema: vi.fn(async () => ({
        schema: {
          blocks: {
            intro: {
              provider: 'static_content',
              enabled: true,
              config: { content_key: 'home', path: ['intro'] },
            },
          },
        },
      })),
    });

    const { drafts } = await loader.load(ctx);

    // 这是图形表单的前提：草稿必须是可递归渲染的对象
    expect(typeof drafts.intro).toBe('object');
    expect(drafts.intro).toEqual({ title: 'I' });
  });
});
