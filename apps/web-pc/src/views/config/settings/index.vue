<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import {
  Button,
  Card,
  Input,
  InputNumber,
  message,
  Select,
  Switch,
  Tabs,
} from 'antdv-next';

import Resource from '#/api/resource';
import {
  getCurrentApplicationId,
  setCurrentApplicationId,
} from '#/api/application-context';
import { getSettingsApi, putSettingsApi } from '#/api/core/settings';

/**
 * 双用组件：独立页面时自带应用选择；嵌入应用卡片抽屉时由 appId 指定应用
 * （设置接口走请求头 X-Application-Id，仍需同步 localStorage）。
 */
const props = defineProps({
  appId: { type: [Number, String], default: null },
});

const applications = ref([]);
const appId = ref(null);
const groups = ref([]);
/** 仅记录被修改过的叶子：{ [groupKey]: { [leafKey]: value } } */
const edits = ref({});
const loading = ref(false);
const saving = ref(false);
const activeGroup = ref(null);

const appIdNum = computed(() => Number(appId.value) || null);
const dirty = computed(() => Object.keys(edits.value).length > 0);
/** 抽屉嵌入时隐藏自带的应用选择 */
const embedded = computed(() => Number(props.appId) > 0);

function valueOf(group, item) {
  const edited = edits.value[group.group_key]?.[item.key];
  return edited === undefined ? item.value : edited;
}

function toStringValue(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function onChange(group, item, value) {
  edits.value[group.group_key] = {
    ...(edits.value[group.group_key] || {}),
    [item.key]: value,
  };
}

async function load() {
  if (!appIdNum.value) {
    groups.value = [];
    return;
  }
  loading.value = true;
  try {
    const data = await getSettingsApi({ with_locales: false });
    groups.value = data?.groups || [];
    edits.value = {};
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
}

function switchApplication(id) {
  appId.value = id;
  setCurrentApplicationId(id);
  load();
}

async function save() {
  if (!dirty.value) {
    message.info('没有修改');
    return;
  }
  saving.value = true;
  try {
    await putSettingsApi({ settings: edits.value });
    message.success('设置已保存');
    await load();
  } catch {
    // 错误提示由请求拦截器统一处理
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  try {
    const { data } = await new Resource('applications').list({ per_page: 100 });
    applications.value = data || [];
    const propApp = Number(props.appId);
    if (propApp > 0 && applications.value.some((a) => Number(a.id) === propApp)) {
      appId.value = propApp;
    } else {
      const stored = getCurrentApplicationId();
      appId.value =
        stored && applications.value.some((a) => Number(a.id) === stored)
          ? stored
          : (Number(applications.value[0]?.id) || null);
    }
    if (appId.value) {
      setCurrentApplicationId(appId.value);
    }
    await load();
  } catch (error) {
    console.error(error);
  }
});

watch(
  () => props.appId,
  (id) => {
    const num = Number(id);
    if (num > 0 && num !== appId.value) {
      switchApplication(num);
    }
  },
);
</script>

<template>
  <div class="p-4">
    <Card :loading="loading">
      <template #title>站点设置</template>
      <div class="mb-4 flex items-center justify-between">
        <div v-if="!embedded" class="flex items-center gap-3">
          <span class="text-sm text-gray-600">应用</span>
          <select
            :value="appId"
            class="rounded border border-gray-200 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
            @change="switchApplication(Number($event.target.value))"
          >
            <option v-for="a in applications" :key="a.id" :value="a.id">
              {{ a.name }}
            </option>
          </select>
        </div>
        <span v-else class="text-sm text-gray-400">当前应用设置</span>
        <Button type="primary" :disabled="!dirty" :loading="saving" @click="save">
          保存修改
        </Button>
      </div>

      <Tabs v-if="groups.length" v-model:active-key="activeGroup">
        <Tabs.TabPane
          v-for="group in groups"
          :key="group.group_key"
          :tab="group.title"
        >
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div
              v-for="item in group.items"
              :key="item.key"
              class="rounded border border-gray-100 p-3 dark:border-gray-700"
              :class="item.span === 24 ? 'md:col-span-2' : ''"
            >
              <div class="mb-1.5 flex items-center gap-2">
                <span class="text-sm font-medium">{{ item.label }}</span>
                <span class="text-xs text-gray-400">{{ item.key }}</span>
              </div>

              <Switch
                v-if="item.type === 'switch'"
                :checked="valueOf(group, item) === true"
                :disabled="item.disabled"
                @change="(v) => onChange(group, item, v === true)"
              />

              <Select
                v-else-if="item.type === 'select'"
                :value="valueOf(group, item)"
                :options="item.options || []"
                :disabled="item.disabled"
                style="width: 100%"
                @change="(v) => onChange(group, item, v)"
              />

              <InputNumber
                v-else-if="item.type === 'number'"
                :value="valueOf(group, item)"
                :disabled="item.disabled"
                style="width: 100%"
                @change="(v) => onChange(group, item, v)"
              />

              <Input.TextArea
                v-else-if="item.type === 'textarea' || item.type === 'json'"
                :value="toStringValue(valueOf(group, item))"
                :rows="item.type === 'json' ? 6 : 3"
                :disabled="item.disabled"
                @change="(e) => onChange(group, item, e.target.value)"
              />

              <Input
                v-else
                :value="toStringValue(valueOf(group, item))"
                :disabled="item.disabled"
                :placeholder="item.type === 'image' ? '图片路径或 URL' : ''"
                @change="(e) => onChange(group, item, e.target.value)"
              />
            </div>
          </div>
        </Tabs.TabPane>
      </Tabs>
      <p v-else class="py-8 text-center text-sm text-gray-400">
        当前应用暂无设置项
      </p>
    </Card>
  </div>
</template>
