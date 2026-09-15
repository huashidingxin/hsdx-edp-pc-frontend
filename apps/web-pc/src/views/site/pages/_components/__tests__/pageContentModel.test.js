import { describe, expect, it } from 'vitest';

import {
  describeStaticBlocks,
  getAtPath,
  groupByContentKey,
  isValidBlockName,
  parseJsonText,
  setAtPath,
  toSchemaPayload,
  validateBlock,
  validateSchema,
} from '../pageContentModel';

const staticSchema = {
  blocks: {
    nav: {
      provider: 'static_content',
      config: { content_key: 'home', path: ['nav'] },
    },
    about: {
      provider: 'static_content',
      config: { content_key: 'home', path: ['about'] },
    },
    service: {
      provider: 'model',
      config: { type: 'product', mode: 'list', limit: 4 },
    },
    hero: { provider: 'page_banner', config: { fallback: 'static_template' } },
    shared: {
      provider: 'static_content',
      config: { content_key: 'service_shared', page_code: 'services' },
    },
  },
};

describe('getAtPath / setAtPath', () => {
  it('按路径读取子值，缺省路径返回整份数据', () => {
    const data = { nav: [{ key: 'a' }], about: { title: '关于' } };
    expect(getAtPath(data, [])).toBe(data);
    expect(getAtPath(data, ['about', 'title'])).toBe('关于');
    expect(getAtPath(data, ['nav', 0, 'key'])).toBe('a');
    expect(getAtPath(data, ['missing', 'deep'])).toBeUndefined();
  });

  it('写入只替换目标路径并保留所有兄弟路径', () => {
    const data = {
      nav: [{ key: 'a' }],
      about: { title: '关于', body: '简介' },
      footer: { copyright: '©' },
    };
    const next = setAtPath(data, ['about', 'title'], '新标题');
    expect(next.about).toEqual({ title: '新标题', body: '简介' });
    expect(next.nav).toEqual([{ key: 'a' }]);
    expect(next.footer).toEqual({ copyright: '©' });
    // 不修改入参
    expect(data.about.title).toBe('关于');
  });

  it('空路径整份替换', () => {
    expect(setAtPath({ a: 1 }, [], ['x'])).toEqual(['x']);
  });

  it('缺失中间层按下一个 key 的类型补容器', () => {
    expect(setAtPath({}, ['a', 'b'], 1)).toEqual({ a: { b: 1 } });
    expect(setAtPath({}, ['list', 0, 'title'], 't')).toEqual({
      list: [{ title: 't' }],
    });
  });

  it('多个块引用同一内容行的不同路径互不影响', () => {
    let data = { nav: [{ key: 'a' }], about: { title: '关于' } };
    data = setAtPath(data, ['about', 'title'], '新关于');
    data = setAtPath(data, ['nav'], [{ key: 'b' }]);
    expect(data).toEqual({ nav: [{ key: 'b' }], about: { title: '新关于' } });
  });
});

describe('describeStaticBlocks / groupByContentKey', () => {
  it('只挑出声明了 content_key 的 static_content 块', () => {
    const descriptors = describeStaticBlocks(staticSchema, 'home');
    expect(descriptors.map((d) => d.blockName).toSorted()).toEqual([
      'about',
      'nav',
      'shared',
    ]);
  });

  it('跨页引用标记为不可编辑，本页块可编辑', () => {
    const descriptors = describeStaticBlocks(staticSchema, 'home');
    const groups = groupByContentKey(descriptors, 'home');
    const homeGroup = groups.find((g) => g.contentKey === 'home');
    const sharedGroup = groups.find((g) => g.contentKey === 'service_shared');
    expect(homeGroup.editable).toBe(true);
    expect(homeGroup.blocks.map((b) => b.blockName).toSorted()).toEqual([
      'about',
      'nav',
    ]);
    expect(sharedGroup.editable).toBe(false);
    expect(sharedGroup.pageCode).toBe('services');
  });

  it('缺省 editor 时用块名兜底 label', () => {
    const descriptors = describeStaticBlocks(staticSchema, 'home');
    expect(descriptors.find((d) => d.blockName === 'nav').label).toBe('nav');
  });

  it('忽略缺 content_key 的静态块，缺省 path 归零为 []', () => {
    const descriptors = describeStaticBlocks(
      {
        blocks: {
          nokey: { provider: 'static_content', config: { path: ['x'] } },
          shared: {
            provider: 'static_content',
            config: { content_key: 'service_shared', page_code: 'services' },
          },
        },
      },
      'home',
    );
    expect(descriptors.map((d) => d.blockName)).toEqual(['shared']);
    expect(descriptors[0].path).toEqual([]);
  });

  it('page_code 显式等于本页时与缺省 page_code 归入同一内容行', () => {
    const descriptors = describeStaticBlocks(
      {
        blocks: {
          nav: {
            provider: 'static_content',
            config: { content_key: 'home', path: ['nav'] },
          },
          samepage: {
            provider: 'static_content',
            config: { content_key: 'home', page_code: 'home', path: ['same'] },
          },
        },
      },
      'home',
    );
    expect(descriptors.every((d) => d.isCurrentPage)).toBe(true);
    const groups = groupByContentKey(descriptors, 'home');
    expect(groups).toHaveLength(1);
    expect(groups[0].editable).toBe(true);
    expect(groups[0].blocks.map((b) => b.blockName).toSorted()).toEqual([
      'nav',
      'samepage',
    ]);
  });
});

