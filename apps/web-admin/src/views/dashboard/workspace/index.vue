<script lang="ts" setup>
import type {
  WorkbenchProjectItem,
  WorkbenchQuickNavItem,
  WorkbenchTodoItem,
  WorkbenchTrendItem,
} from '@vben/common-ui';

import {ref} from 'vue';
import {useRouter} from 'vue-router';

import {
  AnalysisChartCard,
  WorkbenchHeader,
  WorkbenchProject,
  WorkbenchQuickNav,
  WorkbenchTodo,
  WorkbenchTrends,
} from '@vben/common-ui';
import {preferences} from '@vben/preferences';
import {useUserStore} from '@vben/stores';
import {openWindow} from '@vben/utils';


import AnalyticsVisitsSource from '../analytics/analytics-visits-source.vue';

const userStore = useUserStore();



// 这是一个示例数据，实际项目中需要根据实际情况进行调整
// url 也可以是内部路由，在 navTo 方法中识别处理，进行内部跳转
// 例如：url: /dashboard/workspace
const projectItems: WorkbenchProjectItem[] = [
  {
    color: '',
    content: '',
    date: '',
    group: '正常',
    icon: 'https://cdn.hsdxchina.com/zhongyouzhongzhou/image/0806d92fb67f112239a51a2f0bc417ba4b1f6064.png',
    title: '计划',
    url: 'plans',
  },
  {
    color: '#3fb27f',
    content: '',
    date: '',
    group: '正常',
    icon: 'https://cdn.hsdxchina.com/zhongyouzhongzhou/image/88d9dbe46594b17cd5e81213e083309a5fb2bc12.png',
    title: '任务',
    url: 'tasks',
  },
  {
    color: '#e18525',
    content: '',
    date: '',
    group: '监理记录',
    icon: 'https://cdn.hsdxchina.com/zhongyouzhongzhou/image/128e88fd43b94ea9f9262854af2b4783d5fe8e08.png',
    title: '监理记录',
    url: '/task-submission',
  },
  {
    color: '#bf0c2c',
    content: '',
    date: '',
    group: '不符合项',
    icon: 'https://cdn.hsdxchina.com/zhongyouzhongzhou/image/fe117740a68a96379a15781392dbc50bbbe1bf1d.png',
    title: '不符合项',
    url: '/nonconformance',
  },
  {
    color: '#00d8ff',
    content: '',
    date: '',
    group: '问题',
    icon: 'https://cdn.hsdxchina.com/zhongyouzhongzhou/image/0554911f5835299997e99771516bdf01c0e23296.png',
    title: '问题',
    url: '/issues',
  },
  {
    color: '#EBD94E',
    content: '',
    date: '',
    group: '监理日志',
    icon: 'https://cdn.hsdxchina.com/zhongyouzhongzhou/image/bd2cfec62b079dc6c980eaf1664ea4034bef02ce.png',
    title: '监理日志',
    url: '/diaries',
  },
];

// 同样，这里的 url 也可以使用以 http 开头的外部链接
const quickNavItems: WorkbenchQuickNavItem[] = [
  {
    color: '#1fdaca',
    icon: 'ion:home-outline',
    title: '首页',
    url: '/',
  },
  {
    color: '#bf0c2c',
    icon: 'ion:grid-outline',
    title: '仪表盘',
    url: '/dashboard',
  },
  {
    color: '#e18525',
    icon: 'ion:layers-outline',
    title: '项目',
    url: '/demos/features/icons',
  },
  {
    color: '#3fb27f',
    icon: 'ion:settings-outline',
    title: '系统管理',
    url: '/demos/features/login-expired', // 这里的 URL 是示例，实际项目中需要根据实际情况进行调整
  },
  {
    color: '#4daf1bc9',
    icon: 'ion:key-outline',
    title: '权限管理',
    url: '/permissions',
  },
  {
    color: '#00d8ff',
    icon: 'ion:bar-chart-outline',
    title: '图表',
    url: '/analytics',
  },
];

