<script setup>
import { computed, ref, watch } from 'vue';
import { message } from 'antdv-next';
import { requestClient } from '#/api/request';

import {
  DEFAULT_INTERNAL_DOMAINS,
  getFileNameFromUrl,
  normalizeDomain,
  parseSourceArticle,
  transferRemoteAsset,
} from './external-assets';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  assets: {
    type: Array,
    default: () => [],
  },
  internalDomains: {
    type: Array,
    default: () => DEFAULT_INTERNAL_DOMAINS,
  },
  uploadFile: {
    type: Function,
    default: null,
  },
});

const emit = defineEmits([
  'update:visible',
  'replace',
  'load-content',
  'update:internalDomains',
]);

const list = ref([]);
const isTransferring = ref(false);
const activeTab = ref('all'); // 'all' | 'image' | 'video' | 'file'
const newDomainInput = ref('');
const customDomains = ref([...props.internalDomains]);
const sourceArticleUrl = ref('');

// 来源文章解析相关
const isParsingSource = ref(false);
const parsedSourceArticleData = ref(null);

// 本地文件替换相关
const fileInputRef = ref(null);
const activeReplacingItem = ref(null);

// 就地编辑链接相关
const editingUrlItemId = ref('');
const editingUrlValue = ref('');

watch(
  () => props.assets,
  (newAssets) => {
    if (!newAssets) return;
    const existingMap = new Map();
    for (const it of list.value) {
      if (it.url) existingMap.set(it.url, it);
      if (it.originalUrl) existingMap.set(it.originalUrl, it);
      if (it.id) existingMap.set(it.id, it);
    }

    const merged = (newAssets || []).map((it) => {
      const exist = existingMap.get(it.url) || existingMap.get(it.id);
      if (exist) {
        return {
          ...it,
          originalUrl: exist.originalUrl || it.url,
          status: exist.status,
          newUrl: exist.newUrl,
          errorMsg: exist.errorMsg,
          selected: exist.status === 'success' ? false : exist.selected,
        };
      }
      return {
        ...it,
        originalUrl: it.url,
        selected: it.selected !== undefined ? it.selected : true,
        status: it.status || 'idle',
        newUrl: it.newUrl || '',
        errorMsg: it.errorMsg || '',
      };
    });

    // 保留通过来源文章解析追加的项 (id 以 src- 开头)
    for (const it of list.value) {
      if (it.id?.startsWith('src-') && !merged.some((m) => m.url === it.url || m.id === it.id)) {
        merged.push(it);
      }
    }

    list.value = merged;
  },
  { immediate: true, deep: true },
);

watch(
  () => props.internalDomains,
  (val) => {
    if (val && Array.isArray(val)) {
      customDomains.value = [...val];
    }
  },
);

const displayList = computed(() => {
  if (activeTab.value === 'all') return list.value;
  return list.value.filter((item) => item.type === activeTab.value);
});

const selectedItems = computed(() => {
  return list.value.filter((it) => it.selected && it.status !== 'success');
});

const isAllSelected = computed({
  get() {
    const selectable = displayList.value.filter((it) => it.status !== 'success');
    return selectable.length > 0 && selectable.every((it) => it.selected);
  },
  set(val) {
    for (const item of displayList.value) {
      if (item.status !== 'success') {
        item.selected = val;
      }
    }
  },
});

function closeModal() {
  emit('update:visible', false);
}

function addDomain() {
  const raw = newDomainInput.value.trim();
  const normalized = normalizeDomain(raw);
  if (!normalized) return;
  if (!customDomains.value.includes(normalized)) {
    customDomains.value.push(normalized);
    emit('update:internalDomains', [...customDomains.value]);
    message.success(`已添加免检域名：${normalized}`);
  }
  newDomainInput.value = '';
}

function removeDomain(domain) {
  customDomains.value = customDomains.value.filter((d) => d !== domain);
  emit('update:internalDomains', [...customDomains.value]);
  message.info(`已移除免检域名：${domain}`);
}

