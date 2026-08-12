import { baseRequestClient, requestClient } from '#/api/request';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    password: string;
    username: string;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
    token: string;
    // desc: string;
    // realName: string;
    // refreshToken: string;
    // userId: string;
    // username: string;
    expires_in: number;
    data: object;
  }

  export interface RefreshTokenResult {
    data: string;
    status: number;
  }
}

/**
 * 登录
 */
export async function loginApi(params: AuthApi.LoginParams) {
  const ret: any = await requestClient.post<AuthApi.LoginResult>(
    '/auth/login',
    params,
  );
  return {
    accessToken: ret.data?.token,
    refreshToken: '',
    ...ret.data,
  };
}
/**
 * 刷新accessToken
 */
export async function refreshTokenApi() {
  return baseRequestClient.post<AuthApi.RefreshTokenResult>('/auth/refresh', {
    withCredentials: true,
  });
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
  const {data} = await requestClient.get<string[]>('/auth/permissions');
  return data;
}
