<script setup>
/**
 * 字段配置（独立页）—— fields 资源 CRUD
 * 菜单 component=/field/list 对应；内嵌场景用 views/form/field-list.vue
 */
import { onMounted, ref } from 'vue';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const typeOptions = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'switch', label: '是否' },
  { value: 'number', label: '数字' },
  { value: 'digit', label: '小数' },
  { value: 'select', label: '选项' },
  { value: 'list', label: '列表' },
  { value: 'stakeholder', label: '相关单位' },
  { value: 'construction', label: '施工单位' },
  { value: 'unit_project', label: '单位工程' },
  { value: 'unit_project_code', label: '单位工程编号' },
  { value: 'date', label: '日期' },
  { value: 'time', label: '时间（不带日期）' },
  { value: 'datetime', label: '时间（带日期）' },
  { value: 'image', label: '单图片' },
  { value: 'images', label: '多图片' },
  { value: 'file', label: '文件' },
  { value: 'video', label: '视频' },
];

const formOptions = ref([]);
async function loadForms() {
  const { data } = await new Resource('forms').list({ per_page: 'all' });
  formOptions.value = (data || []).map((f) => ({ value: f.id, label: f.name }));
  const f = formFields.value.find((x) => x.field === 'form_id');
  if (f) f.attrs.options = formOptions.value;
  const f2 = filterFields.value.find((x) => x.field === 'form_id');
  if (f2) f2.attrs.options = formOptions.value;
}

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
  { field: 'form_id', label: '所属表单', type: 'select', span: 8, attrs: { options: [] } },
]);

const formFields = ref([
  { field: 'name', type: 'textarea', label: '名称', span: 12, required: true },
  { field: 'form_id', type: 'select', label: '所属表单', span: 12, required: true, attrs: { options: [] } },
  { field: 'type', type: 'select', label: '字段类型', span: 12, required: true, attrs: { options: typeOptions } },
  { field: 'hint', type: 'text', label: '填写提示', span: 12 },
  { field: 'placeholder', type: 'text', label: '占位提示', span: 12 },
  { field: 'options', type: 'combobox', label: '选项列表', span: 12, attrs: { multiple: true, placeholder: '输入选项后按回车新增' } },
  { field: 'sort', type: 'number', label: '排序', span: 6 },
  { field: 'required', type: 'switch', label: '必填', span: 6 },
  { field: 'failed_proof', type: 'switch', label: '不通过时上传证明', span: 6 },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'name', title: '名称', minWidth: 160 },
  { field: 'form.name', title: '表单', minWidth: 140 },
  { field: 'type', title: '类型', width: 100 },
  { field: 'required', title: '必填', width: 70 },
  { field: 'sort', title: '排序', width: 70 },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

onMounted(loadForms);
</script>

<template>
  <AppCrudTable
    api-url="fields"
    permission-name="field"
    :filter-fields="filterFields"
    :fields="formFields"
    :inline-actions="['view', 'edit', 'delete']"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="字段配置"
    class="p-4"
  >
    <template #default_required="{ row }">
      {{ row.required ? '是' : '否' }}
    </template>
  </AppCrudTable>
</template>
