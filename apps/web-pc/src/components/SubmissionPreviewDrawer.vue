<script setup>
/**
 * SubmissionPreviewDrawer —— 已提交记录预览
 *
 * 用法：
 *   const previewRef = ref(null);
 *   previewRef.value?.open(submission);
 *
 * submission 三种契约：
 *   1. 前端渲染（优先）：{ template_base64, render_data, code/id/title }
 *      —— 用 docx-handlebars WASM 在浏览器渲染，字节直接以 ArrayBuffer 交给
 *         OnlyOffice 纯前端打开（localOpenFromBinary），无需后端 URL，可下载。
 *   2. 服务端渲染兜底：{ file_path }（签名 URL，OnlyOffice 直接打开）
 *   3. 本地已合并的内存文档（批量打印）：{ buffer, blob, title, key, showSignature, reRender }
 *      —— reRender(withSignature) 重新渲染并合并整批，切换「显示签名」时触发；
 *         showSignature 与列表「包含签名」联动初始值。
 *
 * 事件：signatureChange(boolean) —— 预览内切换「显示签名」后向列表同步
 */
import { ref, watch } from 'vue';

import { Button, Checkbox, Drawer, message, Popover, Spin } from 'antdv-next';

import AppAttachmentPreview from '#/components/AppAttachmentPreview.vue';
import AppOnlyoffice from '#/components/AppOnlyoffice.vue';
import {
  downloadBlob,
  fetchFileBytes,
  renderSubmissionPayload,
  safeFileName,
  uniqueFileName,
  zipFiles,
} from '#/utils/render-docx';

const emit = defineEmits(['signatureChange']);

const open = ref(false);
const previewDocument = ref(null);
const loading = ref(false);
const rendering = ref(false);
const renderedBlob = ref(null);
const attachmentDownloading = ref(false);
const activeAttachment = ref(null);
/** 当前预览附件在附件列表中的索引（独立预览层切换用） */
const activeAttachmentIndex = ref(null);
const attachmentsOpen = ref(false);
/** 当前预览上下文（用于勾选「显示签名」后重新渲染/合并） */
const currentSubmission = ref(null);
/** 是否显示手写签名，默认不显示 */
const showSignature = ref(false);
/**
 * 渲染请求序号：openPreview/openWithClientRender 每次启动渲染自增，
 * 渲染完成后若序号已被新的请求覆盖（期间打开/切换了其他记录），丢弃旧结果，
 * 避免向 OnlyOffice 连续下发两份 config 触发 x2t 转换竞态。
 */
let renderRequestId = 0;

// 监听 Drawer 打开状态
watch(open, (val) => {
  if (!val) {
    // 关闭时作废在途渲染，避免渲染完成后 Drawer 被重新打开
    renderRequestId += 1;
    // 关闭时重置状态
    loading.value = false;
    rendering.value = false;
    previewDocument.value = null;
    renderedBlob.value = null;
    attachmentDownloading.value = false;
    activeAttachment.value = null;
    activeAttachmentIndex.value = null;
    attachmentsOpen.value = false;
    attachments.value = [];
    currentSubmission.value = null;
    showSignature.value = false;
  }
});

function onDocumentReady() {
  loading.value = false;
  rendering.value = false;
}

function onLoadError() {
  loading.value = false;
  rendering.value = false;
}

function baseTitle(submission) {
  return submission?.title || `${submission?.code || '记录'}.docx`;
}

function baseKey(submission) {
  return submission?.key || `submission-${submission?.id || Date.now()}`;
}

async function openWithClientRender(submission) {
  const requestId = ++renderRequestId;
  rendering.value = true;
  loading.value = true;
  try {
    const blob = await renderSubmissionPayload(
      submission.template_base64,
      submission.render_data,
      { withSignature: showSignature.value },
    );
    // 渲染期间已打开/切换其他记录，丢弃本次结果（对应渲染已作废，不再下发 config）
    if (requestId !== renderRequestId) {
      return;
    }
    // 纯前端预览：渲染字节直接以 ArrayBuffer 交给 OnlyOffice（localOpenFromBinary），
    // 无需回传后端换取 URL。Blob 同时保留用于「下载」。
    const buffer = await blob.arrayBuffer();
    if (requestId !== renderRequestId) {
      return;
    }
    renderedBlob.value = blob;
    previewDocument.value = {
      fileType: 'docx',
      key: baseKey(submission),
      title: baseTitle(submission),
      buffer,
    };
    open.value = true;
  } catch (error) {
    console.error('前端渲染失败:', error);
    message.error(error?.message || '文档渲染失败');
    loading.value = false;
    rendering.value = false;
  }
}

