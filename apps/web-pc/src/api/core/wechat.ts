import { requestClient } from '#/api/request';

/**
 * 公众号（应用类型=公众号）相关接口。
 *
 * 全部是应用级接口：X-Application-Id 由 request.ts 的请求拦截器统一注入，
 * 这里不用管。发布走独立的 `cms.wechat.publish` 权限，其余写操作走 `cms.wechat.write`。
 */

export namespace WechatApi {
  /** 可同步的内容类型（后端给 uri，前端不自己维护类型→路由的映射） */
  export interface SyncableType {
    label: string;
    type: string;
    uri: string;
  }

  export interface WechatArticle {
    article_url: string;
    author: string;
    content_html?: string;
    content_id: number;
    content_source_url: string;
    content_type: string;
    content_type_label: string;
    cover_path: string;
    cover_url: string;
    digest: string;
    draft_media_id: string;
    drafted_at?: null | string;
    id: number;
    last_error?: null | string;
    locale: string;
    published_at?: null | string;
    status: 'draft' | 'drafted' | 'failed' | 'published';
    status_label: string;
    synced_at?: null | string;
    title: string;
  }

  export interface WechatSettings {
    app_id: string;
    aes_key: string;
    author: string;
    configured: boolean;
    link_strategy: 'keep' | 'strip';
    preview_touser: string;
    preview_wxname: string;
    secret_configured: boolean;
    /** 库里没存 secret、但 env 兜底有值时为 true */
    secret_from_env: boolean;
    source_url_template: string;
    token: string;
  }

  /** 试算结果（未落库）：编辑器创建模式的初始内容 */
  export interface WechatPreview {
    author: string;
    content_html: string;
    content_id: number;
    content_source_url: string;
    content_type: string;
    content_type_label: string;
    cover_path: string;
    cover_url: string;
    digest: string;
    locale: string;
    title: string;
    warnings: string[];
  }

  /** 确认同步时提交的内容：源定位 + 编辑器里调整后的字段 */
  export type WechatCommitPayload = {
    content_id: number;
    content_type: string;
    locale?: string;
    /** 落库后立即写入微信草稿箱 */
    sync_draft?: boolean;
  } & Partial<
    Pick<
      WechatArticle,
      | 'author'
      | 'content_html'
      | 'content_source_url'
      | 'cover_path'
      | 'digest'
      | 'title'
    >
  >;

  export type WechatSettingsPayload = Partial<
    Pick<
      WechatSettings,
      | 'aes_key'
      | 'app_id'
      | 'author'
      | 'link_strategy'
      | 'preview_touser'
      | 'preview_wxname'
      | 'source_url_template'
      | 'token'
    >
  > & { secret?: string };
}

/** 可同步的内容类型清单 */
export async function getWechatTypesApi() {
  return requestClient.get<WechatApi.SyncableType[]>('/wechat-articles/types');
}

/**
 * 试算：把源内容适配成公众号图文，**不落库**。
 *
 * 「同步公众号」的顺序是 previewSource → 编辑器里预览并调整 → 确认样式后才 commit。
 * 这一步不能写 wechat_articles：运营只是点开看看就落一条记录，列表里会全是半成品。
 *
 * 命名带 Source 是为了和下面的 previewWechatArticleApi 区分：那个是「群发预览」，
 * 把已落库的图文推到某个人微信里看真实效果，两者不是一回事（后端同样用 previewSource 区分）。
 */
export async function previewWechatSourceApi(payload: {
  content_id: number;
  content_type: string;
  locale?: string;
}) {
  return requestClient.post<WechatApi.WechatPreview>(
    '/wechat-articles/preview-source',
    payload,
  );
}

/**
 * 确认样式后落库。
 *
 * 带编辑后的字段 = 按它落库（编辑器里改过的优先于源内容默认值）；
 * 不带 = 幂等取回已有记录。sync_draft=true 时落库后立即写入微信草稿箱。
 */
