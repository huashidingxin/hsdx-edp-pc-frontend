<script setup>
/**
 * AppOffice —— OnlyOffice DocumentServer 文档编辑器封装（对齐 web-admin AppOffice.vue）
 *
 * 接入自部署 DocumentServer（VITE_OFFICE_URL 配置域名）：
 * - 在线编辑/查看 docx（打印模板编辑、已提交记录预览）
 * - plugins 注入（如 asc.formfields 表单字段面板）
 * - callbackUrl 保存编辑结果到后端
 */
import { computed } from 'vue';

import { DocumentEditor } from '@onlyoffice/document-editor-vue';

const emit = defineEmits(['document-ready', 'load-error']);

const props = defineProps({
  type: {
    type: String,
    default: 'desktop',
  },
  documentServerUrl: {
    type: String,
    default: import.meta.env.VITE_OFFICE_URL,
  },
  documentType: {
    type: String,
    default: 'word',
  },
  document: {
    type: Object,
    default: () => ({}),
  },
  lang: {
    type: String,
    default: 'zh-CN',
  },
  mode: {
    type: String,
    default: 'edit',
  },
  callbackUrl: {
    type: String,
    default: '',
  },
  user: {
    type: Object,
    default: () => ({ name: '系统', id: 1 }),
  },
  plugins: {
    type: Object,
    default: () => ({}),
  },
  customization: {
    type: Object,
    default: () => ({}),
  },
});

const defaultCustomization = {
  about: true,
  autosave: true,
  comments: false,
  compactHeader: false,
  compactToolbar: false,
  forcesave: true,
  help: true,
  hideRightMenu: true,
  integrationMode: 'embed',
  layout: {
    header: { editMode: true, save: true, users: true },
    toolbar: {
      collaboration: { mailmerge: true },
      draw: true,
      file: { close: true, info: true, save: true, settings: true },
      home: {},
      layout: true,
      plugins: true,
      protect: true,
      references: true,
      save: true,
      view: { navigation: true },
    },
  },
  macros: false,
  submitForm: { visible: true, resultMessage: 'text' },
  toolbarHideFileName: false,
  unit: 'cm',
  zoom: 100,
};

const config = computed(() => ({
  type: props.type,
  document: props.document,
  documentType: props.documentType,
  editorConfig: {
    lang: props.lang,
    mode: props.mode,
    callbackUrl: props.callbackUrl,
    user: props.user,
    plugins: props.plugins,
    customization: Object.assign(defaultCustomization, props.customization),
  },
  permission: { edit: true, download: true },
}));

function onDocumentReady() {
  console.log('Document is loaded');
  emit('document-ready');
}

function onLoadComponentError(errorCode, errorDescription) {
  console.error(`OnlyOffice 加载失败 (${errorCode}):`, errorDescription);
  emit('load-error', { code: errorCode, description: errorDescription });
}
</script>

<template>
  <DocumentEditor
    id="docEditor"
    :document-server-url="documentServerUrl"
    :config="config"
    :events_on-document-ready="onDocumentReady"
    :on-load-component-error="onLoadComponentError"
  />
</template>
