<script setup lang="ts">
import {validName,validEmail,validIdCard,validMobile,validUsername} from '#/utils/validate.js'
import Resource from "@/api/resource";
const $toast = inject('$toast')
const $confirm = inject('$confirm')
const options = ref({
  columns:[
    {field:'name',title:'姓名',width:200,fixed:'left'},
    {field:'avatar',title:'头像',customRender:{type:'image'}},
    {field:'username',title:'账号'},
    {field:'mobile',title:'手机号'},
    {field:'email',title:'Email'},
    {field:'department.name',title:'部门'},
    {field:'position.name',title:'职位'},
    {field:'state_label',title:'状态',slots:{default:'default_state'}},
  ],
  data:[]
});
const fields = ref([
  // {
  //   field: 'user_section',
  //   type: 'slot',
  //   col: 12,
  // },
  {
    field: 'username',
    type: 'text',
    col: 3,
    label: '用户名',
    rules: [v => !v || validUsername(v) || '请输入用户名']
  },
  {
    field: 'password',
    type: 'password',
    col: 3,
    label: '密码',
    rules: [v => !v || v.length >= 8 || '密码需大于8位']
  },
  {
    field: 'roles',
    type: 'autocomplete',
    col: 6,
    label: '全局角色',
    updateSearch:{
      apiUrl:'roles',
      params:{
        type:'system'
      }
    },
    attrs:{
      itemTitle:'display_name',
      multiple:true
    }
  },
  {
    field: 'name',
    type: 'text',
    col: 4,
    label: '姓名',
    rules: [v => !!v && validName(v) || '请输入姓名']
  },
  {
    field:'mobile',
    type: 'text',
    col: 4,
    label: '手机号',
    rules: [v => !!v && validMobile(v) || '手机号格式不正确']
  },
  {
    field: 'email',
    type: 'text',
    col: 4,
    label: 'Email',
  },
  {
    field: 'avatar',
    type: 'file',
    col: 12,
    label: '头像',
    rules: [v => !!v || '请上传头像']
  },
  {
    field: 'id_photo',
    type: 'file',
    col: 12,
    label: '面部照片',
    rules: [v => !!v || '请上传面部照片']
  },
  // {
  //   field: 'staff_section',
  //   type: 'slot',
  //   col: 12,
  // },

  {
    field: 'code',
    type: 'text',
    col: 3,
    label: '工号',
  },

  // {
  //   field: 'department_id',
  //   type: 'select',
  //   col: 4,
  //   label: '部门',
  //   rules: [v => !!v || '请选择部门'],
  //   updateSearch:{
  //     apiUrl:'departments'
  //   },
  //   attrs:{
  //
  //   },
  // },
  {
    field: 'position_id',
    type: 'slot',
    col: 3,
    label: '职位',
    // required:true,
    // rules: [v => !!v && v.length > 0 || '请选择职位'],
    updateSearch:{
      apiUrl:'positions',
      params:{
        per_page:'all'
      }
    },
  },
  // {
  //   field: 'idcard',
  //   type: 'text',
  //   label: '身份证号',
  //   col: 4,
  //   rules: [v => !v || validIdCard(v) || '请输入正确的身份证号码'],
  // },

  {
    field: 'joining_date',
    type: 'datetime',
    col: 3,
    label: '入职时间',
    attrs:{
      onlyDate:true
    }
  },
  {
    field: 'state',
    type: 'select',
    col: 3,
    label: '状态',
    attrs:{
      itemProps:true,
      items:[{id:1,name:'试用',disabled:true},{id:2,name:'正式'},{id:3,name:'离职'}]
    }
  },
  // {
  //   field: 'confirmation_date',
  //   type: 'datetime',
  //   col: 3,
  //   label: '转正时间',
  //   attrs:{
  //     onlyDate:true
  //   }
  // },
  // {
  //   field: 'leave_date',
  //   type: 'datetime',
  //   col: 3,
  //   label: '离职时间',
  //   attrs:{
  //     onlyDate:true
  //   }
  // },

]);
const filters = ref([
  {
    field:'id',
    type: 'text',
    col: 3,
    label: 'ID',
  },
  {
    field:'name',
    type: 'text',
    col: 3,
    label: '姓名',
  },
  {
    field:'username',
    type: 'text',
    col: 3,
    label: '用户名',
  },
  {
    field: 'mobile',
    type: 'text',
    col: 3,
    label: '手机号',
  },
  {
    field: 'email',
    type: 'text',
    col: 3,
    label: 'Email',
  },
  {
    field: 'states',
    type: 'select',
    col: 3,
    label: '状态',
    attrs:{
      multiple:true,
      items:[{id: 1, name: '试用'},{id:2,name:'正式'},{id:3,name:'离职'}]
    }
  },
  {
    field: 'department_id',
    type: 'select',
    col: 4,
    label: '部门',
    updateSearch:{
      apiUrl:'departments'
    },
    attrs:{

    },
  },
]);

