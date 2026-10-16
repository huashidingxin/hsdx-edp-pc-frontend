<script setup>
/**
 * 智能客服实例（租户级能力实例）列表。
 *
 * 与旧路径的关系：Application.settings.ai_chat 是「单应用内嵌客服」；
 * 实例化后 system_prompt/model/temperature 上移到实例，通过「挂载应用」
 * 决定它对哪些宿主应用生效，通过「绑定知识库」决定召回范围。
 */
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { computed, onMounted, ref } from 'vue';

import { Form, FormItem, Modal, Select, Tag, message } from 'antdv-next';

import { requestClient } from '#/api/request';
import Resource from '#/api/resource';

const crudRef = ref(null);

const applications = ref([]);
const knowledgeBases = ref([]);

const statusItems = [
  { id: 'active', name: '启用' },
  { id: 'disabled', name: '停用' },
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
    field: 'status',
    type: 'select',
    label: '状态',
    span: 12,
    attrs: { options: statusItems },
  },
  {
    field: 'settings.system_prompt',
    type: 'textarea',
    label: '系统提示词',
    span: 24,
    attrs: { rows: 4 },
  },
  {
    field: 'settings.welcome',
    type: 'text',
    label: '欢迎语',
    span: 12,
  },
  { field: 'settings.model', type: 'text', label: '模型', span: 12 },
  {
    field: 'settings.temperature',
    type: 'number',
    label: '温度',
    span: 12,
    attrs: { min: 0, max: 2, step: 0.1, style: 'width: 100%' },
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'code', title: '编码', minWidth: 130 },
  { field: 'name', title: '名称', minWidth: 150, formatter: emptyText },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'mounts_count', title: '挂载应用', width: 90 },
  { field: 'knowledge_bases_count', title: '知识库', width: 80 },
  { field: 'created_at', title: '创建时间', minWidth: 160 },
]);

const formData = ref(null);

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

/* ===================== 挂载应用 ===================== */
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
      `/ai/agents/${mountRow.value.id}/mounts`,
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

/* ===================== 绑定知识库 ===================== */
const kbOpen = ref(false);
const kbRow = ref(null);
const kbSelected = ref([]);
const kbSaving = ref(false);

const kbOptions = computed(() =>
  knowledgeBases.value.map((kb) => ({
    id: kb.id,
    name: `${kb.name}${kb.status === 'active' ? '' : '（已归档）'}`,
  })),
);

function openKnowledgeBases(row) {
  kbRow.value = row;
  kbSelected.value = [...(row.knowledge_base_ids || [])];
  kbOpen.value = true;
}

async function saveKnowledgeBases() {
  kbSaving.value = true;
  try {
    await requestClient.put(
      `/ai/agents/${kbRow.value.id}/knowledge-bases`,
      { knowledge_base_ids: kbSelected.value },
    );
    message.success('知识库绑定已保存');
    kbOpen.value = false;
    crudRef.value?.refresh();
  } catch {
    message.error('保存绑定失败');
  } finally {
    kbSaving.value = false;
  }
}

/**
 * 内置 edit/delete 的默认权限动作名是 `.edit` / `.delete`，后端客服实例只有
 * `.read` / `.write`，这里显式覆盖成 write；Mutation 后端逐个校验 ai.agent.write。
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
    confirmTitle: '确定要删除吗？会话会回落为应用内嵌客服配置。',
    permission: 'write',
    order: 90,
  },
  {
    key: 'mounts',
    label: '挂载应用',
    icon: 'mdi--link-variant',
    permission: 'write',
    onClick: (row) => openMounts(row),
    order: 30,
  },
  {
    key: 'knowledge',
    label: '绑定知识库',
    icon: 'mdi--book-multiple-outline',
    permission: 'write',
    onClick: (row) => openKnowledgeBases(row),
    order: 40,
  },
]);

onMounted(async () => {
  try {
    const [apps, kbs] = await Promise.all([
      new Resource('applications').list({ per_page: 100 }),
      new Resource('knowledge/bases').list({ per_page: 100 }),
    ]);
    applications.value = apps.data || [];
    knowledgeBases.value = kbs.data || [];
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div class="h-full">
    <AppCrudTable
      ref="crudRef"
      api-url="ai/agents"
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
      :inline-actions="['edit', 'mounts', 'delete']"
      title="智能客服实例"
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
        挂载后该应用（网站/小程序/全景）的访客对话即由本实例接管；
        取消挂载后回落为应用内嵌客服配置。
      </p>
      <Form layout="vertical">
        <FormItem label="宿主应用">
          <Select
            v-model:value="mountSelected"
            mode="multiple"
            :options="appOptions"
            :field-names="{ label: 'name', value: 'id' }"
            placeholder="选择生效的宿主应用"
          />
        </FormItem>
      </Form>
    </Modal>

    <Modal
      :open="kbOpen"
      :title="`绑定知识库 - ${kbRow?.name || ''}`"
      :confirm-loading="kbSaving"
      ok-text="保存"
      cancel-text="取消"
      width="520"
      @ok="saveKnowledgeBases"
      @cancel="kbOpen = false"
    >
      <p class="mb-2 text-xs text-gray-400">
        只有「绑定 ∧ 挂载到当前宿主应用 ∧ 启用中」的知识库会参与召回。
      </p>
      <Form layout="vertical">
        <FormItem label="知识库">
          <Select
            v-model:value="kbSelected"
            mode="multiple"
            :options="kbOptions"
            :field-names="{ label: 'name', value: 'id' }"
            placeholder="选择可召回的知识库"
          />
        </FormItem>
      </Form>
    </Modal>
  </div>
</template>
