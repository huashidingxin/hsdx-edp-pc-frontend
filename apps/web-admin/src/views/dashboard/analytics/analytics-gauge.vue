<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
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
    default: 0,
    type: Number,
  },
  min: {
    default: 0,
    type: Number,
  },
  max: {
    default: 100,
    type: Number,
  },
  title: {
    default: '',
    type: String,
  },
  unit: {
    default: '',
    type: String,
  },
  color: {
    default: '#019680',
    type: String,
  },
  axisConfig: {
    default: () => [],
    type: Array as () => Array<{ max: number; label: string; color: string }>,
  },
});

// 计算轴线和标签配置
const computedAxisConfig = computed(() => {
  if (props.axisConfig.length === 0) {
    return {
      axisLineColors: [],
      axisLabels: [],
    };
  }

  const range = props.max - props.min;
  const axisLineColors = props.axisConfig.map((item) => [
    (item.max - props.min) / range,
    item.color,
  ]);

  // 计算每个区间的中点位置作为标签位置
  let prevMax = props.min;
  const axisLabels = props.axisConfig.map((item) => {
    const midPoint = (prevMax + item.max) / 2;
    prevMax = item.max;
    return {
      value: (midPoint - props.min) / range,
      label: item.label,
    };
  });

  return {
    axisLineColors,
    axisLabels,
  };
});

// 封装配置项为一个函数，便于重复调用
const getOption = () => {
  return {
    grid: {
      top: 10,
      right: 10,
      bottom: 10,
      left: 10,
      containLabel: true,
    },
    series: [
      {
        type: 'gauge',
        min: props.min,
        max: props.max,
        startAngle: 180,
        endAngle: 0,
        center: ['50%', '70%'],
        radius: '85%',
        splitNumber: 8,
        pointer: {
          icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
          length: '12%',
          width: 20,
          offsetCenter: [0, '-60%'],
          itemStyle: {
            color: 'auto',
          },
        },
        axisLine: {
          lineStyle: {
            width: 6,
            color: computedAxisConfig.value.axisLineColors.length > 0
              ? computedAxisConfig.value.axisLineColors
              : [
                  [0.25, '#FF6E76'],
                  [0.5, '#FDDD60'],
                  [0.75, '#58D9F9'],
                  [1, '#7CFFB2']
                ],
          },
        },
        axisTick: {
          length: 12,
          lineStyle: {
            color: 'auto',
            width: 2,
          },
        },
        splitLine: {
          length: 20,
          lineStyle: {
            color: 'auto',
            width: 5,
          },
        },
        axisLabel: {
          color: '#464646',
          fontSize: 14,
          distance: -60,
          rotate: 'tangential',
          formatter: (value: number) => {
            if (computedAxisConfig.value.axisLabels.length > 0) {
              const label = computedAxisConfig.value.axisLabels.find(item => {
                // 使用浮点数近似比较
                return Math.abs(item.value - value/100) < 0.001;
              });
              return label ? label.label : '';
            }
            return '';
          },
        },
        title: {
          offsetCenter: [0, '-10%'],
          fontSize: 20,
        },
        detail: {
          fontSize: 20,
          offsetCenter: [0, '-35%'],
          valueAnimation: true,
          formatter: (value: number) => {
            return Math.round(value) + props.unit;
          },
          color: 'inherit',
        },
        data: [
          {
            value: props.value,
            name: props.title,
          },
        ],
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
  () => [props.value, props.min, props.max, props.title, props.unit, props.color, props.axisConfig],
  () => {
    renderEcharts(getOption());
  },
  { deep: true }
);
</script>

<template>
  <EchartsUI ref="chartRef" />
</template>
