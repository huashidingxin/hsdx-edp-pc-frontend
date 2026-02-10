<script setup lang="ts">
import Resource from "@/api/resource";
import {useAppStore} from "@/store";
import {VChip, VListItem} from "vuetify/components";
import {useAccess} from "@vben/access";
import {useUserStore} from "@vben/stores";
const { hasAccessByCodes,hasAccessByRoles } = useAccess();


const appStore = useAppStore()
const userStore = useUserStore()

const tableRef = ref(null)

const editingItem = ref({})

const $toast = inject('$toast')
const stateRender = {
  name: 'CellRender',
  render: ({row}) => {
    const colors = {1: '', 2: 'primary', 3: 'success', 4: 'warning'}
    return h(VChip, {
      text: !row.status ? '已取消' : row.state_label,
      color: !row.status ? 'error' : colors[row.state],
      label: true,
      size: 'small'
    })
  },
}
const options = ref({
  columns: [
    {field: 'date', title: '日期', fixed: 'left', width: 200,},
    {field: 'user', title: '执行人', width: 200, slots: {default: 'default_user'}},
    {field: 'creator.name', title: '指派人', width: 200,},
    {field: 'state_label', title: '状态', width: 200, cellRender: stateRender},
    {field: 'project.name', title: '项目', minWidth: 200,},
    {field: 'content', title: '内容', width: 200},
    {field: 'measure.name', title: '监理方式', width: 100},
    {field: 'attendance_in.check_time', title: '签到时间', width: 150},
    {field: 'attendance_out.check_time', title: '签退时间', width: 150},
    {field: 'submission_id', title: '日志', width: 200, slots: {default: 'default_submission_id'}},
    {field: 'created_at', title: '创建时间', width: 200,},
  ],
  data: []
});
const filters = ref([
  {
    field: 'measure_id',
    type: 'select',
    col: 3,
    label: '监理方式',
    updateSearch: {
      apiUrl: 'measures',
    },
    attrs:{}
  },
  {
    field: 'procedure_id',
    type: 'select',
    col: 3,
    label: '工序',
    updateSearch: {
      apiUrl: 'procedures',
    },
    attrs:{}
  },
  {
    field: 'executor_id',
    type: 'autocomplete',
    col: 3,
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
]);

const fields = ref([
  {
    field: 'start_end_time',
    type: 'datetime',
    col: 8,
    label: '起止时间',
    attrs: {
      range: true
    },
    rules: [v => !!v || '请选择起止时间']
  },
  {
    field: 'stakeholder_id',
    type: 'select',
    col: 4,
    label: '相关单位',
    attrs: {
      create: {
        url:'/stakeholders/new',
        permission:'stakeholder.create'
      },
      async refresh(){
        await loadStakeholders()
        $toast.success('数据已更新')
      }
    },
    rules: [v => !!v || '请选择单位']
  },
  {
    field: 'unit_project_id',
    type: 'tree-select',
    col: 4,
    label: '单位工程',
    attrs:{
      treeProps:{
        selectStrategy:'single-independent'
      },
      create: {
        url:'/divisions/new',
        permission:'division.create'
      },
      async refresh(){
        await loadDivisions()
        $toast.success('数据已更新')
      }
    },
    rules: [v => !!v || '请选择单位工程']
  },
  {
    field: 'procedure_id',
    type: 'autocomplete',
    col: 4,
    label: '工序',
    attrs: {

    },
    rules: [v => !!v || '请选择工序']
  },
  {
    field: 'measure_id',
    type: 'autocomplete',
    col: 4,
    label: '监理方式',
    attrs:{},
    rules: [v => !!v || '请选择监理方式']
  },
  {
    field: 'executors',
    type: 'autocomplete',
    col: 12,
    label: '执行人',
    attrs: {
      multiple:true,
      returnObject:true,
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
          const roles = e.item.raw.roles?.map((v) => {
            return v.name
          }) || []
          return {
            ...e.props,
            prependAvatar: e.item.raw?.avatar,
            title: e.item.raw?.name || '',
            subtitle: roles.join('、'),
          };
        },
      },
    ],
    rules: [v => !!v || '请选择执行人']
  },
  {
    field: 'executor_id',
    type: 'autocomplete',
    col: 12,
    label: '执行人',
    attrs: {

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
          const roles = e.item.raw.roles?.map((v) => {
            return v.name
          }) || []
          return {
            ...e.props,
            prependAvatar: e.item.raw?.avatar,
            title: e.item.raw?.name || '',
            subtitle: roles.join('、'),
          };
        },
      },
    ],
    rules: [v => !!v || '请选择执行人']
  },
  {
    field: 'mileposts',
    type: 'autocomplete',
    col: 12,
    label: '桩号/地点',
    attrs:{
      multiple:true,
      returnObject:true,
      create: {
        url:'/mileposts/new',
        permission:'milepost.create'
      },
      async refresh(){
        await loadMileposts()
        $toast.success('数据已更新')
      }
    },
    rules: [v => !!v || '请选择桩号/地点']
  },
  {
    field: 'content',
    type: 'textarea',
    col: 12,
    label: '任务内容',
    attrs:{},
  },
  {
    field: 'form',
    type: 'slot',
    col: 12,
  },
]);



