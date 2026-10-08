<script setup>
/**
 * 多语言 Tabs 编辑器（通用）
 *
 * 按字段配置在语种 Tabs 间切换编辑，一次只渲染当前语种的表单 —— 语种再多，表单区高度恒定。
 *
 * 数据形状：locales 为 [{ locale, ...字段 }] 数组（与 articles/categories 详情返回一致）。
 * 父级通过 v-model:locales 双向绑定，各语种汇总后随父表单一次保存（summary 模式）。
 *
 * 语种来源：tenant/locale-config 的 enabled_locales（主语种 default_locale 置顶），
 * 不再混入 catalog 里全部几十个语种 —— 与应用实际启用的语言对齐。
 *
 * 标签名精简：仅显示 native_label（如「中文」「English」），hover/aria 显示 code。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';

import { Button, Empty, Input, Select, Spin, Tabs } from 'antdv-next';

import { requestClient } from '#/api/request';
import AppUpload from '#/components/AppUpload.vue';

import AppEditor from './app-editor/index.vue';

const props = defineProps({
  fields: { type: Array, default: () => [] },
  locales: { type: Array, default: () => [] },
  localesPool: { type: Array, default: () => [] },
  /** 显式保存模式预留（每语种独立保存）；当前仅 summary */
  mode: { type: String, default: 'summary' },
  /** 当前编辑行 ID：变化时重置内部状态，避免上一行记录的内容/脏标记残留到下一行 */
  rowId: { type: [Number, String], default: null },
});

const emit = defineEmits(['update:locales', 'changed']);

const systemLocales = ref(['zh-CN', 'en-US']);
const defaultLocale = ref('zh-CN');
const activeCode = ref('zh-CN');

const contentMap = reactive({});
const forms = reactive({});
const dirty = reactive({});
const uploadRefs = reactive({});

const uploadTypes = ['file', 'image', 'video', 'audio'];
function isUploadField(f) {
  return uploadTypes.includes(f.type);
}
function uploadFileType(f) {
  return f.type === 'file'
    ? f.attrs?.type || f.attrs?.fileType || 'file'
    : f.type;
}

function nativeLabel(code) {
  const meta = (props.localesPool || []).find((l) => (l.code || l) === code);
  return meta?.native_label || meta?.label || code;
}

const existingCodes = computed(() =>
  Object.keys(contentMap).filter((k) => contentMap[k] !== undefined),
);

/** 只展示租户已启用语种：系统启用语种 ∪ 已有内容语种（避免丢失历史数据） */
const otherCodes = computed(() => {
  const sys = systemLocales.value;
  const others = sys.filter((l) => l !== defaultLocale.value);
  const extra = existingCodes.value.filter((l) => !sys.includes(l));
  return [...new Set([...others, ...extra])];
});

const orderedCodes = computed(() => [defaultLocale.value, ...otherCodes.value]);

const activeStatus = computed(() => contentMap[activeCode.value]?.status);
const filledCount = computed(
  () => orderedCodes.value.filter((code) => hasAnyContent(code)).length,
);
const dirtyCount = computed(
  () => orderedCodes.value.filter((code) => dirty[code]).length,
);
const codeOptions = computed(() =>
  orderedCodes.value.map((code) => ({
    label: `${nativeLabel(code)}${hasAnyContent(code) ? '' : '（空）'}`,
    value: code,
  })),
);

function hasAnyContent(code) {
  const form = forms[code];
  if (!form) return false;
  return props.fields.some((f) => {
    const v = form[f.field];
    if (f.type === 'pairs') {
      // 参数对：过滤全空行后还有剩余才算有内容
      return normalizePairRows(v).length > 0;
    }
    return v !== undefined && v !== '' && v !== null && v !== '{}';
  });
}

/** 标签名精简：仅 native_label（主语种也只显示语种名，不再加「基本信息 ·」前缀） */
function tabLabel(code) {
  return nativeLabel(code);
}

function dotClass(code) {
  return hasAnyContent(code) ? 'bg-green-500' : 'bg-gray-300';
}

function blankForm() {
  const out = {};
  for (const f of props.fields) {
    out[f.field] = f.type === 'json' ? '{}' : f.type === 'pairs' ? [] : '';
  }
  return out;
}

/** 参数对行归一：保证每行都有 label/value 键（历史数据可能缺键或非数组） */
function normalizePairRows(v) {
  return (Array.isArray(v) ? v : [])
    .map((row) => ({ label: row?.label ?? '', value: row?.value ?? '' }))
    .filter(
      (row) =>
        String(row.label).trim() !== '' || String(row.value).trim() !== '',
    );
}

