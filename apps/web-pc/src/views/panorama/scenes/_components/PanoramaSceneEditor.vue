<script setup>
/**
 * 全景场景编辑器（抽屉）。
 *
 * 这是「便捷编辑」的核心：把 krpano 里要写 XML 才能干的事，做成所见即所得的面板。
 *
 *   1. 实时预览：直接嵌 Photo Sphere Viewer，编辑的就是访客看到的那一版；
 *   2. 布点：选一种热点类型后点全景图任意位置落点，落点后自动选中并展开属性；
 *   3. 微调：按住球面上的热点圆点拖动即可改 yaw/pitch，不必手填数字；
 *   4. 初始视角：一键把「当前看到的画面」采集成场景首屏视角（含视场角）；
 *   5. 北向校正：把当前朝向标记为正北，播放页据此显示罗盘方位角。
 *
 * 坐标换算全部走 panoramaProjection.ts（纯函数、有单测），本文件只负责
 * 「拿 PSV 的弧度 → 度 → 存模型 → 同步 marker」这条链路，避免两处各写一套公式。
 */
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';

import { Viewer } from '@photo-sphere-viewer/core';
import { EquirectangularTilesAdapter } from '@photo-sphere-viewer/equirectangular-tiles-adapter';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';

import {
  Button,
  Drawer,
  Input,
  InputNumber,
  Popconfirm,
  Segmented,
  Select,
  Tag,
  message,
} from 'antdv-next';

import { upload } from '#/api';
import { requestClient } from '#/api/request';
import Resource from '#/api/resource';

import {
  clampPitch,
  hFovToZoom,
  normalizeYaw,
  zoomToHFov,
} from './panoramaProjection';

import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';

