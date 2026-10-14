<script setup>
/**
 * AI 内联对话条（编辑器底部浮动，tiptap 式单输入框）。
 *
 * - 作用域：默认全文；文档中有选中节点时自动用选中（chip 展示，支持删除清除，可不选中任何内容）。
 * - 设计稿：输入框内直接粘贴图片（或点图按钮选择），本地转 base64 dataURL
 *   直传大模型，不走上传入库。最多 4 张、单张 8MB；点击图片缩略图直接放大预览。
 * - 流式：思考中收拢为细状态条（动画流光 + 停止键）；完成后把结果
 *   emit('suggestion-ready', { html, scope }) 交父组件落盘比对
 *   （父组件负责 diff 高亮 + 逐处接受/全部接受）。
 * - 比对进行中（reviewActive）时禁止新一轮发送，先接受或放弃。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';

import { message } from 'antdv-next';

const props = defineProps({
  fetchAi: {
    type: [Function, null],
    default: null,
  },
  /** 比对进行中（父组件会话态），此时禁用发送 */
  reviewActive: {
    type: Boolean,
    default: false,
  },
  /** 选中节点解析：() => { pos, node, label, text, html } | null（父组件现取现用） */
  resolveScope: {
    type: Function,
    default: null,
  },
  /** 全文索取：() => { text, html } | null */
  getFull: {
    type: Function,
    default: null,
  },
  /** 父组件选中变化时递增，刷新节点 chip */
  contextVersion: {
    type: Number,
    default: 0,
  },
  model: {
    type: String,
    default: '',
  },
  recordId: {
    type: [Number, String],
    default: '',
  },
  fieldName: {
    type: String,
    default: 'content',
  },
  locale: {
    type: String,
    default: 'zh-CN',
  },
  uploadImage: {
    type: Function,
    default: null,
  },
});

const emit = defineEmits(['suggestion-ready', 'locate-scope', 'stream-progress']);

const OUTPUT_CONSTRAINT =
  '要求：只返回可直接放入网页正文的 HTML 片段（如 p/h2/ul/li 等标签），不要用 markdown 代码块包裹，不要解释说明。';

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_STREAM_CHARS = 30_000;

const aiConfigured = computed(() => typeof props.fetchAi === 'function');

/** 用户是否主动清除了当前选中的节点作用域 */
const manualCleared = ref(false);
let lastClearedPos = null;

const nodeInfo = ref(null);
/** 有选中用选中，无选中默认全文/不限定范围 */
const effectiveScope = computed(() => (nodeInfo.value ? 'node' : 'full'));

const images = ref([]); // [{ url }]
const uploadingCount = ref(0);
const input = ref('');
const hasText = computed(() => input.value.trim().length > 0);
const running = ref(false);
const streamLen = ref(0);
/** 图片灯箱（Teleport 到 body，避免浮动条 transform 影响） */
const lightboxUrl = ref(null);
/** 收起为悬浮胶囊态，点击展开输入框（比对中隐藏整个入口） */
const expanded = ref(false);

let aborter = null;
const inputRef = ref(null);
const fileRef = ref(null);

function expand() {
  expanded.value = true;
  refreshNode();
  nextTick(() => {
    autoGrow();
    inputRef.value?.focus();
  });
}

function collapse() {
  expanded.value = false;
  try {
    inputRef.value?.blur();
  } catch {
    /* 忽略 */
  }
}

function clearScope() {
  lastClearedPos = nodeInfo.value?.pos ?? (nodeInfo.value?.from ?? -1);
  nodeInfo.value = null;
  manualCleared.value = true;
}

function refreshNode() {
  if (typeof props.resolveScope !== 'function') {
    nodeInfo.value = null;
    return;
  }
  try {
    const scope = props.resolveScope();
    const curPos = scope?.pos ?? (scope?.from ?? null);
    // 用户主动删除了该节点/选区的作用域时，在位置未发生变化前保持不选中
    if (manualCleared.value && scope && curPos === lastClearedPos) {
      nodeInfo.value = null;
      return;
    }
    // 选区位置发生了变更，重新恢复并同步
    if (scope && curPos !== lastClearedPos) {
      manualCleared.value = false;
      lastClearedPos = null;
    }
    nodeInfo.value = scope;
  } catch {
    nodeInfo.value = null;
  }
}

