<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import { ref } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import * as echarts from 'echarts/core';
import { PolarComponent, LegendComponent } from 'echarts/components';
import { BarChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([PolarComponent, LegendComponent, BarChart, CanvasRenderer]);
const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  name: {
    type: String,
    default: '',
  },
  group:{
    type:Array,
    default:()=>([])
  }
});
const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);
const legendData = ref([]);

const seriesData = ref([]);
const indicator = ref([]);
const axis = ref([])
watch(
  () => props.items,
  (newItems) => {
    console.log('@#',newItems)
    if (newItems) {
      const _legendData = [];
      const _seriesData = [];

      axis.value = newItems.map((e)=>{
        return e.name
      })
      props.group.forEach((e)=>{
        _legendData.push(e.name)
        _seriesData.push({
          type: 'bar',
          data: newItems.map((v)=>{
            return v['risk_level_'+e.id]
          }),
          coordinateSystem: 'polar',
          name: e.name,
          stack: e.name,
          emphasis: {
            focus: 'series'
          }
        })
      })

      legendData.value = _legendData;
      seriesData.value = _seriesData;

      render();
    }
  },
);
function render() {
  renderEcharts({
      angleAxis: {
        type: 'category',
        data: axis.value
      },
      radiusAxis: {},
      polar: {},
      series: seriesData.value,

      legend: {
        orient: 'horizontal',
        show: true,
        bottom:0,
        data: legendData.value
      }

  });
}
</script>

<template>
  <EchartsUI ref="chartRef" height="400px" />
</template>
