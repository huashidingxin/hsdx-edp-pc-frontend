<script setup lang="ts">
import { computed } from 'vue';

import { VbenCountToAnimator } from '@vben/common-ui';

interface DataItem {
  total: number;
  today: number;
  yesterday: number;
  icon: string;
  title?: string;
  color?: string;
  unit?: string;
}

interface Props {
  data: Record<string, DataItem>;
}

const props = defineProps<Props>();


// 计算增长率和格式化数据
const computedData = computed(() => {
  return Object.entries(props.data).map(([key, item]) => {
    const growth = item.yesterday > 0
        ? ((item.today - item.yesterday) / item.yesterday * 100)
        : 0;

    const growthAbsolute = item.today - item.yesterday;

    return {
      key,
      ...item,
      growth,
      growthAbsolute,
      isPositive: growth >= 0,
      displayTotal: formatNumber(item.total),
      displayToday: formatNumber(item.today),
      displayGrowth: formatNumber(Math.abs(growthAbsolute))
    };
  });
});

// 格式化数字
function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + 'w';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

// 获取增长状态颜色
function getGrowthColor(isPositive: boolean): string {
  return isPositive ? 'success' : 'error';
}

// 获取增长图标
function getGrowthIcon(isPositive: boolean): string {
  return isPositive ? '$trendingUp' : '$trendingDown';
}

// 判断是否为HTTP URL
function isHttpUrl(icon: string): boolean {
  return icon.startsWith('http://') || icon.startsWith('https://');
}
</script>

<template>
  <v-row>
    <v-col
      v-for="item in computedData"
      :key="item.key"
      cols="12"
      sm="6"
      lg="3"
      xl="3"
    >
      <v-card
        class="h-100"
        hover
        flat
        rounded="lg"
      >
        <v-card-text class="pa-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <div class="text-h6">
              {{ item.title || item.key }}
            </div>

          </div>

          <div class="d-flex justify-space-between align-center mb-3">
            <div>
              <div class="text-h3 font-weight-bold mb-1 d-flex ">
                <VbenCountToAnimator
                    :end-val="item.today"
                    :start-val="0"
                    :duration="2000"
                    class="text-h4"
                />
                <span class="text-h5 text-medium-emphasis">
                  {{ item.unit }}
                </span>
                <div
                  class="text-caption ml-2"
                  :class="item.isPositive ? 'text-success' : 'text-error'"
                >
                  较昨日: {{ item.isPositive ? '+' : '' }}{{ item.displayGrowth }} {{ item.unit }}
                </div>
              </div>
            </div>
            <div>
              <v-icon
                v-if="!isHttpUrl(item.icon)"
                :icon="item.icon"
                :color="item.color || 'primary'"
                size="48"
              />
              <v-img
                v-else
                :src="item.icon"
                width="32"
                height="32"
                contain
              />
            </div>
          </div>

          <div class="d-flex justify-space-between align-center text-subtitle-2 mb-2">
            <span class="text-medium-emphasis">总{{ item.title || item.key }}</span>
            <div>
              <VbenCountToAnimator
                  :end-val="item.total"
                  :start-val="0"
                  :duration="2000"
              />
              {{ item.unit }}
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<style scoped>
</style>