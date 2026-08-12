<template>
  <div>
    <vxe-grid v-if="gridOptions.data?.length" v-bind="gridOptions">
      <template v-for="index in maxColumn" #[`defaultName`+index]="{row}">
        <div v-if="index > row.level"></div>
        <div
          v-else-if="row.level == index && gridOptions.data.filter((e)=>{return e['id'+(index-1)] === row['id'+(index-1)]}).length === 1"
          class="d-flex flex-wrap">
          <div v-for="(item,index) in hasChildrenRows[row['id'+(index-1)]].children" :key="index"
               class="ma-1">
            <v-checkbox :label="item.display_name" density="compact" hide-details color="primary"
                        @click="itemClick(list[item.id])" :model-value="list[item.id].selected" ></v-checkbox>
          </div>
        </div>
        <div v-else>
          <v-checkbox  :label="row['name'+index]" density="compact" hide-details color="primary"
                      @click="itemClick(list[row['id'+index]])" :model-value="list[row['id'+index]].selected"></v-checkbox>

        </div>
      </template>
    </vxe-grid>
  </div>
</template>

<script setup>
import {reactive, ref} from 'vue'
import XEUtils from 'xe-utils'

const props = defineProps({
  modelValue:{
    default:()=>([]),
    type:Array
  },
  data:{
    default:()=>([]),
    type:Array
  },
  columnNames:{
    default:()=>(['一级菜单','二级菜单','三级菜单','四级菜单']),
    type:Array
  },
})

const emit = defineEmits(['update:model-value'])

const maxColumn = ref(2);
const hasChildrenRows = ref({})
const gridOptions = reactive({
  border: true,
  // height: 600,
  scrollY: {
    enabled: false
  },
  columns: [
    {field: 'name1', title: '一级菜单', slots: {default: 'defaultName1'}},
  ],
  data: [],
  // 通用行合并函数（将相同多列数据合并为一行）
  spanMethod({row, _rowIndex, column, visibleData}) {
    const fields = ['name1', 'name2', 'name3']
    const cellValue = row[column.field]
    if (cellValue && fields.includes(column.field)) {
      const prevRow = visibleData[_rowIndex - 1]
      let nextRow = visibleData[_rowIndex + 1]
      // 有上一行，且上一行的数据和本行一样 已经合并过了
      if (column.sortNumber == row.level) {
        return
      }
      if (prevRow && prevRow[column.field] === cellValue) {
        return {rowspan: 0, colspan: 0}
      } else {
        let countRowspan = 1
        while (nextRow && nextRow[column.field] === cellValue) {
          nextRow = visibleData[++countRowspan + _rowIndex]
        }
        if (countRowspan > 1) {
          return {rowspan: countRowspan, colspan: 1}
        }
      }
      // 是否为末级

      // if (column.sortNumber == row.level) {
      //   if (prevRow && prevRow[column.field] === cellValue) {
      //
      //   } else {
      //     return {rowspan: hasChildrenRows.value[row['id' + (row.level - 1)]].children?.length, colspan: 1}
      //   }
      // }
    }
  }
})

const list = ref([]);
const tree = ref([]);
const selected = ref([])
function itemClick(item) {
  toggleSelect(item)
}


function buildTree(data, parentId = null) {
  const tree = [];
  data.forEach(item => {
    if (item.parent_id === parentId) {
      const children = buildTree(data, item.id);
      if (children.length) item.children = children;
      tree.push(item);
    }
  });
  return tree;
}

// 查找某个节点的所有子节点
function getAllDescendants(data, parentId) {
  let descendants = [];
  // 找到当前 parentId 下的所有子节点
  const children = data.filter(item => item.parent_id === parentId);

  // 遍历所有子节点
  children.forEach(child => {
    descendants.push(child); // 添加当前子节点
    // 递归查找子节点的子节点
    descendants = descendants.concat(getAllDescendants(data, child.id));
  });

  return descendants;
}

