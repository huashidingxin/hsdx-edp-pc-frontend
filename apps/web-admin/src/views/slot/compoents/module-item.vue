<script setup lang="ts">
import Resource from "#/api/resource";

const props = defineProps({
  slotId:{
    type:Number,
    default:undefined,
    required:true,
  }
})
const options = ref({
  editConfig: {
    trigger: 'click',
    mode: 'cell'
  },
  columns:[
    {field:'id',title:'编号',fixed:'left',width:100},
    {field:'title',title:'标题',minWidth:200},
    {field:'image',title:'封面图',minWidth:200,customRender:{type:'image'}},
    {field:'sort_order',title:'排序（升序）',sortable:true,editRender: { name: 'input', attrs: { type: 'number' } },width:180},
    {field:'status_label',title:'状态',width:100,slots:{default:'default_status'}},
    {field:'created_at',title:'创建时间',width:200},
  ],
  data:[],
});
const filters = ref([
  {
    field:'title',
    type: 'text',
    col: 3,
    label: '名称',
  },
]);

const fields = ref([
  {
    field:'title',
    type: 'text',
    col: 10,
    label: '标题',
    rules:[v=>!!v || '请输入标题']
  },
  {
    field:'sort_order',
    type: 'number',
    col: 2,
    label: '排序（升序）',
    rules:[v=> v>=0 || '请输入正确的序号']
  },
  {
    field:'sub_title',
    type: 'text',
    col: 12,
    label: '副标题',
  },
  {
    field:'image',
    type: 'file',
    col: 12,
    label: '图片',
  },
  {
    field:'video',
    type: 'file',
    col: 12,
    attrs:{
      fileType:'video',
      onSnapshot(e) {
        editingItem.value.image = e.data
      },
    },
    label: '视频（默认为空，指定模块有效）',
  },
  {
    field:'target_value',
    type: 'text',
    col: 12,
    label: '跳转链接（默认为空：不跳转）',
  },
  {
    field:'status',
    type: 'switch',
    default:true,
    col: 12,
    label: '状态',
  },
  {
    field:'content',
    type: 'editor',
    col: 12,
    label: '内容（默认为空，部分模块特有）',
  },
]);

const editingItem = ref({})
const $toast = inject('$toast')
const requestData = computed(()=>{
  return {
    slot_id:props.slotId
  }
})
const saveFormat = (e)=>{
  return {
    ...e,
    slot_id:props.slotId
  }
}

async function editClosed({row,column}) {
  try{
    const api = new Resource('content-items')
    await api.update(row.id,row)
    $toast.success('保存成功')
  }catch(e) {
    console.log(e)
  }
}
</script>
<template>
  <AppTable
      v-model="editingItem"
      :options="options"
      :filter-fields="filters"
      :fields="fields"
      create-open-type="modal"
      detail-open-type="modal"
      api-url="content-items"
      :request-data="requestData"
      :save-format="saveFormat"
      @edit-closed="editClosed"
  >
    <template #default_status="{data:{row}}">
      <v-chip label size="small" :color="row.status?'success':'error'">{{row.status?'正常':'禁用'}}</v-chip>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
