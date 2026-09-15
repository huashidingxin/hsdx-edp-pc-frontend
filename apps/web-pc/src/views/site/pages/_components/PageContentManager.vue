<script setup>
/**
 * 页面静态内容编辑器（抽屉）。
 *
 * 协议依据：docs/saas-website-api.md §1.2A。
 * - 取数配置 `page_data_schemas.schema` 里 provider=static_content 的块，用
 *   config.content_key + config.path 指向 page_contents.data 的子值；
 *   editor 只是编辑提示，不构成后端字段 Schema。
 * - 保存按块进行：先取整份 page_contents.data（本组件内存基准），只替换该块的
 *   config.path，再整份 PUT 回去 —— 多个块共用同一 content_key 的不同 path 时，
 *   保存一个不会删掉其他路径；未列入 editor.fields 的已有字段也原样保留。
 * - 接口：GET/PUT `/pages/{page}/content/{locale}/{contentKey}`（body `{ data }`）。
 */
import { computed, ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  message,
} from 'antdv-next';

import { getCurrentApplicationId } from '#/api/application-context';
import { requestClient } from '#/api/request';
import AppEditor from '#/components/app-editor/index.vue';
import AppUpload from '#/components/AppUpload.vue';

import {
  CARD_FIELD_KINDS,
  getAtPath,
  parseJsonText,
  rewrap,
  setAtPath,
  unwrap,
} from './pageContentModel';
import { createContentLoader } from './pageContentLoader';

const props = defineProps({
  open: { type: Boolean, default: false },
  page: { type: Object, default: null },
});

const emit = defineEmits(['update:open', 'refresh']);

const { hasAccessByCodes } = useAccess();

const canWrite = computed(() => hasAccessByCodes(['cms.page.write']));

const locale = ref('');
const localeOptions = ref([]);
const loading = ref(false);
const savingBlock = ref('');
const schemaRow = ref(null);
const groups = ref([]);
/** 每个内容键的整份 JSON 基准：{ [rowKey]: data } */
const contentData = ref({});
/** 每个块的编辑草稿：{ [blockName]: value } */
const drafts = ref({});
/** 块名 → 展示用元信息（editor.type 等） */
const blockMeta = ref({});
/** 加载序号：并发/重入 load() 时只允许最新一次回写状态与清 loading。 */
let loadSeq = 0;
/**
 * 组件「期望」展示的语言。凡是程序内部给 locale 赋值的地方都**同步**记下来，
 * locale watcher 据此忽略自我触发 —— watcher 在微任务里跑，晚于赋值，
 * 所以标记必须与赋值同一拍写入，否则挡不住重复加载。
 */
const expectedLocale = ref('');

const pageId = computed(() => Number(props.page?.id) || null);
const pageCode = computed(() => props.page?.code ?? null);
const currentAppId = computed(() => getCurrentApplicationId());

const staticBlocks = computed(() =>
  Object.values(blockMeta.value).filter((block) => block.isCurrentPage),
);
const readOnlyBlocks = computed(() =>
  Object.values(blockMeta.value).filter((block) => !block.isCurrentPage),
);
const hasAnyBlock = computed(
  () => staticBlocks.value.length > 0 || readOnlyBlocks.value.length > 0,
);

function resetState() {
  schemaRow.value = null;
  groups.value = [];
  contentData.value = {};
  drafts.value = {};
  blockMeta.value = {};
}

/** 语言下拉：站点默认语言优先，其后为「页面已有语言 → 应用启用语言」。 */
async function loadLocaleOptions() {
  const pageLocales = [];
  for (const item of props.page?.locales ?? []) {
    if (item?.locale) pageLocales.push(item.locale);
  }
  let appDefault = '';
  let appEnabled = [];
  if (currentAppId.value) {
    try {
      const app = await requestClient.get(`/applications/${currentAppId.value}`);
      appDefault = app?.default_locale ?? '';
      appEnabled = (app?.enabled_locales ?? []).filter(
        (code) => typeof code === 'string' && code,
      );
    } catch {
      // 应用详情不可用时只依赖页面已有语言
    }
  }
  const ordered = [appDefault, ...pageLocales, ...appEnabled].filter(Boolean);
  localeOptions.value = [...new Set(ordered)];
  if (localeOptions.value.length === 0) localeOptions.value = ['zh-CN'];
  if (!localeOptions.value.includes(locale.value)) {
    // 首项即站点默认语言，避免中文站默认落在 en-US 上。
    locale.value = localeOptions.value[0];
    // 同步登记，让紧随其后的 locale watcher 忽略这次初始化赋值。
    expectedLocale.value = locale.value;
  }
}

/**
 * 加载流水线（unwrap/rewrap 等纯逻辑在 pageContentModel，
 * 编排在 pageContentLoader，便于单测）。
 */
