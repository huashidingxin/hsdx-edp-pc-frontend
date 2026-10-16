<script setup>
/**
 * 知识库分组（纯导航层）列表。
 *
 * 分组只是「按用途 / 受众」给库做归类：不承载挂载、不参与召回，
 * 删分组只会把组内库置回「未分组」，不会动知识资产。
 * 库才是功能单元（挂载应用 / 客服绑定 / top_k 阈值都按库）。
 */
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { ref } from 'vue';

const crudRef = ref(null);

const filterFields = ref([
  {
    field: 'keyword',
    label: '关键词',
    type: 'input',
    span: 8,
    attrs: { placeholder: '名称 / 编码', allowClear: true },
  },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  { field: 'code', type: 'text', label: '编码', span: 12 },
  {
    field: 'description',
    type: 'textarea',
    label: '描述',
    span: 24,
    attrs: { rows: 2 },
  },
  {
    field: 'sort',
    type: 'number',
    label: '排序',
    span: 12,
    attrs: { min: 0, max: 9999, style: 'width: 100%' },
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'code', title: '编码', minWidth: 130 },
  { field: 'name', title: '名称', minWidth: 160 },
  { field: 'sort', title: '排序', width: 80 },
  { field: 'bases_count', title: '库数量', width: 90 },
  { field: 'created_at', title: '创建时间', minWidth: 160 },
]);

/**
 * 内置 edit/delete 的默认权限动作名是 `.edit` / `.delete`，后端分组只有
 * `.read` / `.write`，这里显式覆盖成 write；页面入口本身已由菜单权限
 * knowledge.group.read 把守，Mutation 后端也逐个校验 knowledge.group.write。
 */
const actionsConfig = ref([
  {
    key: 'edit',
    label: '编辑',
    icon: 'mdi--pencil-outline',
    permission: 'write',
    order: 20,
  },
  {
    key: 'delete',
    label: '删除',
    icon: 'mdi--delete-outline',
    danger: true,
    confirm: true,
    confirmTitle: '确定要删除该分组？组内知识库会回到「未分组」，不会被删除。',
    permission: 'write',
    order: 90,
  },
]);
</script>

<template>
  <div class="h-full">
    <AppCrudTable
      ref="crudRef"
      api-url="knowledge/groups"
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
      :inline-actions="['edit', 'delete']"
      title="分组管理"
      class="p-4"
    />
  </div>
</template>
