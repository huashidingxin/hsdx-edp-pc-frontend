<template>
  <div>
    <vxe-grid v-if="gridOptions.data?.length" v-bind="gridOptions">
      <template #default_display_name="{row}">
        <v-checkbox  :label="row.display_name" density="compact" hide-details color="primary"
                     @click="itemClick(list[row.id])" :model-value="list[row.id].selected"></v-checkbox>
      </template>
      <template #default_actions="{row}">
        <div  class="d-flex flex-wrap">
          <div v-for="(item,index) in row.children" :key="index">
            <div v-if="item.type == 2" class="ma-1">
              <v-checkbox  :label="item.display_name" density="compact" hide-details color="primary"
                           @click="itemClick(list[item.id])" :model-value="list[item.id].selected"></v-checkbox>
            </div>
          </div>
        </div>

      </template>
      <template #default_fields="{row}">
        <div  class="d-flex flex-wrap">
          <div v-for="(item,index) in row.children" :key="index">
            <div v-if="item.type == 3" class="ma-1">
              <v-checkbox  :label="item.display_name" density="compact" hide-details color="primary"
                           @click="itemClick(list[item.id])" :model-value="list[item.id].selected"></v-checkbox>
            </div>
          </div>
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
    {field: 'display_name', title: '功能模块',slots:{default:'default_display_name'}},
    {field: 'actions', title: '权限列表',slots:{default:'default_actions'}},
    {field: 'fields', title: '敏感字段',slots:{default:'default_fields'}},
  ],
  data: [],
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

watch(()=>props.data,(newVal)=>{
  if(newVal){
    props.data.forEach((item)=>{
      list.value[item.id] = item
    })
    const treeData = XEUtils.toArrayTree(props.data, {parentKey: 'parent_id'})
    tree.value = treeData;
    gridOptions.data = treeData
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
