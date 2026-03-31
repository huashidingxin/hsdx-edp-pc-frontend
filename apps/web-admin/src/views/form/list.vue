<script setup lang="ts">
import FormTemplate from '../form-template/list'
import FormField from '../field/list.vue'
import {useProjectStore} from "@/store";

const projectStore = useProjectStore()

const options = ref({
  columns: [
    {field: 'name', title: '名称', fixed: 'left', width: '300px'},
    // {field: 'code', title: '编号'},
    {field: 'type_desc', title: '类型'},
    {field: 'category.name', title: '项目分类'},
    {field: 'template_count', title: '模板数',sortable:true},
    {field: 'created_at', title: '创建时间'},
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
  {
    field: 'project_category_id',
    type: 'select',
    col: 3,
    label: '项目类型',
    updateSearch:{
      apiUrl:'categories',
      params:{
        type:'project'
      }
    }
  },
  {
    field: 'type',
    type: 'select',
    col: 3,
    label: '类型',
    attrs:{
      items:[
        {id:1,name:'通用'},
        {id:2,name:'任务'},
        {id:3,name:'日志'},
        {id:4,name:'文档'},
      ]
    }
  },
]);

const fields = ref([
  {
    field: 'name',
    type: 'text',
    col: 5,
    label: '名称',
    rules: [v => !!v || '请输入名称']
  },
  {
    field: 'project_category_id',
    type: 'autocomplete',
    col: 4,
    label: '项目类型',
    updateSearch: {
      apiUrl: 'categories',
      priorityKey: 'id',
      params: {
        type: 'project'
      }
    },
    attrs: {
      placeholder: '输入名称搜索',
    },
  },
  {
    field: 'type',
    type: 'select',
    col: 3,
    label: '类型',
    rules: [v => !!v || '请选择类型'],
    attrs:{
      items:[
        {id:1,name:'通用'},
        {id:2,name:'任务'},
        {id:3,name:'日志'},
        {id:4,name:'文档'},
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
    api-url="forms"
    permission-name="form"
  >

    <template v-if="editingItem.id" #form_default>
      <div class="my-2">
        <FormField :form-id="editingItem.id"></FormField>
      </div>
      <div class="my-2">
        <FormTemplate :form-id="editingItem.id" :type="editingItem.type" :form-fields="editingItem.fields"></FormTemplate>
      </div>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
