<script setup lang="ts">
const options = ref({
  columns:[
    {field:'type_desc',title:'类型',fixed:'left',width:300},
    {field:'user.name',title:'用户',width:300},
    {field:'content',title:'内容',minWidth:300},
    {field:'created_at',title:'创建时间'},
  ],
  data:[]
});
const filters = ref([
  {
    field:'type',
    type: 'select',
    col: 3,
    label: '标题',
    attrs:{
      items:[
        {id:1,name:'问题'},
        {id:2,name:'建议'},
        {id:99,name:'其他'},
      ]
    }
  },
]);

const fields = ref([
  {
    field:'type',
    type: 'select',
    col: 3,
    label: '标题',
    attrs:{
      items:[
        {id:1,name:'问题'},
        {id:2,name:'建议'},
        {id:99,name:'其他'},
      ]
    }
  },
  {
    field:'images',
    type: 'file',
    col: 12,
    label: '图片',
    attrs:{
      multiple:true
    }
  },
  {
    field:'video',
    type: 'file',
    col: 12,
    label: '视频',
    attrs:{
      fileType:'video',
    }
  },
  {
    field:'content',
    type: 'textarea',
    col: 12,
    label: '内容',

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
    api-url="feedback"
    :show-edit="false"
    :show-create="false"
  >

  </AppTable>
</template>

<style scoped>

</style>
