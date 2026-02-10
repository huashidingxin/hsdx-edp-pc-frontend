<script setup>
import {nextTick, ref, computed, inject, watch} from 'vue';
import Resource from "@/api/resource.js";
import {useAppStore} from "@/store/index.js";

import SubmissionEdit from "#/views/submission/edit.vue";
import {VChip,VListItem} from "vuetify/components";
import {cloneDeep} from "lodash";
import {useUserStore} from "@vben/stores";
const $loader = inject('$loader');
const $confirm = inject('$confirm')
const $toast = inject('$toast');

const userStore = useUserStore();
const props = defineProps({
  type: {
    default: 'task',
    type: String
  }
})

const appStore = useAppStore()

// 表格配置
const options = ref({
  rowConfig: {
    keyField: 'id'
  },
  checkboxConfig: {
    reserve: true
  },
  columns: [
    {
      field: 'submission.code',
      title: '编号',
      width: 200,
      slots: {default: 'default_submission_code'}
    },
    {field: 'measure.name', title: '监理方式', width: 200,},
    {field: 'procedure.name', title: '工序', width: 200,},
    {field: 'form.name', title: '名称', width: 200,},
    {field: 'executor.name', title: '执行人', width: 100,},
    {field: 'state_label', title: '任务状态', width: 100,},
    {field: 'submission.state_label', title: '记录状态', width: 100,},
    {field: 'submission_timeout', title: '超时', width: 100, slots: {default: 'default_submission_timeout'}},
    {field: 'date', title: '日期', width: 200,sortable:true},
    {field: 'start_time', title: '开始时间', width: 200},
    {field: 'end_time', title: '结束时间', width: 200,},
    {field: 'created_at', title: '创建时间', width: 200,},
  ],
  data: []
});

