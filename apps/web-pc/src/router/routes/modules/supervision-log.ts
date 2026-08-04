import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'SupervisionLog',
    path: '/supervision-logs',
    component: () => import('#/views/supervision-log/list.vue'),
    meta: {
      icon: 'lucide:file-text',
      title: '监理日志',
      permissions: ['supervision_log'],
    },
  },
];

export default routes;
