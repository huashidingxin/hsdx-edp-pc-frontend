/**
 * 页面静态内容的「自动表单」推断（纯逻辑，可单测）。
 *
 * 背景：静态块的 `editor` 提示是可选的。真实数据里 107 个静态块中有 45 个
 * （app 2 / 3 / 4 是 100%）没有 editor 提示，于是内容抽屉只能退回裸 JSON 文本框 ——
 * 非技术人员无法操作。
 *
 * 这里改为**按数据本身的形状推断控件**，不再依赖 editor 提示：
 *   - 对象        → 分组，逐键渲染
 *   - 对象数组    → 可增删/排序的条目列表，每个条目按键渲染
 *   - 字符串数组  → 标签输入（若全是图片路径则为图片集合）
 *   - 图片路径串  → 图片上传
 *   - HTML 串     → 富文本
 *   - 长文本      → 多行文本
 *   - 数字/布尔   → 数字框 / 开关
 *
 * 实测覆盖的真实形状举例：
 *   home-hero    { image, scrim, title, actions:[{…}], eyebrow, summary, autoplay:bool, imageAlt }
 *   home-stats   { items: [4 × {…}] }
 *   home-brands  [2 × { href, slug, label, summary }]
 *   rows         [5 × { image, title, action, content }]
 *   body         "<p>…</p>"（裸字符串）
 */

/** 字段名 → 中文标签。命中不了就回退原名（不猜、不丢信息）。 */
export const FIELD_LABELS = {
  title: '标题',
  subtitle: '副标题',
  eyebrow: '眉标',
  summary: '摘要',
  description: '描述',
  content: '内容',
  body: '正文',
  text: '文案',
  label: '名称',
  name: '名称',
  value: '数值',
  image: '图片',
  image1: '图片 1',
  image2: '图片 2',
  imageAlt: '图片说明',
  images: '图片集',
  logo: 'Logo',
  cover: '封面',
  poster: '视频封面',
  video: '视频地址',
  video_poster: '视频封面',
  featured_video: '精选视频',
  autoplay: '自动播放',
  scrim: '遮罩',
  href: '链接',
  url: '链接',
  link: '链接',
  target: '打开方式',
  slug: '标识',
  key: '标识',
  code: '编码',
  id: 'ID',
  kind: '类型',
  variant: '样式',
  action: '动作',
  actions: '按钮',
  cta: '行动号召',
  items: '条目',
  rows: '行',
  lines: '文案行',
  tags: '标签',
  stats: '数据',
  columns: '列数',
  sort: '排序',
  icon: '图标',
  color: '颜色',
  title_image: '标题图',
  gallery: '图集',
  gallery_links: '图集链接',
  product_nav: '产品导航',
  about_links: '相关链接',
  // 以下为全租户真实数据里高频出现、原先会显示英文原文的键
  sections: '板块',
  intro: '导语',
  steps: '步骤',
  benefits: '优势',
  advantages: '优势',
  pillars: '支柱',
  values: '价值观',
  services: '服务',
  contacts: '联系人',
  tabs: '标签页',
  activeTab: '当前标签',
  forms: '表单',
  card_meta: '卡片信息',
  contact: '联系方式',
  email: '邮箱',
  phone: '电话',
  address: '地址',
  hours: '营业时间',
  map: '地图',
  header: '页头',
  about: '关于',
  company: '公司',
  consult: '咨询',
  service_consult: '服务咨询',
  en: '英文',
  en_subtitle: '英文副标题',
};

