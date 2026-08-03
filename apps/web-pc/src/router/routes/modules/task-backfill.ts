import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'TaskBackfill',
    path: '/task-backfill',
    component: () => import('#/views/task-backfill/list.vue'),
    meta: {
      icon: 'lucide:calendar-plus',
      title: '后补申请',
      permissions: ['task_backfill'],
    },
  },
];

export default routes;