const props = defineProps({
  open: { type: Boolean, default: false },
  /** 待编辑场景（列表行数据即可，含 hotspots / tiles / initial_view / north_offset）。 */
  scene: { type: Object, default: null },
  /** 同一应用下的全部场景，用于「场景跳转」热点的目标选择。 */
  scenes: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:open', 'saved']);

/** 热点类型元数据：类型 → 中文名 / 颜色 / 图标。 */
const HOTSPOT_TYPES = [
  { value: 'scene', label: '场景跳转', color: 'blue' },
  { value: 'info', label: '图文说明', color: 'green' },
  { value: 'link', label: '网页链接', color: 'orange' },
  { value: 'video', label: '视频', color: 'purple' },
  { value: 'image', label: '图片', color: 'magenta' },
];

/** 顶栏「放置模式」选项：浏览态 + 5 种热点类型。 */
const placeOptions = [
  { label: '浏览', value: 'browse' },
  ...HOTSPOT_TYPES.map((item) => ({ label: item.label, value: item.value })),
];

function typeMeta(type) {
  return HOTSPOT_TYPES.find((item) => item.value === type) || HOTSPOT_TYPES[1];
}

const loading = ref(false);
const saving = ref(false);
const uploading = ref(false);

/** 热点工作副本（保存时整份替换）。`_key` 仅用于前端 keying 与拖拽定位。 */
const hotspots = ref([]);
const selectedKey = ref(null);
/** 'browse' | 'scene' | 'info' | 'link' | 'video' | 'image' */
const placeMode = ref('browse');
const initialView = ref({ yaw: 0, pitch: 0, hfov: 75 });
const northOffset = ref(0);
/** 当前朝向（用于「设为北向」与罗盘提示）。 */
const currentYaw = ref(0);

const viewerEl = ref(null);
const viewer = shallowRef(null);
const markers = shallowRef(null);

let keySeq = 0;
let draggingKey = null;
let resizeObserver = null;
let mountRetry = 0;
let mountTimer = null;

const scene = computed(() => props.scene || {});
const sceneId = computed(() => scene.value.id || null);

const tileStatus = computed(() => {
  const status = scene.value.tile_status || 'none';
  return {
    none: { text: '未切片', color: 'default' },
    pending: { text: '切片中', color: 'processing' },
    ready: { text: '已就绪', color: 'green' },
    failed: { text: '切片失败', color: 'red' },
  }[status] || { text: status, color: 'default' };
});

const targetSceneOptions = computed(() =>
  props.scenes
    .filter((item) => Number(item.id) !== Number(sceneId.value))
    .map((item) => ({ label: item.title || `#${item.id}`, value: item.id })),
);

/**
 * 跳转热点（type=scene）的内置图标 —— 设计与素材借鉴老平台 hsdx720：
 * animated = 动态雪碧图（25 帧循环播放），选择器里只静态预览第一帧。
 * key 清单与后端 `PanoramaHotspot::ICONS` 保持一致，后端按它校验。
 */
const HOTSPOT_ICONS = {
  'arrow-forward': { label: '直行', src: '/panorama-icons/arrow-forward.png', animated: false },
  'arrow-up': { label: '向上 / 上楼', src: '/panorama-icons/arrow-up.png', animated: true },
  'arrow-down': { label: '向下 / 下楼', src: '/panorama-icons/arrow-down.png', animated: true },
  'arrow-left': { label: '向左', src: '/panorama-icons/arrow-left.png', animated: true },
  'arrow-right': { label: '向右', src: '/panorama-icons/arrow-right.png', animated: true },
  plane: { label: '飞机（常用于标航拍场景）', src: '/panorama-icons/plane.png', animated: true },
};

const selectedHotspot = computed(() =>
  hotspots.value.find((item) => item._key === selectedKey.value) || null,
);

/** 底部提示条文案：告诉用户当前该做什么。 */
const hint = computed(() => {
  if (placeMode.value !== 'browse') {
    return `「${typeMeta(placeMode.value).label}」放置中：点击全景图空白处落点（Esc 取消）`;
  }
  if (selectedHotspot.value) {
    return '拖动球面上的圆点可微调位置；右侧面板可改标题与目标';
  }
  return '选择一种热点类型后点击画面落点；拖动圆点微调位置';
});

/* ===================== 生命周期 ===================== */

watch(
  () => props.open,
  async (open) => {
    if (open) {
      resetFromScene();
      window.addEventListener('keydown', onKeydown);
      await nextTick();
      mountViewer();
    } else {
      window.removeEventListener('keydown', onKeydown);
      unmountViewer();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  unmountViewer();
});

function resetFromScene() {
  const source = scene.value;
  hotspots.value = (source.hotspots || []).map((item) => ({
    _key: `h${(keySeq += 1)}`,
    id: item.id ?? null,
    type: item.type || 'info',
    title: item.title || '',
    content: item.content || '',
    target_scene_id: item.target_scene_id ?? null,
    // 到达视角（scene 热点）：null = 沿用目标场景初始视角
    target_yaw: item.target_yaw ?? null,
    target_pitch: item.target_pitch ?? null,
    url: item.url || '',
    // 图集（仅 image 类型有意义）。老数据可能只有 url，这里归一化成数组，
    // 编辑器里只维护 urls 一处，保存时再回写 url = urls[0]。
    urls: Array.isArray(item.urls) && item.urls.length
      ? [...item.urls]
      : (item.url ? [item.url] : []),
    icon: item.icon || '',
    yaw: Number(item.yaw || 0),
    pitch: Number(item.pitch || 0),
    size: Number(item.size || 32),
    sort: Number(item.sort || 0),
  }));

  const view = source.initial_view || {};
  initialView.value = {
    yaw: Number(view.yaw || 0),
    pitch: Number(view.pitch || 0),
    hfov: Number(view.hfov || 75),
  };
  northOffset.value = Number(source.north_offset || 0);

  selectedKey.value = null;
  placeMode.value = 'browse';
  currentYaw.value = initialView.value.yaw;
}

/* ===================== 播放器 ===================== */

function mountViewer() {
  if (viewer.value) return;

  // 抽屉首帧容器可能还没渲染出来（懒挂载 + 入场动画），重试几帧再放弃。
  if (!viewerEl.value) {
    if (mountRetry < 10) {
      mountRetry += 1;
      mountTimer = window.setTimeout(mountViewer, 50);
    }
    return;
  }
  mountRetry = 0;

  const instance = new Viewer({
    container: viewerEl.value,
    adapter: [
      EquirectangularTilesAdapter,
      // 编辑态底图不模糊：布点要看清楚每一处细节
      { baseBlur: false, showErrorTile: false, antialias: true },
    ],
    plugins: [[MarkersPlugin, { clickEventOnMarker: false }]],
    navbar: ['zoom', 'move', 'caption', 'fullscreen'],
    touchmoveTwoFingers: false,
    mousewheelCtrlKey: false,
    loadingTxt: '全景加载中…',
    lang: {
      zoom: '缩放',
      zoomOut: '缩小',
      zoomIn: '放大',
      moveUp: '向上',
      moveDown: '向下',
      moveLeft: '向左',
      moveRight: '向右',
      fullscreen: '全屏',
      loading: '加载中…',
      menu: '菜单',
      close: '关闭',
      twoFingers: '使用双指操作',
      loadError: '全景图加载失败',
      webglError: '当前浏览器不支持 WebGL',
    },
  });

  viewer.value = instance;
  markers.value = instance.getPlugin(MarkersPlugin);

  instance.addEventListener('click', onViewerClick);
  instance.addEventListener('position-updated', ({ position }) => {
    currentYaw.value = round3((position.yaw * 180) / Math.PI);
  });

  // 拖拽起手：marker 上带 psv--capture-event，PSV 自身会忽略来自它的事件
  // （见 core EventsHandler::handleEvent），这里只需接管指针流。
  viewerEl.value.addEventListener('pointerdown', onMarkerPointerDown);

  // 抽屉有入场动画，首帧容器可能是 0×0；PSV 自带 ResizeObserver，
  // 但首屏尺寸要在挂载后立刻纠正一次，否则默认视场角会按 0 宽算。
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => instance.autoSize());
    resizeObserver.observe(viewerEl.value);
  }
  instance.autoSize();

  loadPanorama();
}

function unmountViewer() {
  if (mountTimer !== null) {
    window.clearTimeout(mountTimer);
    mountTimer = null;
  }
  mountRetry = 0;
  stopDragging();

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (viewerEl.value) {
    viewerEl.value.removeEventListener('pointerdown', onMarkerPointerDown);
  }
  if (viewer.value) {
    viewer.value.destroy();
    viewer.value = null;
    markers.value = null;
  }
}

/** 场景 → PSV panorama：有瓦片走瓦片，否则整图当单块瓦片（不模糊）。 */
function panoramaConfig(source) {
  const tiles = source.tiles;

  if (tiles && tiles.tilePrefix && tiles.cols > 0 && tiles.rows > 0) {
    return {
      baseUrl: tiles.baseUrl || source.preview || source.image,
      width: tiles.width,
      cols: tiles.cols,
      rows: tiles.rows,
      tileUrl: (col, row) => `${tiles.tilePrefix}${col}_${row}.${tiles.tileExt || 'jpg'}`,
    };
  }

  return {
    width: source.width || 4096,
    cols: 1,
    rows: 1,
    tileUrl: () => source.image || source.preview,
  };
}

async function loadPanorama() {
  const instance = viewer.value;
  if (!instance) return;

  loading.value = true;
  try {
    await instance.setPanorama(panoramaConfig(scene.value), {
      transition: false,
      // ⚠️ setPanorama 只认 position / zoom。defaultYaw / defaultPitch / defaultZoomLvl 是
      // Viewer 构造参数，传给 setPanorama 会被静默忽略（编辑器打开时视角停在原点）。
      // position 必须同时给 yaw 与 pitch，否则 PSV 的 cleanPosition() 直接抛错。
      position: {
        yaw: deg(initialView.value.yaw),
        pitch: deg(initialView.value.pitch),
      },
      zoom: hFovToZoom(initialView.value.hfov, aspectOf(instance)),
    });
    syncMarkers();
  } catch (error) {
    console.error('[panorama-editor] setPanorama failed:', error);
    message.error('全景图加载失败，请检查图片是否可访问');
  } finally {
    loading.value = false;
  }
}

function aspectOf(instance) {
  const aspect = instance?.state?.aspect;
  return Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
}

/* ===================== 标记渲染 ===================== */

function markerId(key) {
  return `hotspot-${key}`;
}

function syncMarkers() {
  const plugin = markers.value;
  if (!plugin) return;

  plugin.setMarkers(
    hotspots.value.map((item, index) => ({
      id: markerId(item._key),
      position: { yaw: deg(item.yaw), pitch: deg(item.pitch) },
      // psv--capture-event：告诉 PSV「别把这里的事件当成转动全景」，见 core EventsHandler
      html: `<div class="pano-edit-marker psv--capture-event" data-type="${item.type}" data-hotspot-key="${item._key}">${index + 1}</div>`,
      size: { width: 30, height: 30 },
      anchor: 'center center',
      tooltip: item.title || typeMeta(item.type).label,
      className: item._key === selectedKey.value ? 'pano-edit-marker-selected' : '',
    })),
  );
}

/* ===================== 交互：落点 / 选中 / 拖拽 ===================== */

function onViewerClick({ yaw, pitch }) {
  if (placeMode.value === 'browse') {
    selectedKey.value = null;
    syncMarkers();
    return;
  }

  const item = {
    _key: `h${(keySeq += 1)}`,
    id: null,
    type: placeMode.value,
    title: '',
    content: '',
    target_scene_id: null,
    url: '',
    urls: [],
    icon: '',
    yaw: normalizeYaw((yaw * 180) / Math.PI),
    pitch: clampPitch((pitch * 180) / Math.PI),
    size: 32,
    sort: hotspots.value.length,
  };

  if (item.type === 'scene' && targetSceneOptions.value.length > 0) {
    item.target_scene_id = targetSceneOptions.value[0].value;
  }

  hotspots.value.push(item);
  selectedKey.value = item._key;
  placeMode.value = 'browse';
  syncMarkers();
}

function onMarkerPointerDown(event) {
  const target = event.target?.closest?.('[data-hotspot-key]');
  if (!target) return;

  const key = target.getAttribute('data-hotspot-key');
  if (!key) return;

  event.preventDefault();

  selectedKey.value = key;
  syncMarkers();

  draggingKey = key;
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', stopDragging, { once: true });
  window.addEventListener('pointercancel', stopDragging, { once: true });
}

function onDragMove(event) {
  if (!draggingKey || !viewer.value || !viewerEl.value) return;

  const rect = viewerEl.value.getBoundingClientRect();
  const coords = viewer.value.dataHelper.viewerCoordsToSphericalCoords({
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  });
  if (!coords) return;

  const item = hotspots.value.find((entry) => entry._key === draggingKey);
  if (!item) return;

  item.yaw = normalizeYaw((coords.yaw * 180) / Math.PI);
  item.pitch = clampPitch((coords.pitch * 180) / Math.PI);

  // render=false + needsUpdate：只挪这一个点，不触发整表重算
  markers.value?.updateMarker(
    {
      id: markerId(item._key),
      position: { yaw: deg(item.yaw), pitch: deg(item.pitch) },
    },
    false,
  );
  viewer.value.needsUpdate();
}

function stopDragging() {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', stopDragging);
  window.removeEventListener('pointercancel', stopDragging);
  draggingKey = null;
}

function selectHotspot(key) {
  selectedKey.value = selectedKey.value === key ? null : key;
  syncMarkers();
}

function removeHotspot(key) {
  hotspots.value = hotspots.value.filter((item) => item._key !== key);
  if (selectedKey.value === key) selectedKey.value = null;
  syncMarkers();
}

/* ===================== 视角 / 北向 ===================== */

function captureCurrentView() {
  const instance = viewer.value;
  if (!instance) return;

  const position = instance.getPosition();
  initialView.value = {
    yaw: normalizeYaw((position.yaw * 180) / Math.PI),
    pitch: clampPitch((position.pitch * 180) / Math.PI),
    hfov: Math.round(zoomToHFov(instance.getZoomLevel(), aspectOf(instance))),
  };
  message.success('已把当前画面采集为场景首屏视角');
}

function captureNorth() {
  northOffset.value = normalizeYaw(currentYaw.value);
  message.success(`已把当前朝向（${Math.round(northOffset.value)}°）设为正北`);
}

function previewInitialView() {
  const instance = viewer.value;
  if (!instance) return;

  // rotate() 只改朝向；初始视角还包含水平视场角，必须另外 zoom()，否则预览的远近是错的
  instance.rotate({
    yaw: deg(initialView.value.yaw),
    pitch: deg(initialView.value.pitch),
  });
  instance.zoom(hFovToZoom(initialView.value.hfov, aspectOf(instance)));
}

/* ===================== 上传（热点媒体） ===================== */

/** 单个热点最多几张图（与后端 `PanoramaHotspot::MAX_GALLERY` 一致）。 */
const MAX_GALLERY = 50;

async function uploadHotspotMedia(item, files) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return;

  // 图集类型：一次可多选，逐张追加，不改动已有顺序
  if (item.type === 'image') {
    const room = MAX_GALLERY - (item.urls?.length || 0);
    if (room <= 0) {
      message.warning(`单个热点最多 ${MAX_GALLERY} 张图`);
      return;
    }
    const picked = list.slice(0, room);
    if (list.length > room) {
      message.warning(`最多 ${MAX_GALLERY} 张，已只取前 ${room} 张`);
    }

    uploading.value = true;
    try {
      for (const file of picked) {
        const url = await upload(file, { scene: 'panorama' });
        const resolved = typeof url === 'string' ? url : (url?.[0] ?? '');
        if (resolved) item.urls.push(resolved);
      }
      if (!item.title && picked.length === 1) {
        item.title = picked[0].name.replace(/\.[^.]+$/, '');
      }
    } catch (error) {
      console.error('[panorama-editor] upload failed:', error);
      message.error('上传失败');
    } finally {
      uploading.value = false;
    }
    return;
  }

  uploading.value = true;
  try {
    const url = await upload(list[0], { scene: 'panorama' });
    item.url = typeof url === 'string' ? url : (url?.[0] ?? '');
    if (!item.title) item.title = list[0].name.replace(/\.[^.]+$/, '');
  } catch (error) {
    console.error('[panorama-editor] upload failed:', error);
    message.error('上传失败');
  } finally {
    uploading.value = false;
  }
}

