<script setup lang="ts">
import {reactive, watch, toRefs, ref} from 'vue'
import type { PropType } from 'vue'
import {cloneDeep, debounce, isEqual} from "lodash";

interface Column {
  field: string
  title?: string
  width?: number
  slots?: Record<string, string>
  [key: string]: any
}

interface Field {
  field: string
  [key: string]: any
}
const cellRender = {
  name:'CellRender',
  render:({row,column},options)=>{
    return h(options.customRender.component,{
      text:row[column.field],
      ...(options.customRender?.props || {}),
      ...(typeof options.customRender?.setProps == 'function' ? options.customRender.setProps(row) : {})
    })
  },
}
const imageRender = ref({
  name:'VxeImage',
  props:{
    width:36,
    height:36,
    zIndex:2500
  }
})
const props = defineProps({
  modelValue: {
    type: Array as PropType<Record<string, any>[]>,
    default: () => [],
    required: true
  },
  options: {
    type: Object as PropType<Record<string, any>>,
    default: () => ({})
  },
  fields: {
    type: Array as PropType<Field[]>,
    default: () => []
  },
  columnFormat: {
    type: Function as PropType<(column: Column) => Column>,
    default: null
  },
  showSeq: {
    type: Boolean,
    default: true
  },
  showAction: {
    type: Boolean,
    default: true
  },
  showDelete: {
    type: [Function, Boolean] as PropType<boolean | ((row: any) => boolean)>,
    default: true
  },
  showEdit:{
    type: Boolean,
    default: true
  },
  loading: {
    type: Boolean,
    default: false
  },
  height: {
    type: [String, Number] as PropType<string | number>,
    default: ''
  },
  rowKey: {
    type: String,
    default: 'id'
  },
  autoResize: {
    type: Boolean,
    default: true
  },
  showCheckbox:{
    type:Boolean,
    default:false
  },
  selected: {
    type: Array,
    default: () => ([])
  },
  draggable:{
    type:Boolean,
    default:false
  },
  seqName:{
    type:String,
    default:'序号'
  }
})

const emit = defineEmits({
  'update:model-value': (value: any[]) => true,
  'row-delete': (row: any, index: number) => true,
  'update:selected': (value: any[]) => true,
})

const { modelValue, options, fields, loading, height } = toRefs(props)

const gridRef = ref(null)
const selectedRows = ref([])
const gridOptions = reactive({
  border: true,
  showFooter: true,
  showOverflow: true,
  showHeaderOverflow: true,
  showFooterOverflow: true,
  editConfig: {
    trigger: 'click',
    mode: 'row',
    showStatus: true
  },
  rowConfig: {
    height: 75,
    isHover: true,
    isCurrent: true,
    useKey: true
  },
  columnConfig: {
    resizable: true,
    minWidth: 100
  },

  scrollX: {
    enabled: true,

  },
  scrollY: {
    enabled: true,

  },
  columns: [] as Column[],
  footerData: [] as any[],
  loading: props.loading,
  autoResize: props.autoResize,
  onCheckboxAll(e) {
    selectedRows.value = e.records
    emit('update:selected', e.records);
  },
  onCheckboxChange(e) {
    selectedRows.value = e.records
    emit('update:selected', e.records);
  },
  onRowDragend(e) {
    emit('update:model-value',e.$grid.getFullData())
  }
})

// 处理列格式化
const formatColumns = (columns: Column[]) => {
  return columns.filter(column => {
    if (props.columnFormat) {
      return props.columnFormat(column) || column
    }
    return column
  })
}

const columnSlots = ref([])

// 初始化表格列
watch(options,(newOptions) => {
  if (newOptions) {
    Object.assign(gridOptions, cloneDeep(newOptions))
    if(props.showSeq && !gridOptions.columns.find(v=>v.type === 'seq')){
      gridOptions.columns.splice(0,0,{
        field: 'seq',
        type: 'seq',
        width: 70,
        fixed: 'left',
        title: props.seqName
      })
    }
    if(props.showCheckbox && !gridOptions.columns.find(v=>v.field === '_checkbox')){
      gridOptions.columns.splice(0,0,{
        field: '_checkbox',
        type: 'checkbox',
        width: 70,
        fixed: 'left',
      })
    }
    // 格式化列
    if (newOptions.columns) {
      gridOptions.columns = [
        ...props.columnFormat(gridOptions.columns)
      ]
    }

    // 添加操作列
    if (props.showAction && !gridOptions.columns.some(v => v.field === '_action')) {
      gridOptions.columns.push({
        field: '_action',
        title: '操作',
        width: 140,
        fixed: 'right',
        slots: { default: 'default_action' }
      })
    }

    const slots: Record<string, string | Field> = {}
    // 处理options中的列插槽
    gridOptions.columns?.forEach((column) => {
      if (column.field !== '_action' && column.slots) {
        Object.keys(column.slots).forEach(key => {
          slots[column.slots[key]] = column.slots[key]
        })
      }
    })
    // 处理fields中的字段
    props.fields.forEach(field => {
      if (field.field) {
        const columnIndex = gridOptions.columns.findIndex(v=>v.field == field.field)
        if(columnIndex !== -1){
          gridOptions.columns[columnIndex].slots = {...gridOptions.columns[columnIndex].slots,default:'default_'+field.field}
          slots['default_'+field.field] = field
        }
      }
    })

    columnSlots.value = slots

    // 单元格render
    gridOptions.columns = gridOptions.columns.map((e)=>{
      if(e.customRender){
        switch(e.customRender.type){
          case 'image':
            e.cellRender = imageRender
            break
          default:
            e.cellRender = {...cellRender,customRender:e.customRender}
        }
      }

      return e;
    })

    // 可拖拽？
    if(props.draggable){
      gridOptions.rowConfig.drag = true
      // 设置第一列非checkbox的可拖拽
      let dragIndex = 0;
      if(gridOptions.columns[0].field == '_checkbox'){
        dragIndex = 1;
      }
      gridOptions.columns[dragIndex].dragSort = true
    }
  }

}, { immediate: true, deep: true })

