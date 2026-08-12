<script setup>
import { computed, onMounted, ref } from 'vue';

import { Button, Drawer, Form, FormItem, Input, InputNumber, Modal, Popconfirm, Select, Tag, Tree, message } from 'antdv-next';

import Resource from '#/api/resource';
import { requestClient } from '#/api/request';

const crudRef = ref(null);
const applications = ref([]);

const appId = computed(
  () =>
    Number(localStorage.getItem('edp:current-application-id')) ||
    applications.value[0]?.id ||
    null,
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
const itemEditing = ref(null);
const itemForm = ref({ title: '', url: '', sort: 0 });

function openItems(row) {
  itemsMenu.value = row;
  itemsOpen.value = true;
}

function itemTitle(item) {
  const t = item.titles || {};
  return Object.values(t).find(Boolean) || item.link_value || '-';
}

function buildItemTree(items) {
  const nodes = new Map((items || []).map((i) => [i.id, { ...i, children: [] }]));
  const roots = [];
  (items || []).forEach((i) => {
    const node = nodes.get(i.id);
    if (i.parent_id && nodes.has(i.parent_id)) {
      nodes.get(i.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function startNewItem() {
  itemEditing.value = null;
  itemForm.value = { title: '', url: '', sort: 0 };
}

function editItem(item) {
  itemEditing.value = item;
  itemForm.value = {
    title: Object.values(item.titles || {}).find(Boolean) || '',
    url: item.link_value || '',
    sort: item.sort ?? 0,
  };
}

async function saveItem() {
  try {
    const payload = {
      titles: { 'zh-CN': itemForm.value.title },
      link_value: itemForm.value.url,
      sort: itemForm.value.sort,
    };
    if (itemEditing.value) {
      await requestClient.patch(
        `/admin/menus/${itemsMenu.value.id}/items/${itemEditing.value.id}`,
        payload,
      );
    } else {
      await requestClient.post(`/admin/menus/${itemsMenu.value.id}/items`, payload);
    }
    message.success('菜单项已保存');
    refreshMenu();
  } catch {
    message.error('保存失败');
  }
}

async function deleteItem(item) {
  try {
    await requestClient.delete(
      `/admin/menus/${itemsMenu.value.id}/items/${item.id}`,
    );
    message.success('已删除');
    refreshMenu();
  } catch {
    message.error('删除失败');
  }
}

function refreshMenu() {
  crudRef.value?.refresh();
}

onMounted(async () => {
  try {
    const { data } = await new Resource('admin/applications').list({ per_page: 100 });
    applications.value = data || [];
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div class="h-full">
    <AppCrudTable
      ref="crudRef"
      api-url="admin/menus"
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

    <Drawer
      :open="itemsOpen"
      :title="`菜单项 - ${itemsMenu?.name || itemsMenu?.code || ''}`"
      width="560"
      @close="itemsOpen = false"
    >
      <div class="mb-4 rounded border border-gray-200 p-3 dark:border-gray-600">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-sm font-medium text-gray-700">
            {{ itemEditing ? '编辑菜单项' : '新增菜单项' }}
          </span>
          <Button size="small" @click="startNewItem">新增</Button>
        </div>
        <Form layout="vertical" :model="itemForm">
          <FormItem label="标题">
            <Input v-model:value="itemForm.title" placeholder="菜单标题" />
          </FormItem>
          <FormItem label="链接">
            <Input v-model:value="itemForm.url" placeholder="如 /products" />
          </FormItem>
          <FormItem label="排序">
            <InputNumber v-model:value="itemForm.sort" style="width: 120px" />
          </FormItem>
          <div class="flex justify-end gap-2">
            <Button size="small" @click="startNewItem">重置</Button>
            <Button size="small" type="primary" @click="saveItem">保存</Button>
          </div>
        </Form>
      </div>

      <div class="space-y-2">
        <div
          v-for="item in buildItemTree(itemsMenu?.items)"
          :key="item.id"
          class="flex items-center justify-between rounded border border-gray-200 px-3 py-2 dark:border-gray-600"
        >
          <span class="text-sm text-gray-800">{{ itemTitle(item) }}</span>
          <div class="flex shrink-0 gap-2">
            <Button size="small" @click="editItem(item)">编辑</Button>
            <Popconfirm title="确定删除？" @confirm="deleteItem(item)">
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          </div>
        </div>
        <div v-if="!itemsMenu?.items?.length" class="py-6 text-center text-gray-400">
          暂无菜单项
        </div>
      </div>
    </Drawer>
  </div>
</template>
