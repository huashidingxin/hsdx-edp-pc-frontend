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
 * - 块声明了 `editor.fields` 时：字段集合、顺序、label **全部以声明为准**；声明未包含的
 *   已有字段不展示，但保留在草稿里、保存时原样写回（不丢数据）。
 * - image/images/richtext/video 用专用控件；其余（card/cards/json/无提示）用
 *   AutoFormValue 按**数据形状**自动生成表单，另给每块一个「高级（JSON）」开关兜底。
 * - 字段键的控件由 `pageContentAutoForm` 的键名规范统一决定（与块类型无关）：
 *   `image` / `image2` → 图片上传，`video` → 视频上传，`content` → 富文本。
 *
 * 上传（重要）：`AppUpload` 有意**不自动上传**（同 AppCrudTable / LocaleTabsEditor /
 * SubmissionEdit 的约定）—— 选中的文件先以 `{ url: 'blob:...', file: File }` 挂在草稿上。
 * 所以必须由本页在**真正保存那一刻**（saveBlock）先 flush 该块的上传控件，
 * 否则 PUT 出去的是 blob 地址而不是素材 URL。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';

import {
  Alert,
  Button,
  Collapse,
  CollapsePanel,
  Drawer,
  Empty,
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
import { editorFieldList, looksLikeJsonText } from './pageContentAutoForm';
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
  embed: { type: Boolean, default: false },
  currentLocale: { type: String, default: '' },
});

const emit = defineEmits(['update:open', 'refresh', 'switch-tab']);

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

    return (
      items.find((item) => item.locale === loc) ??
      items.find((item) => item.locale?.toLowerCase() === loc?.toLowerCase()) ??
      null
    );
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
 * 块名 → 该块下所有上传刷新目标（`Map<块名, Map<槽位, 实例>>`）。
 *
 * **一个块可能有多个上传控件**：`video` 块既有视频（`video` 键）又有封面（`image` 键），
 * 两个都是 `AppUpload`。所以按「块名 + 槽位」登记，保存时把该块全部槽位一起 flush。
 * 其余分支是 `AutoFormValue`（它把整棵子树的上传控件递归暴露成单个 `upload()`）。
 *
 * ref 回调按「块名 + 槽位」缓存复用：每次渲染换新函数会让 Vue 对旧 ref 走一次
 * set(null)、再对新 ref 走 set(el)，白抖一轮（极端情况下会把刚登记的实例删掉）。
 */
const uploadTargets = new Map();
const uploadRefCallbacks = new Map();

function blockUploadRef(blockName, slot = 'main') {
  const key = `${blockName}::${slot}`;
  if (!uploadRefCallbacks.has(key)) {
    uploadRefCallbacks.set(key, (el) => {
      let slots = uploadTargets.get(blockName);
      if (!slots) {
        slots = new Map();
        uploadTargets.set(blockName, slots);
      }
      if (el) slots.set(slot, el);
      else slots.delete(slot);
    });
  }

  return uploadRefCallbacks.get(key);
}

/** 保存前先把该块所有待上传文件传完（AppUpload 不自动上传，见文件头注释）。 */
async function flushBlockUploads(blockName) {
  const slots = uploadTargets.get(blockName);
  if (!slots) return;
  const tasks = [];
  for (const target of slots.values()) {
    if (typeof target?.upload === 'function') tasks.push(target.upload());
  }
  await Promise.all(tasks);
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
  savingBlock.value = blockName;
  try {
    // AppUpload 不自动上传：真正保存这一刻先把该块的待上传文件传完，
    // 草稿里才会是持久化 URL（上传失败会在 AppUpload 内提示并抛出，这里不继续 PUT，
    // 避免把 blob 地址写进库）。
    await flushBlockUploads(blockName);

    // 草稿必须在 flush 之后取：上传成功后 v-model 会把新 URL 回写到草稿上。
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
    // 上传失败与请求错误已分别在 AppUpload / 请求层提示
  } finally {
    savingBlock.value = '';
  }
}

/**
 * 该块 editor.fields 声明的字段（`[{key,label}]`；没有声明时为 null）。
 * 交给 AutoFormValue 后，字段集合、顺序与 label 全部以声明为准。
 */
function blockFields(block) {
  return editorFieldList(block.editor);
}

/** 取 editor.fields 里某字段的声明 label，没有声明时用兜底文案。 */
function declaredLabel(block, fieldKey, fallback) {
  const label = block.editor?.fields?.[fieldKey]?.label;

  return typeof label === 'string' && label.trim() !== '' ? label.trim() : fallback;
}

