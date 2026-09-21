<script setup>
/**
 * 页面数据配置编辑器（P17 具名数据块）。
 *
 * 协议依据：docs/saas-website-api.md §1.2A「页面数据配置」（唯一实现规范）。
 * - 保存位置：page_data_schemas.schema，JSON 顶层只有 blocks。
 * - 每个块：provider（model / static_content / page_banner）+ config + enabled + editor。
 * - editor 只是静态块的编辑提示，随配置保存；不是后端字段 Schema。
 * - 接口：GET/PUT `/pages/{page}/data-schema/{locale}/{code}`，body `{ schema: { blocks } }`。
 *   `code` 即 pages.code（page_data_schemas.code 是它的冗余列）。
 * - 保存立即生效，无发布步骤；后端仍会再校验一次（422 返回可读文案）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Select,
  Switch,
  Tag,
  message,
} from 'antdv-next';

import { getCurrentApplicationId } from '#/api/application-context';
import Resource from '#/api/resource';
import { requestClient } from '#/api/request';

import {
  EDITOR_FIELDS,
  EDITOR_TYPES,
  PROVIDERS,
  parseJsonText,
  toSchemaPayload,
  validateSchema,
} from '../pages/_components/pageContentModel';

const route = useRoute();

const PROVIDER_OPTIONS = PROVIDERS.map((value) => ({ label: value, value }));
const EDITOR_TYPE_OPTIONS = EDITOR_TYPES.map((value) => ({ label: value, value }));
const MODE_OPTIONS = [
  { label: 'list', value: 'list' },
  { label: 'one', value: 'one' },
];
const FALLBACK_OPTIONS = [
  { label: 'none', value: 'none' },
  { label: 'static_template', value: 'static_template' },
];

const pages = ref([]);
const pageId = ref(null);
const locale = ref('');
const localeOptions = ref([]);
const mode = ref('form');
const rows = ref([]);
const jsonText = ref('');
const loading = ref(false);
const saving = ref(false);
const errors = ref([]);

const currentPage = computed(
  () => pages.value.find((item) => Number(item.id) === Number(pageId.value)) ?? null,
);
const pageCode = computed(() => currentPage.value?.code ?? '');
const canLoad = computed(() => Boolean(pageId.value && locale.value && pageCode.value));

function newRow() {
  return {
    name: '',
    provider: 'static_content',
    enabled: true,
    cfg: { mode: 'list' },
    fieldsText: '',
    filtersText: '',
    sortByText: '',
    pathText: '',
    editorEnabled: false,
    editor: { type: 'json', label: '', fields: [] },
  };
}

/** 已保存的块 → 表单行（UI 字段用扁平 cfg，避免把未知键写回后端）。 */
function blockToRow(name, block) {
  const config = block?.config ?? {};
  const editor = block?.editor ?? null;
  return {
    name,
    provider: block?.provider ?? 'static_content',
    enabled: block?.enabled !== false,
    cfg: {
      type: config.type ?? '',
      mode: config.mode ?? 'list',
      limit: config.limit ?? null,
      categorySlug: config.category_slug ?? '',
      related: config.related === true,
      id: config.id ?? null,
      idParam: config.id_param ?? '',
      contentKey: config.content_key ?? '',
      pageCode: config.page_code ?? '',
      fallback: config.fallback ?? 'none',
    },
    fieldsText: Array.isArray(config.fields)
      ? config.fields.join(', ')
      : (config.fields ?? ''),
    filtersText:
      config.filters === undefined ? '' : JSON.stringify(config.filters, null, 2),
    sortByText:
      config.sort_by === undefined ? '' : JSON.stringify(config.sort_by, null, 2),
    pathText: Array.isArray(config.path) ? config.path.join(', ') : '',
    editorEnabled: Boolean(editor),
    editor: {
      type: editor?.type ?? 'json',
      label: editor?.label ?? '',
      fields: Object.entries(editor?.fields ?? {}).map(([key, meta]) => ({
        key,
        label: meta?.label ?? '',
      })),
    },
  };
}

function schemaToRows(schema) {
  const blocks = schema?.blocks ?? {};
  return Object.entries(blocks).map(([name, block]) => blockToRow(name, block));
}

