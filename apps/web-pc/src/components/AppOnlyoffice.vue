<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { useUserStore } from '@vben/stores';

const props = defineProps({
  resourceUrl: {
    type: String,
    default: () => import.meta.env.VITE_ONLYOFFICE_URL || DEFAULT_RESOURCE_URL,
  },
  document: {
    type: Object,
    default: () => ({}),
  },
  documentType: {
    type: String,
    default: '',
  },
  mode: {
    type: String,
    default: 'edit',
  },
  lang: {
    type: String,
    default: 'zh-CN',
  },
  config: {
    type: Object,
    default: () => ({}),
  },
  streamFallback: {
    type: String,
    default: 'autosave',
  },
  height: {
    type: [String, Number],
    default: '100%',
  },
  width: {
    type: [String, Number],
    default: '100%',
  },
  loadingText: {
    type: String,
    default: '正在加载文档…',
  },
  saveTimeout: {
    type: Number,
    default: 30_000,
  },
  commandTimeout: {
    type: Number,
    default: 15_000,
  },
  debug: {
    type: Boolean,
    // 默认开启，便于排查跨域 iframe 与 connector 通讯；生产环境可传 :debug="false"。
    default: true,
  },
  fields: {
    type: Array,
    default: () => [],
  },
  fieldPanel: {
    type: Boolean,
    default: false,
  },
  fieldPanelTitle: {
    type: String,
    default: '模板字段',
  },
  fieldPanelWidth: {
    type: [String, Number],
    default: 200,
  },
});

const emit = defineEmits([
  'ready',
  'document-ready',
  'saved',
  'autosave',
  'save-as',
  'save-as-error',
  'rename',
  'state-change',
  'request-close',
  'command-result',
  'connector-ready',
  'connector-error',
  'field-select',
  'field-insert-error',
  'load-error',
]);

// bridge 协议变更后主动更新缓存键，避免继续加载旧版 onlyoffice.html。
const DEFAULT_RESOURCE_URL =
  'https://dev.cpzhongzhou.com/onlyoffice.html?v=1.8';

const userStore = useUserStore();

const frame = ref(null);
const frameReady = ref(false);
const documentReady = ref(false);
const connectorReady = ref(false);
const connectorErrorMessage = ref('');
const loadError = ref('');
const modified = ref(false);
const saveSeq = ref(0);
const commandSeq = ref(0);
const expandedKeys = ref(new Set());
const pendingSaves = new Map();
const pendingCommands = new Map();
let connectorCommandQueue = Promise.resolve();
let fieldInsertSeq = 0;
/** iframe 重载序号：切换文档或转换失败重试时强制重新加载 iframe，获得全新 SDK 环境 */
const frameBust = ref(0);
/** pushConfig 防抖定时器（合并连续文档变更，减少 iframe 内 destroy+new 频率） */
let pushConfigTimer = null;
/** 已下发文档指纹（key|url|mode），配合 buffer 引用避免重复下发同一文档 */
let lastSentFingerprint = '';
/** 已下发文档的 buffer 引用，用于区分同 key 下重渲染产生的新字节 */
let lastSentBufferRef = null;
/** 单个文档生命周期内转换失败自动重试次数（最多 1 次） */
let openRetryCount = 0;
/** 最近一次下发文档的 key，用于判断是否切换到了新文档 */
let lastDocumentKey = null;
const fieldAction = ref({ key: '', state: 'idle', message: '' });
const loopMenuKey = ref('');

