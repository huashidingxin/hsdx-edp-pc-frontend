<script setup>
/**
 * SubmissionPreviewDrawer —— 已提交记录 OnlyOffice 预览
 *
 * 用法：
 *   const previewRef = ref(null);
 *   // submission 需含 file_path（签名 URL）、code、id
 *   previewRef.value?.open(submission);
 *
 * 支持批量：previewRef.value?.open({ file_path, title, key })
 */
import { ref, watch } from 'vue';

import { Drawer, message, Spin } from 'antdv-next';

import AppOffice from '#/components/AppOffice.vue';

const open = ref(false);
const document = ref(null);
const loading = ref(false);

// 监听 Drawer 打开状态
watch(open, (val) => {
  if (!val) {
    // 关闭时重置状态
    loading.value = false;
    document.value = null;
  }
});

function onDocumentReady() {
  loading.value = false;
}

/**
 * @param {object} submission - 至少含 file_path，可选 code/id
 *   或直接传 { file_path, title, key } 用于批量预览
 */
function openPreview(submission) {
  if (!submission?.file_path) {
    message.warning('该记录未配置打印模板或渲染失败');
    return;
  }
  document.value = {
    fileType: 'docx',
    key: submission.key || `submission-${submission.id || Date.now()}`,
    url: submission.file_path,
    title: submission.title || `${submission.code || '记录'}.docx`,
  };
  open.value = true;
}

function close() {
  open.value = false;
}

defineExpose({ open: openPreview, close });
</script>

<template>
  <Drawer
    v-model:open="open"
    :header="null"
    :closable="false"
    width="880px"
    destroy-on-close
    class="submission-preview-drawer"
    :body-style="{ padding: 0, height: '100vh', display: 'flex', flexDirection: 'column' }"
  >
    <!-- 自定义顶部栏 -->
    <div class="flex h-11 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-700">
          {{ document?.title || '文档预览' }}
        </span>
      </div>
      <button
        class="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        @click="close"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <!-- 文档内容区 -->
    <div v-if="document" class="relative min-h-0 flex-1">
      <!-- 加载状态 -->
      <div
        v-if="loading"
        class="absolute inset-0 z-10 flex items-center justify-center bg-white/80"
      >
        <Spin tip="正在加载文档..." size="large">
          <div class="h-32 w-48" />
        </Spin>
      </div>
      <!-- OnlyOffice 组件 -->
      <AppOffice
        :document="document"
        mode="view"
        @document-ready="onDocumentReady"
      />
    </div>
  </Drawer>
</template>

<style scoped>
.submission-preview-drawer :deep(.ant-drawer-body) {
  padding: 0 !important;
}
.submission-preview-drawer :deep(.ant-drawer-content-wrapper) {
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
}
</style>
