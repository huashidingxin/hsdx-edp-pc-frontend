<script lang="ts" setup>
import { onMounted, ref, watch, computed } from 'vue';
import { EchartsUI, type EchartsUIType, useEcharts } from '@vben/plugins/echarts';

// 确保已经安装并导入 echarts-liquidfill
import 'echarts-liquidfill';

const chartRef = ref<EchartsUIType>();

// 使用 useEcharts 获取 render 方法
const { renderEcharts } = useEcharts(chartRef);

// 接收 props
const props = defineProps({
  rate:{
    type:[String,Number],
    default:0
  }
});

// 封装配置项为一个函数，便于重复调用
const getOption = () => {
  return {
    series: [{
      type: 'liquidFill',
      data: [props.rate,props.rate,props.rate],
      color: ['#1976D2'],
      backgroundStyle: {
        borderWidth: 1,
        color: '#E3F2FD'
      },
      itemStyle: {
        opacity: 0.6
      },
      emphasis: {
        itemStyle: {
          opacity: 0.9
        }
      }
    }]
  };
};

// 初始化图表
onMounted(() => {
  renderEcharts(getOption());
});

// 当 props.items 发生变化时，重新渲染图表
watch(
  () => [props.rate],
  () => {
    renderEcharts(getOption());
  },
  { deep: true }
);
</script>

<template>
  <EchartsUI ref="chartRef" style="width: 400px; height: 400px;" />
</template>
