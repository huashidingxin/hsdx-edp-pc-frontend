<script setup>
/**
 * 全景场景管理。
 *
 * 一个「全景」应用 = 一套多场景漫游：场景（等距圆柱底图）＋每个场景上的热点。
 *
 * 分工：
 *   - 标题 / 编码 / 底图 / 排序 / 状态这类标量字段交给通用 CRUD 壳（AppCrudTable）；
 *   - 「布点、实时预览、初始视角、北向」这些必须看到球面才能干的事，
 *     交给 PanoramaSceneEditor 抽屉（内嵌 Photo Sphere Viewer）；
 *   - 一次拖入多张底图的批量建场景走 batch 接口，切片逐张串行触发，
 *     这样每张都有独立进度，也不会把一次请求拖到超时。
 *
 * 与 site/pages 同族：接口走 X-Application-Id 请求头，抽屉嵌入时以 appId 为准。
 */
import { computed, onMounted, ref, watch } from 'vue';

import { Button, Empty, Modal, Progress, Tag, message } from 'antdv-next';

import { upload } from '#/api';
import {
  getCurrentApplicationId,
  setCurrentApplicationId,
} from '#/api/application-context';
import { requestClient } from '#/api/request';
import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

import PanoramaSceneEditor from './_components/PanoramaSceneEditor.vue';
import { describeCrop, isEquirectangular } from './_components/panoramaRatio';

/**
 * 行 / 详情 → 表单的字段映射。
 *
 * 接口把首屏视角出成嵌套的 `initial_view`，但表单是扁平字段（与 PUT 入参一致），
 * 这里展平一次，避免为三个数字给整个表单套一层嵌套结构。
 */
function flattenScene(data) {
  if (!data) return data;
  return {
    ...data,
    initial_yaw: data.initial_view?.yaw ?? 0,
    initial_pitch: data.initial_view?.pitch ?? 0,
    initial_hfov: data.initial_view?.hfov ?? 75,
  };
}

const detailFormat = flattenScene;
/** 列表态拿到的是整页数组（不是单行），要逐行展平。 */
const listFormat = (rows) => (Array.isArray(rows) ? rows.map(flattenScene) : rows);

/** 切片是同步 GD 处理，大图可能远超默认 10s 超时。 */
const TILE_TIMEOUT = 300_000;

const STATUS_OPTIONS = [
  { id: 1, name: '展示' },
  { id: 0, name: '隐藏' },
];

const TILE_OPTIONS = [
  { id: 'none', name: '未切片' },
  { id: 'pending', name: '切片中' },
  { id: 'ready', name: '已就绪' },
  { id: 'failed', name: '切片失败' },
];

const TILE_META = {
  none: { text: '未切片', color: 'default' },
  pending: { text: '切片中', color: 'processing' },
  ready: { text: '已就绪', color: 'green' },
  failed: { text: '切片失败', color: 'red' },
};

const props = defineProps({
  /** 抽屉嵌入时由应用卡片指定；独立页面时读 localStorage 里的当前应用。 */
  appId: { type: [Number, String], default: null },
});

const crudRef = ref(null);
const formData = ref(null);
/** 列表快照：编辑器的「跳转目标」下拉需要同应用全部场景。 */
const allScenes = ref([]);

