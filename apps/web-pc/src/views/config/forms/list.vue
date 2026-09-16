<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { onMounted, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';

import { Button, Tag } from 'antdv-next';

import Resource from '#/api/resource';

import LocaleManager from '../../content/_components/LocaleManager.vue';

import FormSchemaDrawer from './_components/FormSchemaDrawer.vue';
import { countFields } from './_components/formSchema.js';


const localeOptions = ref([]);

const statusItems = [
  { id: 0, name: '停用' },
  { id: 1, name: '启用' },
];

const filterFields = ref([
  { field: 'title', label: '标题', type: 'text', span: 8 },
  { field: 'code', label: '编码', type: 'text', span: 8 },
  { field: 'status', label: '状态', type: 'select', span: 8, attrs: { fieldNames: { label: 'name', value: 'id' },
      items: statusItems } },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'code', type: 'text', label: '编码', span: 12, attrs: { placeholder: '如 contact（小写/数字/下划线/中划线）' } },
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  {
    field: 'fields_schema',
    type: 'slot',
    label: '字段',
    span: 24,
    renderKey: 'fields_schema',
  },
  { field: 'status', type: 'select', label: '状态', span: 12, attrs: { items: statusItems } },
  { field: 'created_at', type: 'datetime', label: '创建时间', span: 12, displayOnly: true },
  {
    field: 'locale_manager',
    type: 'slot',
    label: '语言内容',
    span: 24,
    renderKey: 'locale_manager',
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'code', title: '编码', minWidth: 140 },
  { field: 'name', title: '名称', minWidth: 160 },
  {
    field: 'fields_schema',
    title: '字段',
    width: 90,
    formatter: ({ cellValue }) => countFields(cellValue),
  },
  { field: 'submissions_count', title: '提交数', width: 90, formatter: emptyText },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 170 },
]);

const formData = ref(null);
const crudRef = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

/* ===================== 字段配置抽屉 ===================== */
const [FieldsDrawer, fieldsDrawerApi] = useVbenDrawer({
  class: 'w-[960px]',
  destroyOnClose: true,
  // 禁止点击遮罩关闭，避免误触丢失未保存的字段配置
  closeOnClickModal: false,
  // 内容组件自带页脚（取消/保存），隐藏默认页脚
  footer: false,
});

const fieldsForm = ref(null);

function openFields(row) {
  fieldsForm.value = row || formData.value;
  fieldsDrawerApi.setState({
    title: `字段配置 - ${fieldsForm.value?.name || fieldsForm.value?.code || ''}`,
  });
  fieldsDrawerApi.open();
}

function closeFields() {
  fieldsDrawerApi.close();
}

function onFieldsSaved(schema) {
  if (formData.value) formData.value.fields_schema = schema;
  crudRef.value?.refresh();
  closeFields();
}

const actionsConfig = ref([
  {
    key: 'manage_fields',
    label: '字段',
    icon: 'mdi--form-select',
    permission: 'edit',
    onClick: (row) => openFields(row),
    order: 30,
  },
  {
    key: 'manage_submissions',
    label: '提交记录',
    icon: 'mdi--inbox-arrow-down',
    permission: 'edit',
    onClick: (row) => {
      window.location.href = `/config/form-submissions?form_id=${row.id}`;
    },
    order: 35,
  },
]);

onMounted(async () => {
  try {
    const { data } = await new Resource('applications/locale-catalog').list({});
    localeOptions.value = data || [];
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div class="h-full">
    <AppCrudTable
      ref="crudRef"
      api-url="forms"
      v-model="formData"
      :filter-fields="filterFields"
      :fields="formFields"
      :grid-options="{
        columns: gridColumns,
        showOverflow: false,
        columnConfig: { resizable: true },
      }"
      :open-mode="{ create: 'modal', detail: 'modal' }"
      :form-attrs="{ layout: 'vertical', size: 'medium' }"
      :actions-config="actionsConfig"
      :inline-actions="['view', 'edit', 'manage_fields', 'manage_submissions', 'delete']"
      permission-name="cms.form"
      title="表单管理"
      class="p-4"
    >
      <template #default_status="{ row }">
        <Tag :color="row.status ? 'green' : 'default'">{{ row.status_label || '-' }}</Tag>
      </template>

      <template #field_fields_schema="{ modelValue, formValue }">
        <div class="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
          <span class="text-sm text-gray-600">
            {{ countFields(modelValue) }} 个字段
          </span>
          <Button
            size="small"
            :disabled="!formValue?.id"
            @click="openFields(formValue)"
          >
            配置字段
          </Button>
        </div>
      </template>

      <template #field_locale_manager="{ modelValue, formValue }">
        <LocaleManager
          resource="forms"
          :row-id="formValue?.id"
          :locales="formValue?.locales || []"
          :locales-pool="localeOptions"
          :fields="[
            { field: 'title', label: '标题', type: 'text' },
            { field: 'submit_text', label: '提交按钮文字', type: 'text' },
            { field: 'success_message', label: '成功提示', type: 'textarea' },
          ]"
        />
      </template>
    </AppCrudTable>

    <FieldsDrawer>
      <FormSchemaDrawer
        :form="fieldsForm"
        @saved="onFieldsSaved"
        @close="closeFields"
      />
    </FieldsDrawer>
  </div>
</template>
