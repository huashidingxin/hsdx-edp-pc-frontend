<script setup>
import { onMounted, ref } from 'vue';

import { message, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const editingItem = ref({});

const categories = ref([]);
const procedures = ref([]);
const measures = ref([]);

async function loadOptions() {
  const [catRes, proRes, meaRes] = await Promise.all([
    new Resource('categories').list({ per_page: 'all', type: 'project' }),
    new Resource('procedures').list({ per_page: 'all' }),
    new Resource('measures').list({ per_page: 'all' }),
  ]);
  categories.value = catRes.data || [];
  procedures.value = (proRes.data || []).map((p) => ({
    value: p.id,
    label: p.name,
  }));
  measures.value = (meaRes.data || []).map((m) => ({
    value: m.id,
    label: m.name,
  }));

  for (const f of formFields.value) {
    if (f.field === 'project_category_id') f.attrs.options = categories.value;
    if (f.field === 'procedure_id') f.attrs.options = procedures.value;
    if (f.field === 'measure_id') f.attrs.options = measures.value;
  }
}

const formFields = ref([
  {
    field: 'keyword',
    type: 'text',
    label: '关键字',
    span: 12,
    required: true,
  },
  {
    field: 'procedure_id',
    type: 'select',
    label: '关联工序',
    span: 12,
    attrs: { options: [] },
  },
  {
    field: 'measure_id',
    type: 'select',
    label: '关联监理方式',
    span: 12,
    attrs: { options: [] },
  },
  {
    field: 'project_category_id',
    type: 'select',
    label: '生效项目分类',
    span: 12,
    attrs: { options: [], placeholder: '留空=全局生效' },
  },
  {
    field: 'status',
    type: 'select',
    label: '状态',
    span: 12,
    attrs: {
      options: [
        { value: 1, label: '启用' },
        { value: 0, label: '停用' },
      ],
    },
  },
]);

const filterFields = ref([
  { field: 'keyword', label: '关键词', type: 'text', span: 8 },
  {
    field: 'status',
    label: '状态',
    type: 'select',
    span: 8,
    attrs: {
      options: [
        { value: 1, label: '启用' },
        { value: 0, label: '停用' },
      ],
    },
  },
]);

const gridColumns = ref([
  { field: 'keyword', title: '关键字', minWidth: 140 },
  { field: 'procedure.name', title: '关联工序', minWidth: 140, slots: { default: 'default_procedure' } },
  { field: 'measure.name', title: '关联监理方式', minWidth: 140, slots: { default: 'default_measure' } },
  {
    field: 'project_category_id',
    title: '生效分类',
    width: 140,
    slots: { default: 'default_category' },
  },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

function saveFormat(payload) {
  if (!payload.procedure_id && !payload.measure_id) {
    message.error('关联工序和监理方式至少填写一项');
    return false;
  }
  return payload;
}

onMounted(() => {
  loadOptions();
});
</script>

<template>
  <AppCrudTable
    v-model="editingItem"
    api-url="log-association-rules"
    :filter-fields="filterFields"
    :fields="formFields"
    permission-name="log_rule"
    :inline-actions="['view', 'edit', 'delete']"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    title="日志关键字规则"
    class="p-4"
  >
    <template #default_procedure="{ row }">
      {{ row.procedure?.name || '-' }}
    </template>
    <template #default_measure="{ row }">
      {{ row.measure?.name || '-' }}
    </template>
    <template #default_category="{ row }">
      {{
        categories.find((c) => c.id === row.project_category_id)?.name || '全局'
      }}
    </template>
    <template #default_status="{ row }">
      <Tag v-if="row.status === 1" color="green">启用</Tag>
      <Tag v-else color="red">停用</Tag>
    </template>
  </AppCrudTable>
</template>