const filterFields = ref([
  { field: 'keyword', label: '标题', type: 'text', span: 8 },
  {
    field: 'status',
    label: '状态',
    type: 'select',
    span: 8,
    attrs: { allowClear: true, placeholder: '全部', options: STATUS_OPTIONS, fieldNames: { label: 'name', value: 'id' } },
  },
  {
    field: 'tile_status',
    label: '切片',
    type: 'select',
    span: 8,
    attrs: { allowClear: true, placeholder: '全部', options: TILE_OPTIONS, fieldNames: { label: 'name', value: 'id' } },
  },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  {
    field: 'title',
    type: 'text',
    label: '场景名称',
    span: 12,
    required: true,
    attrs: { placeholder: '如 一层大堂' },
  },
  {
    field: 'code',
    type: 'text',
    label: '编码',
    span: 12,
    attrs: { placeholder: '深链用，留空自动（小写字母/数字/中划线）' },
  },
  { field: 'sort', type: 'number', label: '排序', span: 12 },
  {
    field: 'image',
    type: 'image',
    label: '全景底图（2:1 等距圆柱）',
    span: 24,
  },
  {
    field: 'initial_yaw',
    type: 'number',
    label: '首屏经度 yaw',
    span: 8,
    default: 0,
    attrs: { min: -180, max: 180, suffix: '°' },
  },
  {
    field: 'initial_pitch',
    type: 'number',
    label: '首屏纬度 pitch',
    span: 8,
    default: 0,
    attrs: { min: -90, max: 90, suffix: '°' },
  },
  {
    field: 'initial_hfov',
    type: 'number',
    label: '首屏视野 hfov',
    span: 8,
    default: 75,
    attrs: { min: 30, max: 140, suffix: '°' },
  },
  {
    field: 'north_offset',
    type: 'number',
    label: '北向偏移',
    span: 8,
    default: 0,
    attrs: { min: -180, max: 180, suffix: '°' },
  },
  {
    field: 'status',
    type: 'select',
    label: '状态',
    span: 8,
    default: 1,
    attrs: { options: STATUS_OPTIONS, fieldNames: { label: 'name', value: 'id' } },
  },
  { field: 'updated_at', type: 'datetime', label: '更新时间', span: 12, displayOnly: true },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'thumb', title: '缩略图', width: 96, slots: { default: 'default_thumb' } },
  { field: 'title', title: '场景名称', minWidth: 160 },
  { field: 'code', title: '编码', minWidth: 120 },
  // 原图尺寸单列一栏：非 2:1 的图会被切片时中心裁切，用户必须看得见这件事
  { field: 'source_width', title: '原图', width: 170, slots: { default: 'default_source' } },
  { field: 'width', title: '切片尺寸', width: 130, slots: { default: 'default_size' } },
  { field: 'tile_status', title: '切片', width: 100, slots: { default: 'default_tile' } },
  { field: 'hotspot_count', title: '热点', width: 70 },
  { field: 'sort', title: '排序', width: 70 },
  { field: 'status', title: '状态', width: 80, slots: { default: 'default_status' } },
  { field: 'updated_at', title: '更新时间', minWidth: 170 },
]);

const actionsConfig = ref([
  {
    key: 'panorama_edit',
    label: '全景编辑',
    icon: 'lucide:move-3d',
    permission: 'edit',
    onClick: (row) => openEditor(row),
    order: 25,
  },
  {
    key: 'retile',
    label: '重新切片',
    icon: 'lucide:grid-3x3',
    permission: 'edit',
    confirm: true,
    confirmTitle: '重新切片会覆盖现有瓦片，确定继续吗？',
    onClick: (row) => retile(row),
    order: 45,
  },
]);

/* ===================== 编辑抽屉 ===================== */

const editorOpen = ref(false);
const editorRow = ref(null);

function openEditor(row) {
  editorRow.value = row;
  editorOpen.value = true;
}

function refreshList() {
  crudRef.value?.refresh();
}

/** 编辑器保存后刷新列表（热点数、首屏视角都会变）。 */
function onEditorSaved() {
  refreshList();
}

/* ===================== 保存 / 切片 ===================== */

/**
 * 表单保存时禁止自动切片。
 *
 * 后端默认「落库即切片」，但切片是同步 GD 处理，大图会超过前端 10s 默认超时；
 * 这里先只落库，再由 onSaved 用长超时单独触发，用户能看到明确的进度提示。
 */
function saveFormat(payload) {
  return { ...payload, tile: false };
}

async function onSaved(row) {
  const scene = row?.data ?? row;
  if (!scene?.id) return;
  if (scene.tile_status === 'ready' && scene.image) return;

  await tileScene(scene, { silent: false });
}

