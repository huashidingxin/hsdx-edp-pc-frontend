<script setup lang="ts">
import Resource from "@/api/resource";
import {useRoute, useRouter} from "vue-router";
import type {VxeGridProps, VxeGridListeners} from 'vxe-table'
import {useDisplay} from "vuetify";
import {VChip, VDialog, VSheet} from "vuetify/components";
import {useTabs} from "@vben/hooks";

import {provide, ref} from "vue";
import XEUtils from "xe-utils";
import {cloneDeep} from "lodash";

import { AccessControl, useAccess } from '@vben/access';

const { hasAccessByCodes,hasAccessByRoles } = useAccess();

const tabs = useTabs()

const {mobile} = useDisplay();
const route = useRoute()
const router = useRouter()
const $toast = inject('$toast')
provide('isNested', true)
const isNested = inject('isNested')
const cellRender = {
  name: 'CellRender',
  render: ({row, column}, options) => {
    return h(options.customRender.component, {
      text: row[column.field],
      ...(options.customRender?.props || {}),
      ...(typeof options.customRender?.setProps == 'function' ? options.customRender.setProps(row) : {})
    })
  },
}
const imageRender = ref({
  name: 'VxeImage',
  props: {
    width: 36,
    height: 36,
    zIndex: 2500
  }
})

const props = defineProps({
  modelValue: {
    default: () => ({}),
    type: Object
  },
  options: {
    default: () => ({}),
    type: Object
  },
  events: {
    default: () => ({}),
    type: Object
  },
  selected: {
    type: Array,
    default: () => ([])
  },
  apiUrl: {
    default: '',
    type: String
  },
  requestData: {
    default: () => ({}),
    type: Object
  },
  filterFields: {
    default: () => ([
      {field: 'id', label: 'ID', col: 3, type: 'text'}
    ]),
    type: Array,
  },
  filterExpandDefault:{
    default: false,
    type: Boolean
  },
  title: {
    default: '',
    type: String
  },
  createOpenType: {
    default: 'modal', // modal drawer page
    type: String
  },
  detailOpenType: {
    default: 'page', // modal drawer page
    type: String
  },
  idKey: {
    default: 'id',
    type: String
  },
  actions: {
    default: () => (['filter', 'create', 'edit', 'delete', 'actions', 'tools']),
    type: Array
  },
  pageRouteName: {
    default: '',
    type: String
  },
  // 如果传入ID 访问详情页 一定是单页
  action: {
    default: undefined,
    type: [String, Number]
  },
  id: {
    default: undefined,
    type: [String, Number]
  },
  fields: {
    default: () => ([]),
    type: Array
  },
  listFormat: {
    default:(e) => {
      return e
    },
    type: Function

  },
  detailFormat: {
    default: (e) => {
      return e
    },
    type: Function
  },
  saveFormat: {
    default: (e) => {
      return e
    },
    type: Function
  },
  detailClass: {
    default: '',
    type: [String, Object]
  },
  listScope: {
    default: 1,
    type: [String, Number]
  },
  showActions: {
    default: true,
    type: [Boolean, Function]
  },
  showFilter: {
    default: true,
    type: Boolean
  },
  showCreate: {
    default: true,
    type: [Boolean, Function]
  },
  showView: {
    default: true,
    type: [Boolean, Function]
  },
  showEdit: {
    default: true,
    type: [Boolean, Function]
  },
  showDelete: {
    default: true,
    type: [Boolean, Function]
  },
  showSave: {
    default: true,
    type: Boolean
  },
  showTools: {
    default: true,
    type: Boolean
  },
  showPrint: {
    default: true,
    type: Boolean
  },
  showExport: {
    default: false,
    type: Boolean
  },
  clickOpen: {
    default:()=>(e)=>{
      return true
    },
    type: [Function,Boolean]
  },
  columnFormat: {
    default: null,
    type: Function
  },
  flatField:{
    default:'',
    type:String
  },
  showCheckbox:{
    type:Boolean,
    default:false
  },
  permissionName:{
    type:String,
    default:''
  },
  auditType:{
    type:String,
    default:''
  },
  auditKey:{
    type:String,
    default:'id'
  },
  showAudit:{
    default:()=>(e)=>{
      return e && ('audit_id' in e) && !e.audit_id
    },
    type: [Function,Boolean]
  },
  auditPermissionName:{
    type:String,
    default:''
  },
  showReserveAudit:{
    default:()=>(e)=>{return e?.audit_status},
    type: [Boolean, Function]
  },
  mergeAction:{
    type:Boolean,
    default:true
  },
  showRowAction:{
    default:true,
    type: [Function,Boolean]
  },
  excludeFields:{
    default:()=>([]),
    type:Array
  },
  excludeFilters:{
    default:()=>([]),
    type:Array
  },
  superRoles:{
    default:()=>(['Super Admin']),
    type:Array
  },
  // 超级角色排除权限
  superRoleExcludeActions:{
    default:()=>([]),
    type:Array
  },
  projectProps:{
    default:()=>({filter:false,edit:false,filterRequired:false,editRequired:false}),
    type:Object
  }
})