function pickMedia(item, accept, multiple = false) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  if (multiple) input.multiple = true;
  input.addEventListener('change', () => {
    uploadHotspotMedia(item, input.files);
  });
  input.click();
}

function removeGalleryItem(item, index) {
  item.urls.splice(index, 1);
}

/** 调整图集顺序：`delta = -1` 上移、`1` 下移。顺序即播放器里的浏览顺序。 */
function moveGalleryItem(item, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= item.urls.length) return;
  const [moved] = item.urls.splice(index, 1);
  item.urls.splice(target, 0, moved);
}

/* ===================== 保存 ===================== */

function hotspotPayload() {
  return hotspots.value.map((item, index) => {
    // 图集：去空去重，最多 MAX_GALLERY 张
    const urls = item.type === 'image'
      ? Array.from(new Set((item.urls || []).map((u) => String(u || '').trim()).filter(Boolean)))
        .slice(0, MAX_GALLERY)
      : [];

    return {
      type: item.type,
      title: item.title || null,
      content: item.content || null,
      target_scene_id: item.type === 'scene' ? item.target_scene_id : null,
      // 到达视角只在 scene 类型上有意义；留空 = 沿用目标场景初始视角
      target_yaw: item.type === 'scene' && item.target_yaw !== null && item.target_yaw !== undefined
        ? normalizeYaw(Number(item.target_yaw))
        : null,
      target_pitch: item.type === 'scene' && item.target_pitch !== null && item.target_pitch !== undefined
        ? clampPitch(Number(item.target_pitch))
        : null,
      // url 恒等于图集第一张：老消费者只认 url，不能因为图集而读不到东西
      url: urls.length ? urls[0] : (item.url || null),
      urls: urls.length ? urls : null,
      icon: item.icon || null,
      yaw: normalizeYaw(Number(item.yaw)),
      pitch: clampPitch(Number(item.pitch)),
      size: Number(item.size) || 32,
      sort: index,
    };
  });
}