const frameSrc = computed(() => {
  const base = props.resourceUrl || DEFAULT_RESOURCE_URL;
  if (!frameBust.value) return base;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}bust=${frameBust.value}`;
});
const officeUser = computed(() => {
  const info = userStore.userInfo || {};
  const name = info.realName || info.name || info.username || '系统用户';
  const id = info.userId ?? info.id ?? info.username ?? 'system-user';
  return {
    id: String(id),
    name: String(name),
  };
});
const frameOrigin = computed(() => {
  try {
    return new URL(frameSrc.value, window.location.href).origin;
  } catch {
    return '*';
  }
});
const trustedFrameOrigins = new Set([
  'https://www.cpzhongzhou.com',
  'https://dev.cpzhongzhou.com',
  'https://onlyoffice.cpzhongzhou.com',
]);
const debugEnabled = computed(() => props.debug || import.meta.env.DEV);

function logOnlyoffice(level, ...args) {
  if (!debugEnabled.value && level !== 'error') return;
  const logger = console[level] || console.log;
  logger.call(console, `[AppOnlyoffice:${level}]`, ...args);
}

const shellStyle = computed(() => ({
  width: toCssSize(props.width),
  height: toCssSize(props.height),
  '--onlyoffice-field-panel-width': toCssSize(props.fieldPanelWidth),
}));

const visibleFields = computed(() => flattenFields(props.fields));

function toCssSize(value) {
  if (typeof value === 'number') return `${value}px`;
  return value || '100%';
}

function toFieldKey(field, path = '') {
  return String(field?.key || field?.id || path);
}

function fieldVariableName(field) {
  const key = String(field?.key || field?.field || field?.id || '');
  if (!key) return '';
  // 渲染入口已把 render_data.fields 合并到一级（{...render_data, ...render_data.fields}），
  // 表单字段直接取自身 key；列表子字段在 {{#each _ID}} 循环体内也用当前项上下文取 {{ _ID }}。
  return key;
}

function fieldTitle(field) {
  const name = String(field?.name || field?.key || '字段');
  const variable = fieldVariableName(field);
  if (!variable) return name;
  return `${name}\n变量：{{ ${variable} }}`;
}

function collectExpandableKeys(nodes, path = '', result = []) {
  (nodes || []).forEach((field, index) => {
    const key = toFieldKey(field, `${path}-${index}`);
    if (field.children?.length) {
      result.push(key);
      collectExpandableKeys(field.children, key, result);
    }
  });
  return result;
}

function flattenFields(nodes, depth = 0, path = '') {
  const result = [];
  (nodes || []).forEach((field, index) => {
    const key = toFieldKey(field, `${path}-${index}`);
    const hasChildren =
      Array.isArray(field.children) && field.children.length > 0;
    result.push({ field, depth, key, hasChildren });
    if (hasChildren && expandedKeys.value.has(key)) {
      result.push(...flattenFields(field.children, depth + 1, key));
    }
  });
  return result;
}

watch(
  () => props.fields,
  (fields) => {
    expandedKeys.value = new Set(collectExpandableKeys(fields));
    loopMenuKey.value = '';
  },
  { deep: true, immediate: true },
);

function toggleField(fieldKey) {
  const next = new Set(expandedKeys.value);
  const expanded = next.has(fieldKey);
  if (expanded) next.delete(fieldKey);
  else next.add(fieldKey);
  expandedKeys.value = next;
  logOnlyoffice('info', '切换字段分组', {
    fieldKey,
    expanded: !expanded,
  });
}

function isFrameMessage(event) {
  if (!frame.value || event.source !== frame.value.contentWindow) return false;
  const accepted =
    frameOrigin.value === '*' ||
    event.origin === frameOrigin.value ||
    trustedFrameOrigins.has(event.origin);
  if (!accepted && event.data?.type?.startsWith?.('onlyoffice-')) {
    logOnlyoffice('warn', '拒绝 iframe 消息：origin 不受信任', {
      eventOrigin: event.origin,
      expectedOrigin: frameOrigin.value,
      type: event.data.type,
    });
  }
  return accepted;
}

function postToFrame(message) {
  if (!frame.value?.contentWindow) {
    throw new Error('OnlyOffice iframe 未就绪');
  }
  // 跨域静态页统一使用 postMessage；回包仍通过 event.source + origin 校验。
  logOnlyoffice('info', '宿主 → iframe', message);
  frame.value.contentWindow.postMessage(message, '*');
}

function deepMerge(target, source) {
  const result = Array.isArray(target) ? [...target] : { ...target };
  Object.keys(source || {}).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = result[key];
    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else {
      result[key] = sourceValue;
    }
  });
  return result;
}

function inferFileType(document) {
  const source = document?.fileType || document?.title || document?.url || '';
  const match = String(source)
    .split('?')[0]
    .match(/\.([a-z0-9]+)$/i);
  return (match?.[1] || 'docx').toLowerCase();
}

function inferDocumentType(fileType) {
  const type = String(fileType || '').toLowerCase();
  if (['csv', 'ods', 'xls', 'xlsm', 'xlsx'].includes(type)) return 'cell';
  if (['odp', 'pps', 'ppsx', 'ppt', 'pptx'].includes(type)) return 'slide';
  if (type === 'pdf') return 'pdf';
  return 'word';
}

function hashKey(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.codePointAt(index);
    hash |= 0;
  }
  return `doc-${Math.abs(hash)}`;
}

function fileNameOf(document, fileType) {
  if (document?.title) return document.title;
  const path = String(document?.url || '').split('?')[0];
  const name = path.split('/').pop();
  return name || `文档.${fileType}`;
}

function absoluteDocumentUrl(url) {
  if (!url || /^(?:https?:|blob:|data:)/i.test(String(url))) return url;
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

// 归一化为 ArrayBuffer：仅支持 ArrayBuffer / TypedArray，Blob 由调用方先 arrayBuffer() 化。
function toArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    );
  }
  return value;
}

function buildConfig() {
  const sourceDocument = props.document || {};
  const hasBuffer = !!sourceDocument.buffer;
  // 纯前端二进制模式：字节经 openBuffer 传给 iframe，由 onlyoffice.html 在 iframe 内
  // 转成 blob URL 作为 document.url 加载（本地 blob，无后端 URL 依赖）。
  const documentUrl = hasBuffer
    ? sourceDocument.url
    : absoluteDocumentUrl(sourceDocument.url);
  const fileType = inferFileType(sourceDocument);
  const title = fileNameOf(sourceDocument, fileType);

  // buffer 单独走 openBuffer 消息，不放进 document 配置。
  const restDocument = { ...sourceDocument };
  delete restDocument.buffer;
  const documentConfig = {
    ...restDocument,
    url: documentUrl || undefined,
    title,
    fileType,
    key:
      sourceDocument.key ||
      hashKey(`${sourceDocument.url || ''}|${title}|${fileType}`),
    permissions: {
      // 下载按钮保持可用（下载的文件流由宿主按需处理）
      download: sourceDocument.permissions?.download !== false,
      print: true,
      ...sourceDocument.permissions,
      edit: props.mode !== 'view' && sourceDocument.permissions?.edit !== false,
    },
  };

  const baseConfig = {
    document: documentConfig,
    documentType: props.documentType || inferDocumentType(fileType),
    editorConfig: {
      mode: props.mode === 'view' ? 'view' : 'edit',
      lang: props.lang,
      user: officeUser.value,
    },
    customization: {
      // 默认隐藏 OnlyOffice 左侧面板（工具栏左侧导航），业务方可经 config 覆盖
      layoutOptions: {
        leftPanel: false,
      },
    },
    streamFallback: props.streamFallback,
    height: '100%',
    width: '100%',
  };

  return deepMerge(baseConfig, props.config);
}

function onFrameLoad() {
  logOnlyoffice('info', 'iframe load 事件', {
    frameReady: frameReady.value,
    src: frameSrc.value,
  });
  if (frameReady.value) pushConfig();
}

function pushConfig(force = false) {
  if (!frameReady.value) return;
  const sourceDocument = props.document || {};
  const hasUrl = !!sourceDocument.url;
  const hasBuffer = !!sourceDocument.buffer;
  if (!hasUrl && !hasBuffer) return;
  // 同一文档（key+url+mode）且字节引用未变化时不再重复下发，
  // 避免重复打开同一文档导致 iframe 内 destroy+new 的 x2t 转换竞态。
  const fingerprint = [
    sourceDocument.key || '',
    sourceDocument.url || '',
    props.mode,
  ].join('|');
  if (
    !force &&
    fingerprint &&
    fingerprint === lastSentFingerprint &&
    sourceDocument.buffer === lastSentBufferRef
  ) {
    return;
  }
  lastSentFingerprint = fingerprint;
  lastSentBufferRef = sourceDocument.buffer;
  documentReady.value = false;
  connectorReady.value = false;
  connectorErrorMessage.value = '';
  loadError.value = '';
  try {
    const config = buildConfig();
    const message = { type: 'onlyoffice-config', docConfig: config };
    if (hasBuffer) {
      message.openBuffer = toArrayBuffer(sourceDocument.buffer);
    }
    logOnlyoffice('info', '发送 OnlyOffice 文档配置', {
      title: config.document?.title,
      fileType: config.document?.fileType,
      key: config.document?.key,
      mode: config.editorConfig?.mode,
      user: config.editorConfig?.user,
      origin: frameOrigin.value,
      openBuffer: hasBuffer,
      openBufferBytes: hasBuffer ? message.openBuffer?.byteLength : 0,
    });
    postToFrame(message);
  } catch (error) {
    loadError.value = error.message || 'OnlyOffice 配置发送失败';
    logOnlyoffice('error', '发送文档配置失败', error);
    emit('load-error', error);
  }
}

/**
 * 防抖合并连续文档变更：同一文档的多次小幅更新（如重渲染 buffer）只下发最后一次，
 * 拉开 iframe 内 destroyEditor → new DocEditor 的间隔，规避 x2t 转换竞态。
 */
function schedulePushConfig() {
  if (pushConfigTimer) clearTimeout(pushConfigTimer);
  pushConfigTimer = window.setTimeout(() => {
    pushConfigTimer = null;
    pushConfig();
  }, 150);
}

/**
 * 重新加载 iframe，以全新 SDK 环境打开当前文档。
 * OnlyOffice 在同一 iframe 内连续 destroy+new DocEditor 偶发状态残留导致
 * “Document conversion failed”（x2t 转换器内部崩溃），重载 iframe 可彻底规避；
 * 新 iframe 就绪（onlyoffice-ready）后会自动下发当前 document 配置。
 */
function reloadFrame() {
  lastSentFingerprint = '';
  lastSentBufferRef = null;
  frameReady.value = false;
  documentReady.value = false;
  connectorReady.value = false;
  connectorErrorMessage.value = '';
  loadError.value = '';
  frameBust.value += 1;
}

function onMessage(event) {
  if (!isFrameMessage(event)) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  logOnlyoffice('info', 'iframe → 宿主', data);

  switch (data.type) {
    case 'onlyoffice-command-error': {
      handleCommandResult({ ...data, ok: false });
      break;
    }
    case 'onlyoffice-command-response':
    case 'onlyoffice-command-result':
    case 'onlyoffice-connector-result': {
      handleCommandResult(data);
      break;
    }
    case 'onlyoffice-connector-error': {
      connectorReady.value = false;
      connectorErrorMessage.value = data.error || 'OnlyOffice connector 不可用';
      logOnlyoffice(
        'error',
        'OnlyOffice connector 不可用',
        connectorErrorMessage.value,
      );
      emit('connector-error', connectorErrorMessage.value);
      break;
    }
    case 'onlyoffice-connector-ready': {
      connectorReady.value = true;
      connectorErrorMessage.value = '';
      logOnlyoffice('info', 'OnlyOffice connector 已就绪');
      emit('connector-ready');
      break;
    }
    case 'onlyoffice-document-ready': {
      documentReady.value = true;
      loadError.value = '';
      logOnlyoffice('info', 'OnlyOffice 文档已就绪，主动检查 connector');
      // 让 bridge 在 onDocumentReady 没有主动上报时也能完成一次 connector 握手。
      try {
        postToFrame({ type: 'onlyoffice-connector-ping' });
      } catch (error) {
        connectorErrorMessage.value =
          error.message || 'OnlyOffice connector 握手失败';
        logOnlyoffice('error', 'connector 握手消息发送失败', error);
        emit('connector-error', connectorErrorMessage.value);
      }
      emit('document-ready');
      break;
    }
    case 'onlyoffice-error':
    case 'onlyoffice-open-error': {
      loadError.value = data.error || 'OnlyOffice 加载失败';
      // x2t 文档转换偶发失败（Document conversion failed）时，重载 iframe
      // 以全新 SDK 环境自动重试一次（同记录字节本身是好的，重试成功率极高）。
      if (
        openRetryCount < 1 &&
        frameReady.value &&
        typeof data?.error === 'string' &&
        /conversion/i.test(data.error)
      ) {
        openRetryCount += 1;
        logOnlyoffice('warn', '文档转换失败，重载 iframe 重试一次', data.error);
        reloadFrame();
        return;
      }
      emit('load-error', data);
      break;
    }
    case 'onlyoffice-ready': {
      frameReady.value = true;
      documentReady.value = false;
      connectorReady.value = false;
      connectorErrorMessage.value = '';
      loadError.value = '';
      logOnlyoffice('info', 'iframe 已就绪，开始发送配置');
      pushConfig();
      emit('ready');
      break;
    }
    case 'onlyoffice-rename': {
      emit('rename', data.title || '');
      break;
    }
    case 'onlyoffice-request-close': {
      emit('request-close');
      break;
    }
    case 'onlyoffice-saveas': {
      handleSaveAs(data);
      break;
    }
    case 'onlyoffice-saved': {
      handleSaved(data);
      break;
    }
    case 'onlyoffice-state-change': {
      modified.value = Boolean(data.modified);
      emit('state-change', modified.value);
      break;
    }
    default: {
      break;
    }
  }
}

function mimeOf(fileType) {
  const map = {
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    odt: 'application/vnd.oasis.opendocument.text',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pdf: 'application/pdf',
  };
  return (
    map[String(fileType || '').toLowerCase()] || 'application/octet-stream'
  );
}

function toBlob(data, fileType) {
  return new Blob([data], { type: mimeOf(fileType) });
}

function hasFileBuffer(data) {
  return data && data.buffer !== undefined && data.buffer !== null;
}

function handleSaved(data) {
  const pending = data.requestId && pendingSaves.get(data.requestId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingSaves.delete(data.requestId);
    if (data.ok && hasFileBuffer(data)) {
      const fileType = data.fileType || inferFileType(props.document);
      const blob = toBlob(data.buffer, fileType);
      const meta = {
        fileType,
        fileName: data.fileName || fileNameOf(props.document, fileType),
      };
      pending.resolve(blob);
      emit('saved', blob, meta);
    } else {
      pending.reject(new Error(data.error || '保存失败'));
    }
    return;
  }

  if (!data.requestId && data.ok && hasFileBuffer(data)) {
    const fileType = data.fileType || inferFileType(props.document);
    const blob = toBlob(data.buffer, fileType);
    emit(
      'autosave',
      blob,
      fileType,
      data.fileName || fileNameOf(props.document, fileType),
    );
  }
}

function handleSaveAs(data) {
  if (data.ok && hasFileBuffer(data)) {
    const fileType = data.fileType || inferFileType(props.document);
    emit(
      'save-as',
      toBlob(data.buffer, fileType),
      fileType,
      data.fileName || fileNameOf(props.document, fileType),
    );
  } else {
    emit('save-as-error', data.error || '另存为失败');
  }
}

function whenDocumentReady(timeout = props.saveTimeout) {
  if (documentReady.value) return Promise.resolve();
  if (!frameReady.value) return Promise.reject(new Error('编辑器未就绪'));

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      stop();
      reject(new Error('编辑器加载超时'));
    }, timeout);
    const stop = watch(
      documentReady,
      (ready) => {
        if (!ready) return;
        clearTimeout(timer);
        stop();
        resolve();
      },
      { immediate: true },
    );
  });
}

function whenConnectorReady(timeout = props.commandTimeout) {
  if (connectorReady.value) return Promise.resolve();
  if (!frameReady.value) return Promise.reject(new Error('编辑器未就绪'));
  if (connectorErrorMessage.value) {
    return Promise.reject(new Error(connectorErrorMessage.value));
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      stop();
      const error = new Error(
        'OnlyOffice connector 未就绪，请检查 api.js 是否支持 createConnector，并查看 iframe 控制台日志',
      );
      logOnlyoffice('error', error.message);
      reject(error);
    }, timeout);
    const stop = watch(
      [connectorReady, connectorErrorMessage],
      ([ready, errorMessage]) => {
        if (ready) {
          clearTimeout(timer);
          stop();
          resolve();
          return;
        }
        if (errorMessage) {
          clearTimeout(timer);
          stop();
          reject(new Error(errorMessage));
        }
      },
      { immediate: true },
    );
  });
}

async function save(format) {
  if (!frameReady.value) throw new Error('编辑器未就绪');
  await whenDocumentReady();
  const requestId = `save-${Date.now()}-${++saveSeq.value}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pendingSaves.delete(requestId);
      reject(new Error('保存超时，请确认文档已加载后重试'));
    }, props.saveTimeout);
    pendingSaves.set(requestId, { resolve, reject, timer });
    try {
      postToFrame({
        type: 'onlyoffice-save',
        requestId,
        format: format || inferFileType(props.document),
      });
    } catch (error) {
      clearTimeout(timer);
      pendingSaves.delete(requestId);
      reject(error);
    }
  });
}