// 过滤条件
const filters = ref([
  {
    field: 'code',
    type: 'text',
    col: 2,
    label: '编号',
  },
  {
    field: 'executor_id',
    type: 'autocomplete',
    col: 2,
    label: '执行人',
    attrs:{
      items:[]
    },
    slots: [
      {
        name: 'chip',
        component: markRaw(VChip),
        bind: (e) => {
          return {
            ...e.props,
            prependAvatar: e.item.raw?.avatar,
            text: e.item.raw?.name || '',
          };
        },
      },
      {
        name: 'item',
        component: markRaw(VListItem),
        bind: (e) => {
          return {
            ...e.props,
            prependAvatar: e.item.raw?.avatar || '',
            text: e.item.raw?.name,
            subtitle: e.item.raw.id,
          };
        },
      },
    ],

  },
  {
    field: 'procedure_id',
    type: 'autocomplete',
    col: 2,
    label: '工序',
    attrs:{items:[]}
  },
  {
    field: 'measure_id',
    type: 'autocomplete',
    col: 2,
    label: '监理方式',
    updateSearch:{
      apiUrl:'measures'
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
    col: 2,
    label: '提交状态',
    default:1,
    attrs:{
      items:[
        {id:0,name:'待提交'},
        {id:1,name:'已提交'},
      ],
    }
  },
  {
    field: 'submission_timeout',
    type: 'select',
    col: 2,
    label: '超时状态',
    attrs: {
      items: [
        {id: 0, name: '正常'},
        {id: 1, name: '超时'},
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

const tableRef = ref(null);
const withSignature = ref(false);
const selectedRows = ref([]);
const selectRows = ref([]);

const requestData = computed(() => ({
  object_type: props.type,
  project_id: appStore.defaultProject?.id,
  with_signature: withSignature.value ? 1 : 0,
}));



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


function clickOpen(e) {
  return e.submission_id > 0
}

function showView(e) {
  return e.submission_id > 0
}


function listFormat(e) {
  return e.map((v) => {
    return {
      ...v,
      id: v.submission_id
    }
  })
}


const doc = computed(() => {
  return {
    url: editingItem.value.submission.file_path,
    title: '任务记录'
  }
})

async function getProcedures() {
  try{
    const api = new Resource('procedures')
    const {data} = await api.list({per_page:'all',project_id:appStore.defaultProject?.id})
    filters.value.find(v=>v.field === 'procedure_id').attrs.items = data
  }catch(e) {
    console.log(e)
  }
}
async function loadProjectUsers() {
  try{
    const api = new Resource('project-users')
    const {data} = await api.list({per_page:'all',project_id:appStore.defaultProject?.id})
    filters.value.find(v=>v.field === 'executor_id').attrs.items = data.map((e)=>{return {...e.user}})
  }catch(e) {
    console.log(e)
  }
}

function showEdit(e) {
  return e.submission?.state != 2 && e.executor_id == userStore.userInfo?.id && e.state > 1
}

const isEdit = ref(false)
function showDetail(_isEdit) {
  isEdit.value = _isEdit;
}
function showAudit(e) {
  return e.submission_id > 0 && !e.submission.audit_id
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
const nonconformanceDialog = ref(false)
const nonconformanceForm = ref(null)
const nonconformanceFields = ref([])
const nonconformanceEditing = ref({})

async function paperChange(e) {
  const confirm = await $confirm('切换日志类型，已填写数据将被清空，确定要切换？')
  if(!confirm){
    return
  }
  if(editingItem.value.submission){
    editingItem.value.submission = {}
  }
  isPaper.value = e
}
function detailFormat(e) {
  defaultValues.value = cloneDeep(e.submission.values)
  isPaper.value = e.submission?.form_id == 1
  return e
}

function reset() {
  editingItem.value.submission.values = cloneDeep(defaultValues.value)
}
async function save() {
  const formData = await submissionRef.value.getFormData()
  console.log('formData=',formData)

  if(!formData.validated){
    $toast.error('请检查表单')
    return
  }

  if(Object.values(formData.warnings||{}).length > 0){
    if(!nonconformanceDialog.value || !nonconformanceForm.value){
      setNonconformanceFields(formData.warnings)
      nonconformanceDialog.value = true
      return
    }

    if(!await nonconformanceForm.value.validate()){
      nonconformanceDialog.value = true
      $toast.error('请检查表单')
      return false
    }
    for(let i in nonconformanceForm.value.fieldRef){
      if(typeof nonconformanceForm.value.fieldRef[i].fieldRef.upload === 'function'){
        const ret = await nonconformanceForm.value.fieldRef[i].fieldRef.upload()
        console.log(ret)
        //console.log(nonconformanceEditing.value)
      }
    }
  }

  nonconformanceDialog.value = false
  try{
    const api = new Resource('task-submissions')
    const {data} = await api.store({
      task_id:editingItem.value.id,
      form_id:isPaper.value ? 1 : editingItem.value.form_id,
      ...formData,
      nonconformances:nonconformanceEditing.value
    })
    $toast.success('保存成功')
    tableRef.value.reload()
  }catch(e) {
    console.log(e)
  }
}
function setNonconformanceFields(warnings) {
  nonconformanceFields.value = [];
  for (let i in warnings) {
    const field = submissionRef.value.formFields.find(v=>'_'+v.id == i)

    let tips = '';
    if(field.type == 'switch'){
      //console.log('field@@@@',field)
      const options = field.options || ['是','否']
      tips = '检查结果：'+(options[warnings[i][0].value == 1 ? 0 : 1]) +'(要求：' +warnings[i][0].message+')'
    }else{
      const _values = warnings[i].map((e)=>{
        return '检查结果：'+(e.value || '未填写')+','+e.message
      })
      tips = _values.join(';')
    }

    nonconformanceFields.value.push({
      field: '_'+field.id,
      label: field.name,
      type: 'file',
      default:[],
      attrs: {
        fileType:'image',
        multiple:true,

      },
      slots:[
        {
          name:'default',
          content:tips,
          bind:()=>{
            return {
              class:'text-error'
            }
          }
        }
      ],
      required: field.failed_proof,
      rules: field.failed_proof ? [v => !!v && v.length > 0 || '请上传图片/视频'] : [],
    })
  }
}
async function mediaChange(field) {
  if(nonconformanceEditing.value[field.field]){
    const confirm = await $confirm('清除已上传内容?')
    if(!confirm){
      return
    }
    nonconformanceEditing.value[field.field] = undefined
    field.attrs.fileType = ['video','image'][field.attrs.fileType=='video' ? 1 : 0]
  }else{
    field.attrs.fileType = ['video','image'][field.attrs.fileType=='video' ? 1 : 0]
  }
}
onBeforeMount(()=>{
  loadProjectUsers()
  getProcedures()
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
      api-url="task-submissions"

      :list-scope="3"
      :show-edit="showEdit"
      :show-delete="false"
      :show-view="showView"
      :click-open="clickOpen"
      :show-actions="true"
      :show-create="false"
      show-checkbox
      :detail-format="detailFormat"
      @show-detail="showDetail"
      :show-audit="showAudit"
      audit-type="submission"
      permission-name="task_log_submission"
      audit-key="submission_id"
      :project-props="{filter:true}"
    >
      <template #right>
        <v-checkbox v-model="withSignature" label="打印/导出包含签名" color="primary" hide-details class="mr-2"></v-checkbox>
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
        <v-list-item v-if="data.state == 1 && !data.submission_id && data.executor_id == userStore.userInfo?.id" @click="$toast.warning('请先签到')">
          <v-list-item-title >编辑</v-list-item-title>
        </v-list-item>
        <v-list-item v-if="data.submission_id > 0" @click="preview(data)">
          <v-list-item-title >预览</v-list-item-title>
        </v-list-item>
      </template>
      <template #default_submission_code="{data:{row}}">
        <v-chip v-if="row.submission_id" size="small" label color="primary" @click="preview(row)">{{row.submission?.code}}</v-chip>
        <div v-else>-</div>
      </template>

      <template #default_submission_timeout="{data:{row}}">
        <v-chip :color="row.submission_timeout ? 'error' : 'primary'" size="small">
          {{ row.submission_timeout ? '超时' : '正常' }}
        </v-chip>
      </template>

      <template #dialog-content>
        <AppOffice
          :document="mergeDoc"
          :plugins="plugins"
          callback-url="https://dev2.cpzhongzhou.com/api/v1/mock-save"
          :customization="documentCustomization"
        ></AppOffice>
      </template>


      <template #field_content>
        <div v-if="editingItem.id" style="height: calc(100vh - 70px)">
          <AppOffice
            v-if="(isPreview)"
            :document="doc"
            :plugins="plugins"
            callback-url="https://dev2.cpzhongzhou.com/api/v1/mock-save"
            :customization="documentCustomization"
            style="height: 90vh"
          ></AppOffice>

          <div v-else  class="d-flex flex-column justify-center align-center">
            <div class="w-100">
              <div v-if="!editingItem.submission_id || editingItem.submission?.state != 2" class="flex align-center py-2">
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
                :values="editingItem.submission.values"
              >
              </SubmissionEdit>
            </div>
          </div>
        </div>

      </template>

      <template #form_actions>
        <v-spacer />
        <v-btn color="warning" variant="tonal" @click="reset">重置</v-btn>
        <v-btn color="primary" variant="elevated" @click="save">提交</v-btn>
      </template>
    </AppTable>

    <v-dialog v-model="nonconformanceDialog" max-width="800" persistent>
      <v-card>
        <v-card-title class="d-flex justify-space-between align-center">
          不符合项
          <v-btn icon @click="nonconformanceDialog=false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text style="max-height:90vh;overflow-y:auto">
          <app-form ref="nonconformanceForm" v-model="nonconformanceEditing" :fields="nonconformanceFields" bottom-height="0">
<!--            <template v-for="(item,index) in nonconformanceFields" :key="index" #[item.field+'_top']>-->
<!--            <view class="mt-5 mb-3" @click="mediaChange(item)">-->
<!--              <view class="flex align-center text-caption">-->
<!--                <view class="px-2 rounded-s" :class="item.attrs.fileType=='image' ? 'bg-primary' : 'bg-primary-light'">图片</view>-->
<!--                <view class="px-2 rounded-e" :class="item.attrs.fileType=='video' ? 'bg-primary' : 'bg-primary-light'">视频</view>-->
<!--              </view>-->
<!--            </view>-->
<!--          </template>-->
          </app-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" variant="elevated" @click="save">提交</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>

</style>
