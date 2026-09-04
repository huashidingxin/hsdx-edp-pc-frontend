<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Button, Card, Empty, Select, Space, Tag, message } from 'antdv-next';

import Resource from '#/api/resource';
import { requestClient } from '#/api/request';

const route = useRoute();

const pages = ref([]);
const pageId = ref(null);
const locale = ref('zh-CN');
const code = ref('');
const schemaText = ref('');
const revisions = ref([]);
const loading = ref(false);
const saving = ref(false);
const publishing = ref(false);

const locales = ref(['zh-CN', 'en-US']);
const codeOptions = ref([]);

const hasLoaded = computed(() => pageId.value !== null && locale.value && code.value);

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    message.error(`JSON 格式错误：${e.message}`);
    return null;
  }
}

async function loadPages() {
  try {
    const { data } = await new Resource('pages').list({ per_page: 100 });
    pages.value = data || [];
    const fromRoute = route.params.pageId;
    if (fromRoute && pages.value.some((p) => String(p.id) === String(fromRoute))) {
      pageId.value = Number(fromRoute);
    } else if (pages.value.length > 0 && pageId.value === null) {
      pageId.value = pages.value[0].id;
    }
  } catch {
    message.error('加载页面列表失败');
  }
}

async function loadCodeOptions() {
  try {
    const res = await requestClient.get('/page-data-schema', {
      params: { page_id: pageId.value },
    });
    const items = res?.items || res || [];
    codeOptions.value = [...new Set(items.map((i) => i.code))].sort();
    if (codeOptions.value.length > 0 && !codeOptions.value.includes(code.value)) {
      code.value = codeOptions.value[0];
    }
  } catch {
    codeOptions.value = [];
  }
}

async function loadSchema() {
  if (!hasLoaded.value) return;
  loading.value = true;
  try {
    const data = await requestClient.get(
      `/pages/${pageId.value}/data-schema/${locale.value}/${code.value}`,
    );
    schemaText.value = data?.schema
      ? JSON.stringify(data.schema, null, 2)
      : '{}';
  } catch {
    schemaText.value = '{}';
  } finally {
    loading.value = false;
  }
}

async function loadRevisions() {
  if (!hasLoaded.value) return;
  try {
    const res = await requestClient.get(
      `/pages/${pageId.value}/data-schema/${locale.value}/${code.value}/revisions`,
    );
    revisions.value = res?.items || res || [];
  } catch {
    revisions.value = [];
  }
}

async function saveDraft() {
  const schema = parseJson(schemaText.value);
  if (!schema) return;
  saving.value = true;
  try {
    await requestClient.put(
      `/pages/${pageId.value}/data-schema/${locale.value}/${code.value}`,
      { schema },
    );
    message.success('草稿已保存');
    await loadRevisions();
  } catch {
    message.error('保存失败');
  } finally {
    saving.value = false;
  }
}

async function publish() {
  const schema = parseJson(schemaText.value);
  if (!schema) return;
  publishing.value = true;
  try {
    await requestClient.post(
      `/pages/${pageId.value}/data-schema/${locale.value}/${code.value}/publish`,
      { schema },
    );
    message.success('已发布');
    await loadRevisions();
  } catch {
    message.error('发布失败');
  } finally {
    publishing.value = false;
  }
}

async function restore(revision) {
  try {
    await requestClient.post(
      `/pages/${pageId.value}/data-schema/${locale.value}/${code.value}/restore`,
      { revision_id: revision.id },
    );
    message.success('已恢复');
    await loadSchema();
    await loadRevisions();
  } catch {
    message.error('恢复失败');
  }
}

watch([pageId, locale, code], () => {
  if (hasLoaded.value) {
    loadSchema();
    loadRevisions();
  }
});

onMounted(async () => {
  await loadPages();
  await loadCodeOptions();
  loadSchema();
  loadRevisions();
});
</script>

<template>
  <div class="p-4">
    <Card :loading="loading">
      <template #title>页面数据 Schema</template>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <span class="text-sm text-gray-600">页面</span>
        <Select
          v-model:value="pageId"
          :options="pages"
          :field-names="{ label: 'code', value: 'id' }"
          style="width: 200px"
          @change="loadCodeOptions"
        />
        <span class="text-sm text-gray-600">语言</span>
        <Select v-model:value="locale" :options="locales" style="width: 120px" />
        <span class="text-sm text-gray-600">Schema</span>
        <Select
          v-model:value="code"
          :options="codeOptions"
          style="width: 200px"
        />
      </div>

      <template v-if="hasLoaded">
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div class="lg:col-span-2">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-medium text-gray-700">
                Schema JSON（{{ code }} · {{ locale }}）
              </span>
              <Space>
                <Button :loading="saving" @click="saveDraft">保存草稿</Button>
                <Button type="primary" :loading="publishing" @click="publish">
                  发布
                </Button>
              </Space>
            </div>
            <textarea
              v-model="schemaText"
              spellcheck="false"
              class="h-[420px] w-full resize-none rounded border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-5 dark:border-gray-600 dark:bg-gray-800"
            ></textarea>
          </div>

          <div>
            <div class="mb-2 text-sm font-medium text-gray-700">修订历史</div>
            <div class="max-h-[440px] space-y-2 overflow-y-auto">
              <div
                v-for="r in revisions"
                :key="r.id"
                class="rounded border border-gray-200 p-3 dark:border-gray-600"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-500">
                    v{{ r.version }} · {{ r.created_at?.slice(0, 19) || '-' }}
                  </span>
                  <Button size="small" @click="restore(r)">恢复</Button>
                </div>
                <pre class="mt-2 max-h-32 overflow-auto rounded bg-gray-50 p-2 text-xs dark:bg-gray-800">{{ JSON.stringify(r.schema, null, 1) }}</pre>
              </div>
              <Empty v-if="!revisions.length" description="暂无修订" />
            </div>
          </div>
        </div>
      </template>
      <Empty v-else description="请选择页面与 Schema" />
    </Card>
  </div>
</template>