async function retile(row) {
  await tileScene(row, { silent: true });
}

async function tileScene(row, { silent }) {
  if (!row?.id) return;
  if (!row.image && !row.image_path) {
    message.warning('请先上传全景底图');
    return;
  }

  const hide = message.loading('正在切片（生成缩略图 / 预览图 / 多分辨率瓦片）…', 0);
  try {
    await requestClient.post(`/panorama-scenes/${row.id}/tile`, undefined, {
      timeout: TILE_TIMEOUT,
    });
    if (silent) message.success('切片完成');
    refreshList();
  } catch (error) {
    console.error('[panorama] tile failed:', error);
    if (silent) message.error(error?.message || '切片失败');
    refreshList();
  } finally {
    hide();
  }
}

/* ===================== 批量上传 ===================== */

const batchOpen = ref(false);
const batchItems = ref([]);
const batchBusy = ref(false);
const batchStage = ref('');
const batchProgress = ref(0);
const batchInputEl = ref(null);

const batchPendingCount = computed(
  () => batchItems.value.filter((item) => item.status === 'pending' || item.status === 'error').length,
);

const batchDoneCount = computed(
  () => batchItems.value.filter((item) => item.status === 'done').length,
);

function openBatch() {
  batchItems.value = [];
  batchStage.value = '';
  batchProgress.value = 0;
  batchBusy.value = false;
  batchOpen.value = true;
}

function pickBatchFiles() {
  batchInputEl.value?.click();
}

function onBatchInput(event) {
  addBatchFiles(event.target.files);
  event.target.value = '';
}

function onBatchDrop(event) {
  addBatchFiles(event.dataTransfer?.files);
}

function addBatchFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;

  const accepted = files.filter(
    (file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name),
  );
  if (!accepted.length) {
    message.warning('请选择 JPG / PNG / WebP 格式的全景图');
    return;
  }
  if (accepted.length < files.length) {
    message.warning(`已忽略 ${files.length - accepted.length} 个非图片文件`);
  }

  const items = accepted.map((file) => ({
    key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    size: file.size,
    file,
    url: '',
    status: 'pending',
    message: '',
    sourceWidth: 0,
    sourceHeight: 0,
    // 默认按「合规」处理：量不出尺寸（解码失败）时不要误报成比例问题
    isEquirect: true,
  }));

  // 先入列（用户立刻看到文件），再异步量尺寸补上「会不会被裁」的判断
  batchItems.value.push(...items);
  void inspectRatios(items);
}

/** 待处理列表里比例不符 2:1 的项。 */
const offRatioItems = computed(() =>
  batchItems.value.filter((item) => item.isEquirect === false),
);

/** 在浏览器里量图片尺寸（本地解码，不占服务器）。量不出来返回 null。 */
function readImageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const settle = (size) => {
      URL.revokeObjectURL(url);
      resolve(size);
    };

    image.addEventListener(
      'load',
      () => settle({ width: image.naturalWidth, height: image.naturalHeight }),
      { once: true },
    );
    image.addEventListener('error', () => settle(null), { once: true });
    image.src = url;
  });
}

/**
 * 2:1 体检。
 *
 * 等距圆柱必须是严格 2:1，比例不符时 `PanoramaTiler::centerCropEquirect()`
 * 会**静默中心裁切** —— 用户不看球面根本发现不了内容被裁掉了。
 * 这里在选完文件时就把每张图的尺寸量出来，让他自己决定要不要继续。
 */
async function inspectRatios(items) {
  await Promise.all(
    items.map(async (item) => {
      const size = await readImageSize(item.file);
      if (!size) return;

      item.sourceWidth = size.width;
      item.sourceHeight = size.height;
      item.isEquirect = isEquirectangular(size.width, size.height);
    }),
  );
}

