<script setup>
import { onMounted, ref } from 'vue';

import { Button, Card, Switch, Tag, message } from 'antdv-next';

import Resource from '#/api/resource';
import { requestClient } from '#/api/request';

const modules = ref([]);
const saving = ref(false);
const dirty = ref(false);

function loadModules() {
  return new Resource('admin/cms-modules').list({});
}

function toggle(key, enabled) {
  const m = modules.value.find((x) => x.key === key);
  if (m) {
    m.enabled = enabled;
    dirty.value = true;
  }
}

async function save() {
  saving.value = true;
  try {
    const payload = {};
    modules.value.forEach((m) => {
      payload[m.key] = m.enabled;
    });
    await requestClient.put('/admin/cms-modules', { modules: payload });
    message.success('模块配置已保存');
    dirty.value = false;
  } catch {
    message.error('保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  try {
    const { data } = await loadModules();
    modules.value = data || [];
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div class="p-4">
    <Card>
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="m-0 text-base font-semibold">模块开关</h2>
          <p class="mb-0 mt-1 text-xs text-gray-500">
            控制站点可用的内容模块；关闭后对应菜单与接口对租户不可用。
          </p>
        </div>
        <div class="flex gap-2">
          <Button :disabled="!dirty" @click="loadModules().then(({ data }) => { modules.value = data || []; dirty.value = false; })">
            重置
          </Button>
          <Button type="primary" :disabled="!dirty" :loading="saving" @click="save">
            保存
          </Button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="m in modules"
          :key="m.key"
          class="flex items-center justify-between rounded border border-gray-200 px-4 py-3 dark:border-gray-600"
        >
          <div class="flex min-w-0 flex-col">
            <span class="text-sm font-medium text-gray-800">
              {{ m.label || m.key }}
              <Tag v-if="m.system" color="orange" class="ml-1">系统</Tag>
            </span>
            <span class="text-xs text-gray-400">{{ m.key }}</span>
          </div>
          <Switch
            :checked="!!m.enabled"
            :disabled="!!m.system"
            @change="(v) => toggle(m.key, v)"
          />
        </div>
      </div>
    </Card>
  </div>
</template>