/**
 * GRID OPTIONS
 */
const gridOptions = reactive<VxeGridProps & {
  pagerConfig: {
    total: number
    currentPage: number
    pageSize: number
  }
}>({
  showOverflow: !props.flatField,
  scrollX: {
    enabled: true,
  },
  // height: 300,
  border: false,
  loading: false,
  stripe: true,
  sortConfig: {
    multiple: true,
    remote: true
  },
  pagerConfig: {
    total: 0,
    currentPage: 1,
    pageSize: 15
  },
  rowConfig: {
    isCurrent: true,
    isHover: true
  },
  columnConfig: {
    resizable: true,
  },
  customConfig: {
    mode: 'modal'
  },
  printConfig: {},
  mergeCells:[],
  columns: [
    {type: 'seq', width: 70, fixed: 'left'},
    {field: 'created_at', title: 'Created At', visible: false}
  ],
  //data: []
})

const pageModel = computed(() => {
  if (!isNested && (route.params.id || route.params.action)) {
    return 'detail'
  } else {
    return 'list'
  }
})


const emit = defineEmits(['update:list', 'update:model-value', 'update:selected', 'reset', 'dialog-change', 'choose','cell-click','show-detail','update:filters'])

const filterExpand = ref(props.filterExpandDefault)
const filters: any = ref({})
const filterForm: any = ref(null)

const formatedFields = computed(()=>{
  return props.fields.filter((e)=>{
    return !props.excludeFields.includes(e.field)
  })
})

const formatedFilterFields = computed(()=>{
  return props.filterFields.filter((e)=>{
    return !props.excludeFilters.includes(e.field)
  })
})

function filterReset() {
  //filterForm.value?.reset();
  //filters.value = {id: undefined};
  formatedFilterFields.value.forEach((e)=>{
    filters.value[e.field] = e.default
  })

  if(filters.value.project_id){
    filters.value.project_id = undefined
    filterProjectSelected.value = null
  }
}

function refresh() {
  filterReset()
  gridRef.value?.clearSort()
  handlePageData()
}

function reload() {
  detailVisible.value = false
  handlePageData();
}

function filter() {
  gridOptions.pagerConfig.currentPage = 1;
  handlePageData();
}

const list = ref([]);
const handlePageData = async (sortBy = []) => {
  if (pageModel.value !== 'list') {
    return
  }
  gridOptions.loading = true
  const {pageSize, currentPage} = gridOptions.pagerConfig
  const ret = await getList(currentPage, pageSize, {...filters.value, sort_by:JSON.stringify(sortBy)})
  gridOptions.data = ret.data;
  if (ret.meta) {
    gridOptions.pagerConfig = {
      total: ret.meta.total,
      currentPage: ret.meta.current_page,
      pageSize: ret.meta.per_page
    }
  }

  setSelected()
  gridOptions.loading = false
}


const search = (keyword, treeOptions = {children: 'children'}, searchProps = ['name']) => {
  const filterVal = XEUtils.toValueString(keyword).trim().toLowerCase()
  if (filterVal) {
    const filterRE = new RegExp(filterVal, 'gi')
    //const treeOptions = { children: 'children' }
    //const searchProps = ['name', 'size', 'type', 'date']

    // 搜索为克隆数据，不会污染源数据
    const rest = XEUtils.searchTree(list.value, item => searchProps.some(key => String(item[key]).toLowerCase().indexOf(filterVal) > -1), treeOptions)
    XEUtils.eachTree(rest, item => {
      searchProps.forEach(key => {
        item[key] = String(item[key]).replace(filterRE, match => `<span class="keyword-highlight">${match}</span>`)
      })
    }, treeOptions)
    gridOptions.data = rest
    // 搜索之后默认展开所有子节点
    nextTick(() => {
      const $grid = gridRef.value
      if ($grid) {
        $grid.setAllTreeExpand(true)
      }
    })
  } else {
    gridOptions.data = list.value
  }
}

const isDBClick = ref(false)

