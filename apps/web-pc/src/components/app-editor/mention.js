/**
 * 站内Mention 内链（`@` 触发，接业务 records 搜索）
 *
 * 输出约定（微信友好、无 data-*）：
 * - 节点 attrs 只用 { id, label }，且约定 **id 即站内 URL**；
 * - renderHTML 输出原生 `<a class="edp-mention" href="URL">标题</a>`
 *  （class 被剥离后仍是可用链接；站点侧样式见 content-styles.js 的
 *   `.edp-mention` 规则）；
 * - parseHTML 只认 `a.edp-mention`，普通外链不受影响（仍走 Link mark）。
 *
 * 数据源经 getFetchMentions 注入（index.vue 用 ref 保持同步，支持热切换）：
 *   (query: string) => Promise<Array<{ url: string, label: string, hint?: string }>>
 * 未配置时建议列表显示接入提示，不报错。
 */
import { PluginKey } from '@tiptap/pm/state';
import { Mention } from '@tiptap/extension-mention';

import { createPopupRenderer } from './suggestion-popup';

export const mentionPluginKey = new PluginKey('appEditorMention');

const NoopPopupText = '未配置内链数据源，可通过 fetch-mentions 接入业务搜索';

/**
 * @param {{ getFetchMentions?: () => null | ((query: string) => Promise<Array<object>>) }} options
 */
export function createAppMentionExtension(options = {}) {
  const { getFetchMentions } = options;

  const Base = Mention.extend({
    parseHTML() {
      return [
        {
          tag: 'a.edp-mention',
          getAttrs: (el) => {
            const href = el.getAttribute('href') || '';
            if (!href) return false;
            const label = (el.textContent || '').trim() || href;
            return { id: href, label };
          },
        },
      ];
    },
  });

  return Base.configure({
    HTMLAttributes: {},
    renderHTML({ node }) {
      const href = node.attrs.id || '#';
      const label = node.attrs.label || href;
      return ['a', { href, class: 'edp-mention' }, label];
    },
    renderText({ node }) {
      return node.attrs.label || node.attrs.id || '';
    },
    suggestion: {
      char: '@',
      pluginKey: mentionPluginKey,
      items: async ({ query }) => {
        const fn = typeof getFetchMentions === 'function' ? getFetchMentions() : null;
        if (typeof fn !== 'function') return [];
        try {
          const list = await fn(query || '');
          if (!Array.isArray(list)) return [];
          return list
            .map((it) => ({
              id: it.url || it.id || '',
              label: it.label || it.title || it.name || '',
              hint: it.hint || it.type || '',
            }))
            .filter((it) => it.id && it.label);
        } catch {
          return [];
        }
      },
      render: () =>
        createPopupRenderer({
          formatItem: (item) => ({ title: item.label, hint: item.hint }),
          emptyText: NoopPopupText,
        }),
    },
  });
}
