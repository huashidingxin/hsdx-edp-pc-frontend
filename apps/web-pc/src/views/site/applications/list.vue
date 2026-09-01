<script setup>
import { onMounted, ref } from 'vue';

import { Button, Drawer, Form, FormItem, Input, Modal, Popconfirm, Select, Switch, Tag, message } from 'antdv-next';

import Resource from '#/api/resource';
import { requestClient } from '#/api/request';

const TYPE_OPTIONS = [
  { id: 1, name: '官网' },
  { id: 2, name: '小程序' },
  { id: 3, name: '公众号' },
];
const STATUS_OPTIONS = [
  { id: 0, name: '草稿' },
  { id: 1, name: '启用' },
  { id: 2, name: '停用' },
];
const SSL_OPTIONS = [
  { id: 0, name: '未配置' },
  { id: 1, name: '有效' },
  { id: 2, name: '过期' },
];
const typeMap = { 1: '官网', 2: '小程序', 3: '公众号' };
const typeColor = { 1: 'blue', 2: 'green', 3: 'purple' };
const statusMap = { 0: '草稿', 1: '启用', 2: '停用' };
const statusColor = { 0: 'default', 1: 'green', 2: 'red' };
const sslMap = { 0: '未配置', 1: '有效', 2: '过期' };

const localeOptions = ref([]);
const crudRef = ref(null);

