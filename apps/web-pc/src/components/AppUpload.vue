<script setup lang="ts">
import type { Ref } from 'vue';

import { h } from 'vue';
import 'vue-cropper/dist/index.css';
import { VueCropper } from 'vue-cropper/dist/vue-cropper.es.js';

import {
  Button,
  Card,
  Col,
  Drawer,
  Image,
  InputNumber,
  message,
  Modal,
  Row,
  Select,
  Slider,
  SpaceCompact,
  Spin,
} from 'antdv-next';
import Compressor from 'compressorjs';
import { debounce } from 'lodash-es';

import { upload as uploadFile } from '#/api';
import AppOnlyoffice from '#/components/AppOnlyoffice.vue';
import {
  base64ToFile,
  blobUrlToFile,
  createObjectURL,
  formatSize,
  getInfo,
  isBase64,
  videoUrlToBlobUrl,
} from '#/utils/file.js';
import {
  downloadBlob,
  fetchFileBytes,
  safeFileName,
} from '#/utils/render-docx';

interface FileItem {
  url: string;
  file?: Blob | File | FileDescriptor;
  [key: string]: any;
}

interface FileDescriptor {
  category?: null | number | string;
  name?: string;
  size?: number;
  type?: string;
}

interface PreviewInfo {
  extension: string;
  name: string;
  type: string;
  url: string;
}

interface CropperOption {
  size: number;
  full: boolean;
  outputType: string;
  canMove: boolean;
  fixedBox: boolean;
  original: boolean;
  canMoveBox: boolean;
  autoCrop: boolean;
  autoCropWidth: number;
  autoCropHeight: number;
  centerBox: boolean;
  high: boolean;
  max: number;
  fixed: boolean;
  fixedWidth: number;
  fixedHeight: number;
}

interface CompressorOption {
  quality: number;
  width: number;
  height: number;
}

interface CropperInstance {
  getCropBlob?: (callback: (data: Blob) => void) => void;
}

const props = defineProps({
  modelValue: {
    default: '',
    type: [String, Array, File] as PropType<File | FileItem[] | string>,
  },
  value: {
    default: '',
    type: [String, Array, File] as PropType<File | FileItem[] | string>,
  },
  label: {
    default: '',
    type: String,
  },
  fieldName: {
    default: '',
    type: String,
  },
  fileType: {
    default: 'image',
    type: String,
  },
  accept: {
    default: '',
    type: String,
  },
  multiple: {
    default: false,
    type: Boolean,
  },
  // 只读/禁用：仅展示已有文件（图片/视频网格、文件列表），隐藏上传入口与删除/裁剪等操作
  disabled: {
    default: false,
    type: Boolean,
  },
  readonly: {
    default: false,
    type: Boolean,
  },
  scene: {
    default: '',
    type: String,
  },
  itemWidth: {
    default: '150px',
    type: String,
  },
  aspectRatio: {
    default: 1,
    type: Number,
  },
  defaultCropWidth: {
    default: 0,
    type: Number,
  },
  defaultCropHeight: {
    default: 0,
    type: Number,
  },
});

const emit = defineEmits([
  'update:model-value',
  'update:modelValue',
  'update:value',
  'snapshot',
]);

// 兼容 antdv-next v-model:value 和 Vue3 v-model
const currentValue = computed(() => props.modelValue || props.value);

// 只读查看：仅展示已有文件，隐藏上传入口与删除/裁剪/拖拽等操作
const viewOnly = computed(() => props.disabled || props.readonly);

function emitValue(val: any) {
  emit('update:modelValue', val);
  emit('update:value', val);
}

const files: Ref<File[]> = ref([]);
const list: Ref<FileItem[]> = ref([]);
const inputRef: Ref<HTMLInputElement | null> = ref(null);
const dragover = ref(false);
const previewDialog = ref(false);
const previewLoading = ref(false);
const officeDocument = ref<null | Record<string, any>>(null);
let previewSequence = 0;
const cropper = ref<CropperInstance | null>(null);
const video = ref<HTMLVideoElement | null>(null);
const videoCanvas = ref<HTMLCanvasElement | null>(null);

// 文件类型相关
const accepts: Record<string, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  file: '*',
};
const acceptValue: Ref<string> = ref(accepts.image ?? 'image/*');
const typeIcons = [
  {
    name: 'preview',
    types: ['image', 'video'],
    class: 'icon-[mdi--fullscreen] w-4 h-4',
  },

  { name: 'crop', types: ['image'], class: 'icon-[mdi--crop] w-4 h-4' },
  {
    name: 'snapshot',
    types: ['video'],
    class: 'icon-[mdi--camera-outline] w-4 h-4',
  },
  {
    name: 'remove',
    types: ['image', 'video', 'file'],
    class: 'icon-[mdi--delete-outline] w-4 h-4',
  },
];

// 裁剪相关
const fileOrgInfo = ref<Record<string, any>>({});
const cropperDialog = ref(false);
const imageUrl = ref('');
const cropperOption: Ref<CropperOption> = ref({
  size: 1,
  full: true,
  outputType: 'webp',
  canMove: true,
  fixedBox: false,
  original: false,
  canMoveBox: true,
  autoCrop: true,
  autoCropWidth: 750,
  autoCropHeight: 340,
  centerBox: true,
  high: true,
  max: 99_999,
  fixed: true,
  fixedWidth: 1920,
  fixedHeight: 1080,
});

