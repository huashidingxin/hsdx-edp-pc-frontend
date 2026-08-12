<script setup lang="ts">

import {useUserStore} from "@vben/stores";
import Resource from "@/api/resource";
import {VChip, VListItem} from "vuetify/components";
import {useAppStore} from '@/store'

const $confirm = inject('$confirm')
const $toast = inject('$toast')

const appStore = useAppStore()
const userStore = useUserStore()
const options = ref({
  columns:[
    {field:'user.name',title:'姓名',width:120,fixed:'left'},
    {field:'user.avatar',title:'照片',width:200,customRender:{type:'image'}},
    {field:'user.mobile',title:'手机号',width:200},
    {field:'project.name',title:'项目',minWidth:200},
    {field:'joining_date',title:'加入时间',width:200},
    {field:'roles',title:'角色',width:200,slots:{default:'default_roles'}},
    {field:'status',title:'状态',width:200,slots:{default:'default_status'}},
    {field:'created_at',title:'创建时间',width:200},
  ],
  data:[]
});
const fields = ref([
  {
    field: 'staff_section',
    type: 'slot',
    col: 12,
  },
  {
    field: 'users',
    type: 'autocomplete',
    col: 12,
    label: '请选择成员',
    attrs:{
      itemTitle:'name',
      multiple:true,
      returnObject:true,
      closableChips:true
    },
    slots: [
      {
        name: 'chip',
        component: markRaw(VChip),
        bind: (e: any) => {
          return {
            ...e.props,
            prependAvatar: e.item.raw.avatar,
            text: e.item.raw.name || '',
          };
        },
      },
      {
        name: 'item',
        component: markRaw(VListItem),
        bind: (e: any) => {
          return {
            ...e.props,
            prependAvatar: e.item.raw.avatar,
            text: e.item.raw.name,
            // subtitle: e.item.raw.remarks,
          };
        },
      },
    ],
  },
  {
    field: 'user_list',
    type: 'slot',
    col: 12,
  },
  {
    field: 'roles',
    type: 'autocomplete',
    col: 6,
    label: '角色',
    // updateSearch:{
    //   apiUrl:'roles',
    //   params:{
    //     type:'project'
    //   }
    // },
    attrs:{
      multiple:true
    },
    rules:[v=>!!v || '请选择角色']
  },
  {
    field: 'joining_date',
    type: 'datetime',
    col: 6,
    label: '加入时间',
    attrs:{
      onlyDate:true
    },
    rules:[v=>!!v || '请选择加入时间']
  },
]);
const filters = ref([
  {
    field:'name',
    type: 'text',
    col: 3,
    label: '姓名',
  },
  {
    field:'mobile',
    type: 'text',
    col: 3,
    label: '手机号',
  },
  {
    field:'statuses',
    type: 'select',
    col: 3,
    label: '状态',
    attrs:{
      items:[
        {id:1,name:'在岗'},
        {id:2,name:'请假'},
        {id:3,name:'借调'},
        {id:4,name:'撤离'},
      ],
      multiple:true
    }
  },
]);

const tableRef = ref(null)
const editingItem = ref({})

const requestData = computed(() => ({
  project_id: appStore.defaultProject?.id
}));

const leaveFields = ref([
  {
    field:'type',
    label:'类型',
    type:'select',
    attrs:{
      items:[
        {id:1,name:'请假'},
        {id:2,name:'借调'},
        {id:3,name:'撤离'},
      ]
    },
    rules:[v=>!!v || '类型不能为空']
  },
  {
    field:'start_time',
    label:'开始时间',
    type:'datetime',
    rules:[v=>!!v || '请选择开始时间'],
    attrs:{

    }
  },
  {
    field:'end_time',
    label:'结束时间',
    type:'datetime',
    rules:[v=>!!v || '请选择结束时间'],
    attrs:{

    }
  },
  {
    field:'reason',
    label:'离岗原因',
    type:'text',
    rules:[v=>!!v || '离岗原因不能为空']
  }
])

const formattedLeaveFields = computed(()=>{
  if(leaveData.value.type < 3) {
    return leaveFields.value
  }
  return leaveFields.value.filter(v=>v.field !== 'end_time')
})

const leaveForm = ref(null)
const leaveData = ref({})
const currentItem = ref(null)
async function toggleLeave(e) {
  currentItem.value = e

  if(e.leave?.status == 'active') {

    const confirm = await $confirm('确定要撤销本次离岗？预计离岗时间：'+(e.leave.start_time).replace('.000000','')+'~'+(e.leave.end_time ? (e.leave.end_time).replace('.000000','') : '长期'))

    if(confirm) {
      const api = new Resource('project-leaves/'+e.leave.id+'/cancel')
      const {data} = await api.store()

      $toast.success('撤销成功')

      tableRef.value.refresh()
    }

  }else{
    leaveData.value = {}
    dialogType.value = 'level'
    tableRef.value.openDialog('成员撤离')
  }

}
async function leaveSubmit() {
  // const confirm = await $confirm('确定要撤离'+currentItem.value.staff.staff_name+'?')
  // if(!confirm){
  //   return
  // }
  const {valid} = await leaveForm.value.validate()
  if(!valid){
    return
  }
  try{
    const api = new Resource('project-users/'+currentItem.value.id+'/leave')
    const {data} = await api.store({user_id:currentItem.value.user_id,...leaveData.value})
    $toast.success('操作成功');
    tableRef.value.closeDialog()
    leaveData.value = {}
    tableRef.value.reload()
  }catch(e) {
    console.log(e)
  }
}