const gridEvents: VxeGridListeners = {
  pageChange({pageSize, currentPage}) {
    gridOptions.pagerConfig.currentPage = currentPage
    gridOptions.pagerConfig.pageSize = pageSize
    handlePageData()
  },
  cellClick({row, column}) {
    //console.log(`单击行：${row.id} 单击列：${column.title}`)
    //emit('update:model-value',row)
    // const _id = props.idKey || 'id';
    // editedItem.value = list.value.find(v=>v[_id] == row[_id])
    emit('cell-click',{row, column})
  },
  cellDblclick({row, column}) {
    emit('choose', row)
    if (!(typeof props.clickOpen === 'function' ? props.clickOpen(row) : props.clickOpen)) {
      return
    }
    //console.log(`双击行：${row.id} 双击列：${column.title}`)
    openDetail(row[props.idKey || 'id'], checkItemAction(props.showEdit, row) ? true : false)
    // openDetail(row[props.idKey || 'id'], false)
  },
  sortChange({sortList}) {
    const sortBy = sortList.map((e) => {
      return {
        key: e.field,
        order: e.order
      }
    })
    handlePageData(sortBy)
  },
  checkboxAll(e) {
    emit('update:selected', e.records);
  },
  checkboxChange(e) {
    emit('update:selected', e.records);
  },
  editActivated ({ column }) {
    emit('edit-activated', {column});
  },
  editClosed ({ column, row }) {
    emit('edit-closed', { column, row });
  },
  rowDragend ({ newRow, oldRow, dragPos }) {
    emit('row-dragend', { newRow, oldRow, dragPos  });
  }
}
const openType = ref('page');
const detailVisible = ref(false)
const detailComponentAttrs = computed(() => {
  const fullscreen = mobile.value || dialogFullscreen.value
  const width = window.innerWidth * (fullscreen ? 1 : 0.5)
  switch (openType.value) {
    case 'modal':
      return {
        fullscreen: fullscreen,
        maxWidth: width,
        persistent: true,
        // scrollStrategy: 'close'
      }
    case 'drawer':
      return {
        fullscreen: true,
        location: "right",
        persistent: true,
        contentClass: !fullscreen ? 'mydrawer' : '',
        transition: 'slide-x-reverse-transition',
        retainFocus: false
      }
    default :
      return {
        width: '100%',
      }
  }
})

const editing = ref(false)

function openDetail(id = null, isEdit = true, tempOpenType = null) {
  if (id > 0) {
    emit('choose', gridOptions.data.find(v => v.id == id))
  }
  emit('show-detail',isEdit)
  // 清空一下历史数据
  //console.log('@@@@@清空一下历史数据', props.modelValue)
  //editedItem.value = props.modelValue
  editing.value = isEdit
  if (props.id) {
    openType.value = 'page'
    id = props.id;
  } else {
    openType.value = id ? props.detailOpenType : props.createOpenType;
  }

  openType.value = tempOpenType || openType.value

  // 如果该组件是被嵌套的场景 最多只能是抽屉模式打开 todo page模式打开需要处理路由

  if (isNested && openType.value == 'page') {
    openType.value = 'drawer'
  }

  if (openType.value === 'page') {
    if (id) {
      router.push(route.path + '/' + id + (isEdit ? '/edit' : ''))
    } else {
      router.push(route.path + '/new')
    }
  } else {
    // // 清空一下历史数据
    // editedItem.value = props.modelValue
    if (id) {
      getDetail(id)
    }
    detailVisible.value = true
    dialogFullscreen.value = false
  }
}

const gridRef = ref(null)

function getGrid() {
  return gridRef.value
}

function checkPermission(permissionAction,actPermissionName='') {
  const _permission = (actPermissionName || props.permissionName)+'.'+permissionAction
  if(props.superRoles?.length > 0 && hasAccessByRoles(props.superRoles) && !props.superRoleExcludeActions.includes(permissionAction)){
    return true
  }
  if(permissionAction && props.permissionName){
    if(!hasAccessByCodes([_permission])){
      return false
    }
  }
  return true
}

function checkItemAction(value, row,permissionAction='',actPermissionName='') {
  if(!checkPermission(permissionAction,actPermissionName)){
    return false
  }
  if (typeof value === 'function') {
    return value(row)
  } else {
    return value
  }
}

const api = new Resource(props.apiUrl);

async function getList(page: Number = 1, perPage = 10, e = {}) {
  try {
    const req = Object.assign({}, route.query, props.requestData);
    const ret: any = await api.list({
      page,
      per_page: perPage,
      ...req,
      ...e,
      scope: props.listScope
    });

    list.value = await props.listFormat(ret.data);
    // 展开列表
    if(props.flatField){
      list.value = flatList(list.value)
    }

    if(gridOptions.mergeCells.length){
      setTimeout(()=>{
        gridRef.value.setMergeCells(gridOptions.mergeCells)
      },10)
    }
    emit('update:list', cloneDeep(list.value))
    return {...ret, data: cloneDeep(list.value)}
  } catch (error) {
    console.error(error);
  }
}