function fillForm(form, data) {
  const next = { ...data };
  for (const f of props.fields) {
    const v = data?.[f.field];
    if (f.type === 'json') {
      next[f.field] = v ? JSON.stringify(v, null, 2) : '{}';
    } else if (f.type === 'pairs') {
      // 保留空行（用户可能正编辑中），仅归一每行的键
      next[f.field] = Array.isArray(v)
        ? v.map((row) => ({ label: row?.label ?? '', value: row?.value ?? '' }))
        : [];
    } else if (v !== undefined) {
      next[f.field] = v;
    }
  }
  for (const f of props.fields) {
    if (next[f.field] === undefined) {
      next[f.field] =
        f.type === 'json' ? '{}' : f.type === 'pairs' ? [] : '';
    }
  }
  Object.keys(form).forEach((k) => delete form[k]);
  Object.assign(form, next);
}

function ensureForm(locale) {
  if (!forms[locale]) {
    const form = blankForm();
    fillForm(form, contentMap[locale] || {});
    forms[locale] = form;
  }
  return forms[locale];
}

function isEmptyValue(v) {
  if (Array.isArray(v)) return v.length === 0;
  return v === undefined || v === null || v === '';
}

/**
 * 新数据是否带来了当前表单还没有的字段值。
 *
 * 背景：AppCrudTable 打开详情时会先用列表行数据立即填表单，而列表接口的
 * locales 只有 title/slug 等概览字段（index 有意不序列化沉重的 body），
 * 详情接口随后才返回完整字段。若一律「只登记一次」，详情数据会被残缺的
 * 列表快照挡在门外，表现为除标题/Slug 外全部字段不回显。
 * 只有能补上表单空缺的新数据才值得覆盖；用户改动过的表单（dirty）绝不覆盖。
 */
function isRicherThanForm(data, form) {
  if (!form) return false;
  return props.fields.some(
    (f) => !isEmptyValue(data?.[f.field]) && isEmptyValue(form[f.field]),
  );
}

function mergeLocales(list) {
  const refreshed = new Set();
  for (const l of list || []) {
    const code = l?.locale || l?.code;
    if (!code) continue;
    const canOverwrite =
      contentMap[code] === undefined ||
      (!dirty[code] && isRicherThanForm(l, forms[code]));
    if (!canOverwrite) continue;
    contentMap[code] = { ...l };
    if (forms[code]) refreshed.add(code);
  }
  return refreshed;
}

/** 上一次合并时的行 ID：检测行切换（与 props.rowId 的 watcher 无关，顺序无关） */
let lastRowId = null;

watch(
  () => props.locales,
  (list) => {
    // 行切换必须先于合并处理。打开详情时 rowId 与 locales 同一 tick 变化，
    // 但两个 watcher 的触发顺序不保证（实测 locales 先于 rowId 触发），
    // 所以不能把重置逻辑放在独立的 rowId watch 里。
    if (props.rowId !== lastRowId) {
      lastRowId = props.rowId;
      for (const key of Object.keys(contentMap)) delete contentMap[key];
      for (const key of Object.keys(forms)) delete forms[key];
      for (const key of Object.keys(dirty)) delete dirty[key];
      for (const key of Object.keys(uploadRefs)) delete uploadRefs[key];
      activeCode.value = defaultLocale.value;
      ensureForm(defaultLocale.value);
    }
    const refreshed = mergeLocales(list);
    for (const code of existingCodes.value) {
      if (refreshed.has(code)) {
        // contentMap 被更完整的数据覆盖过：重刷已存在的表单让详情字段回显
        fillForm(forms[code], contentMap[code] || {});
      } else {
        ensureForm(code);
      }
    }
  },
  { immediate: true, deep: true },
);

watch(
  () => props.fields,
  () => {
    for (const code of orderedCodes.value) ensureForm(code);
  },
  { deep: true },
);

watch(defaultLocale, (code) => {
  ensureForm(code);
  activeCode.value = code;
});
watch(systemLocales, (list) => {
  for (const code of list) ensureForm(code);
});

function setUploadRef(locale, field, el) {
  if (!uploadRefs[locale]) uploadRefs[locale] = {};
  uploadRefs[locale][field] = el;
}

async function flushPendingUploads(locale) {
  const refs = uploadRefs[locale] || {};
  for (const f of props.fields) {
    if (isUploadField(f) && refs[f.field]?.upload) {
      try {
        await refs[f.field].upload();
      } catch {
        // 上传失败已在 AppUpload 内提示，保留 blob 供用户重试
      }
    }
  }
}

