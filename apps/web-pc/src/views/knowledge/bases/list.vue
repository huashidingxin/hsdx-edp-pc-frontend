<script setup>
/**
 * 知识库（租户级能力实例）列表。
 *
 * 知识库不是应用：没有域名/页面，只是「知识来源的容器」，向量化与检索全部
 * 在外部知识服务完成（本项目只同步知识、看解析状态、做召回）。因此这里是
 * 租户级页面：不依赖当前工作区应用，靠「挂载应用」决定哪些宿主应用能召回它。
 */
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Button, Form, FormItem, Modal, Select, Tag, message } from 'antdv-next';

import { requestClient } from '#/api/request';
import Resource from '#/api/resource';

const crudRef = ref(null);
const router = useRouter();

const applications = ref([]);

const statusItems = [
  { id: 'active', name: '启用' },
  { id: 'archived', name: '已归档' },
];

const filterFields = ref([
  {
    field: 'keyword',
    label: '关键词',
    type: 'input',
    span: 8,
    attrs: { placeholder: '名称 / 编码', allowClear: true },
  },
  {
    field: 'status',
    label: '状态',
    type: 'select',
    span: 8,
    attrs: { options: statusItems, allowClear: true, placeholder: '全部状态' },
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
    field: 'status',
    type: 'select',
    label: '状态',
    span: 12,
    attrs: { options: statusItems },
  },
  {
    field: 'settings.top_k',
    type: 'number',
    label: '召回条数 top_k',
    span: 12,
    attrs: { min: 1, max: 20, style: 'width: 100%' },
  },
  {
    field: 'settings.score_threshold',
    type: 'number',
    label: '相似度阈值',
    span: 12,
    attrs: { min: 0, max: 1, step: 0.05, style: 'width: 100%' },
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'code', title: '编码', minWidth: 130 },
  { field: 'name', title: '名称', minWidth: 160, formatter: emptyText },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'sources_count', title: '知识条目', width: 90 },
  { field: 'mounts_count', title: '挂载应用', width: 90 },
  { field: 'created_at', title: '创建时间', minWidth: 160 },
]);

const formData = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

/* ===================== 挂载应用（全量同步） ===================== */
const mountOpen = ref(false);
const mountRow = ref(null);
const mountSelected = ref([]);
const mountSaving = ref(false);

const appOptions = computed(() =>
  applications.value.map((app) => ({
    id: app.id,
    name: `${app.name}${app.type_label ? `（${app.type_label}）` : ''}`,
  })),
);

function openMounts(row) {
  mountRow.value = row;
  mountSelected.value = [...(row.application_ids || [])];
  mountOpen.value = true;
}

async function saveMounts() {
  mountSaving.value = true;
  try {
    await requestClient.put(
      `/knowledge/bases/${mountRow.value.id}/publications`,
      { application_ids: mountSelected.value },
    );
    message.success('挂载已保存');
    mountOpen.value = false;
    crudRef.value?.refresh();
  } catch {
    message.error('保存挂载失败');
  } finally {
    mountSaving.value = false;
  }
}

/**
 * 内置 edit/delete 的默认权限动作名是 `.edit` / `.delete`，后端知识库只有
 * `.read` / `.write`，这里显式覆盖成 write；页面入口本身已由菜单权限
 * knowledge.kb.read 把守，Mutation 后端也逐个校验 knowledge.kb.write。
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
    confirmTitle: '确定要删除吗？库内条目会一并删除。',
    permission: 'write',
    order: 90,
  },
  {
    key: 'sources',
    label: '知识条目',
    icon: 'mdi--file-document-multiple-outline',
    permission: 'read',
    permissionName: 'knowledge.source',
    onClick: (row) => router.push(`/knowledge/sources?base=${row.id}`),
    order: 30,
  },
  {
    key: 'mounts',
    label: '挂载应用',
    icon: 'mdi--link-variant',
    permission: 'write',
    onClick: (row) => openMounts(row),
    order: 40,
  },
]);

onMounted(async () => {
  try {
    const { data } = await new Resource('applications').list({ per_page: 100 });
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
      api-url="knowledge/bases"
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
      :inline-actions="['edit', 'sources', 'delete']"
      title="知识库"
      class="p-4"
    >
      <template #default_status="{ row }">
        <Tag :color="row.status === 'active' ? 'green' : 'default'">
          {{ row.status_label || '-' }}
        </Tag>
      </template>
    </AppCrudTable>

    <Modal
      :open="mountOpen"
      :title="`挂载应用 - ${mountRow?.name || ''}`"
      :confirm-loading="mountSaving"
      ok-text="保存"
      cancel-text="取消"
      width="520"
      @ok="saveMounts"
      @cancel="mountOpen = false"
    >
      <p class="mb-2 text-xs text-gray-400">
        只有挂载到当前宿主应用的知识库才会被智能客服召回（库需为启用状态）。
      </p>
      <Form layout="vertical">
        <FormItem label="宿主应用">
          <Select
            v-model:value="mountSelected"
            mode="multiple"
            :options="appOptions"
            :field-names="{ label: 'name', value: 'id' }"
            placeholder="选择可召回本库的应用"
          />
        </FormItem>
      </Form>
    </Modal>
  </div>
</template>
