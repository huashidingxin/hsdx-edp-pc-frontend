<script setup lang="ts">
import FormTemplate from '../form-template/list'
import FormField from '../field/list.vue'
import {useProjectStore} from "@/store";

const projectStore = useProjectStore()

const options = ref({
  columns: [
    {field: 'name', title: '名称', fixed: 'left', width: '300px'},
    // {field: 'code', title: '编号'},
    {field: 'type_desc', title: '类型'},
    {field: 'category.name', title: '项目分类'},
    {field: 'template_count', title: '模板数',sortable:true},
    {field: 'created_at', title: '创建时间'},
  ],
  data: []
});
const filters = ref([
  {
    field: 'name',
    type: 'text',
    col: 3,
    label: '名称',
  },
  {
    field: 'project_category_id',
    type: 'select',
    col: 3,
    label: '项目类型',
    updateSearch:{
      apiUrl:'categories',
      params:{
        type:'project'
      }
    }
  },
  {
    field: 'type',
    type: 'select',
    col: 3,
    label: '类型',
    attrs:{
      items:[
        {id:1,name:'通用'},
        {id:2,name:'任务'},
        {id:3,name:'日志'},
        {id:4,name:'文档'},
      ]
    }
  },
]);

const fields = ref([
  {
    field: 'name',
    type: 'text',
    col: 5,
    label: '名称',
    rules: [v => !!v || '请输入名称']
  },
  {
    field: 'project_category_id',
    type: 'autocomplete',
    col: 4,
    label: '项目类型',
    updateSearch: {
      apiUrl: 'categories',
      priorityKey: 'id',
      params: {
        type: 'project'
      }
    },
    attrs: {
      placeholder: '输入名称搜索',
    },
  },
  {
    field: 'type',
    type: 'select',
    col: 3,
    label: '类型',
    rules: [v => !!v || '请选择类型'],
    attrs:{
      items:[
        {id:1,name:'通用'},
        {id:2,name:'任务'},
        {id:3,name:'日志'},
        {id:4,name:'文档'},
      ]
    }
  },
  {
    field: 'setting',
    type: 'slot',
    col: 12,
    label: '表单设置',
  },
]);

const editingItem = ref({})

// 表单配置设置
const formSetting = ref({
  frequency: 'monthly',
  interval: 1,
  day_index: 25,
  deadline_time: '20:00:00',
})

const frequencyOptions = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
  { value: 'start', label: '项目开始' },
  { value: 'end', label: '项目结束' },
]

const weekDayOptions = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 0, label: '周日' },
]

const dayIndexOptions = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}日`,
}))

// 监听编辑项变化，加载已有的表单配置
watch(
  () => editingItem.value.id,
  (newId) => {
    if (newId && editingItem.value.setting) {
      formSetting.value = {
        frequency: editingItem.value.setting.frequency || 'monthly',
        interval: editingItem.value.setting.interval || 1,
        day_index: editingItem.value.setting.day_index || 25,
        deadline_time: editingItem.value.setting.deadline_time || '20:00:00',
      }
    } else {
      // 重置默认值
      formSetting.value = {
        frequency: 'monthly',
        interval: 1,
        day_index: 25,
        deadline_time: '20:00:00',
      }
    }
  },
  { immediate: true }
)

function saveFormat(e) {
  if(e.type == 4) {
    e.setting = formSetting.value
  }
  return e;
}


</script>
<template>
  <AppTable
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    :fields="fields"
    api-url="forms"
    permission-name="form"
    :save-format="saveFormat"
  >
    <template #field_setting>
      <div v-if="editingItem.type == 4" class="space-y-4">
        <div class="grid grid-cols-12 gap-4">
          <!-- 填写频率 -->
          <div class="col-span-3">
            <label class="block text-sm font-medium text-gray-700 mb-1">填写频率</label>
            <v-select
              v-model="formSetting.frequency"
              :items="frequencyOptions"
              item-value="value"
              item-title="label"
              label="选择频率"
              density="compact"
              variant="outlined"
              hide-details
            />
          </div>

          <!-- 周几 (仅每周显示) -->
          <div class="col-span-2" v-if="formSetting.frequency === 'weekly'">
            <label class="block text-sm font-medium text-gray-700 mb-1">星期</label>
            <v-select
              v-model.number="formSetting.day_index"
              :items="weekDayOptions"
              item-value="value"
              item-title="label"
              label="选择星期"
              density="compact"
              variant="outlined"
              hide-details
              :rules="[v=> weekDayOptions.find(e=>e.value == v) || '请选择日期']"
            />
          </div>
          
          <!-- 几号 (仅每月/每年显示) -->
          <div class="col-span-2" v-if="formSetting.frequency === 'monthly' || formSetting.frequency === 'yearly'">
            <label class="block text-sm font-medium text-gray-700 mb-1">截止日期</label>
            <v-select
              v-model.number="formSetting.day_index"
              :items="dayIndexOptions"
              item-value="value"
              item-title="label"
              label="选择日期"
              density="compact"
              variant="outlined"
              hide-details
              :rules="[v=> dayIndexOptions.find(e=>e.value == v) || '请选择日期']"
            />
          </div>
          
          <!-- 截止时间 -->
          <div class="col-span-1" v-if="formSetting.frequency !== 'start' && formSetting.frequency !== 'end'">
            <label class="block text-sm font-medium text-gray-700 mb-1">截止时间</label>
            <v-text-field
              v-model="formSetting.deadline_time"
              type="time"
              label="选择时间"
              density="compact"
              variant="outlined"
              hide-details
            />
          </div>
        </div>
      </div>
    </template>

    <template v-if="editingItem.id" #form_default>
      <div class="my-2">
        <FormField :form-id="editingItem.id"></FormField>
      </div>
      <div class="my-2">
        <FormTemplate :form-id="editingItem.id" :type="editingItem.type" :form-fields="editingItem.fields"></FormTemplate>
      </div>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
