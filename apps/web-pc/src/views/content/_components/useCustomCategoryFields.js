/**
 * 内容编辑页的「租户级扩展分类」字段（京华兆建规划 §4.1）。
 *
 * 读写形状**有意不对称**（规划定案，勿「统一」）：
 * - 写入：`custom_categories: { <维度>: [节点 id] }`（映射）
 * - 读出：`custom_categories: [{dimension, id, name, slug}]`（扁平列表）
 * 所以编辑页必须用 detailFormat 把列表折回映射，否则 `custom_categories.<维度>`
 * 这个 dot 字段取不到值、选择器回显恒为空（保存时还会把已有关联覆盖掉）。
 *
 * 维度只声明、不动态创建；`models` 声明在三处收敛，这里是第一处 ——
 * 编辑页只显示适用于当前内容模型的维度（`GET custom-categories/dimensions?model=`）。
 */
import { computed, ref } from 'vue';

import Resource from '#/api/resource';

/** 出参的扁平列表 → `{维度: [节点 id]}` 映射（供 dot 字段回显）。 */
export function groupAssignments(list) {
  const map = {};
  for (const item of Array.isArray(list) ? list : []) {
    const dimension = item?.dimension;
    if (!dimension) continue;
    (map[dimension] ||= []).push(Number(item.id));
  }
  return map;
}

/** 树拍平为带缩进层级的多选选项（与扩展分类管理页的 flattenTree 同一做法）。 */
function flattenTree(nodes, depth = 0, out = []) {
  for (const node of nodes || []) {
    out.push({
      value: Number(node.id),
      // 树形维度用全角空格缩进，保住层级观感（antdv Select 不支持树形多选）。
      label: `${'\u3000'.repeat(depth)}${node.name || `#${node.id}`}`,
    });
    flattenTree(node.children, depth + 1, out);
  }
  return out;
}

/**
 * @param {string} model 内容模型逻辑名（`article` / `product` / `case-study`），
 *   与 `custom_category_dimensions.*.models`、`model` provider 的 `type` 同口径。
 */
export function useCustomCategoryFields(model) {
  const dimensions = ref([]);
  const options = ref({});

  /** 可直接拼进页面 formFields 的字段片段（无适用维度时为空数组）。 */
  const fields = computed(() => {
    if (dimensions.value.length === 0) return [];
    return [
      { field: 'custom_categories_title', type: 'title', label: '扩展分类', span: 24 },
      ...dimensions.value.map((dimension) => ({
        field: `custom_categories.${dimension.key}`,
        type: 'multiselect',
        label: dimension.label || dimension.key,
        span: 12,
        attrs: { options: options.value[dimension.key] || [] },
      })),
    ];
  });

  /** 详情出参 → 表单模型：扁平列表折回映射，dot 字段才能取到值。 */
  function detailFormat(data) {
    if (!data || typeof data !== 'object') return data;
    return {
      ...data,
      custom_categories: groupAssignments(data.custom_categories),
    };
  }

  /**
   * 只提交本页真正渲染的维度。
   *
   * 详情里可能带着本模型不适用的维度（例如租户事后把该模型从某维度的 `models` 中移除），
   * 原样回传会被后端 `validateForContent` 判 422，让这条内容彻底无法保存；
   * 而「请求里未出现的维度 = 保持不变」是既定语义，丢掉这些键既安全又不丢数据。
   */
  function saveFormat(payload) {
    const raw = payload?.custom_categories;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return payload;
    const allowed = new Set(dimensions.value.map((d) => d.key));
    const next = {};
    for (const [key, ids] of Object.entries(raw)) {
      if (!allowed.has(key)) continue;
      next[key] = Array.isArray(ids) ? ids : [];
    }
    return { ...payload, custom_categories: next };
  }

  async function loadOptions() {
    const next = {};
    for (const dimension of dimensions.value) {
      try {
        const { data } = await new Resource('custom-categories/tree').list({
          dimension: dimension.key,
        });
        next[dimension.key] = flattenTree(data?.items);
      } catch (error) {
        // 单个维度取不到节点不该让整个编辑页不可用：留空选项，其余维度照常。
        console.error(`[useCustomCategoryFields] 维度 ${dimension.key} 节点加载失败:`, error);
        next[dimension.key] = [];
      }
    }
    options.value = next;
  }

  async function load() {
    try {
      const { data } = await new Resource('custom-categories/dimensions').list({ model });
      dimensions.value = data?.dimensions || [];
      await loadOptions();
    } catch (error) {
      // 未声明维度的租户、或没有 cms.custom_category.read 的角色：静默退化为「无扩展分类」，
      // 内容本身仍可正常编辑。
      console.error('[useCustomCategoryFields] 维度加载失败:', error);
      dimensions.value = [];
      options.value = {};
    }
  }

  return { dimensions, options, fields, detailFormat, saveFormat, load };
}
