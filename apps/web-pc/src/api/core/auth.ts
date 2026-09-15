import { baseRequestClient, requestClient } from '#/api/request';

export namespace AuthApi {
  /** 登录接口参数：account（用户名/邮箱/手机号）或兼容字段 username/email */
  export interface LoginParams {
    account?: string;
    email?: string;
    password?: string;
    tenant_slug?: string;
    username?: string;
  }

  /** 登录接口返回值（扁平 payload，见 docs/saas-admin-basic-api-design.md §4.1） */
  export interface LoginResult {
    avatar: string;
    expires_at: null | string;
    homePath: string;
    id: number;
    mobile_verified_at: null | string;
    ouid: null | string;
    realName: string;
    roles: string[];
    tenant: null | {
      default_locale: string;
      id: number;
      name: string;
      plan_code: null | string;
      slug: string;
      status: number;
    };
    tenant_id: number;
    token: string;
    token_type: string;
    userId: string;
    username: string;
  }
}

/**
 * 登录
 */
export async function loginApi(params: AuthApi.LoginParams) {
  const data = await requestClient.post<AuthApi.LoginResult>(
    '/auth/login',
    params,
  );
  return {
    ...data,
    accessToken: data.token,
    refreshToken: '',
  };
}

/**
 * 刷新accessToken（轮换当前 token）
 */
export async function refreshTokenApi(): Promise<string> {
  // baseRequestClient 默认 responseReturn: 'raw'，取响应体的 data.token
  const res = await baseRequestClient.post('/auth/refresh');
  return res?.data?.data?.token ?? '';
}

/**
 * 退出登录
 */
export async function logoutApi() {
  return requestClient.post('/auth/logout', {
    withCredentials: true,
  });
}

/**
 * 获取用户权限码
 */
export async function getAccessCodesApi() {
  return requestClient.get<string[]>('/auth/codes');
}

/**
 * 修改密码
 */
export async function changePasswordApi(data: { old_password: string; new_password: string; confirm_password: string }) {
  return requestClient.post('/auth/password', data);
}

/**
 * 修改本人资料
 */
export async function updateProfileApi(data: {
  avatar?: null | string;
  mobile?: null | string;
  name?: string;
  username?: null | string;
}) {
  return requestClient.put('/auth/profile', data);
}
