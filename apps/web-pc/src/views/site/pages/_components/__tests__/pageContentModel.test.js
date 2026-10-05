import { describe, expect, it } from 'vitest';

import {
  comparableValue,
  deepClone,
  describeStaticBlocks,
  formatJson,
  getAtPath,
  groupByContentKey,
  isDraftDirty,
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

  it('editor 仅允许 static_content；类型只剩 object/array；fields 可选', () => {
    expect(
      validateBlock('x', {
        provider: 'model',
        config: { type: 'product', mode: 'list' },
        editor: { type: 'array', label: 'x' },
      }),
    ).toContain('editor 只能配置在 static_content 块上');

    // 自由 JSON 编辑类型已从协议移除（§1.2A）。
    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home' },
        editor: { type: 'json', label: 'x' },
      }),
    ).toContain('editor.type 必须是 object / array');

    // card/cards 不声明 fields 也合法：内容编辑页按数据形状自动生成表单。
    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home' },
        editor: { type: 'array', label: '卡片组' },
      }),
    ).toEqual([]);

    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home' },
        editor: {
          type: 'array',
          label: '卡片组',
          fields: { title: { label: '标题' }, nope: { label: '不支持' } },
        },
      }),
    ).toContain('editor.type=array 不支持字段 nope');
  });

  it('editor 的 label 必填且不超过 160 字', () => {
    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home' },
        editor: { type: 'object', label: '   ' },
      }),
    ).toContain('editor.label 必填且不超过 160 字');
    expect(
      validateBlock('x', {
        provider: 'static_content',
        config: { content_key: 'home' },
        editor: { type: 'object', label: 'x'.repeat(161) },
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

/**
 * 这些用例锁住「草稿必须与基线脱钩」所依赖的两条底层语义。
 *
 * 背景：`isDirty` 靠比较 `contentData`（基线）与 `drafts`（草稿）来判断是否可保存。
 * 两者一旦共享对象引用，改草稿就等于改基线，`isDirty` 恒为 false、保存按钮永远点不动
 * （浏览器实测复现过：编辑后 7 个保存按钮全部 disabled）。
 */
describe('deepClone / setAtPath 的引用语义（草稿-基线脱钩的前提）', () => {
  it('deepClone 返回结构相同但引用独立的新对象', () => {
    const source = { a: 1, nested: { b: [1, 2] }, list: [{ c: 3 }] };
    const copy = deepClone(source);

    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
    expect(copy.nested).not.toBe(source.nested);
    expect(copy.nested.b).not.toBe(source.nested.b);
    expect(copy.list[0]).not.toBe(source.list[0]);
  });

  it('deepClone 对标量原样返回', () => {
    expect(deepClone('x')).toBe('x');
    expect(deepClone(0)).toBe(0);
    expect(deepClone(null)).toBeNull();
  });

  it('setAtPath 把 value 按引用挂上去（所以调用方必须自己先 clone）', () => {
    const draft = { title: '草稿' };
    const next = setAtPath({ block: { title: '原值' } }, ['block'], draft);

    // 这就是别名陷阱本身：基线里挂的就是 draft 这个对象
    expect(next.block).toBe(draft);

    // 也正因如此，调用方保存后必须重新 clone 草稿，否则第二次编辑检测不到变化
    const detached = deepClone(draft);
    detached.title = '第二次改';
    expect(next.block.title).toBe('草稿');
  });

  it('空路径时 setAtPath 直接返回 value（整份替换，同样不 clone）', () => {
    const draft = { title: '草稿' };
    expect(setAtPath({ anything: 1 }, [], draft)).toBe(draft);
  });
});

describe('formatJson', () => {
  it('字符串原样返回（HTML 正文不该被加引号转义）', () => {
    expect(formatJson('<p>公司简介</p>')).toBe('<p>公司简介</p>');
  });

  it('对象格式化成缩进 JSON', () => {
    expect(formatJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('null / undefined 返回空串', () => {
    expect(formatJson(null)).toBe('');
    expect(formatJson(undefined)).toBe('');
  });
});

/**
 * `isDraftDirty` 决定「保存」按钮是否可点。这一组用例覆盖曾经出过的两类 bug：
 * ① 草稿与基线共享引用 → 恒不脏（保存永远点不动）；
 * ② 两侧用不同规则规范化 → 恒脏（保存后仍显示未保存）。
 */
describe('isDraftDirty', () => {
  it('对象草稿：未改动 → 不脏', () => {
    const original = { title: 'T', actions: [{ label: 'A' }] };
    expect(isDraftDirty('auto', original, deepClone(original))).toBe(false);
  });

  it('对象草稿：改字段 → 脏', () => {
    const original = { title: 'T', actions: [{ label: 'A' }] };
    const draft = deepClone(original);
    draft.title = 'T2';
    expect(isDraftDirty('auto', original, draft)).toBe(true);
  });

  it('对象草稿：改嵌套数组里的值 → 脏（浅比较会漏）', () => {
    const original = { items: [{ name: 'n' }] };
    const draft = deepClone(original);
    draft.items[0].name = 'm';
    expect(isDraftDirty('auto', original, draft)).toBe(true);
  });

  it('同一引用 → 不脏（这正是别名 bug 的表现，故草稿必须先 deepClone）', () => {
    const original = { title: 'T' };
    expect(isDraftDirty('auto', original, original)).toBe(false);
  });

  it('object 块（高级模式）：草稿是等价的 JSON 文本 → 不脏（缩进/空白差异不算改）', () => {
    const original = { b: 2, a: 1 };
    // 基线是对象、草稿是文本 —— 保存后正是这个状态
    expect(isDraftDirty('object', original, formatJson(original))).toBe(false);
    // 紧凑写法（无缩进）也应视为等价
    expect(isDraftDirty('object', original, JSON.stringify(original))).toBe(false);
  });

  it('object 块（高级模式）：文本内容真的变了 → 脏', () => {
    expect(isDraftDirty('object', { a: 1 }, '{"a":2}')).toBe(true);
  });

  it('object 块（高级模式）：仅调换键序 → 视为已改（比较的是文本，键序属于文本的一部分）', () => {
    // 记录既有语义，避免以后误以为是 bug。真实流程不会触发：
    // 高级模式的文本由 formatJson(基线) 生成，键序与基线一致。
    expect(isDraftDirty('object', { b: 2, a: 1 }, '{"a":1,"b":2}')).toBe(true);
  });

  it('auto 块：草稿是等价的 JSON 文本 → 不脏（高级模式切回来不该误报）', () => {
    const original = { title: 'T' };
    expect(isDraftDirty('auto', original, formatJson(original))).toBe(false);
  });

  it('object 块 content 字段：正文改一个字 → 脏；未改 → 不脏', () => {
    const original = { content: '<p>正文</p>' };
    expect(isDraftDirty('object', original, deepClone(original))).toBe(false);
    expect(isDraftDirty('object', original, { content: '<p>正文！</p>' })).toBe(true);
  });

  it('object 块 image 字段：换图 → 脏', () => {
    expect(isDraftDirty('object', { image: 'a.png' }, { image: 'a.png' })).toBe(false);
    expect(isDraftDirty('object', { image: 'a.png' }, { image: 'b.png' })).toBe(true);
  });

  it('标量块：字符串内容 → 脏判断正常', () => {
    expect(isDraftDirty('auto', '原文', '原文')).toBe(false);
    expect(isDraftDirty('auto', '原文', '改过')).toBe(true);
  });

  it('基线缺失（null/undefined）与空草稿 → 不脏', () => {
    expect(isDraftDirty('auto', null, null)).toBe(false);
    expect(isDraftDirty('auto', undefined, null)).toBe(false);
  });
});

describe('comparableValue', () => {
  it('json 文本先解析回值再比较（避免「文本 vs 对象」永远不等）', () => {
    expect(comparableValue('auto', '{"a":1}')).toBe(comparableValue('auto', { a: 1 }));
  });

  it('非 JSON 的普通字符串保持原样', () => {
    expect(comparableValue('auto', '<p>x</p>')).toBe(JSON.stringify('<p>x</p>'));
  });
});
