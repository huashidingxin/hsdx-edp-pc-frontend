<script setup lang="ts">
const props = defineProps({
  maintenanceType:{
    default:undefined,
    type:String
  },
  maintenanceId:{
    default:undefined,
    type:String
  },
})
const options = ref({
  columns:[
    {field:'type_label',title:'类型',fixed:'left',width:300},
    {field:'start_end_time',title:'起止时间',slots:{default:'default_start_end_time'}},
    {field:'created_at',title:'创建时间'},
  ],
  data:[]
});
const filters = ref([
  {
    field:'type',
    type: 'select',
    col: 3,
    label: '类型',
    attrs:{
      items:[
        {id:1,name:'保养'},
        {id:2,name:'维修'},
      ]
    }
  },
]);

const fields = ref([
  {
    field:'type',
    type: 'select',
    col: 3,
    label: '类型',
    attrs:{
      items:[
        {id:1,name:'检定/保养'},
        {id:2,name:'维修'},
      ]
    }
  },
  {
    field:'start_end_time',
    type: 'datetime',
    col: 6,
    label: '起止时间',
    attrs:{
      range:true
    }
  },
]);

const editingItem = ref({})

const $toast = inject('$toast')
const requestdata = computed(()=>{
  return {maintenanceable_type:props.maintenanceType,maintenanceable_id:props.maintenanceId}
})

function detailFormat(e) {
  return {...e,start_end_time:[e.start_time,e.end_time]}
}

function saveFormat(e) {
  return {...e,start_time:e.start_end_time[0],end_time:e.start_end_time[1],maintenanceable_type:props.maintenanceType,maintenanceable_id:props.maintenanceId}
}
</script>
<template>
  <AppTable
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    :fields="fields"
    :request-data="requestdata"
    :detail-format="detailFormat"
    :save-format="saveFormat"
    detail-open-type="modal"
    api-url="maintenances"
    title="维修保养"
  >
    <template  #default_start_end_time="{data:{row}}">
      {{row.start_time}}~{{row.end_time}}
    </template>
  </AppTable>
</template>

<style scoped>

</style>
