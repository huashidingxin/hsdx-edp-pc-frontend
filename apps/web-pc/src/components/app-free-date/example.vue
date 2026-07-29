<template>
  <div class="p-10">
    <h1 class="text-2xl font-bold mb-6">AppFreeDate 组件使用示例</h1>

    <!-- 基础用法 - 日期精度 + 阴历阳历切换 -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold mb-4">基础用法（日期精度 + 阴阳历切换）</h2>
      <AppFreeDate v-model="selectedDate" @change="handleDateChange" />
      <div class="mt-4 p-4 bg-gray-100 rounded">
        <p>选中的日期：{{ selectedDate }}</p>
      </div>
    </div>

    <!-- 不显示阴历阳历切换 -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold mb-4">仅阳历模式</h2>
      <AppFreeDate v-model="solarOnlyDate" :show-lunar-toggle="false" />
      <div class="mt-4 p-4 bg-gray-100 rounded">
        <p>选中的日期：{{ solarOnlyDate }}</p>
      </div>
    </div>

    <!-- 年份精度 -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold mb-4">年份精度</h2>
      <AppFreeDate
        v-model="yearDate"
        precision="year"
        @change="handleYearChange"
        @update:precision="handlePrecisionChange"
      />
      <div class="mt-4 p-4 bg-gray-100 rounded">
        <p>选中的日期：{{ yearDate }}</p>
        <p>当前精度：{{ currentPrecision }}</p>
      </div>
    </div>

    <!-- 月份精度 -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold mb-4">月份精度</h2>
      <AppFreeDate
        v-model="monthDate"
        precision="month"
        @change="handleMonthChange"
      />
      <div class="mt-4 p-4 bg-gray-100 rounded">
        <p>选中的日期：{{ monthDate }}</p>
      </div>
    </div>

    <!-- 自定义年份范围 -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold mb-4">自定义年份范围</h2>
      <AppFreeDate
        v-model="customDate"
        :start-year="2000"
        :end-year="2030"
        class-name="custom-date-picker"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import AppFreeDate from './index.vue';
import type { FreeDatePrecision } from './types';

// 基础用法
const selectedDate = ref<string>('2026-05-27');

function handleDateChange(payload: { value: string }) {
  console.log('日期变更：', payload.value);
}

// 仅阳历
const solarOnlyDate = ref<string>('2026-05-27');

// 年份精度
const yearDate = ref<string>('2026-01-01');
const currentPrecision = ref<FreeDatePrecision>('year');

function handleYearChange(payload: { value: string }) {
  console.log('年份变更：', payload.value);
}

function handlePrecisionChange(precision: FreeDatePrecision) {
  currentPrecision.value = precision;
  console.log('精度变更：', precision);
}

// 月份精度
const monthDate = ref<string>('2026-05-01');

function handleMonthChange(payload: { value: string }) {
  console.log('月份变更：', payload.value);
}

// 自定义年份范围
const customDate = ref<string>('2024-01-01');
</script>
