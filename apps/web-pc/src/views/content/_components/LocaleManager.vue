<script setup>
import { onMounted, ref, watch } from 'vue';

import { Button, Empty, Input, Select, SelectOption, Space, Tag, message } from 'antdv-next';

import { requestClient } from '#/api/request';

const props = defineProps({
  resource: { type: String, required: true },
  rowId: { type: [Number, String], required: true },
  locales: { type: Array, default: () => [] },
  fields: { type: Array, default: () => [] },
  localesPool: { type: Array, default: () => [] },
});

const emit = defineEmits(['changed']);

const activeLocale = ref('');
const form = ref({});
const loading = ref(false);
const saving = ref(false);
const publishing = ref(false);
const savedLocale = ref(null);

const statusMap = { 0: '草稿', 1: '已发布', 2: '已归档' };
const statusColor = { 0: 'default', 1: 'green', 2: 'orange' };

function localeCodeList() {
  const existing = (props.locales || []).map((l) => l.locale).filter(Boolean);
  const pool = (props.localesPool || []).map((l) => l.code || l);
  const merged = [...new Set([...existing, ...pool])];
  if (merged.length === 0) return ['zh-CN', 'en-US'];
  return merged;
}

async function loadLocale() {
  if (!activeLocale.value) return;
  loading.value = true;
  try {
    const data = await requestClient.get(
      `/${props.resource}/${props.rowId}/locales/${activeLocale.value}`,
    );
    savedLocale.value = data;
    form.value = { ...data };
    for (const f of props.fields) {
      const v = data?.[f.field];
      if (f.type === 'json') {
        form.value[f.field] = v ? JSON.stringify(v, null, 2) : '{}';
      } else if (v !== undefined) {
        form.value[f.field] = v;
      }
    }
  } catch {
    form.value = {};
    for (const f of props.fields) {
      form.value[f.field] = f.type === 'json' ? '{}' : '';
    }
    savedLocale.value = null;
  } finally {
    loading.value = false;
  }
}

function parseField(f) {
  const v = form.value[f.field];
  if (f.type === 'json') {
    try {
      return JSON.parse(v || '{}');
    } catch (e) {
      message.error(`${f.label} JSON 格式错误`);
      return null;
    }
  }
  return v;
}

async function save() {
  const payload = {};
  for (const f of props.fields) {
    const v = parseField(f);
    if (v === null && f.type === 'json') return;
    payload[f.field] = v;
  }
  saving.value = true;
  try {
    await requestClient.put(
      `/${props.resource}/${props.rowId}/locales/${activeLocale.value}`,
      payload,
    );
    message.success('语言内容已保存');
    emit('changed');
    await loadLocale();
  } catch {
    message.error('保存失败');
  } finally {
    saving.value = false;
  }
}

async function publish() {
  publishing.value = true;
  try {
    await requestClient.post(
      `/${props.resource}/${props.rowId}/locales/${activeLocale.value}/publish`,
    );
    message.success('已发布');
    emit('changed');
    await loadLocale();
  } catch {
    message.error('发布失败');
  } finally {
    publishing.value = false;
  }
}

async function unpublish() {
  publishing.value = true;
  try {
    await requestClient.post(
      `/${props.resource}/${props.rowId}/locales/${activeLocale.value}/unpublish`,
    );
    message.success('已取消发布');
    emit('changed');
    await loadLocale();
  } catch {
    message.error('取消发布失败');
  } finally {
    publishing.value = false;
  }
}

onMounted(() => {
  activeLocale.value = localeCodeList()[0];
});
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <span class="text-sm font-medium text-gray-700">语言内容</span>
      <Select v-model:value="activeLocale" style="width: 140px" @change="loadLocale">
        <SelectOption v-for="l in localeCodeList()" :key="l" :value="l">
          {{ l }}
        </SelectOption>
      </Select>
      <Tag v-if="savedLocale?.status !== undefined" :color="statusColor[savedLocale.status] || 'default'">
        {{ statusMap[savedLocale.status] || '-' }}
      </Tag>
      <Space class="ml-auto">
        <Button
          v-if="savedLocale?.status === 0"
          size="small"
          type="primary"
          :loading="publishing"
          @click="publish"
        >
          发布
        </Button>
        <Button
          v-else-if="savedLocale?.status === 1"
          size="small"
          :loading="publishing"
          @click="unpublish"
        >
          取消发布
        </Button>
      </Space>
    </div>

    <div v-if="activeLocale" class="space-y-3">
      <div
        v-for="f in fields"
        :key="f.field"
        class="flex flex-col gap-1"
      >
        <label class="text-xs font-medium text-gray-600">{{ f.label }}</label>
        <Input.TextArea
          v-if="f.type === 'textarea' || f.type === 'json'"
          v-model:value="form[f.field]"
          :rows="f.type === 'json' ? 8 : 3"
          :placeholder="f.placeholder || ''"
        />
        <Input
          v-else
          v-model:value="form[f.field]"
          :placeholder="f.placeholder || ''"
        />
      </div>
      <div class="flex justify-end gap-2">
        <Button :loading="saving" @click="save">保存语言内容</Button>
      </div>
    </div>
    <Empty v-else description="暂无语言" />
  </div>
</template>
