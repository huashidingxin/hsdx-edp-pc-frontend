<script setup>
import Resource from "@/api/resource.js";
import {nextTick, ref, computed, inject, watch} from 'vue';
import SubmissionEdit from '../submission/edit.vue'
import {VChip} from "vuetify/components";
import {router} from "@/router/index.js";
import {cloneDeep} from "lodash";
import {useUserStore} from "@vben/stores";
import {useAppStore} from "@/store/app.js";

const $loader = inject('$loader');
const appStore = useAppStore()

const $confirm = inject('$confirm')
const userStore = useUserStore();
const stateRender = {
  name:'CellRender',
  render:({row})=>{
    if(!row.submission){
      return '待提交';
    }
    const colors = {1:'primary',2:'success',3:'error',4:''}
    return h(VChip,{
      text:row.submission.state_label,
      color:colors[row.submission.state],
      label:true,
      size:'small'
    })
  },
}

const props = defineProps({
  type: {
    default: 'diary',
    type: String
  }
})

// 表格配置
const options = ref({
  rowConfig: {
    keyField: 'id'
  },
  checkboxConfig: {
    reserve: true
  },
  columns: [
    {field: 'submission.code', title: '编号',width:200,slots:{default:'default_submission_code'}},
    {field: 'date', title: '日期',width:200,sortable:true},
    {field: 'user.name', title: '记录人',width:200},
    {field: 'submission.state_desc', title: '记录状态',width:200,cellRender:stateRender},
    {field: 'submission.created_at', title: '记录时间',width:200},
    {field: 'project.name', title: '项目',minWidth:300},
    {field: 'submission_timeout', title: '超时',width:200,slots:{default:'default_submission_timeout'}},
    // {field: 'created_at', title: '创建时间',minWidth:200},
  ],
  data: []
});

// 过滤条件
const filters = ref([
  {
    field: 'submission_code',
    type: 'text',
    col: 3,
    label: '编号',
  },
  {
    field: 'user_id',
    type: 'autocomplete',
    col: 3,
    label: '记录人',
    attrs:{
      items:[]
    }
  },
  {
    field: 'date_range',
    type: 'datetime',
    col: 3,
    label: '日期',
    attrs:{
      onlyDate:true,
      range:true,
      inputProps:{clearable:true}
    }
  },
  {
    field: 'submission_status',
    type: 'select',
    col: 3,
    label: '提交状态',
    default:appStore.defaultProject?.id > 0 ? undefined : 1,
    attrs:{
      items:[
        {id:0,name:'待提交'},
        {id:1,name:'已提交'},
      ],
    }
  },
  {
    field: 'submission_states',
    type: 'select',
    col: 3,
    label: '审核状态',
    attrs:{
      items:[
        {id:1,name:'待审核'},
        {id:2,name:'审核通过'},
        {id:3,name:'审核不通过'},
      ],
      multiple: true
    }
  },
  {
    field: 'submission_timeouts',
    type: 'select',
    col: 3,
    label: '超时状态',
    attrs:{
      items:[
        {id:0,name:'正常'},
        {id:1,name:'超时'},
      ],
      multiple:true
    }
  },
]);

// 表单字段
const fields = ref([
  {
    field: 'content',
    type: 'slot',
    col: 12,
    label: '内容',
  },
]);

const editingItem = ref({});
const $toast = inject('$toast');
const tableRef = ref(null);
const withSignature = ref(false);
const selectedRows = ref([]);
const selectRows = ref([]);

const requestData = computed(() => ({
  project_id:appStore.defaultProject?.id,
  with_signature: withSignature.value ? 1 : 0,
}));


function showView(e) {
  return e.submission_id > 0
}
const doc = computed(() => {
  if(!editingItem.value.submission?.file_path){
    return {}
  }
  const key = editingItem.value.submission.file_path.split('/').pop().split('?').shift()
  return {
    url: editingItem.value.submission?.file_path,
    key:'submission_'+key,
    title: '任务记录',
    fileType: 'docx',
  }
})