const IMAGE_EXT_RE = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?|#|$)/i;
const VIDEO_EXT_RE = /\.(mp4|m4v|mov|webm|ogv|avi|mkv)(\?|#|$)/i;
const HTML_RE = /<\/?[a-z][\s\S]*>/i;
/** 长于该长度的纯文本按多行文本处理。 */
const LONG_TEXT = 120;
/** 恰好以 { 或 [ 开头，才认为「这段文本是 JSON」。 */
const JSON_TEXT_RE = /^\s*[[{]/;

/**
 * 数组键名提示：空数组无从判断形状，靠键名兜一下，
 * 否则 `tags: []` 会被渲染成「条目列表」而不是标签输入。
 */
const ARRAY_KEY_HINTS = {
  tags: 'tags',
  images: 'images',
  gallery: 'images',
  image_list: 'images',
};

/**
 * 标量键名提示：**值为空**或**看不出扩展名**时，靠键名选对媒体控件。
 *
 * 为什么需要：全租户真实数据里有 7 处 `image` / `image2` 是空串，
 * 没有扩展名可判断 → 原先退化成普通文本框，非技术人员**没法上传**。
 *
 * 只列明确的键名，不做「包含 image 就算图片」这种模糊匹配 ——
 * 那会把 `image_alt`（说明文字）、`video_poster`（图片）判错。
 */
const SCALAR_KEY_KINDS = {
  image: 'image',
  image1: 'image',
  image2: 'image',
  image3: 'image',
  img: 'image',
  photo: 'image',
  picture: 'image',
  pic: 'image',
  cover: 'image',
  avatar: 'image',
  logo: 'image',
  icon: 'image',
  thumb: 'image',
  thumbnail: 'image',
  poster: 'image',
  banner: 'image',
  background: 'image',
  bg: 'image',
  qrcode: 'image',
  qr_code: 'image',
  title_image: 'image',
  titleimage: 'image',
  video_poster: 'image',
  video: 'video',
  video_url: 'video',
  video_src: 'video',
  video_path: 'video',
  video_file: 'video',
  // 明确不是媒体：说明文字
  image_alt: 'text',
  imageAlt: 'text',
};

/**
 * 值是否「像路径/URL」——用于决定键名提示能否接管。
 *
 * 只在值本身没有信息量时（空串、或一个不含空格的短路径）才用键名兜底，
 * 避免把 `image` 键下的一段描述性文字硬做成上传控件。
 */
function isPathLike(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text === '' || text.length > 300 || /\s/.test(text)) return false;
  return text.includes('/') || text.includes('.') || /^https?:/i.test(text);
}

/** 字段中文标签；没有约定就用原名。 */
export function fieldLabel(key) {
  if (typeof key !== 'string') return String(key);
  return FIELD_LABELS[key] ?? key;
}

/**
 * 是否是图片路径。
 * 覆盖本项目两种落库形态：相对路径 `image/{hash}.png` 与完整 URL。
 */
export function isImagePath(value) {
  return typeof value === 'string' && IMAGE_EXT_RE.test(value.trim());
}

/** 是否是视频路径（真实数据里 `image2` 曾存过 `.mp4`）。 */
export function isVideoPath(value) {
  return typeof value === 'string' && VIDEO_EXT_RE.test(value.trim());
}

/** 是否包含 HTML 标签（富文本内容）。 */
export function isHtmlLike(value) {
  return typeof value === 'string' && HTML_RE.test(value);
}

/**
 * 推断一个字段该用什么控件。
 *
 * 判断优先级：**值的证据 > 键名提示**。值的扩展名/HTML 特征足以定性时就用值；
 * 只有值本身没信息量（空串、看不出扩展名的短路径）才退回键名提示。
 *
 * @param {string} key 字段名（用于标签与少量语义判断）
 * @param {*} value 当前值（形状是主要依据）
 * @returns {'boolean'|'number'|'image'|'images'|'video'|'richtext'|'textarea'|'tags'|'object'|'list'|'text'}
 */
export function fieldKind(key, value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';

  if (typeof value === 'string') {
    if (isImagePath(value)) return 'image';
    if (isVideoPath(value)) return 'video';
    if (isHtmlLike(value)) return 'richtext';
    // 空串或像路径但看不出类型 → 键名兜底（否则空的 image 字段只能填文本，无法上传）
    const hint = SCALAR_KEY_KINDS[key];
    if (hint && (value.trim() === '' || isPathLike(value))) return hint;
    if (value.length > LONG_TEXT) return 'textarea';
    return 'text';
  }

  if (Array.isArray(value)) {
    // 空数组的 every() 也是 true，所以这里同时覆盖「空数组」与「纯字符串数组」
    const strings = value.every((item) => typeof item === 'string');
    // 空数组或纯字符串数组时，键名提示优先（tags: [] → 标签输入）
    const hint = ARRAY_KEY_HINTS[key];
    if (hint && strings) return hint;
    // 空数组无从推断条目形状，交给调用方按「空列表」渲染（可新增）。
    if (value.length === 0) return 'list';
    if (strings) {
      // 全是图片路径 → 图片集合；否则 → 标签
      return value.every((item) => isImagePath(item)) ? 'images' : 'tags';
    }
    return 'list';
  }

  if (value !== null && typeof value === 'object') return 'object';

  // null / undefined：给一个普通文本框，让用户先填内容
  return 'text';
}

/** 生成与 value 同形状的空值（新增条目时用）。 */
export function blankLike(value) {
  if (Array.isArray(value)) return [];
  if (value !== null && typeof value === 'object') {
    const blank = {};
    for (const [key, inner] of Object.entries(value)) {
      blank[key] = blankLike(inner);
    }
    return blank;
  }
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') return 0;
  return '';
}

/**
 * 新增条目时插入的空白项。
 * 列表里已有条目就照抄第一项的形状（保证新条目字段齐全）；空列表只能给空串。
 */
export function blankItemFor(list) {
  if (Array.isArray(list) && list.length > 0) return blankLike(list[0]);
  return '';
}

/**
 * 对象 → 字段描述数组，保持原始键顺序（不排序，尊重作者写法）。
 * @returns {Array<{key: string, label: string, kind: string, value: *}>}
 */
export function describeObject(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.entries(obj).map(([key, value]) => ({
    key,
    label: fieldLabel(key),
    kind: fieldKind(key, value),
    value,
  }));
}

/**
 * 数组 → 条目描述。
 * @returns {{itemKind: string, count: number}}
 */
export function describeArray(list) {
  if (!Array.isArray(list)) return { itemKind: 'text', count: 0 };
  if (list.length === 0) return { itemKind: 'text', count: 0 };
  const first = list[0];
  if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
    return { itemKind: 'object', count: list.length };
  }
  return { itemKind: fieldKind('', first), count: list.length };
}

/**
 * 单条数据的一句话摘要，用于条目标题（避免「第 N 项」这种没有信息量的标题）。
 */
export function summarize(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} 项`;
  for (const key of ['title', 'label', 'name', 'subtitle', 'summary', 'text']) {
    const inner = value[key];
    if (typeof inner === 'string' && inner.trim()) return inner;
  }
  // 兜底：拿第一个非空标量
  for (const inner of Object.values(value)) {
    if (typeof inner === 'string' && inner.trim()) return inner;
  }
  return '';
}

/**
 * 文本是否看起来就是 JSON（用于「高级模式」关闭时决定要不要解析）。
 * 只认 { / [ 开头，避免把正文 HTML 误当 JSON 解析报错。
 */
export function looksLikeJsonText(text) {
  return typeof text === 'string' && JSON_TEXT_RE.test(text);
}