const filterFields = ref([
  { field: 'keyword', label: '关键词', type: 'text', span: 8 },
  {
    field: 'status',
    label: '状态',
    type: 'select',
    span: 8,
    attrs: { items: STATUS_OPTIONS },
  },
  {
    field: 'type',
    label: '类型',
    type: 'select',
    span: 8,
    attrs: { items: TYPE_OPTIONS },
  },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  {
    field: 'code',
    type: 'text',
    label: '编码',
    span: 12,
    required: true,
    attrs: { placeholder: '如 demo-site（小写字母/数字/中划线）' },
  },
  {
    field: 'type',
    type: 'select',
    label: '类型',
    span: 12,
    attrs: { items: TYPE_OPTIONS },
  },
  {
    field: 'status',
    type: 'select',
    label: '状态',
    span: 12,
    attrs: { items: STATUS_OPTIONS },
  },
  {
    field: 'default_locale',
    type: 'select',
    label: '默认语言',
    span: 12,
    attrs: {
      items: localeOptions,
      fieldNames: { label: 'label', value: 'code' },
      showSearch: true,
    },
  },
  {
    field: 'enabled_locales',
    type: 'select',
    label: '启用语言',
    span: 24,
    attrs: {
      mode: 'multiple',
      items: localeOptions,
      fieldNames: { label: 'label', value: 'code' },
      showSearch: true,
    },
  },
  {
    field: 'settings',
    type: 'textarea',
    label: '设置（JSON）',
    span: 24,
    displayOnly: true,
    attrs: { rows: 3 },
  },
  {
    field: 'created_at',
    type: 'datetime',
    label: '创建时间',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'updated_at',
    type: 'datetime',
    label: '更新时间',
    span: 12,
    displayOnly: true,
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'name', title: '名称', minWidth: 160 },
  { field: 'code', title: '编码', minWidth: 140 },
  {
    field: 'type',
    title: '类型',
    width: 90,
    slots: { default: 'default_type' },
  },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  {
    field: 'domains',
    title: '域名',
    minWidth: 200,
    slots: { default: 'default_domains' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 170 },
]);

const formData = ref(null);

/* ===================== 域名管理抽屉 ===================== */
const domainOpen = ref(false);
const domainApp = ref(null);
const domainEditing = ref(null);
const domainSaving = ref(false);
const domainForm = ref({ host: '', is_primary: 0, redirect_to_primary: 0, ssl_status: 0 });

function openDomains(row) {
  domainApp.value = row;
  domainEditing.value = null;
  domainForm.value = { host: '', is_primary: 0, redirect_to_primary: 0, ssl_status: 0 };
  domainOpen.value = true;
}

function editDomain(domain) {
  domainEditing.value = domain;
  domainForm.value = { ...domain };
}

function newDomain() {
  domainEditing.value = null;
  domainForm.value = { host: '', is_primary: 0, redirect_to_primary: 0, ssl_status: 0 };
}

async function saveDomain() {
  if (!domainForm.value.host) {
    message.warning('请填写域名');
    return;
  }
  domainSaving.value = true;
  try {
    const base = `applications/${domainApp.value.id}/domains`;
    if (domainEditing.value) {
      await requestClient.patch(
        `/applications/${domainApp.value.id}/domains/${domainEditing.value.id}`,
        domainForm.value,
      );
    } else {
      await requestClient.post(`/${base}`, domainForm.value);
    }
    message.success('域名已保存');
    newDomain();
    refreshDomains();
  } catch {
    message.error('保存失败');
  } finally {
    domainSaving.value = false;
  }
}

async function deleteDomain(domain) {
  try {
    await requestClient.delete(
      `/applications/${domainApp.value.id}/domains/${domain.id}`,
    );
    message.success('域名已删除');
    refreshDomains();
  } catch {
    message.error('删除失败');
  }
}

function refreshDomains() {
  crudRef.value?.refresh();
}

function hostText(domain) {
  return domain?.host || '-';
}

onMounted(async () => {
  try {
    const { data } = await new Resource('applications/locale-catalog').list(
      {},
    );
    localeOptions.value = data || [];
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div class="h-full">
    <AppCrudTable
      ref="crudRef"
      api-url="applications"
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
      :actions-config="[
        {
          key: 'manage_domains',
          label: '域名',
          icon: 'mdi--web',
          permission: 'edit',
          onClick: (row) => openDomains(row),
          order: 35,
        },
      ]"
      :inline-actions="['view', 'edit', 'manage_domains', 'delete']"
      permission-name="cms.page"
      title="应用与域名"
      class="p-4"
    >
      <template #default_type="{ row }">
        <Tag :color="typeColor[row.type] || 'default'">{{ typeMap[row.type] || '-' }}</Tag>
      </template>
      <template #default_status="{ row }">
        <Tag :color="statusColor[row.status] || 'default'">{{ statusMap[row.status] || '-' }}</Tag>
      </template>
      <template #default_domains="{ row }">
        <div class="flex flex-wrap gap-1">
          <Tag v-for="d in row.domains || []" :key="d.id">
            {{ hostText(d) }}
            <span v-if="d.is_primary" class="text-blue-500">（主）</span>
          </Tag>
          <span v-if="!row.domains?.length">-</span>
        </div>
      </template>
    </AppCrudTable>

    <Drawer
      :open="domainOpen"
      :title="`域名管理 - ${domainApp?.name || ''}`"
      width="560"
      @close="domainOpen = false"
    >
      <div class="mb-4 rounded border border-gray-200 p-3">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-sm font-medium text-gray-700">
            {{ domainEditing ? '编辑域名' : '新增域名' }}
          </span>
          <Button size="small" @click="newDomain">新增</Button>
        </div>
        <Form layout="vertical" :model="domainForm">
          <FormItem label="域名" required>
            <Input
              v-model:value="domainForm.host"
              placeholder="如 www.example.com"
            />
          </FormItem>
          <div class="flex flex-wrap gap-4">
            <FormItem label="主域名">
              <Switch
                v-model:checked="domainForm.is_primary"
                :checked-value="1"
                :un-checked-value="0"
              />
            </FormItem>
            <FormItem label="重定向到主域名">
              <Switch
                v-model:checked="domainForm.redirect_to_primary"
                :checked-value="1"
                :un-checked-value="0"
              />
            </FormItem>
            <FormItem label="SSL 状态">
              <Select
                v-model:value="domainForm.ssl_status"
                :options="SSL_OPTIONS"
                :field-names="{ label: 'name', value: 'id' }"
                style="width: 160px"
              />
            </FormItem>
          </div>
          <div class="flex justify-end gap-2">
            <Button size="small" @click="newDomain">重置</Button>
            <Button
              size="small"
              type="primary"
              :loading="domainSaving"
              @click="saveDomain"
            >
              保存
            </Button>
          </div>
        </Form>
      </div>

      <div class="space-y-2">
        <div
          v-for="d in domainApp?.domains || []"
          :key="d.id"
          class="flex items-center justify-between rounded border border-gray-200 px-3 py-2"
        >
          <div class="min-w-0">
            <div class="text-sm text-gray-800">
              {{ hostText(d) }}
              <Tag v-if="d.is_primary" color="blue">主</Tag>
              <Tag v-if="d.redirect_to_primary">重定向</Tag>
            </div>
            <div class="text-xs text-gray-500">SSL：{{ sslMap[d.ssl_status] || '-' }}</div>
          </div>
          <div class="flex shrink-0 gap-2">
            <Button size="small" @click="editDomain(d)">编辑</Button>
            <Popconfirm title="确定删除该域名吗？" @confirm="deleteDomain(d)">
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          </div>
        </div>
        <div v-if="!domainApp?.domains?.length" class="py-6 text-center text-gray-400">
          暂无域名
        </div>
      </div>
    </Drawer>
  </div>
</template>
