/**
 * 页面静态内容的「自动表单」推断（纯逻辑，可单测）。
 *
 * 背景：静态块的 `editor` 提示是可选的。真实数据里 107 个静态块中有 45 个
 * （app 2 / 3 / 4 是 100%）没有 editor 提示，于是内容抽屉只能退回裸 JSON 文本框 ——
 * 非技术人员无法操作。
 *
 * 因此这里分两级：
 *   1. **块级 `editor.fields` 声明优先**（`editorFieldList` / `describeDeclaredFields`）：
 *      声明了哪些字段就只展示哪些、顺序与 label 全按声明，不再猜。
 *   2. 没有声明时**按数据本身的形状推断控件**（`fieldKind` 等）：
 *   - 对象        → 分组，逐键渲染
 *   - 对象数组    → 可增删/排序的条目列表，每个条目按键渲染
 *   - 字符串数组  → 标签输入（若全是图片路径则为图片集合；长文本段落则为多行文本列表）
 *   - 图片路径串  → 图片上传
 *   - HTML 串     → 富文本
 *   - 长文本      → 多行文本
 *   - 数字/布尔   → 数字框 / 开关
 *
 * **字段键名属于全局规范，与它落在哪个块类型（image / video / card / cards / 无提示）无关**：
 * 同一个键在任何类型、任何层级下都必须是同一个控件——
 *   - `image` / `image2` / `cover` / `logo` … → 图片上传（`SCALAR_KEY_KINDS`）
 *   - `video` / `video_url` …                → 视频上传
 *   - `content`                              → 富文本
 * 历史上的反例：`video` 块里的 `video` 字段被渲染成单行文本框、`content` 值为纯文本时
 * 退化成文本框 —— 都不允许再出现。
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
  video: '视频',
  video_poster: '视频封面',
  featured_video: '精选视频',
  autoplay: '自动播放',
  scrim: '遮罩',
  href: '链接',
  url: '链接',
  link: '链接',
  target: '跳转页面',
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
  // 以下为皓飞（app111）等站的真实键：企业栏目、段落数组与媒体字段
  paragraphs: '段落',
  points: '要点',
  notes: '说明',
  photos: '照片',
  photo_list: '照片',
  manual_images: '宣传册图片',
  hotlines: '联系电话',
  brochure: '宣传册',
  brochure_title: '宣传册标题',
  qrLabel: '二维码说明',
  qr_image: '二维码图片',
  map_image: '地图图片',
  topImage: '顶部图片',
  topText: '顶部文字',
  iconHover: '悬停图标',
  lead: '引导语',
  leadSub: '引导语（补充）',
  introTitle: '导语标题',
  introText: '导语正文',
  counters: '数据统计',
  unit: '单位',
  line1: '名称',
  line2: '单位',
  jobs: '招聘岗位',
  jobsTitle: '岗位标题',
  recruitment: '招聘',
  moreSlug: '更多跳转',
  rd: '研发中心',
  equipment: '设备介绍',
  innovation: '技术与创新',
  productTech: '产品技术研发',
  cases: '案例',
  display: '产品展示',
  scale: '企业规模',
  honor: '企业荣誉',
  overview: '企业概况',
  article_id: '关联文章 ID',
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
  // 图片数组（皓飞 rd.photos / 宣传册内页等）
  photos: 'images',
  photo_list: 'images',
  manual_images: 'images',
  // 长文本段落数组：多行文本列表，避免长段落被塞进单行标签输入
  paragraphs: 'paragraphs',
  points: 'paragraphs',
  notes: 'paragraphs',
};

/** 纯字符串数组里，超过该长度的条目按「段落」而不是「标签」处理。 */
const PARAGRAPH_TEXT = 40;

/**
 * 标量键名提示：**值为空**或**看不出扩展名**时，靠键名选对媒体控件
 * （富文本键 `content` 是例外：任何值都按富文本处理）。
 *
 * 为什么需要：全租户真实数据里有 7 处 `image` / `image2` 是空串，
 * 没有扩展名可判断 → 原先退化成普通文本框，非技术人员**没法上传**。
 *
 * 只列明确的键名，不做「包含 image 就算图片」这种模糊匹配 ——
 * 那会把 `image_alt`（说明文字）、`video_poster`（图片）判错。
 *
 * 这张表就是**字段键 → 控件的唯一规范**：不论字段来自 image / video / card / cards
 * 还是没有任何 editor 提示的块，命中同一个键就得到同一个控件。
 */
