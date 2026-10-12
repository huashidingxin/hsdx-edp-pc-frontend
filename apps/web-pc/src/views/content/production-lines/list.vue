<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { computed, onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';
import { useCurrentAppStore } from '#/store/current-app';

import ContentPublishModal from '../_components/ContentPublishModal.vue';
import { useAppQueryFilter } from '../_components/useAppQueryFilter.js';
import { useCustomCategoryFields } from '../_components/useCustomCategoryFields.js';
import { useCustomFieldSchemas } from '../_components/useCustomFieldSchemas.js';
import LocaleManager from '../_components/LocaleManager.vue';

/**
 * 生产线管理
 *
 * 生产线是独立内容模型（production_lines + production_line_locales，2026-10 从文章拆出），
 * 不再占用公共分类（category_id）：维度归属（品牌 / 生产线类型）由扩展分类承载，
 * 表单里的维度多选按租户声明（custom_category_dimensions.models 含 production-line）渲染。
 */
const statusColor = { 0: 'default', 1: 'green', 2: 'orange' };

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

const formData = ref(null);

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

const cc = useCustomCategoryFields('production-line');
const cf = useCustomFieldSchemas('production-line');

const baseFormFields = [
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
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

/** 表单字段 = 固定字段 + 租户声明的扩展分类维度（brand / line）。 */
const formFields = computed(() => [...baseFormFields, ...cc.fields.value]);

/** 语言 tabs 内的字段：固定字段 + 租户声明的自定义字段（动态）。 */
const localeFields = computed(() => [
  { field: 'title', label: '标题', type: 'text' },
  { field: 'slug', label: 'Slug', type: 'text' },
  { field: 'summary', label: '英文标语', type: 'text' },
  { field: 'body', label: '正文', type: 'editor' },
  { field: 'attributes', label: '参数', type: 'json' },
  { field: 'seo_title', label: 'SEO 标题', type: 'text' },
  { field: 'seo_description', label: 'SEO 描述', type: 'textarea' },
  { field: 'seo_keywords', label: 'SEO 关键词', type: 'text' },
  ...cf.localeFields.value,
]);

/**
 * 详情/保存形状转换：先过自定义字段（语种 custom_fields 展开/折叠），再过扩展分类。
 * 此前扩展分类的 detail/save 转换没有接到表单上（dot 字段回显为空、保存会清掉已有归属），
 * 借这次自定义字段接入一并补上。
 */
function detailFormat(data) {
  return cf.detailFormat(cc.detailFormat(data));
}

function saveFormat(payload) {
  return cf.saveFormat(cc.saveFormat(payload));
}

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  {
    field: 'title',
    title: '标题',
    minWidth: 200,
    formatter: ({ row }) => row.locales?.[0]?.title || '-',
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

onMounted(async () => {
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
  // 扩展分类维度 + 租户自定义字段（未声明时静默为空）
  await cc.load();
  await cf.load();
});
</script>

<template>
  <div>
  <AppCrudTable
    ref="crudRef"
    api-url="production-lines"
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
    :detail-format="detailFormat"
    :save-format="saveFormat"
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
    permission-name="cms.production_line"
    title="生产线管理"
    class="p-4"
  >
    <template #sub-title>
      <span class="text-xs text-gray-400">
        内容全局管理 · 用首位的「应用」筛选查看某站点的发布情况
      </span>
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
        resource="production-lines"
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
    resource="production-lines"
    :content-id="publishRow?.id"
    :content-title="publishTitle"
    :initial-ids="publishIds"
    :applications="appStore.applications"
    @saved="handlePublished"
  />
  </div>
</template>
