import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'Nonconformance',
    path: '/nonconformance',
    component: () => import('#/views/nonconformance/list.vue'),
    meta: {
      icon: 'lucide:shield-alert',
      title: '不符合项',
      permissions: ['nonconformance'],
    },
  },
];

export default routes;
