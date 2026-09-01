import type { RequestClientConfig } from '@vben/request';

import { requestClient } from './request';

const request = requestClient.request;

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
      // 后端所有 CRUD 更新路由均为 PATCH（见 routes/api_v1.php），PUT 会 405
      method: 'patch',
      ...this.options,
    });
  }
}

export { Resource as default };
