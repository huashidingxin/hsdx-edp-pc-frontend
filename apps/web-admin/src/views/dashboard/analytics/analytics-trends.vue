<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue';
import { EchartsUI, type EchartsUIType, useEcharts } from '@vben/plugins/echarts';

const chartRef = ref<EchartsUIType>();

// 使用 useEcharts 获取 render 方法
const { renderEcharts } = useEcharts(chartRef);

// 接收 props
const props = defineProps({
  items: {
    default: () => [],
    type: Array as () => Array<{ name: string; data: number[]; color: string }>,
  },
  xAxisData: {
    default: () => [],
    type: Array as () => string[],
  },
});

// 动态计算 series
const series = computed(() => {
  return props.items.map(item => ({
    name: item.name,
    areaStyle: {},
    data: item.data,
    itemStyle: {
      color: item.color,
    },
    smooth: true,
    type: 'line',
  }));
});

// 封装配置项为一个函数，便于重复调用
const getOption = () => {
  return {
    grid: {
      bottom: '20%',
      containLabel: true,
      left: '1%',
      right: '1%',
      top: '2%',
    },
    legend: {
      orient: 'horizontal',
      bottom: 0,
      //data: props.items.map(i => i.name), // 确保图例与 series 名称一致
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        lineStyle: {
          color: '#019680',
          width: 1,
        },
      },
    },
    xAxis: {
      axisTick: { show: false },
      boundaryGap: false,
      data: props.xAxisData,
      splitLine: {
        lineStyle: { type: 'solid', width: 1 },
        show: true,
      },
      type: 'category',
    },
    yAxis: [
      {
        axisTick: { show: false },
        splitArea: { show: true },
        splitNumber: 4,
        type: 'value',
      },
    ],
    series: series.value,
  };
};

// 初始化图表
onMounted(() => {
  renderEcharts(getOption());
});

// 当 props.items 或 props.xAxisData 发生变化时，重新渲染图表
watch(
  () => [props.items, props.xAxisData],
  () => {
    renderEcharts(getOption());
  },
  { deep: true }
);
</script>

<template>
  <EchartsUI ref="chartRef" />
</template>
