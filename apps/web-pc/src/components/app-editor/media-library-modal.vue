<script setup>
import { computed, ref, watch } from 'vue';

import {
  buildThumbnailUrl,
  DEFAULT_THUMBNAIL_PROCESS,
  defaultFetchMedia,
  detectMediaType,
  formatBytes,
  MEDIA_TYPE_OPTIONS,
  stripThumbnailParam,
} from './media-api';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  initialType: {
    type: String,
    default: 'image',
  },
  fetchMedia: {
    type: Function,
    default: defaultFetchMedia,
  },
  uploadFile: {
    type: Function,
    default: null,
  },
  thumbnailProcess: {
    type: [String, Function, Boolean],
    default: DEFAULT_THUMBNAIL_PROCESS,
  },
});

const emit = defineEmits(['update:visible', 'select', 'close']);

const currentType = ref('all');
const keyword = ref('');
const list = ref([]);
const loading = ref(false);
const errorMsg = ref('');
const selectedItem = ref(null);

const page = ref(1);
const pageSize = ref(30);
const total = ref(0);
const jumpPageInput = ref('');

const fileInputRef = ref(null);
const isUploading = ref(false);

const isInputtingUrl = ref(false);
const customUrl = ref('');

const currentTypeLabel = computed(() => {
  const found = MEDIA_TYPE_OPTIONS.find((o) => o.value === currentType.value);
  return found?.label || '全部';
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(total.value / pageSize.value));
});

const visiblePages = computed(() => {
  const current = page.value;
  const count = totalPages.value;
  if (count <= 7) {
    return Array.from({ length: count }, (_, i) => i + 1);
  }
  const pages = [];
  pages.push(1);
  if (current > 4) {
    pages.push('...');
  }
  const start = Math.max(2, current - 2);
  const end = Math.min(count - 1, current + 2);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (current < count - 3) {
    pages.push('...');
  }
  pages.push(count);
  return pages;
});

function getItemThumbnail(item) {
  if (!item) return '';
  if (item.type !== 'image') return item.thumbnailUrl || item.url || '';
  if (item.thumbnailUrl) return item.thumbnailUrl;
  return buildThumbnailUrl(item.url, props.thumbnailProcess, item);
}