// 压缩相关
const mimeTypes = [
  { type: 'image/webp', extension: 'webp' },
  { type: 'image/jpeg', extension: 'jpg' },
  { type: 'image/png', extension: 'png' },
];
const compressorOption: Ref<CompressorOption> = ref({
  quality: 90,
  width: 0,
  height: 0,
});
const compressedFile = shallowRef<File | null>(null);
const compressedFileSize = ref(0);

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}
const fixedNumber = computed(() => {
  const w = cropperOption.value.fixedWidth || 1;
  const h = cropperOption.value.fixedHeight || 1;
  const g = gcd(w, h);
  return [w / g, h / g];
});

// 视频截图相关
const videoUrl = ref('');
const snapshotBase64 = ref('');
const snapshotDialog = ref(false);

// 上传进度
const uploadProgress = ref(0);
const uploading = ref(false);

// 拖拽排序相关
const draggedIndex = ref<null | number>(null);
const dragOverIndex = ref<null | number>(null);
const isDragging = ref(false);

// 初始化
function init() {
  acceptValue.value = props.accept || accepts[props.fileType] || '*';
}

// 监听 fileType 外部变化
watch(
  () => props.fileType,
  (val) => {
    acceptValue.value = accepts[val] || '*';
  },
);

// 监听裁剪对话框中输出格式变化，重新压缩
watch(
  () => cropperOption.value.outputType,
  () => {
    if (cropperDialog.value && cropper.value) {
      cropHandler();
    }
  },
);

// 监听裁剪对话框中压缩质量变化，重新压缩
watch(
  () => compressorOption.value.quality,
  () => {
    if (cropperDialog.value && cropper.value) {
      cropHandler();
    }
  },
);

// 处理文件变化
watch(files, async (newVal) => {
  if (newVal.length === 0) return;

  const newItems: FileItem[] = [];
  for (let i = 0; i < files.value.length; i++) {
    const file = files.value[i];
    if (!file) continue;
    const url = createObjectURL(file);
    newItems.push({ file, url });
  }

  if (props.multiple) {
    list.value.push(...newItems);
  } else {
    list.value = newItems.slice(0, 1);
  }

  updateModelValue();
});

// 同步外部数据变化
watch(
  currentValue,
  (_newVal) => {
    init();
    setValue();
  },
  { immediate: true, deep: true },
);

function isBlobFile(value: unknown): value is Blob | File {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

// 已上传文件使用 URL 回传；blob/data URL 或 File/Blob 仍是待上传文件。
function isPendingUpload(item: FileItem): boolean {
  return (
    (isBlobFile(item.file) ||
      /^(?:blob:|data:)/i.test(String(item.url || ''))) &&
    !isPersistedUrl(item.url)
  );
}

function isPersistedUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url.trim()) return false;
  return !/^(?:blob:|data:|https?:\/\/tmp\/)/i.test(url);
}