function handleCommandResult(data) {
  logOnlyoffice('info', '收到 connector 命令回执', data);
  emit('command-result', data);
  const pending = data.requestId && pendingCommands.get(data.requestId);
  if (!pending) {
    logOnlyoffice(
      'warn',
      '收到没有对应 pending 请求的命令回执',
      data.requestId,
    );
    return;
  }
  clearTimeout(pending.timer);
  pendingCommands.delete(data.requestId);
  if (data.ok === false || data.success === false) {
    const error = new Error(data.error || 'OnlyOffice 操作失败');
    logOnlyoffice('error', 'connector 命令执行失败', error, data);
    pending.reject(error);
  } else {
    logOnlyoffice('info', 'connector 命令执行成功', {
      requestId: data.requestId,
      command: data.command,
      resultType:
        data.result == null ? String(data.result) : typeof data.result,
    });
    pending.resolve(data.result ?? data.data);
  }
}

function normalizeConnectorArguments(callbackOrOptions) {
  if (typeof callbackOrOptions === 'function') {
    return { callback: callbackOrOptions, options: {} };
  }
  return { callback: null, options: callbackOrOptions || {} };
}

function notifyConnectorCallback(promise, callback, label) {
  if (typeof callback !== 'function') return promise;
  promise.then(
    (result) => {
      try {
        callback(result);
      } catch (error) {
        logOnlyoffice('error', `${label} 回调执行失败`, error);
      }
    },
    (error) => {
      // 保留 Promise reject 给调用方，同时把 callback 形式的失败写入日志。
      logOnlyoffice('error', `${label} 执行失败`, error);
    },
  );
  return promise;
}

