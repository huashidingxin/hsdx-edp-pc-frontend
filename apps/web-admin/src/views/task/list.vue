<script setup lang="ts">
import Resource from "@/api/resource";
import {useAppStore} from "@/store";
import {VChip, VListItem} from "vuetify/components";
import activityTable from '#/props/activityTable.js'
import teamUserTable from '#/props/teamUserTable.js'

const appStore = useAppStore()
const tableRef = ref(null)
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
    field: 'name',
    type: 'text',
    col: 3,
    label: '名称',
  },
]);

const fields = ref([
  {
    field: 'start_end_time',
    type: 'datetime',
    col: 6,
    label: '起止时间',
    attrs: {
      range: true
    },
    rules: [v => !!v || '请选择起止时间']
  },
  {
    field: 'executor_id',
    type: 'autocomplete',
    col: 3,
    label: '执行人',
    updateSearch: {
      apiUrl: 'project-users',
      params: {
        status: 1,
        project_id: appStore.defaultProject?.id
      }
    },
    attrs: {
      itemValue: 'user_id'
    },
    slots: [
      {
        name: 'chip',
        component: markRaw(VChip),
        bind: (e) => {
          return {
            ...e.props,
            prependAvatar: e.item.raw.user?.avatar,
            text: e.item.raw.staff?.staff_name || '',
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
            prependAvatar: e.item.raw.user?.avatar,
            title: e.item.raw.staff?.staff_name || '',
            subtitle: roles.join('、'),
          };
        },
      },
    ],
    rules: [v => !!v || '请选择执行人']
  },
  {
    field: 'measure_id',
    type: 'autocomplete',
    col: 3,
    label: '监理方式',
    updateSearch: {
      apiUrl: 'measures',
    },
    rules: [v => !!v || '请选择监理方式']
  },
  {
    field: 'activity_id',
    type: 'slot',
    col: 12,
    label: '活动',
  },

  {
    field: 'activities',
    type: 'slot'
  }

]);

const editingItem = ref({})

const $toast = inject('$toast')

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

const activityDialog = ref(false)
const activityMultipleDialog = ref(false)
const activityItemDialog = ref(false)
const activityReq = computed(() => {
  return {
    ...activityTable.requestData,
    plan_status: 1,
    plan_states: [1, 2],
    project_id: appStore.defaultProject?.id
  }
})

function activityConfirm(e) {
  editingItem.value.activity_id = e.id
}

const activityOptions = ref({
  columns: [
    {field: 'start_end_time', title: '起止时间', width: 400, headerClassName: 'required-field',slots:{header:'header_start_end_time'}},
    {
      field: 'executor_id',
      title: '执行人',
      width: 200,
      headerClassName: 'required-field',
      slots: {default: 'default_executor_id'}
    },
    {
      field: 'activity_id',
      title: '活动',
      width: 200,
      headerClassName: 'required-field',
      slots: {default: 'default_activity_id'}
    },
    {field: 'measure_id', title: '监理方式', width: 200, headerClassName: 'required-field'},
  ]
})

const activityFields = ref([
  {
    field: 'start_end_time',
    type: 'datetime',
    label: '起止时间',
    attrs: {
      range: true
    },
    rules: [v => !!v || '请选择起止时间']
  },
  {
    field: 'executor_id',
    type: 'autocomplete',
    label: '执行人',
    attrs: {
      items: [],
    },
    rules: [v => !!v || '请选择执行人']
  },
  {
    field: 'activity_id',
    type: 'autocomplete',
    label: '活动',
    attrs: {
      items: [],
      itemTitle: 'content'
    },
    rules: [v => !!v || '请选择活动人']
  },
  {
    field: 'measure_id',
    type: 'select',
    label: '监理方式',
    attrs: {
      items: [],
    },
    rules: [v => !!v || '请选择监理方式']
  },
])

function openDialog() {
  if (!editingItem.value.activities?.length) {
    addTaskItem()
  }

  tableRef.value.openDialog('任务指派', 'drawer')
}

function addTaskItem() {
  if (!editingItem.value.activities?.length) {
    editingItem.value.activities = [];
  }
  editingItem.value.activities.push({
    start_end_time: '',
    user_id: ''
  })
}

function activityMultipleConfirm(e) {
  editingItem.value.activities = [];
  e.forEach((activity) => {

    // if(!editingItem.value.activities?.length){
    //   editingItem.value.activities = [];
    // }
    editingItem.value.activities.push({
      start_end_time: '',
      user_id: '',
      activity_id: activity.id
    })
  })
}

async function getProjectUsers() {
  try {
    const api = new Resource('project-users')
    const {data} = await api.list({per_page: 'all', project_id: appStore.defaultProject?.id})
    activityFields.value.find(v => v.field === 'executor_id').attrs.items = data.map((e) => {
      return e.user
    })
  } catch (e) {
    console.log(e)
  }
}

async function getActivities() {
  try {
    const api = new Resource('activities')
    const {data} = await api.list({per_page: 'all', ...activityReq.value})
    activityFields.value.find(v => v.field === 'activity_id').attrs.items = data
  } catch (e) {
    console.log(e)
  }
}

