/**
 * 页面静态内容的纯逻辑层（无 Vue 依赖，便于单测）。
 *
 * 协议依据：docs/saas-website-api.md §1.2A「页面数据配置」。
 * - 页面取数配置（page_data_schemas.schema）顶层只有 blocks，每个块有
 *   provider / config / enabled / editor。
 * - 静态内容值保存在 page_contents.data，按「应用 + 页面 + 语言 + content_key」定位；
 *   provider=static_content 的块用 config.path 指向 data 里的子值。
 * - 保存必须整份 JSON 读改、只替换目标路径：多个块引用同一 content_key 的不同
 *   path 时，保存一个不得删掉其他路径。
 *
 * 这里只做「读取/写入/校验」的纯函数，不发起请求、不碰 DOM。
 */

/** 允许的 provider。 */
export const PROVIDERS = ['model', 'static_content', 'page_banner'];

/** static_content 块允许的 editor.type。 */
export const EDITOR_TYPES = [
  'image',
  'images',
  'video',
  'richtext',
  'card',
  'cards',
  'json',
];

/** 各 editor.type 允许声明的字段（对齐后端 StaticBlockEditor::FIELDS）。 */
export const EDITOR_FIELDS = {
  image: ['image'],
  images: [],
  video: ['video', 'image'],
  richtext: ['content'],
  card: [
    'title',
    'subtitle',
    'content',
    'image',
    'image2',
    'images',
    'video',
    'tags',
  ],
  cards: [
    'title',
    'subtitle',
    'content',
    'image',
    'image2',
    'images',
    'video',
    'tags',
  ],
  json: [],
};

/** 卡片约定字段 → 编辑控件类型。 */
export const CARD_FIELD_KINDS = {
  title: 'text',
  subtitle: 'text',
  content: 'richtext',
  image: 'image',
  image2: 'image',
  images: 'images',
  video: 'video',
  tags: 'tags',
};

const BLOCK_NAME_RE = /^[a-z][a-z0-9_-]*$/;

/** 深拷贝（仅处理 JSON 可表达的值，页面内容本身就是 JSON）。 */
function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;

  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * 按路径读取子值。路径为空/缺省返回整份数据。
 * 中途遇到非对象/数组返回 undefined（与后端「找不到路径返回 null」的容错一致）。
 */
export function getAtPath(data, path) {
  if (!Array.isArray(path) || path.length === 0) return data;
  let cursor = data;
  for (const key of path) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = cursor[key];
  }

  return cursor;
}

/**
 * 按路径写入子值，**保留所有兄弟路径**。
 * - 路径为空数组：整份替换。
 * - 中间层缺失或类型不符时按下一个 key 的类型补容器（数字下标 → 数组）。
 * 返回新对象，不修改入参。
 */
