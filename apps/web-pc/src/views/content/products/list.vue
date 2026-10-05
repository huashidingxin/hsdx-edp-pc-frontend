<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { computed, onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';
import { useCurrentAppStore } from '#/store/current-app';

import ContentPublishModal from '../_components/ContentPublishModal.vue';
import { useAppQueryFilter } from '../_components/useAppQueryFilter.js';
import { useCustomCategoryFields } from '../_components/useCustomCategoryFields.js';

import LocaleManager from '../_components/LocaleManager.vue';

const statusColor = { 0: 'default', 1: 'green', 2: 'orange' };

const categories = ref([]);
const localeOptions = ref([]);

const statusItems = [
  { id: 0, name: '草稿' },
  { id: 1, name: '已发布' },
  { id: 2, name: '已归档' },
];

const appStore = useCurrentAppStore();
const crudRef = ref(null);
const props = defineProps({ appId: { type: [Number, String], default: null } });
const { appFilterDefault, suggestedAppId, onFiltersUpdate, embedded } = useAppQueryFilter(crudRef, () => props.appId);

/** 应用筛选选项（第一筛选位）：全部 + 各应用；内容默认全局展示。 */
const appOptions = computed(() =>
  (appStore.applications || []).map((a) => ({ id: a.id, name: a.name })),
);

const filterFields = ref([
  {
    field: 'application_id',
    label: '应用',
    default: appFilterDefault,
    type: 'select',
    span: 8,
    attrs: {
      allowClear: true,
      placeholder: '全部应用',
      options: appOptions,
      fieldNames: { label: 'name', value: 'id' },
      showSearch: true,
    },
  },
  { field: 'title', label: '标题', type: 'text', span: 8 },
  {
    field: 'category_id',
    label: '分类',
    type: 'select',
    span: 8,
    attrs: {
      options: categories,
      fieldNames: { label: 'name', value: 'id' },
      showSearch: true,
    },
  },
  { field: 'status', label: '状态', type: 'select', span: 8, attrs: { options: statusItems, fieldNames: { label: 'name', value: 'id' } } },
  {
    field: 'publish_state',
    label: '发布范围',
    type: 'select',
    span: 8,
    attrs: {
      allowClear: true,
      placeholder: '全部',
      fieldNames: { label: 'name', value: 'id' },
      options: [
        { id: 'published', name: '已发布' },
        { id: 'unpublished', name: '未发布' },
      ],
    },
  },
]);

const cc = useCustomCategoryFields('product');

const baseFormFields = [
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  {
    field: 'category_id',
    type: 'select',
    label: '分类',
    span: 12,
    attrs: { options: categories, fieldNames: { label: 'name', value: 'id' }, showSearch: true },
  },
  { field: 'sku', type: 'text', label: 'SKU', span: 12 },
  { field: 'cover', type: 'text', label: '封面', span: 12 },
  { field: 'price', type: 'number', label: '价格', span: 12 },
  { field: 'sort', type: 'number', label: '排序', span: 12 },
  {
    field: 'media',
    type: 'textarea',
    label: '媒体（JSON）',
    span: 24,
    displayOnly: true,
    attrs: { rows: 3 },
  },
  // 附件以 uploads 为唯一来源（object_field=attachments），提交时是 URL 数组
  { field: 'attachments', type: 'files', label: '附件', span: 24 },
  {
    field: 'published_at',
    type: 'datetime',
    label: '发布时间',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'locale_manager',
    type: 'slot',
    label: '语言内容',
    span: 24,
    renderKey: 'locale_manager',
  },
];

/**
 * 表单字段 = 固定字段 + 租户声明的扩展分类维度（按内容模型收敛）。
 * 产品：品类走公共分类 category_id，品牌/场景走扩展分类。
 */
const formFields = computed(() => [...baseFormFields, ...cc.fields.value]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  {
    field: 'title',
    title: '标题',
    minWidth: 200,
    formatter: ({ row }) => row.locales?.[0]?.title || '-',
  },
  {
    field: 'category',
    title: '分类',
    width: 110,
    slots: { default: 'default_category' },
  },
  { field: 'sku', title: 'SKU', minWidth: 110, formatter: emptyText },
  { field: 'price', title: '价格', width: 100, formatter: emptyText },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 160 },
  {
    field: 'published_applications',
    title: '发布范围',
    minWidth: 180,
    slots: { default: 'default_published' },
  },
]);



