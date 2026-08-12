<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import { ref } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

const props = defineProps({
  name: {
    type: String,
    default: '',
  },
  items: {
    type: Array,
    default: () => [],
  },
});
const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);
const colors = ref([])
watch(
  () => props.items,
  (newItems) => {
    if (newItems) {
      let _colors = []
      newItems.forEach((e)=>{
        _colors.push(e.color)
      })
      colors.value = _colors
      console.log('_colors',_colors)
      render();
    }
  },
);



function render() {
  renderEcharts({
    legend: {
      bottom: '2%',
      left: 'center',
    },
    series: [
      {
        animationDelay() {
          return Math.random() * 100;
        },
        animationEasing: 'exponentialInOut',
        animationType: 'scale',
        avoidLabelOverlap: false,
        color: colors.value,
        data: props.items,
        emphasis: {
          label: {
            fontSize: '12',
            fontWeight: 'bold',
            show: true,
          },
        },
        itemStyle: {
          // borderColor: '#fff',
          borderRadius: 10,
          borderWidth: 2,
        },
        label: {
          position: 'center',
          show: false,
        },
        labelLine: {
          show: false,
        },
        radius: ['40%', '65%'],
        type: 'pie',
        name:props.name
      },
    ],
    tooltip: {
      trigger: 'item',
    },
  });
}
</script>

<template>
  <EchartsUI ref="chartRef" />
</template>
