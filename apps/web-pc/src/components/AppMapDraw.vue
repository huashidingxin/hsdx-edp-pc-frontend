<script setup>
/**
 * AppMapDraw —— 地理围栏绘制组件（OpenLayers + 天地图影像底图）
 *
 * 对齐 web-admin milepost/list.vue 的地图绘制逻辑：
 * - 天地图影像底图（EPSG:4326 经纬度投影）+ 注记
 * - 多边形绘制交互（Draw Polygon），drawend 将 coordinates 写入 modelValue
 * - 已有 boundary 回显（loadFence：定位中心 + 画 polygon）
 * - 重新绘制（清空矢量 + 重启绘制交互）
 * - 提供 resetDrawing/loadFence 方法供外部控制
 *
 * modelValue 结构：boundary = coordinates（EPSG:4326，多环多边形）
 */
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import { Button } from 'antdv-next';
import Feature from 'ol/Feature.js';
import Polygon from 'ol/geom/Polygon.js';
import Draw from 'ol/interaction/Draw.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import Map from 'ol/Map.js';
import { get } from 'ol/proj.js';
import { XYZ } from 'ol/source.js';
import VectorSource from 'ol/source/Vector.js';
import { Fill, Stroke, Style } from 'ol/style.js';
import View from 'ol/View.js';

import 'ol/ol.css';

const props = defineProps({
  // 多边形坐标（EPSG:4326）
  modelValue: {
    type: Array,
    default: () => [],
  },
  // 是否只读（禁用绘制交互）
  readonly: {
    type: Boolean,
    default: false,
  },
  // 初始中心（[lng, lat]）
  center: {
    type: Array,
    default: () => [116.28, 39.48],
  },
});

const emit = defineEmits(['update:model-value']);

const mapEl = ref(null);
let map = null;
let draw = null;
const vectorSource = reactive(new VectorSource());

const vectorLayer = new VectorLayer({
  source: vectorSource,
  style: new Style({
    fill: new Fill({ color: 'rgba(255, 255, 0, 0.5)' }),
    stroke: new Stroke({ color: '#ffcc33', width: 2 }),
  }),
});

const hasDrawing = ref(false);

function tiandiLayer(subdomains, type, matrixSet) {
  const key = import.meta.env.VITE_TIANDI_KEY;
  return new TileLayer({
    source: new XYZ({
      url: `https://t{0-7}.tianditu.gov.cn/DataServer?T=${type}_${matrixSet}&tk=${key}&x={x}&y={y}&l={z}`,
      projection: get('EPSG:4326'),
    }),
  });
}

function initMap() {
  const projection = get('EPSG:4326');
  map = new Map({
    target: mapEl.value,
    layers: [
      tiandiLayer([0, 1, 2, 3, 4, 5, 6, 7], 'img', 'c'),
      tiandiLayer([0, 1, 2, 3, 4, 5, 6, 7], 'cia', 'c'),
    ],
    view: new View({
      center: props.center,
      projection,
      zoom: 12,
      maxZoom: 18,
      minZoom: 1,
    }),
  });
  addInteraction();
}

function addInteraction() {
  map.addLayer(vectorLayer);
  draw = new Draw({
    source: vectorSource,
    type: 'Polygon',
  });
  map.addInteraction(draw);
  draw.on('drawend', (event) => {
    const coordinates = event.feature.getGeometry().getCoordinates();
    emit('update:modelValue', coordinates);
    hasDrawing.value = true;
    map.removeInteraction(draw);
    draw.setActive(false);
  });
}

function loadFence(coordinates) {
  if (!map || !coordinates?.length) return;
  const polygon = new Polygon(coordinates);
  const interiorPoint = polygon.getInteriorPoint();
  map.getView().setCenter(interiorPoint.getCoordinates());
  vectorSource.clear();
  vectorSource.addFeature(new Feature({ geometry: polygon }));
  draw?.setActive(false);
  hasDrawing.value = true;
}

function resetDrawing() {
  vectorSource.clear();
  hasDrawing.value = false;
  if (map) {
    if (draw) map.removeInteraction(draw);
    draw = new Draw({ source: vectorSource, type: 'Polygon' });
    map.addInteraction(draw);
    draw.on('drawend', (event) => {
      const coordinates = event.feature.getGeometry().getCoordinates();
      emit('update:modelValue', coordinates);
      hasDrawing.value = true;
      map.removeInteraction(draw);
      draw.setActive(false);
    });
  }
}

function setCenter(center) {
  if (map && center?.length === 2) {
    map.getView().setCenter([Number(center[0]), Number(center[1])]);
  }
}

// 外部回显 boundary（编辑回显）
watch(
  () => props.modelValue,
  (v) => {
    if (v?.length) loadFence(v);
  },
  { deep: true },
);

// 外部定位中心
watch(
  () => props.center,
  (c) => setCenter(c),
  { deep: true },
);

onMounted(() => {
  initMap();
  if (props.modelValue?.length) loadFence(props.modelValue);
});

onBeforeUnmount(() => {
  map?.setTarget(undefined);
  map = null;
});

defineExpose({ resetDrawing, loadFence, setCenter });
</script>

<template>
  <div>
    <div class="mb-2 flex items-center justify-between">
      <div class="text-sm text-gray-500">
        在地图上绘制范围多边形（可拖动/缩放地图）
      </div>
      <Button v-if="!readonly && hasDrawing" size="small" @click="resetDrawing">
        重新绘制
      </Button>
    </div>
    <div ref="mapEl" class="app-map-draw"></div>
  </div>
</template>

<style scoped>
.app-map-draw {
  position: relative;
  width: 100%;
  height: 60vh;
  background: #f0f2f5;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
}
</style>
