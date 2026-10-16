<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import 'vue-cropper/dist/index.css';
import { VueCropper } from 'vue-cropper/dist/vue-cropper.es.js';

import Compressor from 'compressorjs';
import { debounce } from 'lodash-es';

import { formatBytes } from './media-api';

/**
 * 通用图片裁剪压缩弹窗（媒体库上传面板 / 媒体库历史图片 / 编辑器内图片共用）。
 * 裁剪区域由 VueCropper 拖拽决定；输出格式、压缩质量、等比缩放由 Compressor 完成。
 * 组件只产出处理后的 File（emit confirm），上传/替换逻辑由调用方决定。
 */
const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  // 图片地址：http(s) / blob: / data: 均可；远程地址需允许跨域读取
  src: {
    type: String,
    default: '',
  },
  // 原文件名，用于命名输出文件
  fileName: {
    type: String,
    default: 'image',
  },
  title: {
    type: String,
    default: '图片裁剪压缩',
  },
  confirmText: {
    type: String,
    default: '应用',
  },
  // 原文件大小（字节），用于展示节省比例；未知传 0
  originalSize: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(['update:visible', 'confirm']);

const FORMAT_OPTIONS = [
  { label: '原格式', value: 'keep' },
  { label: 'WebP', value: 'image/webp' },
  { label: 'JPG', value: 'image/jpeg' },
  { label: 'PNG', value: 'image/png' },
];
const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const SCALE_PRESETS = [25, 50, 75, 100];

const cropper = ref(null);
const cropKey = ref(0);
const loading = ref(false);
const loadError = ref('');
const imgInfo = ref({ height: 0, width: 0 });

const cropperOption = ref({
  fixed: true,
  autoCropWidth: 0,
  autoCropHeight: 0,
});

const format = ref('keep');
const quality = ref(90);
const scalePercent = ref(100);

const processedSize = ref(0);
const processedDims = ref({ height: 0, width: 0 });
const processing = ref(false);
const confirming = ref(false);

const imgReady = computed(() => Boolean(imgInfo.value.width));

const savedPercent = computed(() => {
  if (!props.originalSize || !processedSize.value) return 0;
  return Math.round((1 - processedSize.value / props.originalSize) * 100);
});

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

// 裁剪比例锁（跟随原图比例）
const fixedNumber = computed(() => {
  const w = imgInfo.value.width || 1;
  const h = imgInfo.value.height || 1;
  const divisor = gcd(w, h);
  return [w / divisor, h / divisor];
});

// VueCropper 画布输出类型：显式格式按选择；原格式按扩展名推断（画布不支持则回退 png）
const cropperOutputType = computed(() => {
  if (format.value !== 'keep') {
    return format.value.replace('image/', '');
  }
  const ext = props.fileName.split('.').pop()?.toLowerCase() || '';
  return { jpeg: 'jpeg', jpg: 'jpeg', png: 'png', webp: 'webp' }[ext] || 'png';
});

function closeModal() {
  emit('update:visible', false);
}

// 预读图片真实尺寸；远程地址带 crossOrigin，跨域不可读时直接给出明确错误
async function loadImage() {
  loadError.value = '';
  loading.value = true;
  imgInfo.value = { height: 0, width: 0 };
  processedSize.value = 0;
  processedDims.value = { height: 0, width: 0 };
  if (!props.src) {
    loadError.value = '缺少图片地址';
    loading.value = false;
    return;
  }
  try {
    const img = new Image();
    if (!/^(?:blob:|data:)/i.test(props.src)) {
      img.crossOrigin = 'anonymous';
    }
    img.src = props.src;
    await new Promise((resolve, reject) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', () => reject(new Error('load failed')), {
        once: true,
      });
    });
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error('empty image');
    }
    imgInfo.value = {
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
    cropperOption.value.autoCropWidth = img.naturalWidth;
    cropperOption.value.autoCropHeight = img.naturalHeight;
    cropKey.value += 1;
    await nextTick();
    schedulePreview();
  } catch {
    loadError.value = '图片加载失败：该图片存在跨域限制，无法在线裁剪';
  } finally {
    loading.value = false;
  }
}

