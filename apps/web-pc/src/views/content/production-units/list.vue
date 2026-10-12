<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { computed, onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';
import { useCurrentAppStore } from '#/store/current-app';

import ContentPublishModal from '../_components/ContentPublishModal.vue';
import { useAppQueryFilter } from '../_components/useAppQueryFilter.js';
import { useCustomFieldSchemas } from '../_components/useCustomFieldSchemas.js';

import LocaleManager from '../_components/LocaleManager.vue';

/**
 * 机组管理
 *
 * 机组是独立内容模型（production_units + production_unit_locales，2026-10 从文章拆出），
 * production_line_id 指向所属生产线；不挂任何分类维度（从属关系即归属）。
 */
const statusColor = { 0: 'default', 1: 'green', 2: 'orange' };

const localeOptions = ref([]);
const lines = ref([]);

const statusItems = [
  { id: 0, name: '草稿' },
  { id: 1, name: '已发布' },
  { id: 2, name: '已归档' },
];

const appStore = useCurrentAppStore();
const crudRef = ref(null);
const cf = useCustomFieldSchemas('production-unit');
const props = defineProps({ appId: { type: [Number, String], default: null } });
const { appFilterDefault, suggestedAppId, onFiltersUpdate, embedded } = useAppQueryFilter(crudRef, () => props.appId);

const appOptions = computed(() =>
  (appStore.applications || []).map((a) => ({ id: a.id, name: a.name })),
);

const formData = ref(null);

function lineTitle(id) {
  return lines.value.find((l) => l.id === Number(id))?.title || (id ? `#${id}` : '-');
}

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
  {
    field: 'production_line_id',
    label: '所属生产线',
    type: 'select',
    span: 8,
    attrs: {
      allowClear: true,
      placeholder: '全部生产线',
      options: lines,
      fieldNames: { label: 'title', value: 'id' },
      showSearch: true,
    },
  },
  { field: 'title', label: '标题', type: 'text', span: 8 },
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

const formFields = [
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  {
    field: 'production_line_id',
    type: 'select',
    label: '所属生产线',
    span: 12,
    required: true,
    attrs: {
      options: lines,
      fieldNames: { label: 'title', value: 'id' },
      showSearch: true,
    },
  },
  { field: 'cover', type: 'image', label: '大图', span: 12 },
  { field: 'sort', type: 'number', label: '排序', span: 12 },
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

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  {
    field: 'title',
    title: '标题',
    minWidth: 180,
    formatter: ({ row }) => row.locales?.[0]?.title || '-',
  },
  {
    field: 'production_line_id',
    title: '所属生产线',
    minWidth: 160,
    slots: { default: 'default_line' },
  },
  {
    field: 'cover',
    title: '大图',
    width: 100,
    slots: { default: 'default_cover' },
  },
  { field: 'sort', title: '排序', width: 80 },
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

const publishOpen = ref(false);
const publishRow = ref(null);
const publishIds = computed(() =>
  (publishRow.value?.published_applications || []).map((a) => Number(a.id)),
);
const publishTitle = computed(
  () => publishRow.value?.locales?.[0]?.title || `#${publishRow.value?.id ?? ''}`,
);

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

/** 语言 tabs 内的字段：固定字段 + 租户声明的自定义字段（动态）。 */
const localeFields = computed(() => [
  { field: 'title', label: '标题', type: 'text' },
  { field: 'slug', label: 'Slug', type: 'text' },
  { field: 'body', label: '正文', type: 'editor' },
  { field: 'attributes', label: '参数', type: 'json' },
  { field: 'seo_title', label: 'SEO 标题', type: 'text' },
  { field: 'seo_description', label: 'SEO 描述', type: 'textarea' },
  { field: 'seo_keywords', label: 'SEO 关键词', type: 'text' },  ...cf.localeFields.value,
]);

onMounted(async () => {
  // 租户自定义字段：按内容模型拉声明（未声明时静默为空）
  await cf.load();
  try {
    await appStore.loadApplications();
  } catch (error) {
    console.error(error);
  }
  try {
    const { data } = await new Resource('applications/locale-catalog').list({});
    localeOptions.value = data || [];
  } catch (error) {
    console.error(error);
  }
  try {
    const { data } = await new Resource('production-lines').list({ per_page: 100 });
    lines.value = (data || []).map((row) => ({
      id: row.id,
      title: row.locales?.[0]?.title || `#${row.id}`,
    }));
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div>
  <AppCrudTable
    ref="crudRef"
    api-url="production-units"
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
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :detail-format="cf.detailFormat"
    :save-format="cf.saveFormat"
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
    permission-name="cms.production_unit"
    title="机组管理"
    class="p-4"
  >
    <template #sub-title>
      <span class="text-xs text-gray-400">
        内容全局管理 · 机组从属生产线 · 用首位的「应用」筛选查看某站点的发布情况
      </span>
    </template>
    <template #default_line="{ row }">
      <Tag color="blue">{{ lineTitle(row.production_line_id) }}</Tag>
    </template>
    <template #default_cover="{ row }">
      <img
        v-if="row.cover"
        :src="row.cover"
        alt=""
        class="h-10 w-14 rounded object-cover"
      />
      <span v-else>-</span>
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

    <template #field_locale_manager="{ formValue }">
      <LocaleManager
        resource="production-units"
        :row-id="formValue?.id"
        :locales="formValue?.locales || []"
        @update:locales="(v) => { if (formValue) formValue.locales = v; }"
        :locales-pool="localeOptions"
        :fields="localeFields"
      />
    </template>
  </AppCrudTable>

  <ContentPublishModal
    v-model:open="publishOpen"
    :suggested-app-id="suggestedAppId"
    resource="production-units"
    :content-id="publishRow?.id"
    :content-title="publishTitle"
    :initial-ids="publishIds"
    :applications="appStore.applications"
    @saved="handlePublished"
  />
  </div>
</template>
