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
