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

  },

  persist: {
    storage: localStorage,
    pick: ['defaultProject'],
  },
});

export type { AppState, ProjectItem, ProjectRole };
