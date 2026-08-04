<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { DatePicker, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

// 项目分类选项（主分类/多分类共用，categories?type=project）
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
}

const formFields = ref([
  { field: 'name', type: 'text', span: 12, label: '名称', required: true },
  { field: 'code', type: 'text', span: 12, label: '编号', attrs: { placeholder: '输入编号或由系统自动生成' } },
  { field: 'owner_name', type: 'text', span: 12, label: '业主单位', required: true },
  { field: 'supervision_department_name', type: 'text', span: 12, label: '监理部', required: true },
  { field: 'categories', type: 'select', span: 12, label: '分类', required: true, attrs: { options: [], multiple: true } },
  { field: 'category_id', type: 'select', span: 12, label: '主分类', required: true, attrs: { options: [] } },
  { field: 'start_end_time', type: 'slot', span: 12, label: '起止时间', required: true },
  { field: 'address.detail', type: 'text', span: 12, label: '详细地址', required: true },
  { field: 'state', type: 'select', span: 12, label: '状态', required: true, attrs: { options: [
    { value: 1, label: '待启动' },
    { value: 2, label: '进行中' },
    { value: 3, label: '已结束' },
  ] } },
]);

// 仅顶级项目；列表附带单位工程/桩号计数
const extraQuery = computed(() => ({ parent_id: 0, unit_project_count: 1, milepost_count: 1 }));

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 220 },
  { field: 'code', title: '编号', width: 120 },
  { field: 'category.name', title: '分类', minWidth: 120 },
  { field: 'owner_name', title: '业主', minWidth: 120 },
  { field: 'state', title: '状态', width: 100, slots: { default: 'default_state' } },
  { field: 'unit_project_count', title: '单位工程', width: 90 },
  { field: 'milepost_count', title: '桩号', width: 80 },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

const stateColorMap = { 1: 'orange', 2: 'blue', 3: 'green' };

// 详情回显：起止时间、多分类 id 数组、地址展开
function detailFormat(e) {
  const data = { ...e };
  if (data.start_time) data.start_end_time = [data.start_time, data.end_time];
  if (Array.isArray(data.categories)) data.categories = data.categories.map((c) => c.id);
  data['address.detail'] = data.address?.detail || '';
  return data;
}

// 保存：时间拆分、多分类 [{id}]、address 对象组装（无地图组件，位置降级为详细地址文本）
function saveFormat(e) {
  const payload = { ...e };
  if (Array.isArray(payload.start_end_time)) {
    payload.start_time = payload.start_end_time[0];
    payload.end_time = payload.start_end_time[1];
  }
  delete payload.start_end_time;
  if (Array.isArray(payload.categories)) payload.categories = payload.categories.map((id) => ({ id }));
  const detail = payload['address.detail'];
  delete payload['address.detail'];
  payload.address = {
    detail: detail || '',
    province: payload.address?.province || '',
    city: payload.address?.city || '',
    area: payload.address?.area || '',
  };
  return payload;
}

const editingItem = ref({});

// 选择分类后主分类自动跟随（web-admin 联动逻辑优化：仅当主分类未选或不在所选内）
watch(
  () => editingItem.value?.categories,
  (ids) => {
    if (!Array.isArray(ids) || !ids.length) return;
    const current = editingItem.value?.category_id;
    if (!current || !ids.includes(current)) {
      editingItem.value.category_id = ids[0];
    }
  },
);

onMounted(loadCategories);
</script>

<template>
  <AppCrudTable
    v-model="editingItem"
    api-url="projects"
    permission-name="project"
    :extra-query="extraQuery"
    :detail-format="detailFormat"
    :save-format="saveFormat"
    :fields="formFields"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
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

    <template #default_state="{ row }">
      <Tag :color="stateColorMap[row.state] || 'default'">{{ row.state_label || '-' }}</Tag>
    </template>
  </AppCrudTable>
</template>
