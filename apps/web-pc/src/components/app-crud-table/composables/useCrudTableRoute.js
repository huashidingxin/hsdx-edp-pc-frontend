import { computed, inject, provide } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * 路由接管 composable
 *
 * 负责：
 * - provide/inject isCrudTableNested 标记
 * - 计算 pageModel（list | detail）
 * - 解析 listRoutePath
 * - 路由导航方法
 *
 * @param {object} props - 壳组件 props
 * @param {object} ctx - 上下文
 * @returns {{
 *   pageModel: import('vue').ComputedRef<'list'|'detail'>,
 *   detailRouteId: import('vue').ComputedRef<string|number|undefined>,
 *   detailRouteAction: import('vue').ComputedRef<'new'|'edit'|undefined>,
 *   listRoutePath: import('vue').ComputedRef<string>,
 *   navigateToDetail: (id?: string|number|null, isEdit?: boolean) => Promise<void>,
 *   navigateToList: () => Promise<void>,
 *   isNested: boolean,
 * }}
 */
export function useCrudTableRoute(props, ctx) {
  const route = useRoute();
  const router = useRouter();

  // 嵌套检测
  const isNested = inject('isCrudTableNested', false);
  provide('isCrudTableNested', true);

  /**
   * 解析路由匹配结果
   */
  const matched = computed(() => {
    if (typeof props.routeMatch === 'function') {
      return props.routeMatch(route) || {};
    }
    if (props.routeMatch && typeof props.routeMatch === 'object') {
      return props.routeMatch;
    }
    return {
      id: route.params.id,
      action: route.params.action,
    };
  });

  /**
   * 页面模型：list | detail
   * - 嵌套时始终为 list
   * - 非嵌套时，路由参数存在则为 detail
   */
  const pageModel = computed(() => {
    if (isNested) return 'list';
    const { id, action } = matched.value;
    return (id !== undefined && id !== '') || action ? 'detail' : 'list';
  });

  /**
   * 路由中的详情 ID
   */
  const detailRouteId = computed(() => {
    const { id } = matched.value;
    return id !== undefined && id !== '' ? id : undefined;
  });

  /**
   * 路由中的详情动作
   */
  const detailRouteAction = computed(() => {
    const { action } = matched.value;
    if (action === 'new') return 'new';
    if (action === 'edit') return 'edit';
    return undefined;
  });

  /**
   * 计算列表路由路径
   * 优先使用 pageRouteName，否则从 route.matched 中推导
   */
  const listRoutePath = computed(() => {
    // 优先使用 pageRouteName
    if (props.pageRouteName) {
      try {
        const resolved = router.resolve({ name: props.pageRouteName });
        if (resolved?.path) return resolved.path;
      } catch {
        // 解析失败，回退到路径推导
      }
    }

    // 从 route.matched 中找到包含 :id?/:action? 占位符的路由
    const matchedRoute = route.matched?.find((m) => /:id\??/.test(m.path));
    if (matchedRoute) {
      return matchedRoute.path
        .replace(/\/:id\??/, '')
        .replace(/\/:action\??/, '');
    }

    // 兜底：从当前路径中剥离尾部 id/action 段
    return route.path.replace(/\/(?:new|edit)$/, '').replace(/\/[^/]+$/, '');
  });

  /**
   * 导航到详情页
   */
  async function navigateToDetail(id, isEdit) {
    const basePath = listRoutePath.value;

    if (id == null) {
      // 新增
      await router.push(`${basePath}/new`);
    } else if (isEdit) {
      // 编辑
      await router.push(`${basePath}/${id}/edit`);
    } else {
      // 查看
      await router.push(`${basePath}/${id}`);
    }
  }

  /**
   * 导航回列表
   */
  async function navigateToList() {
    const path = listRoutePath.value;
    if (path) {
      await router.replace(path);
    } else if (router.options.history.state.back) {
      router.back();
    } else {
      await router.push('/');
    }
  }

  return {
    pageModel,
    detailRouteId,
    detailRouteAction,
    listRoutePath,
    navigateToDetail,
    navigateToList,
    isNested,
    matched,
  };
}
