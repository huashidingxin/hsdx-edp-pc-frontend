<script setup lang="ts">
import {cloneDeep} from 'lodash';
import Resource from "@/api/resource";
import {VDialog, VNavigationDrawer} from "vuetify/components";

const props = defineProps({
  actions: {
    default: () => ['edit', 'show', 'delete'],
    type: Array,
  },
  fields: {
    default: () => {
    },
    type: Object,
  },
  modelValue: {
    default: () => ({}),
    type: Object,
  },
  apiUrl:{
    default:'',
    type:String
  },
  objectId:{
    default:'',
    type:String
  },
  dataFormat:{
    default: ()=>{},
    type:Function
  },
  saveFormat:{
    default: (e)=>{return e},
    type:Function
  },

});
const emit = defineEmits(['update:model-value','update:saved']);
const editedItem: any = ref({});
const defaultItem = ref({});

const $toast: any = inject('$toast')
const formRef: any = ref(null)
const fieldRef: any = ref(null)
const saving = ref(false)
const closeDetailDialog = inject('closeDetailDialog')

const api = new Resource(props.apiUrl)

watch(() => props.modelValue, (newValue) => {
    editedItem.value = newValue || {};
  }, {deep: true, immediate: true,},
);

watch(editedItem,(newValue)=>{
  emit('update:model-value',newValue)
},{immediate:true})

function reset() {
  // init()
  editedItem.value = cloneDeep(defaultItem.value);
}

const loading = ref(false)
async function getData() {
  loading.value = true
  try{
    const {data} = await api.get(props.objectId);
    editedItem.value = props.dataFormat?.(data) || data;
    Object.assign(defaultItem.value,editedItem.value)
  }catch(e) {
    console.log(e)
  }
  loading.value = false
}
async function submit() {
  try {
    saving.value = true;
    const {valid} = await formRef.value.validate();
    if (!valid) {
      saving.value = false;
      $toast.error('表单有误', {anchor: 'top right'});
      return;
    }
    // 是否有文件需要上传
    for (const i in props.fields) {
      if(props.fields[i].type === 'file' && !editedItem.value[props.fields[i].field].url.startsWith('http')){
        await fieldRef.value[i].fieldRef.upload();
      }
    }
    const api = new Resource(props.apiUrl)
    const requestData = props.saveFormat(editedItem.value)
    const isUpdate = editedItem.value.id > 0
    const {data} = await (editedItem.value.id ? api.update(editedItem.value.id,requestData) : api.store(requestData))
    saving.value = false;
    $toast.success('提交成功');
    emit('update:saved',{update:isUpdate,data:data})
    if(!isUpdate){
      closeDetailDialog?.()
    }
  } catch (e) {
    saving.value = false;
    console.log(e)
  }
}

async function init() {
  const formDefault: any = {};
  for (const index in props.fields) {
    formDefault[props.fields[index].field] = props.fields[index].default || '';
  }
  defaultItem.value = props.modelValue?.id
    ? cloneDeep(Object.assign(formDefault, props.modelValue))
    : cloneDeep(formDefault);

  //
  if(props.objectId){
    getData()
  }
}


function getFieldRef(fieldName='') {
  if(fieldName){
    const index = props.fields.findIndex(v=>v.field === fieldName)
    if(index !== -1){
      return fieldRef.value[index]
    }else{
      console.error('字段：'+fieldName+'不存在');
      return
    }
  }
  return fieldRef.value
}

onMounted(() => {
  nextTick(() => {
    init()
  });


});

defineExpose({
  getFieldRef
})
</script>

<template>

  <v-card flat :loading="loading">
    <v-divider class="mb-4"/>
    <v-card-text class="overflow-y-auto" style="max-height: 80vh">
      <slot name="description"></slot>
      <v-form ref="formRef">
        <v-row align="end">
          <v-col
            v-for="(item, key) in fields"
            :key="key"
            :md="item.col || 12"
            cols="12"
          >
            <slot v-if="item.type=='slot'" :name="item.slot || item.field" :item="item"></slot>
            <AppField
              v-else
              ref="fieldRef"
              v-model="editedItem[item.field]"
              :field="item"
            />
          </v-col>
        </v-row>
      </v-form>
    </v-card-text>
    <v-divider/>
    <v-card-actions>
      <v-spacer />
      <slot name="actions" :item="editedItem"></slot>
      <template v-if="actions.includes('edit')">
        <v-btn class="mr-3" color="warning" variant="tonal" @click="reset">
          重置
        </v-btn>
        <v-btn
          :loading="saving"
          color="primary"
          variant="flat"
          @click="submit"
        >
          提交
        </v-btn>
      </template>
    </v-card-actions>
  </v-card>

</template>

<style scoped>

</style>
