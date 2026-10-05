<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { computed, onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';
import { useCurrentAppStore } from '#/store/current-app';

import ContentPublishModal from '../_components/ContentPublishModal.vue';
import { useAppQueryFilter } from '../_components/useAppQueryFilter.js';
import LocaleManager from '../_components/LocaleManager.vue';



/**
 * 分类用途：仅服务记录型模型。
 * 页面（about-* 等）不是分类 —— 页面 = pages.code + page_data_schemas +
 * page_contents + page_locales；历史遗留的 type=1（页面）已于 2026-08 全量删除，
 * 数值 1 保留空位不复用，故此处不再提供该选项。
 */
const typeOptions = [
  { id: 2, name: '文章' },
  { id: 3, name: '产品' },
  { id: 4, name: '图库' },
  { id: 5, name: '案例' },
];

/**
 * 图片型内容类型（仅「图库」分类使用）：
 * 声明该分类服务哪些独立图片型内容，供荣誉 / 证书 / 伙伴等模块的分类下拉过滤。
 * 留空（不选）= 不声明，后端按图库内容兜底；清空会被规范化为 null，不会写成空数组。
 */
const contentTypeOptions = [
  { id: 'gallery-item', name: '图库' },
  { id: 'honor', name: '荣誉' },
  { id: 'certificate', name: '证书' },
  { id: 'partner', name: '伙伴' },
];
const contentTypeMap = Object.fromEntries(
  contentTypeOptions.map((o) => [o.id, o.name]),
);

const parentOptions = ref([]);

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
  {
    field: 'type',
    label: '类型',
    type: 'select',
    span: 8,
    attrs: { fieldNames: { label: 'name', value: 'id' },
      options: typeOptions },
  },
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

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  {
    field: 'type',
    type: 'select',
    label: '类型',
    span: 12,
    attrs: { options: typeOptions },
  },
  {
    field: 'parent_id',
    type: 'select',
    label: '父级',
    span: 12,
    attrs: {
      options: parentOptions,
      fieldNames: { label: 'name', value: 'id' },
      allowClear: true,
      showSearch: true,
    },
  },
  // 名称/Slug/描述为语种内容，由下方 LocaleManager 按语言维护（分类无顶层 name 字段）
  { field: 'sort', type: 'number', label: '排序', span: 12 },
  {
    field: 'content_types',
    type: 'multiselect',
    label: '图片内容类型（仅「图库」分类需要）',
    span: 12,
    attrs: {
      options: contentTypeOptions,
      fieldNames: { label: 'name', value: 'id' },
      placeholder: '不选 = 不声明',
    },
  },
  {
    field: 'status',
    type: 'select',
    label: '状态',
    span: 12,
    attrs: { options: [{ id: 1, name: '启用' }, { id: 0, name: '停用' }] },
  },
  {
    field: 'locale_manager',
    type: 'slot',
    label: '语言名称',
    span: 24,
    renderKey: 'locale_manager',
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  {
    field: 'name',
    title: '名称',
    minWidth: 180,
    formatter: ({ row }) => row.locales?.[0]?.name || '-',
  },
  {
    field: 'type',
    title: '类型',
    width: 90,
    slots: { default: 'default_type' },
  },
  {
    field: 'content_types',
    title: '图片内容',
    minWidth: 150,
    slots: { default: 'default_content_types' },
  },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'sort', title: '排序', width: 80 },
  {
    field: 'published_applications',
    title: '发布范围',
    minWidth: 180,
    slots: { default: 'default_published' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 160 },
]);

const formData = ref(null);
const localeOptions = ref([]);

/* ===================== 发布到应用 ===================== */
const publishOpen = ref(false);
const publishRow = ref(null);
const publishIds = computed(() =>
  (publishRow.value?.published_applications || []).map((a) => Number(a.id)),
);
const publishTitle = computed(
  () => publishRow.value?.locales?.[0]?.name || `#${publishRow.value?.id ?? ''}`,
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

/**
 * 提交前规范化：清空「图片内容类型」会得到 []，而空数组在后端语义里是
 * 「不服务任何图片内容」（`$row->content_types ?? ['gallery-item']` 对 [] 不兜底），
 * 因此把空数组还原为 null，避免误伤同分类下的图库内容。
 */
function normalizeSave(payload) {
  if (Array.isArray(payload?.content_types) && payload.content_types.length === 0) {
    return { ...payload, content_types: null };
  }
  return payload;
}

onMounted(async () => {
  try {
    await appStore.loadApplications();
  } catch (error) {
    console.error(error);
  }
  try {
    const { data } = await new Resource('categories').list({ per_page: 100 });
    parentOptions.value = (data || []).map((c) => ({
      id: c.id,
      name: c.locales?.[0]?.name || `#${c.id}`,
    }));
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
    api-url="categories"
    v-model="formData"
    @update:filters="onFiltersUpdate"
    :save-format="normalizeSave"
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
    permission-name="cms.category"
    title="分类管理"
    class="p-4"
  >
    <template #sub-title>
      <span class="text-xs text-gray-400">
        内容全局管理 · 用首位的「应用」筛选查看某站点的发布情况
      </span>
    </template>
    <template #default_type="{ row }">
      <Tag :color="row.type === 2 ? 'green' : 'blue'">
        {{ row.type_label || '-' }}
      </Tag>
    </template>
    <template #default_content_types="{ row }">
      <span v-if="row.content_types?.length" class="flex flex-wrap gap-1">
        <Tag v-for="ct in row.content_types" :key="ct" color="geekblue">
          {{ contentTypeMap[ct] || ct }}
        </Tag>
      </span>
      <span v-else class="text-gray-400">-</span>
    </template>
    <template #default_status="{ row }">
      <Tag :color="row.status ? 'green' : 'default'">
        {{ row.status ? '启用' : '停用' }}
      </Tag>
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
        resource="categories"
        :row-id="formValue?.id"
        :locales="formValue?.locales || []"
        @update:locales="(v) => { if (formValue) formValue.locales = v; }"
        :locales-pool="localeOptions"
        :fields="[
          { field: 'name', label: '名称', type: 'text' },
          { field: 'slug', label: 'Slug', type: 'text' },
          { field: 'description', label: '描述', type: 'textarea' },
        ]"
      />
    </template>
  </AppCrudTable>

  <ContentPublishModal
    v-model:open="publishOpen"
    :suggested-app-id="suggestedAppId"
    resource="categories"
    :content-id="publishRow?.id"
    :content-title="publishTitle"
    :initial-ids="publishIds"
    :applications="appStore.applications"
    @saved="handlePublished"
  />
  </div>

</template>
