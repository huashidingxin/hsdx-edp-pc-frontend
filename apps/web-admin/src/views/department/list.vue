<script setup lang="ts">
const options = ref({
  columns:[
    {field:'name',title:'名称',width:200,fixed:'left'},
    {field:'remarks',title:'备注',minWidth:200,},
    {field:'created_at',title:'创建时间'},
  ],
  data:[]
});
const fields = ref([
  {
    field:'department_id',
    type: 'autocomplete',
    col: 4,
    label: '部门',
    updateSearch:{
      apiUrl:'departments',
      params:{
      }
    },
    attrs: {

    },
  },
  {
    field:'name',
    type: 'text',
    col: 8,
    label: '名称',
    rules:[v=>!!v || '请输入名称']
  },
  {
    field:'remarks',
    type: 'textarea',
    col: 12,
    label: '备注',
  },

]);
const filters = ref([
  {
    field:'department_id',
    type: 'autocomplete',
    col: 4,
    label: '部门',
    updateSearch:{
      apiUrl:'departments',
      params:{
      }
    },
    attrs: {

    },
  },
]);

const editingItem = ref({})
</script>

<template>
  <AppTable
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    api-url="departments"
    create-open-type="modal"
    detail-open-type="modal"
    :fields="fields"
    permission-name="department"
  >
  </AppTable>
</template>

<style scoped>

</style>
