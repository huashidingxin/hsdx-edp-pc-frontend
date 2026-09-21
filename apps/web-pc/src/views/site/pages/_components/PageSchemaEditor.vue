<script setup>
/**
 * 页面数据配置编辑器（P17 具名数据块 Schema）。
 *
 * 协议依据：docs/saas-website-api.md §1.2A「页面数据配置」（唯一规范）。
 * 支持在工作台与独立页双向复用。
 */
import { computed, onMounted, ref, watch } from 'vue';

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

import { requestClient } from '#/api/request';

import {
  EDITOR_FIELDS,
  EDITOR_TYPES,
  PROVIDERS,
  parseJsonText,
  toSchemaPayload,
  validateSchema,
} from './pageContentModel';

const props = defineProps({
  pageId: { type: [Number, String], required: true },
  locale: { type: String, required: true },
  pageCode: { type: String, required: true },
});

const emit = defineEmits(['saved']);

const PROVIDER_OPTIONS = PROVIDERS.map((value) => ({ label: value, value }));
const EDITOR_TYPE_OPTIONS = EDITOR_TYPES.map((value) => ({ label: value, value }));
const MODE_OPTIONS = [
  { label: 'list (多条列表)', value: 'list' },
  { label: 'one (单条记录)', value: 'one' },
];
const FALLBACK_OPTIONS = [
  { label: 'none', value: 'none' },
  { label: 'static_template', value: 'static_template' },
];

const mode = ref('form');
const rows = ref([]);
const jsonText = ref('');
const loading = ref(false);
const saving = ref(false);
const errors = ref([]);

function newRow() {
  return {
    name: '',
    provider: 'static_content',
    enabled: true,
    cfg: { mode: 'list', contentKey: props.pageCode || '' },
    fieldsText: '',
    filtersText: '',
    sortByText: '',
    pathText: '',
    editorEnabled: false,
    editor: { type: 'json', label: '', fields: [] },
  };
}

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