/**
 * 跨域转发 ONLYOFFICE Automation API。
 * 宿主只能通过 postMessage 发送函数源码，真正的 connector 调用始终发生在 iframe 内。
 */
async function executeCommandNow(command, args = {}, options = {}) {
  if (command !== 'callCommand' && command !== 'executeMethod') {
    throw new Error(`不支持的 OnlyOffice connector command: ${command}`);
  }
  await whenDocumentReady(props.commandTimeout);
  await whenConnectorReady(props.commandTimeout);
  const requestId = `command-${Date.now()}-${++commandSeq.value}`;
  const waitForResult = options.waitForResult !== false;
  const method = command === 'executeMethod' ? args?.method : undefined;
  const methodArgs =
    command === 'executeMethod'
      ? Object.prototype.hasOwnProperty.call(args, 'args')
        ? args.args
        : []
      : undefined;
  const functionSource =
    command === 'callCommand' ? args?.functionSource : undefined;
  const message = {
    type: 'onlyoffice-command',
    requestId,
    command,
    method,
    methodArgs,
    functionSource,
    callbackExpected: options.callbackExpected === true,
    waitForCompletion: options.waitForCompletion !== false && waitForResult,
    expectResult: waitForResult,
  };

  logOnlyoffice('info', '准备执行 connector API', {
    requestId,
    command,
    method,
    methodArgs,
    functionSourceLength: functionSource?.length,
    waitForResult,
    waitForCompletion: message.waitForCompletion,
  });

  if (!waitForResult) {
    postToFrame(message);
    return;
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pendingCommands.delete(requestId);
      const error = new Error(
        `OnlyOffice 操作超时（${method || command}）。请检查 iframe 控制台与 connector 回执`,
      );
      logOnlyoffice('error', error.message, message);
      reject(error);
    }, props.commandTimeout);
    pendingCommands.set(requestId, { resolve, reject, timer });
    try {
      postToFrame(message);
    } catch (error) {
      clearTimeout(timer);
      pendingCommands.delete(requestId);
      logOnlyoffice('error', '发送 connector API 消息失败', error, message);
      reject(error);
    }
  });
}

