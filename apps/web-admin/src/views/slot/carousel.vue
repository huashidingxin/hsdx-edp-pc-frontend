<script setup lang="ts">
import ContentItem from './compoents/banner-item.vue'
const TYPE = 3;
const tableRef = ref(null)
const options = ref({
  columns:[
    {field:'id',title:'编号',fixed:'left',width:100},
    {field:'name',title:'名称',minWidth:300},
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
    field:'items',
    type: 'slot',
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
      :show-edit="false"
  >
    <template #default_item_count="{data:{row}}">
      <v-chip label size="small" color="primary" @click="openItemDialog(row)">{{row.items.length}}</v-chip>
    </template>
    <template  #dialog-content>
      <v-alert v-if="editingItem.image_ratios?.length" type="warning">
        图片宽高比：
        <span v-for="(item,index) in editingItem.image_ratios" :key="index" class="me-3">
           {{item.width}}:{{item.height}}
          <template v-if="item.recommend">(推荐：{{item.recommend}})</template>
        </span>
      </v-alert>
      <content-item :slot-id="editingItem.id"></content-item>
    </template>

    <template v-if="editingItem.id" #field_items>
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