async function cancel(e) {
  try {
    const api = new Resource('tasks/' + editingItem.value.id + '/cancel')
    const {data} = await api.store(e)
    editingItem.value = data
    $toast.success('取消成功');
  } catch (e) {
    console.log(e)
  }
}

const requestData = computed(() => ({
  project_id: appStore.defaultProject?.id
}));


function detailFormat(e) {
  if (e?.start_time) {
    e.start_end_time = [e.start_time, e.end_time]
  }
  return e
}

function saveFormat(e) {
  return {
    ...e,
    start_time: e.start_end_time[0],
    end_time: e.start_end_time[1],
    project_id: appStore.defaultProject?.id
  }
}

function showEdit(e) {
  return !e?.id || (e.status && e.state < 2)
}

function showDelete(e) {
  return e.state < 2
}

const currentProject = ref(appStore.defaultProject)
const projectCategories = ref([])
function projectChange(e) {
  updateProject(e)
  currentProject.value = e

}

async function loadProject(projectId) {
  try{
    const api = new Resource('projects')
    const {data} = await api.get(projectId)
    currentProject.value = data
  }catch(e){
    console.log(e)
  }
}

async function updateProject(project) {
  if(project.categories){
    projectCategories.value = project.categories.map(v=>v.id)
  }else{
    projectCategories.value = [project.category_id]
  }

  try {
    await Promise.all([
      loadProcedures(),
      loadStakeholders(),
      loadDivisions(),
      loadExecutors(),
      loadMileposts()
    ])
  } catch (e) {
    console.error('加载项目数据失败:', e)
  }
}

async function loadProcedures() {
  try{
    const {data} = await new Resource('procedures').list({
      categories: projectCategories.value,
      per_page:'all'
    })
    fields.value.find(v=>v.field==='procedure_id').attrs.items = data
  }catch(e) {
    console.log(e)
  }

}

async function loadStakeholders() {
  try{
    const {data} = await new Resource('stakeholders').list({
      project_id: currentProject.value.id,
      per_page:'all'
    })
    fields.value.find(v=>v.field==='stakeholder_id').attrs.items = data
  }catch(e) {
    console.log(e)
  }
}

async function loadDivisions() {
  try{
    const {data} = await new Resource('divisions').list({
      project_id: currentProject.value.id,
      levels:[1,2],
      per_page:'all'
    })
    fields.value.find(v=>v.field==='unit_project_id').attrs.items = data
  }catch(e) {
    console.log(e)
  }
}