function absolutePreviewUrl(url: string): string {
  if (!url || /^(?:https?:|blob:|data:)/i.test(url)) return url;
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

function normalizeObjectItem(item: any): FileItem | null {
  if (isBlobFile(item)) {
    return { file: item, url: createObjectURL(item) };
  }
  if (!item || typeof item !== 'object') return null;

  const nestedFile = item.file;
  const url =
    (typeof item.url === 'string' && item.url) ||
    (typeof nestedFile?.url === 'string' && nestedFile.url) ||
    (typeof item.path === 'string' && item.path) ||
    '';
  if (!url) return null;

  const file = isBlobFile(nestedFile)
    ? nestedFile
    : nestedFile || {
        category: item.category ?? item.category_id ?? null,
        name: item.name,
        size: item.size,
        type: item.type,
      };
  return { ...item, file, url };
}

async function normalizeValueItem(item: any): Promise<FileItem | null> {
  if (typeof item === 'string') {
    if (item.startsWith('data:') || (isBase64(item) && !/[/:?#.]/.test(item))) {
      return { url: item, file: base64ToFile(item) };
    }
    if (item.startsWith('blob:')) {
      return {
        url: item,
        file: (await blobUrlToFile(item)) ?? undefined,
      };
    }
    return formatUrl(item);
  }

  const fileItem = normalizeObjectItem(item);
  if (!fileItem) return null;
  // 父级可能直接回传 { url: 'blob:...', file: { name, ... } }，
  // 与移动端一样把 blob URL 转成真实 File，避免编辑态重复提交时丢失文件。
  if (fileItem.url.startsWith('blob:') && !isBlobFile(fileItem.file)) {
    fileItem.file = (await blobUrlToFile(fileItem.url)) ?? fileItem.file;
  }
  return fileItem;
}

// 设置初始值：后端 file/image 字段统一返回 URL 数组，单文件控件也要取数组首项回显。
async function setValue() {
  const value = currentValue.value;
  let values: any[] = [];
  if (Array.isArray(value)) {
    values = props.multiple ? [...value] : value.slice(0, 1);
  } else if (value !== null && value !== undefined && value !== '') {
    values = [value];
  }

  list.value = [];
  for (const item of values) {
    const fileItem = await normalizeValueItem(item);
    if (fileItem) list.value.push(fileItem);
  }
}

// 更新模型值：远程/相对 URL 只回传字符串，本地 FileItem 保留对象供 upload() 处理。
function updateModelValue() {
  const arr = list.value.map((item) =>
    isPersistedUrl(item.url) && !isPendingUpload(item) ? item.url : item,
  );

  emitValue(props.multiple ? arr : arr[0] || null);
  files.value = [];
}

// 拖放相关函数
function handleDragOver(_e: DragEvent) {
  // 如果正在拖拽排序，不设置拖拽上传状态
  if (isDragging.value) return;

  dragover.value = true;
}

function handleDragLeave() {
  dragover.value = false;
}

function handleDrop(e: DragEvent) {
  dragover.value = false;

  // 如果正在拖拽排序，不处理文件上传
  if (isDragging.value) return;

  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    handleFiles(files);
  }
}

function fileFilter(files: File[]): File[] {
  if (acceptValue.value === '*') return files;

  return files.filter((item) => {
    const acceptTypes = acceptValue.value.split(',');
    const [mimeType = ''] = item.type.split('/');
    const [, extension] = item.name.split('.');

    // console.log('acceptTypes',acceptTypes,extension)
    return acceptTypes.some((type) => {
      if (type.includes('/')) {
        return (
          item.type === type ||
          (type.startsWith(mimeType) && type.includes('*'))
        );
      }
      return `${extension}` === type;
    });
  });
}

function handleFiles(fileList: File[] | FileList) {
  const _files = fileFilter([...fileList]);
  if (_files.length === 0) {
    message.error('文件类型不匹配！');
    return;
  }
  files.value = _files;
}

function choose() {
  inputRef.value?.click();
}

function inputChange(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files) handleFiles(target.files);
  target.value = ''; // 重置input，允许重复选择相同文件
}

const previewInfo = ref<PreviewInfo>({
  extension: '',
  name: '',
  type: '',
  url: '',
});
const previewItemIndex = ref<null | number>(null);
const previewDownloading = ref(false);

const imageExtensions = new Set([
  'avif',
  'bmp',
  'gif',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
]);
const videoExtensions = new Set(['avi', 'mkv', 'mov', 'mp4', 'ogg', 'webm']);
const officeExtensions = new Set([
  'csv',
  'doc',
  'docx',
  'odf',
  'odp',
  'ods',
  'odt',
  'pdf',
  'ppt',
  'pptx',
  'rtf',
  'txt',
  'xls',
  'xlsx',
]);

function fileCategory(item: FileItem): string {
  const direct =
    item.file && typeof item.file === 'object'
      ? ((item.file as any).category ?? (item.file as any).category_id)
      : undefined;
  const value = direct ?? item.category ?? item.category_id;
  if (value !== undefined && value !== null && value !== '') {
    return String(value);
  }
  try {
    return (
      new URL(item.url, window.location.origin).searchParams.get('category') ||
      ''
    );
  } catch {
    return '';
  }
}

function fileExtension(item: FileItem): string {
  const file = item.file;
  const name =
    (file && typeof file === 'object' && 'name' in file
      ? String(file.name || '')
      : '') ||
    String(item.name || '') ||
    String(item.url || '');
  const path = name.split(/[?#]/)[0] || '';
  const extension = path.split('.').pop()?.toLowerCase() || '';
  if (extension) return extension;

  const mime = file && typeof file === 'object' ? String(file.type || '') : '';
  return mime.split('/')[1]?.toLowerCase() || '';
}

function previewType(item: FileItem): string {
  const configuredType = String(props.fileType || '').toLowerCase();
  if (configuredType === 'image' || configuredType === 'video') {
    return configuredType;
  }

  // 与移动端 app-file-upload 保持一致：1=图片、2=视频、4~7=文档。
  const category = Number(fileCategory(item));
  if (category === 1) return 'image';
  if (category === 2) return 'video';

  const extension = fileExtension(item);
  // PDF 在预览抽屉内使用 iframe，交给浏览器原生 PDF 查看器。
  if (extension === 'pdf') return 'pdf';
  if (imageExtensions.has(extension)) return 'image';
  if (videoExtensions.has(extension)) return 'video';
  if (officeExtensions.has(extension)) return 'office';
  if (category >= 4) return 'document';
  return '';
}

function documentPreviewUrl(item: FileItem): string {
  const base = String(
    import.meta.env.VITE_GLOB_URL || window.location.origin,
  ).replace(/\/$/, '');
  const params = new URLSearchParams({
    file: absolutePreviewUrl(item.url),
  });
  const name = fileDisplayName(item);
  if (name) params.set('name', name);
  return `${base}/file-preview?${params.toString()}`;
}

async function loadOfficeDocument(
  item: FileItem,
  extension: string,
  sequence: number,
) {
  let bytes: Uint8Array;
  if (isBlobFile(item.file)) {
    bytes = new Uint8Array(await item.file.arrayBuffer());
  } else if (/^(?:blob:|data:)/i.test(item.url)) {
    const response = await fetch(item.url);
    if (!response.ok) throw new Error(`文件加载失败（${response.status}）`);
    bytes = new Uint8Array(await response.arrayBuffer());
  } else {
    bytes = await fetchFileBytes(item.url);
  }

  if (sequence !== previewSequence) return;

  officeDocument.value = {
    fileType: extension || 'pdf',
    key: `upload-preview-${Date.now()}-${extension}`,
    title: safeFileName(fileDisplayName(item) || `文件.${extension}`),
    buffer: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
  };
}

// 图标操作
function iconAction(action: string, index: number) {
  switch (action) {
    case 'crop': {
      crop(index);
      break;
    }
    case 'preview': {
      preview(index);
      break;
    }
    case 'remove': {
      remove(index);
      break;
    }
    case 'snapshot': {
      snapshot(index);
      break;
    }
  }
}

async function preview(index: number) {
  const item = list.value[index];
  if (!item?.url) {
    message.warning('文件地址无效');
    return;
  }

  const sequence = ++previewSequence;
  const extension = fileExtension(item);
  const type = previewType(item) || 'unsupported';
  const url = absolutePreviewUrl(item.url);

  officeDocument.value = null;
  previewLoading.value = false;

  previewItemIndex.value = index;
  previewInfo.value = {
    extension,
    name: fileDisplayName(item),
    type,
    url,
  };
  previewDialog.value = true;

  if (type !== 'office') return;

  previewLoading.value = true;
  try {
    await loadOfficeDocument(item, extension, sequence);
  } catch (error) {
    console.error('文件预览加载失败:', error);
    // 远程文件无法被浏览器直接读取时，退回后端文件预览页；
    // 这与移动端 H5 的 file-preview 处理一致。
    if (sequence === previewSequence) {
      previewInfo.value = {
        extension,
        name: fileDisplayName(item),
        type: 'document',
        url: documentPreviewUrl(item),
      };
    }
  } finally {
    if (sequence === previewSequence) previewLoading.value = false;
  }
}

function closePreview() {
  previewSequence += 1;
  previewDialog.value = false;
  previewLoading.value = false;
  previewDownloading.value = false;
  previewItemIndex.value = null;
  officeDocument.value = null;
}

async function downloadPreviewFile() {
  if (previewDownloading.value) return;
  const item =
    previewItemIndex.value === null ? null : list.value[previewItemIndex.value];
  const url = item?.url;
  if (!item || !url) return;

  previewDownloading.value = true;
  try {
    let blob;
    if (isBlobFile(item.file)) {
      blob = item.file;
    } else if (/^(?:blob:|data:)/i.test(url)) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`文件加载失败（${response.status}）`);
      blob = await response.blob();
    } else {
      const bytes = await fetchFileBytes(url);
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      blob = new Blob([buffer]);
    }
    downloadBlob(
      blob,
      safeFileName(
        previewInfo.value.name ||
          `文件.${previewInfo.value.extension || 'bin'}`,
      ),
    );
  } catch (error) {
    console.error('文件下载失败:', error);
    message.error('文件下载失败');
  } finally {
    previewDownloading.value = false;
  }
}

function remove(index: number) {
  list.value.splice(index, 1);
  updateModelValue();
}

// 裁剪相关函数
async function setCurrent(index: number) {
  const item = list.value[index];
  if (!item) return false;

  const file = item.file;
  let fileName = '';
  if (file instanceof File) {
    fileName = file.name;
  } else if (file && typeof file === 'object' && 'name' in file) {
    fileName = String(file.name || '');
  }
  fileOrgInfo.value = file?.size
    ? {
        name: fileName,
        size: file.size,
        type: file.type,
      }
    : ((await getInfo(item.url)) ?? {});

  fileOrgInfo.value.index = index;

  // 获取图片真实尺寸
  if (!fileOrgInfo.value.width || !fileOrgInfo.value.height) {
    try {
      const img = new window.Image();
      img.src = item.url;
      await new Promise((resolve, reject) => {
        img.addEventListener('load', resolve);
        img.addEventListener('error', reject);
      });
      fileOrgInfo.value.width = img.naturalWidth;
      fileOrgInfo.value.height = img.naturalHeight;
    } catch {
      fileOrgInfo.value.width = 0;
      fileOrgInfo.value.height = 0;
    }
  }
  return true;
}

const cropKey = ref(0);

async function crop(index: number) {
  if (!(await setCurrent(index))) return;
  imageUrl.value = list.value[index]?.url ?? '';
  compressedFile.value = null;
  compressedFileSize.value = 0;

  // 传入裁剪尺寸则使用，但不能超过原图尺寸，同时保持传入比例
  const imgW = fileOrgInfo.value.width || 1920;
  const imgH = fileOrgInfo.value.height || 1080;

  if (props.defaultCropWidth && props.defaultCropHeight) {
    // 裁剪框大小等比缩放至不超出原图范围
    const scaleX = imgW / props.defaultCropWidth;
    const scaleY = imgH / props.defaultCropHeight;
    const scale = Math.min(scaleX, scaleY);
    cropperOption.value.autoCropWidth = Math.round(
      props.defaultCropWidth * scale,
    );
    cropperOption.value.autoCropHeight = Math.round(
      props.defaultCropHeight * scale,
    );

    // 固定比例使用传入的原始值，锁定宽高比
    cropperOption.value.fixedWidth = cropperOption.value.autoCropWidth;
    cropperOption.value.fixedHeight = cropperOption.value.autoCropHeight;
  } else {
    cropperOption.value.fixedWidth = imgW;
    cropperOption.value.fixedHeight = imgH;
    cropperOption.value.autoCropWidth = imgW;
    cropperOption.value.autoCropHeight = imgH;
  }

  cropKey.value++;
  cropperDialog.value = true;

  // 等待 VueCropper 挂载完成后自动执行初始压缩
  nextTick(() => {
    setTimeout(() => {
      cropHandler();
    }, 300);
  });
}

const realTime = debounce((e: any) => {
  if (!fileOrgInfo.value.width) {
    fileOrgInfo.value.width = Number(e.img.width.replace('px', ''));
    fileOrgInfo.value.height = Number(e.img.height.replace('px', ''));

    // 仅当未传入自定义裁剪尺寸时，使用原图尺寸作为固定比例
    if (!props.defaultCropWidth && !props.defaultCropHeight) {
      cropperOption.value.fixedWidth = fileOrgInfo.value.width;
      cropperOption.value.fixedHeight = fileOrgInfo.value.height;
    }
  }
  cropHandler();
}, 50);

function cropHandler() {
  cropper.value?.getCropBlob?.((data: Blob) => {
    if (!data) return;

    const outputType = cropperOption.value.outputType;
    const typeIndex = mimeTypes.findIndex((v) => v.type === outputType);

    compressorOption.value.width = cropperOption.value.fixedWidth;
    compressorOption.value.height = cropperOption.value.fixedHeight;
    compress(
      data,
      outputType,
      `${Date.now()}.${mimeTypes[typeIndex]?.extension || 'jpg'}`,
    );
  });
}

// 压缩相关函数
function compress(blob: Blob, outputType?: string, fileName?: string) {
  new Compressor(blob, {
    quality: (compressorOption.value.quality - 1) / 100,
    mimeType: outputType || blob.type,
    width: compressorOption.value.width,
    height: compressorOption.value.height,
    success: (result: Blob | File) => {
      const file =
        result instanceof File && !fileName
          ? result
          : new File([result], fileName || 'compressed', { type: result.type });
      compressedFile.value = file;
      compressedFileSize.value = file.size;
    },
    error: (err: Error) => {
      console.error(err.message);
    },
  });
}

function handleSubmit() {
  cropHandler();
  cropperDialog.value = false;

  if (fileOrgInfo.value.index !== undefined && compressedFile.value) {
    list.value[fileOrgInfo.value.index] = {
      url: createObjectURL(compressedFile.value),
      file: compressedFile.value,
    };
    updateModelValue();
  }
}

// 视频截图相关函数
async function snapshot(index: number) {
  if (!(await setCurrent(index))) return;
  const url = list.value[index]?.url;
  if (!url) return;
  videoUrl.value = (await videoUrlToBlobUrl(url)) ?? '';
  snapshotDialog.value = true;
}

function takeSnapshot() {
  try {
    if (!video.value || !videoCanvas.value) return;

    videoCanvas.value.width = video.value.videoWidth;
    videoCanvas.value.height = video.value.videoHeight;

    const ctx = videoCanvas.value.getContext('2d');
    if (ctx) {
      ctx.drawImage(
        video.value,
        0,
        0,
        videoCanvas.value.width,
        videoCanvas.value.height,
      );
      snapshotBase64.value = videoCanvas.value.toDataURL('image/webp');

      try {
        const snapshotFile = base64ToFile(snapshotBase64.value);
        emit('snapshot', {
          field: props.fieldName,
          data: { file: snapshotFile, url: createObjectURL(snapshotFile) },
        });
      } catch (error) {
        console.error('Snapshot error:', error);
      }
      snapshotDialog.value = false;
    }
  } catch (error) {
    console.error('Take snapshot error:', error);
  }
}

// 拖拽排序相关函数
function handleDragStart(e: DragEvent, index: number) {
  if (!props.multiple || list.value.length <= 1) return;

  draggedIndex.value = index;
  isDragging.value = true;
  const dt = e.dataTransfer;
  if (dt) {
    dt.effectAllowed = 'move';
    dt.setData('text/html', e.target?.toString() || '');
  }

  // 阻止事件冒泡，防止触发父级的拖拽上传逻辑
  e.stopPropagation();
}

function handleDragEnd() {
  draggedIndex.value = null;
  dragOverIndex.value = null;
  isDragging.value = false;
}

function handleItemDragOver(e: DragEvent, index: number) {
  e.preventDefault();
  e.stopPropagation();
  const dt = e.dataTransfer;
  if (dt) {
    dt.dropEffect = 'move';
  }

  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    dragOverIndex.value = index;
  }
}

