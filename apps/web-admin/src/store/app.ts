import {defineStore} from 'pinia'
import {useAccessStore} from "@vben/stores";
import Resource from "@/api/resource";

export const useAppStore = defineStore('app', {
  state: () => {
    return {
      temp: {},
      setting: {},
      defaultProject: {},
      projects: [],
    }
  },
  actions: {
    setTemp(key: string, value: any) {
      this.temp[key] = value
    },

    updateMenuBadge(routePath, badge) {
      const accessStore = useAccessStore();
      const menu = accessStore.getMenuByPath(routePath);
      menu.badge = '99'
      menu.badgeVariants = 'destructive'
    },


    async getPermissions(teamId = 0) {
      const accessStore = useAccessStore();
      try {
        const api = new Resource('auth')
        const {data} = await api.get('codes?team_id=' + teamId)
        accessStore.setAccessCodes(data)
        return data
      } catch (e) {
        console.log(e)
      }
    },

    getProjects(perPage = 'all') {
      return new Promise(async (resolve, reject) => {
        try {
          const api = new Resource('user-projects')
          const {
            data
          } = await api.list({
            per_page: perPage,
            with_stats: 1,
            status: 1,
            sort_by: JSON.stringify([{
              key: 'is_default',
              order: 'desc'
            }])
          })
          if (perPage === 'all') {
            this.projects = data || []
          }
          if (!this.defaultProject?.name) {
            this.defaultProject = data[0]
          }
        } catch (error) {
          console.log(error)
        }
      })
    },

    setDefaultProject(project) {
      this.defaultProject = project;
      if (!project) {
        this.defaultProject = {name: '所有项目'}
        return
      }
      return new Promise(async (resolve, reject) => {
        try {
          const api = new Resource('project/default')
          const {
            data
          } = await api.store({
            project_id: project.id
          })
          resolve(data)
        } catch (error) {
          console.log(error)
          reject(error)
        }
      })
    },

    getSetting() {
      console.log('GET CONFIG');
      const api = new Resource('settings?model=1')
      return new Promise(async (resolve, reject) => {
        try {
          let {data} = await api.list()
          this.setting = data;
          resolve(data)
        } catch (e) {
          reject(e)
        }

      })
    },

  },
  persist: {
    enabled: true,
    strategies: [
      {
        storage: localStorage,
        reducer: (state) => ({

        }),
      },
    ],
  },
})
