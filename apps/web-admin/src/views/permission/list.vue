<script setup lang="ts">
const options = ref({
  treeConfig: {
    transform: true,
    rowField: 'id',
    parentField: 'parent_id'
  },
  columns:[
    // {field:'name',title:'code',width:300,fixed:'left'},
    {field:'display_name',title:'名称',treeNode: true},
  ],
  data:[]
});
const fields = ref([
  {
    field: 'name',
    type: 'text',
    col: 4,
    label: 'code',
    rules: [v => !!v || '请输入code']
  },
  {
    field: 'title',
    type: 'text',
    col: 4,
    label: '名称',
    rules: [v => !!v || '请输入名称']
  },
  {
    field:'type',
    type: 'select',
    col: 4,
    label: '类型',
    attrs: {
      items:[
        {id:1,name:'页面'},
        {id:2,name:'功能'},
      ]
    },
  },
]);
const filters = ref([
  {
    field:'name',
    type: 'text',
    col: 3,
    label: '名称',
  },
  {
    field:'type',
    type: 'select',
    col: 4,
    label: '类型',
    attrs: {
      items:[
        {id:1,name:'页面'},
        {id:2,name:'功能'},
      ]
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
    detail-open-type="modal"
    api-url="permissions"
    :fields="fields"
  >
  </AppTable>
</template>

<style scoped>

</style>