const excludeFields = computed(()=>{
  if(!editingItem.value?.id){
    return ['roles','joining_date']
  }
  return ['users','user_list']
})

const dialogType = ref('level')

const projectUsers = ref([])

watch(()=>editingItem.value?.project_id,async (newProjectId)=>{
  if(newProjectId){
    const users = await getProjectUsers(newProjectId)
    editingItem.value.users = users.map((e)=>{
      return {
        ...e.user,
        user:e.user,
        joining_date:e.joining_date,
        roles:e.roles,
        leave:e.leave
      }
    })
  }
})


async function getProjectUsers(projectId) {
  try{
    const api = new Resource('project-users')
    const {data} = await api.list({project_id:projectId,per_page:'all',statuses:[1,2,3]})
    return data
  }catch(e) {
    console.log(e)
  }
}

const userOptions = ref({
  columns:[
    {field:'name',title:'成员',width:120},
    // {field:'status',title:'状态',slots:{default:'default_status'}},
    {field:'roles',title:'角色',minWidth: 300},
    {field:'joining_date',title:'加入时间',width: 300},
  ],
});


async function getRoles() {
  try{
    const api = new Resource('roles')
    const {data} = await api.list({type:'project'})
    fields.value.find(v=>v.field === 'roles').attrs.items = data
  }catch(e) {
    console.log(e)
  }
}

async function getStaffs() {
  try{
    const api = new Resource('staff')
    const {data} = await api.list({per_page:'all'})
    fields.value.find(v=>v.field === 'users').attrs.items = data
  }catch(e) {
    console.log(e)
  }
}

function showDetail() {
  if(appStore.defaultProject?.id){
    editingItem.value = {}
    editingItem.value.project_id = appStore.defaultProject.id
  }
}
function dialogChange(status) {
  if(!status) {
    editingItem.value = {}
  }
}

onBeforeMount(()=>{
  getRoles()
  getStaffs()
})
</script>

<template>
  <AppTable
    ref="tableRef"
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    api-url="project-users"
    :fields="fields"
    :show-create="true"
    :request-data="requestData"
    :list-scope="3"
    :show-delete="false"
    :project-props="{edit:true,filter:true,editRequired:true}"
    :exclude-fields="excludeFields"
    permission-name="project_user"
    create-open-type="drawer"
    @show-detail="showDetail"
    @dialog-change="dialogChange"
  >
    <template #action="{data}">
      <v-list-item v-access:code="['project_user.edit']" v-if="userStore.userInfo.id != data.user_id || true" @click="toggleLeave(data)">
        <v-list-item-title>{{data.leave?.status == 'active' ? '撤销离岗' : ' 离岗'}}</v-list-item-title>
      </v-list-item>
    </template>
    <template  #field_staff_section>
      <v-alert v-if="editingItem?.id > 0">
        <div>{{editingItem.user?.name}}</div>
        <div>{{editingItem.user?.email}}</div>
        <div>{{editingItem.user?.mobile}}</div>
      </v-alert>
    </template>
    <template #field_user_list>
      <AppList
        v-model="editingItem.users"
        :options="userOptions"
        :fields="fields"
        show-checkbox
      >
        <template #header-left>
          成员明细
        </template>
        <template #default_status="{row}">
          <v-chip :color="row.leave?.status === 'active' ? 'error' : 'success'" size="small" label>{{row.leave?.status === 'active' ? row.leave.type_label : '在岗'}}</v-chip>
        </template>
      </AppList>
    </template>
    <template #default_roles="{data:{row}}">
      <div v-if="row.roles?.length" class="d-flex">
        <div v-for="(item,index) in row.roles" :key="index" class="me-2">{{item.name}}</div>
      </div>
    </template>
    <template #default_status="{data:{row}}">
      <v-chip :color="row.leave?.status === 'active' ? 'error' : 'success'" size="small" label>{{row.leave?.status === 'active' ? row.leave.type_label : '在岗'}}</v-chip>
    </template>
    <template #dialog-content>
      <v-card v-if="dialogType == 'level'" class="pa-3">
        <v-form ref="leaveForm">
          <v-row>
            <v-col cols="12" v-for="(item,index) in formattedLeaveFields" :key="index">
              <AppField v-model="leaveData[item.field]" :field="item"></AppField>
            </v-col>
          </v-row>
        </v-form>
        <v-card-actions class="justify-end">
          <v-btn color="primary" @click="leaveSubmit">提交</v-btn>
          <v-btn @click="tableRef.closeDialog()">取消</v-btn>
        </v-card-actions>
      </v-card>

      <v-card v-else>

      </v-card>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
