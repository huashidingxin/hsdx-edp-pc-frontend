<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { computed, onMounted, ref, watch } from 'vue';

import Resource from '#/api/resource';
import { setCurrentApplicationId } from '#/api/application-context';

import MenuItemsManager from './_components/MenuItemsManager.vue';

/**
 * 双用组件：独立页面时读 localStorage 应用；嵌入应用卡片抽屉时由 appId 指定
 * （菜单接口要求请求头与参数一致，仍需同步 localStorage）。
 */
const props = defineProps({
  appId: { type: [Number, String], default: null },
});

const crudRef = ref(null);
const applications = ref([]);

const appId = computed(() => {
  const propApp = Number(props.appId);
  if (propApp > 0) return propApp;
  return (
    Number(localStorage.getItem('edp:current-application-id')) ||
    applications.value[0]?.id ||
    null
  );
});

watch(
  () => props.appId,
  (id) => {
    const num = Number(id);
    if (num > 0) {
      setCurrentApplicationId(num);
      crudRef.value?.refresh();
    }
  },
);

const filterFields = ref([]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'code', type: 'text', label: '编码', span: 12, required: true },
  { field: 'name', type: 'text', label: '名称', span: 12 },
  {
    field: 'settings',
    type: 'textarea',
    label: '设置（JSON）',
    span: 24,
    displayOnly: true,
    attrs: { rows: 3 },
  },
  {
    field: 'items',
    type: 'textarea',
    label: '菜单项数',
    span: 12,
    displayOnly: true,
    formatter: (v) => v?.length ?? 0,
  },
  {
    field: 'created_at',
    type: 'datetime',
    label: '创建时间',
    span: 12,
    displayOnly: true,
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'name', title: '名称', minWidth: 160, formatter: emptyText },
  { field: 'code', title: '编码', minWidth: 140 },
  { field: 'items', title: '菜单项', width: 90, formatter: ({ cellValue }) => cellValue?.length ?? 0 },
  { field: 'created_at', title: '创建时间', minWidth: 170 },
]);

const formData = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

/* ===================== 菜单项管理抽屉 ===================== */
const itemsOpen = ref(false);
const itemsMenu = ref(null);

function openItems(row) {
  itemsMenu.value = row;
  itemsOpen.value = true;
}

function refreshMenu() {
  crudRef.value?.refresh();
}

onMounted(async () => {
  try {
    const { data } = await new Resource('applications').list({ per_page: 100 });
    applications.value = data || [];
    // 抽屉嵌入时以传入应用为准，并同步请求头上下文
    const propApp = Number(props.appId);
    if (propApp > 0) {
      setCurrentApplicationId(propApp);
    }
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div class="h-full">
    <AppCrudTable
      ref="crudRef"
      api-url="menus"
      v-model="formData"
      :extra-query="{ application_id: appId }"
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
          key: 'manage_items',
          label: '菜单项',
          icon: 'mdi--format-list-bulleted',
          permission: 'edit',
          onClick: (row) => openItems(row),
          order: 35,
        },
      ]"
      :inline-actions="['view', 'edit', 'manage_items', 'delete']"
      permission-name="cms.menu"
      title="菜单管理"
      class="p-4"
    >
      <template #field_items="{ modelValue }">
        <span>{{ modelValue?.items?.length ?? 0 }} 项</span>
      </template>
    </AppCrudTable>

    <MenuItemsManager
      v-model:open="itemsOpen"
      :menu="itemsMenu"
      @refresh="refreshMenu"
    />
  </div>
</template>