function handleItemDragLeave() {
  dragOverIndex.value = null;
}

function handleItemDrop(e: DragEvent, dropIndex: number) {
  e.preventDefault();
  e.stopPropagation();

  if (draggedIndex.value === null || draggedIndex.value === dropIndex) {
    handleDragEnd();
    return;
  }

  // 重新排列数组
  const draggedItem = list.value[draggedIndex.value];
  if (!draggedItem) {
    handleDragEnd();
    return;
  }
  const newList = [...list.value];

  // 移除被拖拽的项
  newList.splice(draggedIndex.value, 1);

  // 在新位置插入
  const adjustedDropIndex =
    draggedIndex.value < dropIndex ? dropIndex - 1 : dropIndex;
  newList.splice(adjustedDropIndex, 0, draggedItem);

  list.value = newList;
  updateModelValue();
  handleDragEnd();
}

// 上传函数
async function upload() {
  const uploadItems = list.value
    .filter(
      (item): item is FileItem & { file: File } =>
        item.file instanceof File && isPendingUpload(item),
    )
    .map((item) => item.file);

  if (uploadItems.length === 0) return list.value;

  const uploadTarget = props.multiple ? uploadItems : uploadItems[0];
  if (!uploadTarget) return list.value;

  uploading.value = true;
  try {
    const ret = await uploadFile(uploadTarget, { scene: props.scene }, (e) => {
      uploadProgress.value = Math.floor((e.progress ?? 0) * 100);
    });

    let results: string[] = [];
    if (props.multiple) {
      results = Array.isArray(ret)
        ? ret.filter((value): value is string => typeof value === 'string')
        : [];
    } else if (typeof ret === 'string') {
      results = [ret];
    }

    list.value = list.value.map((item) => {
      if (item.file instanceof File && isPendingUpload(item)) {
        const result = results.shift();
        if (result) {
          return { ...item, url: result };
        }
      }
      return item;
    });

    updateModelValue();
    return list.value;
  } catch (error) {
    console.error('Upload error:', error);
    message.error('上传失败');
    throw error;
  } finally {
    uploading.value = false;
  }
}