function flatList(data) {
  let list = [];
  let mergeCells = [];
  const prefix = '_'+props.flatField
  // 有个fixed left
  let fixedLeftColumns = 0;
  gridOptions.columns.forEach((e)=>{
    if(e.fixed === 'left'){
      fixedLeftColumns++;
    }
  })

  data.forEach((item,index)=>{
    if(item[props.flatField]?.length){
      gridOptions.columns.forEach((column,index)=>{
        // 不是_字段开头的合并
        if(!column.field.startsWith(prefix+'.')){
          // mergeAction是否合并操作行？
          if(!props.mergeAction && column.field === '_action'){

          }else{
            mergeCells.push({
              row:list.length,col:index,rowspan:item[props.flatField]?.length||1,colspan:0
            })
          }

        }
      })
      item[props.flatField].forEach((e)=>{
        list.push({
          ...item,
          [prefix]:e
        })
      })
    }else{
      list.push(item)
    }

  })
  gridOptions.mergeCells = mergeCells
  return list;
}

const columnSlots = ref({});
watch(() => props.options, (newValue) => {
  const options = newValue
  if (newValue?.columns) {
    options.columns = newValue.columns.map((item: any) => {
      return {
        ...item,
        minWidth: newValue.columns.length > 1 ? (item.minWidth || (100 / newValue.columns.length) + '%') : 0
      }
    })

  }

  options.columns = options.columns.map((e) => {
    if (e.customRender) {
      switch (e.customRender.type) {
        case 'image':
          e.cellRender = imageRender
          break
        default:
          e.cellRender = {...cellRender, customRender: e.customRender}
      }
    }

    return e;
  })

  if (props.columnFormat) {
    options.columns = props.columnFormat(options.columns)
  }
  Object.assign(gridOptions, options)

  gridOptions.columns?.forEach((column) => {
    if (!['_action'].includes(column.field)) {
      for (let key in column.slots) {
        columnSlots.value[column.slots[key]] = column.slots[key]
      }
    }

  })

  if(props.showCheckbox && !gridOptions.columns.find(v=>v.field === '_checkbox')){
    gridOptions.columns.splice(0,0,{
      field: '_checkbox',
      type: 'checkbox',
      width: 70,
      // fixed: props.flatField ? '' : 'left',
      fixed: 'left',
    })
  }
  if (props.showActions) {
    if (!options.columns.find(v => v.field == '_action')) {
      const actionColumn = {
        title: '操作',
        field: '_action',
        slots: {default: 'default_action'},
        width: '80px',
        fixed: 'right',
      }
      options.columns.push(actionColumn)
    }

  }

  refresh()
}, {immediate: true})


watch(() => props.selected, (newVal) => {
  setSelected()
}, {immediate: true})

function setSelected() {
  nextTick(() => {
    const $grid = gridRef.value
    if ($grid && gridOptions.data) {
      // 有选中
      if (props.selected?.length) {
        let rows = []
        props.selected.forEach((item) => {
          let id = typeof item === 'object' ? item[props.idKey] : item
          rows.push(gridOptions.data.find(v => v[props.idKey] == id))
        })
        $grid.setCheckboxRow(rows, true)
      } else {
        $grid.clearCheckboxRow()
      }
    }
  })
}


const $confirm: any = inject('$confirm')

async function deleteItem(e) {
  if (await $confirm('确定要删除该记录吗？')) {
    try {
      const api = new Resource(props.apiUrl)
      await api.destroy(e[props.idKey])
      $toast.success('删除成功');
      handlePageData()
    } catch (e) {
      console.log(e)
    }
  }
}

const dialogFullscreen = ref(false)
onMounted(() => {
  //Object.assign(gridOptions,props.options)
  Object.assign(gridEvents, props.events)
  if (route.params.id) {
    initDetail()
  }
})

/**
 * ADD_FORM START
 */

const editedItem = ref({})
const defaultItem = ref({})


watch(editedItem, (newValue) => {
  nextTick(() => {
    if (JSON.stringify(newValue) !== JSON.stringify(props.modelValue)) {
      emit('update:model-value', {...newValue})
    }
  })
}, {immediate: true, deep: true})

watch(() => props.modelValue, (newValue) => {
    editedItem.value = newValue || {};
  }, {deep: true, immediate: true,},
);