const tableRef = ref(null)
const editingItem = ref({})

const stateColors = {
  1:'#ffc107',
  2:'#28a745',
  3:'#dc3545'
}

watch(()=>editingItem.value.department_id,(newVal)=>{
  if(newVal){
    setTimeout(()=>{
      const fieldIndex = fields.value.findIndex(v=>v.field === 'position_id')
      tableRef.value.fieldRef[fieldIndex].filter((attrsItems)=>{
        const items = attrsItems.filter((e)=>{
          return e.department_id == newVal
        })
        if(!items?.length || !(items.find(v=>v.id == editingItem.value.position_id))){
          editingItem.value.position_id = undefined
        }
        return items
      })
    },500)
  }
})

const positionItems = ref([])
async function  getPositions() {
  try{
    const api = new Resource('positions')
    const {data} = await api.list({per_page:'all'})
    positionItems.value = data

  }catch(e) {
    console.log(e)
  }
}

async function batchResign() {
  if(!await $confirm('确定要设置选中的【'+selected.value.length+'】员工为离职状态？')){
    return
  }
  try{
    const api = new Resource('batch-resign')
    const {data} = await api.store({list:selected.value.map(v=>v.id)})
    $toast.success('操作成功')
    tableRef.value.refresh()

    selected.value = []
  }catch(e) {
    console.log(e)
  }
}

async function resign(item) {
  if(!await $confirm('确定要设置【'+item.staff_name+'】为离职状态？')){
    return
  }
  try{
    const api = new Resource('staff/'+item.id+'/resign')
    const {data} = await api.store()
    $toast.success('操作成功')
  }catch(e) {
    console.log(e)
  }
}
const selected= ref([])
// function updateSelected(e) {
//   selected.value = e
// }

onBeforeMount(()=>{
  getPositions()
})
</script>

<template>
  <AppTable
    ref="tableRef"
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    api-url="staff"
    :fields="fields"
    detail-open-type="modal"
    show-checkbox
    v-model:selected="selected"
  >
    <template #field_user_section>
      <div>
        <div class="mb-2 font-weight-bold">登陆信息</div>
        <v-divider color="grey" opacity="100"></v-divider>
      </div>
    </template>
    <template #field_staff_section>
      <div>
        <div class="mb-2 font-weight-bold">员工信息</div>
        <v-divider color="grey" opacity="100"></v-divider>
      </div>
    </template>
    <template #default_state="{data:{row}}">
      <v-chip v-if="row.state" :color="stateColors[row.state]">
        {{row.state_label}}
      </v-chip>
    </template>
    <template #right>
      <div class="mr-2">
        <v-btn variant="outlined" color="primary" :disabled="!selected.length" @click="batchResign">批量离职</v-btn>
      </div>
    </template>
    <template #action="{data}">

      <v-list-item v-access="['staff.delete']" v-if="data.state != 3" @click="resign(data)">
        <v-list-item-title>离职</v-list-item-title>
      </v-list-item>
    </template>
    <template #field_position_id>
      <div class="">
        <v-autocomplete v-model="editingItem.position_id" label="职位" :items="positionItems" item-title="name" item-value="id" clearable :rules="[v=>!!v || '请选择职位']">
          <template v-slot:item="{ props, item }">
            <v-list-item
              v-bind="props"
              :subtitle="item.raw.department?.name"
              :title="item.raw.name"
            ></v-list-item>
          </template>
        </v-autocomplete>
      </div>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
