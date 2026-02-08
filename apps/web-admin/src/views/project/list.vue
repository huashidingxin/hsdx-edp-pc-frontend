<script setup>
import Resource from "@/api/resource";
import Milepost from "../milepost/list.vue";
import Division from "./division.vue";

const options = ref({
  treeConfig: {
    transform: true,
    rowField: 'id',
    parentField: 'parent_id',
    // childrenField: 'children',
    expandAll:true,
    lazy: true,
    hasChild: 'children_count',
    loadMethod ({ row }) {
      // 异步加载子节点
      return getChildrenList(row)
    }
  },
  columns:[
    {field:'name',title:'名称',fixed:'left',width:'300px',sortable:true,treeNode: true,},
    {field:'code',title:'编号',sortable:true},
    {field:'category.name',title:'分类',sortable:true},
    {field:'owner_name',title:'业主',slots:{default:'default_owner'}},
    // {field:'phase.name',title:'阶段'},
    {field:'state_label',title:'状态',slots:{default:'default_state'}},
    {field:'unit_project_count',title:'单位工程',slots:{default:'default_unit_project'}},
    {field:'milepost_count',title:'桩号',slots:{default:'default_milepost'}},
    {field:'created_at',title:'创建时间'},
  ],
  data:[]
});
const filters = ref([
  {
    field:'name',
    type: 'text',
    col: 4,
    label: '名称',
  },
  {
    field:'code',
    type: 'text',
    col: 4,
    label: '编号',
  },

  {
    field: 'category_id',
    type: 'autocomplete',
    col: 4,
    label: '主分类',
    updateSearch:{
      apiUrl: 'categories',
      priorityKey:'id',
      params:{
        type:'project'
      }
    },
    attrs: {
      placeholder: '输入名称搜索',
    },
  },

  {
    field: 'phase_id',
    type: 'autocomplete',
    col: 4,
    label: '项目阶段',
    updateSearch:{
      apiUrl: 'phases',
      priorityKey:'id',
      params:{
        type:'project'
      }
    },
    attrs: {
      placeholder: '输入名称搜索',
    },
  },

]);
const fields = ref([
  {
    field: 'name',
    type: 'text',
    col: 8,
    label: '名称',
    rules: [v => !!v || '请输入名称']
  },
  {
    field: 'code',
    type: 'text',
    col: 4,
    label: '编号',
    attrs:{
      placeholder: '输入编号或由系统自动生成',
    }
  },
  {
    field: 'owner_name',
    col: 6,
    label: '业主单位',
    rules: [v => !!v || '请输入业主名称']
  },
  {
    field:'supervision_department_name',
    type: 'text',
    col: 6,
    label: '监理部',
    rules: [v => !!v || '请输入监理部名称']
  },
  {
    field: 'categories',
    type: 'autocomplete',
    col: 8,
    label: '分类',
    attrs: {
      placeholder: '输入名称搜索',
      multiple: true,
      returnObject: true,
      items:[]
    },
  },
  {
    field: 'category_id',
    type: 'autocomplete',
    col: 4,
    label: '主分类',
    attrs: {
      placeholder: '输入名称搜索',
      items:[]
    },
    rules: [v => !!v || '请选择项目类型']
  },
  // {
  //   field: 'phase_id',
  //   type: 'autocomplete',
  //   col: 3,
  //   label: '项目阶段',
  //   updateSearch:{
  //     apiUrl: 'phases',
  //     priorityKey:'id',
  //     params:{
  //     }
  //   },
  //   attrs: {
  //     placeholder: '输入名称搜索',
  //   },
  //   rules: [v => !!v || '请选择项目阶段']
  // },
  {
    field:'start_end_time',
    type: 'datetime',
    col: 6,
    label: '起止时间',
    attrs:{
      range:true
    },
    rules: [v => !!v || '请选择起止时间']
  },

  {
    field:'location',
    type: 'slot',
    col: 5,
    label: '项目地址',
    attrs:{

    },
    rules: [v => !!v || '请选择项目地址']
  },
  {
    field:'address.detail',
    type: 'text',
    col: 7,
    label: '详细地址',
    rules: [v => !!v || '请输入详细地址']
  },
  {
    field: 'state',
    type: 'select',
    col: 4,
    label: '状态',
    attrs: {
      items: [
        {id:1,name:'待启动'},
        {id:2,name:'进行中'},
        {id:3,name:'已结束'},
      ],
    },
    rules: [v => !!v || '请选择项目状态']
  },

  {
    field:'mileposts',
    type: 'slot',
  },
]);