watch(() => props.requestData, (newVal) => {
  if (pageModel.value == 'list') {
    handlePageData()
  }
})

watch(detailVisible, (newVal) => {
  if (!newVal) {
    editedItem.value = {}
  }
  emit('dialog-change', newVal)
})


function reset() {
  editedItem.value = cloneDeep(defaultItem.value);
  emit('reset', editedItem.value)
}

const loading = ref(false)
const saving = ref(false)

const subObjectFields = ref([])

async function getDetail(id) {
  loading.value = true
  try {
    const {data} = await api.get(id, props.requestData);
    editedItem.value = await props.detailFormat?.(data) || data;

    for (let i in props.fields) {
      if (props.fields[i].field.indexOf('.') > 0) {
        subObjectFields.value.push(props.fields[i].field)
        const fieldArr = props.fields[i].field.split('.')
        if (editedItem.value[fieldArr[0]]) {
          editedItem.value[props.fields[i].field] = editedItem.value[fieldArr[0]][fieldArr[1]]
        }
      }
    }

    console.log('!!!!!!',editedItem.value);

    Object.assign(defaultItem.value, cloneDeep(editedItem.value))
  } catch (e) {
    console.log(e)
  }
  loading.value = false
}
function expandDotKeys(obj) {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split('.');
    let current = result;

    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        // 最后一段，赋值
        current[part] = value;
      } else {
        // 如果不存在则创建对象
        if (!current[part] || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part];
      }
    });
  }

  return result;
}

const formRef = ref(null)
const fieldRef = ref([])

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
    for (const i in formatedFields.value) {

      if (formatedFields.value[i].type === 'file' && editedItem.value[props.fields[i].field]) {
        const urls = Array.isArray(editedItem.value[formatedFields.value[i].field]) ? editedItem.value[formatedFields.value[i].field] : [editedItem.value[formatedFields.value[i].field]]
        console.log('URLS', urls,formatedFields.value[i].field)
        // const uploads = urls.filter((e)=>{return !e.url.startsWith('http')})
        const uploads = urls.filter((e) => {
          return typeof e === 'object' && !e.url.startsWith('http')
        })

        console.log('UPLOADS', uploads)
        if (uploads.length) {
          await fieldRef.value[i].fieldRef.upload();
        }
      }
    }
    const api = new Resource(props.apiUrl)
    let requestData = Object.assign({}, editedItem.value)
    for (let key in requestData) {
      if (key.indexOf('.') > 0) {
        const keyArr = key.split('.')
        if (!requestData[keyArr[0]]) {
          requestData[keyArr[0]] = {}
        }
        requestData[keyArr[0]][keyArr[1]] = requestData[key]
        delete requestData[key]
      }
    }
    requestData = props.saveFormat(requestData)
    if (requestData === false) {
      saving.value = false;
      return;
    }
    let {data} = await (editedItem.value.id ? api.update(editedItem.value.id, requestData) : api.store(requestData))
    saving.value = false;
    $toast.success('提交成功');

    data = props.detailFormat?.(data) || data
    emit('update:model-value', data)
    emit('saved', data)
    // if(!editedItem.value?.id){
    //   detailVisible.value = false
    // }

    detailVisible.value = false
    handlePageData()

    // if(openType.value == 'page' && route.params.action === 'new'){
    if (openType.value == 'page') {
      // todo 需要把该页面关闭
      if(router.getRoutes().length > 1){
        router.back()
      }else{
        router.push('/')
      }
      tabs.closeCurrentTab()
    }
    editedItem.value = {}
  } catch (e) {
    saving.value = false;
    console.log(e)
  }
}


async function initDetail() {
  const formDefault: any = {};
  for (const index in props.fields) {
    formDefault[props.fields[index].field] = props.fields[index].default || '';
  }
  defaultItem.value = props.modelValue?.id
    ? cloneDeep(Object.assign(formDefault, props.modelValue))
    : cloneDeep(formDefault);

  //
  if (!isNested && route.params.id) {
    getDetail(route.params.id)
  }
}


/**
 * TABLE PUBLIC DIALOG
 */

const dialog = ref(false)
const dialogType = ref('modal')
const dialogTitle = ref('')
const dialogAttrs = computed(() => {
  const fullscreen = mobile.value || dialogFullscreen.value
  const width = window.innerWidth * (fullscreen ? 1 : 0.5)
  switch (dialogType.value) {
    case 'modal':
      return {
        fullscreen: fullscreen,
        maxWidth: width,
        persistent: true,
      }
    case 'drawer':
      return {
        fullscreen: true,
        location: "right",
        persistent: true,
        contentClass: !fullscreen ? 'mydrawer' : '',
        transition: 'slide-x-reverse-transition',

      }
    default :
      return {
        width: '100%',
      }
  }
})

