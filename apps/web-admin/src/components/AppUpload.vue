<script setup lang="ts">
import type { Ref } from 'vue';

import { VueCropper } from 'vue-cropper';
import 'vue-cropper/dist/index.css';

import Compressor from 'compressorjs';
import { debounce } from 'lodash';

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
  file?: Blob | File;
  [key: string]: any;
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

const props = defineProps({
  modelValue: {
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
});
const emit = defineEmits(['update:model-value']);
const $attrs = useAttrs();
const $toast: any = inject('$toast');
const $loader: any = inject('$loader');
const $preview: any = inject('$preview');

const files: Ref<File[]> = ref([]);
const list: Ref<FileItem[]> = ref([]);
const inputRef: Ref<HTMLInputElement | null> = ref(null);
const dragover = ref(false);
const cropper = ref<InstanceType<typeof VueCropper> | null>(null);
const video = ref<HTMLVideoElement | null>(null);
const videoCanvas = ref<HTMLCanvasElement | null>(null);

// 文件类型相关
const accepts: Record<string, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  file: '*',
};
const accept: Ref<string> = ref(accepts.image);
const fileType: Ref<string> = ref('image');
const typeIcons = [
  {
    name: 'preview',
    types: ['image', 'file'],
    value: 'mdi-magnify-plus-outline',
  },
  { name: 'crop', types: ['image'], value: 'mdi-crop' },
  { name: 'play', types: ['video'], value: 'mdi-play' },
  { name: 'snapshot', types: ['video'], value: 'mdi-camera-outline' },
  {
    name: 'remove',
    types: ['image', 'video', 'file'],
    value: 'mdi-delete-forever',
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
const compressedFile = ref<File | null>(null);

// 视频截图相关
const videoUrl = ref('');
const snapshotBase64 = ref('');
const snapshotDialog = ref(false);

// 上传进度
const uploadProgress = ref(0);

// 拖拽排序相关
const draggedIndex = ref<null | number>(null);
const dragOverIndex = ref<null | number>(null);
const isDragging = ref(false);

// 初始化
function init() {
  if ($attrs.fileType) {
    fileType.value = $attrs.fileType as string;
  }
  accept.value = $attrs.accept
    ? ($attrs.accept as string)
    : accepts[fileType.value] || '*';
}

// 处理文件变化
watch(files, async (newVal) => {
  if (newVal.length === 0) return;

  const newItems: FileItem[] = [];
  for (let i = 0; i < files.value.length; i++) {
    const url = createObjectURL(files.value[i]);
    newItems.push({ file: files.value[i], url });
  }

  if ($attrs.multiple) {
    list.value.push(...newItems);
  } else {
    list.value = newItems.slice(0, 1);
  }

  updateModelValue();
});

// 同步外部数据变化
watch(
  () => props.modelValue,
  (_newVal) => {
    init();
    setValue();
  },
  { immediate: true, deep: true },
);

// 设置初始值
async function setValue() {
  let _list: any[] = [];

  if ($attrs.multiple) {
    _list = Array.isArray(props.modelValue) ? [...props.modelValue] : [];
  } else if (
    props.modelValue &&
    typeof props.modelValue === 'object' &&
    !Array.isArray(props.modelValue)
  ) {
    _list = [props.modelValue];
  } else if (props.modelValue) {
    _list = [props.modelValue];
  }

  // 清空现有列表
  list.value = [];

  for (const item of _list) {
    if (typeof item === 'string') {
      let fileItem: FileItem = { url: item };

      if (isBase64(item)) {
        fileItem.file = base64ToFile(item);
      } else if (item.startsWith('blob:')) {
        fileItem.file = await blobUrlToFile(item);
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

  emit('update:model-value', $attrs.multiple ? arr : arr[0] || null);
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
  if (accept.value === '*') return files;

  return files.filter((item) => {
    const acceptTypes = accept.value.split(',');
    const [mimeType] = item.type.split('/');
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
    $toast.error('文件类型不匹配！');
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
    case 'play':
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

const previewDialog = ref(false);
const previewInfo = ref({});
function preview(index: number) {
  if (fileType.value === 'file') {
    if (list.value[index]?.url?.startsWith('http')) {
      const url = new URL(list.value[index].url, window.location.origin);
      const fileName = url.pathname.split('/').pop();
      const categories = {
        word: ['doc', 'docx'],
        cell: ['xls', 'xlsx'],
        slide: ['ppt', 'pptx'],
        pdf: ['pdf'],
        image: ['jpg', 'jpeg', 'png', 'svg', 'bmp'],
      };
      const extension = fileName.split('.').pop();
      let type = '';
      for (const key in categories) {
        if (categories[key].includes(extension.toLowerCase())) {
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
      // window.open(`${import.meta.env.VITE_GLOB_URL}/file-preview?file=${list.value[index].url}`, '_blank');
    }
  } else {
    $preview.show(
      list.value.map((item) => item.url),
      index,
      fileType.value,
    );
  }
}

function remove(index: number) {
  list.value.splice(index, 1);
  updateModelValue();
}

// 裁剪相关函数
async function setCurrent(index: number) {
  const item = list.value[index];
  fileOrgInfo.value = item.file
    ? {
        ...item.file,
        size: item.file.size,
        type: item.file.type,
        name: item.file.name,
      }
    : await getInfo(item.url);

  fileOrgInfo.value.index = index;
}

async function crop(index: number) {
  await setCurrent(index);
  imageUrl.value = list.value[index].url;
  cropperDialog.value = true;
}

const realTime = debounce((e: any) => {
  if (!fileOrgInfo.value.width) {
    fileOrgInfo.value.width = Number(e.img.width.replace('px', ''));
    fileOrgInfo.value.height = Number(e.img.height.replace('px', ''));

    cropperOption.value.fixedWidth = fileOrgInfo.value.width;
    cropperOption.value.fixedHeight = fileOrgInfo.value.height;
  }
  cropHandler();
}, 50);

function cropHandler() {
  cropper.value?.getCropBlob((data: Blob) => {
    if (!data) return;

    const typeIndex = mimeTypes.findIndex((v) => v.type === data.type);
    const _file = new File(
      [data],
      `${Date.now()}.${mimeTypes[typeIndex]?.extension || 'jpg'}`,
      { type: data.type },
    );

    compressorOption.value.width = cropperOption.value.fixedWidth;
    compressorOption.value.height = cropperOption.value.fixedHeight;
    compress(_file);
  });
}

// 压缩相关函数
function compress(file: File) {
  // eslint-disable-next-line no-new
  new Compressor(file, {
    quality: (compressorOption.value.quality - 1) / 100,
    width: compressorOption.value.width,
    height: compressorOption.value.height,
    success: (result: Blob | File) => {
      compressedFile.value =
        result instanceof Blob
          ? new File([result], result.name, { type: result.type })
          : result;
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
  await setCurrent(index);
  videoUrl.value = await videoUrlToBlobUrl(list.value[index].url);
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
        $attrs.onSnapshot?.({
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
  if (!$attrs.multiple || list.value.length <= 1) return;

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
    .filter((item) => item.file && !item.url.startsWith('http'))
    .map((item) => item.file!);

  if (uploadItems.length === 0) return list.value;

  const loader = $loader.show('上传中...');
  try {
    const ret = await uploadFile(
      $attrs.multiple ? uploadItems : uploadItems[0],
      { scene: props.scene },
      (e: { progress: number }) => {
        uploadProgress.value = Math.floor(e.progress * 100);
      },
    );

    const results = $attrs.multiple ? ret : [ret];

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
    throw error;
  } finally {
    loader.close();
  }
}

function formatUrl(urlString: string): FileItem {
  const url = new URL(urlString, window.location.origin);
  const params = new URLSearchParams(url.search);

  return {
    url: urlString,
    file: {
      size: params.get('size'),
      name: params.get('name') || url.pathname.split('/').pop(),
      category: params.get('category'),
    },
  };
}

async function downloadFile(url) {
  try {
    const loader = $loader.show('正在下载...');

    // 获取文件内容
    const response = await fetch(url, {
      method: 'GET',
      headers: {},
    });

    if (!response.ok) {
      throw new Error('下载失败');
    }

    // 转换为 Blob
    const blob = await response.blob();

    // 从 URL 中提取文件名
    let fileName = 'download';
    try {
      const urlObj = new URL(url, window.location.origin);
      const pathName = urlObj.pathname;
      const nameMatch = pathName.match(/([^/]+)$/);
      if (nameMatch && nameMatch[1]) {
        fileName = nameMatch[1];
      } else {
        // 尝试从响应头获取文件名
        const contentDisposition = response.headers.get('content-disposition');
        if (contentDisposition) {
          const fileNameMatch = contentDisposition.match(
            /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/,
          );
          if (fileNameMatch && fileNameMatch[1]) {
            fileName = fileNameMatch[1].replaceAll(/['"]/g, '');
          }
        }
      }
    } catch {
      console.warn('无法提取文件名，使用默认名称');
    }

    // 创建下载链接
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;

    // 添加到 DOM，触发下载，然后移除
    document.body.append(link);
    link.click();

    // 清理
    setTimeout(() => {
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    }, 100);

    loader.close();
    $toast.success('下载成功');
  } catch (error) {
    console.error('下载失败:', error);
    $toast.error('下载失败，请重试');

    // 降级方案：使用 window.open
    window.open(url, '_blank');
  }
}

defineExpose({
  upload,
});
</script>

<template>
  <div>
    <div v-if="label" class="text-subtitle-1">{{ label }}</div>
    <slot name="default"></slot>
    <div
      class="py-2"
      :class="dragover ? 'bg-blue-lighten-5' : ''"
      style="width: 100%; min-height: 100px"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <template v-if="['image', 'video'].includes(fileType)">
        <v-row class="w-100" style="box-sizing: border-box">
          <v-col
            v-for="(item, index) in list"
            :key="index"
            :cols="$attrs.cols || 4"
            :md="$attrs.md || 2"
            :xxl="$attrs.xxl || 1"
            :class="{
              dragging: draggedIndex === index,
              'drag-over': dragOverIndex === index,
              'sortable-item': $attrs.multiple && list.length > 1,
            }"
            @dragstart="handleDragStart($event, index)"
            @dragend="handleDragEnd"
            @dragover="handleItemDragOver($event, index)"
            @dragleave="handleItemDragLeave"
            @drop="handleItemDrop($event, index)"
            @dragenter.prevent
            :draggable="$attrs.multiple && list.length > 1"
          >
            <v-responsive :aspect-ratio="1">
              <div
                class="media-item"
                :class="[
                  fileType === 'image' ? '' : 'bg-black',
                  {
                    dragging: draggedIndex === index,
                    'drag-over': dragOverIndex === index,
                  },
                ]"
              >
                <v-hover v-slot="{ isHovering, props: hoverProps }">
                  <v-card
                    :class="{ 'on-hover': isHovering }"
                    :elevation="isHovering ? 12 : 2"
                    class="w-100 position-relative"
                    v-bind="hoverProps"
                  >
                    <v-img
                      v-if="fileType === 'image'"
                      :src="item.url"
                      width="100%"
                      aspect-ratio="1"
                      cover
                      rounded
                    />
                    <video v-else :src="item.url"></video>
                    <div
                      class="d-flex align-center position-absolute w-100 h-100 btn-wrap top-0 justify-center"
                    >
                      <!-- 拖拽指示器 -->
                      <div
                        v-if="$attrs.multiple && list.length > 1"
                        class="drag-handle"
                      >
                        <v-icon
                          size="20"
                          color="white"
                          class="opacity-70"
                          style="cursor: grab"
                        >
                          mdi-drag-horizontal-variant
                        </v-icon>
                      </div>
                      <div class="align-self-center flex">
                        <v-btn
                          v-for="(icon, i) in typeIcons.filter((icon) =>
                            icon.types.includes(fileType),
                          )"
                          :key="i"
                          :class="{ 'show-btns': isHovering }"
                          color="transparent"
                          :icon="icon.value"
                          size="small"
                          variant="text"
                          @click="iconAction(icon.name, index)"
                        />
                      </div>
                    </div>
                  </v-card>
                </v-hover>
              </div>
            </v-responsive>
          </v-col>
          <v-col
            :cols="$attrs.cols || 4"
            :md="$attrs.md || 2"
            :xxl="$attrs.xxl || 1"
            v-if="list.length === 0 || $attrs.multiple"
          >
            <v-responsive :aspect-ratio="1">
              <div class="media-item add" @click="choose">
                <v-icon size="24">mdi-plus</v-icon>
                <div class="text-truncate mt-1">点击或拖拽上传</div>
              </div>
            </v-responsive>
          </v-col>
        </v-row>
      </template>
      <template v-else>
        <v-btn class="cursor-pointer border border-dashed" @click="choose">
          <v-icon>mdi-upload</v-icon>
          <div>点击或拖拽上传</div>
        </v-btn>
        <div class="bg-transparent py-3">
          <v-list class="bg-transparent">
            <v-list-item
              v-for="(item, index) in list"
              :key="index"
              @click="preview(index)"
              :subtitle="item.file?.size ? formatSize(item.file?.size) : ''"
              :title="item.file?.name || '文件'"
            >
              <template #append>
                <v-btn
                  icon="mdi-close-circle"
                  size="small"
                  variant="text"
                  color="error"
                  @click.stop="remove(index)"
                />
              </template>
            </v-list-item>
          </v-list>
        </div>
      </template>
    </div>

    <input
      ref="inputRef"
      type="file"
      :accept="accept"
      :multiple="Boolean($attrs.multiple)"
      style="display: none"
      @change="inputChange"
    />

    <!-- 视频截图对话框 -->
    <v-dialog v-model="snapshotDialog" max-width="50vw">
      <v-card>
        <v-card-title>
          <div class="justify-space-between align-center flex">
            截取视频帧
            <v-btn icon="mdi-close" @click="snapshotDialog = false" />
          </div>
        </v-card-title>
        <v-card-text
          style="height: 50vh"
          class="flex justify-center bg-black py-0"
        >
          <video
            ref="video"
            :src="videoUrl"
            controls
            style="max-width: 100%; max-height: 100%"
          ></video>
          <canvas ref="videoCanvas" style="display: none"></canvas>
        </v-card-text>
        <v-card-actions class="flex justify-center">
          <v-btn color="primary" variant="flat" @click="takeSnapshot">
            截取当前帧
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 图片裁剪对话框 -->
    <v-dialog v-model="cropperDialog" max-width="50vw">
      <v-card>
        <v-card-title>
          <div class="justify-space-between align-center flex">
            图片裁剪压缩
            <v-btn icon="mdi-close" @click="cropperDialog = false" />
          </div>
        </v-card-title>
        <v-card-text>
          <div style="height: 50vh">
            <VueCropper
              ref="cropper"
              :key="Date.now()"
              :img="imageUrl"
              :output-size="cropperOption.size"
              :output-type="cropperOption.outputType.replace('image/', '')"
              :info="true"
              :full="cropperOption.full"
              :fixed="cropperOption.fixed"
              :fixed-number="[
                cropperOption.fixedWidth,
                cropperOption.fixedHeight,
              ]"
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
            <v-alert v-if="fileOrgInfo" class="mb-2">
              <span class="font-weight-bold me-3">处理前</span>
              <span
                >分辨率：{{ fileOrgInfo.width }} *
                {{ fileOrgInfo.height }}</span
              >
              <span class="mx-2">大小：{{ formatSize(fileOrgInfo.size) }}</span>

              <div v-if="compressedFile" class="text-red">
                <span class="font-weight-bold me-3">处理后</span>
                <span
                  >分辨率：{{ cropperOption.fixedWidth }} *
                  {{ cropperOption.fixedHeight }}</span
                >
                <span class="mx-2"
                  >大小：{{ formatSize(compressedFile.size) }}</span
                >
              </div>
            </v-alert>
            <v-row>
              <v-col cols="4">
                <v-select
                  label="输出格式"
                  v-model="cropperOption.outputType"
                  :items="mimeTypes"
                  item-value="type"
                  item-title="extension"
                />
              </v-col>
              <v-col cols="4">
                <v-switch
                  label="固定宽高比"
                  color="primary"
                  v-model="cropperOption.fixed"
                />
              </v-col>
              <template v-if="cropperOption.fixed">
                <v-col cols="2">
                  <v-text-field
                    label="宽度"
                    v-model="cropperOption.fixedWidth"
                    type="number"
                  />
                </v-col>
                <v-col cols="2">
                  <v-text-field
                    label="高度"
                    v-model="cropperOption.fixedHeight"
                    type="number"
                  />
                </v-col>
              </template>

              <v-col cols="12">
                <v-slider
                  label="压缩质量"
                  v-model="compressorOption.quality"
                  :max="100"
                  :min="1"
                  thumb-label
                  color="primary"
                />
              </v-col>
            </v-row>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="flat" color="primary" @click="handleSubmit">
            确定处理
          </v-btn>
          <v-btn variant="flat" color="warning" @click="cropperDialog = false">
            取消
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="previewDialog" fullscreen>
      <v-card class="d-flex flex-column h-100">
        <v-card-title class="">
          <div class="justify-space-between align-center flex">
            文件预览
            <v-btn icon="mdi-close" @click="previewDialog = false" />
          </div>
        </v-card-title>
        <v-card-text
          class="flex-1 overflow-auto"
          style="max-height: calc(100vh - 120px)"
        >
          <div v-if="previewInfo.type === 'image'">
            <v-img
              :src="previewInfo.url"
              class="w-100"
              style="max-width: 100%"
            />
          </div>
          <iframe
            v-else-if="previewInfo.type === 'pdf'"
            :src="previewInfo.url"
            width="100%"
            height="100%"
          ></iframe>
          <div
            v-else-if="
              ['word', 'cell', 'slide', 'pdf'].includes(previewInfo.type)
            "
            style="height: 100%"
          >
            <AppOffice
              :document-type="previewInfo.type"
              :document="{ url: previewInfo.url }"
              callback-url="https://www.cpzhongzhou.com/api/v1/mock-save"
            />
          </div>
          <div v-else>
            <v-alert>
              当前文件不支持在线预览，请下载后在本地打开
              <template #append>
                <v-btn
                  color="primary"
                  variant="flat"
                  @click="downloadFile(previewInfo.url)"
                >
                  下载
                  <v-icon>mdi-download</v-icon>
                </v-btn>
              </template>
            </v-alert>
          </div>

          <v-card-actions>
            <v-btn
              color="primary"
              variant="flat"
              @click="downloadFile(previewInfo.url)"
            >
              下载
              <v-icon>mdi-download</v-icon>
            </v-btn>
          </v-card-actions>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.media-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  cursor: pointer;
  border: 1px dashed #ddd;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.media-item.add {
  flex-direction: column;
  color: #999;
}

.media-item.add:hover {
  color: #1976d2;
  border-color: #1976d2;
}

/* 拖拽状态样式 */
.media-item.dragging {
  border: 2px solid #1976d2;
  box-shadow: 0 4px 12px rgb(25 118 210 / 30%);
  opacity: 0.5;
  transform: scale(0.95);
}

.media-item.drag-over {
  background: rgb(25 118 210 / 10%);
  border: 2px dashed #1976d2;
  transform: scale(1.02);
}

.sortable-item {
  cursor: grab;
}

.sortable-item:active {
  cursor: grabbing;
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

.show-btns {
  color: rgb(255 255 255 / 100%) !important;
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
</style>
