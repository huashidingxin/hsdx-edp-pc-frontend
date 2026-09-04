import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

// P8-003 移除 vben 框架演示路由（VbenProject/About），保留业务路由（Profile 个人中心）
const routes: RouteRecordRaw[] = [
  {
    name: 'Profile',
    path: '/profile',
    component: () => import('#/views/_core/profile/index.vue'),
    meta: {
      icon: 'lucide:user',
      hideInMenu: true,
      title: $t('page.auth.profile'),
    },
  },
];

export default routes;