function openDialog(title = '',type = 'modal') {
  dialogType.value = type
  dialog.value = true
  dialogTitle.value = title;
}

function closeDialog(){
  dialog.value = false
}


const auditItem = ref(null)
const auditDialog = ref(false)
const auditData = ref({status:0})
const auditForm = ref(null)
function openAuditDialog(row,status=true) {
  auditItem.value = row;
  auditDialog.value = true
}
function auditReasonValidate(e) {
  return !!auditData.value.status || !!e || '请输入原因'
  // if(!!auditData.value.status){
  //   return true
  // }
  // if(!!e){
  //   return true
  // }
  // return '请输入原因'
}

/**
 * 审核 反审核
 */
async function audit(row,status=true) {
  // const actionName = (!status ? '反' : '')+'审核？';
  // if(!await $confirm('确定要'+actionName)){
  //   return
  // }
  const {valid} = await auditForm.value.validate()
  if(!valid){
    return
  }
  try{
    // const api = new Resource('audits')
    // await api.store({id:auditItem.value[props.auditKey],...auditData.value,type:props.auditType || props.apiUrl})
    const api = new Resource(props.apiUrl+'/'+auditItem.value[props.auditKey]+'/audit')
    await api.store(auditData.value)
    $toast.success('审核成功');
    auditData.value = {status:0}
    auditDialog.value = false
    reload()
  }catch(e) {
    console.log(e)
  }
}

watch(filters,(newFilters)=>{
  emit('update:filters',newFilters)
},{deep:true})

import projectTable from '#/props/projectTable.js'
import {useAppStore} from "@/store";

const appStore = useAppStore()
const filterProjectSelectDialog = ref(false)
const filterProjectSelected = ref(null)
function projectConfirm(e) {
  editedItem.value.project_id = e?.id
  emit('project-change',e)
}

function projectFilterChange(e) {
  filters.value.project_id = e?.id
  reload()
}

/**
 * ADD_FORM END
 */
defineExpose({
  openDetail,
  deleteItem,
  getGrid,
  gridRef,
  openDialog,
  closeDialog,
  search,
  fieldRef,
  refresh,
  reload
})
</script>

<template>
  <div>
    <!-- 传入ID的情况为打开详情页不需要列表 -->
    <template v-if="pageModel === 'list'">
      <div>
        <v-toolbar>
          <v-toolbar-title class="flex-0-0 me-3 border-e pe-3">
            {{ title || $route.meta.title }}
            <div class="text-caption">
              <slot name="sub_title"></slot>
            </div>
          </v-toolbar-title>
          <slot name="filter-button">
            <v-btn
              v-if="showFilter"
              color="primary"
              @click="filterExpand = !filterExpand"
            >
              筛选
              <v-icon right>mdi-filter-menu-outline</v-icon>
            </v-btn>
          </slot>

          <v-spacer/>
          <slot name="right"></slot>
          <v-btn
            v-if="showCreate && checkPermission('create')"
            color="primary"
            variant="flat"
            @click="openDetail()"
          >
            <v-icon left>mdi-plus</v-icon>
            新增
          </v-btn>
          <v-menu bottom left v-if="showTools">
            <template #activator="{ props }">
              <v-btn flat icon="mdi-dots-vertical" v-bind="props"/>
            </template>

            <v-list>
              <v-list-item @click="handlePageData()">
                <v-list-item-title>
                  <v-icon icon="mdi-refresh"></v-icon>
                  刷新
                </v-list-item-title>
              </v-list-item>
              <v-list-item @click="gridRef.openCustom">
                <v-list-item-title>
                  <v-icon icon="mdi-order-bool-ascending-variant"></v-icon>
                  显示/隐藏列
                </v-list-item-title>
              </v-list-item>
              <v-list-item v-if="showPrint" @click="gridRef.openPrint">
                <v-list-item-title>
                  <v-icon icon="mdi-printer-outline"></v-icon>
                  打印
                </v-list-item-title>
              </v-list-item>
              <v-list-item v-if="showExport" @click="gridRef.openExport({type:'xlsx'})">
                <v-list-item-title>
                  <v-icon icon="mdi-export"></v-icon>
                  导出
                </v-list-item-title>
              </v-list-item>
              <slot name="action_more"></slot>
            </v-list>
          </v-menu>
        </v-toolbar>
        <v-expand-transition>
          <div v-show="filterExpand">
            <v-card class="px-3" flat>
              <v-card-text>
                <v-form ref="filterForm">
                  <slot name="filter">
                    <v-row align="center">
                      <!-- PROJECT -->
                      <template v-if="projectProps.filter && !appStore.defaultProject?.id">
                        <v-col cols="12" :md="3">
                          <AppTableSelect v-model:show="filterProjectSelectDialog"

                                          key="filter"
                                          v-bind="projectTable"
                                          :list-scope="3"
                                          placeholder="选择项目"
                                          :required="Boolean(projectProps.filterRequired)"
                                          @confirm="projectFilterChange"
                          ></AppTableSelect>
                        </v-col>
                      </template>
                      <v-col
                        v-for="(item, key) in formatedFilterFields"
                        :key="key"
                        :cols="item?.col < 3 ? 6 : 12"
                        :md="item?.col || 12"
                        :class="item.type === 'hidden' ? 'd-none' : ''"
                      >
                        <slot v-if="item.type == 'slot'" :name="'filter_'+item.field"></slot>
                        <AppField v-else v-model="filters[item?.field]"
                                  :field="item"/>
                      </v-col>

                      <v-col cols="12" offset-md="1" :md="3" :lg="2">
                        <div class="d-flex align-center justify-md-end">
                          <v-btn
                            color="grey-darken-3"
                            variant="tonal"
                            small
                            @click="refresh"
                            class="me-2"
                          >
                            重置
                          </v-btn>
                          <v-btn color="primary" small variant="flat" @click="filter">
                            查询
                          </v-btn>

                          <div class="d-flex align-center text-button text-primary"
                               @click="filterExpand=!filterExpand" style="min-width: 60px">
