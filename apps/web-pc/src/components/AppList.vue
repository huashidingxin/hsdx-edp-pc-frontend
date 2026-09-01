<script setup>
import {reactive, watch, toRefs, ref} from 'vue'
import { cloneDeep, isEqual } from '@vben/utils';
import { Card, Button,Form } from 'antdv-next';
import {VxeGrid} from 'vxe-table'

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
    type: Array,
    default: () =>([]),
    required: true
  },
  options: {
    type: Object,
    default: () => ({})
  },
  fields: {
    type: Array,
    default: () => []
  },
  columnFormat: {
    type: Function,
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
    type: [Function, Boolean],
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
    type: [String, Number],
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
  'update:model-value': (value) => true,
  'row-delete': (row, index) => true,
  'update:selected': (value) => true,
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

  virtualXConfig: {
    enabled: true,
  },
  scrollY: {
    enabled: true,

  },
  columns: [],
  footerData: [],
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
  },
  data:[]
})

// 处理列格式化

const columnSlots = ref([])
const fieldFormRef = ref({})

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
      if(typeof props.columnFormat === 'function'){
        gridOptions.columns = props.columnFormat(gridOptions.columns)
      }
    }

    // 添加操作列
    if (props.showAction && gridOptions.columns && !gridOptions.columns.some(v => v.field === '_action')) {
      gridOptions.columns.push({
        field: '_action',
        title: '操作',

        fixed: 'right',
        slots: { default: 'default_action' }
      })
    }

    const slots = {}
    // 处理options中的列插槽
    gridOptions.columns?.forEach((column) => {
      if (!['_action'].includes(column.field)) {
        for (let key in column.slots) {
          slots[column.slots[key]] = column.slots[key]
        }
      }

    })
    // 处理fields中的字段
    props.fields.forEach(field => {
      if (field.field && gridOptions.columns) {
        const columnIndex = gridOptions.columns.findIndex(v=>v.field == field.field)
        if(columnIndex !== -1){
          gridOptions.columns[columnIndex].slots = {...gridOptions.columns[columnIndex].slots,default:'default_'+field.field}
          slots['default_'+field.field] = field
        }
      }
    })

    columnSlots.value = slots

    // 单元格render
    gridOptions.columns = gridOptions.columns?.map((e)=>{
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

const editingItem = ref([])
watch(()=>props.modelValue,(newVal)=>{
  if(!isEqual(newVal,editingItem.value)){
    editingItem.value = cloneDeep(newVal)
  }

},{immediate:true,deep:true})

watch(()=>editingItem.value,(newVal)=>{
  nextTick(()=>{

    if(!isEqual(newVal,props.modelValue)){

      emit('update:model-value',editingItem.value)
    }
  })


},{immediate:true,deep:true})


// 删除行处理
const handleDelete = (row, rowIndex) => {
  const newData = [...props.modelValue]
  newData.splice(rowIndex, 1)
  emit('update:model-value', newData)
  emit('row-delete', row, rowIndex)
}

const fieldDefaultAttrs = {
  singleLine: true,
  density: 'compact',
  inputProps:{
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
  if (!selectedRows.value.length) return

  // 方法1：从后往前删除（保持索引稳定）
  const indices = selectedRows.value
    .map(row => editingItem.value.findIndex(item => item[props.rowKey] === row[props.rowKey]))
    .filter(index => index !== -1)
    .sort((a, b) => b - a) // 降序

  const newData = [...editingItem.value]
  const deletedRows = []

  indices.forEach(index => {
    deletedRows.push(newData[index])
    newData.splice(index, 1)
  })

  // 批量更新
  emit('update:model-value', newData)

  // 触发删除事件（可选）
  deletedRows.forEach((row, i) => {
    emit('row-delete', row, indices[i])
  })

  // 清空选中
  selectedRows.value = []
}

function insertAt(record,rowIndex=-1) {
  gridRef.value.insertAt(record,rowIndex)
  emit('update:model-value',gridRef.value.getFullData())
}

function rowChange(changed,row) {
  console.log(changed,row)
  emit('row-change',changed,row)
  //emit('update:model-value',gridApi.grid.getFullData())
}

async function validate() {
  // const ret = await gridRef.value.validate()
  // console.log('444555',ret)

  console.log(fieldFormRef.value)
}

function fieldChange(field,row) {
  emit('row-change',field,row)
}

defineExpose({
  insertAt,

  validate
})
</script>

<template>
  <Card variant="borderless" :classes="{body:'p-0',title:''}" v-bind="cardProps">
    <template #title>
      <div>
        <slot name="title"></slot>
      </div>
    </template>
    <template #extra>
      <div>
        <slot name="extra"></slot>
        <Button v-if="showAction && Boolean(showDelete) && showCheckbox" danger class="ml-2" :disabled="!selectedRows.length" @click="removeSelected">删除</Button>
      </div>
    </template>
    <div :style="{ height: typeof height === 'number' ? `${height}px` : height }">

      <VxeGrid
        ref="gridRef"
        v-bind="gridOptions"
        :data="editingItem || []"
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
            <Form
              :ref="fieldFormRef[scope.row._X_ROW_KEY+'_'+slot.filed]"
              :colon="false"
              variant="borderless"
            >
              <AppField
                class="mt-3"
                v-model="scope.row[slot.field]"
                :show-label="false"
                :field="{...slot,attrs:{...fieldDefaultAttrs,...(slot.attrs || {})}}"
                @update:model-value="fieldChange(slot.field,scope.row)"
              />
            </Form>
          </template>
        </template>


        <template #default_action="{ row, rowIndex }">
          <div>
            <slot name="action" :row="row" :row-index="rowIndex"></slot>
            <Button
              v-if="showAction && (typeof showDelete === 'function' ? showDelete(row) : showDelete)"
              type="link"
              @click.stop="handleDelete(row, rowIndex)"
              size="small"
            >
              删除
            </Button>
          </div>
        </template>
      </VxeGrid>

      <slot name="footer"></slot>
    </div>
  </Card>
</template>

<style scoped>

</style>
