<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { computed, onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';

import Resource from '#/api/resource';
import { useCurrentAppStore } from '#/store/current-app';

import ContentPublishModal from '../_components/ContentPublishModal.vue';
import { useAppQueryFilter } from '../_components/useAppQueryFilter.js';

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
  { field: 'department', label: '部门', type: 'text', span: 8 },
  { field: 'status', label: '状态', type: 'select', span: 8, attrs: { options: statusItems, fieldNames: { label: 'name', value: 'id' } } },
  {
    field: 'category_id',
    label: '分类',
    type: 'select',
    span: 8,
    attrs: { options: categories, fieldNames: { label: 'name', value: 'id' }, showSearch: true },
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
    field: 'category_id',
    type: 'select',
    label: '分类',
    span: 12,
    attrs: { options: categories, fieldNames: { label: 'name', value: 'id' }, showSearch: true },
  },
  { field: 'avatar', type: 'text', label: '头像', span: 12 },
  { field: 'department', type: 'text', label: '部门', span: 12 },
  { field: 'email', type: 'text', label: '邮箱', span: 12 },
  { field: 'phone', type: 'text', label: '电话', span: 12 },
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
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'title', title: '姓名', minWidth: 150, formatter: ({ row }) => row.locales?.[0]?.title || row.locales?.[0]?.name || '-' },
  { field: 'department', title: '部门', minWidth: 110, formatter: emptyText },
  { field: 'position', title: '职位', minWidth: 120, formatter: ({ row }) => row.locales?.[0]?.role || '-' },
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
  try {
    const { data } = await new Resource('categories').list({ per_page: 100, type: 2 });
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
  <div>
  <AppCrudTable
    ref="crudRef"
    api-url="team-members"
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
    permission-name="cms.team"
    title="团队成员"
    class="p-4"
  >
    <template #sub-title>
      <span class="text-xs text-gray-400">
        内容全局管理 · 用首位的「应用」筛选查看某站点的发布情况
      </span>
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
        resource="team-members"
        :row-id="formValue?.id"
        :locales="formValue?.locales || []"
        @update:locales="(v) => { if (formValue) formValue.locales = v; }"
        :locales-pool="localeOptions"
        :fields="[
          { field: 'name', label: '姓名', type: 'text' },
          { field: 'role', label: '职位', type: 'text' },
          { field: 'bio', label: '简介', type: 'textarea' },
        ]"
      />
    </template>
  </AppCrudTable>

  <ContentPublishModal
    v-model:open="publishOpen"
    :suggested-app-id="suggestedAppId"
    resource="team-members"
    :content-id="publishRow?.id"
    :content-title="publishTitle"
    :initial-ids="publishIds"
    :applications="appStore.applications"
    @saved="handlePublished"
  />
  </div>
</template>