/**
 * 声明/配置与真实数据对不上时的提示文案（对得上返回空串）。
 *
 * 为什么必须有：2026-09-20 用真实库数据核过，**存量里已经存在的 editor.fields 声明与实际
 * 数据并不匹配**（廊坊 home 页：`home-stats` 声明 title/content/subtitle，数据却是 label/value；
 * `home-cta` 声明 title/target/content/subtitle，数据是 title/actions/summary）。
 * 严格按声明渲染后，这些块会变成一组空字段，用户会以为「数据丢了」。
 * 这里把情况说清楚并指路（改声明 / 切高级模式），而不是悄悄回退展示规则。
 */
function blockDataHint(block) {
  const group = groupOfBlock(block.blockName);
  if (!group?.editable) return '';
  const value = drafts.value[block.blockName];
  const raw = getAtPath(contentData.value[group.key], block.path);

  const rawHasData =
    Array.isArray(raw) && raw.length > 0
      ? true
      : raw !== null && typeof raw === 'object'
        ? Object.keys(raw).length > 0
        : false;
  const draftEmpty = Array.isArray(value)
    ? value.length === 0
    : value === null ||
      value === undefined ||
      (typeof value === 'object' && Object.keys(value).length === 0);

  // 数据不为空但表单读不出内容 → path 或 editor.type 与数据形状不符
  if (rawHasData && draftEmpty) {
    return '该块的「数据路径 / 控件类型」与现有数据结构不匹配：数据不为空，但表单读不出内容。请到「数据规则」检查 config.path 与 editor.type。';
  }

  const declared = blockFields(block);
  if (!declared) return '';
  const sample = Array.isArray(value) ? value[0] : value;
  if (sample === null || typeof sample !== 'object' || Array.isArray(sample)) return '';
  const dataKeys = Object.keys(sample);
  if (dataKeys.length === 0) return '';
  if (declared.some((field) => dataKeys.includes(field.key))) return '';

  return `该块声明的字段（${declared
    .map((field) => field.key)
    .join('、')}）与现有数据的字段（${dataKeys.join(
    '、',
  )}）没有交集，下面会是一组空字段。请到「数据规则」修正声明，或用「高级（JSON）」编辑。`;
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

  // 有 editor.fields 声明时，表单字段就是声明的那几个（顺序/名称也来自声明）
  const declared = blockFields(block);
  if (declared) return `表单 ${declared.length} 字段`;

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
  () => [props.open, props.page?.id, props.currentLocale],
  ([open, _id, curLoc]) => {
    if (open) {
      if (curLoc && typeof curLoc === 'string') {
        locale.value = curLoc;
        expectedLocale.value = curLoc;
      } else {
        locale.value = '';
      }
      load();
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (props.open && !schemaRow.value && !loading.value) {
    if (props.currentLocale && typeof props.currentLocale === 'string') {
      locale.value = props.currentLocale;
      expectedLocale.value = props.currentLocale;
    }
    load();
  }
});

watch(locale, (next, previous) => {
  if (!props.open || !next || next === previous) return;
  // load() 内部初始化语言时也会改 locale；那不是用户切换，不该再触发一次加载
  // （历史上这会并发跑两次 load，导致分组与草稿错位渲染而崩）。
  if (next === expectedLocale.value) return;
  load();
});

defineExpose({
  load,
  locale,
  localeOptions,
});
</script>

<template>
  <component
    :is="embed ? 'div' : Drawer"
    v-bind="
      embed
        ? { class: 'page-content-embedded' }
        : {
            open,
            width: 1080,
            destroyOnClose: true,
            title: '页面内容',
          }
    "
    @update:open="(v) => emit('update:open', v)"
  >
    <!-- 工具条：独立抽屉模式钉在顶部；嵌入模式提供精简状态栏 -->
    <div
      v-if="!embed"
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

    <!-- 嵌入模式工具条 -->
    <div
      v-else
      class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2 text-xs text-gray-500"
    >
      <div class="flex items-center gap-2">
        <Tag color="blue">{{ page?.code || '-' }}</Tag>
        <span v-if="editableBlockCount" class="text-gray-600">
          共 {{ editableBlockCount }} 个可编辑静态块
        </span>
        <Tag v-if="dirtyCount" color="orange">{{ dirtyCount }} 个未保存</Tag>
        <span v-if="!canWrite" class="text-gray-400">无 cms.page.write 权限，仅可查看</span>
      </div>
      <Button size="small" :loading="loading" @click="load">
        刷新内容
      </Button>
    </div>

    <Spin :spinning="loading">
      <Empty v-if="!loading && !schemaRow" description="该页面尚未配置数据来源">
        <Button
          type="primary"
          @click="
            embed
              ? emit('switch-tab', 'schema')
              : (pageId && $router.push(`/site/page-data-schema/${pageId}`))
          "
        >
          去配置数据规则
        </Button>
      </Empty>

      <Alert
        v-else-if="!loading && !hasAnyBlock"
        type="info"
        show-icon
        message="该页面未配置静态数据块"
        description="当前页面的数据来源里没有 provider=static_content 的块。若需要编辑静态图文，请先在「数据规则 (Schema)」中新增静态块并配置 editor 提示。"
      >
        <template #action v-if="embed">
          <Button size="small" type="primary" @click="emit('switch-tab', 'schema')">
            去配置静态块
          </Button>
        </template>
      </Alert>

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

            <!-- image：单图（editor.fields 声明了字段名称时一并展示） -->
            <div
              v-if="block.editor?.type === 'image'"
              class="flex flex-col gap-1"
            >
              <span
                v-if="declaredLabel(block, 'image', '')"
                class="text-xs text-gray-500"
              >
                {{ declaredLabel(block, 'image', '') }}
              </span>
              <AppUpload
                :ref="blockUploadRef(block.blockName)"
                v-model="drafts[block.blockName]"
                :disabled="!canWrite"
                file-type="image"
              />
            </div>

            <!-- images：图片集合（该类型不接受 fields 声明，整组用块 label） -->
            <AppUpload
              v-else-if="block.editor?.type === 'images'"
              :ref="blockUploadRef(block.blockName)"
              v-model="drafts[block.blockName]"
              :disabled="!canWrite"
              file-type="image"
              multiple
            />

            <!-- richtext：富文本（editor.fields 声明了字段名称时一并展示） -->
            <div
              v-else-if="block.editor?.type === 'richtext'"
              class="flex flex-col gap-1"
            >
              <span
                v-if="declaredLabel(block, 'content', '')"
                class="text-xs text-gray-500"
              >
                {{ declaredLabel(block, 'content', '') }}
              </span>
              <AppEditor
                v-model="drafts[block.blockName]"
                :disabled="!canWrite"
              />
            </div>

            <!--
              video：视频 + 封面。
              字段键规范与块类型无关（pageContentAutoForm.SCALAR_KEY_KINDS）：
              `video` 键**一律是视频上传控件**，不再退化成文本框（曾经就是这样，用户没法传视频）。
            -->
            <div
              v-else-if="
                block.editor?.type === 'video' && objectDraft(block.blockName)
              "
              class="flex flex-col gap-3"
            >
              <div class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">
                  {{ declaredLabel(block, 'video', '视频') }}
                </span>
                <AppUpload
                  :ref="blockUploadRef(block.blockName, 'video')"
                  v-model="drafts[block.blockName].video"
                  :disabled="!canWrite"
                  file-type="video"
                />
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs text-gray-500">
                  {{ declaredLabel(block, 'image', '视频封面') }}
                </span>
                <AppUpload
                  :ref="blockUploadRef(block.blockName, 'cover')"
                  v-model="drafts[block.blockName].image"
                  :disabled="!canWrite"
                  file-type="image"
                />
              </div>
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
              其余块：有 editor.fields 声明时按声明渲染字段，否则按**数据形状**自动生成表单。
              覆盖 card / cards / 显式 json / 没有 editor 提示的块 —— 真实数据里
              107 个静态块有 45 个没有提示，以前这些块只能编辑裸 JSON，非技术人员无法操作。
              该组件把整棵子树的上传控件递归暴露为 upload()，保存前由本页统一 flush。
            -->
            <div v-else class="flex flex-col gap-3">
              <!-- 声明与数据对不上时先讲清楚，否则用户会以为「数据丢了」 -->
              <Alert
                v-if="blockDataHint(block)"
                type="warning"
                show-icon
                :message="blockDataHint(block)"
              />
              <AutoFormValue
                :ref="blockUploadRef(block.blockName)"
                :parent="drafts"
                :field-key="block.blockName"
                :fields="blockFields(block)"
                :disabled="!canWrite"
              />
            </div>
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
  </component>
</template>