export async function commitWechatArticleApi(
  payload: WechatApi.WechatCommitPayload,
) {
  return requestClient.post<WechatApi.WechatArticle & { warnings: string[] }>(
    '/wechat-articles',
    payload,
  );
}

export async function getWechatArticleApi(id: number | string) {
  return requestClient.get<WechatApi.WechatArticle>(
    `/wechat-articles/${id}`,
  );
}

export async function putWechatArticleApi(
  id: number | string,
  payload: Partial<
    Pick<
      WechatApi.WechatArticle,
      | 'author'
      | 'content_html'
      | 'content_source_url'
      | 'cover_path'
      | 'digest'
      | 'title'
    >
  >,
) {
  return requestClient.put<WechatApi.WechatArticle>(
    `/wechat-articles/${id}`,
    payload,
  );
}

/** 用源内容重新生成正文（覆盖人工改动） */
export async function refreshWechatArticleApi(id: number | string) {
  return requestClient.post<WechatApi.WechatArticle>(
    `/wechat-articles/${id}/refresh`,
  );
}

/** 写入 / 更新微信草稿箱 */
export async function draftWechatArticleApi(id: number | string) {
  return requestClient.post<WechatApi.WechatArticle>(
    `/wechat-articles/${id}/draft`,
  );
}

/**
 * 群发预览：把图文以消息推到指定人的微信里看真实排版。
 * touser 与 towxname 二选一，都留空时后端回落到应用配置里的默认接收人。
 */
export async function previewWechatArticleApi(
  id: number | string,
  payload: { touser?: string; towxname?: string } = {},
) {
  return requestClient.post<WechatApi.WechatArticle>(
    `/wechat-articles/${id}/preview`,
    payload,
  );
}

/** 正式发布（权限 cms.wechat.publish） */
export async function publishWechatArticleApi(id: number | string) {
  return requestClient.post<WechatApi.WechatArticle>(
    `/wechat-articles/${id}/publish`,
  );
}

export async function getWechatSettingsApi() {
  return requestClient.get<WechatApi.WechatSettings>('/wechat/settings');
}

/** 保存公众号配置。secret 只写不回显（回包里只有 secret_configured）。 */
export async function putWechatSettingsApi(
  payload: WechatApi.WechatSettingsPayload,
) {
  return requestClient.put<WechatApi.WechatSettings>(
    '/wechat/settings',
    payload,
  );
}

// ===== 公众号独立运营管理 =====

/** 账号能力清单（前端据此决定是否展示某个运营 tab） */
export interface WechatCapability {
  key: string;
  label: string;
  operations: string[];
}

/** 连接测试 / 账号信息 / 自动回复 均为微信原始响应，前端按字段展示 */
export async function getWechatCapabilitiesApi() {
  return requestClient.get<{ configured: boolean; modules: WechatCapability[] }>(
    '/wechat/capabilities',
  );
}

export async function testWechatConnectionApi() {
  return requestClient.post<{ connected: boolean; checked_at: string }>(
    '/wechat/test-connection',
  );
}

export async function getWechatAccountApi() {
  return requestClient.get<Record<string, any>>('/wechat/account');
}

export async function getWechatAutoReplyApi() {
  return requestClient.get<Record<string, any>>('/wechat/auto-reply');
}

// 自定义菜单

export interface WechatMenuButton {
  name: string;
  type?: string;
  key?: string;
  url?: string;
  appid?: string;
  pagepath?: string;
  media_id?: string;
  article_id?: string;
  sub_button?: WechatMenuButton[];
}

export async function getWechatMenuApi() {
  return requestClient.get<Record<string, any>>('/wechat/menu');
}

export async function saveWechatMenuApi(button: WechatMenuButton[]) {
  return requestClient.put<{ button: WechatMenuButton[] }>('/wechat/menu', {
    button,
  });
}

export async function deleteWechatMenuApi() {
  return requestClient.delete('/wechat/menu');
}

// 永久素材