// 处理选择当前节点及其子节点
function toggleSelect(node) {
  node.selected = !node.selected;

  // 如果选中当前节点，选中所有子节点
  const descendants = getAllDescendants(Object.values(list.value),node.id);
  descendants.forEach(child => {
    list.value[child.id].selected = node.selected;
  });

  // 自动选择父节点
  if (node.selected) {
    selectParent(node,Object.values(list.value));
  } else {
    deselectParent(node);
  }
}

// 选中父节点
function selectParent(node, data) {
  if (!node.parent_id) return; // 如果没有父节点，则返回
  // 当前父节点下的未被选中的子节点
  const nonSelected = data.filter((e)=>{return e.parent_id == node.parent_id && !e.selected})
  if(!nonSelected?.length){
    list.value[node.parent_id].selected = true;
    selectParent(list.value[node.parent_id],data); // 递归选择父节点
  }
}

// 取消选择父节点
function deselectParent(node) {
  if (!node.parent_id) return; // 如果没有父节点，则返回

  const parent = list.value[node.parent_id]//data.find(item => item.id === node.parent_id);
  if (parent) {
    const allDescendantsSelected = parent.children.every(child => child.selected);
    if (!allDescendantsSelected) {
      parent.selected = false;
      deselectParent(parent); // 递归取消选择父节点
    }
  }
}

// 全选
function selectAll(status=true) {
  Object.values(list.value).forEach(item => {
    item.selected = status;
  });
}



// 将普通树结构转换为横向树列表
const toColTreeData = async (treeData) => {
  const options = {children: 'children'}
  const _list = []
  const keyMap = {}
  XEUtils.eachTree(treeData, (item, index, result, paths, parent) => {
    keyMap[item.id] = item
    item.keys = parent ? parent.keys.concat([item.id]) : [item.id]
    if (!item.children || !item.children.length) {
      const row = {}
      item.keys.forEach((key, index) => {
        const level = index + 1
        maxColumn.value = Math.max(level, maxColumn.value)
        const obj = keyMap[key]
        row[`check${level}`] = false
        row[`id${level}`] = obj.id
        row[`name${level}`] = obj.display_name
        row['level'] = level
      })
      // 倒数第二列有多行的，只留一行
      //console.log(item)
      const lastLevel = row.level - 1;

      if (!_list.find(v => v['id' + lastLevel] == row['id' + lastLevel]) || row.level == 1) {
        _list.push(row)
      }
    } else {
      //
      hasChildrenRows.value[item.id] = item

    }
  }, options)
  // console.log(_list)
  // const levelColumns = ['一级', '二级', '三级', '四级'];
  for (let i = 1; i <= maxColumn.value; i++) {
    gridOptions.columns[i - 1] = {
      field: 'name' + i,
      title: props.columnNames[i - 1],
      slots: {default: 'defaultName' + (i)}
    }
  }
  gridOptions.data = _list
}
watch(()=>props.data,(newVal)=>{
  if(newVal){
    props.data.forEach((item)=>{
      list.value[item.id] = item
    })
    //list.value = data;
    //tree.value = buildTree(props.data,0)

    const treeData = XEUtils.toArrayTree(props.data, {parentKey: 'parent_id'})
    toColTreeData(treeData)
    tree.value = treeData;

  }

},{immediate:true})

watch(()=>props.modelValue,(newVal)=>{
  if(newVal?.length){
    let arr = newVal;
    if(typeof newVal[0] === 'object'){
      arr = newVal.map((e)=>{return e.id})
    }

    const selectedSet = new Set(arr);

    // 遍历列表并更新 selected 属性
    list.value.forEach(item => {
      item.selected = selectedSet.has(item.id); // 如果 ID 在 selectedSet 中，则 selected 为 true，否则为 false
    });
    // arr.forEach((e)=>{
    //   list.value[e].selected = true
    // })
  }
})

watch(list,(newVal)=>{
  let arr = [];
  if(newVal){
    for(let i in newVal){
      if(newVal[i].selected){
        arr.push(newVal[i].id)
      }
    }
  }
  emit('update:model-value',arr)
},{deep:true})

defineExpose({
  selectAll
})
</script>