const plugins = computed(() => {
  // return {
  //   autostart: ['asc.tools'],
  //   options: {
  //     "asc.tools": {
  //       signatureStatus: false,
  //     },
  //   },
  // }
})
const mergeDoc = ref({})
// 批量打印
async function batch(isExport=false) {
  let canRenders = []
  selectRows.value.forEach((e)=>{
    if(e.submission_id){
      canRenders.push(e.submission_id)
    }
  })
  if(!canRenders.length){
    $toast.error('请至少选择一条已提交的记录');
    return
  }
  const loader = $loader.show('处理中，请稍侯');
  try {

    const api = new Resource('submission',{timeout:60000})
    const {data} = await api.get('batch',{
      merge:isExport ? 1 : 0,
      signature:withSignature.value ? 1: 0,
      list:selectRows.value.map((e)=>{return e.submission_id}).join(',')
    })
    if(!isExport){
      mergeDoc.value = data;
      tableRef.value.openDialog(data.name,'drawer')
    }else{
      const link = window.document.createElement('a');
      link.href = data.url;
      link.setAttribute('download', data.name);
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      $toast.success('下载成功');
    }

  }catch (e){
    console.log(e)
  }
  loader.close()
}

async function getTeamUsers(projectId=null) {
  try{
    const api = new Resource('project-users')
    const {data} = await api.list({per_page:'all',project_id:projectId || appStore.defaultProject?.id})
    filters.value.find(v=>v.field === 'user_id').attrs.items = data.map((e)=>{return {...e.user}})
  }catch(e) {
    console.log(e)
  }
}

const isEdit = ref(false)
function showDetail(_isEdit) {
  isEdit.value = _isEdit;
}

function dialogChange(status) {
  if(!status){
    isPreview.value = false
    isEdit.value = false
  }
}

function showAudit(e) {
  return e.submission_id > 0 && e.submission.state < 2
}

function showEdit(e) {
  return (!e.submission_id || !e.submission || e.submission.state < 2) && e.user_id == userStore.userInfo?.id
}
const isPreview = ref(false)
function preview(row) {
  tableRef.value.openDetail(row.id)
  isPreview.value = true
}

const documentCustomization = {
  autosave:false,
  forcesave:false
}
const submissionRef = ref(null)

const defaultValues = ref({})

const isPaper = ref(false)
async function paperChange(e) {
  const confirm = await $confirm('切换日志类型，已填写数据将被清空，确定要切换？')
  if(!confirm){
    return
  }
  if(editingItem.value.submission){
    editingItem.value.submission = null
  }
  isPaper.value = e
}
function detailFormat(e) {
  defaultValues.value = e.submission?.values || {}
  isPaper.value = e.submission?.form_id == appStore.setting.paper_form_id
  return e
}
async function saveFormat(e) {
  const values = await submissionRef.value.getFormData()
  //console.log(values)
  editingItem.value = values
  return false
}

function reset() {
  editingItem.value.submission.values = cloneDeep(defaultValues.value)
}
async function save() {
  const formData = await submissionRef.value.getFormData()
  if(!formData.validated){
    $toast.error('请检查表单')
    return
  }
  try{
    const api = new Resource('supervision-logs')
    const {data} = await api.update(editingItem.value.id,{
      form_id:isPaper.value ? appStore.setting?.paper_form_id : editingItem.value.form_id,
      ...formData
    })
    $toast.success('提交成功')
    tableRef.value.reload()
  }catch(e) {
    console.log(e)
  }
}

function projectChange(e) {
  getTeamUsers(e?.id)
}


onBeforeMount(()=>{
  getTeamUsers()
})

</script>