export interface WechatMaterialItem {
  media_id: string;
  name?: string;
  url?: string;
  update_time?: number;
  content?: { news_item: any[] };
  [key: string]: any;
}

export async function getWechatMaterialCountApi() {
  return requestClient.get<Record<string, number>>('/wechat/materials/count');
}

export async function getWechatMaterialsApi(params: {
  type: 'image' | 'video' | 'voice' | 'news';
  offset?: number;
  count?: number;
}) {
  return requestClient.get<{
    total_count: number;
    item_count: number;
    item: WechatMaterialItem[];
  }>('/wechat/materials', { params });
}

export async function deleteWechatMaterialApi(mediaId: string) {
  return requestClient.delete(
    `/wechat/materials/${encodeURIComponent(mediaId)}`,
  );
}

// 草稿箱

export interface WechatDraftItem {
  media_id: string;
  content?: { news_item: any[] };
  update_time?: number;
}

export async function getWechatDraftCountApi() {
  return requestClient.get<{ total_count: number }>('/wechat/drafts/count');
}

export async function getWechatDraftsApi(params: {
  offset?: number;
  count?: number;
  no_content?: boolean;
}) {
  return requestClient.get<{
    total_count: number;
    item_count: number;
    item: WechatDraftItem[];
  }>('/wechat/drafts', { params });
}

export async function deleteWechatDraftApi(mediaId: string) {
  return requestClient.delete(`/wechat/drafts/${encodeURIComponent(mediaId)}`);
}

// 已发布内容

export interface WechatPublishedItem {
  article_id: string;
  content?: { news_item: any[] };
  update_time?: number;
  publish_status?: number;
}

export async function getWechatPublishedApi(params: {
  offset?: number;
  count?: number;
  no_content?: boolean;
}) {
  return requestClient.get<{
    total_count: number;
    item_count: number;
    item: WechatPublishedItem[];
  }>('/wechat/published', { params });
}

export async function getWechatPublishedArticleApi(articleId: string) {
  return requestClient.get<Record<string, any>>(
    `/wechat/published/${encodeURIComponent(articleId)}`,
  );
}

export async function deleteWechatPublishedApi(
  articleId: string,
  index?: number,
) {
  return requestClient.delete(
    `/wechat/published/${encodeURIComponent(articleId)}`,
    index !== undefined ? { params: { index } } : undefined,
  );
}

// 粉丝用户

export interface WechatUserSummary {
  total: number;
  count: number;
  data: { openid: string[] };
  next_openid: string;
}

export async function getWechatUsersApi(params: { next_openid?: string }) {
  return requestClient.get<WechatUserSummary>('/wechat/users', { params });
}

export async function getWechatUserApi(openid: string, lang = 'zh_CN') {
  return requestClient.get<Record<string, any>>(
    `/wechat/users/${encodeURIComponent(openid)}`,
    { params: { lang } },
  );
}

// 用户标签

export interface WechatTag {
  id: number;
  name: string;
  count: number;
}

export async function getWechatTagsApi() {
  return requestClient.get<{ tags: WechatTag[] }>('/wechat/tags');
}

export async function createWechatTagApi(name: string) {
  return requestClient.post<{ tag: WechatTag }>('/wechat/tags', { name });
}

export async function updateWechatTagApi(tagId: number, name: string) {
  return requestClient.put<{ id: number; name: string }>(
    `/wechat/tags/${tagId}`,
    { name },
  );
}

export async function deleteWechatTagApi(tagId: number) {
  return requestClient.delete(`/wechat/tags/${tagId}`);
}

export async function tagWechatUsersApi(tagId: number, openids: string[]) {
  return requestClient.post<{ tag_id: number; affected: number }>(
    `/wechat/tags/${tagId}/users`,
    { openids },
  );
}

export async function untagWechatUsersApi(tagId: number, openids: string[]) {
  return requestClient.delete(`/wechat/tags/${tagId}/users`, {
    data: { openids },
  });
}
