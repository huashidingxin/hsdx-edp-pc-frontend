<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';

import { Empty, Input, Spin } from 'antdv-next';

import { requestClient } from '#/api/request';
import AppUpload from '#/components/AppUpload.vue';

/**
 * 多语言内容管理器（单一保存模式）
 *
 * 布局：
 *  - 上半部分「基本信息」= 主语种（default_locale）内容，常驻顶部；
 *  - 下半部分 = 系统设置的其他语种，逐个可折叠卡片纵向平铺（语种多时可收起），
 *    已存在内容但不在系统配置里的语言自动补成卡片，避免内容被隐藏。
 *
 * 保存：不设分区保存按钮 —— 所有语种内容与基本信息一起由页面底部「保存」一次性提交。
 * 本组件把各语种表单数据汇总成 locales 数组通过 update:locales 交回父级
 * （父级写入 formValue.locales，随详情表单一起 PATCH/POST）。
 */
const props = defineProps({
  resource: { type: String, required: true },
  rowId: { type: [Number, String], default: null },
  locales: { type: Array, default: () => [] },
  fields: { type: Array, default: () => [] },
  localesPool: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:locales', 'changed']);

const systemLocales = ref(['zh-CN', 'en-US']);
const defaultLocale = ref('zh-CN');

/**
 * 详情接口一次性返回全部语种内容（locales 字段），这里只依赖这一份数据。
 */
const contentMap = reactive({});
/** 各语种的可编辑表单（切换语言不丢失未保存的编辑） */
const forms = reactive({});
/** 各语种是否有未保存的修改 */
const dirty = reactive({});
/** 各语种卡片展开状态（key: '__main__' 表示主语种基本信息） */
const expanded = reactive({ __main__: true });
/** 各文件字段的 AppUpload 实例（按语种隔离，避免主/语种同名字段互相覆盖） */
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

/** 原生语言名（用于卡片标题），取不到时回退语言码 */
function nativeLabel(code) {
  const meta = (props.localesPool || []).find((l) => (l.code || l) === code);
  return meta?.native_label || meta?.label || code;
}

/** 已存在内容的语种集合（详情 payload + 本组件内新保存的） */
const existingCodes = computed(() =>
  Object.keys(contentMap).filter((k) => contentMap[k] !== undefined),
);

/** 主语种之外的语种：系统配置语言 + 已有内容但不在配置里的语言 */
const otherCodes = computed(() => {
  const sys = systemLocales.value;
  const others = sys.filter((l) => l !== defaultLocale.value);
  const extra = existingCodes.value.filter((l) => !sys.includes(l));
  return [...new Set([...others, ...extra])];
});

/** 卡片按此顺序平铺：主语种（基本信息）→ 系统其他语言 → 额外语言 */
const orderedCodes = computed(() => [
  defaultLocale.value,
  ...otherCodes.value,
]);

const mainStatus = computed(() => contentMap[defaultLocale.value]?.status);
const statusMap = { 0: '草稿', 1: '已发布', 2: '已归档' };

function hasAnyContent(code) {
  const form = forms[code];
  if (!form) return false;
  return props.fields.some((f) => {
    const v = form[f.field];
    return v !== undefined && v !== '' && v !== null && v !== '{}';
  });
}

function blankForm() {
  const out = {};
  for (const f of props.fields) {
    out[f.field] = f.type === 'json' ? '{}' : '';
  }
  return out;
}

function fillForm(form, data) {
  const next = { ...(data || {}) };
  for (const f of props.fields) {
    const v = data?.[f.field];
    if (f.type === 'json') {
      next[f.field] = v ? JSON.stringify(v, null, 2) : '{}';
    } else if (v !== undefined) {
      next[f.field] = v;
    }
  }
  for (const f of props.fields) {
    if (next[f.field] === undefined) next[f.field] = f.type === 'json' ? '{}' : '';
  }
  Object.keys(form).forEach((k) => delete form[k]);
  Object.assign(form, next);
}

/** 惰性初始化某语种的表单（基于详情返回的该语种内容，无内容则空白） */
function ensureForm(locale) {
  if (!forms[locale]) {
    const form = blankForm();
    fillForm(form, contentMap[locale] || {});
    forms[locale] = form;
  }
  if (expanded[locale] === undefined) expanded[locale] = true;
  return forms[locale];
}

/** 详情返回的全部语种内容合并进 contentMap（一次性） */
function mergeLocales(list) {
  for (const l of list || []) {
    const code = l?.locale || l?.code;
    if (!code) continue;
    if (contentMap[code] === undefined) {
      contentMap[code] = { ...l };
    }
  }
}

watch(
  () => props.locales,
  (list) => {
    mergeLocales(list);
    for (const code of existingCodes.value) ensureForm(code);
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

watch(defaultLocale, (code) => ensureForm(code), { immediate: true });
watch(systemLocales, (list) => {
  for (const code of list) ensureForm(code);
});

function setUploadRef(locale, field, el) {
  if (!uploadRefs[locale]) uploadRefs[locale] = {};
  uploadRefs[locale][field] = el;
}

/** 文件字段：选择后立即上传为 URL，避免 blob 进入保存载荷 */
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

/** 汇总全部语种 → locales 数组（跳过未上传完成的 blob 字段） */
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
        // 仍是 blob/未上传完成的对象，跳过该字段
        continue;
      }
      if (f.type === 'json') {
        try {
          values[f.field] = JSON.parse(v || '{}');
        } catch {
          jsonError = true;
          break;
        }
      } else {
        values[f.field] = v ?? '';
      }
      if (v !== undefined && v !== '' && v !== null && v !== '{}') {
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

onMounted(async () => {
  ensureForm(defaultLocale.value);
  try {
    const data = await requestClient.get('tenant/locale-config');
    if (data?.default_locale) defaultLocale.value = data.default_locale;
    if (Array.isArray(data?.enabled_locales) && data.enabled_locales.length > 0) {
      systemLocales.value = data.enabled_locales;
    }
  } catch {
    // 配置接口不可用时回退：已有语言 + 常用语言
    systemLocales.value = [...existingCodes.value, 'zh-CN', 'en-US'];
  }
  for (const code of orderedCodes.value) ensureForm(code);
});
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
    <!-- 基本信息：主语种（default_locale）内容 -->
    <section class="border-b border-gray-200 dark:border-gray-700">
      <div
        class="flex cursor-pointer flex-wrap items-center gap-2 bg-gray-50 px-3 py-2.5 dark:bg-gray-800/60"
        @click="expanded.__main__ = !expanded.__main__"
      >
        <span class="text-sm font-medium text-gray-800 dark:text-gray-100">
          基本信息
        </span>
        <span class="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
          主语种 · {{ nativeLabel(defaultLocale) }} ({{ defaultLocale }})
        </span>
        <template v-if="mainStatus !== undefined">
          <span
            class="rounded px-1.5 py-0.5 text-xs"
            :class="
              mainStatus === 1
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : mainStatus === 2
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
            "
          >
            {{ statusMap[mainStatus] || '-' }}
          </span>
        </template>
        <span
          v-if="dirty[defaultLocale]"
          class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        >
          未保存
        </span>
        <span class="ml-auto text-xs text-gray-400">
          {{ expanded.__main__ ? '▾' : '▸' }}
        </span>
      </div>
      <p class="bg-gray-50 px-3 pb-2 text-xs text-gray-400 dark:bg-gray-800/60 dark:text-gray-500">
        所有语种内容与基本信息一起保存，点击页面底部「保存」一次性提交全部内容。
      </p>
      <div v-show="expanded.__main__" class="p-3">
        <Spin :spinning="!forms[defaultLocale]">
          <div
            v-if="forms[defaultLocale]"
            class="grid grid-cols-1 gap-3 md:grid-cols-2"
          >
            <div
              v-for="f in fields"
              :key="f.field"
              :class="
                f.type === 'textarea' || f.type === 'json' || isUploadField(f)
                  ? 'md:col-span-2'
                  : ''
              "
            >
              <label
                class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300"
              >
                {{ f.label }}
              </label>
              <Input.TextArea
                v-if="f.type === 'textarea' || f.type === 'json'"
                v-model:value="forms[defaultLocale][f.field]"
                :rows="f.type === 'json' ? 8 : 3"
                :placeholder="f.placeholder || ''"
                @input="handleFieldChange(defaultLocale)"
              />
              <AppUpload
                v-else-if="isUploadField(f)"
                v-model="forms[defaultLocale][f.field]"
                :ref="(el) => setUploadRef(defaultLocale, f.field, el)"
                :file-type="uploadFileType(f)"
                :multiple="Boolean(f.attrs?.multiple)"
                :scene="f.attrs?.scene || ''"
                :item-width="f.attrs?.itemWidth || '150px'"
                :aspect-ratio="f.attrs?.aspectRatio || 1"
                @update:model-value="handleFieldChange(defaultLocale)"
              />
              <Input
                v-else
                v-model:value="forms[defaultLocale][f.field]"
                :placeholder="f.placeholder || ''"
                @input="handleFieldChange(defaultLocale)"
              />
            </div>
          </div>
        </Spin>
      </div>
    </section>

    <!-- 其他语种：可折叠卡片纵向平铺 -->
    <section
      v-for="code in otherCodes"
      :key="code"
      class="border-b border-gray-200 last:border-b-0 dark:border-gray-700"
    >
      <div
        class="flex cursor-pointer items-center gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/40"
        @click="expanded[code] = !expanded[code]"
      >
        <span class="text-sm font-medium text-gray-700 dark:text-gray-200">
          {{ nativeLabel(code) }} ({{ code }})
        </span>
        <span
          v-if="contentMap[code] !== undefined"
          class="inline-block h-1.5 w-1.5 rounded-full bg-green-500"
          title="已有内容"
        />
        <span v-else class="text-xs text-gray-400">暂无内容，可留空</span>
        <span
          v-if="dirty[code]"
          class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        >
          未保存
        </span>
        <span class="ml-auto text-xs text-gray-400">
          {{ expanded[code] ? '▾' : '▸' }}
        </span>
      </div>
      <div v-show="expanded[code]" class="p-3">
        <Spin :spinning="!forms[code]">
          <div v-if="forms[code]" class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div
              v-for="f in fields"
              :key="f.field"
              :class="
                f.type === 'textarea' || f.type === 'json' || isUploadField(f)
                  ? 'md:col-span-2'
                  : ''
              "
            >
              <label
                class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300"
              >
                {{ f.label }}
              </label>
              <Input.TextArea
                v-if="f.type === 'textarea' || f.type === 'json'"
                v-model:value="forms[code][f.field]"
                :rows="f.type === 'json' ? 8 : 3"
                :placeholder="f.placeholder || ''"
                @input="handleFieldChange(code)"
              />
              <AppUpload
                v-else-if="isUploadField(f)"
                v-model="forms[code][f.field]"
                :ref="(el) => setUploadRef(code, f.field, el)"
                :file-type="uploadFileType(f)"
                :multiple="Boolean(f.attrs?.multiple)"
                :scene="f.attrs?.scene || ''"
                :item-width="f.attrs?.itemWidth || '150px'"
                :aspect-ratio="f.attrs?.aspectRatio || 1"
                @update:model-value="handleFieldChange(code)"
              />
              <Input
                v-else
                v-model:value="forms[code][f.field]"
                :placeholder="f.placeholder || ''"
                @input="handleFieldChange(code)"
              />
            </div>
          </div>
        </Spin>
        <div v-if="forms[code] && !hasAnyContent(code)" class="mt-1 text-xs text-gray-400">
          该语种暂无内容，可留空；填好内容后点底部「保存」即创建该语种版本。
        </div>
      </div>
    </section>

    <div v-if="otherCodes.length === 0" class="p-6">
      <Empty description="暂无其他语言，可在站点配置中启用" />
    </div>
  </div>
</template>