function parsePathText(text) {
  return String(text)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .map((item) => (/^\d+$/.test(item) ? Number(item) : item));
}

/** 表单行 → 保存用块配置。按 provider 从零构造，保证不残留其他 provider 的键。 */
function rowToBlock(row) {
  const cfg = row.cfg ?? {};
  let config;
  if (row.provider === 'model') {
    config = { type: String(cfg.type ?? '').trim(), mode: cfg.mode ?? 'list' };
    if (row.filtersText?.trim()) {
      const filters = parseJsonText(row.filtersText);
      if (!filters.ok) throw new Error(`块「${row.name}」filters 不是合法 JSON`);
      config.filters = filters.value;
    }
    if (row.sortByText?.trim()) {
      const sortBy = parseJsonText(row.sortByText);
      if (!sortBy.ok) throw new Error(`块「${row.name}」sort_by 不是合法 JSON`);
      config.sort_by = sortBy.value;
    }
    if (row.fieldsText?.trim()) {
      config.fields = String(row.fieldsText)
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '');
    }
    if (cfg.categorySlug) config.category_slug = cfg.categorySlug;
    if (config.mode === 'list') {
      if (cfg.limit !== null && cfg.limit !== undefined && cfg.limit !== '') {
        config.limit = Number(cfg.limit);
      }
      if (cfg.related) config.related = true;
    } else {
      if (cfg.id !== null && cfg.id !== undefined && cfg.id !== '') {
        config.id = Number(cfg.id);
      }
      if (cfg.idParam) config.id_param = cfg.idParam;
    }
  } else if (row.provider === 'static_content') {
    config = { content_key: String(cfg.contentKey ?? '').trim() };
    if (cfg.pageCode) config.page_code = cfg.pageCode;
    if (row.pathText?.trim()) config.path = parsePathText(row.pathText);
  } else {
    config = {};
    if (cfg.fallback) config.fallback = cfg.fallback;
  }

  const block = { provider: row.provider, enabled: row.enabled, config };

  if (row.provider === 'static_content' && row.editorEnabled) {
    const fields = {};
    for (const item of row.editor?.fields ?? []) {
      const key = String(item.key ?? '').trim();
      if (key) fields[key] = { label: String(item.label ?? '').trim() };
    }
    block.editor = {
      type: row.editor?.type ?? 'json',
      label: String(row.editor?.label ?? '').trim(),
    };
    if (Object.keys(fields).length > 0) block.editor.fields = fields;
  }

  return block;
}

/** 表单行 → `{ blocks }`；块名重复/为空在这里拦住。 */
function buildSchema() {
  const blocks = {};
  for (const row of rows.value) {
    const name = String(row.name ?? '').trim();
    if (!name) throw new Error('存在未填写块名的块');
    if (blocks[name]) throw new Error(`块名重复：${name}`);
    blocks[name] = rowToBlock(row);
  }
  return toSchemaPayload(blocks);
}

function refreshJsonFromForm() {
  try {
    jsonText.value = JSON.stringify(buildSchema(), null, 2);
    return true;
  } catch (error) {
    message.error(error.message);
    return false;
  }
}

function refreshFormFromJson() {
  const parsed = parseJsonText(jsonText.value || '{}');
  if (!parsed.ok) {
    message.error(`JSON 格式错误：${parsed.error}`);
    return false;
  }
  rows.value = schemaToRows(parsed.value);
  return true;
}

function switchMode(next) {
  if (next === mode.value) return;
  if (next === 'json') {
    if (!refreshJsonFromForm()) return;
  } else if (!refreshFormFromJson()) {
    return;
  }
  mode.value = next;
}

