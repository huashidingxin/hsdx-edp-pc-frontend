import { requestClient } from './request';

const request = requestClient.request;
/**
 * Simple RESTful resource class
 */
class Resource {
  private readonly uri: string = '';
  constructor(uri: string,options={}) {
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
      ...this.options
    });
  }
  get(id: string, params = {}) {
    return request(`${this.uri}/${id}`, {
      method: 'get',
      params,
      ...this.options
    });
  }
  list(query: object) {
    return request(`${this.uri}`, {
      method: 'get',
      params: query,
      ...this.options
    });
  }
  store(resource: object) {
    return request(`${this.uri}`, {
      data: resource,
      method: 'post',
      ...this.options
    });
  }
  update(id: string, resource: object) {
    return request(`${this.uri}/${id}`, {
      data: resource,
      method: 'put',
      ...this.options
    });
  }
}

export { Resource as default };
