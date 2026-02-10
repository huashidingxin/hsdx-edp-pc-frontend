<script setup lang="ts">
import CategoryField from '../field/list.vue'
import Resource from "@/api/resource";

const options = ref({
  treeConfig: {
    transform: true,
    rowField: 'id',
    parentField: 'parent_id',
    lazy: true,
    hasChild: 'children_count',
    loadMethod ({ row }) {
      // 异步加载子节点
      return getChildrenList(row)
    }
  },
  columns: [
    {field: 'name', title: '名称',  treeNode: true},
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
    field: 'parent_id',
    type: 'hidden',
    col: 1,
    default:undefined,
  },
]);

const fields = ref([
  {
    field: 'name',
    type: 'text',
    col: 12,
    label: '名称',
    rules: [v => !!v || '请输入名称']
  },
]);

const editingItem = ref({})
const requestData  =computed(()=>{
  return {type:'rule',children_count:1,parent_id:0};
})

async function getChildrenList(row) {
  console.log(row)
  try{
    const api = new Resource('categories')
    const {data} = await api.list({parent_id:row.id,children_count:1,per_page:'all',type:'rule'})
    return data
  }catch(e){
    console.log(e)
  }
}
const tableRef = ref(null)
const currentParent = ref(null)
function openForm({data}) {
  currentParent.value = data;
  editingItem.value.parent_id = data.id
  tableRef.value.openDetail()
}

function dialogChange(e) {
  if(!e){
    currentParent.value = null
  }
}

function saveFormat(e) {
  e.type = 'rule'
  return e
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
      :request-data="requestData"
      api-url="categories"
      :save-format="saveFormat"
      @dialog-change="dialogChange"
    >
      <template #action="e">
        <v-list-item>
          <v-list-item-title @click="openForm(e)">新增下级</v-list-item-title>
        </v-list-item>
      </template>
      <template #form_description>
        <div v-if="currentParent" class="my-5 font-weight-bold">
          <div>上级分类：{{currentParent.name}}</div>
        </div>
      </template>
      <template #form_default v-if="editingItem.id">
        <div class="mt-2">
          <CategoryField :rule-category-id="editingItem.id" ></CategoryField>
        </div>
      </template>
    </AppTable>
  </div>
</template>

<style scoped>

</style>