async function loadSchema() {
  if (!props.pageId || !props.locale || !props.pageCode) return;
  loading.value = true;
  errors.value = [];
  try {
    const response = await requestClient.get(
      `/pages/${props.pageId}/data-schema/${props.locale}/${props.pageCode}`,
    );
    const schema = response?.schema ?? { blocks: {} };
    rows.value = schemaToRows(schema);
    jsonText.value = JSON.stringify(toSchemaPayload(schema.blocks ?? {}), null, 2);
  } catch {
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
      `/pages/${props.pageId}/data-schema/${props.locale}/${props.pageCode}`,
      { schema },
    );
    rows.value = schemaToRows(schema);
    jsonText.value = JSON.stringify(schema, null, 2);
    message.success('数据块配置已保存并立即生效');
    emit('saved', schema);
  } catch (err) {
    console.error(err);
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

function editorFieldOptions(row) {
  const allowed = EDITOR_FIELDS[row.editor?.type] ?? [];
  return allowed.map((value) => ({ label: value, value }));
}

function editorSupportsFields(row) {
  return !['images', 'json'].includes(row.editor?.type ?? 'json');
}

/** card/cards 必须声明字段（协议 §1.2A），表单里给个显式提醒。 */
function editorFieldsRequired(row) {
  return ['card', 'cards'].includes(row.editor?.type ?? '');
}

/**
 * 切换控件类型后剔除不在新类型白名单里的字段。
 * 留着会让保存被后端 422 拒绝（StaticBlockEditor 只认该类型支持的键）。
 */
function pruneEditorFields(row) {
  const allowed = EDITOR_FIELDS[row.editor?.type] ?? [];
  row.editor.fields = (row.editor?.fields ?? []).filter((item) =>
    allowed.includes(item.key),
  );
}

watch(
  () => [props.pageId, props.locale, props.pageCode],
  () => {
    loadSchema();
  },
  { immediate: true },
);
</script>

<template>
  <div class="page-schema-editor p-4">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium text-gray-700">配置模式</span>
        <Button
          size="small"
          :type="mode === 'form' ? 'primary' : 'default'"
          @click="switchMode('form')"
        >
          表单模式
        </Button>
        <Button
          size="small"
          :type="mode === 'json' ? 'primary' : 'default'"
          @click="switchMode('json')"
        >
          JSON 模式
        </Button>
        <span class="text-xs text-gray-400">
          遵循 P17 具名数据块契约 · 规范定义动态模型拉取与静态图文结构
        </span>
      </div>

      <div class="flex items-center gap-2">
        <Button v-if="mode === 'form'" size="small" @click="addRow">
          + 添加数据块
        </Button>
        <Button type="primary" size="small" :loading="saving" @click="save">
          保存配置
        </Button>
      </div>
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
      <div v-if="rows.length === 0" class="py-12">
        <Empty description="本页面尚未定义任何具名数据块">
          <Button type="primary" @click="addRow">新增第一个数据块</Button>
        </Empty>
      </div>

      <div v-else class="space-y-4">
        <Card
          v-for="(row, index) in rows"
          :key="index"
          size="small"
          class="block-card border border-gray-200"
        >
          <template #title>
            <div class="flex items-center gap-2">
              <span class="font-medium text-sm text-gray-800">
                #{{ index + 1 }}
              </span>
              <Tag color="geekblue">
                {{ (row.editorEnabled && row.editor?.label) || row.name || '(未命名块)' }}
              </Tag>
              <!-- 启用 editor 提示后以 label 为主标题，块名作为技术标识保留在旁 -->
              <span
                v-if="row.editorEnabled && row.editor?.label && row.name"
                class="text-xs text-gray-400"
              >
                {{ row.name }}
              </span>
              <Tag :color="row.provider === 'model' ? 'purple' : 'cyan'">
                {{ row.provider }}
              </Tag>
            </div>
          </template>
          <template #extra>
            <Button danger size="small" type="link" @click="removeRow(index)">
              删除块
            </Button>
          </template>

          <div class="flex flex-col gap-4">
            <!-- 基础属性行 -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-3 bg-gray-50 p-3 rounded">
              <div>
                <label class="text-xs text-gray-500 block mb-1">
                  块名称 (例如: hero_banner, latest_news)
                </label>
                <Input
                  v-model:value="row.name"
                  placeholder="英文字母/数字/下划线"
                />
              </div>
              <div>
                <label class="text-xs text-gray-500 block mb-1">数据来源 Provider</label>
                <Select
                  v-model:value="row.provider"
                  :options="PROVIDER_OPTIONS"
                  class="w-full"
                />
              </div>
              <div class="flex items-center gap-2 pt-6">
                <Switch v-model:checked="row.enabled" />
                <span class="text-xs text-gray-600">在接口中启用此块</span>
              </div>
            </div>

            <!-- Provider 为 model (动态模型) -->
            <div
              v-if="row.provider === 'model'"
              class="border border-purple-100 bg-purple-50/30 p-3 rounded space-y-3"
            >
              <div class="text-xs font-medium text-purple-800">
                📦 动态模型查询规则（从租户公共模型库拉取）
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label class="text-xs text-gray-500 block mb-1">
                    模型类型 (type，如: articles, products)
                  </label>
                  <Input v-model:value="row.cfg.type" placeholder="如 articles" />
                </div>
                <div>
                  <label class="text-xs text-gray-500 block mb-1">查询模式 (mode)</label>
                  <Select
                    v-model:value="row.cfg.mode"
                    :options="MODE_OPTIONS"
                    class="w-full"
                  />
                </div>
                <div>
                  <label class="text-xs text-gray-500 block mb-1">所属分类 (category_slug)</label>
                  <Input
                    v-model:value="row.cfg.categorySlug"
                    placeholder="可选，如 company-news"
                  />
                </div>
              </div>

              <div v-if="row.cfg.mode === 'list'" class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label class="text-xs text-gray-500 block mb-1">返回条数限制 (limit)</label>
                  <InputNumber
                    v-model:value="row.cfg.limit"
                    :min="1"
                    :max="100"
                    class="w-full"
                    placeholder="如 6"
                  />
                </div>
                <div class="flex items-center gap-2 pt-6">
                  <Switch v-model:checked="row.cfg.related" />
                  <span class="text-xs text-gray-600">按关联推荐 (related)</span>
                </div>
              </div>
            </div>

            <!-- Provider 为 static_content (静态内容) -->
            <div
              v-else-if="row.provider === 'static_content'"
              class="border border-cyan-100 bg-cyan-50/30 p-3 rounded space-y-3"
            >
              <div class="text-xs font-medium text-cyan-800">
                🎨 页面静态图文内容配置
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-gray-500 block mb-1">
                    内容分组键 content_key
                  </label>
                  <Input
                    v-model:value="row.cfg.contentKey"
                    placeholder="默认同页面编码，如 home"
                  />
                </div>
                <div>
                  <label class="text-xs text-gray-500 block mb-1">
                    数据路径 path (以逗号分隔，如: features, items)
                  </label>
                  <Input
                    v-model:value="row.pathText"
                    placeholder="例如: intro 或 carousel, items"
                  />
                </div>
              </div>

              <!-- 编辑器提示配置 -->
              <div class="pt-2 border-t border-cyan-100">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <Switch v-model:checked="row.editorEnabled" size="small" />
                    <span class="text-xs font-medium text-gray-700">
                      启用图形化编辑器提示 (Editor Schema Hint)
                    </span>
                  </div>
                </div>

                <div v-if="row.editorEnabled" class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <div>
                    <label class="text-xs text-gray-500 block mb-1">控件类型</label>
                    <Select
                      v-model:value="row.editor.type"
                      :options="EDITOR_TYPE_OPTIONS"
                      class="w-full"
                      @change="pruneEditorFields(row)"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-gray-500 block mb-1">面板标题 (Label)</label>
                    <Input
                      v-model:value="row.editor.label"
                      placeholder="例如：主页轮播横幅"
                    />
                  </div>
                </div>

                <!-- 字段展示声明：内容编辑页按这里的字段名与显示名称渲染（协议 §1.2A editor.fields） -->
                <div v-if="row.editorEnabled && editorSupportsFields(row)" class="mt-3">
                  <div class="mb-1 flex items-center justify-between">
                    <span class="text-xs font-medium text-gray-700">
                      字段展示（字段名 → 显示名称）
                    </span>
                    <Button size="small" type="link" @click="addEditorField(row)">
                      + 添加字段
                    </Button>
                  </div>
                  <p class="mb-2 text-xs text-gray-400">
                    内容编辑页只展示这里声明的字段，展示顺序与显示名称都以声明为准；
                    未声明的已有字段不会出现在表单里（数据仍原样保留）。
                  </p>

                  <div
                    v-for="(field, fieldIndex) in row.editor.fields"
                    :key="fieldIndex"
                    class="mb-2 flex items-center gap-2"
                  >
                    <Select
                      v-model:value="field.key"
                      :options="editorFieldOptions(row)"
                      placeholder="字段名"
                      class="w-40 shrink-0"
                    />
                    <Input
                      v-model:value="field.label"
                      placeholder="显示名称，如「特点标题」"
                    />
                    <Button
                      danger
                      size="small"
                      type="link"
                      @click="removeEditorField(row, fieldIndex)"
                    >
                      删除
                    </Button>
                  </div>

                  <span v-if="!row.editor?.fields?.length" class="text-xs text-gray-400">
                    未声明字段：内容编辑页将按数据形状自动推断字段与名称
                  </span>
                  <span
                    v-else-if="editorFieldsRequired(row)"
                    class="text-xs text-gray-400"
                  >
                    card / cards 类型必须声明字段，否则保存会被拒绝
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </template>

    <template v-else>
      <div class="space-y-2">
        <label class="text-xs text-gray-500">
          以 JSON 直接编辑（包含 blocks 顶层对象，保存立即按 P17 协议生效）：
        </label>
        <Input.TextArea
          v-model:value="jsonText"
          :rows="16"
          class="font-mono text-xs"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.page-schema-editor {
  background: #fff;
  border-radius: 8px;
}
.block-card {
  border-radius: 8px;
}
</style>
