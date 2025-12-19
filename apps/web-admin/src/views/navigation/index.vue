<script setup lang="ts">
const options = ref({
  columns:[
    {field:'name',title:'标题',fixed:'left',minWidth:200},
    // {field:'subtitle',title:'副标题',fixed:'left',width:200},
    {field:'icon',title:'图标',width:300,customRender:{type:'image'}},
    {field:'slot.name',title:'位置',width:200},
    {field:'target_value',title:'目标',width:200},
    {field:'sort_order',title:'排序',sortable:true,width:200},
    {field:'created_at',title:'创建时间',width:200},
  ],
  data:[]
});
const filters = ref([
  {
    field:'name',
    type: 'text',
    col: 3,
    label: '标题',
  },
  {
    field:'slot_id',
    type: 'autocomplete',
    col: 4,
    label: '位置',
    updateSearch:{
      apiUrl:'content-slots',
      params:{
        type:4
      }
    },
  },
]);

const fields = ref([
  {
    field:'name',
    type: 'text',
    col: 4,
    label: '标题',
    rules:[v=>!!v || '请输入标题']
  },
  {
    field:'subtitle',
    type: 'text',
    col: 4,
    label: '副标题',
  },
  {
    field:'slot_id',
    type: 'autocomplete',
    col: 4,
    label: '位置',
    updateSearch:{
      apiUrl:'content-slots',
      params:{
        type:4
      }
    },
    attrs:{

    },
    rules:[v=>!!v || '请选择位置']
  },
  {
    field:'icon',
    type: 'file',
    col: 12,
    label: '图标',
  },
  {
    field:'target_value',
    type: 'text',
    col: 12,
    label: '跳转目标',
    attrs:{
      placeholder:'/pages'
    }
  },
  {
    field:'sort_order',
    type: 'number',
    col: 3,
    label: '排序',
    default:50,
    attrs:{
      hint:'升序排序'
    }
  },
]);

const editingItem = ref({})
const $toast = inject('$toast')

</script>
<template>
  <AppTable
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    :fields="fields"
    create-open-type="drawer"
    api-url="navigations"
  >

  </AppTable>
</template>

<style scoped>

</style>
