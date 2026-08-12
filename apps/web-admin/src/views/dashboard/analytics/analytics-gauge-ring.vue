<script setup lang="ts">
import type { PropType } from 'vue';
import { onMounted, ref, watch } from 'vue';
import { EchartsUI, type EchartsUIType, useEcharts } from '@vben/plugins/echarts';

// 手动注册 GaugeChart
import * as echarts from 'echarts/core';
import { GaugeChart } from 'echarts/charts';
echarts.use([GaugeChart]);

const chartRef = ref<EchartsUIType>();

// 使用 useEcharts 获取 render 方法
const { renderEcharts } = useEcharts(chartRef);

// 接收 props
const props = defineProps({
  value: {
    default: () => [],
    type: Array as PropType<Array<{ value: number; name: string; color?: string; title?: { offsetCenter?: [string, string] }; detail?: { offsetCenter?: [string, string]; valueAnimation?: boolean } }>>,
  },
  min: {
    default: 0,
    type: Number,
  },
  max: {
    default: 100,
    type: Number,
  },
  unit: {
    default: '',
    type: String,
  },
});

// 封装配置项为一个函数，便于重复调用
const getOption = () => {
  // 提取颜色配置
  const colors = props.value.some(item => item.color)
    ? props.value.map(item => item.color)
    : [];

  console.log('colors', colors);

  return {
    grid: {
      top: 10,
      right: 10,
      bottom: 10,
      left: 10,
      containLabel: true,
    },
    color:colors,
    series: [
      {
        type: 'gauge',
        startAngle: 90,
        endAngle: -270,
        center: ['50%', '50%'],
        radius: '85%',
        pointer: {
          show: false,
        },
        progress: {
          show: true,
          overlap: false,
          roundCap: true,
          clip: false,
          itemStyle: {
            borderWidth: 1,
            borderColor: '#464646',
          },
        },
        axisLine: {
          lineStyle: {
            width: 40
          },
        },
        splitLine: {
          show: false,
          distance: 0,
          length: 10,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          show: false,
          distance: 50,
        },
        data: props.value.map((item, index) => ({
          value: item.value,
          name: item.name,
          title: item.title || {
            offsetCenter: ['0%', `${-35 + index * 30}%`],
          },
          detail: item.detail || {
            offsetCenter: ['0%', `${-20 + index * 30}%`],
            valueAnimation: true,
          },
        })),
        title: {
          fontSize: 12,
        },
        detail: {
          width: 50,
          height: 10,
          fontSize: 10,
          color: 'inherit',
          borderColor: 'inherit',
          borderRadius: 20,
          borderWidth: 1,
          formatter: `{value}${props.unit}`,
          valueAnimation: true,
        },
      },
    ],
  };
};

// 初始化图表
onMounted(() => {
  renderEcharts(getOption());
});

// 当 props 发生变化时，重新渲染图表
watch(
  () => [props.value, props.min, props.max, props.unit],
  () => {
    renderEcharts(getOption());
  },
  { deep: true }
);
</script>

<template>
  <EchartsUI ref="chartRef" />
</template>