async function loadLocaleOptions() {
  const set = new Set();
  if (getCurrentApplicationId()) {
    try {
      const app = await requestClient.get(`/applications/${getCurrentApplicationId()}`);
      if (app?.default_locale) set.add(app.default_locale);
      for (const item of app?.enabled_locales ?? []) {
        if (typeof item === 'string' && item) set.add(item);
      }
    } catch {
      // 应用详情不可用时退化为页面/配置行已有语言
    }
  }
  for (const item of currentPage.value?.locales ?? []) {
    if (item?.locale) set.add(item.locale);
  }
  try {
    const response = await requestClient.get('/page-data-schema', {
      params: { page_id: pageId.value },
    });
    for (const item of response?.items ?? response ?? []) {
      if (item?.locale) set.add(item.locale);
    }
  } catch {
    // 尚无配置行
  }
  if (set.size === 0) set.add('zh-CN');
  // 首项即站点默认语言（loadLocaleOptions 先塞 default_locale），与页面内容抽屉保持一致；
  // 此前取 currentPage.locales[0]，会让中文站默认落在 en-US 上。
  localeOptions.value = [...set];
  if (!localeOptions.value.includes(locale.value)) {
    locale.value = localeOptions.value[0];
  }
}

async function loadPages() {
  const { data } = await new Resource('pages').list({ per_page: 100 });
  pages.value = data || [];
  const fromRoute = route.params.pageId;
  if (fromRoute && pages.value.some((p) => String(p.id) === String(fromRoute))) {
    pageId.value = Number(fromRoute);
  } else if (pages.value.length > 0 && pageId.value === null) {
    pageId.value = pages.value[0].id;
  }
}

async function loadSchema() {
  if (!canLoad.value) return;
  loading.value = true;
  errors.value = [];
  try {
    const response = await requestClient.get(
      `/pages/${pageId.value}/data-schema/${locale.value}/${pageCode.value}`,
    );
    const schema = response?.schema ?? { blocks: {} };
    rows.value = schemaToRows(schema);
    jsonText.value = JSON.stringify(toSchemaPayload(schema.blocks ?? {}), null, 2);
  } catch {
    // 尚无配置：以空 blocks 起手，保存时由 PUT 创建
    rows.value = [];
    jsonText.value = JSON.stringify({ blocks: {} }, null, 2);
  } finally {
    loading.value = false;
  }
}

async function save() {
  let schema;
  try {
    schema = mode.value === 'form' ? buildSchema() : parseJsonText(jsonText.value).value;
  } catch (error) {
    message.error(error.message);
    return;
  }
  if (mode.value === 'json' && !schema) {
    message.error('JSON 格式错误');
    return;
  }

  const found = validateSchema(schema);
  errors.value = found;
  if (found.length > 0) {
    message.error(`配置校验未通过（${found.length} 项），请修正后重试`);
    return;
  }

  saving.value = true;
  try {
    await requestClient.put(
      `/pages/${pageId.value}/data-schema/${locale.value}/${pageCode.value}`,
      { schema },
    );
    rows.value = schemaToRows(schema);
    jsonText.value = JSON.stringify(schema, null, 2);
    message.success('已保存并生效');
  } catch {
    // 请求层已提示后端错误（含 SCHEMA_INVALID 文案）
  } finally {
    saving.value = false;
  }
}

function addRow() {
  rows.value = [...rows.value, newRow()];
}

function removeRow(index) {
  rows.value = rows.value.filter((_, i) => i !== index);
}

function addEditorField(row) {
  row.editor.fields = [...(row.editor.fields ?? []), { key: '', label: '' }];
}

function removeEditorField(row, index) {
  row.editor.fields = row.editor.fields.filter((_, i) => i !== index);
}

/** 当前 editor.type 允许声明的字段（供下拉选择）。 */
function editorFieldOptions(row) {
  const allowed = EDITOR_FIELDS[row.editor?.type] ?? [];
  return allowed.map((value) => ({ label: value, value }));
}

function editorSupportsFields(row) {
  return !['images', 'json'].includes(row.editor?.type ?? 'json');
}

watch([pageId, locale, pageCode], () => {
  if (canLoad.value) {
    loadSchema();
  }
});

onMounted(async () => {
  try {
    await loadPages();
    await loadLocaleOptions();
    await loadSchema();
  } catch {
    message.error('加载页面列表失败');
  }
});
</script>