function removeBatchItem(key) {
  batchItems.value = batchItems.value.filter((item) => item.key !== key);
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

/**
 * 上传 → 批量建场景（不切片）→ 逐张切片。
 *
 * 分开做是为了让每张底图都有独立的进度与失败原因：一次请求里串行切 10 张大图，
 * 用户既看不到进度，中途失败也说不清是哪一张。
 */
async function startBatch() {
  const pending = batchItems.value.filter(
    (item) => item.status === 'pending' || item.status === 'error',
  );
  if (!pending.length) {
    message.info('没有待处理的文件');
    return;
  }

  batchBusy.value = true;
  batchProgress.value = 0;

  try {
    // 1. 逐张上传，拿到媒体库相对路径
    batchStage.value = '上传图片';
    const created = [];
    for (const [index, item] of pending.entries()) {
      item.status = 'uploading';
      item.message = '';
      try {
        const url = await upload(item.file, { scene: 'panorama' });
        item.url = typeof url === 'string' ? url : (url?.[0] ?? '');
        item.status = 'uploaded';
        created.push(item);
      } catch (error) {
        console.error('[panorama] upload failed:', error);
        item.status = 'error';
        item.message = error?.message || '上传失败';
      }
      batchProgress.value = Math.round(((index + 1) / pending.length) * 40);
    }

    if (!created.length) {
      message.error('全部图片上传失败');
      return;
    }

    // 2. 一次性建场景（标题默认取文件名），先不切片
    batchStage.value = '创建场景';
    const { data } = await new Resource('panorama-scenes/batch').store({
      tile: false,
      items: created.map((item) => ({
        image: item.url,
        title: item.name.replace(/\.[^.]+$/, ''),
      })),
    });
    const scenes = Array.isArray(data) ? data : [];
    scenes.forEach((scene, index) => {
      const item = created[index];
      if (item) item.sceneId = scene.id;
    });
    batchProgress.value = 50;

    // 3. 逐张切片（同步 GD 处理，给足超时）
    batchStage.value = '切片处理';
    for (const [index, item] of scenes.entries()) {
      try {
        await requestClient.post(`/panorama-scenes/${item.id}/tile`, undefined, {
          timeout: TILE_TIMEOUT,
        });
        const source = created[index];
        if (source) source.status = 'done';
      } catch (error) {
        console.error('[panorama] tile failed:', error);
        const source = created[index];
        if (source) {
          source.status = 'error';
          source.message = `切片失败：${error?.message || '未知错误'}`;
        }
      }
      batchProgress.value = 50 + Math.round(((index + 1) / scenes.length) * 50);
    }

    batchStage.value = '完成';
    refreshList();

    const failed = batchItems.value.filter((item) => item.status === 'error').length;
    if (failed) {
      message.warning(`${batchItems.value.length - failed} 个成功，${failed} 个失败`);
    } else {
      message.success('全部场景已创建并完成切片');
      batchOpen.value = false;
    }
  } catch (error) {
    console.error('[panorama] batch failed:', error);
    message.error(error?.message || '批量创建失败');
  } finally {
    batchBusy.value = false;
  }
}

/* ===================== 应用上下文 ===================== */

/**
 * 独立访问（侧栏入口）时把「当前应用」切到本租户的**全景**应用。
 *
 * 应用级接口走 X-Application-Id 请求头，值取 localStorage 里选中的应用；从侧栏进来时
 * 没有 appId 兜底，若那个应用恰好是网站，列表会永远是空的、用户也不知道为什么。
 * 所以这里主动找一次 type=4 的应用，找不到就明说，而不是给一张空表。
 */
async function resolveStandaloneApplication() {
  try {
    const data = await requestClient.get('/applications', {
      params: { per_page: 100 },
    });
    const apps = Array.isArray(data) ? data : (data?.data ?? []);
    const panorama = apps.find((app) => Number(app?.type) === 4);

    if (!panorama) {
      message.warning('当前租户还没有「全景」类型的应用，请先到「应用中心」新建一个');
      return;
    }
    if (getCurrentApplicationId() === Number(panorama.id)) {
      return;
    }

    setCurrentApplicationId(panorama.id);
    refreshList();
  } catch {
    // 取不到应用列表不影响抽屉模式（appId 由父组件传入）；独立访问时交给表格自己的空态
  }
}

onMounted(() => {
  const id = Number(props.appId);
  if (id > 0) {
    setCurrentApplicationId(id);
    return;
  }

  resolveStandaloneApplication();
});

watch(
  () => props.appId,
  (value) => {
    const id = Number(value);
    if (id > 0) setCurrentApplicationId(id);
  },
);
</script>

<template>
  <div class="panorama-scenes-page">
    <AppCrudTable
      ref="crudRef"
      api-url="panorama-scenes"
      v-model="formData"
      :filter-fields="filterFields"
      :fields="formFields"
      :grid-options="{
        columns: gridColumns,
        showOverflow: false,
        columnConfig: { resizable: true },
      }"
      :open-mode="{ create: 'modal', detail: 'modal' }"
      :form-attrs="{ layout: 'vertical', size: 'medium' }"
      :detail-props="{ class: 'w-[720px]' }"
      :actions-config="actionsConfig"
      :inline-actions="['panorama_edit', 'edit', 'delete']"
      :save-format="saveFormat"
      :list-format="listFormat"
      :detail-format="detailFormat"
      permission-name="cms.panorama"
      title="全景场景"
      class="p-4"
      @update:list="allScenes = $event"
      @saved="onSaved"
    >
      <template #sub-title>
        <span class="text-xs text-gray-400">
          一个场景 = 一张 2:1 等距圆柱底图；「全景编辑」里布点、采集首屏视角、校正北向
        </span>
      </template>

      <template #toolbar-append>
        <Button type="primary" ghost @click="openBatch">批量上传</Button>
      </template>

      <template #default_thumb="{ row }">
        <img
          v-if="row.thumb"
          :src="row.thumb"
          alt=""
          class="h-8 w-16 rounded object-cover"
        />
        <span v-else class="text-xs text-gray-400">-</span>
      </template>

      <template #default_source="{ row }">
        <span v-if="row.source_width" class="text-xs">
          {{ row.source_width }} × {{ row.source_height }}
        </span>
        <span v-else class="text-xs text-gray-400">-</span>
        <Tag
          v-if="row.source_width && row.is_equirectangular === false"
          color="orange"
          class="ml-1"
          :title="`原图不是 2:1，切片时已中心裁切为 ${row.width} × ${row.height}`"
        >
          已裁
        </Tag>
      </template>

      <template #default_size="{ row }">
        <span v-if="row.width" class="text-xs">
          {{ row.width }} × {{ row.height }}
        </span>
        <span v-else class="text-xs text-gray-400">-</span>
      </template>

      <template #default_tile="{ row }">
        <Tag :color="(TILE_META[row.tile_status] || TILE_META.none).color">
          {{ (TILE_META[row.tile_status] || TILE_META.none).text }}
        </Tag>
      </template>

      <template #default_status="{ row }">
        <Tag :color="row.status === 1 ? 'green' : 'default'">
          {{ row.status === 1 ? '展示' : '隐藏' }}
        </Tag>
      </template>
    </AppCrudTable>

    <PanoramaSceneEditor
      v-model:open="editorOpen"
      :scene="editorRow"
      :scenes="allScenes"
      @saved="onEditorSaved"
    />

    <Modal
      v-model:open="batchOpen"
      title="批量上传全景图"
      width="640"
      :mask-closable="!batchBusy"
      :closable="!batchBusy"
      :ok-text="batchBusy ? '处理中…' : `开始处理（${batchPendingCount}）`"
      ok-text-type="primary"
      cancel-text="关闭"
      :ok-button-props="{ disabled: batchBusy || batchPendingCount === 0 }"
      :cancel-button-props="{ disabled: batchBusy }"
      @ok="startBatch"
    >
      <div
        class="batch-drop"
        :class="{ 'is-busy': batchBusy }"
        @click="!batchBusy && pickBatchFiles()"
        @dragover.prevent
        @drop.prevent="!batchBusy && onBatchDrop($event)"
      >
        <span class="icon-[mdi--cloud-upload-outline] h-8 w-8 text-gray-400"></span>
        <p class="mt-2 text-sm text-gray-600">点击或拖拽多张全景图到此处</p>
        <p class="text-xs text-gray-400">
          支持 JPG / PNG / WebP，建议 2:1 等距圆柱；文件名会作为场景名称
        </p>
      </div>

      <input
        ref="batchInputEl"
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        @change="onBatchInput"
      />

      <div v-if="batchBusy" class="mt-3">
        <Progress :percent="batchProgress" :status="batchStage === '完成' ? 'success' : 'active'" />
        <p class="mt-1 text-xs text-gray-500">{{ batchStage }}…</p>
      </div>

      <div v-if="offRatioItems.length" class="ratio-warning">
        <p class="ratio-warning-title">
          {{ offRatioItems.length }} 张不是 2:1 全景比例，切片时会自动中心裁切，裁掉的部分不可恢复
        </p>
        <ul class="ratio-warning-list">
          <li v-for="item in offRatioItems" :key="item.key">
            <strong>{{ item.name }}</strong>：{{ describeCrop(item.sourceWidth, item.sourceHeight) }}
          </li>
        </ul>
      </div>

      <div v-if="batchItems.length" class="batch-list">
        <div v-for="item in batchItems" :key="item.key" class="batch-item">
          <span class="batch-name" :title="item.name">{{ item.name }}</span>
          <span class="batch-size">{{ formatSize(item.size) }}</span>
          <Tag
            :color="{
              pending: 'default',
              uploading: 'processing',
              uploaded: 'blue',
              done: 'green',
              error: 'red',
            }[item.status]"
          >
            {{
              {
                pending: '待处理',
                uploading: '上传中',
                uploaded: '已上传',
                done: '完成',
                error: '失败',
              }[item.status]
            }}
          </Tag>
          <span v-if="item.message" class="batch-error" :title="item.message">
            {{ item.message }}
          </span>
          <Button
            v-if="!batchBusy && (item.status === 'pending' || item.status === 'error')"
            size="small"
            type="text"
            danger
            @click="removeBatchItem(item.key)"
          >
            移除
          </Button>
        </div>
      </div>
      <Empty v-else class="mt-3" description="还没有选择文件" />

      <p class="mt-3 text-xs text-gray-400">
        共 {{ batchItems.length }} 张，已完成 {{ batchDoneCount }} 张。切片是服务端同步处理，
        图片越大耗时越久，请勿关闭窗口。
      </p>
    </Modal>
  </div>