const procedureForms = ref({})
async function loadProcedureForms(procedureId) {
  try{
    const api = new Resource('procedure-forms')
    const {data} = await api.list({
      procedure_id:procedureId,
      project_id:currentProject.value?.id,
    })

    procedureForms.value = {}
    let isValid = false
    for(let i in data) {
      procedureForms.value[data[i].measure_id] = data[i]
      if(editingItem.value.measure_id == data[i].measure_id) {
        isValid = true
      }
    }
    if(!isValid) {
      editingItem.value.measure_id = undefined
    }
    const validMeasures = measures.value.filter((e)=>{
      return procedureForms.value[e.id]
    })

    fields.value.find(v=>v.field === 'measure_id').attrs.items = validMeasures


  }catch(e) {
    console.log(e)
  }
}

const measures = ref([])
async function loadMeasures() {
  try{
    const api = new Resource('measures')
    const {data} = await api.list({
      project_id:currentProject.value?.id,
      procedure_id:editingItem.value.procedure_id,
      per_page:'all'
    })
    measures.value = data
    fields.value.find(v=>v.field == 'measure_id').attrs.items = data
  }catch(e) {
    console.log(e)
  }
}
async function loadMileposts() {
  try{
    const api = new Resource('mileposts')
    const {data} = await api.list({
      project_id:currentProject.value?.id,
      per_page:'all'
    })
    fields.value.find(v=>v.field == 'mileposts').attrs.items = data
  }catch(e) {
    console.log(e)
  }
}

async function loadExecutors() {
  try{
    const api = new Resource('project-users')
    const {data} = await api.list({
      project_id:currentProject.value.id,
      per_page:'all'
    })
    // task.assign
    const users = data.map((e)=>{
      const roles = e.roles?.map((v)=>{return v.name}) || []
      return {
        ...e.user,
        prependIcon:e.user.avatar,
        subtitle:roles.join('、')
      }
    })

    const executorKey = editingItem.value.id ? 'executor_id' : 'executors'
    fields.value.find(v=>v.field == executorKey).attrs.items = hasAccessByCodes(['task.assign']) ? users : users.filter((e)=>{return e.user_id == userStore.userInfo.id})
  }catch(e) {
    console.log(e)
  }
}

async function updateModelValue(e) {
  if(!e?.id) {
    return
  }
  await loadProject(e.project_id)
  updateProject(currentProject.value)
}

watch(()=>editingItem.value.procedure_id,async (newProcedureId)=>{
  loadProcedureForms(newProcedureId)
})

onBeforeMount(()=>{
  updateProject(appStore.defaultProject)
  loadMeasures()
})


</script>
<template>
  <AppTable
    ref="tableRef"
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    :fields="fields"
    :request-data="requestData"
    detail-open-type="drawer"
    create-open-type="drawer"
    api-url="tasks"
    :detail-format="detailFormat"
    :save-format="saveFormat"
    :list-scope="3"
    permission-name="task"
    :show-edit="showEdit"
    :show-delete="showDelete"
    :project-props="{filter:true,edit:true,editRequired:true}"
    @project-change="projectChange"
    @update:model-value="updateModelValue"
    :exclude-fields="editingItem.id ? ['executors'] : ['executor_id']"
  >
    <template #default_user="{data:{row}}">
      <div class="d-flex align-center">
        <v-avatar :image="row.executor?.avatar" size="20" :rounded="8"></v-avatar>
        <div class="ms-2"> {{ row.executor?.name }}</div>
      </div>
    </template>


    <template #default_submission_id="{data:{row}}">
      <v-chip v-if="row.submission_id" label color="primary" size="small"
              :href="'#/task-submissions/'+row.submission_id">{{ row.id }}
      </v-chip>
      <div v-else>-</div>
    </template>
    <template #form_action>
      <div v-if="editingItem.id && editingItem.status" v-access:code="['task.edit']">
        <AppCancel type="task" @confirm="cancel"></AppCancel>
      </div>
    </template>

    <template #field_form>
      <div v-if="editingItem.measure_id" :class="!procedureForms[editingItem.measure_id] ? 'text-error' : ''">
        任务表单：{{procedureForms[editingItem.measure_id]?.form?.name || '未配置该监理方式的表单'}}
      </div>
    </template>
  </AppTable>

</template>

<style scoped>

</style>