function executeCommand(command, args = {}, options = {}) {
  const run = connectorCommandQueue.then(
    () => executeCommandNow(command, args, options),
    () => executeCommandNow(command, args, options),
  );
  connectorCommandQueue = run.catch(() => {});
  logOnlyoffice('info', 'connector API 命令进入串行队列', {
    command,
    method: args?.method,
  });
  return run;
}

function callCommand(command, callbackOrOptions) {
  if (typeof command !== 'function') {
    throw new TypeError('OnlyOffice connector.callCommand 需要传入函数');
  }
  const functionSource = Function.prototype.toString.call(command);
  if (!functionSource || functionSource.includes('[native code]')) {
    throw new TypeError('OnlyOffice connector.callCommand 无法序列化该函数');
  }
  const { callback, options } = normalizeConnectorArguments(callbackOrOptions);
  const promise = executeCommand(
    'callCommand',
    { functionSource },
    { ...options, callbackExpected: typeof callback === 'function' },
  );
  return notifyConnectorCallback(promise, callback, 'callCommand');
}

function executeMethod(method, args = [], callbackOrOptions) {
  if (typeof method !== 'string' || !method) {
    throw new TypeError('OnlyOffice connector.executeMethod 需要传入方法名');
  }
  const { callback, options } = normalizeConnectorArguments(callbackOrOptions);
  const promise = executeCommand(
    'executeMethod',
    { method, args },
    { ...options, callbackExpected: typeof callback === 'function' },
  );
  return notifyConnectorCallback(promise, callback, `executeMethod(${method})`);
}

class OnlyOfficeConnector {
  callCommand(command, callbackOrOptions) {
    return callCommand(command, callbackOrOptions);
  }

  executeMethod(method, args = [], callbackOrOptions) {
    return executeMethod(method, args, callbackOrOptions);
  }
}

const connector = new OnlyOfficeConnector();

function fieldPayload(field) {
  const key = String(field?.key || field?.field || field?.id || '');
  const name = field?.name || key;
  const type = String(field?.type || 'text').toLowerCase();
  const text = type === 'list' ? `{{#each ${key}}}\n{{/each}}` : `{{ ${key} }}`;
  return {
    key,
    name,
    type,
    id: field?.id ?? key,
    text,
    tag: key,
    contentControl: {
      alias: name,
      id: field?.id ?? key,
      tag: key,
      lock: 3,
      placeholder: '',
    },
  };
}

function isSignatureField(field) {
  const key = String(field?.key || field?.field || field?.id || '');
  return (
    key === 'signature_image' ||
    String(field?.type || '').toLowerCase() === 'signature' ||
    field?.signature === true
  );
}