async function handleParseSource(options = {}) {
  const url = sourceArticleUrl.value.trim();
  if (!url) {
    message.warning('请先输入来源文章网址');
    return;
  }
  const forceRefresh = !!options?.refresh;
  isParsingSource.value = true;
  try {
    const data = await parseSourceArticle(url, { refresh: forceRefresh });
    parsedSourceArticleData.value = data;

    let refreshedCount = 0;
    let addedCount = 0;
    const mapping = {};

    // 1. 处理来源文章视频：刷新已有视频并追加新视频
    if (Array.isArray(data.videos)) {
      data.videos.forEach((v) => {
        const existing = list.value.find(
          (it) => (v.vid && (it.url.includes(v.vid) || it.name.includes(v.vid))) || it.url === v.url,
        );
        if (existing) {
          if (existing.url !== v.url) {
            existing.originalUrl = existing.originalUrl || existing.url;
            mapping[existing.url] = v.url;
            mapping[existing.originalUrl] = v.url;
            existing.url = v.url;
            existing.status = 'idle';
            existing.errorMsg = '';
            existing.isExpired = false;
            existing.selected = true;
            refreshedCount++;
          }
        } else {
          list.value.push({
            id: `src-v-${v.vid || Math.random().toString(36).slice(2, 7)}`,
            url: v.url,
            originalUrl: v.url,
            type: 'video',
            name: `${v.vid || 'video'}.mp4`,
            count: 1,
            selected: true,
            isExpired: false,
            status: 'idle',
            newUrl: '',
            errorMsg: '',
          });
          addedCount++;
        }
      });
    }

    // 2. 处理来源文章图片：追加未收录的正文图片
    if (Array.isArray(data.images)) {
      data.images.forEach((imgUrl) => {
        const cleanImgUrl = imgUrl.trim();
        if (!cleanImgUrl) return;
        const exists = list.value.some((it) => it.url === cleanImgUrl || it.originalUrl === cleanImgUrl);
        if (!exists) {
          list.value.push({
            id: `src-img-${Math.random().toString(36).slice(2, 7)}`,
            url: cleanImgUrl,
            originalUrl: cleanImgUrl,
            type: 'image',
            name: getFileNameFromUrl(cleanImgUrl),
            count: 1,
            selected: true,
            isExpired: false,
            status: 'idle',
            newUrl: '',
            errorMsg: '',
          });
          addedCount++;
        }
      });
    }

    if (Object.keys(mapping).length > 0) {
      emit('replace', mapping);
    }

    const totalCollected = (data.videos?.length || 0) + (data.images?.length || 0);
    message.success(
      `已从来源文章成功采集 ${totalCollected} 项外部资源（${data.videos?.length || 0} 个视频、${data.images?.length || 0} 张图片）！可勾选后一键转存，或载入整篇正文。`,
    );
  } catch (err) {
    message.error(`解析来源文章失败：${err.message || '网络错误'}`);
  } finally {
    isParsingSource.value = false;
  }
}

function handleLoadSourceContent() {
  if (!parsedSourceArticleData.value?.content) return;
  emit('load-content', parsedSourceArticleData.value.content);
  message.success('已将来源文章正文载入编辑器！');
}

async function transferSingle(item, originalUrlKey = null) {
  if (!item || !item.url) return;
  item.status = 'uploading';
  item.errorMsg = '';

  try {
    const newUrl = await transferRemoteAsset(item.url, {
      uploadFileFn: props.uploadFile,
      referer: sourceArticleUrl.value.trim() || undefined,
    });
    item.status = 'success';
    item.newUrl = newUrl;
    const repMap = { [item.url]: newUrl };
    if (item.originalUrl && item.originalUrl !== item.url) {
      repMap[item.originalUrl] = newUrl;
    }
    if (originalUrlKey && originalUrlKey !== item.url) {
      repMap[originalUrlKey] = newUrl;
    }
    emit('replace', repMap);
    message.success(`资源已成功转存为站内链接！`);
  } catch (err) {
    item.status = 'error';
    item.errorMsg = err.message || '转存失败';
    message.error(`转存失败：${item.errorMsg}`);
  }
}

async function transferSelected() {
  const targets = selectedItems.value;
  if (targets.length === 0) {
    message.warning('请先勾选需要转存的外链资源');
    return;
  }

  isTransferring.value = true;
  let successCount = 0;
  let failCount = 0;
  const mapping = {};

  for (const item of targets) {
    item.status = 'uploading';
    item.errorMsg = '';
    try {
      const newUrl = await transferRemoteAsset(item.url, {
        uploadFileFn: props.uploadFile,
        referer: sourceArticleUrl.value.trim() || undefined,
      });
      item.status = 'success';
      item.newUrl = newUrl;
      mapping[item.url] = newUrl;
      if (item.originalUrl && item.originalUrl !== item.url) {
        mapping[item.originalUrl] = newUrl;
      }
      successCount++;
    } catch (err) {
      item.status = 'error';
      item.errorMsg = err.message || '转存失败';
      failCount++;
    }
  }

  isTransferring.value = false;

  if (Object.keys(mapping).length > 0) {
    emit('replace', mapping);
  }

  if (failCount === 0) {
    message.success(`已成功转存 ${successCount} 项资源并完成正文 URL 替换！`);
  } else {
    message.warning(
      `转存完成：${successCount} 项成功，${failCount} 项失败。失败项支持在上方填入来源文章网址自动刷新，或本地文件替换。`,
    );
  }
}