async function loadMedia(targetPage = 1) {
  loading.value = true;
  errorMsg.value = '';
  page.value = targetPage;

  try {
    const fetchFn = props.fetchMedia || defaultFetchMedia;
    const res = await fetchFn({
      type: currentType.value,
      keyword: keyword.value.trim(),
      page: targetPage,
      pageSize: pageSize.value,
      thumbnailProcess: props.thumbnailProcess,
    });

    let rawItems = [];
    let totalCount = 0;

    if (Array.isArray(res)) {
      rawItems = res;
      totalCount = res.length;
    } else if (res && Array.isArray(res.items)) {
      rawItems = res.items;
      totalCount = Number(res.total) || rawItems.length;
    } else if (res && Array.isArray(res.data)) {
      rawItems = res.data;
      totalCount = Number(res.meta?.total) || rawItems.length;
    }

    list.value = rawItems.map((item) => {
      const ext = (
        item.extension ||
        item.name?.split('.').pop() ||
        ''
      ).toLowerCase();
      const detected = item.type || detectMediaType(item.mime, ext);
      const isImage = detected === 'image';
      const cleanUrl = stripThumbnailParam(item.url || '');
      const thumb =
        item.thumbnailUrl ||
        (isImage
          ? buildThumbnailUrl(cleanUrl, props.thumbnailProcess, item)
          : cleanUrl);

      return {
        id: item.id || item.url,
        name: item.name || '未命名文件',
        url: cleanUrl, // 原图 URL，用于插入编辑器
        thumbnailUrl: thumb, // 缩略图 URL，用于网格预览
        size: item.size || 0,
        sizeHuman: item.sizeHuman || formatBytes(item.size),
        mime: item.mime || '',
        extension: ext,
        type: detected,
        created_at: item.created_at || '',
      };
    });

    total.value = totalCount;

    // 若当前选中的项不在新列表中，清空选中
    if (
      selectedItem.value &&
      !list.value.some((it) => it.id === selectedItem.value.id)
    ) {
      selectedItem.value = null;
    }
  } catch (err) {
    console.error('[app-editor] 媒体库加载异常:', err);
    errorMsg.value = '媒体库加载失败，请重试';
    list.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function onPageChange(newPage) {
  const target = Math.max(1, Math.min(newPage, totalPages.value));
  if (target === page.value) return;
  loadMedia(target);
}

function onPageSizeChange(event) {
  const newSize = Number(event.target.value) || 30;
  if (newSize === pageSize.value) return;
  pageSize.value = newSize;
  loadMedia(1);
}

function onJumpPage() {
  const target = parseInt(jumpPageInput.value, 10);
  if (!Number.isNaN(target)) {
    onPageChange(target);
  }
  jumpPageInput.value = '';
}

function onTypeChange(type) {
  if (currentType.value === type) return;
  currentType.value = type;
  selectedItem.value = null;
  loadMedia(1);
}

function onSearch() {
  loadMedia(1);
}

function onClearSearch() {
  keyword.value = '';
  loadMedia(1);
}

function selectItem(item) {
  selectedItem.value = item;
}

function confirmSelect(item = null) {
  const target = item || selectedItem.value;
  if (!target || !target.url) return;
  // 插入正文时始终使用纯净原图（剥离缩略图处理参数）
  const cleanItem = {
    ...target,
    url: stripThumbnailParam(target.url),
  };
  emit('select', cleanItem);
  closeModal();
}

function closeModal() {
  emit('update:visible', false);
  emit('close');
}

function triggerUpload() {
  fileInputRef.value?.click();
}

async function onFileSelected(event) {
  const file = event.target?.files?.[0];
  if (!file || !props.uploadFile) return;

  isUploading.value = true;
  try {
    const url = await props.uploadFile(file);
    if (url) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const cleanUrl = stripThumbnailParam(url);
      const isImage = detectMediaType(file.type, ext) === 'image';
      const newItem = {
        id: `upload-${Date.now()}`,
        name: file.name,
        url: cleanUrl, // 原图 URL
        thumbnailUrl: isImage
          ? buildThumbnailUrl(cleanUrl, props.thumbnailProcess)
          : cleanUrl, // 缩略图 URL
        size: file.size,
        sizeHuman: formatBytes(file.size),
        mime: file.type,
        extension: ext,
        type: detectMediaType(file.type, ext),
        created_at: '刚刚',
      };
      // 插入到当前列表首位并自动选中
      list.value.unshift(newItem);
      total.value += 1;
      selectedItem.value = newItem;
    }
  } catch (err) {
    console.error('[app-editor] 媒体库内直传失败:', err);
  } finally {
    isUploading.value = false;
    if (fileInputRef.value) fileInputRef.value.value = '';
  }
}

function toggleUrlInput() {
  isInputtingUrl.value = !isInputtingUrl.value;
}

function confirmCustomUrl() {
  const rawUrl = customUrl.value.trim();
  if (!rawUrl) return;
  const cleanUrl = stripThumbnailParam(rawUrl);
  const ext = cleanUrl.split('.').pop()?.split(/[?#]/)[0]?.toLowerCase() || '';
  const detected = detectMediaType('', ext);
  const isImage = (detected || currentType.value) === 'image';
  emit('select', {
    id: `custom-url-${Date.now()}`,
    name: cleanUrl.split('/').pop()?.split(/[?#]/)[0] || '网络外链',
    url: cleanUrl, // 原图 URL
    thumbnailUrl: isImage
      ? buildThumbnailUrl(cleanUrl, props.thumbnailProcess)
      : cleanUrl,
    extension: ext,
    type:
      detected ||
      (currentType.value !== 'all' ? currentType.value : 'image'),
    size: 0,
    sizeHuman: '-',
  });
  customUrl.value = '';
  isInputtingUrl.value = false;
  closeModal();
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      currentType.value = props.initialType || 'all';
      selectedItem.value = null;
      keyword.value = '';
      isInputtingUrl.value = false;
      customUrl.value = '';
      jumpPageInput.value = '';
      loadMedia(1);
    }
  },
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 transition-opacity"
      @click.self="closeModal"
    >
      <div
        class="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden text-foreground"
      >
        <!-- 弹窗顶栏 -->
        <div
          class="flex items-center justify-between border-b border-border px-5 py-3.5 bg-card"
        >
          <div class="flex items-center gap-2">
            <svg
              class="size-5 text-primary"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path
                d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"
              />
            </svg>
            <span class="text-sm font-semibold">媒体资源库</span>
            <span
              class="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
            >
              {{ currentTypeLabel }}
            </span>
          </div>
          <button
            class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="关闭 (Esc)"
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

        <!-- 过滤与工具栏 -->
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-5 py-2.5"
        >
          <!-- 分类标签页 -->
          <div class="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg">
            <button
              v-for="item in MEDIA_TYPE_OPTIONS"
              :key="item.value"
              class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
              :class="
                currentType === item.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              "
              type="button"
              @click="onTypeChange(item.value)"
            >
              {{ item.label }}
            </button>
          </div>

          <!-- 右侧搜索与操作 -->
          <div class="flex items-center gap-2">
            <!-- 隐藏上传控件 -->
            <input
              ref="fileInputRef"
              type="file"
              class="hidden"
              :accept="currentType === 'image' ? 'image/*' : currentType === 'video' ? 'video/*' : '*/*'"
              @change="onFileSelected"
            />

            <!-- 搜索框 -->
            <div class="relative flex items-center">
              <input
                v-model="keyword"
                class="w-48 rounded-md border border-border bg-background py-1 pl-8 pr-7 text-xs outline-none focus:border-primary"
                placeholder="搜索文件名..."
                type="text"
                @keydown.enter="onSearch"
              />
              <svg
                class="absolute left-2.5 size-3.5 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <button
                v-if="keyword"
                class="absolute right-2 text-muted-foreground hover:text-foreground"
                type="button"
                @click="onClearSearch"
              >
                <svg
                  class="size-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </button>
            </div>

            <!-- 刷新 -->
            <button
              class="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="刷新列表"
              type="button"
              @click="loadMedia(page)"
            >
              <svg
                class="size-3.5"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
            </button>

            <!-- 网络外链录入按钮 -->
            <button
              class="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              :class="{ '!border-primary !text-primary bg-primary/10': isInputtingUrl }"
              :title="isInputtingUrl ? '收起外链输入' : '输入网络外链地址'"
              type="button"
              @click="toggleUrlInput"
            >
              <svg
                class="size-3.5"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </button>

            <!-- 本地上传 -->
            <button
              v-if="props.uploadFile"
              class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
              :disabled="isUploading"
              type="button"
              @click="triggerUpload"
            >
              <span
                v-if="isUploading"
                class="size-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"
              ></span>
              <svg
                v-else
                class="size-3.5"
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
              <span>{{ isUploading ? '上传中...' : '上传新文件' }}</span>
            </button>
          </div>
        </div>

        <!-- 网络外链快速录入条 -->
        <div
          v-if="isInputtingUrl"
          class="flex items-center gap-2 border-b border-border bg-muted/40 px-5 py-2.5 transition-all"
        >
          <span class="text-xs font-medium text-foreground whitespace-nowrap">
            {{ currentType === 'video' ? '视频外链:' : '图片/素材外链:' }}
          </span>
          <input
            v-model="customUrl"
            class="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
            :placeholder="
              currentType === 'video'
                ? '请输入视频直链（如 https://.../video.mp4）'
                : '请输入图片或文件直链（如 https://.../image.png）'
            "
            type="text"
            @keydown.enter.prevent="confirmCustomUrl"
          />
          <button
            class="rounded-md bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            :disabled="!customUrl.trim()"
            type="button"
            @click="confirmCustomUrl"
          >
            直接插入
          </button>
          <button
            class="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            type="button"
            @click="isInputtingUrl = false"
          >
            取消
          </button>
        </div>

        <!-- 资源内容区 -->
        <div class="relative flex-1 min-h-[340px] max-h-[55vh] overflow-y-auto p-5">
          <!-- 加载状态 -->
          <div
            v-if="loading"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-card/70 backdrop-blur-xs"
          >
            <div
              class="size-7 animate-spin rounded-full border-2 border-primary border-t-transparent"
            ></div>
            <span class="mt-2 text-xs text-muted-foreground">正在加载媒体资源...</span>
          </div>

          <!-- 错误提示 -->
          <div
            v-if="errorMsg && !loading"
            class="flex h-64 flex-col items-center justify-center text-center text-muted-foreground"
          >
            <div class="text-xs text-red-500">{{ errorMsg }}</div>
            <button
              class="mt-2 rounded border border-border px-3 py-1 text-xs hover:bg-muted"
              type="button"
              @click="loadMedia(page)"
            >
              重试
            </button>
          </div>

          <!-- 空列表提示 -->
          <div
            v-else-if="list.length === 0 && !loading"
            class="flex h-64 flex-col items-center justify-center text-center text-muted-foreground"
          >
            <svg
              class="size-12 opacity-30 mb-2"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              viewBox="0 0 24 24"
            >
              <rect height="18" rx="2" width="18" x="3" y="3" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            <div class="text-xs font-medium">未找到相关媒体文件</div>
            <div class="text-[11px] opacity-70">
              可尝试切换分类、更换关键词，或点击右上角直接上传/输入外链
            </div>
          </div>

          <!-- 资源网格 -->
          <div
            v-else
            class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          >
            <div
              v-for="item in list"
              :key="item.id"
              class="group relative flex flex-col rounded-lg border bg-background p-2 transition-all hover:border-primary/60 hover:shadow-sm cursor-pointer select-none"
              :class="
                selectedItem?.id === item.id
                  ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                  : 'border-border'
              "
              @click="selectItem(item)"
              @dblclick="confirmSelect(item)"
            >
              <!-- 预览区 -->
              <div
                class="relative aspect-video w-full overflow-hidden rounded bg-muted/40 flex items-center justify-center"
              >
                <!-- 图片预览：使用压缩缩略图，大幅提升加载速度与节省流量 -->
                <img
                  v-if="item.type === 'image'"
                  :alt="item.name"
                  class="size-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                  :src="getItemThumbnail(item)"
                />

                <!-- 视频占位预览 -->
                <div
                  v-else-if="item.type === 'video'"
                  class="flex size-full flex-col items-center justify-center bg-slate-900 text-white"
                >
                  <svg
                    class="size-8 opacity-80 group-hover:scale-110 transition-transform text-primary"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span class="mt-1 text-[10px] opacity-75 font-mono">VIDEO</span>
                </div>

                <!-- 音频占位预览 -->
                <div
                  v-else-if="item.type === 'audio'"
                  class="flex size-full flex-col items-center justify-center bg-amber-500/10 text-amber-600"
                >
                  <svg
                    class="size-8"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <span class="mt-1 text-[10px] font-mono">AUDIO</span>
                </div>

                <!-- 文档 / 其他占位预览 -->
                <div
                  v-else
                  class="flex size-full flex-col items-center justify-center bg-blue-500/10 text-blue-600"
                >
                  <svg
                    class="size-8"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                    />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span class="mt-1 text-[10px] font-mono uppercase font-semibold">
                    {{ item.extension || 'FILE' }}
                  </span>
                </div>

                <!-- 选中勾标 -->
                <div
                  v-if="selectedItem?.id === item.id"
                  class="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
                >
                  <svg
                    class="size-3"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="3"
                    viewBox="0 0 24 24"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>

              <!-- 文件信息 -->
              <div class="mt-2 flex flex-col">
                <div
                  class="truncate text-xs font-medium text-foreground"
                  :title="item.name"
                >
                  {{ item.name }}
                </div>
                <div
                  class="mt-1 flex items-center justify-between text-[10px] text-muted-foreground"
                >
                  <span>{{ item.sizeHuman }}</span>
                  <span class="font-mono uppercase">{{ item.extension }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 分页与统计控制条（常驻底栏顶部，让分页一目了然） -->
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-2.5 text-xs text-muted-foreground select-none"
        >
          <!-- 左侧条目统计与当前区间 -->
          <div class="flex items-center gap-2">
            <span>共 <strong class="font-semibold text-foreground">{{ total }}</strong> 项资源</span>
            <span class="text-border">|</span>
            <span>
              第 {{ page }} / {{ totalPages }} 页
              <span v-if="total > 0" class="text-[11px] opacity-75">
                (当前显示 {{ (page - 1) * pageSize + 1 }} - {{ Math.min(page * pageSize, total) }} 项)
              </span>
            </span>
          </div>

          <!-- 右侧分页控制器 -->
          <div class="flex flex-wrap items-center gap-1.5">
            <!-- 每页条数选择 -->
            <div class="flex items-center gap-1 mr-2">
              <span class="text-[11px]">每页</span>
              <select
                :value="pageSize"
                class="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground outline-none focus:border-primary"
                @change="onPageSizeChange"
              >
                <option :value="15">15 条</option>
                <option :value="30">30 条</option>
                <option :value="60">60 条</option>
              </select>
            </div>

            <!-- 首页 -->
            <button
              class="rounded border border-border bg-background px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="page <= 1"
              title="第一页"
              type="button"
              @click="onPageChange(1)"
            >
              首页
            </button>

            <!-- 上一页 -->
            <button
              class="rounded border border-border bg-background px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="page <= 1"
              title="上一页"
              type="button"
              @click="onPageChange(page - 1)"
            >
              上一页
            </button>

            <!-- 页码按钮 -->
            <template v-for="(p, idx) in visiblePages" :key="idx">
              <span v-if="p === '...'" class="px-1 text-muted-foreground">...</span>
              <button
                v-else
                class="min-w-6 rounded border px-2 py-0.5 text-xs font-medium transition-colors"
                :class="
                  p === page
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                "
                type="button"
                @click="onPageChange(p)"
              >
                {{ p }}
              </button>
            </template>

            <!-- 下一页 -->
            <button
              class="rounded border border-border bg-background px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="page >= totalPages"
              title="下一页"
              type="button"
              @click="onPageChange(page + 1)"
            >
              下一页
            </button>

            <!-- 末页 -->
            <button
              class="rounded border border-border bg-background px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="page >= totalPages"
              title="最后一页"
              type="button"
              @click="onPageChange(totalPages)"
            >
              末页
            </button>

            <!-- 快速跳页 -->
            <div class="flex items-center gap-1 ml-2">
              <span class="text-[11px]">跳至</span>
              <input
                v-model="jumpPageInput"
                class="w-12 rounded border border-border bg-background px-1 py-0.5 text-center text-xs text-foreground outline-none focus:border-primary"
                type="number"
                min="1"
                :max="totalPages"
                @keydown.enter.prevent="onJumpPage"
              />
              <span class="text-[11px]">页</span>
              <button
                class="rounded border border-border bg-background px-1.5 py-0.5 text-xs hover:bg-muted"
                type="button"
                @click="onJumpPage"
              >
                跳转
              </button>
            </div>
          </div>
        </div>

        <!-- 弹窗底栏操作区 -->
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-3"
        >
          <!-- 左侧已选提示 -->
          <div class="flex items-center gap-2 text-xs">
            <div v-if="selectedItem" class="flex items-center gap-1.5 text-primary font-medium">
              <span class="inline-block size-2 rounded-full bg-primary"></span>
              <span class="truncate max-w-md" :title="selectedItem.name">
                已选中: {{ selectedItem.name }} ({{ selectedItem.sizeHuman }})
              </span>
            </div>
            <div v-else class="text-muted-foreground">
              单击选择资源，双击直接插入
            </div>
          </div>

          <!-- 右侧操作按钮 -->
          <div class="flex items-center gap-2">
            <button
              class="rounded-md border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              type="button"
              @click="closeModal"
            >
              取消
            </button>
            <button
              class="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!selectedItem"
              type="button"
              @click="confirmSelect()"
            >
              确认插入
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