export function setAtPath(data, path, value) {
  if (!Array.isArray(path) || path.length === 0) return value;
  const base =
    data !== null && typeof data === 'object'
      ? deepClone(data)
      : typeof path[0] === 'number'
        ? []
        : {};
  let cursor = base;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    const nextKey = path[i + 1];
    const existing = cursor[key];
    if (existing === null || typeof existing !== 'object') {
      cursor[key] = typeof nextKey === 'number' ? [] : {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;

  return base;
}

/**
 * 解析 editor.type 对应的数据形状。
 * 实际存储既可能是推荐形状（如 `{ image }` / `{ content }`），也可能是裸标量/数组，
 * 这里统一「读出控件值 + 记住原始形状」，保存时再合回，保证不丢字段。
 *
 * 对每个 editor.type 都返回**已定义**的值（对象/数组/字符串），绝不返回 undefined
 * —— 模板会直接对这些值取属性（如 `drafts[name].image`），undefined 会直接抛错。
 */
export function unwrap(editorType, raw) {
  const isObject = isPlainObject(raw);
  switch (editorType) {
    case 'image': {
      if (isObject) return raw.image ?? '';
      return typeof raw === 'string' ? raw : '';
    }
    case 'images': {
      if (Array.isArray(raw)) return [...raw];
      if (isObject) return Array.isArray(raw.images) ? [...raw.images] : [];
      return [];
    }
    case 'richtext': {
      if (isObject) return raw.content ?? '';
      return typeof raw === 'string' ? raw : '';
    }
    case 'video': {
      if (isObject) return { ...raw };
      return { video: '', image: '' };
    }
    case 'card': {
      if (isObject) return { ...raw };
      return {};
    }
    case 'cards': {
      if (Array.isArray(raw)) return raw.map((item) => ({ ...item }));
      return [];
    }
    default:
      return raw ?? null;
  }
}

/** 把控件值合回原始形状，保留原有对象里的其他字段。 */
export function rewrap(editorType, raw, value) {
  const isObject = isPlainObject(raw);
  switch (editorType) {
    case 'image':
      return isObject ? { ...raw, image: value } : value;
    case 'images':
      return isObject ? { ...raw, images: value } : value;
    case 'richtext':
      return isObject ? { ...raw, content: value } : value;
    case 'video':
      return isObject ? { ...raw, ...value } : value;
    default:
      return value;
  }
}

/**
 * 从页面取数配置里挑出静态块描述。
 * 只返回 provider=static_content 且声明了 content_key 的块。
 *
 * @returns {Array<{blockName,contentKey,pageCode,isCurrentPage,path,enabled,editor,label}>}
 */
export function describeStaticBlocks(schema, currentPageCode = null) {
  const blocks = isPlainObject(schema?.blocks) ? schema.blocks : {};
  const out = [];
  for (const [blockName, block] of Object.entries(blocks)) {
    if (!isPlainObject(block) || block.provider !== 'static_content') continue;
    const config = isPlainObject(block.config) ? block.config : {};
    const contentKey = config.content_key;
    if (typeof contentKey !== 'string' || contentKey.trim() === '') continue;
    const pageCode =
      typeof config.page_code === 'string' && config.page_code !== ''
        ? config.page_code
        : null;
    const editor = isPlainObject(block.editor) ? block.editor : null;
    out.push({
      blockName,
      contentKey,
      pageCode,
      isCurrentPage: pageCode === null || pageCode === currentPageCode,
      path: Array.isArray(config.path) ? config.path : [],
      enabled: block.enabled !== false,
      editor,
      label: editor?.label || blockName,
    });
  }

  return out;
}

/**
 * 按「内容行」分组：同一个 page_code + content_key 的多个块共用一份 page_contents.data。
 * 跨页引用（page_code 指向本应用其他页面）无法通过本页的内容接口保存，标记 editable=false。
 */
export function groupByContentKey(descriptors, currentPageCode = null) {
  const groups = new Map();
  for (const descriptor of descriptors) {
    const rowKey = `${descriptor.pageCode ?? currentPageCode ?? ''}::${descriptor.contentKey}`;
    if (!groups.has(rowKey)) {
      groups.set(rowKey, {
        key: rowKey,
        pageCode: descriptor.pageCode ?? currentPageCode ?? null,
        contentKey: descriptor.contentKey,
        editable: descriptor.isCurrentPage,
        blocks: [],
      });
    }
    const group = groups.get(rowKey);
    if (!descriptor.isCurrentPage) group.editable = false;
    group.blocks.push(descriptor);
  }

  return [...groups.values()];
}

/** 校验块名（对齐后端 /^[a-z][a-z0-9_-]*$/）。 */
export function isValidBlockName(name) {
  return typeof name === 'string' && BLOCK_NAME_RE.test(name);
}

/**
 * 校验单个具名块的配置，返回错误信息数组（空数组表示通过）。
 * 规则对齐后端 PageDataSchemaService::normalize + StaticBlockEditor::normalize，
 * 让前端能在保存前给出可读提示；后端仍会再校验一次。
 */
export function validateBlock(blockName, block) {
  const errors = [];
  if (!isValidBlockName(blockName)) {
    errors.push('块名需匹配 [a-z][a-z0-9_-]*');
  }
  if (!isPlainObject(block)) {
    errors.push('块必须是 JSON 对象');
    return errors;
  }
  const unknownKeys = Object.keys(block).filter(
    (key) => !['provider', 'config', 'enabled', 'editor'].includes(key),
  );
  if (unknownKeys.length > 0) {
    errors.push(`块只接受 provider/config/enabled/editor，发现 ${unknownKeys.join('、')}`);
  }
  if (!PROVIDERS.includes(block.provider)) {
    errors.push(`provider 必须是 ${PROVIDERS.join(' / ')}`);
    return errors;
  }
  if (!isPlainObject(block.config)) {
    errors.push('config 必须是 JSON 对象');
    return errors;
  }
  if (block.enabled !== undefined && typeof block.enabled !== 'boolean') {
    errors.push('enabled 必须是布尔值');
  }

  errors.push(...validateProviderConfig(block.provider, block.config));

  if (block.editor !== undefined) {
    if (block.provider !== 'static_content') {
      errors.push('editor 只能配置在 static_content 块上');
    } else {
      errors.push(...validateEditor(block.editor));
    }
  }

  return errors;
}

/** model.config 保留名：不可作为 id_param。 */
const RESERVED_ID_PARAMS = [
  'host',
  'locale',
  'device',
  'application_code',
  'application_id',
  'tenant_id',
];

const MODEL_CONFIG_KEYS = [
  'type',
  'mode',
  'filters',
  'sort_by',
  'fields',
  'category_slug',
  'limit',
  'related',
  'id',
  'id_param',
];

function validateProviderConfig(provider, config) {
  const errors = [];
  if (provider === 'model') {
    const unknown = Object.keys(config).filter(
      (key) => !MODEL_CONFIG_KEYS.includes(key),
    );
    if (unknown.length > 0) {
      errors.push(`model.config 含未知字段：${unknown.join('、')}`);
    }
    // 后端 ModelProvider 明确拒绝 null：可选配置请省略。
    for (const [key, value] of Object.entries(config)) {
      if (value === null) errors.push(`model.${key} 不接受 null，请省略`);
    }
    if (typeof config.type !== 'string' || config.type.trim() === '') {
      errors.push('model.type 不能为空（来源逻辑名，如 product）');
    }
    if (config.mode !== 'list' && config.mode !== 'one') {
      errors.push('model.mode 必须是 list 或 one');
    }
    if (config.mode === 'one') {
      for (const field of ['limit', 'related']) {
        if (config[field] !== undefined) {
          errors.push(`model.mode=one 不接受 ${field}`);
        }
      }
    }
    if (config.id !== undefined && config.id_param !== undefined) {
      errors.push('model.id 与 model.id_param 互斥');
    }
    if (config.mode === 'list' && (config.id !== undefined || config.id_param !== undefined)) {
      errors.push('model.mode=list 不接受 id/id_param');
    }
    if (config.id !== undefined && (!Number.isInteger(config.id) || config.id <= 0)) {
      errors.push('model.id 必须是正整数');
    }
    if (config.id_param !== undefined) {
      if (
        typeof config.id_param !== 'string' ||
        !/^[a-z][a-z0-9_]*$/.test(config.id_param)
      ) {
        errors.push('model.id_param 必须匹配 [a-z][a-z0-9_]*');
      } else if (RESERVED_ID_PARAMS.includes(config.id_param)) {
        errors.push(`model.id_param 不能使用保留名 ${config.id_param}`);
      }
    }
    if (config.limit !== undefined) {
      if (!Number.isInteger(config.limit) || config.limit < 1 || config.limit > 100) {
        errors.push('model.limit 必须是 1..100 的整数');
      }
    }
    if (config.filters !== undefined && !Array.isArray(config.filters)) {
      errors.push('model.filters 必须是条件数组');
    }
    if (config.sort_by !== undefined && !Array.isArray(config.sort_by)) {
      errors.push('model.sort_by 必须是数组');
    }
  } else if (provider === 'static_content') {
    const unknown = Object.keys(config).filter(
      (key) => !['content_key', 'page_code', 'path'].includes(key),
    );
    if (unknown.length > 0) {
      errors.push(`static_content.config 含未知字段：${unknown.join('、')}`);
    }
    if (typeof config.content_key !== 'string' || config.content_key.trim() === '') {
      errors.push('static_content.content_key 不能为空');
    }
    if (
      config.page_code !== undefined &&
      (typeof config.page_code !== 'string' || config.page_code.trim() === '')
    ) {
      errors.push('static_content.page_code 必须为非空字符串');
    }
    if (config.path !== undefined) {
      if (!Array.isArray(config.path)) {
        errors.push('static_content.path 必须是字面键/下标数组');
      } else if (config.path.length > 32) {
        errors.push('static_content.path 最多 32 层');
      } else if (
        config.path.some(
          (part) =>
            !((typeof part === 'string' && part !== '') ||
              (Number.isInteger(part) && part >= 0)),
        )
      ) {
        errors.push('static_content.path 只接受非空字符串或非负整数');
      }
    }
  } else if (provider === 'page_banner') {
    const unknown = Object.keys(config).filter((key) => key !== 'fallback');
    if (unknown.length > 0) {
      errors.push(`page_banner.config 含未知字段：${unknown.join('、')}`);
    }
    if (
      config.fallback !== undefined &&
      !['none', 'static_template'].includes(config.fallback)
    ) {
      errors.push('page_banner.fallback 只能是 none 或 static_template');
    }
  }

  return errors;
}

function validateEditor(editor) {
  const errors = [];
  if (!isPlainObject(editor)) return ['editor 必须是 JSON 对象'];
  const unknownKeys = Object.keys(editor).filter(
    (key) => !['type', 'label', 'fields'].includes(key),
  );
  if (unknownKeys.length > 0) {
    errors.push(`editor 只接受 type/label/fields，发现 ${unknownKeys.join('、')}`);
  }
  if (!EDITOR_TYPES.includes(editor.type)) {
    errors.push(`editor.type 必须是 ${EDITOR_TYPES.join(' / ')}`);
    return errors;
  }
  if (!isValidLabel(editor.label)) {
    errors.push('editor.label 必填且不超过 160 字');
  }
  const allowed = EDITOR_FIELDS[editor.type];
  if (['card', 'cards'].includes(editor.type) && !isPlainObject(editor.fields)) {
    errors.push('card/cards 必须配置 fields 及字段 label');
    return errors;
  }
  if (editor.fields !== undefined) {
    if (!isPlainObject(editor.fields) || Object.keys(editor.fields).length === 0) {
      errors.push('editor.fields 必须是非空对象');
      return errors;
    }
    for (const [field, definition] of Object.entries(editor.fields)) {
      if (!allowed.includes(field)) {
        errors.push(`editor.type=${editor.type} 不支持字段 ${field}`);
        continue;
      }
      if (!isPlainObject(definition) || !isValidLabel(definition.label)) {
        errors.push(`editor.fields.${field} 只能配置非空 label`);
      }
    }
  }

  return errors;
}

function isValidLabel(label) {
  return typeof label === 'string' && label.trim() !== '' && label.length <= 160;
}

/**
 * 校验整份取数配置，返回 [{block, message}]。
 * 顶层只能有 blocks；空 blocks 合法。
 */
export function validateSchema(schema) {
  const errors = [];
  if (!isPlainObject(schema)) {
    return [{ block: '-', message: '配置必须是 JSON 对象' }];
  }
  const keys = Object.keys(schema);
  if (keys.length !== 1 || keys[0] !== 'blocks') {
    return [{ block: '-', message: '配置顶层只能包含 blocks' }];
  }
  if (!isPlainObject(schema.blocks)) {
    return [{ block: '-', message: 'blocks 必须是具名对象（不接受数组或 null）' }];
  }
  for (const [blockName, block] of Object.entries(schema.blocks)) {
    for (const message of validateBlock(blockName, block)) {
      errors.push({ block: blockName, message });
    }
  }

  return errors;
}

/**
 * 由编辑器模型生成保存用 payload：`{ blocks: {...} }`。
 * 空 blocks 输出 `{}`（与后端一致，不输出 `[]`）。
 */
export function toSchemaPayload(blocks) {
  const entries = Object.entries(blocks ?? {});
  if (entries.length === 0) return { blocks: {} };

  return { blocks: Object.fromEntries(entries) };
}

/**
 * 解析 JSON 文本并返回 {ok, value, error}，供 JSON 兜底模式复用。
 */
export function parseJsonText(text) {
  try {
    return { ok: true, value: JSON.parse(text), error: null };
  } catch (error) {
    return { ok: false, value: null, error: error.message };
  }
}