function buildLocalesPayload() {
  const out = [];
  for (const code of orderedCodes.value) {
    const form = forms[code];
    if (!form) continue;
    const values = {};
    let hasContent = false;
    let jsonError = false;
    for (const f of props.fields) {
      const v = form[f.field];
      if (isUploadField(f) && v && typeof v === 'object' && !Array.isArray(v)) {
        continue;
      }
      if (f.type === 'json') {
        try {
          values[f.field] = JSON.parse(v || '{}');
        } catch {
          jsonError = true;
          break;
        }
      } else if (f.type === 'pairs') {
        // 提交前过滤全空行，避免把没有输入的空参数行写进数据
        values[f.field] = normalizePairRows(v);
      } else {
        values[f.field] = v ?? '';
      }
      const filled = Array.isArray(values[f.field])
        ? values[f.field].length > 0
        : v !== undefined && v !== '' && v !== null && v !== '{}';
      if (filled) {
        hasContent = true;
      }
    }
    if (jsonError) continue;
    if (contentMap[code] !== undefined || hasContent || dirty[code]) {
      out.push({ locale: code, ...values });
    }
  }
  return out;
}

async function handleFieldChange(locale) {
  dirty[locale] = true;
  await flushPendingUploads(locale);
  const payload = buildLocalesPayload();
  emit('update:locales', payload);
  emit('changed', payload);
}

/** 参数对（label/value）编辑：追加一行空参数 */
function addPair(locale, field) {
  const form = forms[locale];
  if (!form) return;
  if (!Array.isArray(form[field])) form[field] = [];
  form[field].push({ label: '', value: '' });
  handleFieldChange(locale);
}

/** 参数对编辑：删除一行（handleFieldChange 由行内输入的响应式更新触发） */
function removePair(locale, field, index) {
  const form = forms[locale];
  if (!form || !Array.isArray(form[field])) return;
  form[field].splice(index, 1);
  handleFieldChange(locale);
}

async function copyFromMain() {
  const code = activeCode.value;
  if (code === defaultLocale.value) return;
  ensureForm(code);
  fillForm(forms[code], forms[defaultLocale.value] || {});
  await handleFieldChange(code);
}

async function switchLocale(code) {
  if (code === activeCode.value) return;
  await flushPendingUploads(activeCode.value);
  activeCode.value = code;
  ensureForm(code);
}

/** Tabs items：仅 key + label（表单体在 Tabs 外单独渲染，避免切换时挂载/卸载字段组件） */
const tabItems = computed(() =>
  orderedCodes.value.map((code) => ({
    key: code,
    label: tabLabel(code),
  })),
);

