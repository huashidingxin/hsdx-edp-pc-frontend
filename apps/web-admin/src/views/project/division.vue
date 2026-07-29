<script setup lang="ts">
import {useProjectStore} from "@/store/project";
const projectStore = useProjectStore()
import Resource from "@/api/resource";
import {debounce} from "lodash";
const props = defineProps({
  projectId:{
    default:undefined,
    type:[String,Number]
  }
});
const $toast = inject('$toast')
const options = ref({
  showHeader:false,
  border: 'outer',
  stripe:false,
  treeConfig: {
    transform: true,
    rowField: 'id',
    parentField: 'parent_id',
    expandAll:true,
    // showLine: true
  },

  columnConfig: {},
  rowDragConfig: {
    trigger: 'row',
    showGuidesStatus: true,
    isCrossDrag:true,
    isToChildDrag:true,
    async dragEndMethod(e) {
      const {oldRow,newRow,dragPos} = e;

      if(oldRow.project_id != newRow.project_id && dragPos =='bottom'){
        $toast.error('不同项目之间不能互相包含');
        return false
      }
      return true

    },
  },
  rowConfig: {
    drag: true
  },
  columns:[
    {field:'name',title:'名称',fixed:'left',maxWidth:'500px',slots:{default:'default_name'},treeNode: true,},
  ],
  data:[]
});
const levelItems = [
  {id:1,name:'单位工程'},
  {id:2,name:'子单位工程'},
  {id:3,name:'分部'},
  {id:4,name:'子分部'},
  {id:5,name:'分项'},
  {id:6,name:'子分项'},
  {id:7,name:'检验批'}
]
const fields = ref([
  {
    field: 'level',
    type: 'select',
    col: 6,
    label: '层级',
    attrs: computed(() => {
      const parentLevel = parent.value?.level ?? null
      const options = parentLevelOptions[parentLevel] || parentLevelOptions.null
      return {
        items: editingItem.value.id ? levelItems : options,
        placeholder: '输入名称搜索',
        itemProps: true,
        readonly: Boolean(editingItem.value.id)
      }
    }),
    rules: [v => !!v || '请选择划分层级']
  },
  {
    field: 'name',
    type: 'text',
    col: 6,
    label: '名称',
    rules: [v => !!v || '请输入名称']
  },
  {
    field: 'code',
    type: 'text',
    col: 6,
    label: '编号',
    rules: [v => !!v || '请输入编号']
  },
])
const filters = ref([
  {
    field:'name',
    type: 'text',
    col: 3,
    label: '名称',
  },
]);

const events = {
  rowDragend ({ newRow, oldRow, dragPos }) {
    //console.log(`拖拽完成，被拖拽行：${oldRow.name} 目标行：${newRow.name} 目标位置：${dragPos}`)
    isChange.value = true
  }
};

const tableRef = ref(null)
const currentItem = ref(null)
const isChange = ref(false)
function rowClick(item) {
  currentItem.value = Object.assign({},item)
}

const filterName = ref('')
const search = debounce(()=>{
  tableRef.value.search(filterName.value)
},500)
async function save() {
  const $grid = tableRef.value.getGrid();
  try {
    const api = new Resource('divisions')
    const {data} = await api.store({list:$grid.getTableData().fullData,project_id:props.projectId});
    $toast.success('保存成功')
    isChange.value = false
  }catch (e) {
    console.log(e)
  }
}


const editingItem = ref({})
const requestData = computed(()=>{
  return {project_id:props.projectId}
})

const projectProps = computed(()=>{
  return {
    filter:true,
    edit:!editingItem.value.id && !parent.value,
    filterRequired:true,
    editRequired:true
  }
})

const levels = {
  1:{name:'单位工程',color:'#3F51B5'},
  2:{name:'子单位工程',color:'#3F51B5'},
  3:{name:'分部工程',color:'#2196F3'},
  4:{name:'子分部工程',color:'#2196F3'},
  5:{name:'分项工程',color:'#009688'},
  6:{name:'子分项工程',color:'#009688'},
  7:{name:'检验批',color:'#FF9800'},
};

