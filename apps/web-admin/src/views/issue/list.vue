<script setup lang="ts">
import IssueNonconfomance from '../nonconformance/list.vue'
import {useAppStore} from "@/store";
import nonconformanceTable from '#/props/nonconformanceTable.js'
import {VChip} from "vuetify/components";

const appStore = useAppStore()
const stateRender = {
  name:'CellRender',
  render:({row})=>{
    const colors = {0:'',1:'warning',2:'primary',3:'success'}
    return h(VChip,{
      text:row.state_desc,
      color:colors[row.state],
      label:true,
      size:'small'
    })
  },
}
const options = ref({
  columns: [
    {field: 'code', title: '编号', fixed: 'left', width: 200},
    {field: 'stakeholder.name', title: '相关方',  minWidth: 200},
    {field: 'description', title: '问题描述',minWidth:200},
    {field: 'deadline', title: '期限',width:200},
    {field: 'state_label', title: '状态',cellRender:stateRender,width:100},
    {field: 'created_at', title: '创建时间',width:200},
  ],
  data: []
});
const filters = ref([
  {
    field: 'code',
    type: 'text',
    col: 3,
    label: '编号',
  },
  {
    field: 'states',
    type: 'select',
    col: 3,
    label: '状态',
    attrs:{
      items:[
        {id:2,name:'处理中'},
        {id:3,name:'已完成'},
      ]
    }
  },
]);

const fields = ref([
  {
    field: 'nonconformances',
    type: 'slot',
    col: 12,
    label: '不符合项',
    rules:[v=>v?.length>0 || '请选择不符合项']
  },
  {
    field: 'code',
    type: 'text',
    col: 4,
    label: '问题编号',
    attrs:{
      placeholder:'输入编号或系统自动生成'
    }
  },
  {
    field: 'deadline',
    type: 'datetime',
    col: 4,
    label: '整改期限',
    rules:[v=>!!v || '请输入整改要求'],
  },
  {
    field: 'level_id',
    type: 'select',
    col: 4,
    label: '问题级别',
    updateSearch: {
      apiUrl: 'issue-levels'
    },
    rules:[v=>!!v || '请选择级别']
  },
  {
    field: 'description',
    type: 'textarea',
    col: 12,
    label: '问题描述',
    rules:[v=>!!v || '请输入问题描述']
  },
  {
    field: 'requirement',
    type: 'textarea',
    col: 12,
    label: '整改要求',
    rules:[v=>!!v || '请输入整改要求']
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
]);

const tableRef = ref(null);
const editingItem = ref({})

const $toast = inject('$toast')
const requestData = computed(() => ({
  project_id: appStore.defaultProject?.id
}));

const excludeFields = computed(()=>{
  return editingItem.value.id ? ['nonconformances'] : []
})

const nonconformanceDialog = ref(false)
const nonconformanceReq = computed(() => {
  return {
    ...nonconformanceTable.requrestData,
    project_id: appStore.defaultProject?.id,
    state: 1
  }
})

const nonconformances = ref([])
function nonconformanceConfirm(e) {
  nonconformances.value = e
  // editingItem.value.nonconformances = e;
  editingItem.value.nonconformances = e
}

function saveFormat(e) {
  return {...e,project_id:appStore.defaultProject.id}
}
</script>
<template>
  <AppTable
    ref="tableRef"
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    :fields="fields"
    :request-data="requestData"
    api-url="issues"
    create-open-type="drawer"
    permission-name="issue"
    :exclude-fields="excludeFields"
    :save-format="saveFormat"
    :project-props="{filter:true}"
  >
    <template #field_nonconformances>
      <AppTableSelect
        v-model:show="nonconformanceDialog"
        v-model="nonconformances"
        v-bind="nonconformanceTable"
        :request-data="nonconformanceReq"
        multiple
        @confirm="nonconformanceConfirm"
      ></AppTableSelect>
    </template>
    <template v-if="editingItem.id > 0" #form_default>
      <div class="mt-2">
        <IssueNonconfomance :issue-id="editingItem.id" title="不符合项列表"></IssueNonconfomance>
      </div>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