const todoItems = ref<WorkbenchTodoItem[]>([
  // {
  //   completed: false,
  //   content: `审查最近提交到Git仓库的前端代码，确保代码质量和规范。`,
  //   date: '2024-07-30 11:00:00',
  //   title: '审查前端代码提交',
  // },
  // {
  //   completed: true,
  //   content: `检查并优化系统性能，降低CPU使用率。`,
  //   date: '2024-07-30 11:00:00',
  //   title: '系统性能优化',
  // },
  // {
  //   completed: false,
  //   content: `进行系统安全检查，确保没有安全漏洞或未授权的访问。 `,
  //   date: '2024-07-30 11:00:00',
  //   title: '安全检查',
  // },
  // {
  //   completed: false,
  //   content: `更新项目中的所有npm依赖包，确保使用最新版本。`,
  //   date: '2024-07-30 11:00:00',
  //   title: '更新项目依赖',
  // },
  // {
  //   completed: false,
  //   content: `修复用户报告的页面UI显示问题，确保在不同浏览器中显示一致。 `,
  //   date: '2024-07-30 11:00:00',
  //   title: '修复UI显示问题',
  // },
]);
const trendItems: WorkbenchTrendItem[] = [
  // {
  //   avatar: 'svg:avatar-1',
  //   content: `在 <a>开源组</a> 创建了项目 <a>Vue</a>`,
  //   date: '刚刚',
  //   title: '威廉',
  // },
];

const router = useRouter();

// 这是一个示例方法，实际项目中需要根据实际情况进行调整
// This is a sample method, adjust according to the actual project requirements
function navTo(nav: WorkbenchProjectItem | WorkbenchQuickNavItem) {
  if (nav.url?.startsWith('http')) {
    openWindow(nav.url);
    return;
  }
  if (nav.url?.startsWith('/')) {
    router.push(nav.url).catch((error) => {
      console.error('Navigation failed:', error);
    });
  } else {
    console.warn(`Unknown URL for navigation item: ${nav.title} -> ${nav.url}`);
  }
}
</script>

<template>
  <div class="p-5" >
    <!--        <WorkbenchHeader-->
    <!--          :avatar="userStore.userInfo?.avatar || preferences.app.defaultAvatar"-->
    <!--        >-->
    <!--          <template #title>-->
    <!--            <div>-->
    <!--              , {{ userStore.userInfo?.staff?.staff_name || userStore.userInfo?.name }}, 开始您一天的工作吧！-->
    <!--              <div>{{projectStore.current?.name}}</div>-->
    <!--            </div>-->
    <!--          </template>-->
    <!--          <template #description> 今日晴，20℃ - 32℃！ </template>-->
    <!--        </WorkbenchHeader>-->

    <v-card class="pa-5" flat rounded="xl">
      <div class="d-flex align-center">
        <v-avatar :image="userStore.userInfo?.avatar || preferences.app.defaultAvatar"
                  size="80"></v-avatar>
        <div class="ml-3">
          <div class="text-h5 font-weight-bold">
            {{ userStore.userInfo?.staff?.staff_name || userStore.userInfo?.name }}, 开始您一天的工作吧！
          </div>
          <div class="mt-2"></div>
        </div>

        <div class="ml-auto"> 今日晴，20℃ - 32℃！</div>
      </div>


    </v-card>

    <div class="mt-5 flex flex-col lg:flex-row" v-if="false">
      <div class="mr-4 w-full lg:w-3/5">
        <WorkbenchProject :items="projectItems" title="项目" @click="navTo"/>
        <WorkbenchTrends :items="trendItems" class="mt-5" title="最新动态"/>
      </div>
      <div class="w-full lg:w-2/5">
        <WorkbenchQuickNav
          :items="quickNavItems"
          class="mt-5 lg:mt-0"
          title="快捷导航"
          @click="navTo"
        />
        <WorkbenchTodo :items="todoItems" class="mt-5" title="待办事项"/>
        <!--        <AnalysisChartCard class="mt-5" title="访问来源">-->
        <!--          <AnalyticsVisitsSource />-->
        <!--        </AnalysisChartCard>-->
      </div>
    </div>
  </div>
</template>
