<script setup lang="ts">
const options = ref({
  columns:[
    {field:'title',title:'标题',fixed:'left',width:300},
    {field:'category.name',title:'分类'},
    {field:'created_at',title:'创建时间'},
  ],
  data:[]
});
const filters = ref([
  {
    field:'title',
    type: 'text',
    col: 3,
    label: '标题',
  },
]);

const fields = ref([
  {
    field:'title',
    type: 'text',
    col: 8,
    label: '标题',
    attrs:{

    },
    rules:[v=>!!v || '请输入标题']
  },
  {
    field:'category_id',
    type: 'autocomplete',
    col: 4,
    label: '分类',
    updateSearch:{
      apiUrl:'categories',
      params:{
        type:'news'
      }
    },
    attrs:{

    },
    rules:[v=>!!v || '请选择分类']
  },
  {
    field:'summary',
    type: 'textarea',
    col: 12,
    label: '简介',

  },
  {
    field:'content',
    type: 'editor',
    col: 12,
    label: '详情',

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
    create-open-type="page"
    api-url="news"
  >

  </AppTable>
</template>

<style scoped>

</style>