const parentLevelOptions = {
  null: [{name: '单位工程', id: 1}],
  1: [{name: '子单位工程', id: 2}, {name: '分部工程', id: 3}],
  2: [ {name: '分部工程', id: 3}],
  3: [{name: '子分部工程', id: 4}, {name: '分项工程', id: 5}],
  4: [ {name: '分项工程', id: 5}],
  5: [{name: '子分项工程', id: 6}, {name: '检验批', id: 7}],
  6: [{name: '检验批', id: 7}],
  7: []
}
const parent = ref(null)
function openSubDialog(e) {
  parent.value = e
  tableRef.value.openDetail(null)
}

function dialogChange(status) {
  if(!status){
    parent.value = null
  }else{
    const parentLevel = parent.value?.level ?? null
    if(parentLevelOptions[parentLevel]?.length === 2){
      editingItem.value.level = parentLevelOptions[parentLevel][1].id
    }else{
      editingItem.value.level = parentLevelOptions[parentLevel][0].id
    }

    editingItem.value.code = parent.value?.code ? parent.value.code + '-' : ''
  }
}

function saveFormat(e) {
  return {
    project_id:editingItem.value.project_id || props.projectId,
    parent_id:parent.value?.id,
    ...e,
  }
}

</script>

<template>
  <div>
    <AppTable
      ref="tableRef"
      v-model="editingItem"
      :options="options"
      :events="events"
      :filter-fields="filters"
      page-route-name="Division"
      :fields="fields"
      :request-data="requestData"
      detail-open-type="modal"
      api-url="divisions"
      title="项目划分"
      permission-name="division"
      :project-props="projectProps"
      filter-expand-default
      @dialog-change="dialogChange"
      :save-format="saveFormat"
    >
      <template #right>
        <v-btn  v-access="['division.edit']" v-if="isChange" color="warning" variant="flat" class="me-2 slide-y-transition" @click="save">保存修改</v-btn>
      </template>
      <template #form_description>
        <div v-if="parent" class="font-weight-bold text-body-1 mb-3">
          上级：{{parent.name}} {{parent.code}}
          <v-chip size="x-small" variant="elevated" class="me-1" label :color="levels[parent.level].color">
            {{levels[parent.level].name}}
          </v-chip>
        </div>
      </template>

      <template #action="{data}">
        <v-list-item v-access="['division.create']" v-if="data.level < 7" @click.stop="openSubDialog(data)">
          <v-list-item-title>增加下级</v-list-item-title>
        </v-list-item>
      </template>

      <template #default_name="{data:{row}}">
        <div @click="rowClick(row)">
          <v-list-item-title class="d-flex align-center">
            <div >{{row.name}} (<span class="text-body-2">{{row.code}}</span>)</div>

            <div class="ms-3" v-if="currentItem?.id == row.id">
              <v-chip size="x-small" variant="elevated" class="me-1" label :color="levels[currentItem.level].color">
                {{levels[currentItem.level].name}}
              </v-chip>
              <v-btn v-access="['division.create']" v-if="row.level < 7"  icon="mdi-plus" size="x-small" @click.stop="openSubDialog(currentItem)"></v-btn>
              <!--              <v-btn icon="mdi-pencil-outline" size="x-small" @click.stop="tableRef.openDetail(currentItem.id)"></v-btn>-->
              <!--              <v-btn icon="mdi-trash-can-outline" size="x-small" @click.stop="tableRef.deleteItem(currentItem)"></v-btn>-->
            </div>
          </v-list-item-title>
        </div>
      </template>
    </AppTable>
  </div>
</template>

<style scoped>
:deep(.vxe-grid--pager-wrapper) {
  display: none;
}
:deep(.keyword-highlight)  {
  background-color: #FFFF00;
}
</style>