describe('validateBlock', () => {
  it('接受合法的三类 provider 配置', () => {
    expect(
      validateBlock('service', {
        provider: 'model',
        config: { type: 'product', mode: 'list', limit: 4 },
      }),
    ).toEqual([]);
    expect(
      validateBlock('nav', {
        provider: 'static_content',
        config: { content_key: 'home', path: ['nav'] },
      }),
    ).toEqual([]);
    expect(
      validateBlock('hero', {
        provider: 'page_banner',
        config: { fallback: 'static_template' },
      }),
    ).toEqual([]);
  });

  it('拒绝非法块名与未知 provider', () => {
    expect(isValidBlockName('Home')).toBe(false);
    expect(isValidBlockName('service_ai')).toBe(true);
    expect(validateBlock('Bad', { provider: 'model', config: {} }).length).toBeGreaterThan(0);
    expect(
      validateBlock('x', { provider: 'home_service', config: {} }),
    ).toContain('provider 必须是 model / static_content / page_banner');
  });

  it('拒绝块内未知键与错误 enabled 类型', () => {
    expect(
      validateBlock('x', { provider: 'page_banner', config: {}, extra: 1 }),
    ).toContain('块只接受 provider/config/enabled/editor，发现 extra');
    expect(
      validateBlock('x', { provider: 'page_banner', config: {}, enabled: 'yes' }),
    ).toContain('enabled 必须是布尔值');
  });

  it('model 的 one/list 互斥字段与 limit 范围', () => {
    expect(
      validateBlock('x', { provider: 'model', config: { type: 'product', mode: 'one', limit: 3 } }),
    ).toContain('model.mode=one 不接受 limit');
    expect(
      validateBlock('x', {
        provider: 'model',
        config: { type: 'product', mode: 'list', id: 1 },
      }),
    ).toContain('model.mode=list 不接受 id/id_param');
    expect(
      validateBlock('x', {
        provider: 'model',
        config: { type: 'product', mode: 'list', limit: 101 },
      }),
    ).toContain('model.limit 必须是 1..100 的整数');
    expect(
      validateBlock('x', {
        provider: 'model',
        config: { type: 'product', mode: 'one', id: 1, id_param: 'card_id' },
      }),
    ).toContain('model.id 与 model.id_param 互斥');
  });

  it('static_content 必须声明 content_key', () => {
    expect(validateBlock('x', { provider: 'static_content', config: {} })).toContain(
      'static_content.content_key 不能为空',
    );
  });

  it('editor 仅允许 static_content，且 card/cards 必须给 fields', () => {
    expect(
      validateBlock('x', {
        provider: 'model',
        config: { type: 'product', mode: 'list' },
        editor: { type: 'json', label: 'x' },
      }),
    ).toContain('editor 只能配置在 static_content 块上');

    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home' },
        editor: { type: 'cards', label: '卡片组' },
      }),
    ).toContain('card/cards 必须配置 fields 及字段 label');

    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home' },
        editor: {
          type: 'cards',
          label: '卡片组',
          fields: { title: { label: '标题' }, nope: { label: '不支持' } },
        },
      }),
    ).toContain('editor.type=cards 不支持字段 nope');
  });

  it('editor 的 label 必填且不超过 160 字', () => {
    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home' },
        editor: { type: 'json', label: '   ' },
      }),
    ).toContain('editor.label 必填且不超过 160 字');
    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home' },
        editor: { type: 'json', label: 'x'.repeat(161) },
      }),
    ).toContain('editor.label 必填且不超过 160 字');
  });

  // 以下规则对齐后端 ModelProvider / StaticContentProvider / PageBannerProvider，
  // 目的是把 422 提前到本地，避免用户保存后才看到错误。
  it('model 拒绝 null 值与未知字段', () => {
    expect(
      validateBlock('x', {
        provider: 'model',
        config: { type: 'product', mode: 'list', limit: null },
      }),
    ).toContain('model.limit 不接受 null，请省略');
    expect(
      validateBlock('x', {
        provider: 'model',
        config: { type: 'product', mode: 'list', zzz: 1 },
      }),
    ).toContain('model.config 含未知字段：zzz');
  });

  it('model.id 必须正整数，id_param 有格式与保留名约束', () => {
    expect(
      validateBlock('x', {
        provider: 'model',
        config: { type: 'product', mode: 'one', id: -1 },
      }),
    ).toContain('model.id 必须是正整数');
    expect(
      validateBlock('x', {
        provider: 'model',
        config: { type: 'product', mode: 'one', id_param: 'Card-Id' },
      }),
    ).toContain('model.id_param 必须匹配 [a-z][a-z0-9_]*');
    expect(
      validateBlock('x', {
        provider: 'model',
        config: { type: 'product', mode: 'one', id_param: 'locale' },
      }),
    ).toContain('model.id_param 不能使用保留名 locale');
  });

  it('static_content 拒绝未知字段、空 page_code、非法 path', () => {
    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home', zzz: 1 },
      }),
    ).toContain('static_content.config 含未知字段：zzz');
    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home', page_code: '  ' },
      }),
    ).toContain('static_content.page_code 必须为非空字符串');
    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home', path: Array.from({ length: 33 }, () => 'a') },
      }),
    ).toContain('static_content.path 最多 32 层');
    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home', path: ['a', ''] },
      }),
    ).toContain('static_content.path 只接受非空字符串或非负整数');
    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home', path: ['list', 0, 'title'] },
      }),
    ).toEqual([]);
  });

  it('page_banner 拒绝未知字段与非法 fallback', () => {
    expect(
      validateBlock('x', {
        provider: 'page_banner',
        config: { fallback: 'none', zzz: 1 },
      }),
    ).toContain('page_banner.config 含未知字段：zzz');
    expect(
      validateBlock('x', { provider: 'page_banner', config: { fallback: 'bad' } }),
    ).toContain('page_banner.fallback 只能是 none 或 static_template');
  });
});

describe('validateSchema / toSchemaPayload', () => {
  it('顶层只能包含 blocks', () => {
    expect(validateSchema({ blocks: {}, extra: 1 })).toEqual([
      { block: '-', message: '配置顶层只能包含 blocks' },
    ]);
    expect(validateSchema({ blocks: [] })).toEqual([
      { block: '-', message: 'blocks 必须是具名对象（不接受数组或 null）' },
    ]);
  });

  it('空 blocks 合法', () => {
    expect(validateSchema({ blocks: {} })).toEqual([]);
    expect(toSchemaPayload({})).toEqual({ blocks: {} });
  });

  it('汇总各块错误并带块名', () => {
    const errors = validateSchema({
      blocks: {
        Bad: { provider: 'model', config: {} },
        nav: { provider: 'static_content', config: { content_key: 'home' } },
      },
    });
    expect(errors.every((e) => e.block === 'Bad')).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('parseJsonText', () => {
  it('合法与非法 JSON 都返回结构化结果', () => {
    expect(parseJsonText('{"a":1}')).toEqual({ ok: true, value: { a: 1 }, error: null });
    const bad = parseJsonText('{a:');
    expect(bad.ok).toBe(false);
    expect(bad.error).toBeTruthy();
  });
});