// 监听高度变化
watch(height, (newHeight) => {
  if (newHeight) {
    gridOptions.height = newHeight
  }
})


// 监听loading状态
watch(loading, (newLoading) => {
  gridOptions.loading = newLoading
})

watch(()=>props.showAction,()=>{
    if(!props.showAction){
      setTimeout(()=>{
        gridOptions.columns.splice(-1,1)
        if(props.showCheckbox){
          gridOptions.columns.splice(0,1)
        }

      },100)
    }
})

async function handleUpdate(rowIndex,field,value) {
  await nextTick()
  const newData = cloneDeep(props.modelValue)
  newData[rowIndex][field] = value
  console.log(newData,props.modelValue,isEqual(newData,props.modelValue))
  if(!isEqual(newData,props.modelValue)){
    emit('update:model-value',newData)
  }

}

// 删除行处理
const handleDelete = (row: any, rowIndex: number) => {
  const newData = [...props.modelValue]
  newData.splice(rowIndex, 1)
  emit('update:model-value', newData)
  emit('row-delete', row, rowIndex)
}

const fieldDefaultAttrs = {
  variant: 'outlined',
  singleLine: true,
  density: 'compact',
  inputProps:{
    variant: 'outlined',
    singleLine: true,
    density: 'compact',
  }
}
let isInternalUpdate = false
watch(() => props.selected, (newVal) => {
  if (!isInternalUpdate) {
    setSelected()
  }
}, {immediate: true})


function setSelected() {
  nextTick(() => {
    const $grid = gridRef.value
    if ($grid && gridOptions.data) {
      isInternalUpdate = true // 标记为内部更新，避免触发 watch
      if (props.selected?.length) {
        let rows = []
        props.selected.forEach((item) => {
          let id = typeof item === 'object' ? item[props.rowKey] : item
          rows.push(gridOptions.data.find(v => v[props.rowKey] == id))
        })
        $grid.setCheckboxRow(rows, true)
      } else {
        $grid.clearCheckboxRow()
      }
      isInternalUpdate = false // 恢复
    }
  })
}

function removeSelected() {
  gridRef.value.removeCheckboxRow()
  emit('update:model-value',gridRef.value.getFullData())
}

</script>

<template>
  <v-card class="px-0" >
    <v-card-title class="d-flex justify-between align-center">
      <div><slot name="header-left"></slot></div>
      <div v-if="showEdit" class="d-flex align-center">
        <slot name="header-right"></slot>
        <v-btn v-if="showAction &&  Boolean(showDelete) && showCheckbox" variant="flat" color="error" class="ml-2" :disabled="!selectedRows.length" @click="removeSelected">删除</v-btn>
      </div>
    </v-card-title>
    <v-card-text :style="{ height: typeof height === 'number' ? `${height}px` : height }">
      <vxe-grid
        ref="gridRef"
        v-bind="gridOptions"
        :data="modelValue"
        @cell-click="$emit('cell-click', $event)"
      >
        <template
          v-for="(slot, name) in columnSlots"
          :key="name"
          #[name]="scope"
        >
          <template v-if="typeof slot === 'string'">
            <slot :name="name" v-bind="scope" />
          </template>
          <template v-else>

            <AppField
              class="mt-3"
              :model-value="scope.row[slot.field]"
              @update:model-value="value => handleUpdate(scope.rowIndex,slot.field,value)"
              :field="{...slot,attrs:{...fieldDefaultAttrs,...(slot.attrs || {})}}"
            />
          </template>
        </template>

        <template #default_action="{ row, rowIndex }">
          <div v-if="showAction && (typeof showDelete === 'function' ? showDelete(row) : showDelete)">
            <v-btn
              variant="text"
              color="primary"
              @click.stop="handleDelete(row, rowIndex)"
            >
              删除
            </v-btn>
          </div>
        </template>
      </vxe-grid>
      <slot name="footer"></slot>
    </v-card-text>

  </v-card>
</template>

<style scoped>

</style>
