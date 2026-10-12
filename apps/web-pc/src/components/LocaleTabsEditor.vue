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
import { computed, inject, nextTick, onMounted, reactive, ref, watch } from 'vue';

import { Button, Empty, Input, message, Modal, Select, Spin, Tabs } from 'antdv-next';

import { requestClient } from '#/api/request';
import AppUpload from '#/components/AppUpload.vue';
import { DETAIL_SYNC_KEY } from '#/components/app-crud-table/composables/useCrudTableDetail.js';

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

/**
 * 每个语种「最近一次回填后的表单指纹」+ 最近一次上抛的 payload 指纹。
 *
 * 脏标记不能按「子组件触发过 update:modelValue」来记：AppEditor 这类受控子组件
 * 收到新的 modelValue 后会把同一个值原样回传（回声），于是刚打开详情就被标成
 * 「未保存」，之后所有远端更新都会被脏保护挡掉。这里改成取值比较：
 * 只有表单真的偏离「回填结果」才算用户改动。
 */
const appliedForms = reactive({});
let lastEmittedPayload = null;

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
    // 远端没给这个字段时保留表单现值。
    // 一律按「缺席即空」回填会把已有内容抹掉：列表行快照与详情接口形状相同，
    // 但快照仍可能残缺（或只有概览字段），用它覆盖等于把正文/参数清空。
    if (v === undefined) {
      next[f.field] = form[f.field];
      continue;
    }
    if (f.type === 'json') {
      next[f.field] = v ? JSON.stringify(v, null, 2) : '{}';
    } else if (f.type === 'pairs') {
      // 保留空行（用户可能正编辑中），仅归一每行的键
      next[f.field] = Array.isArray(v)
        ? v.map((row) => ({ label: row?.label ?? '', value: row?.value ?? '' }))
        : [];
    } else {
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
    markApplied(locale);
  }
  return forms[locale];
}

/**
 * 字段值的可比较形式（判断「表单是否偏离最近一次回填结果」用）。
 *
 * json 存的是格式化字符串、pairs 是行数组、上传字段是 { url, file } 数组，
 * 都归一到稳定字符串再比；否则刚打开详情就会被判成「改过」。
 */
function canonicalFieldValue(f, value) {
  if (f.type === 'pairs') {
    return JSON.stringify(normalizePairRows(value));
  }
  if (f.type === 'json') {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      value === '{}'
    ) {
      return '{}';
    }
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value));
      } catch {
        return value;
      }
    }
    return JSON.stringify(value);
  }
  if (isUploadField(f)) {
    // 含 File/blob 对象，只能按可序列化部分比较（blob URL 每个文件唯一）
    return JSON.stringify(value ?? null);
  }
  return value === undefined || value === null ? '' : String(value);
}

/** 表单指纹；null 表示该语种还没有表单 */
function formFingerprint(code) {
  const form = forms[code];
  if (!form) return null;
  return JSON.stringify(
    props.fields.map((f) => canonicalFieldValue(f, form[f.field])),
  );
}

/** 记录「这次回填后的表单指纹」并把该语种标回干净 */
function markApplied(code) {
  const fingerprint = formFingerprint(code);
  if (fingerprint === null) delete appliedForms[code];
  else appliedForms[code] = fingerprint;
  dirty[code] = false;
}

/** 表单是否偏离最近一次回填结果（= 用户真的改过） */
function isFormDirty(code) {
  if (!forms[code] || appliedForms[code] === undefined) return false;
  return formFingerprint(code) !== appliedForms[code];
}

/**
 * 合并远端 locales。
 *
 * 旧策略是「只补空字段」（新数据必须能填上表单里的空位才接受），本意是防止
 * 列表行快照挡住详情数据。但列表接口与详情接口共用同一个 transform()，形状完全
 * 一致（都含 body / custom_fields / seo_*），快照里已非空的字段永远不再被接受 ——
 * 别的终端改了内容、重新打开详情也刷不进来，只有刷新浏览器才恢复。
 * 现在改为「用户没改过的语种一律接受服务端最新值」，只保护真正有本地改动的语种。
 */
function mergeLocales(list) {
  const refreshed = new Set();
  for (const l of list || []) {
    const code = l?.locale || l?.code;
    if (!code) continue;
    const canOverwrite = contentMap[code] === undefined || !dirty[code];
    if (!canOverwrite) continue;
    contentMap[code] = { ...l };
    if (forms[code]) refreshed.add(code);
  }
  return refreshed;
}

