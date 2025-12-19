import {defineStore} from 'pinia'
import {useAccessStore} from "@vben/stores";
import Resource from "@/api/resource";

export const useAppStore = defineStore('app', {
  state: () => {
    return {
      temp: {},
      config:{},
      defaultRegion:{},
      regions:[],
      datavIsDefault:false
    }
  },
  actions: {
    setTemp(key: string, value: any) {
      this.temp[key] = value
    },

    updateMenuBadge(routePath,badge) {
      const accessStore = useAccessStore();
      const menu = accessStore.getMenuByPath(routePath);
      menu.badge = '99'
      menu.badgeVariants = 'destructive'
    },


    async getPermissions(teamId=0) {
      const accessStore = useAccessStore();
      try{
        const api = new Resource('auth')
        const {data} = await api.get('codes?team_id='+teamId)
        accessStore.setAccessCodes(data)
        return data
      }catch(e) {
        console.log(e)
      }
    },

    async getRegions(perPage='all'){
      return new Promise(async (resolve,reject)=>{
        try {
          const api = new Resource('user-regions')
          const {data} = await api.list({per_page:perPage})
          if(perPage === 'all'){
            this.regions = data || []
          }
          if(!this.defaultRegion?.id && data?.length){
            this.defaultRegion = data[0]
          }
          resolve(data)
        } catch (error) {
          console.log(error)
          reject(error)
        }
      })
    },

    setDefaultRegion(region) {
      this.defaultRegion = region;
      return new Promise(async (resolve,reject)=>{
        try {
          const api = new Resource('user-region/default')
          const {data} = await api.store({region_id:region.id})
          resolve(data)
        } catch (error) {
          console.log(error)
          reject(error)
        }
      })
    },

    getConfig(){
      console.log('GET CONFIG');
      const api = new Resource('app/settings?model=1')
      return new Promise(async (resolve, reject) => {
        try{
          let {data} = await api.list()

          this.config = data;
          resolve()
        }catch(e){
          reject(e)
        }

      })
    },

    setDatavIsDefault(status){
      this.datavIsDefault = status
    }
  },
  persist: {
    enabled: true,
    strategies: [
      {
        storage: localStorage,
        reducer: (state) => ({
          datavIsDefault: state.datavIsDefault,
        }),
      },
    ],
  },
})
