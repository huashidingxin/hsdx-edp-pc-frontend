<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import { ref } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  name: {
    type: String,
    default: '',
  },
});
const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);
const legendData = ref([]);

const seriesData = ref([]);
const indicator = ref([]);

watch(
  () => props.items,
  (newItems) => {
    if (newItems) {
      const _legendData = [];
      const _seriesData = [];
      indicator.value = newItems[0].map((e) => {
        return { name: e.name,max:1000 };
      });
      newItems.forEach((item) => {
        let names = [];
        let values = []
        item.forEach((e)=>{
          names.push(e.name)
          values.push(e.value)
        })
        _legendData.push(names);
        _seriesData.push({ name: names, value:values });
      });

      legendData.value = _legendData;
      seriesData.value = _seriesData;

      render();
    }
  },
);
function render() {
  renderEcharts({
    legend: {
      bottom: 0,
      data: legendData.value,
    },
    radar: {
      indicator: indicator.value,
      radius: '60%',
      splitNumber: 8,
    },
    series: [
      {
        areaStyle: {
          opacity: 1,
          shadowBlur: 0,
          shadowColor: 'rgba(0,0,0,.2)',
          shadowOffsetX: 0,
          shadowOffsetY: 10,
        },
        data: seriesData.value,
        itemStyle: {
          // borderColor: '#fff',
          borderRadius: 10,
          borderWidth: 2,
        },
        symbolSize: 0,
        type: 'radar',
        name:props.name
      },
    ],
    tooltip: {},
  });
}
</script>

<template>
  <EchartsUI ref="chartRef" />
</template>
