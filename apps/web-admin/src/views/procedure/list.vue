<script setup lang="ts">
import ProcedureForm from './form.vue'
import Resource from "#/api/resource";
import formTable from '#/props/formTable.js'
const options = ref({
  columns:[
    {field:'name',title:'名称',fixed:'left'},
    {field:'category.name',title:'分类'},
    {field:'created_at',title:'创建时间'},
  ],
  data:[]
});
const filters = ref([
  {
    field:'name',
    type: 'text',
    col: 3,
    label: '名称',
  },
  {
    field:'category_id',
    type: 'select',
    col: 4,
    label: '分类',
    updateSearch:{
      apiUrl:'categories',
      params:{
        type:'project'
      }
    },
    attrs:{

    }
  },
]);

const fields = ref([
  {
    field:'name',
    type: 'text',
    col: 8,
    label: '名称',
    rules:[v=>!!v || '请输入名称']
  },
  {
    field:'category_id',
    type: 'select',
    col: 4,
    label: '分类',
    updateSearch:{
      apiUrl:'categories',
      params:{
        type:'project'
      }
    },
  },
  {
    field:'forms',
    type:'slot',
  }
]);

const editingItem = ref({})

const $toast = inject('$toast')

const formReq = computed(()=>{
  return {
    project_category_id:editingItem.value.category_id
  }
})
const formDialog = ref(false)
const formOptions = computed(()=>{
  return {
    columns:[
      {field:'name',title:'名称',fixed:'left',minWidth:200},
      {field:'template_count',title:'模板数'}
    ]
  }
})

const measureOptions = ref({
  columns:[
    {field:'measure_id',title:'监理方式',width:300},
    {field:'form_id',title:'表单',slots:{default:'default_form_id'}},
  ],
});


const measureFields = ref([
  {
    field:'measure_id',
    type:'autocomplete',
    attrs:{
      items:[],
      itemProps:true,
      onClick:measureClick,
    },
    rules:[v=>!!v || '请选择监理方式']
  },
])

async function getMeasures() {
  try{
    const api = new Resource('measures')
    const {data} = await api.list({per_page:'all'})
    measureFields.value.find(v=>v.field == 'measure_id').attrs.items = data
  }catch(e) {
    console.log(e)
  }
}

function measureClick() {
  const selected = editingItem.value.measures.map((e)=>{
    return e.measure_id
  })
  const measureField = measureFields.value.find(v=>v.field === 'measure_id');
  let items = measureField.attrs.items
  items = items.map((item)=>{
    return {
      ...item,
      disabled:selected.includes(item.id)
    }

  })
  measureField.attrs.items = items
}
const formFieldIndex = ref(0)
function formFieldClick(rowIndex) {
  formFieldIndex.value = rowIndex;
  formDialog.value = true
}

function formConfirm(e) {
  editingItem.value.measures[formFieldIndex.value].form = e
  editingItem.value.measures[formFieldIndex.value].form_id = e.id

}

function saveFormat(e) {
  if(!e.measures?.length){
    $toast.error('工序至少有一个监理方式');
    return false
  }
  return e
}

function addMeasureItem() {
  if(!editingItem.value?.measures?.length){
    editingItem.value.measures = []
  }
  console.log('editingItem.value.measures',editingItem.value.measures)
  editingItem.value.measures.push({})
}

onBeforeMount(()=>{
  getMeasures()
})

</script>
<template>
  <AppTable
    ref="tableRef"
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    :fields="fields"
    create-open-type="drawer"
    detail-open-type="page"
    api-url="procedures"
    :save-format="saveFormat"
  >
    <template #field_forms>
      <AppList
        v-model="editingItem.measures"
        :options="measureOptions"
        :fields="measureFields"
        show-checkbox
      >
        <template #header-left>
          <div class="card-title">监理表单</div>
        </template>
        <template #default_form_id="{row,rowIndex}">
          <v-text-field :model-value="editingItem.measures[rowIndex]?.form?.name"
                        label="表单"
                        single-line
                        density="compact"
                        variant="outlined"
                        @click="formFieldClick(rowIndex)"
                        class="mt-3 required-field"
                        :rules="[v=>!!v || '请选择表单']"
          >

          </v-text-field>
        </template>
        <template #footer>
          <div class="d-flex my-5 justify-center">
            <v-btn color="primary" variant="text" @click="addMeasureItem">+ 增加一行</v-btn>
          </div>
        </template>
      </AppList>
      <AppTableSelect
        v-model:show="formDialog"
        v-bind="formTable"
        :options="formOptions"
        :request-data="formReq"
        @confirm="formConfirm"
        :show-result="false"
      ></AppTableSelect>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