function copyUrl(text) {
  if (!text) return;
  navigator.clipboard?.writeText(text);
  message.success('链接已复制到剪贴板');
}

// 触发本地文件替换
function triggerLocalUpload(item) {
  activeReplacingItem.value = item;
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
    fileInputRef.value.click();
  }
}

async function onLocalFileSelected(e) {
  const file = e.target.files?.[0];
  const item = activeReplacingItem.value;
  if (!file || !item) return;

  item.status = 'uploading';
  item.errorMsg = '';
  try {
    let newUrl = '';
    if (typeof props.uploadFile === 'function') {
      newUrl = await props.uploadFile(file);
    } else {
      const formData = new FormData();
      formData.append('file', file);
      const res = await requestClient.post('/uploads', formData);
      newUrl = res?.data?.url || res?.url;
    }

    if (!newUrl) throw new Error('上传未返回资源链接');

    item.status = 'success';
    item.newUrl = newUrl;
    const repMap = { [item.url]: newUrl };
    if (item.originalUrl && item.originalUrl !== item.url) {
      repMap[item.originalUrl] = newUrl;
    }
    emit('replace', repMap);
    message.success(`已通过本地文件成功替换：${file.name}`);
  } catch (err) {
    item.status = 'error';
    item.errorMsg = err.message || '本地文件上传失败';
    message.error(`本地文件替换失败：${item.errorMsg}`);
  } finally {
    activeReplacingItem.value = null;
  }
}

// 就地编辑链接
function startEditUrl(item) {
  editingUrlItemId.value = item.id;
  editingUrlValue.value = item.url;
}

function cancelEditUrl() {
  editingUrlItemId.value = '';
  editingUrlValue.value = '';
}