/**
 * @param {object} submission - 至少含 template_base64+render_data，或 file_path（签名 URL），
 *                              或已渲染的内存文档 { buffer, blob, title, key, showSignature, reRender }
 */
function openPreview(submission) {
  if (!submission) {
    return;
  }
  // 每次打开都作废在途渲染，确保最终只有最新一次结果下发 OnlyOffice
  renderRequestId += 1;
  // 列表「包含签名」与预览「显示签名」联动初始值
  if (typeof submission.showSignature === 'boolean') {
    showSignature.value = submission.showSignature;
  }
  loadAttachments(submission);
  // 本地已渲染/合并完成的内存文档（批量打印结果，直接交给 OnlyOffice 打开）；
  // 切换「显示签名」时通过 reRender 重新渲染并合并整批
  if (submission.buffer instanceof ArrayBuffer) {
    currentSubmission.value = submission;
    renderedBlob.value = submission.blob || new Blob([submission.buffer]);
    previewDocument.value = {
      fileType: 'docx',
      key: baseKey(submission),
      title: baseTitle(submission),
      buffer: submission.buffer,
    };
    open.value = true;
    return;
  }
  currentSubmission.value = submission;
  // 优先前端渲染
  if (submission.template_base64 && submission.render_data) {
    openWithClientRender(submission);
    return;
  }
  // 兜底：服务端已渲染的签名 URL
  if (!submission.file_path) {
    message.warning('该记录未配置打印模板或渲染失败');
    return;
  }
  loading.value = true;
  previewDocument.value = {
    fileType: 'docx',
    key: baseKey(submission),
    url: submission.file_path,
    title: baseTitle(submission),
  };
  open.value = true;
}

const attachments = ref([]);

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function loadAttachments(submission) {
  attachments.value = Array.isArray(submission?.attachments)
    ? submission.attachments.filter((item) => item?.url)
    : [];
  attachmentsOpen.value = false;
}

function attachmentDownloadTarget(attachment) {
  return attachment?.url;
}

function previewAttachment(attachment) {
  const index = attachments.value.indexOf(attachment);
  attachmentsOpen.value = false;
  activeAttachmentIndex.value = index === -1 ? null : index;
  activeAttachment.value = attachment;
}

function closeAttachmentPreview() {
  activeAttachment.value = null;
  activeAttachmentIndex.value = null;
}

function changeAttachment(index) {
  const attachment = attachments.value[index];
  if (!attachment) return;
  activeAttachmentIndex.value = index;
  activeAttachment.value = attachment;
}

async function download() {
  if (activeAttachment.value) {
    await downloadAttachment(activeAttachment.value);
    return;
  }
  let renderedBytes;
  if (renderedBlob.value) {
    renderedBytes = new Uint8Array(await renderedBlob.value.arrayBuffer());
  } else if (previewDocument.value?.url) {
    try {
      renderedBytes = await fetchFileBytes(previewDocument.value.url);
    } catch (error) {
      console.error('下载渲染结果失败:', error);
      message.error('渲染结果下载失败');
      return;
    }
  } else {
    return;
  }
  const files = {
    [safeFileName(previewDocument.value?.title || '渲染结果.docx')]:
      renderedBytes,
  };
  const usedNames = new Set(Object.keys(files));
  for (const attachment of attachments.value) {
    try {
      const name = uniqueFileName(attachment.name || '附件', usedNames);
      files[name] = await fetchFileBytes(attachmentDownloadTarget(attachment));
    } catch (error) {
      console.error('下载附件失败:', error);
      message.warning(`附件“${attachment.name || '未命名'}”下载失败，已跳过`);
    }
  }
  const zip = zipFiles(files);
  downloadBlob(
    zip,
    `${safeFileName(previewDocument.value?.title || '记录')}.zip`,
  );
}

async function downloadAttachment(attachment) {
  if (attachmentDownloading.value) return;
  attachmentDownloading.value = true;
  try {
    const bytes = await fetchFileBytes(attachmentDownloadTarget(attachment));
    downloadBlob(new Blob([bytes]), safeFileName(attachment.name || '附件'));
  } catch (error) {
    console.error('下载附件失败:', error);
    message.error('附件下载失败');
  } finally {
    attachmentDownloading.value = false;
  }
}