async function readBlobDims(blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return dims;
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await new Promise((resolve, reject) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', reject, { once: true });
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 组装 Compressor 参数；等比缩放相对裁剪结果（需先读裁剪 blob 宽度）
async function buildCompressOptions(blob) {
  const keep = format.value === 'keep';
  const options = {
    quality: Math.min(1, Math.max(0.1, quality.value / 100)),
    // 原格式时禁止大 PNG 被默认规则静默转成 JPEG
    convertSize: Infinity,
    // 压缩结果反而变大时回退；显式转换格式时尊重用户选择
    strict: keep,
  };
  if (!keep) {
    options.mimeType = format.value;
  }
  if (scalePercent.value < 100) {
    try {
      const dims = await readBlobDims(blob);
      const width = dims.width;
      if (width) {
        // 只传宽，高由 Compressor 按裁剪结果比例自适应，避免拉伸变形
        options.width = Math.max(
          1,
          Math.round((width * scalePercent.value) / 100),
        );
      }
    } catch {
      // 读不到宽度则保持裁剪结果原始尺寸
    }
  }
  return options;
}

function wrapProcessedFile(blob) {
  const base = props.fileName.replace(/\.[^.]+$/, '') || 'image';
  const type = blob.type || 'image/png';
  const ext =
    MIME_TO_EXT[type] || props.fileName.split('.').pop()?.toLowerCase() || 'png';
  return new File([blob], `${base}.${ext}`, { type });
}

function applyProcessedResult(result) {
  processedSize.value = result.size;
  readBlobDims(result)
    .then((dims) => {
      processedDims.value = dims;
    })
    .catch(() => {});
}

// 防抖预览：裁剪 blob → Compressor → 回显处理后大小与分辨率
function runPreview() {
  if (!imgReady.value || !cropper.value) return;
  processing.value = true;
  cropper.value.getCropBlob?.(async (data) => {
    if (!data) {
      processing.value = false;
      return;
    }
    try {
      const options = await buildCompressOptions(data);
      new Compressor(data, {
        ...options,
        success: (result) => {
          applyProcessedResult(result);
          processing.value = false;
        },
        error: (error) => {
          console.error('[app-editor] 图片压缩失败:', error);
          processing.value = false;
        },
      });
    } catch (error) {
      console.error('[app-editor] 图片处理预览失败:', error);
      processing.value = false;
    }
  });
}

const schedulePreview = debounce(() => {
  runPreview();
}, 250);

// 确认：重新按当前参数压缩一次，回传最新 File
function handleConfirm() {
  if (!imgReady.value || confirming.value) return;
  confirming.value = true;
  cropper.value?.getCropBlob?.(async (data) => {
    if (!data) {
      confirming.value = false;
      return;
    }
    try {
      const options = await buildCompressOptions(data);
      new Compressor(data, {
        ...options,
        success: (result) => {
          confirming.value = false;
          emit('confirm', { file: wrapProcessedFile(result) });
          closeModal();
        },
        error: (error) => {
          console.error('[app-editor] 图片压缩失败:', error);
          confirming.value = false;
        },
      });
    } catch (error) {
      console.error('[app-editor] 图片处理失败:', error);
      confirming.value = false;
    }
  });
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      format.value = 'keep';
      quality.value = 90;
      scalePercent.value = 100;
      loadImage();
    } else {
      schedulePreview.cancel();
    }
  },
);

