import { describe, expect, it } from 'vitest';

import {
  blankItemFor,
  blankLike,
  describeArray,
  describeObject,
  fieldKind,
  fieldLabel,
  isHtmlLike,
  isImagePath,
  isVideoPath,
  looksLikeJsonText,
  summarize,
} from '../pageContentAutoForm';

describe('fieldLabel', () => {
  it('命中词典返回中文标签', () => {
    expect(fieldLabel('title')).toBe('标题');
    expect(fieldLabel('image')).toBe('图片');
    expect(fieldLabel('imageAlt')).toBe('图片说明');
  });

  it('真实数据里高频出现的键也有中文标签（非技术人员不该看到英文）', () => {
    // 这些键来自全租户实测：原先会原样显示英文
    expect(fieldLabel('sections')).toBe('板块');
    expect(fieldLabel('intro')).toBe('导语');
    expect(fieldLabel('variant')).toBe('样式');
    expect(fieldLabel('code')).toBe('编码');
    expect(fieldLabel('target')).toBe('打开方式');
    expect(fieldLabel('tabs')).toBe('标签页');
    expect(fieldLabel('activeTab')).toBe('当前标签');
    expect(fieldLabel('contact')).toBe('联系方式');
    expect(fieldLabel('email')).toBe('邮箱');
    expect(fieldLabel('phone')).toBe('电话');
    expect(fieldLabel('address')).toBe('地址');
    expect(fieldLabel('steps')).toBe('步骤');
    expect(fieldLabel('benefits')).toBe('优势');
  });

  it('未命中时回退原名，不猜也不丢信息', () => {
    expect(fieldLabel('someWeirdKey')).toBe('someWeirdKey');
    expect(fieldLabel('')).toBe('');
  });
});

describe('isImagePath', () => {
  it('识别本项目落库的相对路径与完整 URL', () => {
    expect(isImagePath('image/ab12cd34ef567890.png')).toBe(true);
    expect(isImagePath('https://cdn.example.com/a/b.webp')).toBe(true);
    expect(isImagePath('/storage/x.JPEG')).toBe(true);
    expect(isImagePath('image/a.svg?v=2')).toBe(true);
  });

  it('普通文案与 HTML 不算图片', () => {
    expect(isImagePath('这是一个标题')).toBe(false);
    expect(isImagePath('<p>正文</p>')).toBe(false);
    expect(isImagePath('')).toBe(false);
    expect(isImagePath('a/b/c')).toBe(false);
  });
});

describe('isHtmlLike', () => {
  it('识别 HTML 片段', () => {
    expect(isHtmlLike('<p>hi</p>')).toBe(true);
    expect(isHtmlLike('纯文本')).toBe(false);
  });
});

describe('fieldKind：按数据形状推断控件', () => {
  it('标量', () => {
    expect(fieldKind('autoplay', true)).toBe('boolean');
    expect(fieldKind('columns', 3)).toBe('number');
    expect(fieldKind('title', '短标题')).toBe('text');
    expect(fieldKind('image', 'image/abc1234567890abc.png')).toBe('image');
    expect(fieldKind('content', '<p>富文本</p>')).toBe('richtext');
  });

  it('超长纯文本按多行文本处理', () => {
    expect(fieldKind('body', 'x'.repeat(121))).toBe('textarea');
    expect(fieldKind('body', 'x'.repeat(120))).toBe('text');
  });

  it('空值兜底为文本框（不返回 undefined）', () => {
    expect(fieldKind('x', null)).toBe('text');
    expect(fieldKind('x', undefined)).toBe('text');
  });

  it('对象 → object', () => {
    expect(fieldKind('hero', { title: 'a' })).toBe('object');
  });

  it('字符串数组：全是图片路径 → images，否则 → tags', () => {
    expect(fieldKind('lines', ['image/a.png', 'image/b.jpg'])).toBe('images');
    expect(fieldKind('lines', ['第一行', '第二行'])).toBe('tags');
  });

  it('空数组靠键名提示兜底，否则按列表处理', () => {
    expect(fieldKind('tags', [])).toBe('tags');
    expect(fieldKind('images', [])).toBe('images');
    expect(fieldKind('rows', [])).toBe('list');
  });

  it('对象数组 → list（条目形状各自推断）', () => {
    expect(fieldKind('actions', [{ href: '/a', label: 'x' }])).toBe('list');
  });

  it('键名提示不覆盖非字符串数组', () => {
    // images 键但元素是对象 → 仍是 list，不能当图片集合
    expect(fieldKind('images', [{ src: 'a.png' }])).toBe('list');
  });
});

describe('blankLike / blankItemFor', () => {
  it('保持形状，标量清空', () => {
    expect(blankLike({ a: 'x', b: 1, c: true, d: ['x'], e: { f: 'y' } })).toEqual({
      a: '',
      b: 0,
      c: false,
      d: [],
      e: { f: '' },
    });
  });

  it('新增条目照抄首项形状，保证字段齐全', () => {
    const list = [{ title: '标题', image: 'image/a.png', tags: ['x'] }];
    expect(blankItemFor(list)).toEqual({ title: '', image: '', tags: [] });
  });

  it('空列表只能给空串（无从推断形状）', () => {
    expect(blankItemFor([])).toBe('');
    expect(blankItemFor(null)).toBe('');
  });
});

