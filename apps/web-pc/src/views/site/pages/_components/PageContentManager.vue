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
 *
 * 编辑控件：editor 提示是可选的，**没有提示也必须能图形化编辑**。
 * image/images/richtext/video 用专用控件；其余（card/cards/json/无提示）一律用
 * AutoFormValue 按**数据形状**自动生成表单，另给每块一个「高级（JSON）」开关兜底。
 */
import { computed, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import {
  Alert,
  Button,
  Collapse,
  CollapsePanel,
  Drawer,
  Empty,
  Input,
  Select,
  Spin,
  Tag,
  message,
} from 'antdv-next';

import { getCurrentApplicationId } from '#/api/application-context';
import { requestClient } from '#/api/request';
import AppEditor from '#/components/app-editor/index.vue';
import AppUpload from '#/components/AppUpload.vue';

import AutoFormValue from './AutoFormValue.vue';
import { looksLikeJsonText } from './pageContentAutoForm';
import {
  deepClone,
  formatJson,
  getAtPath,
  isDraftDirty,
  parseJsonText,
  rewrap,
  setAtPath,
} from './pageContentModel';
import { createContentLoader } from './pageContentLoader';

/** 有专用控件的 editor.type；其余走自动表单。 */
const DEDICATED_EDITOR_TYPES = ['image', 'images', 'richtext', 'video'];

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
/**
 * 处于「高级（JSON）」模式的块：{ [blockName]: true }。
 *
 * 默认全部走图形表单；只有用户主动切到高级模式，才把该块降级为裸 JSON 文本框。
 * 用 reactive 对象而不是 Set：模板里按块名取布尔值最直接。
 */
const jsonMode = reactive({});
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

/** 可编辑分组（有 content_key、且块属于当前页）。 */
const editableGroups = computed(() =>
  groups.value.filter((group) => group.editable),
);
/** 可编辑块总数。 */
const editableBlockCount = computed(() =>
  editableGroups.value.reduce((sum, group) => sum + group.blocks.length, 0),
);
/** 未保存的块数：工具条据此提示，避免用户以为「没改动」。 */
const dirtyCount = computed(() =>
  editableGroups.value
    .flatMap((group) => group.blocks)
    .filter((block) => isDirty(block.blockName)).length,
);
/**
 * 手风琴当前展开的块名。
 * 一个页面常有 4-8 个静态块，全部展开会变成一堵没有重点的表单墙，
 * 所以默认全部收起、一次只展开一个（accordion），把注意力收敛到正在编辑的块上。
 */
const activeBlockKey = ref('');

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

  const editorType = descriptor.editor?.type ?? 'auto';
  let value = drafts.value[blockName];

  // 只有「用户在高级模式里手写的 JSON 文本」才需要解析。
  // 不能见到字符串就 parse：像 about-*.body 这类块的数据本身就是一段 HTML 字符串，
  // 硬解析会报「JSON 格式错误」，导致该块永远保存不了。
  if (typeof value === 'string' && looksLikeJsonText(value)) {
    if (jsonMode[blockName] || editorType === 'json') {
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
    // 保存后基线里存的就是刚才那份草稿对象（setAtPath 把 value 按引用挂上去）。
    // 必须让草稿与基线重新脱钩，否则「改草稿 = 改基线」的别名问题会在第一次保存后复发：
    // isDirty 再次恒为 false，第二次编辑保存按钮又点不动了。
    drafts.value[blockName] =
      jsonMode[blockName] && typeof value === 'object'
        ? JSON.stringify(value, null, 2)
        : deepClone(value);
    message.success(`「${descriptor.label}」已保存并生效`);
    emit('refresh');
  } catch {
    // 请求层已提示后端错误
  } finally {
    savingBlock.value = '';
  }
}

/** 该块是否用专用控件（image/images/richtext/video）；其余走自动表单。 */
function hasDedicatedEditor(block) {
  return DEDICATED_EDITOR_TYPES.includes(block.editor?.type);
}

/** 该块当前是否处于高级（JSON）模式。 */
function isJsonMode(blockName) {
  return jsonMode[blockName] === true;
}

/**
 * 切换高级（JSON）模式。
 * - 开启：把草稿序列化成文本，供 textarea 直接编辑。
 * - 关闭：文本确实是 JSON 就解析回对象（解析失败则拒绝关闭并提示），
 *   否则（例如正文 HTML）保持字符串原样 —— 那种块的「数据」本来就是一段文本。
 */
function toggleJsonMode(blockName) {
  if (jsonMode[blockName]) {
    const text = drafts.value[blockName];
    if (typeof text === 'string' && looksLikeJsonText(text)) {
      const parsed = parseJsonText(text);
      if (!parsed.ok) {
        message.error(`JSON 格式错误，无法切回图形编辑：${parsed.error}`);
        return;
      }
      drafts.value[blockName] = parsed.value;
    }
    jsonMode[blockName] = false;
    return;
  }

  if (typeof drafts.value[blockName] !== 'string') {
    drafts.value[blockName] = formatJson(drafts.value[blockName]);
  }
  jsonMode[blockName] = true;
}

/** 块头展示的编辑方式标签（让用户一眼看出这块是表单还是 JSON）。 */
function blockModeLabel(block) {
  const type = block.editor?.type;
  if (type === 'image') return '单图';
  if (type === 'images') return '图片集';
  if (type === 'richtext') return '富文本';
  if (type === 'video') return '视频';
  if (isJsonMode(block.blockName)) return 'JSON（高级）';

  const value = drafts.value[block.blockName];
  if (Array.isArray(value)) return `列表 ${value.length} 项`;
  if (value !== null && typeof value === 'object') {
    return `对象 ${Object.keys(value).length} 字段`;
  }
  return '文本';
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
 * 该块是否已被修改（决定「保存」是否可点）。
 *
 * 比较逻辑放在 `pageContentModel.isDraftDirty` 里：它是纯函数、可单测，
 * 而这里曾经因为「两侧用不同规则规范化」出过 bug（保存后仍显示未保存）。
 */
function isDirty(blockName) {
  const descriptor = blockMeta.value[blockName];
  if (!descriptor) return false;
  const group = groupOfBlock(blockName);
  if (!group?.editable) return false;
  // 兜底必须与 pageContentLoader / saveBlock 一致（都是 'auto'）：
  // 没有 editor 提示的块草稿是**对象**，若这里按 'json' 格式化，
  // 会与基线用不同规则序列化，比较结果不可信。
  const editorType = descriptor.editor?.type ?? 'auto';
  const original = getAtPath(contentData.value[group.key], descriptor.path);
  return isDraftDirty(editorType, original, drafts.value[blockName]);
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
    <!-- 工具条：钉在顶部。长页面滚动时语言切换 / 重新加载 / 未保存计数始终可见 -->
    <div
      class="sticky top-0 z-10 -mx-6 -mt-6 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 bg-white px-6 py-3"
    >
      <Tag color="blue">{{ page?.code || '-' }}</Tag>
      <span class="text-xs text-gray-400">语言</span>
      <Select
        v-model:value="locale"
        :options="localeOptions.map((item) => ({ label: item, value: item }))"
        size="small"
        style="width: 130px"
      />
      <Button size="small" :loading="loading" @click="load">重新加载</Button>

      <span class="ml-auto flex items-center gap-2 text-xs text-gray-500">
        <span v-if="editableBlockCount">共 {{ editableBlockCount }} 个可编辑块</span>
        <Tag v-if="dirtyCount" color="orange">{{ dirtyCount }} 个未保存</Tag>
        <span v-if="!canWrite" class="text-gray-400">无 cms.page.write 权限，仅可查看</span>
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
        <section
          v-for="group in editableGroups"
          :key="group.key"
          class="mb-6 last:mb-0"
        >
          <header class="mb-2 flex items-center gap-2">
            <span class="text-sm font-medium text-gray-700">内容键</span>
            <Tag color="geekblue">{{ group.contentKey }}</Tag>
            <span class="text-xs text-gray-400">
              {{ group.blocks.length }} 个块 · 本页 · {{ locale }}
            </span>
          </header>

          <Collapse v-model:activeKey="activeBlockKey" accordion>
            <CollapsePanel
              v-for="block in group.blocks"
              :key="block.blockName"
            >
              <template #header>
                <span class="flex flex-wrap items-center gap-2">
                  <span class="font-medium text-gray-800">{{ block.label }}</span>
                  <Tag>{{ blockModeLabel(block) }}</Tag>
                  <Tag v-if="isDirty(block.blockName)" color="orange">未保存</Tag>
                </span>
              </template>
              <template #extra>
                <span class="flex items-center gap-2">
                  <!-- 高级模式开关：默认图形表单，需要时降级为裸 JSON -->
                  <Button
                    v-if="!hasDedicatedEditor(block)"
                    type="link"
                    size="small"
                    @click.stop="toggleJsonMode(block.blockName)"
                  >
                    {{ isJsonMode(block.blockName) ? '返回表单' : '高级（JSON）' }}
                  </Button>
                  <Button
                    v-if="canWrite"
                    type="primary"
                    size="small"
                    :disabled="!isDirty(block.blockName)"
                    :loading="savingBlock === block.blockName"
                    @click.stop="saveBlock(block.blockName)"
                  >
                    保存
                  </Button>
                </span>
              </template>

              <p class="mb-3 text-xs text-gray-400">
                {{ block.blockName }} · path: {{ block.path.length ? block.path.join('.') : '(整份)' }}
              </p>

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

            <!-- 高级（JSON）：仅在用户主动降级该块时出现 -->
            <textarea
              v-else-if="isJsonMode(block.blockName)"
              :value="jsonText(block.blockName)"
              spellcheck="false"
              :disabled="!canWrite"
              class="h-64 w-full resize-y rounded border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-5"
              @input="(e) => (drafts[block.blockName] = e.target.value)"
            ></textarea>

            <!--
              其余块：按**数据形状**自动生成图形表单。
              覆盖 card / cards / 显式 json / 没有 editor 提示的块 —— 真实数据里
              107 个静态块有 45 个没有提示，以前这些块只能编辑裸 JSON，非技术人员无法操作。
            -->
            <AutoFormValue
              v-else
              :parent="drafts"
              :field-key="block.blockName"
              :disabled="!canWrite"
            />
            </CollapsePanel>
          </Collapse>
        </section>

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