</template>

<style scoped>
.panorama-scenes-page {
  min-height: 100%;
}

.batch-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  cursor: pointer;
  background: #fafbfc;
  border: 1px dashed #d9d9d9;
  border-radius: 8px;
  transition: border-color 0.2s, background 0.2s;
}

.batch-drop:hover {
  background: #f0f6ff;
  border-color: #1677ff;
}

.batch-drop.is-busy {
  cursor: not-allowed;
  opacity: 0.6;
}

.batch-list {
  max-height: 260px;
  margin-top: 12px;
  overflow-y: auto;
}

.batch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed rgb(0 0 0 / 6%);
}

.batch-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-size {
  flex: none;
  font-size: 12px;
  color: rgb(0 0 0 / 45%);
  font-variant-numeric: tabular-nums;
}

.batch-error {
  flex: 0 1 160px;
  overflow: hidden;
  font-size: 12px;
  color: #cf1322;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 非 2:1 的比例警告：静默裁切是不可逆的，必须显眼 */
.ratio-warning {
  margin-top: 12px;
  padding: 8px 12px;
  border: 1px solid #ffd591;
  border-radius: 6px;
  background: #fff7e6;
}

.ratio-warning-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #d46b08;
}

.ratio-warning-list {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: #874d00;
  list-style: disc;
}

.ratio-warning-list li + li {
  margin-top: 2px;
}
</style>
