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

import { message, Spin } from 'antdv-next';

import AppOffice from '#/components/AppOffice.vue';

const open = ref(false);
const document = ref(null);
const loading = ref(false);
const shouldLoad = ref(false);

// 监听 Drawer 打开状态，延迟加载组件
watch(open, (val) => {
  if (val && document.value) {
    // 延迟 300ms 后加载，让用户先看到 Drawer 动画
    setTimeout(() => {
      shouldLoad.value = true;
      loading.value = true;
    }, 300);
  } else if (!val) {
    // 关闭时重置，下次打开重新加载
    shouldLoad.value = false;
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
    title="记录预览"
    width="880px"
    destroy-on-close
  >
    <div v-if="document" class="relative h-[calc(100vh-120px)]">
      <!-- 加载状态 -->
      <div
        v-if="loading"
        class="absolute inset-0 flex items-center justify-center bg-white/80 z-10"
      >
        <Spin tip="正在加载文档预览..." size="large">
          <div class="h-32 w-48" />
        </Spin>
      </div>
      <!-- OnlyOffice 组件延迟加载 -->
      <AppOffice
        v-if="shouldLoad"
        :document="document"
        mode="view"
        @document-ready="onDocumentReady"
      />
    </div>
  </Drawer>
</template>