// 手写签名：浮动文本框（可拖拽）+ 框内 {{img}} 占位文本。
// 编辑器里：形状透明无边框（渲染后不留背景/边框），靠「浅灰高亮 + 加大字号」的
//           占位文本让插入位置可见、可选中、可拖动；
// 渲染时：docx-handlebars 把 {{img}} 高亮占位整段替换成真实签名图，高亮随占位一起消失，输出干净。
// 可编辑关键：形状必须 AddDrawing 到「已挂到文档里的段落」上（直接新建段落+InsertContent 的框不可编辑）。
//
// 尺寸规则：占位 {{img signature_image 76 38}} 渲染出的签名图是行内图片、居中放在文本框内容区里；
// 文本框内容区 = 形状尺寸 − wps:bodyPr 默认内边距（左右 0.1''=91440 EMU、上下 0.05''=45720 EMU）。
// 76×38 px @96dpi = 723900×361950 EMU，因此形状必须 = 图 + 内边距，即
// 723900+2×91440=906780、361950+2×45720=453390。
// 否则内容区只有 537120×268560，签名图溢出约 35%，右/下被形状（父容器）裁掉。
async function insertSignatureBox() {
  const source = `
function () {
  var doc = Api.GetDocument();
  // 透明填充 + 无边框：形状本身在最终文档里不留任何背景/线框
  var fill = Api.CreateNoFill();
  var stroke = Api.CreateStroke(0, Api.CreateNoFill());
  // 形状必须比渲染图大一圈以容纳文本框内边距（见上方尺寸规则），否则渲染后签名被裁切
  var shape = Api.CreateShape('rect', 906780, 453390, fill, stroke);
  // 转浮动（脱离文档流、可拖拽）
  try { shape.SetWrappingStyle('inFront'); } catch (e) { console.warn('[sig] 浮动设置失败（保持行内）：', e); }
  // 框内写 {{img}} 占位文本：浅灰高亮 + 放大字号，编辑器中清晰可见；
  // 渲染时该占位 run 被签名图整体替换，高亮不残留在输出文档里。
  function putPlaceholder(s) {
    try {
      var content = s.GetContent ? s.GetContent() : s.GetDocContent();
      var inner = content.GetElement(0);
      if (!inner) { inner = Api.CreateParagraph(); content.AddElement(inner); }
      var run = inner.AddText('{{img signature_image 76 38}}');
      try {
        run.SetFontSize(24);
        run.SetHighlight('lightGray');
      } catch (e) { console.warn('[sig] 占位高亮设置失败：', e); }
    } catch (e) { console.warn('[sig] 框内写占位文本失败（框仍会插入）：', e); }
  }
  // 光标处插入：InsertContent 空段落 → 取回挂载段落 → AddDrawing。
  var anchor = null;
  if (doc.InsertContent) {
    doc.InsertContent([Api.CreateParagraph()]);
    var ps = doc.GetAllParagraphs ? doc.GetAllParagraphs() : [];
    if (ps && ps.length) anchor = ps[ps.length - 1];
  }
  if (anchor && typeof anchor.AddDrawing === 'function') {
    anchor.AddDrawing(shape);
    putPlaceholder(shape);
  } else {
    var p = Api.CreateParagraph();
    p.AddDrawing(shape);
    if (doc.InsertContent) doc.InsertContent([p]);
    putPlaceholder(shape);
  }
}
`;
  return executeCommand('callCommand', { functionSource: source });
}

async function insertField(field) {
  const payload = fieldPayload(field);
  emit('field-select', field);
  logOnlyoffice('info', '开始插入模板字段', {
    field,
    payload,
    connectorReady: connectorReady.value,
    documentReady: documentReady.value,
  });
  try {
    // 手写签名：浮动文本框 + 框内 {{img signature_image}} 占位（渲染时被替换为真图）；
    // 普通字段仍走内容控件 + PasteText，列表字段只粘贴循环标签。
    if (isSignatureField(field)) {
      const result = await insertSignatureBox();
      logOnlyoffice('info', '签名框插入完成', {
        fieldKey: payload.key,
        result,
      });
      return result;
    }
    if (payload.type !== 'list') {
      const control = payload.contentControl;
      const controlArgs = [
        2,
        {
          Alias: control.alias,
          // 内容控件 Id 必须在同一文档内唯一；不能复用后端字段 id，否则第二次插入会被编辑器拒绝。
          Id: `${control.id}-${Date.now()}-${++fieldInsertSeq}`,
          Tag: control.tag,
          Lock: control.lock,
          PlaceHolderText: control.placeholder,
          Color: { R: 255, G: 224, B: 78, A: 1 },
        },
      ];
      logOnlyoffice('info', '字段步骤 1/2：AddContentControl', controlArgs);
      await connector.executeMethod('AddContentControl', controlArgs);
    }
    logOnlyoffice(
      'info',
      payload.type === 'list'
        ? '字段步骤：PasteText（列表字段）'
        : '字段步骤 2/2：PasteText',
      [payload.text],
    );
    const result = await connector.executeMethod('PasteText', [payload.text]);

    logOnlyoffice('info', '模板字段插入完成', {
      fieldKey: payload.key,
      result,
    });
    return result;
  } catch (error) {
    logOnlyoffice('error', '模板字段插入失败', {
      field,
      payload,
      error,
    });
    emit('field-insert-error', error, field);
    throw error;
  }
}

async function insertSelectedField(field) {
  const key = String(field?.key || field?.id || '');
  fieldAction.value = { key, state: 'loading', message: '正在插入…' };
  logOnlyoffice('info', '点击字段插入按钮', { key, field });
  try {
    await insertField(field);
    fieldAction.value = { key, state: 'success', message: '已完成' };
  } catch (error) {
    fieldAction.value = {
      key,
      state: 'error',
      message: error?.message || '插入失败',
    };
  }
}

// ---- 列表字段循环块插入（docx-handlebars 语法）----
// 渲染入口已把 render_data.fields 合并到一级（{...render_data, ...render_data.fields}），
// 列表字段值就是顶层 _ID 数组，循环体内子字段直接用 {{ _ID }}。
const LOOP_OPTIONS = {
  rowOpen: { label: '行循环开', title: (path) => `{{tr #each ${path}}}` },
  rowClose: { label: '行循环闭', title: () => '{{tr /each}}' },
  cellOpen: { label: '格循环开', title: (path) => `{{tc #each ${path}}}` },
  cellClose: { label: '格循环闭', title: () => '{{tc /each}}' },
  plain: { label: '普通循环', title: (path) => `{{#each ${path}}}\n{{/each}}` },
};

