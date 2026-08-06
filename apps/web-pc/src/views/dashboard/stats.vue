<script setup>
/**
 * 数据统计已合并至数据概览（analytics/index.vue）
 * 此页面保留空壳，通过 router.replace 自动跳转，避免后端菜单点击白屏
 */
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
onMounted(() => {
  router.replace('/analytics');
});
</script>

<template>
  <div class="flex h-full items-center justify-center">
    <span class="text-sm text-gray-400">正在跳转至数据概览…</span>
  </div>
</template>