const formData = ref(null);
/* ===================== 发布到应用 ===================== */
const publishOpen = ref(false);
const publishRow = ref(null);
const publishIds = computed(() =>
  (publishRow.value?.published_applications || []).map((a) => Number(a.id)),
);
const publishTitle = computed(
  () => publishRow.value?.locales?.[0]?.title || `#${publishRow.value?.id ?? ''}`,
);

/** 是否发布到租户全部应用（= 通用）。 */
function isGlobal(row) {
  const ids = (row?.published_applications || []).map((a) => Number(a.id));
  if (ids.length === 0 || appStore.applications.length === 0) return false;
  return appStore.applications.every((a) => ids.includes(Number(a.id)));
}

function openPublish(row) {
  publishRow.value = row;
  publishOpen.value = true;
}

function handlePublished() {
  crudRef.value?.refresh();
}

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

onMounted(async () => {
  try {
    await appStore.loadApplications();
  } catch (error) {
    console.error(error);
  }
  // 扩展分类：按内容模型拉适用维度 + 各维度节点选项（未声明维度时静默为空）
  await cc.load();
  try {
    const { data } = await new Resource('categories').list({ per_page: 100, type: 3 });
    categories.value = data || [];
  } catch (error) {
    console.error(error);
  }
  try {
    const { data } = await new Resource('applications/locale-catalog').list({});
    localeOptions.value = data || [];
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div :class="embedded ? 'h-full' : ''">
    <!--
      h-full 仅在抽屉嵌入时加：抽屉把高度钉死，需要高度链一路撑满，
      表格才能在内部滚动、分页器固定可见。独立页面必须保持 auto，
      否则表格被钉在视口高度里，页面级滚动失效。
    -->
  <AppCrudTable
    ref="crudRef"
    api-url="products"
    v-model="formData"
    @update:filters="onFiltersUpdate"
    :exclude-filters="embedded ? ['application_id'] : []"
    :filter-fields="filterFields"
    :fields="formFields"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :detail-format="cc.detailFormat"
    :save-format="cc.saveFormat"
    :actions-config="[
      {
        key: 'publish',
        label: '发布',
        icon: 'lucide--send',
        permission: 'edit',
        onClick: (row) => openPublish(row),
        order: 30,
      },
    ]"
    :inline-actions="['view', 'edit', 'publish', 'delete']"
    permission-name="cms.product"
    title="产品管理"
    class="p-4"
  >
    <template #sub-title>
      <span class="text-xs text-gray-400">
        内容全局管理 · 用首位的「应用」筛选查看某站点的发布情况
      </span>
    </template>
    <template #default_category="{ row }">
      <Tag color="blue">
        {{ categories.find((c) => c.id === row.category_id)?.name || '-' }}
      </Tag>
    </template>
    <template #default_status="{ row }">
      <Tag :color="statusColor[row.status] || 'default'">{{ row.status_label || '-' }}</Tag>
    </template>

    <template #default_published="{ row }">
      <span v-if="isGlobal(row)">
        <Tag color="green">通用</Tag>
      </span>
      <span v-else-if="row.published_applications?.length" class="flex flex-wrap gap-1">
        <Tag
          v-for="app in row.published_applications"
          :key="app.id"
          color="blue"
        >
          {{ app.name || `#${app.id}` }}
        </Tag>
      </span>
      <Tag v-else color="default">未发布</Tag>
    </template>

    <template #field_locale_manager="{ modelValue, formValue }">
      <LocaleManager
        resource="products"
        :row-id="formValue?.id"
        :locales="formValue?.locales || []"
        @update:locales="(v) => { if (formValue) formValue.locales = v; }"
        :locales-pool="localeOptions"
        :fields="[
          { field: 'title', label: '标题', type: 'text' },
          { field: 'slug', label: 'Slug', type: 'text' },
          { field: 'summary', label: '摘要', type: 'textarea' },
          { field: 'body', label: '详情', type: 'textarea' },
          { field: 'seo_title', label: 'SEO 标题', type: 'text' },
          { field: 'seo_description', label: 'SEO 描述', type: 'textarea' },
          { field: 'seo_keywords', label: 'SEO 关键词', type: 'text' },
        ]"
      />
    </template>
  </AppCrudTable>

  <ContentPublishModal
    v-model:open="publishOpen"
    :suggested-app-id="suggestedAppId"
    resource="products"
    :content-id="publishRow?.id"
    :content-title="publishTitle"
    :initial-ids="publishIds"
    :applications="appStore.applications"
    @saved="handlePublished"
  />
  </div>
</template>
