<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { computed, onMounted, ref, watch } from 'vue';

import { Tag } from 'antdv-next';

import { useCurrentAppStore } from '#/store/current-app';

import { useAppQueryFilter } from '../_components/useAppQueryFilter.js';

/**
 * 电子名片管理
 *
 * 与 content 下其它内容模型不同：电子名片（business_cards）是**应用级**数据 ——
 * 归属 application_id，没有语种表、也没有「发布到多应用」的映射行，站点侧由
 * PublicModelQuery 以 type=business-card 直读本表。于是这里：
 *   - 首位的「应用」是归属过滤（不是发布范围）；
 *   - status 是展示开关（1 展示 / 0 隐藏），不是草稿/发布/归档；
 *   - 没有「发布」动作与语言内容编辑。
 */
const statusColor = { 0: 'default', 1: 'green' };

const statusItems = [
  { id: 0, name: '已隐藏' },
  { id: 1, name: '展示中' },
];

const appStore = useCurrentAppStore();
const crudRef = ref(null);
const props = defineProps({ appId: { type: [Number, String], default: null } });
const { appFilterDefault, suggestedAppId, onFiltersUpdate } = useAppQueryFilter(crudRef, () => props.appId);

/** 应用筛选选项（第一筛选位）：全部 + 各应用。 */
const appOptions = computed(() =>
  (appStore.applications || []).map((a) => ({ id: a.id, name: a.name })),
);

const formData = ref(null);

/**
 * phones 落库是数组，表单里用多行文本编辑（每行一个号码）：
 * 回填时把数组拼成文本；提交时后端同时接受换行/逗号分隔的字符串，再归一成数组。
 */
watch(
  formData,
  (row) => {
    if (!row) return;
    if (Array.isArray(row.phones)) {
      row.phones = row.phones.join('\n');
    }
    if (!row.application_id) {
      const fallback = Number(suggestedAppId.value);
      const appId = Number(props.appId);
      const candidate = appId > 0 ? appId : Number.isSafeInteger(fallback) && fallback > 0 ? fallback : null;
      if (candidate) row.application_id = candidate;
    }
  },
  { immediate: true, deep: true },
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
  { field: 'name', label: '姓名', type: 'text', span: 8 },
  { field: 'status', label: '状态', type: 'select', span: 8, attrs: { options: statusItems, fieldNames: { label: 'name', value: 'id' } } },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  {
    field: 'application_id',
    type: 'select',
    label: '归属应用',
    span: 12,
    required: true,
    attrs: { options: appOptions, fieldNames: { label: 'name', value: 'id' }, showSearch: true },
  },
  { field: 'name', type: 'text', label: '姓名', span: 12 },
  { field: 'title', type: 'text', label: '职务', span: 12 },
  {
    field: 'phones',
    type: 'textarea',
    label: '电话（每行一个）',
    span: 24,
    attrs: { rows: 3, placeholder: '每行一个号码，也可用逗号分隔' },
  },
  { field: 'email', type: 'text', label: '邮箱', span: 12 },
  { field: 'website', type: 'text', label: '官网', span: 12 },
  { field: 'logo', type: 'image', label: '头像/标识图', span: 12 },
  { field: 'name_image', type: 'image', label: '人名书法图', span: 12 },
  { field: 'sort', type: 'number', label: '排序', span: 12 },
  { field: 'status', type: 'switch', label: '展示', span: 12 },
  { field: 'created_at', type: 'datetime', label: '创建时间', span: 12, displayOnly: true },
  { field: 'updated_at', type: 'datetime', label: '更新时间', span: 12, displayOnly: true },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'name', title: '姓名', minWidth: 120, formatter: emptyText },
  { field: 'title', title: '职务', minWidth: 120, formatter: emptyText },
  {
    field: 'phones',
    title: '电话',
    minWidth: 160,
    formatter: ({ row }) => {
      const phones = normalizePhones(row.phones);
      return phones.length ? phones.join('、') : '-';
    },
  },
  { field: 'email', title: '邮箱', minWidth: 160, formatter: emptyText },
  {
    field: 'logo',
    title: '头像',
    width: 80,
    slots: { default: 'default_logo' },
  },
  { field: 'sort', title: '排序', width: 80 },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  {
    field: 'application',
    title: '归属应用',
    minWidth: 140,
    slots: { default: 'default_application' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 160 },
]);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

/**
 * phones 列在列表中可能是数组（API 正常返回）、JSON 字符串、逗号/换行分隔的字符串，
 * 甚至被编辑表单就地改写过的字符串；统一归一成字符串数组后再渲染，避免 join 报错。
 */
function normalizePhones(value) {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== null && v !== undefined && v !== '');
  }
  if (typeof value === 'string' && value.trim() !== '') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return normalizePhones(parsed);
      }
    } catch {
      // 非 JSON：按逗号/分号/换行拆
    }
    return value.split(/[\r\n,，;；]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

onMounted(async () => {
  try {
    await appStore.loadApplications();
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div>
  <AppCrudTable
    ref="crudRef"
    api-url="business-cards"
    v-model="formData"
    @update:filters="onFiltersUpdate"
    :filter-fields="filterFields"
    :fields="formFields"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :inline-actions="['view', 'edit', 'delete']"
    permission-name="cms.business_card"
    title="电子名片"
    class="p-4"
  >
    <template #sub-title>
      <span class="text-xs text-gray-400">
        应用级数据 · 用首位的「应用」筛选某站点的名片，content model 之外独立管理
      </span>
    </template>
    <template #default_logo="{ row }">
      <img
        v-if="row.logo"
        :src="row.logo"
        alt=""
        class="h-10 w-10 rounded-full object-cover"
      />
      <span v-else>-</span>
    </template>
    <template #default_status="{ row }">
      <Tag :color="statusColor[row.status] || 'default'">{{ row.status_label || '-' }}</Tag>
    </template>
    <template #default_application="{ row }">
      <Tag v-if="row.application?.name" color="blue">{{ row.application.name }}</Tag>
      <span v-else>{{ row.application_id ? `#${row.application_id}` : '-' }}</span>
    </template>
  </AppCrudTable>
  </div>
</template>
