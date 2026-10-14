<script setup>
/**
 * AI 内联对话条（编辑器底部浮动，tiptap 式单输入框）。
 *
 * - 作用域：默认全文；文档中有选中节点时自动用选中（chip 展示，可点击回跳定位）。
 * - 设计稿：输入框内直接粘贴图片（或点图按钮选择），本地转 base64 dataURL
 *   直传大模型，不走上传入库。最多 4 张、单张 8MB；缩略图点击放大查看。
 * - 流式：思考中收拢为细状态条（动画圆点 + 停止键）；完成后把结果
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
});

const emit = defineEmits(['suggestion-ready', 'locate-scope']);

const OUTPUT_CONSTRAINT =
  '要求：只返回可直接放入网页正文的 HTML 片段（如 p/h2/ul/li 等标签），不要用 markdown 代码块包裹，不要解释说明。';

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_STREAM_CHARS = 30_000;

const PRESET_PROMPTS = [
  { label: '✨ 润色排版', text: '优化排版结构与视觉层次，提升文章可读性' },
  { label: '📝 修正错漏', text: '检查并修正文中的错别字、标点与病句' },
  { label: '🎯 提炼要点', text: '提炼核心要点，整理为清晰有层次的列表' },
  { label: '📖 扩写充实', text: '围绕当前核心观点适当扩写充实论述，丰富细节' },
];

const aiConfigured = computed(() => typeof props.fetchAi === 'function');

/** 有选中用选中，无选中默认全文 */
const effectiveScope = computed(() => (nodeInfo.value ? 'node' : 'full'));
const nodeInfo = ref(null);
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

function refreshNode() {
  if (typeof props.resolveScope !== 'function') {
    nodeInfo.value = null;
    return;
  }
  try {
    nodeInfo.value = props.resolveScope();
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

function applyPreset(preset) {
  if (!input.value.trim()) {
    input.value = preset.text;
  } else {
    input.value = `${input.value.trim()}，${preset.text}`;
  }
  nextTick(() => {
    autoGrow();
    inputRef.value?.focus();
  });
}

const canSend = computed(() => {
  if (!aiConfigured.value || running.value || props.reviewActive) return false;
  if (!input.value.trim()) return false;
  if (uploadingCount.value > 0) return false;
  const target =
    effectiveScope.value === 'full'
      ? safeFull()
      : nodeInfo.value;
  if (!target || !String(target.text || '').trim()) return false;
  return true;
});

const sendHint = computed(() => {
  if (!aiConfigured.value) return '未配置 AI 服务（fetch-ai）';
  if (props.reviewActive) return '比对进行中，请先接受或放弃';
  if (running.value) return '生成中';
  if (!input.value.trim()) return '请先填写修改要求';
  if (uploadingCount.value > 0) return '图片读取中';
  if (effectiveScope.value === 'full') {
    const full = safeFull();
    if (!full || !String(full.text || '').trim()) return '全文为空';
  }
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
      const url = await readAsDataURL(file);
      if (url) {
        images.value.push({ url });
      } else {
        message.warning('图片读取失败，已跳过');
      }
    } catch (error) {
      console.error('[app-editor] AI 设计稿读取失败:', error);
      message.warning('图片读取失败，已跳过');
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
  if (!target || !String(target.text || '').trim()) {
    message.info(isFull ? '全文为空' : '选中内容为空');
    return;
  }
  const scopeSnapshot = isFull
    ? { kind: 'full' }
    : { kind: 'node', pos: target.pos, type: target.node?.type?.name };
  const instruction = `${input.value.trim()}\n${OUTPUT_CONSTRAINT}`;
  const imageUrls = images.value.map((it) => it.url).filter(Boolean);

  running.value = true;
  streamLen.value = 0;
  let acc = '';
  aborter = new AbortController();
  try {
    const result = await props.fetchAi({
      instruction,
      preset: 'chat',
      text: target.text,
      html: target.html,
      scope: isFull ? 'full' : 'node',
      label: target.label,
      images: imageUrls,
      signal: aborter.signal,
      onChunk: (chunk) => {
        if (!chunk) return;
        if (acc.length >= MAX_STREAM_CHARS) return;
        const slice = String(chunk).slice(0, MAX_STREAM_CHARS - acc.length);
        acc += slice;
        streamLen.value = acc.length;
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
      class="app-editor-ai-box pointer-events-auto w-full rounded-2xl border border-primary/35 bg-card/95 shadow-2xl backdrop-blur-xl transition-all focus-within:border-primary/60 focus-within:shadow-[0_12px_36px_-6px_rgba(99,102,241,0.25)]"
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
        <!-- 头部上下文栏与快捷提示词 -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-3.5 pb-2 pt-2.5">
          <div class="flex flex-wrap items-center gap-1.5 min-w-0">
            <!-- 作用域标签 -->
            <button
              v-if="nodeInfo"
              class="inline-flex max-w-[200px] items-center gap-1 truncate rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors"
              :title="`${nodeInfo.label}（点击在文档中定位）`"
              type="button"
              @click="emit('locate-scope')"
            >
              <span class="inline-block size-1.5 rounded-full bg-primary animate-pulse shrink-0"></span>
              <span class="truncate">{{ nodeInfo.label }}</span>
            </button>
            <span
              v-else
              class="inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground"
              title="默认修改全文；选中具体段落或图片可只针对局部调整"
            >
              <svg class="size-3 opacity-60" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <span>全文范围</span>
            </span>

            <!-- 已附加的设计稿图片列表 -->
            <div v-if="images.length > 0" class="flex items-center gap-1 ml-1">
              <span
                v-for="(img, idx) in images"
                :key="img.url"
                class="group relative inline-block size-7 cursor-zoom-in overflow-hidden rounded-md border border-border shadow-2xs transition-transform hover:scale-105"
                title="点击放大查看"
                @click="lightboxUrl = img.url"
              >
                <img :src="img.url" class="size-full object-cover" alt="设计稿" />
                <button
                  class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 text-white text-[10px]"
                  title="移除此图"
                  type="button"
                  @click.stop="removeImage(idx)"
                >
                  ✕
                </button>
              </span>
            </div>
            <span v-if="uploadingCount > 0" class="text-[11px] text-muted-foreground animate-pulse">图片读取中…</span>
          </div>

          <!-- 空输入时的快速预设灵感按钮 -->
          <div v-if="!hasText" class="hidden sm:flex items-center gap-1">
            <button
              v-for="p in PRESET_PROMPTS"
              :key="p.label"
              class="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              type="button"
              @click="applyPreset(p)"
            >
              {{ p.label }}
            </button>
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
            placeholder="描述你想如何调整或排版这段内容…（Enter 发送，Shift+Enter 换行）"
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
  box-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.16), 0 0 0 1px hsl(var(--primary) / 15%);
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
