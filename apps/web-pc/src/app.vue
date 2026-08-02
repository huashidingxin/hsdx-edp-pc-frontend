<script lang="ts" setup>
import { computed, onMounted, watch } from 'vue';

import { useAntdDesignTokens } from '@vben/hooks';
import { preferences, usePreferences } from '@vben/preferences';

import { App, ConfigProvider, theme } from 'antdv-next';

import { antdLocale } from '#/locales';

defineOptions({ name: 'App' });

const { isDark } = usePreferences();
const { tokens } = useAntdDesignTokens();

const tokenTheme = computed(() => {
  const algorithm = isDark.value
    ? [theme.darkAlgorithm]
    : [theme.defaultAlgorithm];

  // antd 紧凑模式算法
  if (preferences.app.compact) {
    algorithm.push(theme.compactAlgorithm);
  }

  return {
    algorithm,
    token: {
      ...tokens
    },
  };
});

const globalComponentConfig = {
  input: {
    autoComplete: 'off',
  },
};

import { useAccessStore } from '@vben/stores';
import { useSocketStore } from '#/store/socket';
import { useAppStore } from '#/store/app';


const accessStore = useAccessStore();
const socketStore = useSocketStore();
const appStore = useAppStore();

watch(()=>accessStore.isAccessChecked,(isAccessChecked)=>{
  if(isAccessChecked){
    socketStore.connect()
  }
},{immediate:true,deep:true})



// 直接同步初始化，不依赖异步 API 阻塞显示
onMounted(() => {
  appStore.loadSetting()
});

</script>

<template>
  <ConfigProvider
    :locale="antdLocale"
    :theme="tokenTheme"
    component-size="large"
    v-bind="globalComponentConfig"
  >
    <App>
      <RouterView />
    </App>
  </ConfigProvider>
</template>
