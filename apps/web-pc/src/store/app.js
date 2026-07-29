import {defineStore} from 'pinia'
import Resource from '#/api/resource.ts'
export const useAppStore = defineStore('app', {
	state: () => ({
    setting:{}
  }),

  actions:{
    async loadSetting() {
      try{
        const api = new Resource('settings')
        const {data} = await api.list()
        this.setting = data
      }catch(e) {
       console.log(e)
      }
    }
  }
})
