import type { RequestClientConfig } from '@vben/request';

import { requestClient } from './request';

/**
 * 不能在模块顶层解构 `requestClient.request`：
 * 本文件经由 #/store(current-app.ts) 与 ./request 形成循环导入，
 * 生产打包后本模块可能先于 request.ts 求值，届时 requestClient 仍是 undefined，
 * 顶层解构会抛 "Cannot read properties of undefined (reading 'request')"。
 * 这里改为调用时才解引用。
 */
const request = (...args: Parameters<typeof requestClient.request>) =>
  requestClient.request(...args);

/**
 * Simple RESTful resource class
 */
class Resource {
  private readonly options: RequestClientConfig;
  private readonly uri: string = '';
  constructor(uri: string, options: RequestClientConfig = {}) {
    if (uri.indexOf('http') === 0) {
      this.uri = uri;
    } else {
      this.uri = uri[0] === '/' ? uri : `/${uri}`;
    }
    this.options = { ...options, responseReturn: 'body' };
  }
  destroy(id: string): Promise<any> {
    return request(`${this.uri}/${id}`, {
      method: 'delete',
      ...this.options,
    });
  }
  get(id: string, params: object = {}): Promise<any> {
    return request(`${this.uri}/${id}`, {
      method: 'get',
      params,
      ...this.options,
    });
  }
  list(query: object = {}): Promise<any> {
    return request(`${this.uri}`, {
      method: 'get',
      params: query,
      ...this.options,
    });
  }
  store(resource: object): Promise<any> {
    return request(`${this.uri}`, {
      data: resource,
      method: 'post',
      ...this.options,
    });
  }
  update(id: string, resource: object): Promise<any> {
    return request(`${this.uri}/${id}`, {
      data: resource,
      method: 'put',
      ...this.options,
    });
  }
}

export { Resource as default };