async function getMeasures() {
  try {
    const api = new Resource('measures')
    const {data} = await api.list({per_page: 'all'})
    activityFields.value.find(v => v.field === 'measure_id').attrs.items = data
  } catch (e) {
    console.log(e)
  }
}

const listForm = ref(null)

async function submit() {
  if(!await listForm.value.validate()){
    return
  }
  try{
    const api = new Resource('tasks')
    const activities = editingItem.value.activities.map((e)=>{
      return {
        ...e,
        start_time:e.start_end_time[0],
        end_time:e.start_end_time[1],
      }
    })
    const {data} = await api.store({
      activities,
      project_id:appStore.defaultProject?.id,
    })
    $toast.success('提交成功');
    editingItem.value = {}
    tableRef.value.closeDialog()
    tableRef.value.reload()
  }catch(e) {
    console.log(e)
  }
}

const teamUserDialog = ref(false)
const teamUserReq = computed(()=>{
  return {
    project_id:appStore.defaultProject?.id
  }
})

function teamUsersConfirm(e) {
  editingItem.value.activities = [];
  e.forEach((teamUser) => {
    editingItem.value.activities.push({
      start_end_time: '',
      user_id: '',
      executor_id: teamUser.user_id
    })
  })
}

function showEdit(e) {
  return !e?.id || (e.status && e.state < 2)
}

function showDelete(e) {
  return e.state < 2
}

onBeforeMount(() => {
  getActivities()
  getProjectUsers()
  getMeasures()
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
    detail-open-type="modal"
    create-open-type="modal"
    api-url="tasks"
    :detail-format="detailFormat"
    :save-format="saveFormat"
    :list-scope="3"
    permission-name="task"
    :show-edit="showEdit"
    :show-delete="showDelete"
    :project-props="{filter:true,edit:true,editRequired:true}"
  >
    <template #right>
      <v-btn v-access:code="'create task'" v-if="appStore.defaultProject?.id" color="primary" variant="outlined" class="mr-2" @click="openDialog">批量新增</v-btn>
    </template>
    <template #default_user="{data:{row}}">
      <div class="d-flex align-center">
        <v-avatar :image="row.executor?.avatar" size="20" :rounded="8"></v-avatar>
        <div class="ms-2"> {{ row.executor?.staff?.staff_name }}</div>
      </div>
    </template>


    <template #default_submission_id="{data:{row}}">
      <v-chip v-if="row.submission_id" label color="primary" size="small"
              :href="'#/task-submissions/'+row.submission_id">{{ row.id }}
      </v-chip>
      <div v-else>-</div>
    </template>

    <template #field_activity_id>
      <v-text-field label="活动" :model-value="editingItem.activity?.content" class="required-field"
                    @click="activityDialog=true"></v-text-field>
      <AppTableSelect
        v-model:show="activityDialog"
        v-model="editingItem.activity"
        v-bind="activityTable"
        :request-data="activityReq"
        @confirm="activityConfirm"
        create-route-path="/activities/new"
        required
        :show-result="false"
      >

      </AppTableSelect>
    </template>

    <template #form_actions>
      <div v-if="editingItem.id && editingItem.status" v-access:code="['edit task']">
        <AppCancel type="task" @confirm="cancel"></AppCancel>
      </div>
    </template>
<!--    <template #field_activities v-if="!editingItem.id">-->
<!--      <AppList-->
<!--        v-model="editingItem.activities"-->
<!--        :options="activityOptions"-->
<!--        :fields="activityFields"-->
<!--        show-checkbox-->
<!--      >-->
<!--        <template #header-left>-->
<!--          <div class="card-title">批量指派任务</div>-->
<!--        </template>-->
<!--      </AppList>-->
<!--    </template>-->
    <template #dialog-content>
      <v-card flat>
        <v-card-text>
          <v-form ref="listForm">
            <AppList
              v-model="editingItem.activities"
              :options="activityOptions"
              :fields="activityFields"
              show-checkbox
            >
              <template #header-left>
                <div class="">任务列表</div>
              </template>
              <template #header-right>
                <v-btn color="primary" @click="activityMultipleDialog=true">按活动指派</v-btn>
                <v-btn color="success" class="ml-2" @click="teamUserDialog=true">按成员指派</v-btn>

                <AppTableSelect
                  v-model:show="activityMultipleDialog"
                  v-bind="activityTable"
                  :request-data="activityReq"
                  multiple
                  @confirm="activityMultipleConfirm"
                  :show-result="false"
                ></AppTableSelect>
                <AppTableSelect
                  v-model:show="teamUserDialog"
                  v-bind="teamUserTable"
                  :request-data="teamUserReq"
                  multiple
                  @confirm="teamUsersConfirm"
                  :show-result="false"
                ></AppTableSelect>
              </template>
              <template #header_start_end_time>
                <span >
                  起止时间
                </span>
              </template>
              <template #footer>
                <div class="mt-5 d-flex justify-center">
                  <v-btn variant="text" color="primary" @click="addTaskItem">+ 新增任务</v-btn>
                </div>
                <div class="my-5 text-right">
                  <v-btn color="primary" @click="submit">提交</v-btn>
                </div>
              </template>
            </AppList>
          </v-form>

        </v-card-text>
      </v-card>
    </template>
  </AppTable>

</template>

<style scoped>

</style>
