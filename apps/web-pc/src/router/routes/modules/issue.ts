import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Issue',
    path: '/issue',
    component: () => import('#/views/issue/list.vue'),
    meta: {
      icon: 'lucide:alert-circle',
      title: '问题跟踪',
      permissions: ['issue'],
    },
  },
];

export default routes;
