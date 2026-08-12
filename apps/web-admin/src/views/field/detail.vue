<script setup lang="ts">
import AppForm from "@/components/AppForm.vue";
const $route = useRoute()

const props = defineProps({
  fields: {
    default: () => ([]),
    type: Object
  },
  id: {
    default: undefined,
    type: String
  },
  type:{
    default:'show', // show edit update
    type:String
  },
  formId:{
    default: undefined,
    type: [String,Number]
  }
})
const formFields = ref([
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
    attrs: {
     items:[
       {id:'switch',name:'是否'},
       {id:'switch/text',name:'是否/其他'},
       {id:'text',name:'单行文本'},
       {id:'textarea',name:'多行文本'},
       {id:'number',name:'数字'},
       {id:'array',name:'列表'},
       {id:'image',name:'图片'},
     ]
    },
    rules:[v=>!!v || '请选择字段类型']
  },
  {
    field: 'correct_value',
    type: 'switch',
    col: 12,
    label: '正常值（是否类型）',
  },
  {
    field: 'required',
    type: 'switch',
    col: 12,
    label: '必填',
  },
]);
watch(() => props.fields, (newValue) => {
  formFields.value = Object.assign(formFields.value, newValue || {})
}, {immediate: true})

const editingItem = ref({})
const objectId = ref(null)
onMounted(() => {
  if($route.name === 'FieldDetail'){
    objectId.value = $route.params.id || props.id
  }else{
    objectId.value = props.id
  }

  editingItem.value.form_id = props.formId

})

defineExpose({
  fields:formFields.value
})
</script>

<template>
  <v-sheet flat>
    <AppForm v-model="editingItem" api-url="fields" :objectId="objectId"  :fields="formFields"></AppForm>
  </v-sheet>

</template>

<style scoped>

</style>
