<script setup>
/**
 * AppAttachmentPreview —— 表单附件独立预览层
 *
 * 独立于记录预览抽屉弹出（避免误关整个预览）；关闭返回时不影响主文档，
 * 主抽屉的 OnlyOffice 文档不会被重新渲染。
 *
 * 支持在预览窗口内直接切换所有附件：上一个/下一个按钮 + 附件列表。
 *
 * 预览能力（附件直接使用 url，跨域由文件服务器 CORS 配置解决）：
 *   - 图片（jpg/png/gif/webp/bmp/svg/avif 等）：直接大图展示
 *   - PDF：交给浏览器原生 PDF 查看器
 *   - Word / Excel / PPT / ODF：复用 OnlyOffice 预览（字节以 buffer 传入）
 *   - 其他类型：提示无法在线预览 + 下载按钮
 */
import { ref, watch } from 'vue';

import { Button, Drawer, message, Spin } from 'antdv-next';

import AppOnlyoffice from '#/components/AppOnlyoffice.vue';
import {
  downloadBlob,
  fetchFileBytes,
  safeFileName,
} from '#/utils/render-docx';

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  attachments: {
    type: Array,
    default: () => [],
  },
  activeIndex: {
    type: Number,
    default: null,
  },
});

const emit = defineEmits(['close', 'change']);

const loading = ref(false);
/** image / office / unsupported */
const previewKind = ref(null);
/** 图片 URL（直连 CDN/OSS） */
const imageUrl = ref('');
/** OnlyOffice 预览文档 */
const officeDocument = ref(null);
const downloading = ref(false);

const attachment = () => props.attachments?.[props.activeIndex] ?? null;
const total = () => props.attachments?.length || 0;

function fileType(att) {
  return String(att?.extension || att?.name || '')
    .split('?')[0]
    .split('.')
    .pop()
    .toLowerCase();
}

function isImage(att) {
  return ['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'].includes(
    fileType(att),
  );
}

function isOffice(att) {
  return [
    'doc',
    'docx',
    'odp',
    'ods',
    'odt',
    'ppt',
    'pptx',
    'xls',
    'xlsx',
  ].includes(fileType(att));
}

function attachmentUrl(att) {
  return att?.url;
}

function isPdf(att) {
  return fileType(att) === 'pdf';
}

function reset() {
  loading.value = false;
  previewKind.value = null;
  officeDocument.value = null;
  imageUrl.value = '';
}

async function load(att) {
  reset();
  if (!props.open || !att) {
    return;
  }
  loading.value = true;
  try {
    if (isPdf(att)) {
      imageUrl.value = attachmentUrl(att);
      previewKind.value = 'pdf';
      return;
    }
    if (isImage(att)) {
      imageUrl.value = attachmentUrl(att);
      previewKind.value = 'image';
      return;
    }
    if (isOffice(att)) {
      const bytes = await fetchFileBytes(attachmentUrl(att));
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
      officeDocument.value = {
        fileType: fileType(att),
        key: `attachment-${att.field_id}-${att.name}`,
        title: safeFileName(att.name || '附件'),
        buffer,
      };
      previewKind.value = 'office';
      return;
    }
    previewKind.value = 'unsupported';
  } catch (error) {
    console.error('附件预览失败:', error);
    previewKind.value = 'unsupported';
    message.error('附件预览加载失败，可下载查看');
  } finally {
    loading.value = false;
  }
}

// 打开抽屉 / 切换附件索引时加载对应附件
watch(
  () => [props.open, props.activeIndex],
  () => {
    if (!props.open) {
      reset();
      return;
    }
    load(attachment());
  },
  { immediate: true },
);

function goPrev() {
  if (total() <= 1) return;
  const next = ((props.activeIndex ?? 0) - 1 + total()) % total();
  emit('change', next);
}

function goNext() {
  if (total() <= 1) return;
  const next = ((props.activeIndex ?? 0) + 1) % total();
  emit('change', next);
}

function goTo(index) {
  if (index === props.activeIndex) return;
  emit('change', index);
}

async function download() {
  const att = attachment();
  if (!att || downloading.value) return;
  downloading.value = true;
  try {
    const bytes = await fetchFileBytes(attachmentUrl(att));
    downloadBlob(new Blob([bytes]), safeFileName(att.name || '附件'));
  } catch (error) {
    console.error('附件下载失败:', error);
    message.error('附件下载失败');
  } finally {
    downloading.value = false;
  }
}