const SCALAR_KEY_KINDS = {
  // 平台约定键：card/cards 的 content、richtext 块的 content。
  // **值哪怕是纯文本也必须是富文本控件**（详见 fieldKind 里对 richtext 的处理）。
  content: 'richtext',
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
  qr_image: 'image',
  qrImage: 'image',
  map_image: 'image',
  topImage: 'image',
  mobile_image: 'image',
  iconHover: 'image',
  hover_image: 'image',
  brochure_image: 'image',
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

/** 媒体控件类型：只有这三种会被「值变成中转态时保持控件」的逻辑保护。 */
export const MEDIA_KINDS = new Set(['image', 'images', 'video']);

/**
 * 是否是上传控件回传的「待上传条目」。
 *
 * `AppUpload` 对**还没传到服务器**的文件回传的是对象而不是字符串：
 * `{ url: 'blob:…', file: File | { name, size, type, category } }`。
 * 它不是业务数据，不能按普通对象推断控件 —— 否则用户刚拖一张图进来，
 * 图片控件就变成 `file` + `url` 两个输入框，预览和上传入口全部消失。
 */
export function isUploadItem(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.url === 'string' &&
    'file' in value
  );
}

/**
 * 值是否处于「上传中转态」：刚删完（null / 空串 / 空数组），或刚选好本地文件（待上传条目）。
 * 中转态下不能按形状重新推断控件，否则上传控件会当场降级成文本/对象表单。
 */
export function isUploadPlaceholder(value) {
  if (value === null || value === undefined || value === '') return true;
  // 空数组的 every() 也是 true：删光所有图之后同样是中转态。
  if (Array.isArray(value)) return value.every(isUploadItem);

  return isUploadItem(value);
}

/** 待上传条目该用哪种媒体控件：键名提示优先，其次看条目自身的文件名/类型。 */
export function uploadItemKind(value, key = '') {
  const hint = SCALAR_KEY_KINDS[key] ?? ARRAY_KEY_HINTS[key];
  if (hint) return hint;
  const file = value?.file;
  const name = String(
    (file && typeof file === 'object' && 'name' in file ? file.name : '') ||
      value?.name ||
      value?.url ||
      '',
  );
  if (isVideoPath(name) || /^video\//i.test(String(file?.type ?? ''))) {
    return 'video';
  }

  return 'image';
}

/**
 * 结合「上一次用过的媒体控件」决定最终控件。
 *
 * 为什么需要这一次记忆：值处于上传中转态时，只靠键名提示不够 —— 没有键名提示的媒体字段
 * （如 `banner_img`）本来是按扩展名推断成上传控件的，值一变空就会退回文本框，用户再也传不了图。
 * 这里改为「保持上次的媒体控件」；普通字段（上一次不是媒体）完全不受影响。
 */
export function resolveFieldKind(key, value, previousMediaKind = '') {
  const inferred = fieldKind(key, value);
  if (MEDIA_KINDS.has(inferred)) return inferred;

  return previousMediaKind && isUploadPlaceholder(value)
    ? previousMediaKind
    : inferred;
}

/**
 * 推断一个字段该用什么控件。
 *
 * 判断优先级：**值的证据 > 键名提示**。值的扩展名/HTML 特征足以定性时就用值；
 * 只有值本身没信息量（空串、看不出扩展名的短路径）才退回键名提示。
 * 唯一例外是富文本键 `content`：它是平台约定键，无论当前值是什么都必须是富文本控件。
 *
 * @param {string} key 字段名（用于标签与少量语义判断）
 * @param {*} value 当前值（形状是主要依据）
 * @returns {'boolean'|'number'|'image'|'images'|'video'|'richtext'|'textarea'|'tags'|'paragraphs'|'object'|'list'|'text'}
 */