// 取文件展示名：Blob 无 name，File/FileDescriptor 有；缺省回退到 url
function fileDisplayName(item: FileItem): string {
  const f = item.file;
  if (f && typeof f === 'object' && 'name' in f && f.name) {
    return String(f.name);
  }
  if (item.name) return String(item.name);
  try {
    return decodeURIComponent(
      new URL(item.url, window.location.origin).pathname.split('/').pop() ||
        item.url,
    );
  } catch {
    return item.url || '';
  }
}

function formatUrl(urlString: string): FileItem {
  let url: null | URL = null;
  try {
    url = new URL(urlString, window.location.origin);
  } catch {
    // 保留无法解析的本地路径，仍允许上层显示/上传。
  }
  const params = url ? new URLSearchParams(url.search) : null;
  const pathname = url?.pathname || urlString.split(/[?#]/)[0] || '';
  let name = params?.get('name') || pathname.split('/').pop() || '';
  try {
    name = decodeURIComponent(name);
  } catch {
    // 使用原始文件名。
  }

  return {
    url: urlString,
    file: {
      size: Number(params?.get('size') || 0),
      name,
      category: params?.get('category') || params?.get('category_id'),
    },
  };
}

function isVideoUrl(url: string, file?: Blob | File | FileDescriptor): boolean {
  if (file?.type?.startsWith('video/')) return true;
  return /\.(?:mp4|webm|ogg|mov|avi|mkv)(?:\?.*)?$/i.test(url || '');
}

defineExpose({
  upload,
});
</script>

<template>
  <div>
    <!--    <div v-if="label" class="text-lg font-medium mb-2">{{ label }}</div>-->
    <slot name="default"></slot>
    <div
      class="py-2"
      :class="dragover ? 'bg-blue-50' : ''"
      style="width: 100%; min-height: 100px"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <Spin
        :spinning="uploading"
        :tip="uploading ? `上传中 ${uploadProgress}%` : ''"
      >
        <template v-if="['image', 'video'].includes(props.fileType)">
          <div
            class="upload-grid"
            :style="{
              '--aspect-ratio': props.aspectRatio,
              '--item-width': props.itemWidth,
            }"
          >
            <div
              v-for="(item, index) in list"
              :key="index"
              class="grid-item"
              :class="{
                dragging: draggedIndex === index,
                'drag-over': dragOverIndex === index,
                'sortable-item': props.multiple && list.length > 1,
              }"
              @dragstart="handleDragStart($event, index)"
              @dragend="handleDragEnd"
              @dragover="handleItemDragOver($event, index)"
              @dragleave="handleItemDragLeave"
              @drop="handleItemDrop($event, index)"
              @dragenter.prevent
              :draggable="props.multiple && list.length > 1"
            >
              <div class="square-container">
                <div
                  class="media-item"
                  :class="[
                    props.fileType === 'image' ? '' : 'bg-black',
                    {
                      dragging: draggedIndex === index,
                      'drag-over': dragOverIndex === index,
                    },
                  ]"
                >
                  <div class="w-100 h-full position-relative">
                    <Card
                      class="w-100 h-full position-relative image-card on-hover cursor-pointer"
                      :body-style="{ padding: 0, height: '100%' }"
                      :bordered="false"
                      @click="preview(index)"
                    >
                      <Image
                        v-if="!isVideoUrl(item.url, item.file)"
                        :src="item.url"
                        width="100%"
                        height="100%"
                        :preview="false"
                        :styles="{
                          image: {
                            aspectRatio,
                            objectFit: 'cover',
                          },
                        }"
                      />
                      <video
                        v-else
                        :src="item.url"
                        style="
                          width: 100%;
                          height: 100%;
                          object-fit: cover;
                          border-radius: 6px;
                        "
                      ></video>
                      <div
                        class="btn-wrap absolute left-0 top-0 flex h-full w-full items-center justify-center"
                      >
                        <!-- 拖拽指示器 -->
                        <div
                          v-if="!viewOnly && props.multiple && list.length > 1"
                          class="drag-handle"
                        >
                          <span
                            class="icon-[mdi--drag] h-5 w-5"
                            style="color: white; cursor: grab; opacity: 0.7"
                          ></span>
                        </div>
                        <div
                          v-if="
                            !viewOnly ||
                            typeIcons.some(
                              (icon) =>
                                icon.name === 'preview' &&
                                icon.types.includes(props.fileType),
                            )
                          "
                          class="flex items-center justify-center gap-1"
                        >
                          <Button
                            v-for="(icon, i) in typeIcons.filter(
                              (icon) =>
                                icon.types.includes(props.fileType) &&
                                (!viewOnly || icon.name === 'preview'),
                            )"
                            :key="i"
                            type="text"
                            size="small"
                            :disabled="icon.name === 'preview' ? false : undefined"
                            @click.stop="iconAction(icon.name, index)"
                            style="
                              color: white;
                              background: transparent;
                              border: none;
                            "
                          >
                            <template #icon>
                              <span :class="icon.class"></span>
                            </template>
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            </div>
            <div
              class="grid-item"
              v-if="!viewOnly && (list.length === 0 || props.multiple)"
            >
              <div class="square-container">
                <div class="media-item add" @click="choose">
                  <span class="icon-[mdi--plus] h-6 w-6"></span>
                  <div class="mt-1 truncate">点击或拖拽上传</div>
                </div>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div v-if="viewOnly" class="bg-transparent py-2">
            <div
              v-for="(item, index) in list"
              :key="index"
              class="mb-1 flex items-center justify-between gap-2 text-sm"
            >
              <span
                class="truncate cursor-pointer hover:text-blue-500"
                :title="fileDisplayName(item)"
                @click="preview(index)"
              >
                {{ fileDisplayName(item) }}
              </span>
              <Button
                type="link"
                size="small"
                :disabled="false"
                @click="preview(index)"
              >
                预览
              </Button>
            </div>
            <div v-if="list.length === 0" class="text-sm text-gray-400">
              暂无文件
            </div>
          </div>
          <template v-else>
            <Button
              class="cursor-pointer border border-dashed border-gray-300"
              @click="choose"
            >
              <span class="icon-[mdi--upload] h-5 w-5"></span>
              <div>点击或拖拽上传</div>
            </Button>
            <div class="bg-transparent py-3">
              <div
                v-for="(item, index) in list"
                :key="index"
                class="mb-1 flex items-center justify-between gap-2 text-sm"
              >
                <span
                  class="truncate cursor-pointer"
                  :title="fileDisplayName(item)"
                  @click="preview(index)"
                >
                  {{ fileDisplayName(item) }}
                </span>
                <Button
                  type="text"
                  danger
                  :icon="h('span', { class: 'icon-[mdi--close] w-4 h-4' })"
                  size="small"
                  @click.stop="remove(index)"
                />
              </div>
            </div>
          </template>
        </template>
      </Spin>
    </div>

    <input
      ref="inputRef"
      type="file"
      :accept="acceptValue"
      :multiple="props.multiple"
      style="display: none"
      @change="inputChange"
    />

    <!-- 视频截图对话框 -->
    <Modal
      v-model:open="snapshotDialog"
      title="截取视频帧"
      width="50vw"
      :footer="null"
    >
      <div class="flex items-center justify-center bg-black">
        <video
          ref="video"
          :src="videoUrl"
          controls
          style="max-width: 100%; max-height: 100%"
        ></video>
        <canvas ref="videoCanvas" style="display: none"></canvas>
      </div>
      <div class="mt-4 flex justify-center">
        <Button type="primary" @click="takeSnapshot">截取当前帧</Button>
      </div>
    </Modal>

    <!-- 图片裁剪对话框 -->
    <Modal
      v-model:open="cropperDialog"
      title="图片裁剪压缩"
      width="50vw"
      :footer="null"
    >
      <div style="height: 50vh">
        <VueCropper
          ref="cropper"
          :key="cropKey"
          :img="imageUrl"
          :output-size="cropperOption.size"
          :output-type="cropperOption.outputType.replace('image/', '')"
          :info="true"
          :full="cropperOption.full"
          :fixed="cropperOption.fixed"
          :fixed-number="fixedNumber"
          :can-move="cropperOption.canMove"
          :can-move-box="cropperOption.canMoveBox"
          :fixed-box="cropperOption.fixedBox"
          :original="cropperOption.original"
          :auto-crop="cropperOption.autoCrop"
          :auto-crop-width="cropperOption.autoCropWidth"
          :auto-crop-height="cropperOption.autoCropHeight"
          :center-box="cropperOption.centerBox"
          :high="cropperOption.high"
          @real-time="realTime"
          :max-img-size="cropperOption.max"
          mode="contain"
        />
      </div>

      <div class="mt-5">
        <div v-if="fileOrgInfo" class="mb-4" type="info">
          <div class="flex flex-col gap-2">
            <div>
              <span class="mr-3 font-bold">处理前</span>
              <span>类型：{{ fileOrgInfo.type.replace('image/', '') }}</span>
              <span class="mx-2">
                分辨率：{{ fileOrgInfo.width }} * {{ fileOrgInfo.height }}
              </span>
              <span>大小：{{ formatSize(fileOrgInfo.size) }}</span>
            </div>

            <div v-if="compressedFileSize" class="text-red-500">
              <span class="mr-3 font-bold">处理后</span>
              <span>类型：{{ cropperOption.outputType }}</span>
              <span class="mx-2">
                分辨率：{{ cropperOption.fixedWidth }} *
                {{ cropperOption.fixedHeight }}
              </span>
              <span>大小：{{ formatSize(compressedFileSize) }}</span>
            </div>
          </div>
        </div>
        <Row :gutter="[16, 16]">
          <Col :span="4">
            <div class="flex flex-col">
              <span class="mb-2 text-sm">输出格式</span>
              <Select
                v-model:value="cropperOption.outputType"
                :options="
                  mimeTypes.map((item) => ({
                    label: item.extension,
                    value: item.type,
                  }))
                "
              />
            </div>
          </Col>

          <Col :span="8">
            <div class="flex flex-col">
              <span class="mb-2 text-sm">宽高</span>
              <SpaceCompact>
                <InputNumber
                  v-model:value="cropperOption.fixedWidth"
                  :disabled="cropperOption.fixed"
                  type="number"
                  suffix="px"
                />
                <InputNumber
                  v-model:value="cropperOption.fixedHeight"
                  :disabled="cropperOption.fixed"
                  type="number"
                  suffix="px"
                />
                <Button>
                  <span
                    @click="cropperOption.fixed = !cropperOption.fixed"
                    class="text-black"
                    :class="
                      cropperOption.fixed
                        ? 'icon-[mdi--lock-outline]'
                        : 'icon-[mdi--lock-open-variant-outline]'
                    "
                  ></span>
                </Button>
              </SpaceCompact>
            </div>
          </Col>

          <Col :span="24">
            <div class="flex flex-col">
              <span class="mb-2 text-sm">压缩质量</span>
              <Slider
                v-model:value="compressorOption.quality"
                :max="100"
                :min="1"
                :tooltip="{ formatter: (value) => `${value}%` }"
              />
            </div>
          </Col>
        </Row>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <Button type="primary" @click="handleSubmit">确定处理</Button>
        <Button @click="cropperDialog = false">取消</Button>
      </div>
    </Modal>

    <Drawer
      v-model:open="previewDialog"
      title="文件预览"
      placement="right"
      width="min(100vw, 1200px)"
      destroy-on-close
      class="file-preview-drawer"
      @close="closePreview"
    >
      <template #extra>
        <Button
          :disabled="false"
          :icon="h('span', { class: 'icon-[mdi--download-outline] w-4 h-4' })"
          :loading="previewDownloading"
          size="small"
          @click="downloadPreviewFile"
        >
          下载
        </Button>
      </template>
      <div class="preview-content">
        <div
          v-if="previewLoading"
          class="flex h-full items-center justify-center"
        >
          <Spin tip="正在加载文件..." size="large" />
        </div>
        <img
          v-else-if="previewInfo.type === 'image'"
          :src="previewInfo.url"
          alt="文件预览"
          class="preview-image"
        />
        <video
          v-else-if="previewInfo.type === 'video'"
          :src="previewInfo.url"
          controls
          autoplay
          class="preview-video"
        ></video>
        <iframe
          v-else-if="previewInfo.type === 'pdf'"
          :src="previewInfo.url"
          width="100%"
          height="100%"
          frameborder="0"
        ></iframe>
        <AppOnlyoffice
          v-else-if="previewInfo.type === 'office' && officeDocument"
          :key="officeDocument.key"
          :document="officeDocument"
          mode="view"
          stream-fallback="download"
        />
        <iframe
          v-else-if="previewInfo.type === 'document'"
          :src="previewInfo.url"
          width="100%"
          height="100%"
          frameborder="0"
        ></iframe>
        <div
          v-else
          class="flex h-full flex-col items-center justify-center gap-4 text-sm text-gray-400"
        >
          <span>该类型文件暂不支持在线预览</span>
          <Button
            type="primary"
            :disabled="false"
            :loading="previewDownloading"
            @click="downloadPreviewFile"
          >
            点击下载
          </Button>
        </div>
      </div>
    </Drawer>
  </div>
