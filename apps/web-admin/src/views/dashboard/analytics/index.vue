<script lang="ts" setup>
import type {TabOption} from '@vben/types';

import {
  AnalysisChartCard,
  AnalysisChartsTabs,
  AnalysisOverview,
} from '@vben/common-ui';

import AnalyticsTrends from './analytics-trends.vue';
import AnalyticsVisitsData from './analytics-visits-data.vue';
import AnalyticsVisitsSales from './analytics-visits-sales.vue';
import AnalyticsVisitsSource from './analytics-visits-source.vue';
import AnalyticsVisits from './analytics-visits.vue';
import AnalyticsOverview from './analytics-overview.vue';
import AnalyticsGauge from './analytics-gauge.vue';
import AnalyticsGaugeRing from './analytics-gauge-ring.vue';

import Resource from "#/api/resource";
import {useAppStore} from '@/store'

const overviewItems = ref([])
const overviewData = ref({})

const appStore = useAppStore()

const chartTabs: TabOption[] = [
  {
    label: '流量趋势',
    value: 'trends',
  },
  {
    label: '月访问量',
    value: 'visits',
  },
];

// 模拟数据 - 实际项目中从API获取，完全兼容任意字段
const mockOverviewData = {
  user: {
    total: 12850,
    today: 234,
    yesterday: 189,
    icon: '$accountMultiple',
    title: '用户总数',
    unit: '人',
    color: 'primary'
  },
  order: {
    total: 5678,
    today: 156,
    yesterday: 142,
    icon: '$cartOutline',
    title: '订单总数',
    unit: '单',
    color: 'success'
  },
  revenue: {
    total: 125680,
    today: 3450,
    yesterday: 2980,
    icon: '$currencyUsd',
    title: '营收总额',
    unit: '元',
    color: 'warning'
  },
  product: {
    total: 890,
    today: 45,
    yesterday: 38,
    icon: '$packageVariant',
    title: '商品数量',
    unit: '个',
    color: 'info'
  },
  visitor: {
    total: 45678,
    today: 1234,
    yesterday: 1098,
    icon: '$eye',
    title: '访问量',
    unit: '次',
    color: 'secondary'
  }
}
const trendsType = ref(null);
async function getOverviewData() {
  const api = new Resource('stats/overviews')
  const {data} = await api.list({
    project_id: appStore.defaultProject?.id
  })
  overviewData.value = data
}

const rates= ref([]);
async function getRates() {
  const api = new Resource('stats/rates')
  const {data} = await api.list({
    project_id: appStore.defaultProject?.id
  })
  rates.value = data
}

const trends = ref({});
const timeRanges = [
  {title: "近一周", value: "week"},
  {title: "近一月", value: "month"},
  {title: "近一年", value: "year"}
];

const orderRange = ref("month");

function timeRangeChange(type, rangeItem) {
  if (rangeItem.value !== "custom") {
    customRange.value = [];
    getTrends();
  }

}

const customRange = ref([]);
const datetimeField = {
  field: "range",
  name: "",
  type: "datetime",
  attrs: {
    range: true,
    onlyDate: true
  }
};

async function getTrends() {
  try {
    const api = new Resource("stats/trends");
    const {data} = await api.list({
      range: orderRange.value != "custom" ? orderRange.value : {
        start: customRange.value[0],
        end: customRange.value[1]
      },
      project_id: appStore.defaultProject?.id,
      type:trendsType.value?.key
    });
    trends.value = {
      ...data,
      values: Object.values(data.values)
    };
  } catch (e) {
    console.log(e);
  }
}

function customRangeChange(e) {
  if (e?.length == 2) {
    getTrends();
  }

}

function trendsChange(e) {
  trendsType.value = e;
  getTrends();
}

watch(()=>appStore.defaultProject,()=>{
  getOverviewData()
  getTrends()
  getRates()
},{immediate:true})

onBeforeMount(() => {

})
</script>

<template>
  <div class="p-5">
    <!-- 新的基于Vuetify的Overview组件 -->
    <AnalyticsOverview
      :data="overviewData"
      class="mb-3"
      @change="trendsChange"
    />

    <div class="card-box w-full px-4 pb-5 pt-3 mt-4">
      <div class="mb-5 d-flex justify-space-between align-center">
        <div class="text-h6">{{trendsType?.title || '监理日志'}}</div>
        <div>
          <v-btn-toggle v-model="orderRange" mandatory color="primary" density="compact">
            <v-btn v-for="(item,index) in timeRanges" :key="index" :value="item.value"
                   @click="timeRangeChange('patrol',item)">
              {{ item.title }}
            </v-btn>
            <v-btn value="custom">自定义时间</v-btn>
          </v-btn-toggle>

          <div v-if="orderRange == 'custom'">
            <app-field v-model="customRange" :field="datetimeField"
                       @update:model-value="customRangeChange"></app-field>
          </div>
        </div>
      </div>

      <AnalyticsTrends :items="trends.values" :x-axis-data="trends.times"></AnalyticsTrends>
    </div>
    <!--    <AnalysisChartsTabs -->
    <!--      :tabs="chartTabs" -->
    <!--      class="mt-5"-->
    <!--    >-->
    <!--      <template #trends>-->
    <!--        <AnalyticsTrends />-->
    <!--      </template>-->
    <!--      <template #visits>-->
    <!--        <AnalyticsVisits />-->
    <!--      </template>-->
    <!--    </AnalysisChartsTabs>-->

        <div class="mt-5 w-full md:flex">
          <AnalysisChartCard
            v-for="(item,index) in rates"
            :key="index"
            class="mt-5 md:mr-4 md:mt-0 md:w-1/3"
            :title="item.title"
          >
            <component
              :is="item.data?.length > 1 ? AnalyticsGaugeRing : AnalyticsGauge"
              :key="index"
              :value="item.data?.length == 1 ? item.data[0].value : item.data"
              unit="%"
              :min="0"
              :max="100"
              :title="item.data[0].name"
              :axisConfig="item.config"
            />
          </AnalysisChartCard>
        </div>

<!--      <button class="position-fixed right-0 rounded-s-pill bg-primary px-2 text-button" style="top:100px">-->
<!--        多项目统计-->
<!--      </button>-->
  </div>
</template>