defineExpose({ reset });
</script>

<template>
  <Drawer
    :open="open"
    :header="null"
    :closable="false"
    width="880px"
    destroy-on-close
    class="app-attachment-preview"
    :body-style="{
      padding: 0,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
    }"
  >
    <!-- 顶部栏 -->
    <div
      class="flex h-11 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4"
    >
      <div class="flex min-w-0 items-center gap-2">
        <button
          class="text-xs text-blue-600 hover:text-blue-800"
          @click="emit('close')"
        >
          ← 返回记录预览
        </button>
        <span class="truncate text-sm font-medium text-gray-700">
          {{ safeFileName(attachment()?.name || '附件预览') }}
        </span>
        <span v-if="total() > 1" class="shrink-0 text-xs text-gray-400">
          {{ (activeIndex ?? 0) + 1 }} / {{ total() }}
        </span>
      </div>
      <div class="flex items-center gap-3">
        <!-- 上一个 / 下一个 -->
        <template v-if="total() > 1">
          <button
            class="flex h-7 items-center gap-1 rounded-md border border-gray-200 px-2 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-700"
            @click="goPrev"
          >
            ← 上一个
          </button>
          <button
            class="flex h-7 items-center gap-1 rounded-md border border-gray-200 px-2 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-700"
            @click="goNext"
          >
            下一个 →
          </button>
        </template>
        <button
          class="flex h-7 items-center gap-1 rounded-md border border-gray-200 px-2 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-700"
          :disabled="downloading"
          @click="download"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          下载
        </button>
        <button
          class="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          @click="emit('close')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
    <!-- 内容区 -->
    <div class="relative min-h-0 flex-1">
      <div
        v-if="loading"
        class="absolute inset-0 z-10 flex items-center justify-center bg-white/80"
      >
        <Spin tip="正在加载附件..." size="large">
          <div class="h-32 w-60"></div>
        </Spin>
      </div>
      <!-- 图片 -->
      <div
        v-if="previewKind === 'image' && imageUrl"
        class="flex h-full items-center justify-center overflow-auto bg-gray-100 p-4"
      >
        <img
          :src="imageUrl"
          :alt="attachment()?.name || '附件'"
          class="max-h-full max-w-full rounded shadow"
        />
      </div>
      <!-- PDF：使用浏览器原生 PDF 查看器 -->
      <iframe
        v-else-if="previewKind === 'pdf'"
        :src="imageUrl"
        class="h-full w-full border-0"
        title="PDF 预览"
      ></iframe>
      <!-- 无法在线预览 -->
      <div
        v-else-if="previewKind === 'unsupported'"
        class="flex h-full flex-col items-center justify-center gap-4 bg-gray-50"
      >
        <div class="text-5xl">📄</div>
        <div class="text-sm text-gray-500">
          该文件类型（.{{ fileType(attachment()) }}）暂不支持在线预览
        </div>
        <Button type="primary" :loading="downloading" @click="download">
          下载文件
        </Button>
      </div>
      <!-- OnlyOffice -->
      <AppOnlyoffice
        v-else-if="previewKind === 'office' && officeDocument"
        :key="officeDocument.key"
        :document="officeDocument"
        mode="view"
        stream-fallback="download"
      />
    </div>
    <!-- 附件列表（点击直接切换） -->
    <div
      v-if="total() > 1"
      class="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-t border-gray-200 bg-white px-3"
    >
      <span class="shrink-0 text-xs text-gray-400">附件</span>
      <button
        v-for="(att, index) in attachments"
        :key="`${att.field_id}-${att.name}-${att.url}`"
        class="flex h-7 max-w-44 shrink-0 items-center gap-1 rounded-md border px-2 text-xs transition-colors"
        :class="
          index === activeIndex
            ? 'border-blue-500 bg-blue-50 text-blue-600'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        "
        :title="`${att.field_name}：${att.name}`"
        @click="goTo(index)"
      >
        <span class="truncate">{{ att.field_name }}</span>
        <span class="truncate text-gray-400">{{ att.name }}</span>
      </button>
    </div>
  </Drawer>
</template>

<style scoped>
.app-attachment-preview :deep(.ant-drawer-body) {
  padding: 0 !important;
}

.app-attachment-preview :deep(.ant-drawer-content-wrapper) {
  box-shadow: -4px 0 24px rgb(0 0 0 / 12%);
}
</style>
