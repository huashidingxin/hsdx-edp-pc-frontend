<script setup lang="ts">
import type { Ref } from 'vue';

import { h } from 'vue';
import { VueCropper } from 'vue-cropper/dist/vue-cropper.es.js';
import 'vue-cropper/dist/index.css';

import {
  Button,
  Card,
  Col,
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
import {
  base64ToFile,
  blobUrlToFile,
  createObjectURL,
  formatSize,
  getInfo,
  isBase64,
  videoUrlToBlobUrl,
} from '#/utils/file.js';

interface FileItem {
  url: string;
  file?: Blob | File | FileDescriptor;
  [key: string]: any;
}

interface FileDescriptor {
  category: null | string;
  name: string;
  size: number;
  type?: string;
}

interface PreviewInfo {
  extension: string;
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

const emit = defineEmits(['update:model-value', 'update:value', 'snapshot']);

// 兼容 antdv-next v-model:value 和 Vue3 v-model
const currentValue = computed(() => props.modelValue || props.value);

function emitValue(val: any) {
  emit('update:model-value', val);
  emit('update:value', val);
}


const files: Ref<File[]> = ref([]);
const list: Ref<FileItem[]> = ref([]);
const inputRef: Ref<HTMLInputElement | null> = ref(null);
const previewSrc = ref('');
const previewOpen = ref(false);
const dragover = ref(false);
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

// 设置初始值
async function setValue() {
  let _list: any[] = [];

  if (props.multiple) {
    _list = Array.isArray(currentValue.value) ? [...currentValue.value] : [];
  } else if (
    currentValue.value &&
    typeof currentValue.value === 'object' &&
    !Array.isArray(currentValue.value)
  ) {
    _list = [currentValue.value];
  } else if (
    currentValue.value &&
    typeof currentValue.value === 'string' &&
    currentValue.value
  ) {
    _list = [currentValue.value];
  }

  // 清空现有列表
  list.value = [];

  for (const item of _list) {
    if (typeof item === 'string') {
      let fileItem: FileItem = { url: item };

      if (isBase64(item)) {
        fileItem.file = base64ToFile(item);
      } else if (item.startsWith('blob:')) {
        fileItem.file = (await blobUrlToFile(item)) ?? undefined;
      } else {
        fileItem = formatUrl(item);
      }
      list.value.push(fileItem);
    } else {
      list.value.push(item);
    }
  }
}

// 更新模型值
function updateModelValue() {
  const arr = list.value.map((item) => {
    return item.url.startsWith('http') ? item.url : item;
  });

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

// 图标操作
function iconAction(action: string, index: number) {
  switch (action) {
    case 'crop': {
      crop(index);
      break;
    }
    case 'preview': {
      if (props.fileType === 'file') {
        preview(index);
      } else {
        previewSrc.value = list.value[index]?.url ?? '';
        nextTick(() => {
          previewOpen.value = true;
        });
      }
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

const previewDialog = ref(false);
const previewInfo = ref<PreviewInfo>({ extension: '', type: '', url: '' });
function preview(index: number) {
  if (props.fileType === 'file' && list.value[index]?.url?.startsWith('http')) {
    const url = new URL(list.value[index].url, window.location.origin);
    const fileName = url.pathname.split('/').pop() ?? '';
    const categories: Record<string, string[]> = {
      word: ['doc', 'docx'],
      excel: ['xls', 'xlsx'],
      ppt: ['ppt', 'pptx'],
      pdf: ['pdf'],
      image: ['jpg', 'jpeg', 'png', 'svg', 'bmp'],
    };
    const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
    let type = '';
    for (const key in categories) {
      if (categories[key]?.includes(extension)) {
        type = key;
        break;
      }
    }
    previewInfo.value = {
      url: ['pdf'].includes(type)
        ? `${import.meta.env.VITE_GLOB_URL}/file-preview?file=${list.value[index].url}`
        : list.value[index].url,
      type,

      extension,
    };
    previewDialog.value = true;
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
  fileOrgInfo.value = file?.size
    ? {
        name: file instanceof File ? file.name : 'name' in file ? file.name : '',
        size: file.size,
        type: file.type,
      }
    : (await getInfo(item.url)) ?? {};

  fileOrgInfo.value.index = index;

  // 获取图片真实尺寸
  if (!fileOrgInfo.value.width || !fileOrgInfo.value.height) {
    try {
      const img = new window.Image();
      img.src = item.url;
      await new Promise((resolve, reject) => {
        img.addEventListener('load', resolve);
        // eslint-disable-next-line unicorn/prefer-add-event-listener
        img.onerror = reject;
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
  // eslint-disable-next-line no-new
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
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/html', e.target?.toString() || '');

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
  e.dataTransfer!.dropEffect = 'move';

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
        item.file instanceof File && !item.url.startsWith('http'),
    )
    .map((item) => item.file);

  if (uploadItems.length === 0) return list.value;

  uploading.value = true;
  try {
    const ret = await uploadFile(
      props.multiple ? uploadItems : uploadItems[0]!,
      { scene: props.scene },
      (e) => {
        uploadProgress.value = Math.floor((e.progress ?? 0) * 100);
      },
    );

    const results = props.multiple ? ret : [ret];

    list.value = list.value.map((item) => {
      if (item.file && !item.url.startsWith('http')) {
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

function formatUrl(urlString: string): FileItem {
  const url = new URL(urlString, window.location.origin);
  const params = new URLSearchParams(url.search);

  return {
    url: urlString,
    file: {
      size: Number(params.get('size') || 0),
      name: params.get('name') || url.pathname.split('/').pop() || '',
      category: params.get('category'),
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
                      class="w-100 h-full position-relative image-card on-hover"
                      :body-style="{ padding: 0, height: '100%' }"
                      :bordered="false"
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
                          v-if="props.multiple && list.length > 1"
                          class="drag-handle"
                        >
                          <span
                            class="icon-[mdi--drag] h-5 w-5"
                            style="color: white; cursor: grab; opacity: 0.7"
                          ></span>
                        </div>
                        <div class="flex items-center justify-center gap-1">
                          <Button
                            v-for="(icon, i) in typeIcons.filter((icon) =>
                              icon.types.includes(props.fileType),
                            )"
                            :key="i"
                            type="text"
                            size="small"
                            @click="iconAction(icon.name, index)"
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
            <div class="grid-item" v-if="list.length === 0 || props.multiple">
              <div class="square-container">
                <div class="media-item add" @click="choose">
                  <span class="icon-[mdi--plus] h-6 w-6"></span>
                  <div class="mt-1 truncate">点击或拖拽上传</div>
                </div>
              </div>
            </div>
          </div>
          <!-- 隐藏的 Image 做预览控制器 -->
          <Image
            v-if="previewSrc"
            :style="{ display: 'none' }"
            :src="previewSrc"
            :preview="{
              open: previewOpen,
              onOpenChange: (val) => {
                previewOpen = val;
              },
            }"
          >
            <template v-if="isVideoUrl(previewSrc)" #imageRender>
              <video
                
                width="100%"
                controls
                autoplay
                :src="previewSrc"
                style="max-width: 90vw; max-height: 90vh"
              ></video>
            </template>
          </Image>
        </template>
        <template v-else>
          <Button
            class="cursor-pointer border border-dashed border-gray-300"
            @click="choose"
          >
            <span class="icon-[mdi--upload] h-5 w-5"></span>
            <div>点击或拖拽上传</div>
          </Button>
          <div class="bg-transparent py-3">
            <!-- <List class="bg-transparent">
              <ListItem
                v-for="(item, index) in list"
                :key="index"
                @click="preview(index)"
                :style="{ cursor: 'pointer' }"
              >
                <template #actions>
                  <Button
                    type="text"
                    danger
                    :icon="h('span', { class: 'icon-[mdi--close] w-4 h-4' })"
                    size="small"
                    @click.stop="remove(index)"
                  />
                </template>
                <List.Item.Meta
                  :title="item.file?.name || '文件'"
                  :description="
                    item.file?.size ? formatSize(item.file?.size) : ''
                  "
                />
              </ListItem>
            </List> -->
          </div>
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
      <div
        class="flex items-center justify-center bg-black"
      >
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
              <span class="mx-2"
                >分辨率：{{ fileOrgInfo.width }} *
                {{ fileOrgInfo.height }}</span
              >
              <span>大小：{{ formatSize(fileOrgInfo.size) }}</span>
            </div>

            <div v-if="compressedFileSize" class="text-red-500">
              <span class="mr-3 font-bold">处理后</span>
              <span>类型：{{ cropperOption.outputType }}</span>
              <span class="mx-2"
                >分辨率：{{ cropperOption.fixedWidth }} *
                {{ cropperOption.fixedHeight }}</span
              >
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

    <Modal
      v-model:open="previewDialog"
      title="文件预览"
      width="100vw"
      :footer="null"
      wrap-class-name="fullscreen-modal"
    >
      <div class="mb-4 flex items-center justify-between">
        <span class="text-lg font-medium">文件预览</span>
        <Button
          type="text"
          :icon="h('span', { class: 'icon-[mdi--close] w-4 h-4' })"
          @click="previewDialog = false"
        />
      </div>
      <div style="height: calc(100vh - 120px)">
        <div v-if="previewInfo.type === 'image'">
          <Image
            :src="previewInfo.url"
            :preview="false"
            style="width: 100%; height: 100%; object-fit: contain"
          />
        </div>
        <iframe
          v-else-if="previewInfo.type === 'pdf'"
          :src="previewInfo.url"
          width="100%"
          height="100%"
        ></iframe>
        <div
          v-else-if="['word', 'excel', 'ppt', 'pdf'].includes(previewInfo.type)"
          style="height: 100%"
        >
          <!-- <AppOffice
            :document-type="previewInfo.type"
            :document="{ url: previewInfo.url }"
            callback-url="https://dev2.cpzhongzhou.com/api/v1/mock-save"
          /> -->
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
/* Grid 布局 */
.upload-grid {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
}

.grid-item {
  min-width: 0;
  flex: 0 0 var(--item-width, 150px);
  width: var(--item-width, 150px);
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

/* 全屏模态框样式 */
:deep(.fullscreen-modal) {
  top: 0 !important;
  width: 100vw !important;
  max-width: 100vw !important;
  height: 100vh !important;
  padding-bottom: 0 !important;
}

:deep(.fullscreen-modal .ant-modal-content) {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

:deep(.fullscreen-modal .ant-modal-body) {
  flex: 1;
  padding: 0;
}
</style>