<!--                            <span class="ms-2">收起</span>-->
                            <v-icon :class="filterExpand ? '': 'rotate180'" class="ml-2">mdi-chevron-up</v-icon>
                          </div>
                        </div>
                      </v-col>
                    </v-row>
                  </slot>
                </v-form>
              </v-card-text>
            </v-card>
          </div>
        </v-expand-transition>
        <slot name="header"></slot>
      </div>
      <div>
        <slot name="grid" :list="list">
          <vxe-grid ref="gridRef" v-bind="gridOptions" v-on="gridEvents">
            <template
              v-for="(slot, index) in columnSlots"
              :key="index"
              #[slot]="e"
            >
              <slot :name="slot" :data="e"></slot>
            </template>
            <template  #default_action="{ row }">
              <slot name="actions" :row="row">
                <v-menu v-if="checkItemAction(showRowAction,row)" bottom left>
                  <template #activator="{ props }">
                    <v-btn flat icon="mdi-dots-vertical" v-bind="props"/>
                  </template>

                  <v-list>
                    <v-list-item @click="openDetail(row.id,false)">
                      <v-list-item-title>查看</v-list-item-title>
                    </v-list-item>
                    <v-list-item v-if="checkItemAction(showEdit,row,'edit')"
                                 @click="openDetail(row.id,true)">
                      <v-list-item-title>编辑</v-list-item-title>
                    </v-list-item>
                    <v-list-item v-if="checkItemAction(showAudit,row,'audit',auditPermissionName)"
                                 @click="openAuditDialog(row,true)">
                      <v-list-item-title>审核</v-list-item-title>
                    </v-list-item>
                    <v-list-item v-if="checkItemAction(showReserveAudit,row,'reverse audit')"
                                 @click="audit(row,false)">
                      <v-list-item-title>反审核</v-list-item-title>
                    </v-list-item>
                    <slot :data="row" name="action"></slot>
                    <v-list-item v-if="checkItemAction(showDelete,row,'delete')" @click="deleteItem(row)">
                      <v-list-item-title>删除</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-menu>
              </slot>

            </template>
          </vxe-grid>
        </slot>
      </div>

    </template>

    <component
      v-if="pageModel === 'detail' || detailVisible"
      :is="pageModel === 'detail' ? VSheet : VDialog"
      attach="body"
      v-model="detailVisible"
      v-bind="detailComponentAttrs"
      :z-index="1000"
      :class="pageModel === 'detail' ? 'pa-2 bg-base' : ''"
    >

      <v-card class="h-100x" flat>
        <v-card-title class="movable  d-flex justify-space-between align-center border-b">
          <div class="card-title">{{ title || $route.meta.title }}</div>
          <div v-if="pageModel === 'list'">
            <v-btn icon @click="dialogFullscreen=!dialogFullscreen">
              <v-icon :icon="dialogFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"></v-icon>
            </v-btn>
            <v-btn icon @click="detailVisible=false">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </div>

        </v-card-title>
        <v-card-text class="overflow-y-auto" style="padding: 16px 24px 24px">
          <slot name="form_description"></slot>
          <v-form ref="formRef" :readonly="!checkItemAction(showEdit,editedItem,'edit')"
                  :class="!checkItemAction(showEdit,editedItem,'edit') ? 'readonly-form' : ''">
            <v-row align="end">
              <template v-if="!editedItem.id && projectProps.edit && !appStore.defaultProject?.id">
                <v-col cols="12">
                  <AppTableSelect v-model:show="filterProjectSelectDialog"

                                  v-bind="projectTable"
                                  key="field"
                                  :list-scope="3"
                                  placeholder="选择项目"
                                  :required="Boolean(projectProps.editRequired)"
                                  @confirm="projectConfirm"
                  ></AppTableSelect>
                </v-col>
              </template>
              <template v-for="(item, key) in formatedFields"
                        :key="key">
                <v-col
                  :md="item.col || 12"
                  cols="12"
                  v-if="!item.hidden"
                >
                  <div v-if="item.type=='slot'" ref="fieldRef">
                    <slot :name="'field_'+(item.slot || item.field)" :item="item"></slot>
                  </div>
                  <AppField
                    v-else
                    ref="fieldRef"
                    :key="'field_'+item.field"
                    v-model="editedItem[item.field]"
                    :readonly="!['new','edit'].includes(route.params.action) && !editing || ((editing || route.params.action=='edit') && item.editable === false)"
                    :field="item"
                  />
                </v-col>
              </template>
            </v-row>
          </v-form>

        </v-card-text>
        <v-divider/>
        <v-card-actions class="px-4" v-if="$slots.form_actions || editing || ['new','edit'].includes(route.params.action)">
          <slot name="form_actions" :item="editedItem">
            <v-spacer/>
            <slot name="form_action" :item="editedItem"></slot>
            <template v-if="(checkItemAction(showEdit,editedItem,'edit') && editing) || (['new','edit'].includes(route.params.action))">
              <v-btn class="mr-1" color="warning" variant="tonal" @click="reset">
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
          </slot>
        </v-card-actions>
      </v-card>
      <slot name="form_default"></slot>
    </component>


    <v-dialog
      attach="body"
      v-model="dialog"
      v-bind="dialogAttrs"
      :z-index="1000"
      class="pa-2 bg-base"
    >
      <v-card>
        <v-card-title class="movable  d-flex justify-space-between align-center border-b">
          <div class="card-title">{{ dialogTitle || '' }}</div>
          <div>
            <v-btn icon @click="dialogFullscreen=!dialogFullscreen">
              <v-icon
                :icon="dialogFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"></v-icon>
            </v-btn>
            <v-btn icon @click="()=>{dialogFullscreen=false;dialog=false}">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </div>
        </v-card-title>
        <slot name="dialog-content"></slot>
      </v-card>
    </v-dialog>

    <v-dialog
      attach="body"
      v-model="auditDialog"
      :z-index="1000"
      class="pa-2 bg-base"
      max-width="500"
    >
      <v-card>
        <v-card-title class="movable  d-flex justify-space-between align-center border-b">
          <div class="card-title">审核</div>
          <div>
            <v-btn icon @click="auditDialog=false">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </div>
        </v-card-title>
       <v-card-text>
         <v-form ref="auditForm">
           <v-switch v-model="auditData.status" :true-value="1" :false-value="0" label="通过/不通过" color="primary"></v-switch>
           <v-text-field v-model="auditData.reason" label="审核意见" :rules="[v=>auditReasonValidate(v)]"></v-text-field>
         </v-form>

       </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="audit">确定</v-btn>
          <v-btn @click="auditDialog=false">取消</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.rotate180 {
  transform: rotate(180deg);
}

:deep(.readonly .v-input--readonly .v-field__outline) {
  &:before, &:after {
    border-style: ridge;
  }
}

:deep(.readonly-form .v-field--disabled) {
  opacity: 1 !important;
}

:deep(.v-card-title .card-title) {
  display: flex;
  align-items: center;

  &::before {
    content: "";
    display: block;
    width: 4px;
    height: 16px;
    background: rgb(var(--v-theme-primary));
    border-radius: 2px;
    margin-right: 12px;
  }

}


.bg-base {
  background: var(--v-background-base);
}

:deep(.v-form) {
  max-height: calc(100vh - 160px);
}

:deep(.mydrawer) {
  width: 50vw;
  left: 50vw;
}

:deep(.v-overlay.v-overlay--active) {
  z-index: 1066 !important;
}

</style>
