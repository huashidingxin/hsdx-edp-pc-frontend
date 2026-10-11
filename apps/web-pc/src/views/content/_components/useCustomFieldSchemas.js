/**
 * 内容编辑页的「租户级自定义字段」（content_field_schemas）。
 *
 * 参照 useCustomCategoryFields 的注入范式：按内容模型拉取租户声明的字段定义，
 * 动态生成 LocaleManager 语言 tabs 内的字段控件（值存各语种 custom_fields JSON）。
 *
 * 类型体系（与静态块 editor 同词汇）：
 * - text / richtext / image / images / video / tags：标量与媒体槽位
 * - object：对象容器，子字段来自块字段白名单（title/subtitle/image…），
 *   以 `custom_fields.<key>.<sub>` dot 平面键渲染结构化控件
 * - array：对象数组容器，管理端用 JSON 文本域编辑（后端按声明严格校验兜底）
 *
 * 读写形状有意不对称：
 * - 后端：`locales[lang].custom_fields = { key: value }`（对象，object/array 嵌套）
 * - 表单：LocaleTabsEditor 的 dot 字段是平面键，需要展开/折叠；
 *   tags 类（顶层或子字段）在表单里用多行文本（每行一个标签），与数组互转。
 *
 * 未配置字段的租户、或没有 cms.content_field.read 的角色：静默退化为无自定义字段，
 * 内容本身仍可正常编辑（与扩展分类同一容错策略）。
 */
import { computed, ref } from 'vue';

import Resource from '#/api/resource';

/** object/array 的子字段白名单与语义（与后端 ContentFieldSchemaService::BLOCK_FIELDS 对齐）。 */
const BLOCK_SUB_FIELDS = [
  { key: 'title', label: '标题', kind: 'text' },
  { key: 'subtitle', label: '副标题', kind: 'text' },
  { key: 'content', label: '内容', kind: 'text' },
  { key: 'text', label: '文本', kind: 'text' },
  { key: 'text2', label: '文本2', kind: 'text' },
  { key: 'text3', label: '文本3', kind: 'text' },
  { key: 'image', label: '图片', kind: 'media' },
  { key: 'image2', label: '图片2', kind: 'media' },
  { key: 'images', label: '图片组', kind: 'imagelist' },
  { key: 'video', label: '视频', kind: 'media' },
  { key: 'tags', label: '标签', kind: 'strlist' },
  { key: 'target', label: '链接', kind: 'text' },
];

function subMeta(subKey) {
  return BLOCK_SUB_FIELDS.find((sub) => sub.key === subKey) || { key: subKey, label: subKey, kind: 'text' };
}

/** 定义声明的子字段集（fields 子声明，缺省 = 全部白名单）。 */
function declaredSubs(definition) {
  if (definition?.fields && typeof definition.fields === 'object') {
    return Object.entries(definition.fields).map(([key, meta]) => [key, meta]);
  }
  return BLOCK_SUB_FIELDS.map((sub) => [sub.key, { label: sub.label }]);
}

/** 顶层字段控件。 */
function fieldControl(key, definition) {
  const base = { field: `custom_fields.${key}`, label: definition.label || key, span: 24 };
  switch (definition.type) {
    case 'richtext': {
      return { ...base, type: 'editor' };
    }
    case 'image': {
      return { ...base, type: 'file', attrs: { fileType: 'image' } };
    }
    case 'images': {
      return { ...base, type: 'file', attrs: { fileType: 'image', multiple: true } };
    }
    case 'video': {
      return { ...base, type: 'file', attrs: { fileType: 'video' } };
    }
    case 'tags': {
      // 数组 ↔ 多行文本：每行一个标签（detailFormat/saveFormat 负责互转）。
      return { ...base, type: 'textarea', attrs: { rows: 3, placeholder: '每行一个标签' } };
    }
    case 'object': {
      // 对象容器：子字段铺成 `custom_fields.<key>.<sub>` dot 平面键。
      return declaredSubs(definition).map(([subKey, meta]) => {
        const kind = subMeta(subKey).kind;
        const field = {
          field: `custom_fields.${key}.${subKey}`,
          label: `${base.label} · ${meta?.label || subMeta(subKey).label}`,
          span: 24,
        };
        if (kind === 'media') {
          return { ...field, type: 'file', attrs: { fileType: subKey === 'video' ? 'video' : 'image' } };
        }
        if (kind === 'imagelist') {
          return { ...field, type: 'file', attrs: { fileType: 'image', multiple: true } };
        }
        if (kind === 'strlist') {
          return { ...field, type: 'textarea', attrs: { rows: 2, placeholder: '每行一个标签' } };
        }
        return { ...field, type: 'text' };
      });
    }
    case 'array': {
      // 对象数组容器：JSON 文本域（后端按声明严格校验）。
      return {
        ...base,
        type: 'json',
        attrs: { rows: 8, placeholder: '[{"title": "…", "image": "…"}, …]' },
      };
    }
    default: {
      return { ...base, type: 'text' };
    }
  }
}

