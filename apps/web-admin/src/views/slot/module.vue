<script setup lang="ts">
import ContentItem from './compoents/module-item.vue'
const TYPE = 1;
const tableRef = ref(null)
const options = ref({
  columns:[
    {field:'id',title:'编号',fixed:'left',width:100},
    {field:'name',title:'名称',minWidth:300},
    {field:'title',title:'标题',minWidth:200},
    {field:'code',title:'编码',minWidth:100},
    {field:'item_count',title:'内容',minWidth:300,slots:{default:'default_item_count'}},
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
    field:'code',
    type: 'text',
    col: 4,
    label: '编码',
    attrs:{readonly:true},
    rules:[v=>!!v || '请输入编码']
  },

  {
    field:'name',
    type: 'text',
    col: 8,
    label: '名称',
    attrs:{readonly:true},
    rules:[v=>!!v || '请输入名称']
  },
  {
    field:'title',
    type: 'text',
    col: 12,
    label: '标题（默认为空，部分模块特有）',
  },
  {
    field:'description',
    type: 'editor',
    col: 12,
    label: '描述（默认为空，部分模块特有）',
  },
  {
    field:'items',
    type: 'slot',
    col: 12,
  },
]);

const editingItem = ref({})
const $toast = inject('$toast')
const requestData = {
  type:TYPE
}
const saveFormat = (e)=>{
  return {
    ...e,
    type:TYPE
  }
}

function openItemDialog(row) {
  editingItem.value = row
  tableRef.value.openDialog('内容列表','drawer')
}
</script>
<template>
  <AppTable
      ref="tableRef"
      v-model="editingItem"
      :options="options"
      :filter-fields="filters"
      :fields="fields"
      create-open-type="modal"
      detail-open-type="drawer"
      api-url="content-slots"
      :request-data="requestData"
      :save-format="saveFormat"
      :show-create="false"
      :show-delete="false"
      :show-tools="false"
  >
    <template #default_item_count="{data:{row}}">

      <v-chip v-if="row.max_items > 0" label size="small" color="primary" @click="openItemDialog(row)">{{row.items?.length || 0}}</v-chip>
      <div v-else>不适用</div>
    </template>
    <template  #dialog-content>
      <div>
        <v-alert v-if="editingItem.image_ratios?.length" type="warning">
          图片宽高比：
          <span v-for="(item,index) in editingItem.image_ratios" :key="index" class="me-3">
          {{item.width}}:{{item.height}}
          <template v-if="item.recommend">(推荐：{{item.recommend}})</template>
        </span>
        </v-alert>
        <content-item :slot-id="editingItem.id"></content-item>
      </div>
    </template>

    <template v-if="editingItem.id && editingItem.max_items > 0" #field_items>
      <v-alert v-if="editingItem.image_ratios?.length" type="warning">
        图片宽高比：
        <span v-for="(item,index) in editingItem.image_ratios" :key="index" class="me-3">
           {{item.width}}:{{item.height}}
          <template v-if="item.recommend">(推荐：{{item.recommend}})</template>
        </span>
      </v-alert>
      <content-item :slot-id="editingItem.id"></content-item>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
