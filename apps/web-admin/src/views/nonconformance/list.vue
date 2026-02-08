<script setup lang="ts">
import {useAppStore} from "@/store";
import {VChip} from "vuetify/components";
import Resource from "#/api/resource";
const appStore = useAppStore()
const props = defineProps({
  issueId:{
    default:undefined,
    type:[String,Number]
  },
  title:{
    default:'',
    typer:String
  }
})
const stateRender = {
  name:'CellRender',
  render:({row})=>{
    const colors = {0:'',1:'warning',2:'primary',3:'success'}
    return h(VChip,{
      text:row.state_label,
      color:colors[row.state],
      label:true,
      size:'small'
    })
  },
}
const options = ref({
  columns:[
    {field:'code',title:'编号',width:200,'fixed':'left'},
    {field:'stakeholder.name',title:'相关方',minWidth:200},
    {field:'content',title:'内容',minWidth:300},
    {field:'state_label',title:'状态',width:200,cellRender:stateRender},
    // {field:'mileposts',title:'桩号',width:200,slots:{default:'default_mileposts'}},
    {field:'creator',title:'创建人',width:200,slots:{default:'default_creator'}},
    {field:'created_at',title:'创建时间',width:200},
  ],
  data:[]
});
const filters = ref([
  {
    field:'code',
    type: 'text',
    col: 3,
    label: '编码',
  },
  {
    field:'stakeholder_id',
    type: 'autocomplete',
    col: 3,
    label: '相关方',
  },
  {
    field:'keyword',
    type: 'text',
    col: 3,
    label: '内容',
  },
  {
    field:'state',
    type: 'select',
    col: 3,
    label: '状态',
    attrs:{
      items:[
        {id:0,name:'待提交'},
        {id:1,name:'待处理'},
        {id:2,name:'下发整改'},
        {id:3,name:'处理完成'},
        {id:4,name:'审核不通过'},
      ],
      multiple:true
    },
  },
]);

const fields = ref([
  {
    field:'code',
    type: 'text',
    col: 4,
    label: '编号',
    attrs:{
      placeholder:'输入编号或系统自动生成'
    }
  },
  {
    field:'stakeholder_id',
    type: 'autocomplete',
    col: 8,
    label: '相关方',
    attrs:{},
    rules:[v=>!!v || '请选择相关方']
  },
  {
    field:'content',
    type: 'textarea',
    col: 12,
    label: '内容',
  },
  {
    field:'proof',
    type: 'file',
    col: 12,
    label: '现场情况',
    attrs:{
      fileType:'image',
      multiple:true
    }
  },
  {
    field:'correction',
    type: 'file',
    col: 12,
    label: '整改情况',
    attrs:{
      fileType:'image',
      multiple:true
    }
  },
  {
    field:'notice',
    type: 'file',
    col: 12,
    label: '通知单',
    attrs:{
      fileType:'image'
    }
  },
  {
    field:'notice_reply',
    type: 'file',
    col: 12,
    label: '通知回复单',
    attrs:{
      fileType:'image'
    }
  },
  {
    field:'state',
    type: 'select',
    col: 3,
    label: '状态',
    attrs:{
      items:[
        {id:0,name:'待提交',disabled:true},
        {id:1,name:'待处理',disabled:true},
        {id:2,name:'下发整改',disabled:true},
        {id:4,name:'审核不通过',disabled:true},
        {id:3,name:'处理完成'},
      ],
      itemProps:true
    },
    // rules:[v=>v==3||'选项有误']
  },
]);

const editingItem = ref({})
const filterData = ref({})

const $toast = inject('$toast')

const requestData = computed(()=>{
  return {issue_id:props.issueId,project_id: appStore.defaultProject?.id}
})

function saveFormat(e) {
  return {
    ...e,
    project_id:e.project_id || appStore.defaultProjet?.id
  }
}

async function loadStakeholders(projectId=null) {
  if(!projectId && !appStore.defaultProjet?.id) {
    return
  }
  try{
    const api = new Resource('stakeholders')
    const {data} = await api.list({
      project_id:projectId || appStore.defaultProjet?.id
    })
    return data
  }catch (e) {
    console.log(e)
  }
}

watch(()=>filterData.value.project_id,async (newFilterProjectId)=>{
  const data = await loadStakeholders(newFilterProjectId)
  filters.value.find(v=>v.field=='stakeholder_id').attrs.items = data
})

watch(()=>editingItem.value.project_id,async (newFilterProjectId)=>{
  const data = await loadStakeholders(newFilterProjectId || appStore.defaultProjet?.id)
  fields.value.find(v=>v.field=='stakeholder_id').attrs.items = data
},{immediate:true})
function showAudit(e) {
  return e && ('audit_id' in e) && !e.audit_id && e.state != 3
}

async function dialogChange(status) {
  // if(status) {
  //   const data = await loadStakeholders(editingItem.value.project_id || appStore.defaultProjet?.id)
  // }
}

onBeforeMount(()=>{
  // loadStakeholders()
})
</script>
<template>
  <AppTable
    v-model="editingItem"
    :options="options"
    v-model:filters="filterData"
    :filter-fields="filters"
    :fields="fields"
    :request-data="requestData"
    :save-format="saveFormat"
    detail-open-type="drawer"
    create-open-type="drawer"
    api-url="nonconformances"
    :title="title"
    permission-name="nonconformance"
    :show-audit="showAudit"
    :project-props="{filter:true,edit:true,filterRequired:false,editRequired:true}"
    @dialog-change="dialogChange"
  >
    <template #form_description>
      <v-alert v-if="editingItem.audit_id > 0 && !editingItem.audit.status" type="error" class="mb-3">
        <div>审核不通过：{{editingItem.audit.reason}}</div>
        <div>审核时间：{{editingItem.audit.created_at}}</div>
      </v-alert>
    </template>
    <template #default_mileposts="{data:{row}}">
      <div class="d-flex">
        <div v-for="(item,index) in row.mileposts" :key="index" class="me-2">{{item.name}}</div>
      </div>
    </template>
    <template #default_creator="{data:{row}}">
      <div class="d-flex align-center">
        <v-avatar :image="row.creator.avatar" size="30" rounded></v-avatar>
        <div class="ms-2">{{row.creator.name}}</div>
      </div>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