async function save() {
  if (!sceneId.value) {
    message.warning('场景尚未保存，无法保存热点');
    return;
  }

  const invalid = hotspots.value.find(
    (item) => item.type === 'scene' && !item.target_scene_id,
  );
  if (invalid) {
    message.warning('「场景跳转」热点必须指定目标场景');
    return;
  }

  saving.value = true;
  try {
    await new Resource('panorama-scenes').update(sceneId.value, {
      initial_yaw: Number(initialView.value.yaw),
      initial_pitch: Number(initialView.value.pitch),
      initial_hfov: Number(initialView.value.hfov),
      north_offset: Number(northOffset.value),
      // 视角/热点调整不涉及换图，不要触发重新切片（大图切片很贵）
      tile: false,
    });
    await requestClient.put(`/panorama-scenes/${sceneId.value}/hotspots`, {
      hotspots: hotspotPayload(),
    });

    message.success('已保存');
    emit('saved');
  } catch (error) {
    console.error('[panorama-editor] save failed:', error);
    message.error(error?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

/* ===================== 工具 ===================== */

function deg(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number}deg` : '0deg';
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function onKeydown(event) {
  if (event.key === 'Escape' && placeMode.value !== 'browse') {
    placeMode.value = 'browse';
  }
}</script>

<template>
  <Drawer
    :open="open"
    title="全景场景编辑"
    :width="'calc(100vw - 24px)'"
    :body-style="{ padding: '0px', overflow: 'hidden' }"
    destroy-on-close
    @close="emit('update:open', false)"
  >
    <template #extra>
      <span v-if="scene.title" class="mr-3 text-xs text-gray-400">{{ scene.title }}</span>
      <Tag :color="tileStatus.color">{{ tileStatus.text }}</Tag>
    </template>

    <div v-if="open" class="pano-editor">
      <!-- 左：球面预览 + 放置工具 -->
      <div class="pano-editor-stage">
        <div class="pano-editor-toolbar">
          <Segmented
            v-model:value="placeMode"
            size="small"
            :options="placeOptions"
          />
          <span class="pano-editor-hint">{{ hint }}</span>
        </div>

        <div ref="viewerEl" class="pano-editor-viewer"></div>

        <div v-if="loading" class="pano-editor-loading">全景加载中…</div>
      </div>

      <!-- 右：属性面板 -->
      <aside class="pano-editor-panel">
        <section class="pano-editor-block">
          <header class="pano-editor-block-head">
            <span>场景设置</span>
            <Button size="small" type="link" @click="previewInitialView">预览首屏</Button>
          </header>

          <div class="pano-editor-field">
            <label>首屏经度 yaw</label>
            <InputNumber
              v-model:value="initialView.yaw"
              size="small"
              :min="-180"
              :max="180"
              :step="1"
              addon-after="°"
            />
          </div>
          <div class="pano-editor-field">
            <label>首屏纬度 pitch</label>
            <InputNumber
              v-model:value="initialView.pitch"
              size="small"
              :min="-90"
              :max="90"
              :step="1"
              addon-after="°"
            />
          </div>
          <div class="pano-editor-field">
            <label>首屏视野 hfov</label>
            <InputNumber
              v-model:value="initialView.hfov"
              size="small"
              :min="30"
              :max="140"
              :step="1"
              addon-after="°"
            />
          </div>
          <Button size="small" block @click="captureCurrentView">采集当前画面为首屏</Button>

          <div class="pano-editor-field mt-3">
            <label>北向偏移</label>
            <InputNumber
              v-model:value="northOffset"
              size="small"
              :min="-180"
              :max="180"
              :step="1"
              addon-after="°"
            />
          </div>
          <Button size="small" block @click="captureNorth">
            把当前朝向设为正北（{{ Math.round(currentYaw) }}°）
          </Button>

          <dl class="pano-editor-meta">
            <div>
              <dt>底图尺寸</dt>
              <dd>{{ scene.width || '-' }} × {{ scene.height || '-' }}</dd>
            </div>
            <div>
              <dt>瓦片</dt>
              <dd>
                <template v-if="scene.tiles">
                  {{ scene.tiles.cols }} 列 × {{ scene.tiles.rows }} 行 / 单块 {{ scene.tiles.tileSize }}px
                </template>
                <template v-else>-</template>
              </dd>
            </div>
            <div>
              <dt>切片时间</dt>
              <dd>{{ scene.tiled_at || '-' }}</dd>
            </div>
          </dl>
          <p v-if="scene.tile_error" class="pano-editor-error">{{ scene.tile_error }}</p>
        </section>

        <section class="pano-editor-block pano-editor-block-grow">
          <header class="pano-editor-block-head">
            <span>热点（{{ hotspots.length }}）</span>
          </header>

          <p v-if="!hotspots.length" class="pano-editor-empty">
            还没有热点。选择上方的热点类型，然后在画面里点一下即可落点。
          </p>

          <ul v-else class="pano-editor-list">
            <li
              v-for="(item, index) in hotspots"
              :key="item._key"
              class="pano-editor-item"
              :class="{ 'is-selected': item._key === selectedKey }"
            >
              <div class="pano-editor-item-head" @click="selectHotspot(item._key)">
                <span class="pano-editor-index">{{ index + 1 }}</span>
                <Tag :color="typeMeta(item.type).color">{{ typeMeta(item.type).label }}</Tag>
                <span class="pano-editor-item-title">{{ item.title || '未命名' }}</span>
                <span class="pano-editor-item-coord">
                  {{ Math.round(item.yaw) }}° / {{ Math.round(item.pitch) }}°
                </span>
                <Popconfirm title="删除该热点？" @confirm="removeHotspot(item._key)">
                  <Button size="small" type="text" danger @click.stop>删除</Button>
                </Popconfirm>
              </div>

              <div v-if="item._key === selectedKey" class="pano-editor-item-body">
                <div class="pano-editor-field">
                  <label>标题</label>
                  <Input v-model:value="item.title" size="small" placeholder="鼠标悬停显示的文字" />
                </div>

                <template v-if="item.type === 'scene'">
                  <div class="pano-editor-field">
                    <label>跳转目标</label>
                    <Select
                      v-model:value="item.target_scene_id"
                      size="small"
                      style="width: 100%"
                      :options="targetSceneOptions"
                      placeholder="选择要跳转到的场景"
                    />
                  </div>
                  <div class="pano-editor-field">
                    <label>跳转图标</label>
                    <div class="pano-icon-picker">
                      <button
                        type="button"
                        class="pano-icon-cell"
                        :class="{ active: !item.icon }"
                        title="默认圆点"
                        @click="item.icon = ''"
                      >
                        <span class="pano-icon-dot"></span>
                      </button>
                      <button
                        v-for="(meta, key) in HOTSPOT_ICONS"
                        :key="key"
                        type="button"
                        class="pano-icon-cell"
                        :class="{ active: item.icon === key }"
                        :title="meta.label"
                        @click="item.icon = key"
                      >
                        <span
                          class="pano-icon-thumb"
                          :class="{ animated: meta.animated }"
                          :style="{ backgroundImage: `url(${meta.src})` }"
                        ></span>
                      </button>
                    </div>
                  </div>
                  <p class="pano-editor-hint">图标只在播放页生效（动态图标会循环播放）；留空 = 默认圆点。</p>
                  <div class="pano-editor-row">
                    <div class="pano-editor-field">
                      <label>到达 yaw</label>
                      <InputNumber v-model:value="item.target_yaw" size="small" :step="1" :min="-180" :max="180" placeholder="缺省" />
                    </div>
                    <div class="pano-editor-field">
                      <label>到达 pitch</label>
                      <InputNumber v-model:value="item.target_pitch" size="small" :step="1" :min="-90" :max="90" placeholder="缺省" />
                    </div>
                  </div>
                  <p class="pano-editor-hint">到达视角 = 跳过去之后朝哪看；留空沿用目标场景自己的初始视角。</p>
                </template>

                <template v-else-if="item.type === 'info'">
                  <div class="pano-editor-field">
                    <label>说明内容</label>
                    <Input.TextArea
                      v-model:value="item.content"
                      size="small"
                      :rows="3"
                      placeholder="点击热点后弹出的说明文字"
                    />
                  </div>
                </template>

                <template v-else-if="item.type === 'image'">
                  <div class="pano-editor-field">
                    <label>图片（{{ item.urls.length }} 张，按顺序浏览）</label>
                    <ul v-if="item.urls.length" class="pano-gallery-list">
                      <li v-for="(url, index) in item.urls" :key="`${item._key}-${index}`">
                        <img class="pano-gallery-thumb" :src="url" alt="">
                        <span class="pano-gallery-index">{{ index + 1 }}</span>
                        <span class="pano-gallery-actions">
                          <Button size="small" type="text" :disabled="index === 0" @click="moveGalleryItem(item, index, -1)">上移</Button>
                          <Button size="small" type="text" :disabled="index === item.urls.length - 1" @click="moveGalleryItem(item, index, 1)">下移</Button>
                          <Button size="small" type="text" danger @click="removeGalleryItem(item, index)">移除</Button>
                        </span>
                      </li>
                    </ul>
                    <p v-else class="pano-editor-hint">还没有图片，点下面按钮添加（可多选）。</p>
                  </div>
                  <Button
                    size="small"
                    :loading="uploading"
                    :disabled="item.urls.length >= MAX_GALLERY"
                    @click="pickMedia(item, 'image/*', true)"
                  >
                    添加图片
                  </Button>
                </template>

                <template v-else>
                  <div class="pano-editor-field">
                    <label>{{ item.type === 'link' ? '链接地址' : '媒体地址' }}</label>
                    <Input
                      v-model:value="item.url"
                      size="small"
                      :placeholder="item.type === 'link' ? 'https://…' : '留空则点「上传」'"
                    />
                  </div>
                  <Button
                    v-if="item.type !== 'link'"
                    size="small"
                    :loading="uploading"
                    @click="pickMedia(item, item.type === 'video' ? 'video/*' : 'image/*')"
                  >
                    上传{{ item.type === 'video' ? '视频' : '图片' }}
                  </Button>
                </template>

                <div class="pano-editor-row">
                  <div class="pano-editor-field">
                    <label>yaw</label>
                    <InputNumber v-model:value="item.yaw" size="small" :step="1" />
                  </div>
                  <div class="pano-editor-field">
                    <label>pitch</label>
                    <InputNumber v-model:value="item.pitch" size="small" :step="1" />
                  </div>
                  <div class="pano-editor-field">
                    <label>大小</label>
                    <InputNumber v-model:value="item.size" size="small" :min="12" :max="128" />
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </section>

        <footer class="pano-editor-foot">
          <Button @click="emit('update:open', false)">取消</Button>
          <Button type="primary" :loading="saving" @click="save">保存</Button>
        </footer>
      </aside>
    </div>
  </Drawer>
</template>

<style scoped>
.pano-editor {
  display: flex;
  height: 100%;
  min-height: 0;
  background: #f5f6f8;
}

.pano-editor-stage {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  background: #0b0d10;
}

.pano-editor-viewer {
  width: 100%;
  height: 100%;
}

.pano-editor-toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: rgb(18 22 28 / 88%);
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 10px;
  backdrop-filter: blur(10px);
}

.pano-editor-hint {
  font-size: 12px;
  color: rgb(255 255 255 / 72%);
}

/* 跳转图标选择器：一排小格子，动态图标静态预览第一帧（雪碧图顶部） */
.pano-icon-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pano-icon-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 2px;
  cursor: pointer;
  background: rgb(255 255 255 / 6%);
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 6px;
}

.pano-icon-cell:hover {
  background: rgb(255 255 255 / 14%);
}

.pano-icon-cell.active {
  background: rgb(47 124 246 / 30%);
  border-color: #2f7cf6;
}

.pano-icon-dot {
  width: 14px;
  height: 14px;
  background: #2f7cf6;
  border: 2px solid #fff;
  border-radius: 50%;
}

/* 动态雪碧图：容器 28px → 图高 28×25=700px，只露出顶部第一帧 */
.pano-icon-thumb {
  display: block;
  width: 28px;
  height: 28px;
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}

.pano-icon-thumb.animated {
  background-position: 0 0;
  background-size: 28px 700px;
}

.pano-editor-loading {
  position: absolute;
  inset: 0;
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: rgb(255 255 255 / 72%);
  pointer-events: none;
  background: rgb(11 13 16 / 55%);
}

.pano-editor-panel {
  display: flex;
  flex: 0 0 360px;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  overflow: hidden;
  background: #fff;
  border-left: 1px solid rgb(0 0 0 / 6%);
}

.pano-editor-block {
  padding: 12px;
  margin-bottom: 12px;
  background: #fafbfc;
  border: 1px solid rgb(0 0 0 / 6%);
  border-radius: 8px;
}

.pano-editor-block-grow {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.pano-editor-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: rgb(0 0 0 / 85%);
}

.pano-editor-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.pano-editor-field > label {
  flex: 0 0 84px;
  font-size: 12px;
  color: rgb(0 0 0 / 55%);
}

.pano-editor-field > :deep(.ant-input-number),
.pano-editor-field > :deep(.ant-input-affix-wrapper),
.pano-editor-field > :deep(.ant-input) {
  flex: 1;
  min-width: 0;
}

/* 图集列表：占满属性面板宽度，每行「缩略图 + 序号 + 上移/下移/移除」 */
.pano-gallery-list {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pano-gallery-list > li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px solid rgb(0 0 0 / 6%);
}

.pano-gallery-thumb {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  object-fit: cover;
  border-radius: 4px;
  background: rgb(0 0 0 / 4%);
}

.pano-gallery-index {
  flex: 0 0 18px;
  font-size: 12px;
  color: rgb(0 0 0 / 45%);
  text-align: center;
}

.pano-gallery-actions {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}

.pano-editor-hint {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  color: rgb(0 0 0 / 45%);
}

/* 浅色面板下的图标选择器 */
.pano-icon-cell {
  background: rgb(0 0 0 / 4%);
  border-color: rgb(0 0 0 / 15%);
}

.pano-icon-cell:hover {
  background: rgb(0 0 0 / 8%);
}

.pano-icon-cell.active {
  background: rgb(47 124 246 / 15%);
  border-color: #2f7cf6;
}

.pano-editor-row {
  display: flex;
  gap: 6px;
}

.pano-editor-row .pano-editor-field {
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
}

.pano-editor-row .pano-editor-field > label {
  flex: none;
}

.pano-editor-meta {
  display: grid;
  gap: 2px;
  margin: 12px 0 0;
  font-size: 12px;
}

.pano-editor-meta > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.pano-editor-meta dt {
  color: rgb(0 0 0 / 45%);
}

.pano-editor-meta dd {
  margin: 0;
  color: rgb(0 0 0 / 75%);
}

.pano-editor-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: #cf1322;
}

.pano-editor-empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: rgb(0 0 0 / 45%);
}

.pano-editor-list {
  flex: 1;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  list-style: none;
}

.pano-editor-item {
  margin-bottom: 6px;
  background: #fff;
  border: 1px solid rgb(0 0 0 / 8%);
  border-radius: 6px;
}

.pano-editor-item.is-selected {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgb(22 119 255 / 12%);
}

.pano-editor-item-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  cursor: pointer;
}

.pano-editor-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 11px;
  color: #fff;
  background: rgb(0 0 0 / 45%);
  border-radius: 50%;
}

.pano-editor-item-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pano-editor-item-coord {
  font-size: 11px;
  color: rgb(0 0 0 / 45%);
  font-variant-numeric: tabular-nums;
}

.pano-editor-item-body {
  padding: 8px;
  border-top: 1px dashed rgb(0 0 0 / 8%);
}

.pano-editor-foot {
  display: flex;
  flex: none;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 12px;
  border-top: 1px solid rgb(0 0 0 / 6%);
}
</style>

<style>
/* 球面上的可拖拽圆点（渲染在 PSV 的 marker 容器里，不能 scoped）。 */
.pano-edit-marker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  cursor: grab;
  touch-action: none;
  background: rgb(22 119 255 / 92%);
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgb(0 0 0 / 45%);
  user-select: none;
}

.pano-edit-marker:active {
  cursor: grabbing;
}

.pano-edit-marker[data-type='scene'] {
  background: rgb(22 119 255 / 92%);
}

.pano-edit-marker[data-type='info'] {
  background: rgb(35 178 137 / 92%);
}

.pano-edit-marker[data-type='link'] {
  background: rgb(240 154 55 / 94%);
}

.pano-edit-marker[data-type='video'],
.pano-edit-marker[data-type='image'] {
  background: rgb(168 92 232 / 94%);
}

/* className 落在 marker 的包裹元素上，圆点本身是它的子元素 */
.pano-edit-marker-selected .pano-edit-marker {
  box-shadow: 0 0 0 4px rgb(255 255 255 / 55%), 0 2px 10px rgb(0 0 0 / 55%);
  transform: scale(1.12);
}
</style>