describe('describeObject', () => {
  it('保持原始键顺序，并给出标签与控件类型', () => {
    const fields = describeObject({ image: 'image/a.png', title: 't', autoplay: true });
    expect(fields.map((f) => f.key)).toEqual(['image', 'title', 'autoplay']);
    expect(fields.map((f) => f.kind)).toEqual(['image', 'text', 'boolean']);
    expect(fields[0].label).toBe('图片');
  });

  it('非对象返回空数组（不抛错）', () => {
    expect(describeObject(null)).toEqual([]);
    expect(describeObject('x')).toEqual([]);
    expect(describeObject([])).toEqual([]);
  });
});

describe('describeArray', () => {
  it('对象数组 → itemKind=object', () => {
    expect(describeArray([{ a: 1 }, { a: 2 }])).toEqual({ itemKind: 'object', count: 2 });
  });

  it('字符串数组 → 按首个元素推断', () => {
    expect(describeArray(['a', 'b'])).toEqual({ itemKind: 'text', count: 2 });
  });

  it('空数组与非法值安全', () => {
    expect(describeArray([])).toEqual({ itemKind: 'text', count: 0 });
    expect(describeArray(null)).toEqual({ itemKind: 'text', count: 0 });
  });
});

describe('summarize', () => {
  it('优先用标题类字段，避免「第 N 项」这种无信息量标题', () => {
    expect(summarize({ title: '融资路演', image: 'image/a.png' })).toBe('融资路演');
    expect(summarize({ label: '首页', slug: 'home' })).toBe('首页');
    expect(summarize({ subtitle: '副标题' })).toBe('副标题');
  });

  it('没有标题类字段时取第一个非空字符串', () => {
    expect(summarize({ href: '/a', slug: 'home' })).toBe('/a');
  });

  it('标量与数组', () => {
    expect(summarize('纯文本')).toBe('纯文本');
    expect(summarize(3)).toBe('3');
    expect(summarize(['a', 'b'])).toBe('2 项');
    expect(summarize(null)).toBe('');
  });
});

describe('looksLikeJsonText', () => {
  it('只认 { / [ 开头，避免把正文 HTML 误当 JSON', () => {
    expect(looksLikeJsonText('{"a":1}')).toBe(true);
    expect(looksLikeJsonText('  [1,2]')).toBe(true);
    expect(looksLikeJsonText('<p>正文</p>')).toBe(false);
    expect(looksLikeJsonText('纯文本')).toBe(false);
    expect(looksLikeJsonText('')).toBe(false);
  });

  it('回归：about-*.body 这类 HTML 字符串不会被当成 JSON 去解析', () => {
    // 旧实现在保存时对任何字符串都做 JSON.parse，导致这种块永远报「JSON 格式错误」
    const body = '<p>公司简介</p><ul><li>成立于 2005 年</li></ul>';
    expect(looksLikeJsonText(body)).toBe(false);
  });
});

describe('isVideoPath', () => {
  it('识别视频扩展名（真实数据里 image2 曾存过 .mp4）', () => {
    expect(isVideoPath('image/d25dbc1d9a8e958b.mp4')).toBe(true);
    expect(isVideoPath('https://cdn.x.com/a/b.webm')).toBe(true);
    expect(isVideoPath('a.MOV')).toBe(true);
  });

  it('图片路径与普通文案不算视频', () => {
    expect(isVideoPath('image/a.png')).toBe(false);
    expect(isVideoPath('一段文案')).toBe(false);
    expect(isVideoPath('')).toBe(false);
  });
});

/**
 * 键名兜底：全租户实测有 7 处 `image` / `image2` 是**空串**，
 * 没有扩展名可判断，旧逻辑退化成普通文本框 → 非技术人员没法上传。
 */
describe('fieldKind 的键名兜底（值为空时仍选对媒体控件）', () => {
  it('空的 image / image2 / logo 等 → 上传控件', () => {
    for (const key of ['image', 'image1', 'image2', 'image3', 'logo', 'cover', 'poster', 'icon', 'avatar', 'thumbnail', 'banner']) {
      expect(fieldKind(key, ''), `${key} 空值`).toBe('image');
    }
  });

  it('空的 video 系列 → 视频上传控件', () => {
    for (const key of ['video', 'video_url', 'video_src', 'video_path', 'video_file']) {
      expect(fieldKind(key, ''), `${key} 空值`).toBe('video');
    }
  });

  it('video_poster 是图片，不是视频', () => {
    expect(fieldKind('video_poster', '')).toBe('image');
  });

  it('imageAlt / image_alt 是说明文字，不该变成上传控件', () => {
    expect(fieldKind('imageAlt', '')).toBe('text');
    expect(fieldKind('image_alt', '')).toBe('text');
    expect(fieldKind('imageAlt', '一台设备的照片')).toBe('text');
  });

  it('值的证据优先于键名：image2 里存了 mp4 → 视频控件', () => {
    expect(fieldKind('image2', 'image/d25dbc1d9a8e958b.mp4')).toBe('video');
    expect(fieldKind('image', 'image/a.png')).toBe('image');
  });

  it('键名像图片但值是描述性长文案 → 仍按文本，不做成上传控件', () => {
    const desc = '这张图展示了我们位于河北廊坊的厂房全景，包含三条自动化生产线。';
    expect(fieldKind('image', desc)).toBe('text');
    expect(fieldKind('image', '一段带空格的中文说明')).toBe('text');
  });

  it('无提示的普通键不受影响', () => {
    expect(fieldKind('title', '')).toBe('text');
    expect(fieldKind('someKey', '')).toBe('text');
  });
});