/** 勾选/取消「显示签名」：合并文档走 reRender 重渲染合并；前端渲染的记录重新渲染；服务端渲染的无法切换 */
async function onShowSignatureChange() {
  const submission = currentSubmission.value;
  if (!open.value || !submission || loading.value || rendering.value) {
    return;
  }
  emit('signatureChange', showSignature.value);
  // 批量打印的合并文档：重新渲染并合并整批，刷新当前 OnlyOffice 打开的字节
  if (typeof submission.reRender === 'function') {
    rendering.value = true;
    try {
      const { blob, buffer } = await submission.reRender(showSignature.value);
      renderedBlob.value = blob;
      previewDocument.value = { ...previewDocument.value, buffer };
    } catch (error) {
      console.error('重新渲染合并文档失败:', error);
      message.error(error?.message || '重新渲染失败');
      showSignature.value = !showSignature.value;
      emit('signatureChange', showSignature.value);
    } finally {
      rendering.value = false;
    }
    return;
  }
  if (!submission.template_base64) {
    message.warning('服务端渲染的文档无法切换签名显示');
    showSignature.value = !showSignature.value;
    emit('signatureChange', showSignature.value);
    return;
  }
  await openWithClientRender(submission);
}

function close() {
  open.value = false;
}

defineExpose({ open: openPreview, close });
</script>

<template>
  <div>
  <Drawer
    :open="open && !activeAttachment"
    :header="null"
    :closable="false"
    width="880px"
    destroy-on-close
    class="submission-preview-drawer"
    :body-style="{
      padding: 0,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
    }"
  >
    <!-- 自定义顶部栏 -->
    <div
      class="flex h-11 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4"
    >
      <div class="flex items-center gap-2">
        <span class="truncate text-sm font-medium text-gray-700">
          {{ previewDocument?.title || '文档预览' }}
        </span>
      </div>
      <div class="flex items-center gap-3">
        <Popover
          v-if="attachments.length"
          v-model:open="attachmentsOpen"
          trigger="click"
          placement="bottomRight"
          :destroy-on-hidden="true"
        >
          <Button size="small" class="!h-7 !px-2 !text-xs">
            附件（{{ attachments.length }}）
          </Button>
          <template #content>
            <div class="w-[420px] max-w-[calc(100vw-48px)]">
              <div class="mb-2 text-xs font-medium text-gray-500">表单附件</div>
              <div class="flex max-h-72 flex-col gap-1 overflow-y-auto">
                <div
                  v-for="attachment in attachments"
                  :key="`${attachment.field_id}-${attachment.name}-${attachment.url}`"
                  class="flex min-w-0 items-center gap-2 rounded px-1 py-1 hover:bg-gray-50"
                >
                  <button
                    class="flex min-w-0 flex-1 items-center gap-1 text-left text-xs text-gray-700 hover:text-blue-600"
                    :title="`${attachment.field_name}：${attachment.name}`"
                    @click="previewAttachment(attachment)"
                  >
                    <span class="max-w-24 shrink-0 truncate text-gray-400">{{
                      attachment.field_name
                    }}</span>
                    <span class="min-w-0 truncate">{{ attachment.name }}</span>
                  </button>
                  <span class="shrink-0 text-xs text-gray-400">{{
                    formatFileSize(attachment.size)
                  }}</span>
                  <Button
                    type="link"
                    size="small"
                    :loading="attachmentDownloading"
                    class="!h-5 !px-1 !text-xs"
                    @click="downloadAttachment(attachment)"
                  >
                    下载
                  </Button>
                </div>
              </div>
            </div>
          </template>
        </Popover>
        <Checkbox
          v-model:checked="showSignature"
          @change="onShowSignatureChange"
        >
          显示签名
        </Checkbox>
        <button
          class="flex h-7 items-center gap-1 rounded-md border border-gray-200 px-2 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-700"
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
          @click="close"
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
    <!-- 文档内容区 -->
    <div v-if="previewDocument" class="relative min-h-0 flex-1">
      <!-- 加载状态 -->
      <div
        v-if="loading"
        class="absolute inset-0 z-10 flex items-center justify-center bg-white/80"
      >
        <Spin
          :tip="rendering ? '正在渲染文档...' : '正在加载文档...'"
          size="large"
        >
          <div class="h-32 w-60"></div>
        </Spin>
      </div>
      <!-- OnlyOffice 组件 -->
      <AppOnlyoffice
        :document="previewDocument"
        mode="view"
        stream-fallback="download"
        @document-ready="onDocumentReady"
        @load-error="onLoadError"
      />
    </div>
  </Drawer>

  <!-- 附件预览时隐藏外层记录抽屉，保持单一预览容器、标题和关闭按钮。 -->
  <AppAttachmentPreview
    :open="!!activeAttachment"
    :attachments="attachments"
    :active-index="activeAttachmentIndex"
    @close="closeAttachmentPreview"
    @change="changeAttachment"
  />
  </div>
</template>

<style scoped>
.submission-preview-drawer :deep(.ant-drawer-body) {
  padding: 0 !important;
}

.submission-preview-drawer :deep(.ant-drawer-content-wrapper) {
  box-shadow: -4px 0 24px rgb(0 0 0 / 12%);
}
</style>