/** 上一次合并时的行 ID：检测行切换（与 props.rowId 的 watcher 无关，顺序无关） */
let lastRowId = null;

/** 清空全部内部状态（行切换与强制重载共用） */
function resetAllState() {
  for (const key of Object.keys(contentMap)) delete contentMap[key];
  for (const key of Object.keys(forms)) delete forms[key];
  for (const key of Object.keys(dirty)) delete dirty[key];
  for (const key of Object.keys(uploadRefs)) delete uploadRefs[key];
  for (const key of Object.keys(appliedForms)) delete appliedForms[key];
  lastEmittedPayload = null;
  activeCode.value = defaultLocale.value;
}

/**
 * 把 contentMap 的最新远端内容回填到表单（并刷新脏基线）。
 * refreshed 里的语种说明 contentMap 刚被覆盖，需要整份重刷；其余只需补齐表单。
 */
function applyMergedLocales(refreshed) {
  for (const code of existingCodes.value) {
    if (refreshed.has(code)) {
      fillForm(forms[code], contentMap[code] || {});
      markApplied(code);
    } else {
      ensureForm(code);
    }
  }
}

/**
 * 强合并远端 locales（绕过 dirty 保护，用于用户明确点的重载）。
 * 调用前请自行确认脏数据（requestReload 已处理）。
 */
function applyRemoteLocales(list) {
  resetAllState();
  ensureForm(defaultLocale.value);
  applyMergedLocales(mergeLocales(list));
  syncEmittedBaseline();
}

defineExpose({ applyRemoteLocales });

/** 详情同步通道（AppCrudTable 提供，无则隐藏重载按钮） */
const detailSync = inject(DETAIL_SYNC_KEY, null);
const reloading = ref(false);

function requestReload() {
  if (!detailSync) return;
  if (dirtyCount.value > 0) {
    Modal.confirm({
      title: '重新加载会丢弃未保存的修改',
      content: `当前有 ${dirtyCount.value} 个语种未保存，继续吗？`,
      okText: '重新加载',
      cancelText: '取消',
      onOk: () => doReload(),
    });
    return;
  }
  doReload();
}

async function doReload() {
  if (!detailSync) return;
  reloading.value = true;
  try {
    const ok = await detailSync.reload();
    if (!ok) return;
    await nextTick();
    applyRemoteLocales(props.locales);
    message.success('已更新到最新内容');
  } finally {
    reloading.value = false;
  }
}

watch(
  () => props.locales,
  (list) => {
    // 行切换必须先于合并处理。打开详情时 rowId 与 locales 同一 tick 变化，
    // 但两个 watcher 的触发顺序不保证（实测 locales 先于 rowId 触发），
    // 所以不能把重置逻辑放在独立的 rowId watch 里。
    if (props.rowId !== lastRowId) {
      lastRowId = props.rowId;
      resetAllState();
      ensureForm(defaultLocale.value);
    }
    applyMergedLocales(mergeLocales(list));
    syncEmittedBaseline();
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

/** 回填后同步「已上抛内容」指纹：子组件随即把同一个值回传，不该再上抛一轮 */
function syncEmittedBaseline() {
  lastEmittedPayload = JSON.stringify(buildLocalesPayload());
}

async function handleFieldChange(locale) {
  await flushPendingUploads(locale);
  const payload = buildLocalesPayload();
  const fingerprint = JSON.stringify(payload);
  // 子组件把回填值原样回传（回声）：内容没变，既不上抛也不标脏。
  // 少了这一步，刚打开详情就会被标成「未保存」，之后所有远端更新都会被挡掉。
  if (fingerprint === lastEmittedPayload) return;
  lastEmittedPayload = fingerprint;
  dirty[locale] = isFormDirty(locale);
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
      <Button
        v-if="detailSync"
        size="small"
        :loading="reloading"
        title="从服务端重新加载当前记录（覆盖本地未保存的修改前会确认）"
        @click="requestReload"
      >
        重新加载
      </Button>
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
              :auto-transfer-on-paste="Boolean(f.attrs?.autoTransferOnPaste)"
              v-bind="f.attrs || {}"
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
