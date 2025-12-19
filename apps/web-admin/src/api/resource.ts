import { requestClient } from './request';

const request = requestClient.request;
/**
 * Simple RESTful resource class
 */
class Resource {
  private readonly uri: string = '';
  private readonly options: object = {};
  constructor(uri: string, options: any = {}) {
    if (uri.indexOf('http') === 0) {
      this.uri = uri;
    } else {
      this.uri = uri[0] === '/' ? uri : `/${uri}`;
    }
    this.options = options;
  }
  destroy(id: string) {
    return request(`${this.uri}/${id}`, {
      method: 'delete',
    });
  }
  get(id: string, params = {}) {
    return request(`${this.uri}/${id}`, {
      ...this.options,
      method: 'get',
      params,
    });
  }
  list(query: object) {
    return request(`${this.uri}`, {
      ...this.options,
      method: 'get',
      params: query,
    });
  }
  store(resource: object) {
    return request(`${this.uri}`, {
      ...this.options,
      data: resource,
      method: 'post',
    });
  }
  update(id: string, resource: object) {
    return request(`${this.uri}/${id}`, {
      ...this.options,
      data: resource,
      method: 'put',
    });
  }
}

export { Resource as default };
