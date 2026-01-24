<script setup lang="ts">
import {useProjectStore} from "@/store/project";
import {VChip} from "vuetify/components";
const projectStore = useProjectStore()
const stateRender = {
  name:'CellRender',
  render:({row})=>{
    const colors = {1:'primary',2:'success',3:'error'}
    return h(VChip,{
      text:row.state_desc,
      color:colors[row.state],
      label:true,
      size:'small'
    })
  },
}
const options = ref({
  columns:[
    {field:'staff.staff_name',title:'姓名',width:200,fixed:'left'},
    {field:'staff.staff_mobile',title:'手机号',width:200},
    {field:'reason',title:'原因',minWidth:200},
    {field:'state_desc',title:'状态',width:200,cellRender:stateRender},
    {field:'created_at',title:'创建时间',width:200},
  ],
  data:[]
});
const fields = ref([
  {
    field: 'reason',
    type: 'text',
    col: 12,
  },
  {
    field: 'audit',
    type: 'slot',
    col: 12,
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

const requestData = computed(() => ({
  project_id: projectStore.current?.id
}));

function showAudit(e) {
  return e.id > 0 && !e.audit_id
}
</script>

<template>
  <AppTable
    ref="pageRef"
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    api-url="team-joins"
    :fields="fields"
    :show-create="false"
    :request-data="requestData"
    :click-open="false"
    :show-edit="false"
    :show-delete="false"
    :show-audit="showAudit"
    audit-type="team_join"
    :project-props="{filter:true}"
  >
    <template  #form_description>
      <div v-if="editingItem.id > 0">
        <div>{{editingItem.staff.staff_name}}</div>
        <div>{{editingItem.staff.staff_email}}</div>
        <div>{{editingItem.staff.staff_mobile}}</div>
      </div>
    </template>
    <template #field_audit v-if="editingItem.audit_id >0">
      <div>
        <div class="font-weight-bold mb-3">审核信息</div>
        <v-alert color="primary" variant="tonal">
          <div>{{!editingItem.audit.status ? '审核不通过' : '审核通过'}}</div>
          <div class="my-1 text-error">{{editingItem.audit.reason}}</div>
          <div>{{editingItem.audit.audit_time}}</div>
        </v-alert>
      </div>
    </template>
    <!--    <template #default_roles="{data:{row}}">-->
    <!--      <div v-if="row.roles?.length" class="d-flex">-->
    <!--        <div v-for="(item,index) in row.roles" :key="index" class="me-2">{{item.name}}</div>-->
    <!--      </div>-->
    <!--    </template>-->
  </AppTable>
</template>

<style scoped>

</style>