const contentLoader = createContentLoader({
  fetchSchema: async ({ pageId: id, locale: loc }) => {
    const response = await requestClient.get('/page-data-schema', {
      params: { page_id: id },
    });
    const items = response?.items ?? response ?? [];

    return items.find((item) => item.locale === loc) ?? null;
  },
  fetchContent: async ({ pageId: id, locale: loc, contentKey }) => {
    const response = await requestClient.get(
      `/pages/${id}/content/${loc}/${contentKey}`,
    );

    return response?.data ?? null;
  },
});

async function load() {
  if (!pageId.value) return;
  const seq = (loadSeq += 1);
  loading.value = true;
  resetState();
  try {
    // loadLocaleOptions 内部可能给 locale 赋值；expectedLocale 已同步登记该次赋值，
    // locale watcher 会忽略它；并发/重入场景再由 seq 兜底。
    await loadLocaleOptions();
    if (seq !== loadSeq) return;

    const { schema, groups: nextGroups, meta, data, drafts: nextDrafts } =
      await contentLoader.load({
        pageId: pageId.value,
        locale: locale.value,
        pageCode: pageCode.value,
      });
    if (seq !== loadSeq) return;

    // 原子提交：groups 与 drafts 来自同一次 load，必须一起生效。
    // 只提交其中一半会让模板渲染出「有分组、无草稿」的中间态，
    // card / video 分支会对 undefined 取属性直接抛 TypeError。
    schemaRow.value = schema;
    contentData.value = data;
    blockMeta.value = meta;
    drafts.value = nextDrafts;
    groups.value = nextGroups;
    expectedLocale.value = locale.value;
  } catch (error) {
    message.error(error?.message || '加载页面静态内容失败');
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

/** 块名 → 所属分组。按块名匹配，不依赖对象引用相等（reactive 代理会换引用）。 */
function groupOfBlock(blockName) {
  for (const group of groups.value) {
    if (group.blocks.some((block) => block.blockName === blockName)) {
      return group;
    }
  }

  return null;
}

/**
 * card / video 分支要求草稿是「对象」。缺失或形状不符时返回 null，
 * 模板据此退回 JSON 兜底 —— 保证渲染期永远不会对 undefined 取属性。
 */
function objectDraft(blockName) {
  const value = drafts.value[blockName];

  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

async function saveBlock(blockName) {
  const descriptor = blockMeta.value[blockName];
  if (!descriptor) return;
  const group = groupOfBlock(blockName);
  if (!group?.editable) return;

  const editorType = descriptor.editor?.type ?? 'json';
  let value = drafts.value[blockName];

  if (editorType === 'json') {
    if (typeof value === 'string') {
      const parsed = parseJsonText(value);
      if (!parsed.ok) {
        message.error(`JSON 格式错误：${parsed.error}`);
        return;
      }
      value = parsed.value;
    }
  }

  const raw = getAtPath(contentData.value[group.key], descriptor.path);
  const nextValue = rewrap(editorType, raw, value);
  const nextData = setAtPath(contentData.value[group.key], descriptor.path, nextValue);

  savingBlock.value = blockName;
  try {
    await requestClient.put(
      `/pages/${pageId.value}/content/${locale.value}/${group.contentKey}`,
      { data: nextData },
    );
    contentData.value = { ...contentData.value, [group.key]: nextData };
    if (editorType === 'json' && typeof value === 'object') {
      drafts.value[blockName] = JSON.stringify(value, null, 2);
    }
    message.success(`「${descriptor.label}」已保存并生效`);
    emit('refresh');
  } catch {
    // 请求层已提示后端错误
  } finally {
    savingBlock.value = '';
  }
}

/** 卡片字段：只渲染 editor.fields 声明的项，其余字段原样保留。 */
function cardFields(descriptor) {
  return Object.entries(descriptor.editor?.fields ?? {}).map(([field, meta]) => ({
    field,
    label: meta?.label || field,
    kind: CARD_FIELD_KINDS[field] ?? 'text',
  }));
}

function addCard(blockName, descriptor) {
  const blank = {};
  for (const { field } of cardFields(descriptor)) {
    blank[field] = CARD_FIELD_KINDS[field] === 'images' || CARD_FIELD_KINDS[field] === 'tags' ? [] : '';
  }
  drafts.value[blockName] = [...(drafts.value[blockName] ?? []), blank];
}

function removeCard(blockName, index) {
  const list = [...(drafts.value[blockName] ?? [])];
  list.splice(index, 1);
  drafts.value[blockName] = list;
}

function moveCard(blockName, index, delta) {
  const list = [...(drafts.value[blockName] ?? [])];
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  drafts.value[blockName] = list;
}

/** 展示用文本：对象 → 格式化 JSON，文本原样返回。 */
function formatJson(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

/**
 * JSON 兜底模式的展示文本。**纯读**：不再在渲染期回写 drafts
 * （渲染期改状态是 Vue 反模式，且会把草稿从对象变成文本，
 * 使 isDirty 永远为真、json 块的「保存」一直可点）。
 */
function jsonText(blockName) {
  return formatJson(drafts.value[blockName]);
}

/**
 * 脏值比较：json 块的基线是对象、草稿在用户编辑后是文本，
 * 必须统一成文本再比，否则 json 块永远显示为「已修改」。
 */
function comparableValue(editorType, value) {
  return editorType === 'json'
    ? formatJson(value)
    : JSON.stringify(value ?? null);
}

function isDirty(blockName) {
  const descriptor = blockMeta.value[blockName];
  if (!descriptor) return false;
  const group = groupOfBlock(blockName);
  if (!group?.editable) return false;
  const editorType = descriptor.editor?.type ?? 'json';
  const original = getAtPath(contentData.value[group.key], descriptor.path);
  return (
    comparableValue(editorType, unwrap(editorType, original)) !==
    comparableValue(editorType, drafts.value[blockName])
  );
}

watch(
  () => [props.open, props.page?.id],
  ([open]) => {
    if (open) {
      locale.value = '';
      load();
    }
  },
);

watch(locale, (next, previous) => {
  if (!props.open || !next || next === previous) return;
  // load() 内部初始化语言时也会改 locale；那不是用户切换，不该再触发一次加载
  // （历史上这会并发跑两次 load，导致分组与草稿错位渲染而崩）。
  if (next === expectedLocale.value) return;
  load();
});
</script>

<template>
  <Drawer
    :open="open"
    :width="920"
    destroy-on-close
    title="页面内容"
    @update:open="(v) => emit('update:open', v)"
  >
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <span class="text-sm text-gray-600">页面</span>
      <Tag color="blue">{{ page?.code || '-' }}</Tag>
      <span class="text-sm text-gray-600">语言</span>
      <Select
        v-model:value="locale"
        :options="localeOptions.map((item) => ({ label: item, value: item }))"
        style="width: 140px"
      />
      <Button :loading="loading" @click="load">重新加载</Button>
      <span v-if="!canWrite" class="text-xs text-gray-500">
        当前账号无 cms.page.write 权限，仅可查看
      </span>
    </div>

    <Spin :spinning="loading">
      <Empty v-if="!loading && !schemaRow" description="该页面尚未配置数据来源">
        <Button
          type="link"
          @click="
            pageId &&
              $router.push(`/site/page-data-schema/${pageId}`)
          "
        >
          去配置页面数据
        </Button>
      </Empty>

      <Alert
        v-else-if="!loading && !hasAnyBlock"
        type="info"
        show-icon
        message="该页面未配置静态数据块"
        description="当前页面的数据来源里没有 provider=static_content 的块。若需要编辑静态图文，请先在「页面数据 Schema」中新增静态块并配置 editor 提示。"
      />

      <template v-else-if="!loading">
        <Card
          v-for="group in groups.filter((item) => item.editable)"
          :key="group.key"
          class="mb-4"
          size="small"
        >
          <template #title>
            <span class="text-sm">
              内容键
              <Tag color="geekblue">{{ group.contentKey }}</Tag>
              <span class="text-xs text-gray-500">
                （本页 · {{ locale }}）
              </span>
            </span>
          </template>

          <div
            v-for="block in group.blocks"
            :key="block.blockName"
            class="mb-6 border-b border-gray-100 pb-4 last:mb-0 last:border-b-0 last:pb-0"
          >
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-medium text-gray-800">
                {{ block.label }}
                <Tag class="ml-2">{{ block.editor?.type || 'json' }}</Tag>
                <span class="ml-1 text-xs text-gray-400">
                  {{ block.blockName }} · path: {{ block.path.length ? block.path.join('.') : '(整份)' }}
                </span>
              </span>
              <Button
                v-if="canWrite"
                type="primary"
                size="small"
                :disabled="!isDirty(block.blockName)"
                :loading="savingBlock === block.blockName"
                @click="saveBlock(block.blockName)"
              >
                保存
              </Button>
            </div>

            <!-- image：单图 -->
            <AppUpload
              v-if="block.editor?.type === 'image'"
              v-model="drafts[block.blockName]"
              :disabled="!canWrite"
              file-type="image"
            />

            <!-- images：图片集合 -->
            <AppUpload
              v-else-if="block.editor?.type === 'images'"
              v-model="drafts[block.blockName]"
              :disabled="!canWrite"
              file-type="image"
              multiple
            />

            <!-- richtext：富文本 -->
            <AppEditor
              v-else-if="block.editor?.type === 'richtext'"
              v-model="drafts[block.blockName]"
              :disabled="!canWrite"
            />

            <!-- video：视频地址 + 封面 -->
            <div
              v-else-if="
                block.editor?.type === 'video' && objectDraft(block.blockName)
              "
              class="flex flex-col gap-3"
            >
              <Input
                v-model:value="drafts[block.blockName].video"
                :disabled="!canWrite"
                placeholder="视频地址"
              />
              <AppUpload
                v-model="drafts[block.blockName].image"
                :disabled="!canWrite"
                file-type="image"
              />
            </div>

            <!-- card：单条图文 -->
            <div
              v-else-if="
                block.editor?.type === 'card' && objectDraft(block.blockName)
              "
              class="flex flex-col gap-3"
            >
              <div
                v-for="item in cardFields(block)"
                :key="item.field"
                class="flex flex-col gap-1"
              >
                <span class="text-xs text-gray-500">{{ item.label }}</span>
                <AppEditor
                  v-if="item.kind === 'richtext'"
                  v-model="drafts[block.blockName][item.field]"
                  :disabled="!canWrite"
                />
                <AppUpload
                  v-else-if="item.kind === 'image'"
                  v-model="drafts[block.blockName][item.field]"
                  :disabled="!canWrite"
                  file-type="image"
                />
                <AppUpload
                  v-else-if="item.kind === 'images'"
                  v-model="drafts[block.blockName][item.field]"
                  :disabled="!canWrite"
                  file-type="image"
                  multiple
                />
                <Select
                  v-else-if="item.kind === 'tags'"
                  v-model:value="drafts[block.blockName][item.field]"
                  :disabled="!canWrite"
                  mode="tags"
                  placeholder="回车添加标签"
                  style="width: 100%"
                />
                <Input
                  v-else
                  v-model:value="drafts[block.blockName][item.field]"
                  :disabled="!canWrite"
                />
              </div>
            </div>

            <!-- cards：图文列表 -->
            <div
              v-else-if="block.editor?.type === 'cards'"
              class="flex flex-col gap-3"
            >
              <Card
                v-for="(item, index) in drafts[block.blockName] || []"
                :key="index"
                size="small"
                class="bg-gray-50"
              >
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-xs text-gray-500">第 {{ index + 1 }} 项</span>
                  <Space v-if="canWrite">
                    <Button size="small" @click="moveCard(block.blockName, index, -1)">
                      上移
                    </Button>
                    <Button size="small" @click="moveCard(block.blockName, index, 1)">
                      下移
                    </Button>
                    <Button
                      danger
                      size="small"
                      @click="removeCard(block.blockName, index)"
                    >
                      删除
                    </Button>
                  </Space>
                </div>
                <div class="flex flex-col gap-3">
                  <div
                    v-for="field in cardFields(block)"
                    :key="field.field"
                    class="flex flex-col gap-1"
                  >
                    <span class="text-xs text-gray-500">{{ field.label }}</span>
                    <AppEditor
                      v-if="field.kind === 'richtext'"
                      v-model="item[field.field]"
                      :disabled="!canWrite"
                    />
                    <AppUpload
                      v-else-if="field.kind === 'image'"
                      v-model="item[field.field]"
                      :disabled="!canWrite"
                      file-type="image"
                    />
                    <AppUpload
                      v-else-if="field.kind === 'images'"
                      v-model="item[field.field]"
                      :disabled="!canWrite"
                      file-type="image"
                      multiple
                    />
                    <Select
                      v-else-if="field.kind === 'tags'"
                      v-model:value="item[field.field]"
                      :disabled="!canWrite"
                      mode="tags"
                      placeholder="回车添加标签"
                      style="width: 100%"
                    />
                    <Input
                      v-else
                      v-model:value="item[field.field]"
                      :disabled="!canWrite"
                    />
                  </div>
                </div>
              </Card>
              <Button v-if="canWrite" @click="addCard(block.blockName, block)">
                新增一项
              </Button>
            </div>

            <!-- json / 无 editor：通用 JSON 兜底 -->
            <textarea
              v-else
              :value="jsonText(block.blockName)"
              spellcheck="false"
              :disabled="!canWrite"
              class="h-40 w-full resize-y rounded border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-5"
              @input="(e) => (drafts[block.blockName] = e.target.value)"
            ></textarea>
          </div>
        </Card>

        <Alert
          v-if="readOnlyBlocks.length"
          type="warning"
          show-icon
          class="mb-4"
          message="以下块引用了其他页面的静态内容，本页不可编辑"
        >
          <ul class="mt-1 list-disc pl-5 text-xs">
            <li v-for="block in readOnlyBlocks" :key="block.blockName">
              {{ block.label }}（{{ block.blockName }} → 页面
              {{ block.pageCode }} / {{ block.contentKey }}）
            </li>
          </ul>
        </Alert>
      </template>
    </Spin>
  </Drawer>
</template>
