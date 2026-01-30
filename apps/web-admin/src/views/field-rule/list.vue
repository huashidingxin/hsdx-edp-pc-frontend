<script setup lang="ts">
const props = defineProps({
  fieldId:{
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
    {field:'type',title:'类型',fixed:'left'},
    {field:'value',title:'比对值'},
    {field:'message',title:'错误提示'},
    {field:'level',title:'级别'},
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
    field: 'type',
    type: 'select',
    col: 4,
    label: '类型',
    attrs: {
      items:[
        // {id:'required',name:'必填'},
        {id:'range',name:'范围'},
        {id:'min',name:'最小值'},
        {id:'max',name:'最大值'},
        {id:'eq',name:'等于'},
        // {id:'select',name:'单选'},
        // {id:'multiselect',name:'多选'},
      ]
    },
    rules:[v=>!!v || '请选择校验类型']
  },
  {
    field: 'value',
    type: 'text',
    col: 4,
    label: '比对值',
    rules: [],
    attrs:{
      disabled:false
    }
  },
  {
    field: 'level',
    type: 'select',
    col: 4,
    label: '级别',
    default:1,
    rules: [v => !!v || '请选择级别'],
    attrs:{
      items:[
        {id:1,name:'错误'},
        {id:2,name:'警告'},
      ],
      hint:'警告可以提交，错误无法提交'
    }
  },
  {
    field: 'message',
    type: 'text',
    col: 12,
    label: '不通过提示',
    rules: [v => !!v || '请输入提示']
  },

]);
const tableRef = ref(null)
const editingItem = ref({})
const requestData = computed(()=>{
  return {
    field_id:props.fieldId,
    rule_id:props.ruleId
  }
})

watch(()=>editingItem.value.type,(newVal)=>{
  const field = fields.value.find(v=>v.field == 'value')
  field.attrs.disabled = newVal == 'required'
  field.rules = newVal == 'required' ? [] :[v => !!v || '请输入比对值']

})

function saveFormat(e) {
  return {...e,field_id:props.fieldId,rule_id:props.ruleId,value:e.type == 'required' ? 1 : e.value}
}

</script>
<template>
  <AppTable
    ref="tableRef"
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    :fields="fields"
    detail-open-type="modal"
    create-open-type="modal"
    :request-data="requestData"
    :save-format="saveFormat"
    title="规则列表"
    api-url="field-rules"
  >

  </AppTable>
</template>

<style scoped>

</style>
