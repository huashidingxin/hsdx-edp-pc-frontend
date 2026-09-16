<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { Tag } from 'antdv-next';

import { setCurrentApplicationId } from '#/api/application-context';

import PageContentManager from './_components/PageContentManager.vue';

const router = useRouter();

/**
 * 双用组件：独立页面时读 localStorage 应用；嵌入应用卡片抽屉时由 appId 指定
 * （页面接口走请求头 X-Application-Id，需同步 localStorage）。
 */
const props = defineProps({
  appId: { type: [Number, String], default: null },
});

const TYPE_OPTIONS = [
  { id: 1, name: '首页' },
  { id: 2, name: '标准' },
  { id: 3, name: '自定义' },
  { id: 4, name: '记录' },
];
const typeColor = { 1: 'blue', 2: 'green', 3: 'purple', 4: 'orange' };

const filterFields = ref([
  { field: 'code', label: '编码', type: 'text', span: 8 },
  {
    field: 'type',
    label: '类型',
    type: 'select',
    span: 8,
    attrs: { fieldNames: { label: 'name', value: 'id' },
      items: TYPE_OPTIONS },
  },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  {
    field: 'code',
    type: 'text',
    label: '编码',
    span: 12,
    required: true,
    attrs: { placeholder: '如 home / about（小写字母/数字/下划线/中划线）' },
  },
  {
    field: 'type',
    type: 'select',
    label: '类型',
    span: 12,
    attrs: { items: TYPE_OPTIONS },
  },
  {
    field: 'record_binding',
    type: 'textarea',
    label: '记录绑定（JSON）',
    span: 24,
    attrs: { rows: 3 },
  },
  {
    field: 'created_at',
    type: 'datetime',
    label: '创建时间',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'updated_at',
    type: 'datetime',
    label: '更新时间',
    span: 12,
    displayOnly: true,
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'code', title: '编码', minWidth: 160 },
  {
    field: 'type',
    title: '类型',
    width: 90,
    slots: { default: 'default_type' },
  },
  {
    field: 'locales',
    title: '语言',
    minWidth: 220,
    slots: { default: 'default_locales' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 170 },
]);

const formData = ref(null);
const crudRef = ref(null);

// 页面内容抽屉：按块编辑 page_contents.data（静态数据），保存立即生效。
const contentOpen = ref(false);
const contentRow = ref(null);

function openContent(row) {
  contentRow.value = row;
  contentOpen.value = true;
}

/** 抽屉内改了页面语言（title/slug）时刷新列表，保证「语言」列不过期。 */
function refreshList() {
  crudRef.value?.refresh();
}

const actionsConfig = ref([
  {
    key: 'manage_content',
    label: '页面内容',
    icon: 'mdi--text-box-edit-outline',
    permission: 'edit',
    onClick: (row) => openContent(row),
    order: 34,
  },
  {
    key: 'manage_schema',
    label: '数据 Schema',
    icon: 'mdi--code-json',
    permission: 'edit',
    onClick: (row) => {
      // 用路由跳转而非 window.location，避免整页刷新丢失当前应用上下文
      router.push(`/site/page-data-schema/${row.id}`);
    },
    order: 35,
  },
]);

// 抽屉嵌入时以传入应用为准，并同步请求头上下文
onMounted(() => {
  const propApp = Number(props.appId);
  if (propApp > 0) {
    setCurrentApplicationId(propApp);
  }
});

watch(
  () => props.appId,
  (id) => {
    const num = Number(id);
    if (num > 0) {
      setCurrentApplicationId(num);
    }
  },
);
</script>

<template>
  <AppCrudTable
    ref="crudRef"
    api-url="pages"
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
    :inline-actions="['view', 'edit', 'manage_content', 'manage_schema', 'delete']"
    :max-inline-actions="5"
    permission-name="cms.page"
    title="页面管理"
    class="p-4"
  >
    <template #default_type="{ row }">
      <Tag :color="typeColor[row.type] || 'default'">{{ row.type_label || '-' }}</Tag>
    </template>
    <template #default_locales="{ row }">
      <div class="flex flex-wrap gap-1">
        <Tag
          v-for="l in row.locales || []"
          :key="l.locale"
        >
          {{ l.locale }}：{{ l.title || l.slug || l.locale }}
        </Tag>
        <span v-if="!row.locales?.length">-</span>
      </div>
    </template>
  </AppCrudTable>

  <PageContentManager
    v-model:open="contentOpen"
    :page="contentRow"
    @refresh="refreshList"
  />
</template>