<template>
  <div>
    <AppTable
      ref="tableRef"
      v-model="editingItem"
      v-model:selected="selectRows"
      :options="options"
      :filter-fields="filters"
      :fields="fields"
      :request-data="requestData"
      detail-open-type="drawer"
      create-open-type="page"
      api-url="supervision-logs"
      :list-scope="3"
      :show-edit="showEdit"
      :show-view="showView"
      :show-delete="false"
      :show-create="false"
      show-checkbox
      @show-detail="showDetail"
      @dialog-change="dialogChange"
      :detail-format="detailFormat"
      :save-format="saveFormat"
      :show-audit="showAudit"
      audit-type="submission"
      permission-name="supervision_log"
      audit-permission-name="supervision_log_submission"
      audit-key="submission_id"
      :exclude-filters="excludeFilters"
      :project-props="{filter:true}"
      @project-change="projectChange"
    >
      <template #right>
<!--        <v-checkbox v-model="withSignature" label="打印/导出包含签名" color="primary" hide-details class="mr-2"></v-checkbox>-->
        <div class="me-2">
          <v-btn
            color="warning"
            variant="outlined"
            :disabled="!selectRows.length"
            @click="batch(true)"
          >
            批量导出
          </v-btn>
        </div>
        <div class="me-2">
          <v-btn
            color="primary"
            variant="outlined"
            :disabled="!selectRows.length"
            @click="batch(false)"
          >
            批量打印
          </v-btn>
        </div>
      </template>

      <template #action="{data}">
        <v-list-item v-if="data.submission_id > 0" @click="preview(data)">
          <v-list-item-title >预览</v-list-item-title>
        </v-list-item>
      </template>

      <template #default_submission_code="{data:{row}}">
        <v-chip v-if="row.submission_id" size="small" label color="primary" @click="preview(row)">{{row.submission?.code}}</v-chip>
        <div v-else>-</div>
      </template>

      <template #default_state_desc="{data:{row}}"></template>

      <template #default_submission_timeout="{data:{row}}">
        <v-chip :color="row.submission_timeout ? 'error' : 'primary'" size="small">
          {{ row.submission_timeout ? '超时' : '正常' }}
        </v-chip>
      </template>

      <template #dialog-content>
        <AppOffice
          :document="mergeDoc"
          :plugins="plugins"
          callback-url="https://www.cpzhongzhou.com/api/v1/mock-save"
          :customization="documentCustomization"
        ></AppOffice>
      </template>

      <template #field_content>
        <div v-if="editingItem.id" style="height: calc(100vh - 70px)">
          <AppOffice
            v-if="(isPreview)"
            :document="doc"
            :plugins="plugins"
            callback-url="https://www.cpzhongzhou.com/api/v1/mock-save"
            :customization="documentCustomization"
            style="height: 90vh"
          ></AppOffice>

          <div v-else  class="d-flex flex-column justify-center align-center">
            <div class="w-100">
              <div v-if="editingItem.form_id != 1 && (!editingItem.submission_id || editingItem.submission?.state != 2)" class="flex align-center py-2">
                <v-switch :model-value="isPaper" label="上传纸质版图片"  @update:modelValue="paperChange" size="18" color="primary"></v-switch>

              </div>
              <SubmissionEdit
                v-if="!isPaper"
                ref='submissionRef'
                :form-id="editingItem.form_id || editingItem.submission.form_id"
                :project-id="editingItem.project_id"
                :values="editingItem.submission?.values"
              ></SubmissionEdit>
              <SubmissionEdit
                v-else
                ref="submissionRef"
                v-model="editingItem.values"
                :form-id="1"
                :project-id="editingItem.project_id"
                :values="editingItem.submission?.values"
              >
              </SubmissionEdit>
            </div>
          </div>
        </div>

      </template>

      <template v-if="isEdit" #form_actions>
        <v-spacer />
        <v-btn color="warning" variant="tonal" @click="reset">重置</v-btn>
        <v-btn color="primary" variant="elevated" @click="save">提交</v-btn>
      </template>
    </AppTable>
  </div>
</template>

<style scoped>

</style>