const tableRef = ref(null)
const editingItem = ref({address:null})
const requestData  =computed(()=>{
  return {
    children_count:1,
    parent_id:0,
    unit_project_count:1,
    milepost_count:1
  };
})


function openOwner() {

}

function detailFormat(e) {
  e.start_end_time = [e.start_time,e.end_time]
  return e;
}

function saveFormat(e) {
  return {...e,start_time:e.start_end_time[0],end_time:e.start_end_time[1]}
}

async function getChildrenList(row) {
  try{
    const api = new Resource('projects')
    const {data} = await api.list({parent_id:row.id,children_count:1,per_page:'all',type:'rule'})
    return data
  }catch(e){
    console.log(e)
  }
}

async function getCategories(e = {}) {
  try{
    const api = new Resource('categories')
    const {data} = await api.list({per_page:'all'})
    setFieldAttrItems('categories',data)
    if(editingItem.value.categories) {
      setFieldAttrItems('category_id',editingItem.value.categories)
    }else{
      setFieldAttrItems('category_id',data)
    }

  }catch(e) {
    console.log(e)
  }
}

function setFieldAttrItems(fieldKey,items) {
  const index = fields.value.findIndex(v=>v.field === fieldKey)
  fields.value[index].attrs.items = items
}

function locationViewFormat(e){
  return e && e.province ? e.province + e.city + e.area + (e.town || '') : ''
}

watch(()=>editingItem.value?.address?.latitude,(newVal)=>{
  editingItem.value.location = newVal
  editingItem.value['address.detail'] = editingItem.value?.address.detail
})


watch(()=>editingItem.value?.categories,(newCategories)=>{
  if(newCategories) {
    setFieldAttrItems('category_id',newCategories)
    // 如果当前category_id有值且在newCategories中存在，则不更新
    const currentCategoryId = editingItem.value.category_id
    const existsInCategories = newCategories.some(c => c.id === currentCategoryId)
    if(!currentCategoryId || !existsInCategories) {
      editingItem.value.category_id = newCategories?.length > 0 ? newCategories[0].id : undefined
    }
  }
})

const dialogType = ref('')
const currentProject = ref(null)
function openMilepostDialog(project) {
  currentProject.value = project
  dialogType.value = 'milepost'
  tableRef.value.openDialog(currentProject.value.name+' 桩号','drawer')
}

function openDivisionDialog(project) {
  currentProject.value = project
  dialogType.value = 'division'
  tableRef.value.openDialog(currentProject.value.name+' 项目划分','drawer')
}

const statusColors = {
  1:'warning',
  2:'primary',
  3:'success',
}

onBeforeMount(()=>{
  getCategories()
})

</script>
<template>
  <div>
    <AppTable
      ref="tableRef"
      v-model="editingItem"
      :options="options"
      :filter-fields="filters"
      :fields="fields"
      api-url="projects"
      detail-open-type="drawer"
      create-open-type="drawer"
      :request-data="requestData"
      :detail-format="detailFormat"
      :save-format="saveFormat"
      list-scope="3"
    >
      <template #default_owner="{data:{row}}">
        <div @click="openOwner" class="text-primary">{{row.owner_name}}</div>
      </template>
      <template #default_state="{data:{row}}">
        <v-chip v-if="row.state_label" :color="statusColors[row.state]" size="small" label>{{row.state_label}}</v-chip>
      </template>

      <template #default_milepost="{data:{row}}">
        <v-chip color="primary" size="small" label @click="openMilepostDialog(row)">{{row.milepost_count}}</v-chip>
      </template>

      <template #default_unit_project="{data:{row}}">
        <v-chip color="primary" size="small" label @click="openDivisionDialog(row)">{{row.unit_project_count}}</v-chip>
      </template>

      <template #field_location>
        <AppChooseLoation v-model="editingItem.address" :view-format="locationViewFormat" label="项目位置"></AppChooseLoation>
      </template>

      <template
        v-if="editingItem.id"
        #field_mileposts
      >
        <v-card flat>
          <Milepost
            :project-id="editingItem.id"
            title="桩号"
          />
        </v-card>
      </template>

      <template #dialog-content>
        <div v-if="dialogType == 'milepost'">
          <Milepost
            :project-id="currentProject.id"
            title="桩号"
          />
        </div>
        <div v-if="dialogType == 'division'">
          <Division
            :project-id="currentProject.id"
            title="项目划分"
          />
        </div>
      </template>
    </AppTable>
  </div>
</template>

<style scoped>

</style>
