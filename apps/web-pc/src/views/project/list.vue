<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { DatePicker, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppChooseLocation from '#/components/AppChooseLocation.vue';

// 项目分类选项（主分类/多分类/筛选共用，categories?type=project）
const categories = ref([]);
async function loadCategories() {
  const { data } = await new Resource('categories').list({
    per_page: 'all',
    type: 'project',
  });
  categories.value = (data || []).map((c) => ({ value: c.id, label: c.name }));
  const f = (field) => formFields.value.find((x) => x.field === field);
  f('categories').attrs.options = categories.value;
  f('category_id').attrs.options = categories.value;
  const ff = (field) => filterFields.value.find((x) => x.field === field);
  ff('categories').attrs.options = categories.value;
}

const stateNameMap = { 1: '待启动', 2: '进行中', 3: '已结束' };
const stateOptions = [1, 2, 3].map((value) => ({
  value,
  label: stateNameMap[value],
}));

// P1-004 所属单位（公司）
async function loadCompanies() {
  try {
    const { data } = await new Resource('companies').list({ per_page: 'all' });
    const f = (field) => formFields.value.find((x) => x.field === field);
    f('company_id').attrs.options = (data || []).map((c) => ({
      value: c.id,
      label: c.name,
    }));
  } catch (error) {
    console.error(error);
  }
}

// 列表筛选：名称/编号 like，分类多选（categories.id in），状态多选（states in）
const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 6 },
  { field: 'code', label: '编号', type: 'text', span: 6 },
  {
    field: 'categories',
    label: '分类',
    type: 'select',
    span: 6,
    attrs: { options: [], multiple: true },
  },
  {
    field: 'states',
    label: '状态',
    type: 'select',
    span: 6,
    attrs: { options: stateOptions, multiple: true },
  },
]);

const formFields = ref([
  { field: 'name', type: 'text', span: 12, label: '名称', required: true },
  {
    field: 'code',
    type: 'text',
    span: 12,
    label: '编号',
    attrs: { placeholder: '输入编号或由系统自动生成' },
  },
  {
    field: 'owner_name',
    type: 'text',
    span: 12,
    label: '业主单位',
    required: true,
  },
  {
    field: 'supervision_department_name',
    type: 'text',
    span: 12,
    label: '监理部',
    required: true,
  },
  {
    field: 'categories',
    type: 'select',
    span: 12,
    label: '分类',
    required: true,
    attrs: { options: [], multiple: true },
  },
  {
    field: 'category_id',
    type: 'select',
    span: 12,
    label: '主分类',
    required: true,
    attrs: { options: [] },
  },
  {
    field: 'start_end_time',
    type: 'slot',
    span: 12,
    label: '起止时间',
    required: true,
  },
  {
    field: 'location',
    type: 'slot',
    span: 12,
    label: '项目位置',
    required: true,
  },
  {
    field: 'state',
    type: 'select',
    span: 12,
    label: '状态',
    required: true,
    attrs: { options: stateOptions },
  },
  {
    field: 'company_id',
    type: 'select',
    span: 12,
    label: '所属单位',
    attrs: { options: [], placeholder: '选择公司（用于数据汇总）' },
  },
]);

// 仅顶级项目；列表附带单位工程/桩号计数
const extraQuery = computed(() => ({
  parent_id: 0,
  unit_project_count: 1,
  milepost_count: 1,
}));

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 220 },
  { field: 'code', title: '编号', width: 120 },
  {
    field: 'categories',
    title: '分类',
    minWidth: 120,
    slots: { default: 'default_categories' },
  },
  { field: 'owner_name', title: '业主', minWidth: 120 },
  {
    field: 'state',
    title: '状态',
    width: 100,
    slots: { default: 'default_state' },
  },
  { field: 'unit_project_count', title: '单位工程', width: 90 },
  { field: 'milepost_count', title: '桩号', width: 80 },
  { field: 'created_at', title: '创建时间', minWidth: 180 },
]);

const stateColorMap = { 1: 'orange', 2: 'blue', 3: 'green' };

// 详情回显：起止时间、多分类 id 数组、地址对象（地图选点回显）
function detailFormat(e) {
  const data = { ...e };
  if (data.start_time) data.start_end_time = [data.start_time, data.end_time];
  if (Array.isArray(data.categories))
    data.categories = data.categories.map((c) => c.id);
  data.location = data.address || {};
  return data;
}

// 保存：时间拆分、多分类 [{id}]、address 对象组装（含经纬度，来自地图选点）
function saveFormat(e) {
  const payload = { ...e };
  if (Array.isArray(payload.start_end_time)) {
    payload.start_time = payload.start_end_time[0];
    payload.end_time = payload.start_end_time[1];
  }
  delete payload.start_end_time;
  if (Array.isArray(payload.categories))
    payload.categories = payload.categories.map((id) => ({ id }));
  const loc = payload.location || {};
  delete payload.location;
  payload.address = {
    detail: loc.detail || '',
    province: loc.province || '',
    province_id: loc.province_id,
    city: loc.city || '',
    city_id: loc.city_id,
    area: loc.area || '',
    area_id: loc.area_id,
    town: loc.town || '',
    town_id: loc.town_id,
    longitude: loc.longitude,
    latitude: loc.latitude,
  };
  return payload;
}

const editingItem = ref({});

// 选择分类后主分类自动跟随（web-admin 联动逻辑优化：仅当主分类未选或不在所选内）
watch(
  () => editingItem.value?.categories,
  (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const current = editingItem.value?.category_id;
    if (!current || !ids.includes(current)) {
      editingItem.value.category_id = ids[0];
    }
  },
);

onMounted(() => {
  loadCategories();
  loadCompanies();
});
</script>

<template>
  <AppCrudTable
    v-model="editingItem"
    api-url="projects"
    permission-name="project"
    :extra-query="extraQuery"
    :filter-fields="filterFields"
    :detail-format="detailFormat"
    :save-format="saveFormat"
    :fields="formFields"
    list-scope="3"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="项目管理"
    class="p-4"
  >
    <template #field_start_end_time="{ modelValue, update }">
      <DatePicker.RangePicker
        :value="modelValue"
        value-format="YYYY-MM-DD HH:mm:ss"
        show-time
        format="YYYY-MM-DD HH:mm"
        style="width: 100%"
        placeholder="['开始时间', '结束时间']"
        @change="update"
      />
    </template>

    <template #field_location="{ modelValue, update }">
      <AppChooseLocation
        :model-value="modelValue || {}"
        :return-address="true"
        label="项目位置"
        placeholder="点击地图选点定位项目"
        @update:model-value="update"
      />
    </template>

    <template #default_categories="{ row }">
      <span>
        {{
          (row.categories || [])
            .map((c) => c.name)
            .filter(Boolean)
            .join('、') ||
          row.category?.name ||
          '-'
        }}
      </span>
    </template>

    <template #default_state="{ row }">
      <Tag :color="stateColorMap[row.state] || 'default'">
        {{ row.state_label || stateNameMap[row.state] || '-' }}
      </Tag>
    </template>
  </AppCrudTable>
</template>