function loopPath(field) {
  return String(field?.key || field?.field || field?.id || '');
}

function loopOptions(field) {
  const path = loopPath(field);
  return Object.entries(LOOP_OPTIONS).map(([kind, option]) => ({
    kind,
    label: option.label,
    title: option.title(path),
  }));
}

function toggleLoopMenu(item) {
  loopMenuKey.value = loopMenuKey.value === item.key ? '' : item.key;
}

async function insertLoop(field, kind) {
  const path = loopPath(field);
  const option = LOOP_OPTIONS[kind];
  const text = option.title(path);
  const actionKey = `loop-${String(field?.key || field?.id || '')}-${kind}`;
  fieldAction.value = {
    key: actionKey,
    state: 'loading',
    message: '正在插入…',
  };
  loopMenuKey.value = '';
  logOnlyoffice('info', '插入循环块', { field, kind, text });
  try {
    await connector.executeMethod('PasteText', [text]);
    fieldAction.value = { key: actionKey, state: 'success', message: '已完成' };
  } catch (error) {
    fieldAction.value = {
      key: actionKey,
      state: 'error',
      message: error?.message || '插入失败',
    };
    logOnlyoffice('error', '循环块插入失败', { field, kind, error });
    emit('field-insert-error', error, field);
  }
}

async function selectField(item) {
  logOnlyoffice('info', '点击字段名称区域', {
    key: item.key,
    hasChildren: item.hasChildren,
    field: item.field,
  });
  if (item.hasChildren) {
    toggleField(item.key);
    fieldAction.value = {
      key: item.key,
      state: 'idle',
      message: '字段组已展开，请点击具体字段插入',
    };
    return;
  }
  await insertSelectedField(item.field);
}

function onFieldPanelClick(event) {
  const target = event.target?.closest?.('[data-field-key]');
  logOnlyoffice('info', '字段面板收到 DOM click', {
    fieldKey: target?.dataset?.fieldKey,
    fieldGroup: target?.dataset?.fieldGroup,
    tagName: event.target?.tagName,
  });
  // 点击循环菜单以外的区域时收起菜单
  if (!event.target?.closest?.('.onlyoffice-loop-menu')) {
    loopMenuKey.value = '';
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage);
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage);
  pendingSaves.forEach(({ timer, reject }) => {
    clearTimeout(timer);
    reject(new Error('编辑器已销毁'));
  });
  pendingCommands.forEach(({ timer, reject }) => {
    clearTimeout(timer);
    reject(new Error('编辑器已销毁'));
  });
  pendingSaves.clear();
  pendingCommands.clear();
});

watch(
  [
    () => props.document,
    () => props.mode,
    () => props.config,
    () => props.streamFallback,
  ],
  () => {
    const key = props.document?.key || null;
    const keyChanged = key !== lastDocumentKey;
    lastDocumentKey = key;
    if (keyChanged) {
      openRetryCount = 0;
      if (frameReady.value) {
        // 切换到新文档且 iframe 已就绪：重载 iframe 获得全新 SDK 环境，
        // 规避同一 iframe 内 destroy+new 导致的 x2t 转换竞态。
        reloadFrame();
        return;
      }
      // iframe 尚未就绪（首次挂载/加载中）：由 onlyoffice-ready 自动下发当前文档
      return;
    }
    // 同一文档（如签名重渲染后 buffer 更新 / mode、config 变化）：防抖后重发配置
    nextTick(schedulePushConfig);
  },
  { deep: true },
);

defineExpose({
  save,
  whenDocumentReady,
  whenConnectorReady,
  executeCommand,
  callCommand,
  executeMethod,
  connector,
  insertField,
  frame,
  frameReady,
  documentReady,
  modified,
  connectorReady,
});
</script>

