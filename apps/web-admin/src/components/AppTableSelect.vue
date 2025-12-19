<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps({
  apiUrl: {
    default: '',
    type: String,
    required: true
  },
  modelValue: {
    type: [Array, Object, String, Number],
    default: () => ([])
  },
  label:{
    default:"",
    type:String
  },
  show: {
    type: Boolean,
    default: false
  },
  multiple: {
    default: false,
    type: Boolean
  },
  requestData: {
    default: () => ({}),
    type: Object
  },
  placeholder:{
    default: '点击选择',
    type: String
  },
  openType: {
    default: 'modal',
    type: String
  },
  resourceName: {
    default: '',
    type: String,
  },
  filters: {
    default: () => ([]),
    type: Array
  },
  options: {
    default: () => ({}),
    type: Object
  },
  columnFormat: {
    default: null,
    type: Function
  },
  createRoutePath: {
    default: '',
    type: String,
  },
  valueKey: {
    type: String,
    default: 'id'
  },
  nameKey: {
    type: String,
    default: 'name'
  },
  returnObject:{
    type: Boolean,
    default: true
  },
  clickSelect:{
    type: Boolean,
    default: true
  },
  listScope:{
    type:[Number,String],
    default:1
  },
  required:{
    type: Boolean,
    default: false
  },
  showResult:{
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:model-value', 'update:show', 'close', 'confirm'])

const tableRef = ref(null)
const fields = ref([])
const editingItem = ref({})
const selected = ref([])

const gridOptions = ref({
  rowConfig: {
    keyField: props.valueKey
  },
  checkboxConfig: {
    reserve: true,
    trigger: 'row'
  },
  radioConfig: {
    highlight: true,
    trigger: 'row'
  },
  pagerConfig: {
    total: 0,
    currentPage: 1,
    pageSize: 10
  },
  columns: []
})

const defaultFilters = computed(()=>{
  return [
    {
      field:props.valueKey,
      label:props.valueKey.toUpperCase(),
      col:4,
      attrs:{
        placeholder:'请输入'+props.valueKey.toUpperCase()+'搜索'
      }
    }
  ]
})

// 计算属性控制对话框显示
const dialog = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

// 初始化表格列
watch(() => props.options, (newOptions) => {
  Object.assign(gridOptions.value, newOptions || {})

  const columns = [{
    type: props.multiple ? 'checkbox' : 'radio',
    width: 60,
    fixed: 'left'
  }]

  gridOptions.value.columns = (columns.concat(newOptions.columns || []))

}, { immediate: true, deep: true })


// 监听modelValue变化，设置表格选中状态
watch(() => props.modelValue, (newValue) => {
  if (!tableRef.value?.gridRef) return

  const $grid = tableRef.value.gridRef

  if (props.multiple) {
    if (Array.isArray(newValue)) {
      // 处理数组类型的多选
      const ids = newValue.map(item => typeof item === 'object' ? item[props.valueKey] : item)
      $grid.setCheckboxRow(ids, true)
    }
  } else {
    // 处理单选
    if (newValue) {
      const id = typeof newValue === 'object' ? newValue[props.valueKey] : newValue
      console.log('newValue',newValue)
      $grid.setRadioRow(newValue)
    } else {
      $grid.clearRadioRow()
    }
  }

  setSelected()
}, { deep: true,immediate:true })

function setSelected() {
  nextTick(()=>{
    if(props.modelValue){
      selected.value = Array.isArray(props.modelValue) ? props.modelValue : [props.modelValue]
    }else{
      selected.value = []
    }
  })
}

function cellClick({row,column}) {
  if(!props.multiple && props.clickSelect){
    confirm()
  }
}

const selectedStr = ref('')
function confirm() {
  const $grid = tableRef.value?.gridRef
  if (!$grid) return

  let selectedData

  if (props.multiple) {
    const selectRecords = $grid.getCheckboxRecords()
    selected.value = selectRecords
    selectedData = selectRecords
  } else {
    selectedData = $grid.getRadioRecord() || null
    selected.value = [{...selectedData}]
    if(!props.returnObject){
      selectedData = selectedData[props.valueKey]
    }
  }

  selectedStr.value = selected.value.map((e)=>{return e[props.nameKey]})

  console.log('@@@@',selectedStr.value)

  emit('update:model-value', selectedData)
  emit('confirm', selectedData)
  dialog.value = false
}

function close() {
  emit('close')
  dialog.value = false
}

function clear() {
  emit('update:model-value',props.multiple ? [] : null)
  emit('confirm',props.multiple ? [] : null)
}

</script>

<template>
  <div>
    <div v-if="showResult" @click="dialog=true" :class="required ? 'required-field' : ''">
      <v-text-field readonly
                    :label="label || resourceName"
                    :model-value="selectedStr"
                    :placeholder="placeholder"
                    clearable
                    @click:clear.stop="clear"
                    :rules="required ? [v=>!!v || '请选择项目'] : []"
      ></v-text-field>
    </div>
    <v-dialog v-model="dialog" max-width="50vw" persistent>
      <v-card class="pa-0">
        <v-card-title class="movable d-flex justify-space-between align-center border-b">
          <div class="card-title">{{ '请选择'+resourceName }}</div>
          <div>
            <v-btn icon @click="close">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </div>
        </v-card-title>

        <v-card-text class="pa-0">
          <AppTable
            ref="tableRef"
            v-model="editingItem"
            v-model:selected="selected"
            :options="gridOptions"
            :filter-fields="filters.length ? filters : defaultFilters"
            :api-url="apiUrl"
            :fields="fields"
            :request-data="requestData"
            :title="resourceName+'列表'"
            :column-format="columnFormat"
            :show-actions="false"
            :show-create="false"
            :show-edit="false"
            :show-tools="false"
            :list-scope="listScope"
            @cellClick="cellClick"
          >
            <template #right>
              <div v-if="createRoutePath" class="mr-5">
                <v-btn variant="flat" color="primary" @click="$router.push(createRoutePath)">
                  + 新增
                </v-btn>
              </div>
              <slot name="right"></slot>
            </template>

            <template #filter>
              <slot name="filter"></slot>
            </template>

            <template #sub_title>
              <slot name="sub_title"></slot>
            </template>
          </AppTable>
        </v-card-text>

        <v-card-actions class="border-t">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="close">取消</v-btn>
          <v-btn color="primary" variant="flat" @click="confirm">确定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.movable {
  cursor: move;
}
</style>
