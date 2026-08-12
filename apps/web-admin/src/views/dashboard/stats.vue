<script setup lang="ts">
const options = ref({
  columns: [],
  data: []
});
const fields = ref([
  {
    field: 'department_id',
    type: 'autocomplete',
    col: 4,
    label: '部门',
    updateSearch: {
      apiUrl: 'departments',
      params: {}
    },
    attrs: {},
  },
  {
    field: 'name',
    type: 'text',
    col: 8,
    label: '名称',
    rules: [v => !!v || '请输入名称']
  },
  {
    field: 'remarks',
    type: 'textarea',
    col: 12,
    label: '备注',
  },

]);
const filters = ref([
  {
    field: 'date_range',
    type: 'datetime',
    col: 4,
    label: '时间',
    attrs: {
      onlyDate: true,
      range: true,
    },
  }
]);
const tableRef = ref(null);
const editingItem = ref({})
const types = ref([
  {
    value: 'supervision_log',
    title: '监理日志',
    columns: [
      {field: 'project.name', title: '项目', minwidth: 150, fixed: 'left'},
      {field: 'total', title: '应提交数', width: 150,sortable:true},
      {field: 'normal_log', title: '正常提交数', width: 150,sortable:true},
      {field: 'timeout_log', title: '超时提交数', width: 150,sortable:true},
      {field: 'timeout_no_log', title: '超时未提交数', width: 150,sortable:true,slots:{default: 'default_timeout_no_log'}},
    ]
  },
  {
    value: 'task', title: '任务',
    columns: [
      {field: 'project.name', title: '项目', minwidth: 150, fixed: 'left'},
      {field: 'total', title: '任务数', width: 150,sortable:true},
      {field: 'normal_log', title: '正常提交数', width: 150,sortable:true},
      {field: 'timeout_log', title: '超时提交数', width: 150,sortable:true},
      {field: 'timeout_no_log', title: '超时未提交数', width: 150,sortable:true,slots:{default: 'default_timeout_no_log'}},
    ]
  },
  {
    value: 'nonconformance', title: '不符合项',
    columns: [
      {field: 'project.name', title: '项目', minwidth: 150, fixed: 'left'},
      {field: 'total', title: '总数', width: 150},
      {field: 'pending', title: '待处理', width: 150},
      {field: 'processing', title: '处理中', width: 150},
      {field: 'completed', title: '已完成', width: 150},
      {field: 'completed_in_7_days', title: '7日内完成', width: 150},
      {
        field: 'completed_in_7_days_rate',
        title: '7日闭合率',
        width: 150,
        slots: {default: 'completed_in_7_days_rate'}
      },
    ]
  },
  {
    value: 'issue', title: '问题',
    columns: [
      {field: 'project.name', title: '项目', minwidth: 150, fixed: 'left'},
      {field: 'total', title: '总数', width: 150},
      {field: 'processing', title: '处理中', width: 150},
      {field: 'completed', title: '已完成', width: 150},
    ]
  }
])
const projectProps = ref({
  filter: true
})
const requestData = ref({
  type: 'supervision_log'
})

const lastUpdateTime = ref((new Date()).toLocaleString())
function updateList() {
  lastUpdateTime.value = (new Date()).toLocaleString()
}

watch(() => requestData.value.type, (newType) => {
  options.value.columns = types.value.find(item => item.value === requestData.value.type)?.columns || []
  if(!['supervision_log','task'].includes(newType)) {
    filters.value.find(v=>v.field==='date_range').attrs.onlyDate = false
  }
  tableRef.value?.reload()
}, {immediate: true})
</script>

<template>
  <AppTable
    ref="tableRef"
    :key="requestData.type"
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    api-url="stats/projects"
    create-open-type="modal"
    detail-open-type="modal"
    :request-data="requestData"
    :fields="fields"
    :project-props="projectProps"
    :show-actions="false"
    :show-create="false"
    show-export
    :click-open="false"
    @update:list="updateList"
  >
    <template #right>
      <div class="d-flex align-center">
        <div class="me-2 pe-2 text-primary text-body-2 border-e">
          数据截止时间：{{ lastUpdateTime }}
        </div>
        <v-tabs color="primary" v-model="requestData.type">
          <v-tab v-for="(item,index) in types" :key="index" :value="item.value">{{ item.title }}
          </v-tab>
        </v-tabs>
      </div>

    </template>

    <template #default_timeout_no_log="{data:{row}}">
      <div :class="{'text-error': row.timeout_no_log > 0}">
        {{ row.timeout_no_log }}
      </div>
    </template>

    <template #completed_in_7_days_rate="{data:{row}}">
      <div>
        {{ Math.round((row.completed_in_7_days/row.total) * 100 ,2) }}%
      </div>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