<template>
  <div class="onlyoffice-shell" :style="shellStyle">
    <aside
      v-if="fieldPanel && fields.length"
      class="onlyoffice-field-panel"
      :style="{ width: toCssSize(fieldPanelWidth) }"
    >
      <div class="onlyoffice-field-header">
        <span class="onlyoffice-field-title">
          <span class="onlyoffice-field-title-icon" aria-hidden="true">▤</span>
          <span>{{ fieldPanelTitle }}</span>
        </span>
        <span
          class="onlyoffice-field-tip"
          :class="{
            'is-loading': fieldAction.state === 'loading',
            'is-error': fieldAction.state === 'error' || connectorErrorMessage,
            'is-success': fieldAction.state === 'success',
          }"
          :title="fieldAction.message || connectorErrorMessage || undefined"
        >
          {{
            fieldAction.message ||
            connectorErrorMessage ||
            (connectorReady ? '已就绪' : documentReady ? '可插入' : '等待')
          }}
        </span>
      </div>
      <div class="onlyoffice-field-list" @click.capture="onFieldPanelClick">
        <div
          v-for="item in visibleFields"
          :key="item.key"
          class="onlyoffice-field-row"
          :class="{ 'is-group': item.hasChildren }"
          :data-field-key="item.key"
          :data-field-group="item.hasChildren ? 'true' : 'false'"
          :style="{ paddingLeft: `${10 + item.depth * 16}px` }"
          @click="selectField(item)"
        >
          <button
            class="onlyoffice-field-main"
            type="button"
            :title="fieldTitle(item.field)"
            :aria-label="
              item.hasChildren
                ? `展开字段组 ${item.field.name || item.field.key}`
                : `插入字段 ${item.field.name || item.field.key}`
            "
            @click.stop="selectField(item)"
          >
            <span
              class="onlyoffice-field-chevron"
              :class="{ 'is-expanded': expandedKeys.has(item.key) }"
            >
              {{ item.hasChildren ? '▸' : '·' }}
            </span>
            <span class="onlyoffice-field-name">{{
              item.field.name || item.field.key
            }}</span>
          </button>
          <div
            v-if="item.field.key && (item.field.type || !item.hasChildren)"
            class="onlyoffice-field-actions"
          >
            <button
              v-if="item.field.type !== 'list'"
              class="onlyoffice-field-insert"
              type="button"
              title="插入字段"
              :aria-label="`插入字段 ${item.field.name || item.field.key}`"
              @click.stop="insertSelectedField(item.field)"
            >
              +
            </button>
            <button
              v-else
              class="onlyoffice-field-insert is-loop"
              type="button"
              :title="`插入循环块（${item.field.name || item.field.key}）`"
              :aria-label="`插入循环块 ${item.field.name || item.field.key}`"
              @click.stop="toggleLoopMenu(item)"
            >
              循环
            </button>
            <div
              v-if="item.field.type === 'list' && loopMenuKey === item.key"
              class="onlyoffice-loop-menu"
            >
              <button
                v-for="option in loopOptions(item.field)"
                :key="option.kind"
                type="button"
                :title="option.title"
                @click.stop="insertLoop(item.field, option.kind)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <div class="onlyoffice-frame-wrap">
      <iframe
        ref="frame"
        class="onlyoffice-frame"
        :src="frameSrc"
        :title="document?.title || 'OnlyOffice 文档编辑器'"
        frameborder="0"
        allowfullscreen
        @load="onFrameLoad"
      ></iframe>
      <div v-if="!documentReady && !loadError" class="onlyoffice-loading">
        <span class="onlyoffice-spinner"></span>
        <span>{{ loadingText }}</span>
      </div>
      <div v-if="loadError" class="onlyoffice-error">
        <strong>文档加载失败</strong>
        <span>{{ loadError }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.onlyoffice-shell {
  display: flex;
  min-width: 0;
  min-height: 320px;
  overflow: hidden;
  background: #f4f6f8;
}

.onlyoffice-field-panel {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  overflow: hidden;
  color: #1f2937;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
}

.onlyoffice-field-header {
  display: flex;
  flex: 0 0 42px;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  background: #fff;
  border-bottom: 1px solid #eef0f2;
}

.onlyoffice-field-title {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.onlyoffice-field-title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 10px;
  color: #6366f1;
  background: #eef2ff;
  border-radius: 4px;
}

.onlyoffice-field-tip {
  max-width: 55%;
  padding: 1px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  font-weight: 400;
  line-height: 16px;
  color: #64748b;
  white-space: nowrap;
  background: #f1f5f9;
  border-radius: 8px;
}

.onlyoffice-field-tip.is-loading {
  color: #1d4ed8;
  background: #dbeafe;
}

.onlyoffice-field-tip.is-success {
  color: #15803d;
  background: #dcfce7;
}

.onlyoffice-field-tip.is-error {
  color: #b91c1c;
  background: #fee2e2;
}

.onlyoffice-field-list {
  flex: 1;
  padding: 6px;
  overflow-y: auto;
}

.onlyoffice-field-list::-webkit-scrollbar {
  width: 6px;
}

.onlyoffice-field-list::-webkit-scrollbar-thumb {
  background: #d8e0ea;
  border-radius: 3px;
}

.onlyoffice-field-row {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 32px;
  padding-right: 4px;
  margin-bottom: 1px;
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.15s ease;
}

.onlyoffice-field-row:hover {
  background: #eef4ff;
}

.onlyoffice-field-row.is-group {
  font-weight: 600;
  color: #475569;
  background: rgb(241 245 249 / 70%);
}

.onlyoffice-field-main {
  display: flex;
  flex: 1;
  gap: 4px;
  align-items: center;
  min-width: 0;
  padding: 5px 6px;
  overflow: hidden;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.onlyoffice-field-chevron {
  display: inline-flex;
  flex: 0 0 14px;
  align-items: center;
  justify-content: center;
  width: 14px;
  font-size: 10px;
  color: #94a3b8;
  transition: transform 0.15s ease;
}

.onlyoffice-field-chevron.is-expanded {
  transform: rotate(90deg);
}

.onlyoffice-field-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.onlyoffice-field-insert {
  padding: 2px 6px;
  font-size: 11px;
  line-height: 16px;
  color: #2563eb;
  cursor: pointer;
  background: #eff6ff;
  border: 0;
  border-radius: 4px;
}

.onlyoffice-field-insert:hover {
  background: #dbeafe;
}

.onlyoffice-field-insert.is-loop {
  color: #7c3aed;
  background: #f5f3ff;
}

.onlyoffice-field-insert.is-loop:hover {
  background: #ede9fe;
}

.onlyoffice-field-actions {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  align-items: center;
  opacity: 0.55;
  transition: opacity 0.15s ease;
}

.onlyoffice-field-row:hover .onlyoffice-field-actions,
.onlyoffice-field-actions:focus-within {
  opacity: 1;
}

.onlyoffice-loop-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 132px;
  padding: 4px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
}

.onlyoffice-loop-menu button {
  padding: 4px 8px;
  font-size: 12px;
  color: #374151;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 4px;
}

.onlyoffice-loop-menu button:hover {
  color: #2563eb;
  background: #f5f9ff;
}

.onlyoffice-frame-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.onlyoffice-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

.onlyoffice-loading,
.onlyoffice-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  color: #64748b;
  pointer-events: none;
  background: rgb(255 255 255 / 86%);
}

.onlyoffice-error {
  color: #b91c1c;
  pointer-events: auto;
}

.onlyoffice-error span {
  max-width: 420px;
  font-size: 12px;
  text-align: center;
}

.onlyoffice-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #dbeafe;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: onlyoffice-spin 0.8s linear infinite;
}

@keyframes onlyoffice-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
