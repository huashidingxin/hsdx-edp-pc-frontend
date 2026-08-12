<script setup lang="ts">
import Resource from "@/api/resource";
import RuleFile from './field.vue'
import {VChip} from "vuetify/components";
import {useProjectStore} from "#/store";
import { AccessControl, useAccess } from '@vben/access';

const { hasAccessByCodes } = useAccess();
const projectStore = useProjectStore();
const statusRender = {
  name:'CellRender',
  render({row}){
    return h(VChip,{
      text:row.status ? '正常' : '已停用',
      color:row.status  ? 'primary' : 'error',
      label:true,
      size:'small'
    })
  }
}
const options = ref({
  columns: [
    {field: 'name', title: '名称', fixed: 'left',width:300},
    {field: 'category.name', title: '分类',width:200,},
    {field: 'project.name', title: '项目',minWidth:300,slots:{default:'default_project_name'}},
    {field: 'status', title: '状态',cellRender:statusRender},
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
]);

const fields = ref([
  {
    field: 'category_id',
    type: 'select',
    col: 6,
    label: '分类',
    rules: [v => !!v || '请选择分类'],
    updateSearch:{
      apiUrl:'categories',
      params:{
        type:'rule'
      }
    }
  },
  {
    field: 'name',
    type: 'text',
    col: 6,
    label: '名称',
    rules: [v => !!v || '请输入名称']
  },

]);

const editingItem = ref({})
const tableRef = ref(null)
function dialogChange(e) {

}

const requestData = computed(()=>{
  return {
    project_id:projectStore.current?.id
  }
})

function saveFormat(e) {
  return {...e,project_id:e.project_id || projectStore.current?.id,}
}

function rowCan(row,action='edit') {
  return row.project_id == projectStore.current?.id && hasAccessByCodes([action+' rule'])
}
function showEdit(row) {
  return !row.id || rowCan(row,'edit')
}

function showDelete(row) {
  return rowCan(row,'edit')
}
</script>
<template>
  <div>
    <AppTable
      ref="tableRef"
      v-model="editingItem"
      :options="options"
      :filter-fields="filters"
      :fields="fields"
      api-url="rules"
      :request-data="requestData"
      :save-format="saveFormat"
      @dialog-change="dialogChange"
      permission-name="rule"
      :show-edit="showEdit"
      :show-delete="showDelete"
      :project-props="{filter:true}"
    >
      <template #default_project_name="{data:{row}}">
        {{row.project?.name || '通用'}}
      </template>
      <template #form_default>
        <div v-if="editingItem.id > 0" class="pt-2">
          <RuleFile :rule-category-id="editingItem.category_id" :rule-id="editingItem.id"></RuleFile>
        </div>
      </template>
    </AppTable>
  </div>
</template>

<style scoped>

</style>
