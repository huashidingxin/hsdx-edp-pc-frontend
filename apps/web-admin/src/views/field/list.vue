<script setup lang="ts">
import FieldRule from '../field-rule/list.vue'
import Resource from "@/api/resource";
const props = defineProps({
  formId:{
    default:undefined,
    type:String
  },
  ruleCategoryId:{
    default:undefined,
    type:String
  },
  ruleId:{
    default:undefined,
    type:String
  }
})
const options = ref({
  columns:[
    {field:'id',title:'ID',fixed:'left'},
    {field:'name',title:'名称'},
    {field:'parent_id',title:'上级'},
    {field:'type',title:'类型'},
    {field:'required',title:'必填',slots:{default:'default_required'}},
    {field:'base_field_id',title:'受控规范字段',slots:{default:'default_base_field_id'}}
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
]);
const fields = ref([
  {
    field: 'name',
    type: 'textarea',
    col: 12,
    label: '名称',
    rules: [v => !!v || '请输入名称']
  },
  {
    field: 'hint',
    type: 'text',
    col: 4,
    label: '填写提示',
  },
  {
    field: 'placeholder',
    type: 'text',
    col: 4,
    label: '占位提示',
  },
  {
    field: 'type',
    type: 'select',
    col: 4,
    label: '字段类型',
    default:'text',
    attrs: {
      items:[
        {id:'text',name:'单行文本'},
        {id:'textarea',name:'多行文本'},
        {id:'switch',name:'是否'},
        {id:'number',name:'数字'},
        {id:'select',name:'选项'},
        {id:'list',name:'列表'},
        {id:'stakeholder',name:'相关单位'},
        {id:'construction',name:'施工单位'},
        {id:'unit_project',name:'单位工程'},
        {id:'unit_project_code',name:'单位工程编号'},
        // {id:'construction_manager',name:'施工单位项目经理'},
        // {id:'divisional',name:'分部工程'},
        {id:'date',name:'日期'},
        {id:'time',name:'时间（不带日期）'},
        {id:'datetime',name:'时间（带日期）'},
        {id:'image',name:'单图片'},
        {id:'images',name:'多图片'},
        {id:'file',name:'文件'},
        {id:'video',name:'视频'},
      ]
    },
    rules:[v=>!!v || '请选择字段类型']
  },
  {
    field: 'options',
    type: 'combobox',
    col: 12,
    label: '选项列表',
    attrs:{
      placeholder:'输入选项后按回车键新增',
      multiple:true,
      chips:true
    }
  },
  {
    field: 'parent_id',
    type: 'text',
    col: 4,
    label: '父字段ID',
  },
  {
    field: 'sort',
    type: 'number',
    col: 4,
    label: '排序',
    attrs:{
      hint:'升序排列'
    }
  },
  {
    field: 'required',
    type: 'switch',
    default:true,
    col: 12,
    label: '必填',
  },
  {
    field: 'failed_proof',
    type: 'switch',
    col: 12,
    label: '不通过时上传证明',
  },
  {
    field: 'base_field_id',
    type: 'slot',
    col: 12,
    label: '受控规范字段',
  },

]);
const tableRef = ref(null)
const editingItem = ref({})
const requestData = computed(()=>{
  return {
    form_id:props.formId,
    rule_category_id:props.ruleCategoryId
  }
})

watch(()=>editingItem.value?.type,(newVal)=>{
  const field = fields.value.find(v=>v.field === 'options')
  if(newVal == 'select'){
    field.rules = [v=>!!v && v.length || '类型为选项时，选项列表不能为空'];
    field.type = 'combobox'
  }else{
    // field.type = 'hidden'
    field.rules = [];
  }
},{deep:true})

function saveFormat(e) {
  return {...e,form_id:props.formId,rule_category_id:props.ruleCategoryId}
}

const ruleCategories = ref([])
const selectedRuleCategoryId = ref(null)
const ruleCategoryFields = ref([])
async function getRuleCategories() {
  try{
    const api = new Resource('categories')
    const {data} = await api.list({type:'rule',per_page:'all'})
    ruleCategories.value = data
  }catch(e) {
    console.log(e)
  }
}

watch(()=>editingItem.value.base_rule_category_id,(newVal)=>{
  // editingItem.value.base_field_id = undefined
  if(ruleCategoryFields.value?.length && editingItem.value.base_field_id){
    const baseField = ruleCategoryFields.value.find(v=>v.id == editingItem.value.base_field_id)
    if(baseField.rule_category_id != newVal){
      editingItem.value.base_field_id = undefined
    }
  }
  if(newVal){
    getRuleCategoryFields()
  }
})

async function getRuleCategoryFields() {
  try{
    const api = new Resource('fields')
    const {data} = await api.list({rule_category_id:editingItem.value.base_rule_category_id,per_page:'all'})
    ruleCategoryFields.value = data
  }catch(e) {
    console.log(e)
  }
}

onBeforeMount(()=>{
  //options.value.columns.push({field:'base_field_id',title:'受控规范字段',slots:{default:'default_base_field_id'}},)

  if(props.ruleCategoryId){
    const index = options.value.columns.findIndex(v=>v.field == 'base_field_id')
    options.value.columns.splice(index,1)
  }

  getRuleCategories()
})

</script>
<template>
  <AppTable
    ref="tableRef"
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    :fields="fields"
    detail-open-type="page"
    :request-data="requestData"
    :save-format="saveFormat"
    title="字段列表"
    api-url="fields"
    permission-name="field"
  >
    <template #default_required="{data:{row}}">
      <div :class="row.required ? 'text-error' : ''">{{row.required ? '是' : '否'}}</div>
    </template>
    <template #default_base_field_id="{data:{row}}">
      <div v-if="row.base_rule_category">{{row.base_rule_category?.name}}:{{row.base_field?.name}}</div>
      <div v-else>N/A</div>
    </template>
    <template #form_default>
      <div v-if="editingItem.id > 0" class="mt-2">
        <FieldRule :field-id="editingItem.id" :rule-id="ruleId"></FieldRule>
      </div>
    </template>
    <template v-if="!editingItem.rule_category_id" #field_base_field_id>
      <div>
        <div class="font-weight-bold my-3">受控规范字段</div>
        <v-row>
          <v-col cols="6">
            <v-select v-model="editingItem.base_rule_category_id"
                      label="规范类型"
                      :items="ruleCategories"
                      item-value="id"
                      item-title="name"
                      clearable
            ></v-select>
          </v-col>
          <v-col cols="6">
            <v-select v-model="editingItem.base_field_id"
                      :items="ruleCategoryFields"
                      item-value="id"
                      item-title="name" clearable></v-select>
          </v-col>
        </v-row>
      </div>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