<template>
  <div class="p-4">
    <Card :loading="loading">
      <template #title>页面数据配置</template>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <span class="text-sm text-gray-600">页面</span>
        <Select
          v-model:value="pageId"
          :options="pages"
          :field-names="{ label: 'code', value: 'id' }"
          style="width: 200px"
        />
        <span class="text-sm text-gray-600">语言</span>
        <Select
          v-model:value="locale"
          :options="localeOptions.map((item) => ({ label: item, value: item }))"
          style="width: 130px"
        />
        <span class="text-sm text-gray-600">模式</span>
        <Button :type="mode === 'form' ? 'primary' : 'default'" @click="switchMode('form')">
          表单
        </Button>
        <Button :type="mode === 'json' ? 'primary' : 'default'" @click="switchMode('json')">
          JSON
        </Button>
        <Button type="primary" :loading="saving" @click="save">保存并生效</Button>
        <span v-if="pageCode" class="text-xs text-gray-500">
          保存路径：{{ pageCode }} · {{ locale }}
        </span>
      </div>

      <Alert
        v-if="errors.length"
        type="error"
        show-icon
        class="mb-4"
        message="配置校验未通过"
      >
        <ul class="mt-1 list-disc pl-5 text-xs">
          <li v-for="(item, index) in errors" :key="index">
            {{ item.block }}：{{ item.message }}
          </li>
        </ul>
      </Alert>

      <template v-if="mode === 'form'">
        <Empty v-if="rows.length === 0" description="尚未配置任何数据块">
          <Button type="primary" @click="addRow">新增数据块</Button>
        </Empty>

        <Card
          v-for="(row, index) in rows"
          :key="index"
          class="mb-4"
          size="small"
        >
          <template #title>
            <span class="text-sm">
              数据块
              <Tag color="geekblue">
                {{ (row.editorEnabled && row.editor?.label) || row.name || '(未命名)' }}
              </Tag>
              <!-- 启用 editor 提示后以 label 为主标题，块名作为技术标识保留在旁 -->
              <span
                v-if="row.editorEnabled && row.editor?.label && row.name"
                class="ml-1 text-xs text-gray-400"
              >
                {{ row.name }}
              </span>
            </span>
          </template>
          <template #extra>
            <Button danger size="small" @click="removeRow(index)">删除</Button>
          </template>

          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-end gap-3">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">块名（[a-z][a-z0-9_-]*）</span>
                <Input
                  v-model:value="row.name"
                  style="width: 200px"
                  placeholder="如 service_ai_features"
                />
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">来源</span>
                <Select
                  v-model:value="row.provider"
                  :options="PROVIDER_OPTIONS"
                  style="width: 160px"
                />
              </div>
              <div class="flex items-center gap-2">
                <Switch v-model:checked="row.enabled" />
                <span class="text-xs text-gray-500">启用</span>
              </div>
            </div>

            <!-- model -->
            <div v-if="row.provider === 'model'" class="flex flex-wrap items-end gap-3">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">来源类型 type</span>
                <Input v-model:value="row.cfg.type" style="width: 160px" placeholder="如 product" />
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">mode</span>
                <Select v-model:value="row.cfg.mode" :options="MODE_OPTIONS" style="width: 110px" />
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">category_slug</span>
                <Input v-model:value="row.cfg.categorySlug" style="width: 150px" />
              </div>
              <div v-if="row.cfg.mode === 'list'" class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">limit（1..100）</span>
                <InputNumber v-model:value="row.cfg.limit" :min="1" :max="100" style="width: 120px" />
              </div>
              <div v-if="row.cfg.mode === 'list'" class="flex items-center gap-2">
                <Switch v-model:checked="row.cfg.related" />
                <span class="text-xs text-gray-500">related</span>
              </div>
              <template v-else>
                <div class="flex flex-col gap-1">
                  <span class="text-xs text-gray-500">id</span>
                  <InputNumber v-model:value="row.cfg.id" :min="1" style="width: 120px" />
                </div>
                <div class="flex flex-col gap-1">
                  <span class="text-xs text-gray-500">id_param</span>
                  <Input v-model:value="row.cfg.idParam" style="width: 140px" placeholder="如 card_id" />
                </div>
              </template>
            </div>

            <!-- static_content -->
            <div
              v-else-if="row.provider === 'static_content'"
              class="flex flex-wrap items-end gap-3"
            >
              <div class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">content_key</span>
                <Input v-model:value="row.cfg.contentKey" style="width: 180px" />
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">page_code（可选，默认当前页）</span>
                <Input v-model:value="row.cfg.pageCode" style="width: 180px" />
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">path（逗号分隔，空=整份）</span>
                <Input v-model:value="row.pathText" style="width: 240px" placeholder="如 about, title" />
              </div>
            </div>

            <!-- page_banner -->
            <div v-else class="flex flex-wrap items-end gap-3">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">fallback</span>
                <Select v-model:value="row.cfg.fallback" :options="FALLBACK_OPTIONS" style="width: 180px" />
              </div>
            </div>

            <!-- model 高级项 -->
            <template v-if="row.provider === 'model'">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">fields（逗号分隔，可选）</span>
                <Input v-model:value="row.fieldsText" placeholder="如 id, title, cover" />
              </div>
              <div class="flex flex-wrap gap-3">
                <div class="flex flex-1 flex-col gap-1">
                  <span class="text-xs text-gray-500">filters（JSON 数组，可选）</span>
                  <textarea
                    v-model="row.filtersText"
                    spellcheck="false"
                    class="h-24 w-full resize-y rounded border border-gray-200 bg-gray-50 p-2 font-mono text-xs"
                  ></textarea>
                </div>
                <div class="flex flex-1 flex-col gap-1">
                  <span class="text-xs text-gray-500">sort_by（JSON 数组，可选）</span>
                  <textarea
                    v-model="row.sortByText"
                    spellcheck="false"
                    class="h-24 w-full resize-y rounded border border-gray-200 bg-gray-50 p-2 font-mono text-xs"
                  ></textarea>
                </div>
              </div>
            </template>

            <!-- editor 提示：仅 static_content -->
            <div v-if="row.provider === 'static_content'" class="rounded bg-gray-50 p-3">
              <div class="mb-2 flex items-center gap-2">
                <Switch v-model:checked="row.editorEnabled" />
                <span class="text-xs text-gray-600">
                  配置编辑提示 editor（仅影响后台编辑控件，不改变公开数据）
                </span>
              </div>
              <template v-if="row.editorEnabled">
                <div class="flex flex-wrap items-end gap-3">
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-gray-500">type</span>
                    <Select
                      v-model:value="row.editor.type"
                      :options="EDITOR_TYPE_OPTIONS"
                      style="width: 140px"
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-gray-500">label（后台识别名，≤160 字）</span>
                    <Input v-model:value="row.editor.label" style="width: 280px" />
                  </div>
                </div>

                <div v-if="editorSupportsFields(row)" class="mt-3">
                  <div class="mb-1 text-xs text-gray-500">
                    字段提示 fields（card/cards 必填）
                  </div>
                  <div
                    v-for="(field, fieldIndex) in row.editor.fields"
                    :key="fieldIndex"
                    class="mb-2 flex items-center gap-2"
                  >
                    <Select
                      v-model:value="field.key"
                      :options="editorFieldOptions(row)"
                      style="width: 150px"
                      placeholder="字段"
                    />
                    <Input
                      v-model:value="field.label"
                      style="width: 240px"
                      placeholder="字段名称"
                    />
                    <Button danger size="small" @click="removeEditorField(row, fieldIndex)">
                      移除
                    </Button>
                  </div>
                  <Button size="small" @click="addEditorField(row)">添加字段</Button>
                </div>
              </template>
            </div>
          </div>
        </Card>

        <Button v-if="rows.length > 0" type="dashed" block @click="addRow">
          新增数据块
        </Button>
      </template>

      <template v-else>
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium text-gray-700">
            blocks JSON（{{ pageCode }} · {{ locale }}）
          </span>
        </div>
        <textarea
          v-model="jsonText"
          spellcheck="false"
          class="h-[520px] w-full resize-y rounded border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-5"
        ></textarea>
        <Alert
          class="mt-2"
          type="info"
          show-icon
          message="顶层只能包含 blocks；未知字段或错误层级会被后端拒绝（422）。"
        />
      </template>
    </Card>
  </div>
</template>
