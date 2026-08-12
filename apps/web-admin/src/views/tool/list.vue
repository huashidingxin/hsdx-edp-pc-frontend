<script setup lang="ts">
import Maintenance from '../maintenance/list'
const options = ref({
  columns:[
    {field:'name',title:'名称',fixed:'left',width:'300px'},
    {field:'code',title:'编号'},
    {field:'project.name',title:'项目'},
    {field:'category.name',title:'分类'},
    {field:'state_label',title:'状态'},
    {field:'calibration_days',title:'检定周期'},
    {field:'last_calibration_time',title:'最后检定时间'},
    {field:'created_at',title:'创建时间'},
  ],
  data:[]
});
const filters = ref([
  {
    field:'name',
    type: 'text',
    col: 3,
    label: '名称',
  },
  {
    field:'states',
    type: 'select',
    col: 3,
    label: '状态',
    attrs:{
      multiple:true,
      items:[
        {id:1,name:'正常'},
        {id:2,name:'待检定'},
        {id:3,name:'损坏'},
        {id:4,name:'报废'},
      ]
    }
  },
]);
const fields = ref([
  {
    field:'name',
    type: 'text',
    col: 4,
    label: '名称',
    rules:[v=>!!v || '请输入名称']
  },
  {
    field:'code',
    type: 'text',
    col: 4,
    label: '编号',
    rules:[v=>!!v || '请输入编号']
  },
  {
    field:'category_id',
    type: 'autocomplete',
    col: 4,
    label: '分类',
    updateSearch:{
      apiUrl:'categories',
      params:{
        type:'tool'
      }
    },
    rules:[v=>!!v || '请选择分类']
  },
  {
    field:'calibration_days',
    type: 'number',
    col: 4,
    label: '检定周期',
    attrs:{
      suffix:'天'
    },
    rules:[v=>!!v || '请输入检定周期']
  },
  {
    field:'state',
    type: 'select',
    col: 4,
    label: '状态',
    default:1,
    attrs:{
      items:[
        {id:1,name:'正常'},
        {id:2,name:'待检'},
        {id:3,name:'报废'},
      ]
    }
  },
]);

const editingItem = ref({})
</script>
<template>
  <AppTable
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    :fields="fields"
    detail-open-type="page"
    api-url="tools"
    :project-props="{filter:true}"
  >
    <template v-if="editingItem.id" #form_default>
      <div class="mt-2">
        <Maintenance maintenance-type="tool" :maintenance-id="editingItem.id"></Maintenance>
      </div>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
