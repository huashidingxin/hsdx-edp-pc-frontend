import { describe, expect, it } from 'vitest';

import {
  blankItemFor,
  blankLike,
  describeArray,
  describeDeclaredFields,
  describeObject,
  fieldKind,
  fieldLabel,
  isHtmlLike,
  isImagePath,
  isUploadItem,
  isUploadPlaceholder,
  isVideoPath,
  looksLikeJsonText,
  resolveFieldKind,
  summarize,
  uploadItemKind,
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
    expect(fieldLabel('target')).toBe('跳转页面');
    expect(fieldLabel('tabs')).toBe('标签页');
    expect(fieldLabel('activeTab')).toBe('当前标签');
    expect(fieldLabel('contact')).toBe('联系方式');
    expect(fieldLabel('email')).toBe('邮箱');
    expect(fieldLabel('phone')).toBe('电话');
    expect(fieldLabel('address')).toBe('地址');
    expect(fieldLabel('steps')).toBe('步骤');
    expect(fieldLabel('benefits')).toBe('优势');
  });

  it('皓飞（app111）等站点的真实键也有中文标签', () => {
    expect(fieldLabel('paragraphs')).toBe('段落');
    expect(fieldLabel('hotlines')).toBe('联系电话');
    expect(fieldLabel('topImage')).toBe('顶部图片');
    expect(fieldLabel('qrLabel')).toBe('二维码说明');
    expect(fieldLabel('moreSlug')).toBe('更多跳转');
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

  it('长文本段落数组 → paragraphs（不是单行标签输入）', () => {
    // 皓飞 technology / products 的 paragraphs / points：一段上百字，
    // 落进 Select mode="tags" 的单行 chip 就没法编辑了。
    const paragraph =
      '皓飞检测室，根据生产线产品类型不同，设有 3 个检测实验室，依据检验标准、仪器设备与岗位职责划分执行全流程检测。';
    expect(fieldKind('paragraphs', [paragraph, paragraph])).toBe('paragraphs');
    // 没有键名提示时也按长度判定（真实数据里的 lines / 自定义键）
    expect(fieldKind('lines', [paragraph])).toBe('paragraphs');
    // 短标签仍然走标签输入
    expect(fieldKind('tags', ['数字创意', 'AI网站'])).toBe('tags');
  });

  it('段落 / 图片数组的空数组靠键名提示兜底', () => {
    expect(fieldKind('paragraphs', [])).toBe('paragraphs');
    expect(fieldKind('points', [])).toBe('paragraphs');
    expect(fieldKind('photos', [])).toBe('images');
    expect(fieldKind('manual_images', [])).toBe('images');
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

  it('皓飞等站点的高频媒体键：空值也保持上传控件', () => {
    for (const key of ['topImage', 'map_image', 'qr_image', 'qrImage', 'iconHover', 'mobile_image', 'brochure_image']) {
      expect(fieldKind(key, ''), `${key} 空值`).toBe('image');
      expect(fieldKind(key, null), `${key} = null`).toBe('image');
    }
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

  /**
   * 回归：点 AppUpload 上的「删除」图标后控件不能再变回文本框。
   *
   * 单文件删除时 AppUpload 回传的是 `null`（`props.multiple ? arr : arr[0] || null`），
   * 旧实现对 null 一律兜底成 text → 控件当场从上传框变成输入框，用户无法再传图。
   */
  it('删除媒体后的 null/undefined 仍保持上传控件', () => {
    for (const key of ['image', 'image1', 'image2', 'image3', 'img', 'photo', 'pic', 'cover', 'logo', 'icon', 'thumb', 'poster', 'banner', 'background', 'bg', 'avatar', 'qrcode', 'title_image']) {
      expect(fieldKind(key, null), `${key} = null`).toBe('image');
    }
    for (const key of ['video', 'video_url', 'video_src', 'video_path', 'video_file']) {
      expect(fieldKind(key, null), `${key} = null`).toBe('video');
    }
    expect(fieldKind('image', undefined)).toBe('image');
    expect(fieldKind('video_poster', null)).toBe('image');
  });

  it('没有键名提示的键收到 null/undefined 仍是文本框', () => {
    expect(fieldKind('title', null)).toBe('text');
    expect(fieldKind('someKey', undefined)).toBe('text');
    expect(fieldKind('imageAlt', null)).toBe('text');
  });
});

/**
 * 字段键规范是**全局**的：`image` / `image2` / `video` / `content` 无论落在哪个块类型
 * （image、video、card、cards，还是完全没有 editor 提示的块）里，都必须是同一个控件。
 *
 * 回归（用户反馈）：
 *  - `video` 块的 `video` 字段被渲染成单行文本框，用户没法上传视频；
 *  - `content` 只有值恰好是 HTML 时才成为富文本，纯文本/空串会退化成单行文本框，
 *    声明了 content 的 card/cards 块因此无法富文本编辑。
 */
describe('字段键规范与块类型无关', () => {
  it('content 一律富文本：空串、纯文本、HTML、空值都一样', () => {
    expect(fieldKind('content', '')).toBe('richtext');
    expect(fieldKind('content', '一段没有标签的说明')).toBe('richtext');
    expect(fieldKind('content', '<p>富文本</p>')).toBe('richtext');
    expect(fieldKind('content', null)).toBe('richtext');
    expect(fieldKind('content', undefined)).toBe('richtext');
  });

  it('同名字段在不同容器 / 层级下推断出同一控件', () => {
    // 对象键（describeObject）与块级声明字段（describeDeclaredFields）共用 fieldKind，
    // 两条路径都断言，避免将来只改其中一条。
    const fromObject = Object.fromEntries(
      describeObject({ image: '', image2: '', video: '', content: '' }).map((f) => [
        f.key,
        f.kind,
      ]),
    );
    expect(fromObject).toEqual({
      image: 'image',
      image2: 'image',
      video: 'video',
      content: 'richtext',
    });

    const fromDeclared = Object.fromEntries(
      describeDeclaredFields({}, [
        { key: 'image', label: '配图' },
        { key: 'image2', label: '配图 2' },
        { key: 'video', label: '视频' },
        { key: 'content', label: '说明' },
      ]).map((f) => [f.key, f.kind]),
    );
    expect(fromDeclared).toEqual({
      image: 'image',
      image2: 'image',
      video: 'video',
      content: 'richtext',
    });
  });

  it('值的证据仍然优先于键名（content 里存了 mp4 就是视频，不是富文本）', () => {
    expect(fieldKind('content', 'image/d25dbc1d9a8e958b.mp4')).toBe('video');
  });
});

/**
 * 回归：拖拽/选择本地文件后 AppUpload 回传的是**对象**（`{ url: 'blob:…', file }`）。
 * 旧实现把它按普通对象推断 → 图片控件当场变成 `file` + `链接` 两个输入框，
 * 预览与上传入口一起消失（用户截图反馈的实际现象）。
 */
describe('上传中转态的控件保持', () => {
  const pendingImage = {
    url: 'blob:http://localhost:5999/d8794f86-fbc0-433b-890c-13ce9b5e7cdf',
    file: { name: 'photo.png', size: 1024, type: 'image/png' },
  };
  const pendingVideo = {
    url: 'blob:http://localhost:5999/abc',
    file: { name: 'clip.mp4', size: 2048, type: 'video/mp4' },
  };

  it('isUploadItem 只认 { url, file } 的上传条目，不误判业务对象', () => {
    expect(isUploadItem(pendingImage)).toBe(true);
    expect(isUploadItem({ url: '/products/1', alt: '图' })).toBe(false);
    expect(isUploadItem('image/a.png')).toBe(false);
    expect(isUploadItem([])).toBe(false);
  });

  it('单图键 + 待上传条目 → 仍是图片控件，不会变成对象表单', () => {
    expect(fieldKind('image2', pendingImage)).toBe('image');
    expect(fieldKind('cover', pendingImage)).toBe('image');
  });

  it('视频键 + 待上传条目 → 视频控件', () => {
    expect(fieldKind('video', pendingVideo)).toBe('video');
    expect(uploadItemKind(pendingVideo, '')).toBe('video');
  });

  it('多图键 + 待上传条目数组 → images，而不是「条目列表」', () => {
    expect(fieldKind('images', [pendingImage])).toBe('images');
    expect(fieldKind('images', [pendingImage, pendingVideo])).toBe('images');
  });

  it('无键名提示时按条目自身的文件名/类型兜底', () => {
    expect(uploadItemKind(pendingImage, 'custom_media')).toBe('image');
    expect(uploadItemKind(pendingVideo, 'custom_media')).toBe('video');
  });

  it('isUploadPlaceholder 覆盖「刚删完」与「刚选好文件」两种中转态', () => {
    expect(isUploadPlaceholder(null)).toBe(true);
    expect(isUploadPlaceholder('')).toBe(true);
    expect(isUploadPlaceholder([])).toBe(true);
    expect(isUploadPlaceholder(pendingImage)).toBe(true);
    expect(isUploadPlaceholder([pendingImage])).toBe(true);
    expect(isUploadPlaceholder('image/a.png')).toBe(false);
    expect(isUploadPlaceholder({ title: 't' })).toBe(false);
  });

  it('resolveFieldKind 在值变成中转态时保持上一次的媒体控件', () => {
    // 没有键名提示的媒体字段：先按扩展名推断成上传控件，删空后必须还是上传控件
    expect(resolveFieldKind('banner_img', 'image/a.png')).toBe('image');
    expect(resolveFieldKind('banner_img', null, 'image')).toBe('image');
    expect(resolveFieldKind('banner_img', pendingImage, 'image')).toBe('image');
    // 普通字段不受影响
    expect(resolveFieldKind('title', null, '')).toBe('text');
    expect(resolveFieldKind('rows', [], '')).toBe('list');
  });
});
