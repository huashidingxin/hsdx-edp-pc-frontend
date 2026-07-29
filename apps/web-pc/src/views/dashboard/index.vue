<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Button, Spin, Table, Tag } from 'antdv-next';
import Resource from '#/api/resource';

const router = useRouter();
const loading = ref(false);
const stats = ref(null);

const dashboardApi = new Resource('dashboard');

async function load() {
  loading.value = true;
  try {
    const res = await dashboardApi.list({});
    stats.value = res?.data || res;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

// ── KPI cards ──────────────────────────────────────────────────────────
const kpiCards = computed(() => {
  if (!stats.value) return [];
  const s = stats.value;
  return [
    {
      title: '注册用户',
      value: s.users.total.toLocaleString(),
      sub: `今日新增 +${s.users.today_new}`,
      icon: '👥',
      color: 'bg-blue-500',
      light: 'bg-blue-50',
      text: 'text-blue-600',
    },
    {
      title: '分销员',
      value: s.promoters.active.toLocaleString(),
      sub: s.promoters.pending ? `${s.promoters.pending} 人待审核` : '暂无待审核',
      subAlert: s.promoters.pending > 0,
      icon: '🤝',
      color: 'bg-emerald-500',
      light: 'bg-emerald-50',
      text: 'text-emerald-600',
      action: () => router.push('/distribution/promoters'),
    },
    {
      title: '今日订单',
      value: s.orders.today.toLocaleString(),
      sub: `累计 ${s.orders.total.toLocaleString()} 笔`,
      icon: '📦',
      color: 'bg-violet-500',
      light: 'bg-violet-50',
      text: 'text-violet-600',
      action: () => router.push('/order'),
    },
    {
      title: '今日收入',
      value: `¥${s.orders.today_revenue.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
      sub: `累计 ¥${s.orders.total_revenue.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
      icon: '💰',
      color: 'bg-amber-500',
      light: 'bg-amber-50',
      text: 'text-amber-600',
    },
  ];
});

// ── pending items ──────────────────────────────────────────────────────
const pendingItems = computed(() => {
  if (!stats.value) return [];
  const s = stats.value;
  return [
    {
      label: '待审核分销员',
      count: s.promoters.pending,
      icon: '⏳',
      color: s.promoters.pending ? '#f59e0b' : '#9ca3af',
      route: '/distribution/promoters',
    },
    {
      label: '待审核提现',
      count: s.withdrawals.pending_count,
      sub: s.withdrawals.pending_count ? `¥${s.withdrawals.pending_amount}` : null,
      icon: '💳',
      color: s.withdrawals.pending_count ? '#ef4444' : '#9ca3af',
      route: '/distribution/withdrawals',
    },
    {
      label: '待发货订单',
      count: s.orders.pending_ship,
      icon: '🚚',
      color: s.orders.pending_ship ? '#3b82f6' : '#9ca3af',
      route: '/order',
    },
  ];
});

// ── recent orders ──────────────────────────────────────────────────────
const orderStatusMap = {
  0: { text: '已取消', color: '#ef4444' },
  1: { text: '待付款', color: '#f59e0b' },
  2: { text: '定制中', color: '#8b5cf6' },
  3: { text: '待发货', color: '#ec4899' },
  4: { text: '待收货', color: '#10b981' },
  5: { text: '待评价', color: '#06b6d4' },
  6: { text: '已完成', color: '#10b981' },
};

const recentOrderColumns = [
  { title: '订单号', dataIndex: 'id', width: 180, ellipsis: true },
  { title: '用户', key: 'user', width: 130 },
  { title: '金额', dataIndex: 'paid_amount', width: 100 },
  { title: '状态', key: 'status', width: 100 },
  { title: '时间', dataIndex: 'created_at', width: 160 },
];

// ── trend ──────────────────────────────────────────────────────────────
const maxTrendCount = computed(() => {
  if (!stats.value?.trend?.length) return 1;
  return Math.max(...stats.value.trend.map((d) => d.count), 1);
});

function trendBarHeight(count) {
  return Math.max((count / maxTrendCount.value) * 64, count > 0 ? 4 : 0);
}

function weekday(dateStr) {
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return '周' + days[new Date(dateStr).getDay()];
}

const nowStr = computed(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

onMounted(load);
</script>

<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Spin :spinning="loading">

      <!-- Header -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-900">控制台</h1>
          <p class="mt-0.5 text-sm text-gray-400">{{ nowStr }} · 数据实时统计</p>
        </div>
        <Button size="small" @click="load">刷新</Button>
      </div>

      <!-- KPI cards -->
      <div class="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div
          v-for="card in kpiCards"
          :key="card.title"
          class="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          :class="card.action ? 'cursor-pointer' : ''"
          @click="card.action?.()"
        >
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm text-gray-500">{{ card.title }}</p>
              <p class="mt-1 text-2xl font-bold text-gray-900">{{ card.value }}</p>
              <p class="mt-1 text-xs" :class="card.subAlert ? 'font-medium text-amber-500' : 'text-gray-400'">
                {{ card.sub }}
              </p>
            </div>
            <div class="flex h-10 w-10 items-center justify-center rounded-lg text-xl" :class="card.light">
              {{ card.icon }}
            </div>
          </div>
        </div>
      </div>

      <!-- Pending + Trend row -->
      <div class="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">

        <!-- Pending items -->
        <div class="rounded-xl bg-white p-5 shadow-sm">
          <h3 class="mb-4 text-sm font-semibold text-gray-700">待处理事项</h3>
          <div class="space-y-3">
            <div
              v-for="item in pendingItems"
              :key="item.label"
              class="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-gray-50"
              @click="router.push(item.route)"
            >
              <div class="flex items-center gap-2">
                <span class="text-base">{{ item.icon }}</span>
                <span class="text-sm text-gray-600">{{ item.label }}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span v-if="item.sub" class="text-xs text-gray-400">{{ item.sub }}</span>
                <span
                  class="min-w-[24px] rounded-full px-1.5 py-0.5 text-center text-xs font-bold text-white"
                  :style="{ backgroundColor: item.color }"
                >{{ item.count }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 7-day trend -->
        <div class="col-span-2 rounded-xl bg-white p-5 shadow-sm">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-gray-700">近 7 天订单趋势</h3>
            <span class="text-xs text-gray-400">每日订单数</span>
          </div>
          <div v-if="stats?.trend?.length" class="flex h-24 items-end gap-2">
            <div
              v-for="day in stats.trend"
              :key="day.date"
              class="flex flex-1 flex-col items-center gap-1"
            >
              <span class="text-xs font-medium text-gray-700">{{ day.count || '' }}</span>
              <div
                class="w-full rounded-t-sm transition-all"
                :class="day.date === nowStr ? 'bg-blue-500' : 'bg-blue-200'"
                :style="{ height: `${trendBarHeight(day.count)}px` }"
              ></div>
              <span class="text-xs text-gray-400">{{ weekday(day.date) }}</span>
            </div>
          </div>
          <div v-else class="flex h-24 items-center justify-center text-sm text-gray-400">暂无数据</div>
          <!-- Revenue total row -->
          <div v-if="stats?.trend?.length" class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
            <span class="text-xs text-gray-500">近 7 天总收入</span>
            <span class="text-sm font-semibold text-gray-800">
              ¥{{ stats.trend.reduce((s, d) => s + d.revenue, 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Recent orders -->
      <div class="rounded-xl bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 class="text-sm font-semibold text-gray-700">最近订单</h3>
          <Button type="link" size="small" class="text-xs" @click="router.push('/order')">查看全部 →</Button>
        </div>
        <Table
          v-if="stats"
          :columns="recentOrderColumns"
          :data-source="stats.recent_orders || []"
          :pagination="false"
          row-key="id"
          size="small"
          class="recent-orders-table"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'user'">
              <span class="text-sm text-gray-700">{{ record.user?.name || record.user?.mobile || '-' }}</span>
            </template>
            <template v-else-if="column.dataIndex === 'paid_amount'">
              <span class="font-semibold text-orange-600">¥{{ record.paid_amount }}</span>
            </template>
            <template v-else-if="column.key === 'status'">
              <Tag :color="orderStatusMap[record.status]?.color" style="font-size:12px">
                {{ orderStatusMap[record.status]?.text || '未知' }}
              </Tag>
            </template>
            <template v-else-if="column.dataIndex === 'created_at'">
              <span class="text-xs text-gray-400">{{ record.created_at }}</span>
            </template>
          </template>
        </Table>
        <div v-if="!stats" class="flex h-32 items-center justify-center text-sm text-gray-400">加载中…</div>
      </div>

    </Spin>
  </div>
</template>

<style scoped>
.recent-orders-table :deep(.ant-table-thead > tr > th) {
  background: #f9fafb;
  font-size: 12px;
  color: #6b7280;
  font-weight: 600;
}
</style>
