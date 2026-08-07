<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { Button, Select, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

import FormTemplateList from './form-template-list.vue';

const router = useRouter();
const editingItem = ref({});

const categories = ref([]);
async function loadCategories() {
  const { data } = await new Resource('categories').list({
    per_page: 'all',
    type: 'project',
  });
  categories.value = (data || []).map((c) => ({ value: c.id, label: c.name }));
  const f = formFields.value.find((x) => x.field === 'project_category_id');
  if (f) f.attrs.options = categories.value;
  const f2 = filterFields.value.find((x) => x.field === 'project_category_id');
  if (f2) f2.attrs.options = categories.value;
}

const typeOptions = [
  { value: 1, label: '通用' },
  { value: 2, label: '任务' },
  { value: 3, label: '日志' },
  { value: 4, label: '文档' },
];

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
  {
    field: 'project_category_id',
    label: '项目分类',
    type: 'select',
    span: 8,
    attrs: { options: [] },
  },
  {
    field: 'type',
    label: '类型',
    type: 'select',
    span: 8,
    attrs: { options: typeOptions },
  },
]);

const formFields = ref([
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  {
    field: 'project_category_id',
    type: 'select',
    label: '项目分类',
    span: 12,
    attrs: { options: [] },
  },
  {
    field: 'type',
    type: 'select',
    label: '类型',
    span: 12,
    required: true,
    attrs: { options: typeOptions },
  },
  { field: 'setting', type: 'slot', label: '表单设置', span: 24 },
]);

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 200 },
  {
    field: 'type_desc',
    title: '类型',
    width: 100,
    slots: { default: 'default_type' },
  },
  { field: 'category.name', title: '项目分类', minWidth: 140 },
  { field: 'template_count', title: '模板数', width: 100 },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

// 文档表单（type=4）填写频率设置
const frequencyOptions = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
  { value: 'start', label: '项目开始' },
  { value: 'end', label: '项目结束' },
];
const weekDayOptions = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 0, label: '周日' },
];
const dayIndexOptions = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}日`,
}));

const formSetting = ref({
  frequency: 'monthly',
  interval: 1,
  day_index: 25,
  deadline_time: '20:00:00',
});

function loadSettingFromEdit(item) {
  formSetting.value = item?.setting
    ? {
        frequency: item.setting.frequency || 'monthly',
        interval: item.setting.interval || 1,
        day_index: item.setting.day_index || 25,
        deadline_time: item.setting.deadline_time || '20:00:00',
      }
    : {
        frequency: 'monthly',
        interval: 1,
        day_index: 25,
        deadline_time: '20:00:00',
      };
}

function saveFormat(payload) {
  const p = { ...payload };
  if (p.type === 4) p.setting = formSetting.value;
  return p;
}

const formFieldListKey = ref(0);

// 编辑打开时（id 变化）加载文档频率设置并刷新字段子表
watch(
  () => editingItem.value?.id,
  (id) => {
    if (!id) return;
    loadSettingFromEdit(editingItem.value);
    formFieldListKey.value += 1;
  },
);

loadCategories();
</script>

<template>
  <AppCrudTable
    v-model="editingItem"
    api-url="forms"
    :filter-fields="filterFields"
    :fields="formFields"
    permission-name="form"
    :inline-actions="['view', 'edit']"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :save-format="saveFormat"
    title="表单管理"
    class="p-4"
  >
    <template #default_type="{ row }">
      <Tag>{{ row.type_desc || '-' }}</Tag>
    </template>

    <template #field_setting>
      <div v-if="editingItem.type === 4" class="grid grid-cols-12 gap-4">
        <div class="col-span-3">
          <label class="mb-1 block text-sm text-gray-500">填写频率</label>
          <Select
            v-model:value="formSetting.frequency"
            :options="frequencyOptions"
            style="width: 100%"
          />
        </div>
        <div v-if="formSetting.frequency === 'weekly'" class="col-span-2">
          <label class="mb-1 block text-sm text-gray-500">星期</label>
          <Select
            v-model:value="formSetting.day_index"
            :options="weekDayOptions"
            style="width: 100%"
          />
        </div>
        <div
          v-if="
            formSetting.frequency === 'monthly' ||
            formSetting.frequency === 'yearly'
          "
          class="col-span-2"
        >
          <label class="mb-1 block text-sm text-gray-500">截止日期</label>
          <Select
            v-model:value="formSetting.day_index"
            :options="dayIndexOptions"
            style="width: 100%"
          />
        </div>
        <div
          v-if="
            formSetting.frequency !== 'start' && formSetting.frequency !== 'end'
          "
          class="col-span-2"
        >
          <label class="mb-1 block text-sm text-gray-500">截止时间</label>
          <input
            v-model="formSetting.deadline_time"
            type="time"
            class="w-full rounded border border-gray-300 px-2 py-1"
          />
        </div>
      </div>
    </template>

    <template #form-default>
      <div v-if="editingItem.id" class="mt-2 space-y-4">
        <div class="flex items-center justify-between rounded border px-3 py-2">
          <div class="text-sm text-gray-500">
            字段与校验规则已迁移到独立配置页
          </div>
          <Button
            type="primary"
            size="small"
            @click="
              router.push({
                path: '/field-config',
                query: { form_id: editingItem.id },
              })
            "
          >
            配置字段与校验规则 →
          </Button>
        </div>
        <FormTemplateList
          :key="`tpl-${formFieldListKey}`"
          :form-id="editingItem.id"
          :type="editingItem.type"
        />
      </div>
    </template>
  </AppCrudTable>
</template>
