/**
 * SSE (Server-Sent Events) 管理类
 * 用于管理服务器推送事件连接
 */
export class SSEClient {
  /**
   * @param {string} url - SSE 服务端点 URL
   * @param {Object} options - 配置选项
   * @param {number} [options.reconnectInterval=3000] - 重连间隔时间（毫秒）
   * @param {number} [options.maxReconnectAttempts=5] - 最大重连次数
   * @param {boolean} [options.autoReconnect=true] - 是否自动重连
   * @param {Object} [options.headers={}] - 自定义请求头
   * @param {boolean} [options.withCredentials=false] - 是否携带凭证
   */
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      autoReconnect: true,
      headers: {},
      withCredentials: false,
      ...options,
    };

    this.eventSource = null;
    this.reconnectAttempts = 0;
    this.isConnected = false;
    this.reconnectTimer = null;

    // 事件回调
    this.callbacks = {
      message: [],
      error: [],
      open: [],
      close: [],
    };

    // 自定义事件监听器
    this.customEventListeners = new Map();
  }

  /**
   * 建立 SSE 连接
   * @returns {SSEClient}
   */
  connect() {
    if (this.eventSource) {
      this.close();
    }

    const { headers, withCredentials } = this.options;

    // EventSource 不支持自定义 headers，如果需要 headers 则使用 fetch
    if (Object.keys(headers).length > 0) {
      this._connectWithFetch();
    } else {
      this._connectWithEventSource();
    }

    return this;
  }

  /**
   * 使用原生 EventSource 建立连接
   * @private
   */
  _connectWithEventSource() {
    const { withCredentials } = this.options;

    this.eventSource = new EventSource(this.url, {
      withCredentials,
    });

    this._setupEventListeners();
  }

  /**
   * 使用 fetch API 建立连接（支持自定义 headers）
   * @private
   */
  async _connectWithFetch() {
    const { headers, withCredentials } = this.options;

    try {
      const response = await fetch(this.url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...headers,
        },
        credentials: withCredentials ? 'include' : 'same-origin',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      this.isConnected = true;
      this._trigger('open', { type: 'open' });

      while (this.isConnected) {
        const { done, value } = await reader.read();

        if (done) {
          this.isConnected = false;
          this._trigger('close', { type: 'close' });
          this._handleDisconnect();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          this._parseSSELine(line);
        }
      }
    } catch (error) {
      this._trigger('error', { type: 'error', error });
      this._handleDisconnect();
    }
  }

  /**
   * 解析 SSE 数据行
   * @private
   */
  _parseSSELine(line) {
    if (line.startsWith('data:')) {
      const data = line.slice(5).trim();
      try {
        const parsed = JSON.parse(data);
        this._trigger('message', { type: 'message', data: parsed });
      } catch {
        this._trigger('message', { type: 'message', data });
      }
    } else if (line.startsWith('event:')) {
      const eventName = line.slice(6).trim();
      // 下一个 data 行将触发自定义事件
      this._pendingEvent = eventName;
    }
  }

  /**
   * 设置 EventSource 事件监听器
   * @private
   */
  _setupEventListeners() {
    this.eventSource.onopen = (event) => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this._trigger('open', event);
    };

    this.eventSource.onmessage = (event) => {
      let data = event.data;
      try {
        data = JSON.parse(data);
      } catch {
        // 保持原始数据
      }
      this._trigger('message', { ...event, data });
    };

    this.eventSource.onerror = (event) => {
      this._trigger('error', event);
      this._handleDisconnect();
    };

    // 监听自定义事件
    this.customEventListeners.forEach((callbacks, eventName) => {
      this.eventSource.addEventListener(eventName, (event) => {
        let data = event.data;
        try {
          data = JSON.parse(data);
        } catch {
          // 保持原始数据
        }
        callbacks.forEach((cb) => cb({ ...event, data }));
      });
    });
  }

  /**
   * 处理断开连接
   * @private
   */
  _handleDisconnect() {
    this.isConnected = false;

    if (
      this.options.autoReconnect &&
      this.reconnectAttempts < this.options.maxReconnectAttempts
    ) {
      this.reconnectAttempts++;
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, this.options.reconnectInterval);
    } else if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this._trigger('error', {
        type: 'error',
        error: new Error('Max reconnect attempts reached'),
      });
    }
  }

  /**
   * 触发事件回调
   * @private
   */
  _trigger(event, data) {
    const callbacks = this.callbacks[event];
    if (callbacks) {
      callbacks.forEach((cb) => cb(data));
    }
  }

  /**
   * 监听消息事件
   * @param {Function} callback - 回调函数
   * @returns {SSEClient}
   */
  onMessage(callback) {
    this.callbacks.message.push(callback);
    return this;
  }

  /**
   * 监听错误事件
   * @param {Function} callback - 回调函数
   * @returns {SSEClient}
   */
  onError(callback) {
    this.callbacks.error.push(callback);
    return this;
  }

  /**
   * 监听连接打开事件
   * @param {Function} callback - 回调函数
   * @returns {SSEClient}
   */
  onOpen(callback) {
    this.callbacks.open.push(callback);
    return this;
  }

  /**
   * 监听连接关闭事件
   * @param {Function} callback - 回调函数
   * @returns {SSEClient}
   */
  onClose(callback) {
    this.callbacks.close.push(callback);
    return this;
  }

  /**
   * 监听自定义事件
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {SSEClient}
   */
  on(eventName, callback) {
    if (!this.customEventListeners.has(eventName)) {
      this.customEventListeners.set(eventName, []);
    }
    this.customEventListeners.get(eventName).push(callback);

    // 如果已连接，添加事件监听
    if (this.eventSource) {
      this.eventSource.addEventListener(eventName, (event) => {
        let data = event.data;
        try {
          data = JSON.parse(data);
        } catch {
          // 保持原始数据
        }
        callback({ ...event, data });
      });
    }

    return this;
  }

  /**
   * 移除事件监听
   * @param {string} event - 事件名称
   * @param {Function} [callback] - 回调函数（不传则移除所有）
   * @returns {SSEClient}
   */
  off(event, callback) {
    if (callback) {
      const callbacks = this.callbacks[event];
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
      const customCallbacks = this.customEventListeners.get(event);
      if (customCallbacks) {
        const index = customCallbacks.indexOf(callback);
        if (index > -1) {
          customCallbacks.splice(index, 1);
        }
      }
    } else {
      this.callbacks[event] = [];
      this.customEventListeners.delete(event);
    }
    return this;
  }

  /**
   * 关闭 SSE 连接
   */
  close() {
    this.isConnected = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.reconnectAttempts = 0;
    this._trigger('close', { type: 'close' });
  }

  /**
   * 获取当前连接状态
   * @returns {number} - CONNECTING(0) | OPEN(1) | CLOSED(2)
   */
  get readyState() {
    return this.eventSource ? this.eventSource.readyState : EventSource.CLOSED;
  }
}

/**
 * 创建 SSE 客户端实例
 * @param {string} url - SSE 服务端点 URL
 * @param {Object} options - 配置选项
 * @returns {SSEClient}
 */
export function createSSE(url, options = {}) {
  return new SSEClient(url, options);
}

export default SSEClient;
