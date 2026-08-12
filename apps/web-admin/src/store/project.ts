import {defineStore} from "pinia";
import Resource from "#/api/resource";
export const useProjectStore = defineStore('project',{
  state: () => ({
    projects:[],
    current: null,
  }),

  actions:{
    getProjects(perPage='all'){
      return new Promise(async (resolve,reject)=>{
        try {
          const api = new Resource('user-projects')
          const {data} = await api.list({per_page:perPage,project_id:this.current?.id,sortBy:[{key:'is_default',order:'desc'}]})
          if(perPage === 'all'){
            this.projects = data || []
          }
          if(!this.current && data?.length){
            this.current= data[0]
          }
          resolve(data)
        } catch (error) {
          console.log(error)
          reject(error)
        }
      })
    },

    setDefaultProject(project: never) {
      this.current = project || {};
      if(!project?.id){
        return null
      }
      return new Promise(async (resolve,reject)=>{
        try {
          const api = new Resource('project/default')
          const {data} = await api.store({project_id:project.id})

          resolve(data)
        } catch (error) {
          console.log(error)
          reject(error)
        }
      })
    },
  }
})