watch(
  () => props.contextVersion,
  () => {
    if (!running.value) refreshNode();
  },
);

refreshNode();

onMounted(() => {
  refreshNode();
  nextTick(() => {
    autoGrow();
  });
});

function autoGrow() {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

// 支持不选中任何内容发送，只要输入了提示词即可
const canSend = computed(() => {
  if (!aiConfigured.value || running.value || props.reviewActive) return false;
  if (!input.value.trim()) return false;
  if (uploadingCount.value > 0) return false;
  return true;
});

const sendHint = computed(() => {
  if (props.reviewActive) return '比对进行中，请先接受或放弃';
  if (running.value) return '生成中';
  if (!input.value.trim()) return '请先填写修改要求';
  if (uploadingCount.value > 0) return '图片读取中';
  if (!aiConfigured.value) return '未配置 AI 服务（fetch-ai）';
  return '发送（Enter）';
});

function safeFull() {
  if (typeof props.getFull !== 'function') return null;
  try {
    return props.getFull();
  } catch {
    return null;
  }
}

function compressImageToDataUrl(file, maxDimension = 1280, quality = 0.82) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        try {
          URL.revokeObjectURL(objUrl);
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch {
          resolve('');
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve('');
      };
      img.src = objUrl;
    } catch {
      resolve('');
    }
  });
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(String(reader.result || '')));
      reader.addEventListener('error', () => reject(new Error('read failed')));
      reader.readAsDataURL(file);
    } catch (error) {
      reject(error);
    }
  });
}

async function addImageFiles(files) {
  const list = [...(files || [])].filter((f) => f?.type?.startsWith('image/'));
  if (list.length === 0) return;
  const room = MAX_IMAGES - images.value.length;
  if (room <= 0) {
    message.warning(`最多附加 ${MAX_IMAGES} 张设计稿`);
    return;
  }
  for (const file of list.slice(0, room)) {
    if (file.size > MAX_IMAGE_BYTES) {
      message.warning(`图片 ${file.name || ''} 超过 8MB，已跳过`);
      continue;
    }
    uploadingCount.value += 1;
    try {
      const localUrl = URL.createObjectURL(file);
      let remoteUrl = '';
      if (typeof props.uploadImage === 'function') {
        try {
          remoteUrl = await props.uploadImage(file);
        } catch (uploadErr) {
          console.warn('[app-editor] 图片上传服务器失败，回退本地 DataURL:', uploadErr);
        }
      }
      let dataUrl = await compressImageToDataUrl(file);
      if (!dataUrl) {
        dataUrl = await readAsDataURL(file);
      }
      images.value.push({
        url: remoteUrl || dataUrl,
        remoteUrl: remoteUrl || '',
        dataUrl: dataUrl || '',
        localUrl: localUrl || dataUrl,
        name: file.name,
      });
      if (remoteUrl) {
        message.success(`图片已上传至媒体库`);
      }
    } catch (error) {
      console.error('[app-editor] AI 图片处理失败:', error);
      message.warning('图片读取/上传失败，请重试');
    } finally {
      uploadingCount.value -= 1;
    }
  }
}

function onInputPaste(event) {
  try {
    const files = [...(event.clipboardData?.files || [])].filter((f) =>
      f?.type?.startsWith('image/'),
    );
    if (files.length > 0) {
      event.preventDefault();
      addImageFiles(files);
    }
  } catch {
    /* 忽略，走默认粘贴 */
  }
}

function removeImage(idx) {
  images.value.splice(idx, 1);
}

function onInputKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    collapse();
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    handleSend();
  }
}

