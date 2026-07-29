<script setup>
import { ref } from 'vue';

import { Tag } from 'antdv-next';

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 6 },
  { field: 'username', label: '用户名', type: 'text', span: 6 },
  { field: 'mobile', label: '手机号', type: 'text', span: 6 },
  { field: 'email', label: '邮箱', type: 'text', span: 6 },
]);

const formFields = ref([
  { field: 'title', type: 'text', label: '标题', span: 24 },
  { field: 'summary', type: 'textarea', label: '简介', span: 24 },
  { field: 'image', type: 'file', label: '封面', span: 24 },
  { field: 'content', type: 'editor', label: '详情', span: 24 },
]);

const gridColumns = ref([
  {
    field: 'id',
    title: 'ID',
    align: 'left',
    width: 150,
    slots: { default: 'default_id' },
  },
  {
    field: 'title',
    title: '名称',
    align: 'left',
    minWidth: 120,
    formatter: emptyText,
  },
    {
    field: 'image',
    title: '封面',
    minWidth: 120,
    customRender:{type:'image'}
  },
  { field: 'created_at', title: '创建时间', width: 150 },
]);

const formData = ref(null);
const crudRef = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

function openDetail(row) {
  crudRef.value?.openDetail(row.id);
}

async function loadCategories() {
  try{
    const api = new Resource('article-categories')
    const {data} = await api.list({per_page:'all'})
  }catch(e) {
    console.log(e)
  }
}


</script>
<template>
  <AppCrudTable
    ref="crudRef"
    api-url="articles"
    v-model="formData"
    :filter-fields="filterFields"
    :fields="formFields"
    :grid-options="{ columns: gridColumns,showOverflow: false,
  columnConfig: {
    resizable: true
  },}"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="文章"
    class="p-4"
  >

  </AppCrudTable>
</template>
