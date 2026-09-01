<script setup>
import { computed, onMounted, ref } from 'vue';

import { Button, Card, Input, Select, Table, message } from 'antdv-next';

import Resource from '#/api/resource';
import { requestClient } from '#/api/request';

const applications = ref([]);
const appId = ref(null);
const locale = ref('');
const locales = ref([]);
const rows = ref([]);
const loading = ref(false);
const saving = ref(false);
const allData = ref(null);

const appIdNum = computed(() => Number(appId.value) || null);

async function load() {
  if (!appIdNum.value) return;
  loading.value = true;
  try {
    allData.value = await requestClient.get(
      `/applications/${appIdNum.value}/ui-strings`,
    );
    locales.value = Object.keys(allData.value?.locales || {});
    if (locales.value.length > 0 && !locales.value.includes(locale.value)) {
      locale.value = locales.value[0];
    }
    applyLocale();
  } catch {
    allData.value = null;
  } finally {
    loading.value = false;
  }
}

function applyLocale() {
  const map = allData.value?.locales?.[locale.value] || {};
  rows.value = Object.entries(map).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

function addRow() {
  rows.value.push({ key: '', value: '' });
}

function removeRow(index) {
  rows.value.splice(index, 1);
}

async function save() {
  const map = {};
  let valid = true;
  rows.value.forEach((r) => {
    if (!r.key) {
      message.warning('存在空的 key');
      valid = false;
      return;
    }
    map[r.key] = r.value;
  });
  if (!valid) return;
  saving.value = true;
  try {
    const payload = { locales: { [locale.value]: map } };
    await requestClient.put(
      `/applications/${appIdNum.value}/ui-strings`,
      payload,
    );
    message.success('UI 词条已保存');
    await load();
  } catch {
    message.error('保存失败');
  } finally {
    saving.value = false;
  }
}

const columns = [
  { title: 'Key', dataIndex: 'key', key: 'key' },
  { title: 'Value', dataIndex: 'value', key: 'value' },
];

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
      <template #title>UI 词条</template>
      <div class="mb-4 flex flex-wrap items-center gap-3">
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
        <span class="text-sm text-gray-600">语言</span>
        <Select v-model:value="locale" style="width: 140px" @change="applyLocale">
          <option v-for="l in locales" :key="l" :value="l">{{ l }}</option>
        </Select>
        <Button size="small" @click="addRow">新增词条</Button>
      </div>

      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="bg-gray-50 dark:bg-gray-800">
            <th class="border border-gray-200 px-3 py-2 text-left dark:border-gray-600">Key</th>
            <th class="border border-gray-200 px-3 py-2 text-left dark:border-gray-600">Value</th>
            <th class="border border-gray-200 px-3 py-2 dark:border-gray-600" style="width: 60px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i">
            <td class="border border-gray-200 px-2 py-1 dark:border-gray-600">
              <Input v-model:value="r.key" placeholder="如 site.title" />
            </td>
            <td class="border border-gray-200 px-2 py-1 dark:border-gray-600">
              <Input v-model:value="r.value" placeholder="值" />
            </td>
            <td class="border border-gray-200 px-2 py-1 text-center dark:border-gray-600">
              <Button size="small" danger @click="removeRow(i)">删</Button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="mt-3 flex justify-end">
        <Button type="primary" :loading="saving" @click="save">保存</Button>
      </div>
    </Card>
  </div>
</template>
