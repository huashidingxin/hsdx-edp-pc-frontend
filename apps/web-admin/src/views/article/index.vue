<script setup lang="ts">
const options = ref({
  columns:[
    {field:'id',title:'编号',fixed:'left',minWidth:300},
    {field:'title',title:'标题',minWidth:300},
    {field:'cover',title:'封面图',minWidth:300,customRender:{type:'image'}},
    {field:'created_at',title:'创建时间',width:200},
  ],
  data:[]
});
const filters = ref([
  {
    field:'title',
    type: 'text',
    col: 3,
    label: '名称',
  },
]);

const fields = ref([
  {
    field:'title',
    type: 'text',
    col: 8,
    label: '标题',
    rules:[v=>!!v || '请输入标题']
  },
  {
    field:'category_id',
    type: 'autocomplete',
    updateSearch:{
      apiUrl:'article-categories'
    },
    col: 4,
    label: '标题',
    rules:[v=>!!v || '请输入标题']
  },
  {
    field:'cover',
    type: 'file',
    col: 12,
    label: '封面图',
  },
  {
    field:'summary',
    type: 'textarea',
    col: 12,
    label: '简述',
  },
  {
    field:'content',
    type: 'editor',
    col: 12,
    label: '内容',
    rules:[v=>!!v || '请输入内容']
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
      create-open-type="modal"
      detail-open-type="modal"
      api-url="articles"
  >
  </AppTable>
</template>

<style scoped>

</style>
