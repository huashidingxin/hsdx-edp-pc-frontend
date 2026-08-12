<script setup>
import { onMounted, ref } from 'vue';

import { Button, Card, Descriptions, Form, FormItem, Input, Tag, message } from 'antdv-next';

import { requestClient } from '#/api/request';

const tenant = ref(null);
const loading = ref(false);
const saving = ref(false);
const editing = ref(false);
const form = ref({ name: '', default_locale: '' });

const statusMap = { 0: '未激活', 1: '正常', 2: '禁用' };
const statusColor = { 0: 'orange', 1: 'green', 2: 'red' };

async function load() {
  loading.value = true;
  try {
    const data = await requestClient.get('/admin/tenant');
    tenant.value = data;
    form.value = {
      name: data?.name || '',
      default_locale: data?.default_locale || '',
    };
  } catch {
    message.error('加载租户信息失败');
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    await requestClient.patch('/admin/tenant', form.value);
    message.success('已保存');
    editing.value = false;
    await load();
  } catch {
    message.error('保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="p-4">
    <Card :loading="loading">
      <template #title>
        <div class="flex items-center justify-between">
          <span>租户信息</span>
          <div v-if="!editing" class="flex gap-2">
            <Button type="primary" @click="editing = true">编辑</Button>
          </div>
          <div v-else class="flex gap-2">
            <Button @click="editing = false">取消</Button>
            <Button type="primary" :loading="saving" @click="save">保存</Button>
          </div>
        </div>
      </template>

      <template v-if="!editing && tenant">
        <Descriptions :column="2" bordered size="small">
          <Descriptions.Item label="名称">{{ tenant.name }}</Descriptions.Item>
          <Descriptions.Item label="Slug">
            <Tag color="blue">{{ tenant.slug }}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag :color="statusColor[tenant.status] || 'default'">
              {{ statusMap[tenant.status] || '-' }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="套餐">
            {{ tenant.plan_code || '-' }}
          </Descriptions.Item>
          <Descriptions.Item label="默认语言">
            {{ tenant.default_locale || '-' }}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {{ tenant.updated_at || '-' }}
          </Descriptions.Item>
        </Descriptions>
        <div class="mt-4">
          <div class="mb-1 text-sm font-medium text-gray-700">设置（JSON）</div>
          <pre class="max-h-64 overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-600 dark:bg-gray-800">{{ JSON.stringify(tenant.settings || {}, null, 2) }}</pre>
        </div>
      </template>

      <Form v-else-if="editing" layout="vertical" :model="form">
        <FormItem label="名称" required>
          <Input v-model:value="form.name" placeholder="租户名称" />
        </FormItem>
        <FormItem label="默认语言">
          <Input v-model:value="form.default_locale" placeholder="如 zh-CN" />
        </FormItem>
      </Form>
    </Card>
  </div>
</template>