</template>

<style scoped>
/* Grid 布局 */
.upload-grid {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
}

.grid-item {
  flex: 0 0 var(--item-width, 150px);
  width: var(--item-width, 150px);
  min-width: 0;
}

/* 正方形容器 */
.square-container {
  position: relative;
  width: 100%;
  aspect-ratio: var(--aspect-ratio, 1 / 1);
  overflow: hidden;
}

.media-item {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: stretch;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.media-item:not(.add) {
  border: none;
}

.media-item.add {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #999;
  border: 1px dashed #ddd;
}

.media-item.add:hover {
  color: #1890ff;
  border-color: #1890ff;
}

/* 拖拽状态样式 */
.media-item.dragging {
  border: 2px solid #1890ff;
  box-shadow: 0 4px 12px rgb(24 144 255 / 30%);
  opacity: 0.5;
  transform: scale(0.95);
}

.media-item.drag-over {
  background: rgb(24 144 255 / 10%);
  border: 2px dashed #1890ff;
  transform: scale(1.02);
}

.sortable-item {
  cursor: grab;
}

.sortable-item:active {
  cursor: grabbing;
}

/* 修复 Card 白边问题 */
.image-card :deep(.ant-card-body) {
  display: flex;
  height: 100%;
  padding: 0 !important;
  overflow: hidden;
}

.image-card :deep(.ant-image) {
  display: flex;
  width: 100% !important;
  height: 100% !important;
}

.image-card :deep(.ant-image img) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
}

.preview-content {
  flex: 1;
  height: calc(100vh - 56px);
  min-height: 320px;
}

.preview-content :deep(.onlyoffice-shell) {
  width: 100%;
  height: 100%;
}

.preview-image,
.preview-video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.btn-wrap {
  gap: 8px;
  background: rgb(0 0 0 / 50%);
  opacity: 0;
  transition: opacity 0.3s;
}

.btn-wrap:hover {
  opacity: 1;
}

.drag-handle {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  padding: 4px;
  background: rgb(0 0 0 / 60%);
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.3s;
}

.media-item:hover .drag-handle {
  opacity: 1;
}

/* 拖拽时的占位符效果 */
.sortable-item.dragging + .sortable-item {
  margin-left: 0;
}

/* 文件预览抽屉 */
.file-preview-drawer :deep(.ant-drawer-body) {
  display: flex;
  flex-direction: column;
  padding: 0 !important;
}
</style>