async function confirmEditUrl(item) {
  const newRaw = editingUrlValue.value.trim();
  if (!newRaw || newRaw === item.url) {
    cancelEditUrl();
    return;
  }
  const oldUrl = item.url;
  item.url = newRaw;
  cancelEditUrl();
  await transferSingle(item, oldUrl);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4 transition-opacity select-none"
      @click.self="closeModal"
    >
      <div
        class="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden text-foreground"
      >
        <!-- 隐藏的本地文件上传控件 -->
        <input
          ref="fileInputRef"
          class="hidden"
          type="file"
          @change="onLocalFileSelected"
        />

        <!-- 弹窗顶栏 -->
        <div
          class="flex items-center justify-between border-b border-border px-5 py-3.5 bg-card"
        >
          <div class="flex items-center gap-2.5">
            <div class="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <svg
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" x2="12" y1="3" y2="15" />
              </svg>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold">外链资源检测与转存（服务端全自动）</span>
                <span
                  class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600"
                >
                  检测到 {{ list.length }} 项外部资源
                </span>
              </div>
              <div class="text-[11px] text-muted-foreground">
                由 EDP 后端全自动流式转存至阿里云 OSS 并替换正文引用，彻底消除防盗链与临时凭证失效风险
              </div>
            </div>
          </div>
          <button
            class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="关闭"
            type="button"
            @click="closeModal"
          >
            <svg
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <line x1="18" x2="6" y1="6" y2="18" />
              <line x1="6" x2="18" y1="6" y2="18" />
            </svg>
          </button>
        </div>

        <!-- 来源文章解析与动态刷新工具栏 -->
        <div class="border-b border-border bg-muted/20 px-5 py-2.5">
          <div class="flex flex-col gap-2">
            <!-- 来源文章输入与操作 -->
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div class="flex flex-1 items-center gap-2 min-w-[320px]">
                <span class="text-muted-foreground shrink-0 font-medium">来源文章网址:</span>
                <input
                  v-model="sourceArticleUrl"
                  class="flex-1 rounded border border-border bg-background px-2.5 py-1 text-xs outline-none focus:border-primary placeholder:text-muted-foreground/60"
                  placeholder="粘贴微信公众号等来源文章链接（如 https://mp.weixin.qq.com/s/...）"
                  type="text"
                  @keydown.enter.prevent="handleParseSource"
                />
                <button
                  class="flex items-center gap-1 rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50 shrink-0"
                  :disabled="isParsingSource || !sourceArticleUrl.trim()"
                  type="button"
                  title="自动从来源文章中获取最新的视频有效签名，并动态替换文中的带参数外链"
                  @click="handleParseSource"
                >
                  <span v-if="isParsingSource" class="size-3 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                  <span>{{ isParsingSource ? '解析中...' : '🔍 从来源解析与刷新' }}</span>
                </button>
                <button
                  v-if="parsedSourceArticleData?.content"
                  class="rounded border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 shrink-0"
                  type="button"
                  title="将来源文章正文（已清洗视频与图片）直接载入当前编辑器"
                  @click="handleLoadSourceContent"
                >
                  📑 载入整篇正文
                </button>
              </div>
            </div>

            <!-- 免检域名标签与配置 -->
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-muted-foreground font-medium shrink-0">免检（站内）域名:</span>
                <span
                  v-for="d in customDomains"
                  :key="d"
                  class="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-[11px] font-mono text-foreground"
                >
                  <span>{{ d }}</span>
                  <button
                    class="text-muted-foreground hover:text-red-500"
                    title="移除"
                    type="button"
                    @click="removeDomain(d)"
                  >
                    ×
                  </button>
                </span>
                <input
                  v-model="newDomainInput"
                  class="w-28 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:border-primary"
                  placeholder="添加免检域名..."
                  type="text"
                  @keydown.enter.prevent="addDomain"
                />
                <button
                  class="rounded border border-border bg-background px-2 py-0.5 text-xs font-medium hover:bg-muted"
                  type="button"
                  @click="addDomain"
                >
                  +
                </button>
              </div>
              <div class="text-[11px] text-muted-foreground">
                提示：填入来源文章后，转存微信等外部资源将自动携带合法 Referer 并实时刷新签名
              </div>
            </div>
          </div>
        </div>

        <!-- 资源列表过滤分类 -->
        <div class="flex items-center justify-between border-b border-border px-5 py-2 text-xs">
          <div class="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg">
            <button
              class="rounded-md px-2.5 py-1 font-medium transition-colors"
              :class="activeTab === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
              type="button"
              @click="activeTab = 'all'"
            >
              全部 ({{ list.length }})
            </button>
            <button
              class="rounded-md px-2.5 py-1 font-medium transition-colors"
              :class="activeTab === 'image' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
              type="button"
              @click="activeTab = 'image'"
            >
              图片 ({{ list.filter((i) => i.type === 'image').length }})
            </button>
            <button
              class="rounded-md px-2.5 py-1 font-medium transition-colors"
              :class="activeTab === 'video' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
              type="button"
              @click="activeTab = 'video'"
            >
              视频 ({{ list.filter((i) => i.type === 'video').length }})
            </button>
            <button
              class="rounded-md px-2.5 py-1 font-medium transition-colors"
              :class="activeTab === 'file' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
              type="button"
              @click="activeTab = 'file'"
            >
              其他 ({{ list.filter((i) => i.type !== 'image' && i.type !== 'video').length }})
            </button>
          </div>

          <div class="text-[11px] text-muted-foreground">
            勾选需要转存的资源后，点击右下方【一键转存并替换】
          </div>
        </div>

        <!-- 资源表格列表区 -->
        <div class="flex-1 min-h-[300px] max-h-[50vh] overflow-y-auto p-4">
          <div v-if="displayList.length === 0" class="flex h-48 flex-col items-center justify-center text-muted-foreground">
            <div class="text-xs">未检测到符合当前分类的外链资源</div>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="item in displayList"
              :key="item.id"
              class="group flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/50 hover:bg-muted/10"
              :class="{
                'bg-emerald-50/40 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-800': item.status === 'success',
                'bg-red-50/40 border-red-300 dark:bg-red-950/20 dark:border-red-800': item.status === 'error',
              }"
            >
              <!-- 左侧多选框与预览 -->
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <input
                  v-model="item.selected"
                  :disabled="item.status === 'success' || isTransferring"
                  class="size-4 rounded border-border text-primary cursor-pointer shrink-0"
                  type="checkbox"
                />

                <!-- 缩略图或图标预览 -->
                <div class="size-12 shrink-0 overflow-hidden rounded bg-muted/40 flex items-center justify-center border border-border">
                  <img
                    v-if="item.type === 'image'"
                    :alt="item.name"
                    class="size-full object-cover"
                    loading="lazy"
                    referrerpolicy="no-referrer"
                    :src="item.newUrl || item.url"
                  />
                  <svg
                    v-else-if="item.type === 'video'"
                    class="size-6 text-primary opacity-80"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <svg
                    v-else
                    class="size-6 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>

                <!-- 资源信息 -->
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate text-xs font-semibold text-foreground" :title="item.name">
                      {{ item.name }}
                    </span>
                    <span class="rounded bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground uppercase font-mono">
                      {{ item.type }}
                    </span>
                    <span v-if="item.count > 1" class="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] text-primary">
                      文中引用 {{ item.count }} 次
                    </span>
                    <span v-if="item.isExpired" class="rounded bg-red-500/10 px-1.5 py-0.2 text-[10px] font-medium text-red-500">
                      临时凭证已过期 (403)
                    </span>
                  </div>

                  <!-- 链接详情与就地编辑 -->
                  <div v-if="editingUrlItemId === item.id" class="mt-1 flex items-center gap-1.5">
                    <input
                      v-model="editingUrlValue"
                      class="flex-1 rounded border border-primary bg-background px-2 py-0.5 text-xs font-mono outline-none"
                      placeholder="粘贴新的有效媒体链接..."
                      type="text"
                      @keydown.enter.prevent="confirmEditUrl(item)"
                    />
                    <button
                      class="rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground"
                      type="button"
                      @click="confirmEditUrl(item)"
                    >
                      确定
                    </button>
                    <button
                      class="rounded border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                      type="button"
                      @click="cancelEditUrl"
                    >
                      取消
                    </button>
                  </div>

                  <div v-else class="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                    <span class="truncate max-w-lg" :title="item.url">{{ item.url }}</span>
                    <button
                      class="text-primary hover:underline shrink-0"
                      title="复制原始链接"
                      type="button"
                      @click="copyUrl(item.url)"
                    >
                      复制
                    </button>
                    <a
                      class="text-primary hover:underline shrink-0"
                      :href="item.url"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      查看
                    </a>
                  </div>

                  <!-- 转存成功后显示新 URL -->
                  <div v-if="item.status === 'success'" class="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-600 font-mono">
                    <span>已转存:</span>
                    <span class="truncate max-w-lg" :title="item.newUrl">{{ item.newUrl }}</span>
                  </div>

                  <!-- 失败提示与兜底操作工具 -->
                  <div v-if="item.status === 'error'" class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-red-500">
                    <span>转存失败: {{ item.errorMsg }}</span>
                    <div class="flex items-center gap-1.5">
                      <button
                        class="rounded border border-red-300 bg-background px-1.5 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/40"
                        title="选择本地电脑上的文件直接上传，并自动替换正文中的该链接"
                        type="button"
                        @click="triggerLocalUpload(item)"
                      >
                        📁 本地文件替换
                      </button>
                      <button
                        class="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
                        title="粘贴最新复制的有效链接并重试"
                        type="button"
                        @click="startEditUrl(item)"
                      >
                        ✏️ 更换链接
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 右侧状态与单项操作 -->
              <div class="shrink-0 flex items-center gap-2">
                <span v-if="item.status === 'uploading'" class="flex items-center gap-1 text-xs text-primary font-medium">
                  <span class="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
                  <span>转存中...</span>
                </span>
                <span v-else-if="item.status === 'success'" class="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                  <svg class="size-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>已转存替换</span>
                </span>
                <button
                  v-else
                  class="rounded border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted hover:border-primary disabled:opacity-50"
                  :disabled="isTransferring"
                  type="button"
                  @click="transferSingle(item)"
                >
                  {{ item.status === 'error' ? '重试转存' : '单项转存' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 弹窗底栏 -->
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-3"
        >
          <!-- 左侧全选与统计 -->
          <div class="flex items-center gap-3 text-xs">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input
                v-model="isAllSelected"
                :disabled="isTransferring"
                class="size-4 rounded border-border text-primary"
                type="checkbox"
              />
              <span class="font-medium text-foreground">全选当前分类</span>
            </label>
            <span class="text-border">|</span>
            <span class="text-muted-foreground">
              已选 <strong class="text-primary font-semibold">{{ selectedItems.length }}</strong> / {{ list.length }} 项
            </span>
          </div>

          <!-- 右侧操作按钮 -->
          <div class="flex items-center gap-2">
            <button
              class="rounded-md border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              type="button"
              @click="closeModal"
            >
              关闭
            </button>
            <button
              class="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="selectedItems.length === 0 || isTransferring"
              type="button"
              @click="transferSelected"
            >
              <span v-if="isTransferring" class="size-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"></span>
              <span>{{ isTransferring ? '正在批量转存中...' : `一键转存并替换 (${selectedItems.length})` }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
