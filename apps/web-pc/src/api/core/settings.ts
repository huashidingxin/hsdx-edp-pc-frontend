import { requestClient } from '#/api/request';

export namespace SettingsApi {
  export interface SettingItem {
    default?: unknown;
    disabled: boolean;
    key: string;
    label: string;
    locales?: null | Record<string, unknown>;
    options?: null | Array<{ label: string; value: unknown }>;
    span: number;
    type:
      | 'image'
      | 'json'
      | 'number'
      | 'select'
      | 'switch'
      | 'text'
      | 'textarea'
      | 'url';
    value?: unknown;
  }

  export interface SettingGroup {
    group_key: string;
    icon: null | string;
    items: SettingItem[];
    sort: number;
    title: string;
  }

  export interface SettingsPayload {
    settings: Record<string, Record<string, unknown>>;
    locale?: string;
  }
}

/**
 * 当前应用设置（值 + 元信息）
 */
export async function getSettingsApi(
  query: { group?: string; locale?: string; with_locales?: boolean } = {},
) {
  return requestClient.get<{
    application_id: number;
    groups: SettingsApi.SettingGroup[];
    locale: string;
  }>('/settings', { params: query });
}

/**
 * 设置项目录（无值，供动态渲染表单）
 */
export async function getSettingsCatalogApi(group?: string) {
  return requestClient.get<{ groups: SettingsApi.SettingGroup[] }>(
    '/settings/catalog',
    { params: group ? { group } : {} },
  );
}

/**
 * 批量保存设置（只更新出现的叶子，未触碰的语言不受影响）
 */
export async function putSettingsApi(payload: SettingsApi.SettingsPayload) {
  return requestClient.put<{
    application_id: number;
    groups: SettingsApi.SettingGroup[];
    locale: string;
  }>('/settings', payload);
}

/**
 * 删除设置（重置默认）
 */
export async function deleteSettingsApi(query: {
  group: string;
  key?: string;
  locale?: string;
}) {
  return requestClient.delete('/settings', { params: query });
}
