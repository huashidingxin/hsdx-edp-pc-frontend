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
import { message } from 'antdv-next';

import AppOffice from '#/components/AppOffice.vue';

const open = ref(false);
const document = ref(null);

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
    <div v-if="document" class="h-[calc(100vh-120px)]">
      <AppOffice :document="document" mode="view" />
    </div>
  </Drawer>
</template>