/** 多行文本 ↔ 标签数组。 */
function splitLines(raw) {
  return String(raw ?? '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * @param {string} model 内容模型逻辑名（`product` / `article` / `case-study`…），
 *   与 website_registry.sources、model provider 的 `type` 同口径。
 */
export function useCustomFieldSchemas(model) {
  const definitions = ref({});

  /** 拼进 LocaleManager fields 的控件片段（无声明字段时为空数组）。 */
  const localeFields = computed(() =>
    Object.entries(definitions.value).flatMap(([key, definition]) => {
      const control = fieldControl(key, definition);
      return Array.isArray(control) ? control : [control];
    }),
  );

  /** 详情出参 → 表单模型：语种 custom_fields 展开为 dot 平面键（array 序列化为 JSON 文本）。 */
  function detailFormat(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.locales)) return data;
    const keys = Object.keys(definitions.value);
    if (keys.length === 0) return data;
    return {
      ...data,
      locales: data.locales.map((locale) => {
        const values =
          locale.custom_fields &&
          typeof locale.custom_fields === 'object' &&
          !Array.isArray(locale.custom_fields)
            ? locale.custom_fields
            : {};
        const flat = {};
        for (const key of keys) {
          const definition = definitions.value[key];
          const value = values[key];
          if (definition?.type === 'array') {
            flat[`custom_fields.${key}`] =
              Array.isArray(value) && value.length > 0 ? JSON.stringify(value, null, 2) : '';
            continue;
          }
          if (definition?.type === 'object') {
            const nested =
              value && typeof value === 'object' && !Array.isArray(value) ? value : {};
            for (const [subKey] of declaredSubs(definition)) {
              if (!(subKey in nested)) continue;
              const sub = nested[subKey];
              flat[`custom_fields.${key}.${subKey}`] =
                subMeta(subKey).kind === 'strlist' ? (Array.isArray(sub) ? sub.join('\n') : '') : sub;
            }
            continue;
          }
          if (!(key in values)) continue;
          flat[`custom_fields.${key}`] =
            definition?.type === 'tags' ? (Array.isArray(value) ? value.join('\n') : '') : value;
        }
        return { ...locale, ...flat };
      }),
    };
  }

  /** 表单模型 → 提交载荷：平面键折回 custom_fields 对象，只提交声明过的字段。 */
  function saveFormat(payload) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.locales)) return payload;
    const keys = Object.keys(definitions.value);
    if (keys.length === 0) return payload;
    return {
      ...payload,
      locales: payload.locales.map((locale) => {
        const next = {};
        for (const key of keys) {
          const definition = definitions.value[key];
          if (definition?.type === 'array') {
            // LocaleTabsEditor 的 json 类型在提交前已 JSON.parse。
            const parsed = locale[`custom_fields.${key}`];
            const items = Array.isArray(parsed)
              ? parsed.filter(
                  (item) => item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length > 0,
                )
              : [];
            next[key] = items.length > 0 ? items : null;
            continue;
          }
          if (definition?.type === 'object') {
            const obj = {};
            for (const [subKey] of declaredSubs(definition)) {
              const fieldKey = `custom_fields.${key}.${subKey}`;
              if (!(fieldKey in locale)) continue;
              const kind = subMeta(subKey).kind;
              const raw = locale[fieldKey];
              let value = null;
              if (kind === 'strlist') {
                const items = splitLines(raw);
                value = items.length > 0 ? items : null;
              } else if (kind === 'imagelist') {
                value = Array.isArray(raw) && raw.length > 0 ? raw : null;
              } else {
                value = raw === '' || raw === undefined || raw === null ? null : raw;
              }
              if (value !== null) obj[subKey] = value;
            }
            next[key] = Object.keys(obj).length > 0 ? obj : null;
            continue;
          }
          if (!(key in locale)) continue;
          const raw = locale[`custom_fields.${key}`];
          if (definition?.type === 'tags') {
            const items = splitLines(raw);
            next[key] = items.length > 0 ? items : null;
          } else if (definition?.type === 'images') {
            next[key] = Array.isArray(raw) && raw.length > 0 ? raw : null;
          } else {
            next[key] = raw === '' || raw === undefined ? null : raw;
          }
        }
        return { ...locale, custom_fields: next };
      }),
    };
  }

  async function load() {
    try {
      const { data } = await new Resource(`content-schemas/${model}`).list();
      const fields = data?.fields && typeof data.fields === 'object' ? data.fields : {};
      // 只保留类型合法的定义，坏定义直接忽略（后端保存时已校验，此处兜底）。
      const next = {};
      for (const [key, definition] of Object.entries(fields)) {
        if (definition && typeof definition === 'object' && definition.type) {
          next[key] = definition;
        }
      }
      definitions.value = next;
    } catch (error) {
      // 未配置的租户、或没有 cms.content_field.read 的角色：静默退化为无自定义字段。
      console.error('[useCustomFieldSchemas] 字段定义加载失败:', error);
      definitions.value = {};
    }
  }

  return { definitions, localeFields, detailFormat, saveFormat, load };
}