export function fieldKind(key, value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';

  if (typeof value === 'string') {
    if (isImagePath(value)) return 'image';
    if (isVideoPath(value)) return 'video';
    if (isHtmlLike(value)) return 'richtext';
    const hint = SCALAR_KEY_KINDS[key];
    // 富文本键（content）**无条件**生效：正文类字段不管是空串、纯文本还是 HTML，
    // 都必须是富文本控件；曾经「纯文本 content 退化成单行文本框」是缺陷而非特性。
    if (hint === 'richtext') return 'richtext';
    // 其余键名兜底只在「值本身没有信息量」时接管（空串，或像路径但看不出类型），
    // 否则空的 image 字段只能填文本、无法上传。
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
      // 全是图片路径 → 图片集合
      if (value.every((item) => isImagePath(item))) return 'images';
      // 长文本段落（paragraphs/points 等，可能没有键名提示）→ 多行文本列表，
      // 不能落进标签 chip 输入：一段 300 字的正文在单行输入框里没法编辑。
      if (value.some((item) => item.trim().length > PARAGRAPH_TEXT)) return 'paragraphs';
      return 'tags';
    }
    // 待上传条目数组（AppUpload 多选回传的对象）：保持多图控件，
    // 不能落到「条目列表」—— 那样每张图会变成 file/链接 两个输入框。
    if (value.every(isUploadItem)) return ARRAY_KEY_HINTS[key] ?? 'images';
    return 'list';
  }

  if (value !== null && typeof value === 'object') {
    // 单个待上传条目：不是业务对象，按键名/条目自身回到媒体控件。
    if (isUploadItem(value)) return uploadItemKind(value, key);
    return 'object';
  }

  // null / undefined：删除媒体后 AppUpload 单文件回传的是 null（`arr[0] || null`），
  // 这里必须沿用键名提示 —— 否则用户点一下控件上的「删除」图标，上传控件会当场退化成
  // 文本框，之后再也传不了图。没有键名提示时才给普通文本框，让用户先填内容。
  //
  // 数组类键名提示（images / tags …）在这里同样适用：`editor.fields` 声明了 `images`
  // 但数据里还没有这个键时，若不兜住就会退化成文本框，用户没法上传图集。
  return SCALAR_KEY_KINDS[key] ?? ARRAY_KEY_HINTS[key] ?? 'text';
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
 * 把块级 `editor.fields` 规范成 `[{key, label}]`。
 *
 * 语义（docs/saas-website-api.md §1.2A）：这是**管理端编辑提示**，声明该块在内容
 * 编辑页要展示哪些字段、用什么名字展示。因此它决定两件事：
 *   1. 展示集合与顺序以声明为准，不再由数据形状决定；
 *   2. label 以声明为准，不再走 FIELD_LABELS 词典猜测。
 *
 * 返回 `null` 表示「没有可用声明」，调用方退回按数据形状推断
 * （真实数据里大量静态块没有 editor.fields）。
 */
export function editorFieldList(editor) {
  const fields = editor?.fields;
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    return null;
  }
  const list = [];
  for (const [key, meta] of Object.entries(fields)) {
    if (typeof key !== 'string' || key === '') continue;
    const label = typeof meta?.label === 'string' ? meta.label.trim() : '';
    if (label === '') continue;
    list.push({ key, label });
  }

  return list.length > 0 ? list : null;
}

/** 声明字段的空白值：按键名提示决定形状（图片集/标签给数组，开关给布尔）。 */
export function blankFieldValue(key) {
  const kind = fieldKind(key, undefined);
  if (kind === 'images' || kind === 'tags' || kind === 'list') return [];
  if (kind === 'boolean') return false;
  if (kind === 'number') return 0;
  if (kind === 'object') return {};

  return '';
}

/**
 * 按声明生成对象字段描述：**只含声明的键**，顺序与 label 全部来自声明。
 *
 * 数据里存在、但未声明的键不会出现在表单里，也**不会从草稿里消失** ——
 * 表单只读写声明键、从不删键，保存时整份草稿写回，未声明字段原样保留（不丢数据）。
 */
export function describeDeclaredFields(value, fields) {
  const source =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};

  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    kind: fieldKind(field.key, source[field.key]),
    value: source[field.key],
  }));
}

/** 按声明字段生成「新增条目」的空白对象（不照抄第一项，避免带出未声明键）。 */
export function blankItemForFields(fields) {
  const blank = {};
  for (const field of fields) blank[field.key] = blankFieldValue(field.key);

  return blank;
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