async function handleSend() {
  if (!canSend.value) {
    message.info(sendHint.value);
    return;
  }
  const isFull = effectiveScope.value === 'full';
  const target = isFull ? safeFull() : nodeInfo.value;
  const fullDoc = safeFull();
  const targetText = target?.text || fullDoc?.text || '';
  const targetHtml = target?.html || fullDoc?.html || '';
  const scopeSnapshot = isFull || !target
    ? { kind: 'full', html: fullDoc?.html || '', text: fullDoc?.text || '' }
    : target.kind === 'range'
    ? {
        kind: 'range',
        from: target.from,
        to: target.to,
        text: target.text,
        html: target.html,
        container: target.container || null,
        selection: target.selection || { text: target.text, html: target.html, from: target.from, to: target.to },
      }
    : {
        kind: 'node',
        pos: target.pos,
        type: target.node?.type?.name,
        container: target.container || null,
        html: target.html,
        text: target.text,
      };
  const instruction = `${input.value.trim()}\n${OUTPUT_CONSTRAINT}`;
  const imageUrls = images.value
    .map((it) => ({
      url: it.remoteUrl || it.url,
      remoteUrl: it.remoteUrl || '',
      dataUrl: it.dataUrl || '',
      name: it.name || 'image.png',
    }))
    .filter(Boolean);

  running.value = true;
  streamLen.value = 0;
  let acc = '';
  aborter = new AbortController();
  try {
    const result = await props.fetchAi({
      model: props.model || undefined,
      id: props.recordId,
      field: props.fieldName,
      locale: props.locale,
      instruction,
      preset: 'chat',
      text: targetText,
      html: targetHtml,
      block_html: target?.container?.html || (isFull ? fullDoc?.html : targetHtml) || '',
      selection_text: target?.kind === 'range' ? targetText : '',
      scope: target ? (isFull ? 'full' : (target.kind || 'node')) : 'full',
      label: target?.label || '未选中内容',
      selection: target?.kind === 'range' ? (target.selection || { text: target.text, html: target.html, from: target.from, to: target.to }) : null,
      container: target?.container || null,
      fullHtml: fullDoc?.html || '',
      images: imageUrls,
      signal: aborter.signal,
      onChunk: (chunk) => {
        if (!chunk) return;
        if (acc.length >= MAX_STREAM_CHARS) return;
        const slice = String(chunk).slice(0, MAX_STREAM_CHARS - acc.length);
        acc += slice;
        streamLen.value = acc.length;
        emit('stream-progress', { acc, chunk: slice, scope: scopeSnapshot });
      },
    });
    if (typeof result === 'string' && result) {
      acc = result;
    }
    if (!acc.trim()) {
      message.warning('AI 返回为空，请重试或换个说法');
      return;
    }
    emit('suggestion-ready', { html: acc, scope: scopeSnapshot });
    input.value = '';
    images.value = [];
    nextTick(() => autoGrow());
  } catch (error) {
    if (error?.name !== 'AbortError' && !aborter?.signal.aborted) {
      console.error('[app-editor] AI 生成失败:', error);
      message.error('AI 服务调用失败，请稍后重试');
    }
  } finally {
    running.value = false;
    aborter = null;
  }
}

function handleStop() {
  try {
    aborter?.abort();
  } catch {
    /* 忽略 */
  }
}

defineExpose({
  expanded,
  expand,
  collapse,
  clearScope,
  nodeInfo,
  images,
  lightboxUrl,
  input,
  canSend,
  addImageFiles,
  handleSend,
  handleStop,
});
</script>