onMounted(async () => {
  activeCode.value = defaultLocale.value;
  ensureForm(defaultLocale.value);
  try {
    const data = await requestClient.get('tenant/locale-config');
    if (data?.default_locale) defaultLocale.value = data.default_locale;
    if (Array.isArray(data?.enabled_locales) && data.enabled_locales.length > 0) {
      systemLocales.value = data.enabled_locales;
    }
  } catch {
    systemLocales.value = [...existingCodes.value, 'zh-CN', 'en-US'];
  }
  for (const code of orderedCodes.value) ensureForm(code);
});
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
    <!-- 头部：进度统计 + 快速跳转 -->
    <div
      class="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/60"
    >
      <span class="text-sm font-medium text-gray-800 dark:text-gray-100">
        多语言内容
      </span>
      <span class="text-xs text-gray-500 dark:text-gray-400">
        已填写 {{ filledCount }}/{{ orderedCodes.length }}
      </span>
      <span
        v-if="dirtyCount"
        class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      >
        {{ dirtyCount }} 个语种未保存
      </span>
      <span class="ml-auto text-xs text-gray-400">
        全部语种随页面底部「保存」一次性提交
      </span>
    </div>

    <Tabs
      :active-key="activeCode"
      type="line"
      size="small"
      :items="tabItems"
      class="locale-tabs"
      @change="switchLocale"
    >
      <template #labelRender="{ item }">
        <span
          class="flex items-center gap-1.5"
          :title="item.key"
        >
          <span
            class="inline-block h-1.5 w-1.5 rounded-full"
            :class="dotClass(item.key)"
          />
          <span>{{ item.label }}</span>
          <span v-if="dirty[item.key]" class="text-amber-500">●</span>
          <span
            v-if="item.key === defaultLocale && activeStatus !== undefined"
            class="text-xs text-gray-400"
          >
            {{ contentMap[activeCode]?.status_label || '' }}
          </span>
        </span>
      </template>
    </Tabs>

    <!-- 当前语种表单（Tabs 体外，避免每次切换都挂载/卸载全部字段组件） -->
    <div class="p-3">
      <div
        v-if="otherCodes.length === 0"
        class="mb-2 text-xs text-gray-400"
      >
        当前仅启用一个语种。可在应用设置中启用更多语言后填写翻译内容。
      </div>
      <Spin :spinning="!forms[activeCode]">
        <div
          v-if="forms[activeCode]"
          class="grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          <div
            v-for="f in fields"
            :key="f.field"
            :class="
              f.type === 'textarea' || f.type === 'json' || f.type === 'editor' || isUploadField(f) || f.type === 'pairs'
                ? 'md:col-span-2'
                : ''
            "
          >
            <label
              class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300"
            >
              {{ f.label }}
            </label>
            <!-- 参数对（label/value）：动态行编辑，提交前过滤全空行。
                 宽度由外层普通 div 控制（tailwind 类直接挂 antd Input 会被其
                 内置 width:100% 覆盖，导致 value 框被压成窄缝无法输入），
                 Input 用内联 width:100% 填满格子（内联优先级最高，最稳）。 -->
            <template v-if="f.type === 'pairs'">
              <div class="flex flex-col gap-2">
                <div
                  v-for="(row, index) in forms[activeCode][f.field]"
                  :key="index"
                  class="flex items-center gap-2"
                >
                  <div class="w-1/3 shrink-0">
                    <Input
                      v-model:value="row.label"
                      :placeholder="f.attrs?.labelPlaceholder || '名称'"
                      style="width: 100%"
                      @input="handleFieldChange(activeCode)"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <Input
                      v-model:value="row.value"
                      :placeholder="f.attrs?.valuePlaceholder || '内容'"
                      style="width: 100%"
                      @input="handleFieldChange(activeCode)"
                    />
                  </div>
                  <Button danger size="small" type="text" @click="removePair(activeCode, f.field, index)">
                    删除
                  </Button>
                </div>
                <div>
                  <Button size="small" type="dashed" @click="addPair(activeCode, f.field)">
                    + 添加
                  </Button>
                </div>
              </div>
            </template>
            <AppEditor
              v-else-if="f.type === 'editor'"
              v-model="forms[activeCode][f.field]"
              :placeholder="f.placeholder || ''"
              :min-height="f.attrs?.minHeight || 240"
              @update:model-value="handleFieldChange(activeCode)"
            />
            <Input.TextArea
              v-else-if="f.type === 'textarea' || f.type === 'json'"
              v-model:value="forms[activeCode][f.field]"
              :rows="f.type === 'json' ? 8 : 3"
              :placeholder="f.placeholder || ''"
              @input="handleFieldChange(activeCode)"
            />
            <AppUpload
              v-else-if="isUploadField(f)"
              v-model="forms[activeCode][f.field]"
              :ref="(el) => setUploadRef(activeCode, f.field, el)"
              :file-type="uploadFileType(f)"
              :multiple="Boolean(f.attrs?.multiple)"
              :scene="f.attrs?.scene || ''"
              :item-width="f.attrs?.itemWidth || '150px'"
              :aspect-ratio="f.attrs?.aspectRatio || 1"
              @update:model-value="handleFieldChange(activeCode)"
            />
            <Input
              v-else
              v-model:value="forms[activeCode][f.field]"
              :placeholder="f.placeholder || ''"
              @input="handleFieldChange(activeCode)"
            />
          </div>
        </div>
      </Spin>

      <div
        v-if="activeCode !== defaultLocale && forms[activeCode]"
        class="mt-3 flex flex-wrap items-center gap-2"
      >
        <Button
          size="small"
          :disabled="!hasAnyContent(defaultLocale)"
          @click="copyFromMain"
        >
          从主语种复制
        </Button>
        <span v-if="!hasAnyContent(activeCode)" class="text-xs text-gray-400">
          该语种暂无内容，可留空；填写后点底部「保存」即创建该语种版本。
        </span>
        <span v-else class="text-xs text-gray-400">
          已有内容，修改后随表单一起保存。
        </span>
      </div>
      <div v-if="otherCodes.length === 0" class="mt-2">
        <Empty
          v-if="!hasAnyContent(defaultLocale)"
          description="暂无内容"
          :image="null"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.locale-tabs :deep(.ant-tabs-nav) {
  margin: 0;
  padding: 0 8px;
}
</style>
