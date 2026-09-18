import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * WebSocket Store 存根（预留实时推送通道）。
 * 避免未安装 centrifuge 依赖导致生产构建失败。
 */
export const useSocketStore = defineStore('socket', () => {
  const isConnected = ref(false);

  const connect = () => {
    // 预留 WebSocket 连接
  };

  const disconnect = () => {
    isConnected.value = false;
  };

  const subscribe = () => {};

  function $reset() {
    isConnected.value = false;
  }

  return {
    $reset,
    isConnected,
    connect,
    disconnect,
    subscribe,
  };
});