watch([format, quality, scalePercent], () => {
  if (imgReady.value) schedulePreview();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[10100] flex items-center justify-center bg-black/50 p-4"
      @click.self="closeModal"
    >
      <div
        class="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl"
      >
        <!-- 弹窗顶栏 -->
        <div
          class="flex items-center justify-between border-b border-border bg-card px-5 py-3"
        >
          <span class="text-sm font-semibold">{{ title }}</span>
          <button
            class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="关闭"
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

        <!-- 裁剪区 -->
        <div class="flex flex-col gap-3 overflow-y-auto px-5 py-4">
          <div
            class="relative h-[40vh] min-h-[300px] overflow-hidden rounded-lg border border-border bg-muted/30"
          >
            <div
              v-if="loadError"
              class="flex h-full items-center justify-center px-6 text-center text-xs text-red-500"
            >
              {{ loadError }}
            </div>
            <VueCropper
              v-else-if="imgReady"
              ref="cropper"
              :key="cropKey"
              :img="src"
              :output-size="1"
              :output-type="cropperOutputType"
              :info="true"
              :full="false"
              :fixed="cropperOption.fixed"
              :fixed-number="fixedNumber"
              :can-move="true"
              :can-move-box="true"
              :fixed-box="false"
              :original="false"
              :auto-crop="true"
              :auto-crop-width="cropperOption.autoCropWidth"
              :auto-crop-height="cropperOption.autoCropHeight"
              :center-box="true"
              :high="true"
              class="h-full w-full"
              mode="contain"
            />
            <div
              v-else
              class="flex h-full items-center justify-center text-xs text-muted-foreground"
            >
              {{ loading ? '正在加载图片...' : '' }}
            </div>
          </div>

          <!-- 信息行 -->
          <div
            class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground"
          >
            <span>
              原图 {{ imgInfo.width || '?' }} × {{ imgInfo.height || '?' }}
              <template v-if="originalSize > 0">
                · {{ formatBytes(originalSize) }}
              </template>
            </span>
            <span v-if="processing" class="text-primary">处理中...</span>
            <span v-else-if="processedSize > 0" class="font-medium text-primary">
              处理后 {{ processedDims.width }} × {{ processedDims.height }} ·
              {{ formatBytes(processedSize) }}
              <template v-if="savedPercent > 0">
                （节省 {{ savedPercent }}%）
              </template>
            </span>
          </div>

          <!-- 参数区 -->
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div class="mb-1.5 text-xs font-medium text-foreground">
                输出格式
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="opt in FORMAT_OPTIONS"
                  :key="opt.value"
                  class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                  :class="
                    format === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  "
                  type="button"
                  @click="format = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <div>
              <div
                class="mb-1.5 flex items-center justify-between text-xs font-medium text-foreground"
              >
                <span>压缩质量</span>
                <span class="font-mono text-muted-foreground">
                  {{ quality }}%
                </span>
              </div>
              <input
                v-model.number="quality"
                class="w-full accent-primary"
                max="100"
                min="10"
                step="1"
                type="range"
              />
            </div>

            <div class="md:col-span-2">
              <div
                class="mb-1.5 flex items-center justify-between text-xs font-medium text-foreground"
              >
                <span>分辨率等比缩放（相对裁剪结果）</span>
                <span class="font-mono text-muted-foreground">
                  {{ scalePercent }}%
                </span>
              </div>
              <div class="flex items-center gap-2">
                <button
                  v-for="p in SCALE_PRESETS"
                  :key="p"
                  class="rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors"
                  :class="
                    scalePercent === p
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  "
                  type="button"
                  @click="scalePercent = p"
                >
                  {{ p }}%
                </button>
                <input
                  v-model.number="scalePercent"
                  class="flex-1 accent-primary"
                  max="100"
                  min="10"
                  step="5"
                  type="range"
                />
              </div>
            </div>

            <div class="md:col-span-2">
              <label
                class="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
              >
                <input
                  v-model="cropperOption.fixed"
                  type="checkbox"
                  class="accent-primary"
                />
                锁定原图比例（取消后可自由拖拽裁剪框比例）
              </label>
            </div>
          </div>
        </div>

        <!-- 底栏 -->
        <div
          class="flex items-center justify-end gap-2 border-t border-border bg-card px-5 py-3"
        >
          <button
            class="rounded-md border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            type="button"
            @click="closeModal"
          >
            取消
          </button>
          <button
            class="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!imgReady || confirming"
            type="button"
            @click="handleConfirm"
          >
            <span
              v-if="confirming"
              class="mr-1 inline-block size-2.5 animate-spin rounded-full border border-primary-foreground border-t-transparent"
            ></span>
            {{ confirming ? '处理中...' : confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