<template>
  <div class="app-editor-ai-chat w-full pointer-events-auto flex justify-center text-xs text-foreground">
    <!-- 图标/胶囊态：精致现代的悬浮 AI 按钮 -->
    <button
      v-if="!expanded"
      class="app-editor-ai-fab group pointer-events-auto flex items-center gap-2 rounded-full border border-primary/30 bg-card/90 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:border-primary/60 hover:shadow-xl focus:outline-none"
      title="AI 助手（点击展开）"
      type="button"
      @click="expand"
    >
      <span class="relative flex size-4 items-center justify-center shrink-0">
        <svg class="size-4 text-primary animate-pulse" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24">
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
          <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
        </svg>
      </span>
      <span class="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent font-semibold">AI 助手</span>
      <span
        v-if="nodeInfo"
        class="max-w-[120px] truncate rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
      >
        {{ nodeInfo.label }}
      </span>
    </button>

    <!-- 展开态：全能对话输入框盒子 -->
    <div
      v-else
      class="app-editor-ai-box pointer-events-auto w-full rounded-2xl border border-primary/35 bg-card shadow-2xl transition-all focus-within:border-primary/60 focus-within:shadow-[0_12px_36px_-6px_rgba(99,102,241,0.25)]"
    >
      <!-- 思考与流式生成中：细条动态状态 -->
      <div
        v-if="running"
        class="relative flex items-center gap-3 overflow-hidden px-4 py-3"
      >
        <!-- 顶端彩色流光进度条 -->
        <div class="app-editor-ai-shimmer-bar absolute inset-x-0 top-0 h-[2px]"></div>

        <div class="relative flex size-5 shrink-0 items-center justify-center">
          <svg class="size-4.5 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
        </div>

        <div class="flex flex-1 items-center gap-2 min-w-0">
          <span class="text-[13px] font-medium text-foreground">AI 正在构思修改建议…</span>
          <span class="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium text-primary">
            已生成 {{ streamLen }} 字
          </span>
        </div>

        <button
          class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          title="停止生成"
          type="button"
          @click="handleStop"
        >
          <svg class="size-3" fill="currentColor" viewBox="0 0 24 24">
            <rect height="12" rx="2" width="12" x="6" y="6" />
          </svg>
          <span>停止</span>
        </button>
      </div>

      <template v-else>
        <!-- 头部上下文栏：作用域支持删除，可不选中任何内容 -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-3.5 pb-2 pt-2.5">
          <div class="flex flex-wrap items-center gap-2 min-w-0">
            <!-- 选中了具体内容时：显示标签并支持点击删除/清除 -->
            <div
              v-if="nodeInfo"
              class="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 pl-2.5 pr-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors"
            >
              <button
                class="flex items-center gap-1 hover:underline cursor-pointer truncate max-w-[200px]"
                :title="`${nodeInfo.label}（点击在文档中定位）`"
                type="button"
                @click="emit('locate-scope')"
              >
                <span class="inline-block size-1.5 rounded-full bg-primary animate-pulse shrink-0"></span>
                <span class="truncate">{{ nodeInfo.label }}</span>
              </button>
              <button
                class="flex size-3.5 items-center justify-center rounded-full text-primary/70 hover:bg-primary/25 hover:text-primary transition-colors cursor-pointer shrink-0 ml-0.5"
                title="删除选中的内容范围（不限定选区）"
                type="button"
                @click.stop="clearScope"
              >
                ✕
              </button>
            </div>

            <!-- 未选中任何内容时：显示未选中标识 -->
            <span
              v-else
              class="inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground"
              title="当前未选中特定内容，可在全文范围内修改或创作新内容"
            >
              <svg class="size-3 opacity-60" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <span>未选中任何内容 (全文)</span>
            </span>

            <!-- 已附加的设计稿图片列表：支持点击图片本身放大预览，删除按钮独立在角落 -->
            <div v-if="images.length > 0" class="flex items-center gap-2 ml-1">
              <div
                v-for="(img, idx) in images"
                :key="img.url"
                class="group relative inline-flex items-center justify-center size-8 cursor-pointer rounded-md border border-border/80 shadow-xs hover:border-primary/60 transition-all bg-muted/20"
                title="点击预览大图"
                @click="lightboxUrl = img.localUrl || img.dataUrl || img.url"
              >
                <img
                  :src="img.localUrl || img.dataUrl || img.url"
                  class="size-full object-cover rounded-md"
                  alt="设计稿参考图"
                />
                <!-- 悬浮微光放大提示 -->
                <div
                  class="absolute inset-0 flex items-center justify-center rounded-md bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                >
                  <svg class="size-3.5 text-white drop-shadow" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </div>
                <!-- 独立的右上角删除小按钮：不覆盖图片主体，点击仅删除 -->
                <button
                  class="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-neutral-800 hover:bg-destructive text-white text-[10px] font-bold shadow-sm transition-all opacity-80 hover:opacity-100 cursor-pointer z-10"
                  title="移除此图"
                  type="button"
                  @click.stop="removeImage(idx)"
                >
                  ✕
                </button>
              </div>
            </div>
            <span v-if="uploadingCount > 0" class="text-[11px] text-muted-foreground animate-pulse">图片处理中…</span>
          </div>
        </div>

        <!-- 文本输入行 -->
        <div class="flex items-end gap-2 px-3.5 py-2.5">
          <div class="flex items-center gap-0.5 shrink-0 self-center">
            <!-- 收起按钮 -->
            <button
              class="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="收起 AI 助手 (Esc)"
              type="button"
              @click="collapse"
            >
              <svg class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            <!-- 附加图片按钮 -->
            <button
              class="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="附加设计稿或参考图（支持直接粘贴截图）"
              type="button"
              @click="fileRef?.click()"
            >
              <svg class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24">
                <rect height="18" rx="2" width="18" x="3" y="3" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
              </svg>
            </button>
          </div>

          <input
            ref="fileRef"
            accept="image/*"
            multiple
            style="display: none !important;"
            type="file"
            @change="addImageFiles($event.target?.files); if (fileRef) fileRef.value = '';"
          />

          <!-- 自动增高的输入框 -->
          <textarea
            ref="inputRef"
            v-model="input"
            class="min-h-[38px] max-h-[130px] flex-1 resize-none self-center bg-transparent px-1 py-1 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
            placeholder="描述你想如何调整或排版这段内容…（Enter 发送，Shift+Enter 换行，支持直接粘贴截图）"
            rows="1"
            spellcheck="false"
            @input="autoGrow"
            @keydown="onInputKeydown"
            @paste="onInputPaste"
          ></textarea>

          <!-- 发送按钮 -->
          <button
            class="flex size-8 shrink-0 items-center justify-center self-end rounded-full transition-all focus:outline-none"
            :class="canSend
              ? 'bg-gradient-to-br from-primary via-indigo-600 to-purple-600 text-white shadow-md shadow-primary/30 hover:scale-105 hover:brightness-110 active:scale-95'
              : 'bg-muted text-muted-foreground/50 cursor-not-allowed'"
            :disabled="!canSend"
            :title="sendHint"
            type="button"
            @click="handleSend"
          >
            <svg class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" viewBox="0 0 24 24">
              <path d="m12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        </div>

        <!-- 底部快捷操作与提示 -->
        <div class="flex items-center justify-between border-t border-border/30 px-3.5 py-1.5 text-[10px] text-muted-foreground/70">
          <div class="flex items-center gap-2">
            <span>Enter 发送 · Shift+Enter 换行 · Esc 收起</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="inline-block size-1 rounded-full bg-emerald-500"></span>
            <span>模型已就绪</span>
          </div>
        </div>
      </template>
    </div>

    <!-- 设计稿灯箱（移至根 div 内部，避免多根节点破坏属性继承） -->
    <Teleport to="body">
      <div
        v-if="lightboxUrl"
        class="fixed inset-0 z-[10001] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
        @click="lightboxUrl = null"
      >
        <img
          :src="lightboxUrl"
          class="max-h-[90vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
          alt="设计稿大图"
          @click.stop
        />
        <button
          class="absolute top-5 right-5 rounded-full bg-white/20 hover:bg-white/30 text-white px-3 py-1 text-xs backdrop-blur-md transition-colors"
          type="button"
          @click="lightboxUrl = null"
        >
          关闭 (Esc)
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.app-editor-ai-fab {
  box-shadow: 0 8px 24px -4px rgba(99, 102, 241, 0.25), 0 2px 8px -2px rgba(0, 0, 0, 0.08);
}

.app-editor-ai-box {
  background-color: hsl(var(--card)) !important;
  box-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.22), 0 0 0 1px hsl(var(--primary) / 20%);
}

.app-editor-ai-shimmer-bar {
  background: linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899, #10b981, #6366f1);
  background-size: 200% 100%;
  animation: app-editor-shimmer 2s linear infinite;
}

@keyframes app-editor-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
