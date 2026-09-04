import {
  ref,
  reactive
} from 'vue'
import { defineStore } from 'pinia';
import {
  Centrifuge,
  UnauthorizedError
} from 'centrifuge'
import { resetAllStores, useAccessStore, useUserStore } from '@vben/stores';
import bus from '#/utils/bus.js'


const wsEndpoint = ref(`wss://hyb2.2760316.cn/connection/websocket`);
const shouldUseCustomWS = typeof WebSocket === 'undefined'

// ===== 消息处理器注册表 =====
const messageHandlers = reactive({})

// ===== 注册处理器的工具函数 =====
export function registerMessageHandler(type, handler) {
  if (!messageHandlers[type]) messageHandlers[type] = new Set()
  messageHandlers[type].add(handler)
}

// ===== 全局消息分发器 =====
function dispatchMessage(ctx) {
  try {
    const msg = typeof ctx === 'string' ? JSON.parse(ctx) : ctx

    if (!msg.data?.type) {
      console.debug('消息格式不正确，缺少 data.type:', msg)
      return
    }

    // emit 消息，业务代码自己决定是否监听
    bus.emit(msg.data.type, msg)
  } catch (err) {
    console.error('分发消息失败:', ctx, err)
  }
}


export const useSocketStore = defineStore('socket', () => {
  const isConnected = ref(false)
  let centrifugeInstance = null
  const callbacks = reactive({}) // { channel: [fn1, fn2] }

  // 通用 connect 方法
  const connect = (options) => {
    if (!options) {
      options = {}
    }
    if (centrifugeInstance) centrifugeInstance.disconnect()

    // if (shouldUseCustomWS) options.websocket = UniWebSocket

    // 在函数内部获取 store 实例，避免在模块加载时就调用
    const accessStore = useAccessStore()
    options.headers = {
      'Authorization': 'Bearer '+accessStore.accessToken,
      'X-Did': '1',
      'X-Client-Type': 'clinic'
    }

    centrifugeInstance = new Centrifuge(wsEndpoint.value, {
      ...options
    })

    centrifugeInstance.on('connecting', function(ctx) {
      console.log(`connecting: ${ctx.code}, ${ctx.reason}`);
    }).on('connected', function(ctx) {
      isConnected.value = true
      console.log(`connected over ${ctx.transport}`);
    }).on('disconnected', function(ctx) {
      isConnected.value = false
      console.log(`disconnected: ${ctx.code}, ${ctx.reason}`);
    }).on('publication', (ctx) => {
      dispatchMessage(ctx)
    }).connect();
  }

  const subscribe = (channel, options = {}) => {
    if (centrifugeInstance) {
      const sub = centrifugeInstance.newSubscription(channel, options)
      sub.on('publication', (ctx) => {
        dispatchMessage(ctx)
      }).subscribe()
    }
  }

  const getConnectionToken = async (ctx) => {
    if (!isConnected.value) {
      return "";
    }
    try {} catch (e) {
      //throw new UnauthorizedError();
      throw new Error(`Unexpected status code ${res.status}`);
      console.log(e)
    }
    const api = new uni.Resource('token/connection')
    const {
      data
    } = await api.store()
    return data.token;
  }


  const disconnect = () => {
    centrifugeInstance?.disconnect()
    centrifugeInstance = null
    isConnected.value = false
  }

  function $reset() {
    isConnected.value = false
  }

  return {
    $reset,
    isConnected,
    connect,
    disconnect,
    subscribe,
    // publish: ..., // 如需发送消息
  }
})
