/**
 * 页面内容抽屉的加载流水线（纯逻辑 + 依赖注入，便于单测）。
 *
 * 为什么单独抽出来：
 * 抽屉里 `groups` 与 `drafts` 是两份独立的响应式状态。早期实现里
 * `loadContents()` 先写 `groups.value`、再在若干次 `await` 之后才写 `drafts.value`，
 * 中间会渲染出「有分组、没有草稿」的帧，`card` / `video` 分支直接对 undefined
 * 取属性 → `TypeError: Cannot read properties of undefined (reading 'image')`。
 *
 * 这里把两者放在同一份**局部变量**里一次算出并一起返回，结构上就不可能不一致；
 * 组件只在最后一次性提交，不再有中间态。
 */
import {
  describeStaticBlocks,
  getAtPath,
  groupByContentKey,
  unwrap,
} from './pageContentModel';

/**
 * @param {object} deps
 * @param {(ctx: {pageId: number, locale: string}) => Promise<object|null>} deps.fetchSchema
 *        取该语言的取数配置行（没有则 null）。
 * @param {(ctx: {pageId: number, locale: string, contentKey: string}) => Promise<any>} deps.fetchContent
 *        取某个内容键的整份 page_contents.data。
 */
export function createContentLoader({ fetchSchema, fetchContent }) {
  /**
   * 拉取并组装一次完整快照。
   * @returns {Promise<{schema, groups, meta, data, drafts}>}
   *          `groups` 与 `drafts` 保证互相一致：凡是 editable 分组里的块，
   *          `drafts[blockName]` 一定有值。
   */
  async function load({ pageId, locale, pageCode }) {
    const schema = (await fetchSchema({ pageId, locale })) ?? null;

    const descriptors = schema
      ? describeStaticBlocks(schema.schema, pageCode)
      : [];
    const groups = groupByContentKey(descriptors, pageCode);
    const meta = Object.fromEntries(
      descriptors.map((descriptor) => [descriptor.blockName, descriptor]),
    );

    const data = {};
    for (const group of groups) {
      if (!group.editable) continue;
      try {
        data[group.key] = await fetchContent({
          pageId,
          locale,
          contentKey: group.contentKey,
        });
      } catch {
        // 单个内容键拉取失败降级为 null，不影响其它块；草稿仍会算出空形状，
        // 保证渲染期永远不会读到 undefined。
        data[group.key] = null;
      }
    }

    const drafts = {};
    for (const descriptor of descriptors) {
      const group = groups.find((item) => item.blocks.includes(descriptor));
      if (!group?.editable) continue;
      drafts[descriptor.blockName] = unwrap(
        descriptor.editor?.type ?? 'json',
        getAtPath(data[group.key], descriptor.path),
      );
    }

    return { schema, groups, meta, data, drafts };
  }

  return { load };
}
