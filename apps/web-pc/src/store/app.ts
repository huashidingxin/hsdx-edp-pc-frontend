import { useAccessStore, useTabbarStore, useUserStore } from '@vben/stores';

import { defineStore } from 'pinia';

import Resource from '#/api/resource';
import { resetRoutes, router } from '#/router';
import { generateAccess } from '#/router/access';
import { accessRoutes } from '#/router/routes';

interface ProjectRole {
  id?: number | string;
  display_name?: string;
  name?: string;
  [key: string]: any;
}

interface ProjectItem {
  id?: number | string;
  name?: string;
  short_name?: string;
  code?: string;
  roles?: ProjectRole[] | string[];
  is_default?: boolean;
  [key: string]: any;
}

interface AppState {
  setting: Record<string, any>;
  projects: ProjectItem[];
  defaultProject: ProjectItem;
  dashboard: Record<string, any>;
}

function pickRoleName(role: any): string {
  if (!role) return '';
  if (typeof role === 'string') return role;
  return role.display_name || role.name || '';
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    setting: {},
    projects: [],
    defaultProject: {},
    dashboard: {},
  }),

  getters: {
    currentProject: (state) =>
      state.defaultProject?.id ? state.defaultProject : state.projects?.[0],

    /**
     * 是否处于“全部项目”模式（仅管理员可选）。
     * 该模式下 defaultProject 为无 id 的哨兵对象，各列表页据此忽略全局项目过滤。
     */
    isAllProjects: (state) => !state.defaultProject?.id && !!state.defaultProject?.all,

    defaultRoleName(): string {
      const role = (this.defaultProject as any)?.role;
      return pickRoleName(role);
    },

    todo: (state) => state.dashboard?.todo || {},

    personalTodoCount: (state) => {
      const dashboard = state.dashboard || {};
      if (Object.prototype.hasOwnProperty.call(dashboard.todo || {}, 'total')) {
        return Number(dashboard.todo.total || 0);
      }

      // 兼容旧后端：与工作台待办卡片使用同一组分类。
      const paths = [
        'task.personal_pending',
        'task.personal_log_tobe_submit',
        'task.team_log_tobe_audit',
        'supervision_log.personal_tobe_submit',
        'supervision_log.team_tobe_audit',
        'project_user.team_tobe_audit',
        'nonconformance.pending',
        'nonconformance.processing',
        'nonconformance.pending_review',
        'nonconformance.team_tobe_audit',
        'tool.near_due',
        'tool.overdue',
        'pending_supplement.prereq_pending',
        'pending_supplement.log_warning',
      ];
      return paths.reduce(
        (total, path) => total + Number(path.split('.').reduce((value, key) => value?.[key], dashboard) || 0),
        0,
      );
    },
  },

  actions: {
    setTemp(_key: string, _value: any) {
      // 预留：临时数据存储
    },

    async loadSetting() {
      try {
        const api = new Resource('settings');
        const { data } = await api.list();
        this.setting = data;
      } catch (e) {
        console.log(e);
      }
    },

    async getPermissions(projectId: number | string | undefined = 0) {
      const accessStore = useAccessStore();
      try {
        const api = new Resource('auth');
        const { data } = await api.get('codes', {
          project_id: projectId || undefined,
        });
        accessStore.setAccessCodes(data);
        return data;
      } catch (e) {
        console.log(e);
      }
    },

    getDashboard() {
      return new Promise(async (resolve, reject) => {
        const accessStore = useAccessStore();
        if (!accessStore.isAccessChecked) return;
        try {
          const api = new Resource('dashboards');
          const { data } = await api.list({
            project_id: this.defaultProject?.id,
          });
          this.dashboard = data;
          resolve(data);
        } catch (e) {
          reject(e);
        }
      });
    },

    getProjects(perPage: 'all' | number = 'all') {
      return new Promise<void>(async (resolve, reject) => {
        try {
          const api = new Resource('user-projects');
          const { data } = await api.list({
            per_page: perPage,
            with_stats: 1,
            status: 1,
            sort_by: JSON.stringify([{ key: 'is_default', order: 'desc' }]),
          });
          if (perPage === 'all') {
            this.projects = data || [];
            // 管理员的“全部项目”模式保持不变；旧版本保存的具体项目未命中时才回退。
            if (!this.isAllProjects) {
              this.defaultProject =
                this.projects.find(
                  (project) => project.id === this.defaultProject?.id,
                ) || this.projects[0] || {};
            }
          }
          resolve();
        } catch (error) {
          console.log(error);
          reject(error);
        }
      });
    },

    /**
     * 分页 + 关键词联网查询项目（供项目选择器使用）。
     * 后端 user-projects 原生支持 keyword（名称/简称/编码 LIKE）与 page/per_page。
     */
    async getProjectsPaged(
      params: { keyword?: string; page?: number; per_page?: number; } = {},
    ): Promise<{
      data: ProjectItem[];
      meta?: { current_page?: number; last_page?: number; total?: number; };
    }> {
      const api = new Resource('user-projects');
      const res: any = await api.list({
        page: params.page ?? 1,
        per_page: params.per_page ?? 6,
        keyword: params.keyword || undefined,
        with_stats: 1,
        status: 1,
        // id 作为决胜键，保证 is_default 相同（并列）时排序稳定，翻页不重叠
        sort_by: JSON.stringify([
          { key: 'is_default', order: 'desc' },
          { key: 'projects.id', order: 'desc' },
        ]),
      });
      return res as {
        data: ProjectItem[];
        meta?: { current_page?: number; last_page?: number; total?: number; };
      };
    },

    setDefaultProject(project: ProjectItem) {
      if (!project?.id) {
        return Promise.reject(new Error('项目相关功能必须指定具体项目'));
      }
      this.defaultProject = project as any;
      return new Promise<void>(async (resolve, reject) => {
        try {
          const api = new Resource('project/default');
          await api.store({ project_id: project.id });
          resolve();
        } catch (error) {
          console.log(error);
          reject(error);
        }
      });
    },

    /**
     * 切换当前项目并执行 SPA 内软重载。
     *
     * 设计要点：
     *  - 菜单：不显式 setAccessMenus([]) —— 中间空帧会让顶部菜单闪一下空白。
     *    直接在 generateAccess 完成后 setAccessMenus(newMenus) 原地覆盖，
     *    UI 从旧菜单直接替换为新菜单，无明显空白帧。
     *  - 标签：只保留当前激活标签，其余全部关闭；切换后强制刷新当前标签
     *    （重挂载当前页面组件，重新拉取新项目数据），不再尝试恢复 affix 或首页。
     */
    async switchProject(project: ProjectItem) {
      if (!project?.id) {
        throw new Error('项目相关功能必须指定具体项目');
      }
      this.defaultProject = project as any;
      // 1. 通知后端记录新默认项目
      await this.setDefaultProject(project);
      await this.afterProjectSwitch();
    },

    /**
     * 切换为“全部项目”模式（仅管理员）：不通知后端记录默认项目，仅前端持久化。
     * 各列表页据此忽略全局项目过滤，跨项目查询。
     */
    async switchAllProjects() {
      this.defaultProject = { all: true, name: '全部项目' } as any;
      await this.afterProjectSwitch();
    },

    /**
     * 项目切换后的软重载（菜单/权限/标签刷新），switchProject 与 switchAllProjects 共用。
     */
    async afterProjectSwitch() {
      const accessStore = useAccessStore();
      const userStore = useUserStore();
      const tabbarStore = useTabbarStore();

      // 记录当前激活的标签（切换后要保留它）
      const currentFullPath = router.currentRoute.value.fullPath;
      const currentTab = tabbarStore.getTabByKey(currentFullPath);

      // 清业务缓存
      this.dashboard = {};

      // 移除上一项目的动态路由（保留静态路由），让 generateAccessible 能原地替换而非合并
      try {
        resetRoutes();
      } catch (e) {
        console.warn('switchProject: reset routes failed', e);
      }

      // 重新拉权限码（全部项目模式不带 project_id）
      await this.getPermissions(this.defaultProject?.id);

      // 主动生成菜单/路由
      const userInfo = userStore.userInfo;
      const userRoles = userInfo?.roles ?? [];

      let result: { accessibleMenus: any[]; accessibleRoutes: any[] };
      try {
        result = await generateAccess({
          roles: userRoles,
          router,
          routes: accessRoutes,
        } as any);
      } catch (e) {
        console.error('switchProject: generateAccess failed', e);
        return;
      }

      // 原地覆盖菜单与路由（不在前面清空，避免 UI 空白帧）
      accessStore.setAccessRoutes(result.accessibleRoutes);
      accessStore.setAccessMenus(result.accessibleMenus);
      accessStore.setIsAccessChecked(true);

      // 只保留当前激活标签，其余全部关闭（affix 也关闭，不恢复首页）
      try {
        tabbarStore.tabs = currentTab
          ? ([currentTab] as any)
          : ([] as any);
        tabbarStore.cachedTabs = currentTab
          ? new Set([currentTab.key as string])
          : new Set();
        tabbarStore.cachedRoutes = new Map();
      } catch (e) {
        console.warn('switchProject: keep active tab failed', e);
      }

      // 强制刷新当前标签：renderRouteView toggle 会卸载并重挂载
      //    <RouterView>，当前页面组件重新创建，onMounted 重新拉取新项目数据。
      //    刷新前当前标签已在 tabs 中，刷新后仍保留。
      try {
        await tabbarStore.refresh(router);
      } catch (e) {
        console.warn('switchProject: refresh tab failed', e);
      }
    },
  },

  persist: {
    storage: localStorage,
    pick: ['defaultProject'],
  },
});

export type { AppState, ProjectItem, ProjectRole };
