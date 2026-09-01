<script setup>
import { computed, onMounted, ref } from 'vue';

import { Button, Card, Input, message } from 'antdv-next';

import Resource from '#/api/resource';
import { requestClient } from '#/api/request';

const applications = ref([]);
const appId = ref(null);
const tokensText = ref('{}');
const loading = ref(false);
const saving = ref(false);

const appIdNum = computed(() => Number(appId.value) || null);

async function load() {
  if (!appIdNum.value) return;
  loading.value = true;
  try {
    const data = await requestClient.get(
      `/applications/${appIdNum.value}/theme`,
    );
    tokensText.value = JSON.stringify(data?.tokens || {}, null, 2);
  } catch {
    tokensText.value = '{}';
  } finally {
    loading.value = false;
  }
}

async function save() {
  let tokens;
  try {
    tokens = JSON.parse(tokensText.value);
  } catch (e) {
    message.error(`JSON 格式错误：${e.message}`);
    return;
  }
  saving.value = true;
  try {
    await requestClient.put(`/applications/${appIdNum.value}/theme`, {
      tokens,
    });
    message.success('主题已保存');
  } catch {
    message.error('保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  try {
    const { data } = await new Resource('applications').list({ per_page: 100 });
    applications.value = data || [];
    appId.value =
      Number(localStorage.getItem('edp:current-application-id')) ||
      applications.value[0]?.id ||
      null;
    await load();
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div class="p-4">
    <Card :loading="loading">
      <template #title>主题</template>
      <div class="mb-4 flex items-center gap-3">
        <span class="text-sm text-gray-600">应用</span>
        <select
          v-model="appId"
          class="rounded border border-gray-200 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
          @change="load"
        >
          <option v-for="a in applications" :key="a.id" :value="a.id">
            {{ a.name }}
          </option>
        </select>
      </div>
      <p class="mb-2 text-xs text-gray-500">
        主题设计令牌（JSON）。分组：colors / font / fontSize / spacing / radius / shadow / sizing /
        lineHeight / letterSpacing，每组为对象。示例：
        {"colors":{"primary":"#1677ff","background":"#ffffff","foreground":"#111827"}}
      </p>
      <textarea
        v-model="tokensText"
        spellcheck="false"
        class="h-[360px] w-full resize-none rounded border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-5 dark:border-gray-600 dark:bg-gray-800"
      ></textarea>
      <div class="mt-3 flex justify-end">
        <Button type="primary" :loading="saving" @click="save">保存</Button>
      </div>
    </Card>
  </div>
</template>
