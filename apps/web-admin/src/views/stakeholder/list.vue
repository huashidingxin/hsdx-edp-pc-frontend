<script setup lang="ts">
import {useAppStore} from "@/store";
const appStore = useAppStore();
const options = ref({
  columns:[
    {field:'name',title:'名称',minWidth:200,fixed:'left'},
    {field:'project.name',title:'项目',minWidth:200},
    {field:'type_label',title:'类型',width:200},
    {field:'created_at',title:'创建时间',width:200},
  ],
  data:[]
});
const fields = ref([
  {
    field:'name',
    type: 'text',
    col: 8,
    label: '名称',
    rules:[v=>!!v || '请输入名称']
  },
  {
    field:'type',
    type: 'select',
    col: 4,
    label: '类型',
    attrs:{
      itemProps:true,
      items:[
        {id:1,name:'业主',disabled:true},
        {id:2,name:'施工单位'},
        {id:3,name:'设计单位'},
        {id:4,name:'检测单位'},
      ]
    },
    rules:[v=>!!v || '请选择类型']
  },

]);
const filters = ref([
  {
    field:'name',
    type: 'text',
    col: 3,
    label: '名称',
  },
  {
    field:'types',
    type: 'select',
    col: 3,
    label: '类型',
    attrs:{
      multiple:true,
      items:[
        {id:1,name:'业主',disabled:true},
        {id:2,name:'施工单位'},
        {id:3,name:'设计单位'},
        {id:4,name:'检测单位'},
      ]
    }
  },
]);

const editingItem = ref({})
const requestData = computed(()=>{
  return {
    project_id:appStore.defaultProject?.id
  }
})

function saveFormat(e) {
  return {
    ...e,
    project_id:e.project_id || appStore.defaultProject?.id
  }
}
</script>

<template>
  <AppTable
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    api-url="stakeholders"
    create-open-type="modal"
    detail-open-type="modal"
    :fields="fields"
    permission-name="stakeholder"
    :request-data="requestData"
    :save-format="saveFormat"
    :project-props="{edit:true,filter:true,editRequired:true}"
  >
  </AppTable>
</template>

<style scoped>

</style>
