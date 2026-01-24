<script setup lang="ts">
import {validName,validEmail,validIdCard,validMobile} from '#/utils/validate.js'
import Resource from "@/api/resource";
import {useRouter} from "vue-router";

const $toast = inject('$toast')
const $confirm = inject('$confirm')
const $router = useRouter()

const options = ref({
  columns:[
    {field:'realname.name',title:'姓名',width:200,fixed:'left'},
    {field:'user.username',title:'账号'},
    {field:'mobile',title:'手机号'},
    {field:'email',title:'Email'},
    {field:'audit.status',title:'状态',slots:{default:'audit_status_default'}},
    {field:'created_at',title:'申请时间'},
  ],
  data:[]
});
const fields = ref([

  {
    field: 'realname.name',
    type: 'text',
    col: 2,
    label: '姓名',
    rules: [v => !!v && validName(v) || '请输入姓名']
  },

  {
    field: 'realname.idcard',
    type: 'text',
    col: 4,
    label: '身份证号码',
    rules: [v => !v || validIdCard(v) || '身份证号码不正确'],
  },
  {
    field: 'mobile',
    type: 'text',
    col: 3,
    label: '手机号',
    rules: [v => !v || validMobile(v) || '手机号码不正确'],
  },
  {
    field: 'email',
    type: 'text',
    col: 3,
    label: 'Email',
    rules: [v => !v || validEmail(v) || 'Email不正确'],
  },
  {
    field: 'user.avatar',
    type: 'file',
    col: 12,
    label: '头像',
    rules: [v => !!v || '请上传头像']
  },
  {
    field: 'user.id_photo',
    type: 'file',
    col: 12,
    label: '人脸照片',
    rules: [v => !!v || '请上传人脸照片']
  },
  {
    field: 'audit_section',
    type: 'slot',
    col: 12,
    label: '审核信息',
  },

]);
const filters = ref([
  {
    field:'name',
    type: 'text',
    col: 3,
    label: '名称',
  },
]);

const pageRef = ref(null)
const editingItem = ref({})

const auditEditing = ref({})
const auditDialog = ref(false)
function openAuditDialog() {
  auditDialog.value = true
}

async function auditSubmit() {
  if(auditEditing.value.state == 3 && !auditEditing.value.audit_reason){
    $toast.error('请输入不通过原因');
    return
  }

  try{
    const api = new Resource('staff-applications/'+editingItem.value.id+'/audit')
    const {data} = await api.store(auditEditing.value);

    $toast.success('审核成功');
    auditDialog.value = false
    if(data.staff_id){
      if(await $confirm('去设置该员工信息？')){
        $router.replace('/staff/'+data.staff_id+'/edit')
      }
    }
  }catch(e){
    console.log(e)
  }
}

</script>

<template>
  <div>
    <AppTable
      ref="pageRef"
      v-model="editingItem"
      :options="options"
      :filter-fields="filters"
      api-url="staff-applications"
      :fields="fields"
      :list-scope="3"
      :actions="['filter','actions']"
      permission-name="staff_application"
      audit-type="staff_application"
    >
      <template #audit_status_default="{data:{row}}">
        <div>
          <div v-if="row.audit_id">
            <v-icon :color="row.audit.status ? 'success' : 'error'">{{row.audit.status ? 'mdi-check' : 'mdi-close'}}</v-icon>
          </div>
          <div v-else>待审核</div>
        </div>
      </template>
      <template #field_audit_section v-if="editingItem.audit_id >0">
        <div>
          <div class="font-weight-bold mb-3">审核信息</div>
          <v-alert>
            <div>{{!editingItem.audit.status ? '审核不通过' : '审核通过'}}</div>
            <div class="my-1 text-error">{{editingItem.audit.reason}}</div>
            <div>{{editingItem.audit.audit_time}}</div>
          </v-alert>
        </div>
      </template>
      <template #form_actions>
        <v-btn v-if="!editingItem.audit_id" color="primary" variant="flat" @click="openAuditDialog">审核</v-btn>
      </template>
    </AppTable>

    <v-dialog v-model="auditDialog" max-width='500px'>
      <v-card flat>
        <v-card-title class="d-flex justify-between align-center movable">
          员工申请审核
          <v-btn icon="mdi-close" @click="auditDialog=false"></v-btn>
        </v-card-title>
        <v-card-text>
          <v-switch v-model="auditEditing.status" label="状态" :true-value="1" :false-value="0" color="primary"></v-switch>
          <v-text-field v-model="auditEditing.reason" label="审核意见" :rules="!auditEditing.status ? [v=>!!v || '请输入不通过原因'] : []"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="flat" @click="auditDialog=false">取消</v-btn>
          <v-btn color="primary" variant="flat" @click="auditSubmit">确定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>

</template>

<style scoped>

</style>
