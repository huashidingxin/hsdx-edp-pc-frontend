<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import Compressor from 'compressorjs';
import { createCropper } from 'cropperjs';
import { debounce } from 'lodash-es';

import { buildCropperTemplate } from './cropper-template';
import { formatBytes } from './media-api';

import './cropper-theme.css';

/**
 * 通用图片裁剪压缩弹窗（媒体库上传面板 / 媒体库历史图片 / 编辑器内图片共用）。
 * 裁剪区域由 cropperjs 拖拽决定（支持旋转、滚轮/双指缩放）；
 * 宽高输入框实时驱动选区（锁定比例时联动另一值，自由比例时独立输入）；
 * 输出格式、压缩质量、等比缩放由 Compressor 完成。
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
  // 远程图无 CORS 时的兜底：服务端转存为站内地址后再裁剪，返回新地址
  transferFn: {
    type: Function,
    default: null,
  },
  // 固定裁剪比例（宽/高，如 16/9、1）；>0 时默认按该比例锁定
  aspectRatio: {
    type: Number,
    default: 0,
  },
  // 是否允许用户调整比例（勾选/取消锁定开关）；固定比例场景可关闭
  allowRatioAdjust: {
    type: Boolean,
    default: true,
  },
  // 是否允许裁剪框拖出图片范围；默认不允许（只裁图片本身，越界会被拉回图内）
  allowDragOut: {
    type: Boolean,
    default: false,
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

const cropImgEl = ref(null);
const loading = ref(false);
const loadError = ref('');
// 实际参与裁剪的源：无 CORS 的远程图会被转存为站内地址后替换
const workingSrc = ref('');
// 远程源转换出的本地 blob URL（需手动释放）
let workingObjectUrl = '';
// 加载链令牌：防止并发/过期链把已撤销的 URL 写回工作源
let loadEpoch = 0;
const stageText = ref('');
const imgInfo = ref({ height: 0, width: 0 });
// 是否锁定裁剪比例为原图比例
const ratioLocked = ref(true);

const format = ref('keep');
const quality = ref(90);
const scalePercent = ref(100);
// 裁剪结果的自然像素尺寸（选区可视尺寸按图片自然比例换算）
const cropDims = ref({ height: 0, width: 0 });
// 宽高输入框（自然像素）：键入即实时改选区，锁定比例时自动联动另一值
const inputWidthText = ref('');
const inputHeightText = ref('');
const inputWidthFocused = ref(false);
const inputHeightFocused = ref(false);

const processedSize = ref(0);
const processedDims = ref({ height: 0, width: 0 });
const processing = ref(false);
const confirming = ref(false);
// 裁剪器就绪标记（cropper-image load 后 $toCanvas() 才可用）
const cropperReady = ref(false);
let previewToken = 0;
// cropperjs 实例（含 canvas 状态，不做响应式代理）
let cropperInstance = null;

const imgReady = computed(() => Boolean(imgInfo.value.width));

// 远程 http(s) 源加 crossorigin=anonymous 以便 canvas 导出；
// blob:/data: 与同源不加（blob 源带 crossorigin 在 Chromium 下会加载失败）
const imgCrossOrigin = computed(() =>
  /^https?:/i.test(workingSrc.value) ? 'anonymous' : undefined,
);

const savedPercent = computed(() => {
  if (!props.originalSize || !processedSize.value) return 0;
  return Math.round((1 - processedSize.value / props.originalSize) * 100);
});

// 用户是否可调整比例；不允许时恒锁定
const ratioLockedEffective = computed(() =>
  props.allowRatioAdjust ? ratioLocked.value : true,
);

// 裁剪比例：固定比例 > 原图比例；解锁后为自由比例（NaN）
const stencilAspectRatio = computed(() => {
  if (!ratioLockedEffective.value) {
    return Number.NaN;
  }
  if (props.aspectRatio > 0) {
    return props.aspectRatio;
  }
  if (!imgInfo.value.width || !imgInfo.value.height) {
    return Number.NaN;
  }
  return imgInfo.value.width / imgInfo.value.height;
});

// 等比缩放滑块仅在比例锁定时有意义；自由比例直接输入宽高
const scaleSliderVisible = computed(() => ratioLockedEffective.value);

// 实时输出尺寸（只读）：裁剪结果自然像素按缩放比例换算；
// 选区拖动（cropDims 变化）或滑杆拖动（scalePercent 变化）都会即时刷新
const displayDims = computed(() => {
  const { height, width } = cropDims.value;
  if (!width || !height) {
    return { height: 0, width: 0 };
  }
  const scale = scalePercent.value / 100;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
});

// canvas.toBlob 输出类型：显式格式按选择；原格式按扩展名推断（浏览器不支持时 toBlob 回退 png）
const cropperOutputMime = computed(() => {
  if (format.value !== 'keep') {
    return format.value;
  }
  const ext = props.fileName.split('.').pop()?.toLowerCase() || '';
  return (
    { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] ||
    'image/png'
  );
});

function closeModal() {
  emit('update:visible', false);
}

function revokeWorkingObjectUrl() {
  if (workingObjectUrl) {
    URL.revokeObjectURL(workingObjectUrl);
    workingObjectUrl = '';
  }
}

async function fetchSourceBlob(url) {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status}`);
  }
  return response.blob();
}

function destroyCropper() {
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  cropperReady.value = false;
}

function initCropper() {
  const el = cropImgEl.value;
  if (!el) {
    // 不静默返回：否则表现为「空白、无报错、无反应」
    loadError.value = '裁剪区域初始化失败，请重试';
    return;
  }
  destroyCropper();
  // 初始选区覆盖整张图，并按当前比例锁注入裁剪比例（NaN 为自由比例）
  cropperInstance = createCropper(el, {
    template: buildCropperTemplate(stencilAspectRatio.value),
  });
  const image = cropperInstance.getCropperImage();
  const selection = cropperInstance.getCropperSelection();
  // 用 $ready() 而非 load 事件：缓存图片会在 createCropper 插入元素时同步加载完，
  // 之后再挂 load 监听会错过事件；$ready() 在已就绪时立即 resolve。
  void image?.$ready?.().then(onCropperImageLoad).catch(onCropperImageError);
  selection?.addEventListener('change', onSelectionChange);
  // 滚轮/双指缩放与图片滑动经 canvas 的 action 事件派发：
  // 图片变换后选区可能越出图片（或裁剪尺寸变化），统一在此约束与重测
  cropperInstance.getCropperCanvas()?.addEventListener('action', onCanvasAction);
}

function onCropperImageLoad() {
  cropperReady.value = true;
  ensureInitialSelection();
  updateCropDims();
  schedulePreview();
}

// 初始选区由库的 initial-coverage + aspect-ratio 计算（图片视觉内接盒、居中）。
// 兜底：若因时序未生成（width 为 0），按图片视觉盒补一个——
// 注意选区坐标是画布可视空间，不能用图片自然像素。
function ensureInitialSelection() {
  const selection = cropperInstance?.getCropperSelection();
  if (!selection || selection.width > 0) return;
  const image = cropperInstance?.getCropperImage();
  const canvas = cropperInstance?.getCropperCanvas();
  if (!image || !canvas) return;
  const canvasRect = canvas.getBoundingClientRect();
  const imageRect = image.getBoundingClientRect();
  const x = imageRect.left - canvasRect.left;
  const y = imageRect.top - canvasRect.top;
  let width = imageRect.width;
  let height = imageRect.height;
  const ratio = selection.aspectRatio;
  if (Number.isFinite(ratio) && ratio > 0) {
    if (width / height > ratio) {
      width = height * ratio;
    } else {
      height = width / ratio;
    }
  }
  selection.$change(
    x + (imageRect.width - width) / 2,
    y + (imageRect.height - height) / 2,
    width,
    height,
  );
}

// 裁剪选区的自然像素尺寸。
// 选区盒子的 getBoundingClientRect 是未取整的实时渲染宽（可避开库在 $initSelection
// 里 Math.round 选区宽高造成的二次取整→全图裁剪偶发少 1px）；但它是页面像素，
// 含模态/CSS 缩放。故用画布元素的“视觉宽 / 布局宽”比值（getBoundingClientRect
// 含变换、offsetWidth 不含）把选区宽高换算回画布内部坐标，再除以图片变换矩阵的
// 缩放比（Math.hypot(a,b)，旋转不变）得到原图像素。
// 注意：cropper-image 宿主盒子尺寸为 0（图片靠内部 shadow <img> 的 transform 显示），
// 故不能读图片宿主的 rect，缩放比统一取图片变换矩阵。
// 兜底：布局未就绪（rect 为 0）时回落到选区对象的取整宽高 ÷ 变换缩放比。
function getCropNaturalDims() {
  const selection = cropperInstance?.getCropperSelection();
  if (!selection) return null;
  const imageEl = cropperInstance?.getCropperImage();
  if (!imageEl) return null;
  const [a = 0, b = 0] = imageEl.$getTransform();
  const scale = Math.hypot(a, b);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const selRect = selection.getBoundingClientRect();
  let selW = selRect.width;
  let selH = selRect.height;
  const canvasEl = cropperInstance?.getCropperCanvas();
  if (canvasEl && selRect.width > 0) {
    const cr = canvasEl.getBoundingClientRect();
    if (cr.width > 0 && canvasEl.offsetWidth > 0) {
      const pageScale = cr.width / canvasEl.offsetWidth;
      if (pageScale > 0) {
        selW /= pageScale;
        selH /= pageScale;
      }
    }
  }
  if (!selW || !selH) {
    selW = selection.width;
    selH = selection.height;
  }
  if (!selW || !selH) return null;
  return {
    width: Math.max(1, Math.round(selW / scale)),
    height: Math.max(1, Math.round(selH / scale)),
  };
}

function updateCropDims() {
  const dims = getCropNaturalDims();
  if (dims) {
    cropDims.value = dims;
  }
  syncInputFields();
}

// 图片在画布可视空间的轴对齐包围盒（选区越界约束用）。
// cropper-image 宿主盒子尺寸为 0，不能读其 rect；改用图片变换矩阵
// （CSS matrix(a,b,c,d,e,f)：x'=a·x+c·y+e，y'=b·x+d·y+f）把自然尺寸
// 四角映射到画布坐标后取 min/max，天然兼容旋转后的图片。
function getImageAABBInCanvas() {
  const imageEl = cropperInstance?.getCropperImage();
  if (!imageEl || !imgInfo.value.width || !imgInfo.value.height) return null;
  const matrix = imageEl.$getTransform?.();
  if (!Array.isArray(matrix) || matrix.length < 6) return null;
  const [a, b, c, d, e, f] = matrix;
  const { height, width } = imgInfo.value;
  const xs = [];
  const ys = [];
  for (const [u, v] of [[0, 0], [width, 0], [0, height], [width, height]]) {
    xs.push(a * u + c * v + e);
    ys.push(b * u + d * v + f);
  }
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
}

// 把选区约束回图片范围（allowDragOut=false 时）：
// 先按比例（如有）等比缩到能放进图片，再把位置夹回图片包围盒内
function clampSelectionToImage() {
  if (props.allowDragOut) return;
  const selection = cropperInstance?.getCropperSelection();
  if (!selection || !selection.width || !selection.height) return;
  const box = getImageAABBInCanvas();
  if (!box) return;
  const maxWidth = box.x1 - box.x0;
  const maxHeight = box.y1 - box.y0;
  if (!(maxWidth > 0) || !(maxHeight > 0)) return;
  const ratio =
    Number.isFinite(selection.aspectRatio) && selection.aspectRatio > 0
      ? selection.aspectRatio
      : 0;
  let width = selection.width;
  let height = selection.height;
  if (ratio > 0) {
    const factor = Math.min(1, maxWidth / width, maxHeight / height);
    if (factor < 1) {
      width *= factor;
      height *= factor;
    }
  } else {
    width = Math.min(width, maxWidth);
    height = Math.min(height, maxHeight);
  }
  const x = Math.min(Math.max(selection.x, box.x0), box.x1 - width);
  const y = Math.min(Math.max(selection.y, box.y0), box.y1 - height);
  if (
    width === selection.width &&
    height === selection.height &&
    x === selection.x &&
    y === selection.y
  ) {
    return;
  }
  selection.$change(x, y, width, height, ratio > 0 ? ratio : Number.NaN);
}

// 滚轮/双指缩放与图片滑动后同步约束与重测（微任务确保图片矩阵已更新）
function onCanvasAction(event) {
  const action = event?.detail?.action;
  if (action === 'scale' || action === 'move') {
    queueMicrotask(() => {
      clampSelectionToImage();
      updateCropDims();
    });
  }
}

// 把输入的自然像素宽高应用到选区：视觉尺寸 = 自然尺寸 × 图片变换缩放比，
// 以选区中心为锚扩展/收缩；比例锁定时库会按 aspectRatio 校正视觉比例
function applyDimsToSelection(width, height) {
  const selection = cropperInstance?.getCropperSelection();
  const imageEl = cropperInstance?.getCropperImage();
  if (!selection || !imageEl || !width || !height) return;
  const [a = 0, b = 0] = imageEl.$getTransform();
  const scale = Math.hypot(a, b);
  if (!Number.isFinite(scale) || scale <= 0) return;
  const centerX = selection.x + selection.width / 2;
  const centerY = selection.y + selection.height / 2;
  selection.$change(
    centerX - (width * scale) / 2,
    centerY - (height * scale) / 2,
    width * scale,
    height * scale,
    selection.aspectRatio,
  );
}

// 宽高输入 → 选区（键入即生效）。锁定比例时输入一个值按比例联动另一个；
// 自由比例时另一个值维持不变
function applyInputDims(which) {
  if (!cropperReady.value) return;
  const ratio = stencilAspectRatio.value;
  const locked = Number.isFinite(ratio) && ratio > 0;
  if (which === 'width') {
    const width = Math.round(Number(inputWidthText.value));
    if (!Number.isFinite(width) || width <= 0) return;
    const height = locked
      ? Math.max(1, Math.round(width / ratio))
      : Math.round(Number(inputHeightText.value));
    if (!Number.isFinite(height) || height <= 0) return;
    applyDimsToSelection(width, height);
  } else {
    const height = Math.round(Number(inputHeightText.value));
    if (!Number.isFinite(height) || height <= 0) return;
    const width = locked
      ? Math.max(1, Math.round(height * ratio))
      : Math.round(Number(inputWidthText.value));
    if (!Number.isFinite(width) || width <= 0) return;
    applyDimsToSelection(width, height);
  }
}

function onSizeFieldInput(which, event) {
  const { value } = event.target;
  if (which === 'width') {
    inputWidthText.value = value;
  } else {
    inputHeightText.value = value;
  }
  applyInputDims(which);
}

function onSizeFieldBlur(which) {
  if (which === 'width') {
    inputWidthFocused.value = false;
  } else {
    inputHeightFocused.value = false;
  }
  // 失焦时用实际裁剪尺寸回填（清掉无效/半截输入）
  syncInputFields(true);
}

// 把 cropDims 回写输入框：聚焦中的字段仅在实际值变化（如越界被约束回图片）
// 时改写，避免打断输入；另一字段按联动结果实时刷新
function syncInputFields(force = false) {
  const { height, width } = cropDims.value;
  if (!width || !height) return;
  if (
    force ||
    !inputWidthFocused.value ||
    Math.round(Number(inputWidthText.value)) !== width
  ) {
    inputWidthText.value = String(width);
  }
  if (
    force ||
    !inputHeightFocused.value ||
    Math.round(Number(inputHeightText.value)) !== height
  ) {
    inputHeightText.value = String(height);
  }
}

// 取选区画布：$toCanvas() 默认输出为显示分辨率，换算成自然像素尺寸再出图，
// 保证裁剪输出为原图分辨率
async function getSelectionCanvas() {
  const selection = cropperInstance?.getCropperSelection();
  if (!selection) return null;
  const dims = getCropNaturalDims();
  if (!dims) return selection.$toCanvas();
  return selection.$toCanvas({ width: dims.width, height: dims.height });
}

function onCropperImageError() {
  destroyCropper();
  loadError.value = '图片加载失败：图片过大或地址失效，无法在线裁剪';
}

// change 事件在库赋值新坐标前同步派发，监听器里读到的是上一次状态；
// 延迟到微任务：等库赋值/渲染完成后再约束与测量，保证实时尺寸精确
function onSelectionChange() {
  queueMicrotask(() => {
    clampSelectionToImage();
    updateCropDims();
    if (cropperReady.value) schedulePreview();
  });
}

function rotateCropper() {
  // $rotate 的参数是弧度；传 '90deg' 字符串由库内部转换
  cropperInstance?.getCropperImage()?.$rotate('90deg');
  // 旋转改变图片变换矩阵，选区可能越出图片且自然像素映射随之改变
  clampSelectionToImage();
  updateCropDims();
}

// 加载一个 Image 元素；withCrossOrigin 用于远程图探测 CORS 可读性
function loadImageElement(src, withCrossOrigin) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (withCrossOrigin) {
      img.crossOrigin = 'anonymous';
    }
    img.src = src;
    img.addEventListener('load', () => resolve(img), { once: true });
    img.addEventListener(
      'error',
      () => reject(new Error(`image load failed: ${src}`)),
      { once: true },
    );
  });
}

function adoptLoadedImage(img) {
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error('empty image');
  }
  imgInfo.value = {
    width: img.naturalWidth,
    height: img.naturalHeight,
  };
}

// 预读图片真实尺寸（信息展示 + 比例锁基准），并准备实际参与裁剪的源：
// - blob:/data: 直接使用
// - http(s) 先带 crossOrigin 探测（保证 canvas 可导出）；
//   无 CORS 时若提供 transferFn 则服务端转存为站内地址后重试
async function loadImage() {
  const epoch = ++loadEpoch;
  loadError.value = '';
  loading.value = true;
  stageText.value = '';
  destroyCropper();
  // 先清空工作源中断模板 img 的在途加载，再撤销旧 URL；
  // 否则大图加载途中取消/重开，撤销会令在途请求报 blob ERR_FILE_NOT_FOUND
  workingSrc.value = '';
  revokeWorkingObjectUrl();
  processing.value = false;
  imgInfo.value = { height: 0, width: 0 };
  processedSize.value = 0;
  processedDims.value = { height: 0, width: 0 };
  if (!props.src) {
    loadError.value = '缺少图片地址';
    loading.value = false;
    return;
  }
  let source = props.src;
  const isRemote = /^https?:/i.test(source);
  try {
    if (isRemote) {
      try {
        const img = await loadImageElement(source, true);
        if (epoch !== loadEpoch) return;
        adoptLoadedImage(img);
      } catch (error) {
        if (epoch !== loadEpoch) return;
        console.error('[app-editor] 裁剪图片跨域读取失败:', source, error);
        if (!props.transferFn) {
          loadError.value =
            '该图片所在域名未开放跨域读取（CORS），无法在线裁剪';
          return;
        }
        // 转存为站内地址后重试（无跨域限制，canvas 可正常导出）
        stageText.value = '跨域图片转存中，请稍候...';
        const transferred = await props.transferFn(source);
        if (epoch !== loadEpoch) return;
        if (!transferred) {
          throw new Error('transfer returned empty url', { cause: error });
        }
        source = transferred;
        const img = await loadImageElement(source, false);
        if (epoch !== loadEpoch) return;
        adoptLoadedImage(img);
      }
      // 远程源统一转成本地 blob URL 再交给裁剪器：
      // ① 全新 URL 在元素连接时不可能 complete，规避 cropper-image 的同步加载竞态
      //    （缓存图片会在 createCropper 插入时就跑完内部 load：事件错过、canvas 未布局
      //    导致 contain 适配错误、选区初始化异常）
      // ② blob 同源，canvas 导出无跨域污染
      const blob = await fetchSourceBlob(source);
      // 过期链到此终止：连对象 URL 都不创建，避免把已撤销 URL 写回工作源
      if (epoch !== loadEpoch) return;
      // 创建与赋值同步完成，无 await 间隔，不会被其他加载链交错
      workingObjectUrl = URL.createObjectURL(blob);
      workingSrc.value = workingObjectUrl;
    } else {
      // blob:/data: 源：仍需预检拿真实尺寸（imgReady 依赖它才会渲染 img），
      // 但不能加 crossOrigin（blob 带 crossorigin 在 Chromium 下会加载失败）
      const img = await loadImageElement(source, false);
      if (epoch !== loadEpoch) return;
      adoptLoadedImage(img);
      workingSrc.value = source;
    }
    // 挂载裁剪用 img，下一帧初始化 cropperjs
    await nextTick();
    if (epoch !== loadEpoch) return;
    initCropper();
  } catch (error) {
    console.error('[app-editor] 裁剪图片加载失败:', source, error);
    loadError.value = /^blob:/i.test(source)
      ? '图片无法加载：源文件可能已被释放或不受支持，请重新选择'
      : '图片无法加载：地址失效或服务不可达';
  } finally {
    // 仅当前链收尾状态，避免过期链把 loading 复位或清空阶段文案
    if (epoch === loadEpoch) {
      loading.value = false;
      stageText.value = '';
    }
  }
}

function onImgError() {
  // 空源占位（工作源尚未就绪）不报错：img 带空 src 会解析为页面 URL 并必然解码失败
  if (!workingSrc.value) return;
  destroyCropper();
  loadError.value = '图片加载失败：图片过大或地址失效，无法在线裁剪';
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

function canvasToBlob(canvas, mime) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob failed'));
      },
      mime,
      1,
    );
  });
}

// 组装 Compressor 参数：等比缩放下只传宽，高由 Compressor 按裁剪结果比例自适应，
// 避免拉伸变形。cropWidth 为裁剪结果的自然像素宽度（取自画布）
function buildCompressOptions(cropWidth) {
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
  if (scalePercent.value < 100 && cropWidth > 0) {
    options.width = Math.max(
      1,
      Math.round((cropWidth * scalePercent.value) / 100),
    );
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

// 防抖预览：选区 → 自然分辨率画布 → toBlob → Compressor → 回显处理后大小与分辨率
function runPreview() {
  if (!imgReady.value || !cropperReady.value) return;
  const token = ++previewToken;
  processing.value = true;
  // 兜底：极端情况下编码失败不回调，避免"处理中"永久悬挂
  setTimeout(() => {
    if (token === previewToken) processing.value = false;
  }, 30_000);
  void runPreviewFor(token);
}

async function runPreviewFor(token) {
  try {
    const canvas = await getSelectionCanvas();
    if (!canvas || token !== previewToken) return;
    const blob = await canvasToBlob(canvas, cropperOutputMime.value);
    if (token !== previewToken) return;
    const options = buildCompressOptions(canvas.width);
    new Compressor(blob, {
      ...options,
      success: (result) => {
        if (token !== previewToken) return;
        applyProcessedResult(result);
        processing.value = false;
      },
      error: (error) => {
        console.error('[app-editor] 图片压缩失败:', error);
        if (token === previewToken) processing.value = false;
      },
    });
  } catch (error) {
    console.error('[app-editor] 图片处理预览失败:', error);
    if (token === previewToken) processing.value = false;
  }
}

const schedulePreview = debounce(() => {
  runPreview();
}, 250);

// 确认：按当前参数压缩一次，回传最新 File
async function confirmCrop() {
  if (!imgReady.value || !cropperReady.value || confirming.value) return;
  confirming.value = true;
  // 兜底：回调异常时不让按钮永久悬挂
  setTimeout(() => {
    confirming.value = false;
  }, 30_000);
  try {
    const canvas = await getSelectionCanvas();
    if (!canvas) {
      confirming.value = false;
      return;
    }
    const blob = await canvasToBlob(canvas, cropperOutputMime.value);
    const options = buildCompressOptions(canvas.width);
    new Compressor(blob, {
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
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      format.value = 'keep';
      quality.value = 90;
      scalePercent.value = 100;
      ratioLocked.value = true;
      // 清空裁剪结果尺寸（选区就绪后由实时测量重新填充）
      cropDims.value = { height: 0, width: 0 };
      inputWidthText.value = '';
      inputHeightText.value = '';
      loadImage();
    } else {
      // 关闭时只停预览、销毁裁剪器并清空工作源（中断在途加载），
      // 不撤销对象 URL：撤销与仍在加载/重绘的 img 竞速会触发
      // blob ERR_FILE_NOT_FOUND；URL 会在下次打开（替换）或卸载时释放
      schedulePreview.cancel();
      destroyCropper();
      workingSrc.value = '';
    }
  },
);

watch([format, quality, scalePercent], () => {
  if (imgReady.value) schedulePreview();
});

// 解锁后等比缩放无意义（宽高已可独立输入），固定回 100%
watch(ratioLockedEffective, (locked) => {
  if (!locked) {
    scalePercent.value = 100;
  }
});

// 比例变化同步给选区（触发选区按新比例重置），下一帧再取尺寸
watch(stencilAspectRatio, () => {
  const selection = cropperInstance?.getCropperSelection();
  if (selection) {
    selection.aspectRatio = stencilAspectRatio.value || Number.NaN;
  }
  nextTick(updateCropDims);
});

onBeforeUnmount(() => {
  schedulePreview.cancel();
  destroyCropper();
  revokeWorkingObjectUrl();
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
            <img
              v-else-if="imgReady && workingSrc"
              ref="cropImgEl"
              :alt="fileName"
              class="block max-w-full"
              :crossorigin="imgCrossOrigin"
              :src="workingSrc"
              @error="onImgError"
            />
            <!-- 大图解码遮罩：预检完成但裁剪器尚未就绪 -->
            <div
              v-if="imgReady && !cropperReady && !loadError"
              class="absolute inset-0 z-10 flex items-center justify-center bg-card/60 text-xs text-muted-foreground"
            >
              {{ stageText || '正在加载图片，大图可能需要几秒...' }}
            </div>
            <div
              v-else-if="!imgReady && !loadError"
              class="absolute inset-0 z-10 flex items-center justify-center bg-card/60 text-xs text-muted-foreground"
            >
              {{ loading ? stageText || '正在加载图片...' : '' }}
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

            <div v-if="scaleSliderVisible" class="md:col-span-2">
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
              <div
                class="mb-1.5 flex items-center justify-between text-xs font-medium text-foreground"
              >
                <span>输出尺寸</span>
                <span class="text-[11px] font-normal text-muted-foreground">
                  输入宽高，实时调整裁剪框
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <input
                  class="w-24 rounded-md border border-border bg-transparent px-2 py-1 text-right font-mono text-foreground outline-none transition-colors [appearance:textfield] focus:border-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  min="1"
                  step="1"
                  type="number"
                  :value="inputWidthText"
                  @blur="onSizeFieldBlur('width')"
                  @focus="inputWidthFocused = true"
                  @input="onSizeFieldInput('width', $event)"
                />
                <span class="text-muted-foreground">×</span>
                <input
                  class="w-24 rounded-md border border-border bg-transparent px-2 py-1 text-right font-mono text-foreground outline-none transition-colors [appearance:textfield] focus:border-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  min="1"
                  step="1"
                  type="number"
                  :value="inputHeightText"
                  @blur="onSizeFieldBlur('height')"
                  @focus="inputHeightFocused = true"
                  @input="onSizeFieldInput('height', $event)"
                />
                <span class="text-muted-foreground">px</span>
                <template v-if="scaleSliderVisible">
                  <span class="ml-auto font-mono text-muted-foreground">
                    缩放 {{ scalePercent }}% →
                  </span>
                  <span class="font-mono text-foreground">
                    {{ displayDims.width || '?' }} × {{ displayDims.height || '?' }} px
                  </span>
                </template>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-4 md:col-span-2">
              <label
                v-if="allowRatioAdjust"
                class="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
              >
                <input
                  v-model="ratioLocked"
                  type="checkbox"
                  class="accent-primary"
                />
                {{
                  aspectRatio > 0
                    ? '锁定比例（取消后可自由调整裁剪框比例）'
                    : '锁定原图比例（取消后可自由调整裁剪框比例）'
                }}
              </label>
              <span
                v-else-if="aspectRatio > 0"
                class="text-[11px] text-muted-foreground"
              >
                已按固定比例裁剪
              </span>
              <button
                class="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
                type="button"
                @click="rotateCropper"
              >
                <svg
                  class="size-3.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                旋转 90°
              </button>
              <span class="text-[11px] text-muted-foreground">
                滚轮 / 双指可缩放图片
              </span>
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
            :disabled="!imgReady || !cropperReady || confirming"
            type="button"
            @click="confirmCrop"
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
