<script setup>
/**
 * 员工定位跟踪（P5-005/006）：
 * 实时分布（location.realtime）+ 历史轨迹回放/导出（location.history）。
 * 底图：EPSG:3857 Web Mercator，支持底图切换（中国卫星/中国矢量/全球卫星/全球矢量）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';

import { Button, DatePicker, Empty, message, Radio, Select, Tag } from 'antdv-next';
import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import Map from 'ol/Map.js';
import { fromLonLat, get } from 'ol/proj.js';
import { XYZ } from 'ol/source.js';
import VectorSource from 'ol/source/Vector.js';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style.js';
import View from 'ol/View.js';

import Resource from '#/api/resource';
import { useAppStore } from '#/store';

import 'ol/ol.css';

const { hasAccessByCodes } = useAccess();
const appStore = useAppStore();

const canRealtime = computed(() => hasAccessByCodes(['location.realtime']));
const canHistory = computed(() => hasAccessByCodes(['location.history']));

// 项目：跟随全局项目
const projectId = computed(() => appStore.defaultProject?.id || undefined);
const projectLabel = computed(() => appStore.defaultProject?.name || '所有项目');

// 成员选项
const memberOptions = ref([]);
async function loadMembers() {
  try {
    const { data } = await new Resource('project-users').list({
      per_page: 'all',
      project_id: projectId.value,
    });
    memberOptions.value = (data || []).map((m) => ({
      value: m.user_id,
      label: m.user?.name || `#${m.user_id}`,
    }));
  } catch (error) {
    memberOptions.value = [];
  }
}

// 模式：live 实时分布 / history 轨迹回放
const mode = ref('live');
const selectedMember = ref(undefined);
const trackDate = ref(null);

// ── 地图 ─────────────────────────────────────────────
// 统一使用 Web Mercator（EPSG:3857）：天地图/OSM 均可用，支持国际项目；
// 点坐标一律 fromLonLat([lng, lat]) 转换。
const mapEl = ref(null);
let map = null;
let pointSource = new VectorSource();
let trackSource = new VectorSource();
let pointLayer = null;
let trackLayer = null;
let baseLayer = null;

// 底图：区域（cn 中国 / world 全球）× 类型（sat 卫星 / vec 矢量）
// 中国用天地图（国内影像完整）；全球用 Esri 卫星影像 / OpenStreetMap 矢量（覆盖全球，支持国际项目）
const BASE_MAPS = {
  'cn-sat': { label: '卫星·中国', layers: ['img', 'cia'] },
  'cn-vec': { label: '矢量·中国', layers: ['vec', 'cva'] },
  'world-sat': { label: '卫星·全球', layers: ['esri'] },
  'world-vec': { label: '矢量·全球', layers: ['osm'] },
};
const baseMap = ref('cn-sat');

function tiandiLayer(type) {
  const key = import.meta.env.VITE_TIANDI_KEY;
  return new TileLayer({
    source: new XYZ({
      url: `https://t{0-7}.tianditu.gov.cn/DataServer?T=${type}_w&tk=${key}&x={x}&y={y}&l={z}`,
      projection: get('EPSG:3857'),
    }),
  });
}

function osmLayer() {
  return new TileLayer({
    source: new XYZ({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      projection: get('EPSG:3857'),
      crossOrigin: 'anonymous',
    }),
  });
}

function esriLayer() {
  return new TileLayer({
    source: new XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      projection: get('EPSG:3857'),
      crossOrigin: 'anonymous',
    }),
  });
}

function buildBaseLayer(base) {
  const keys = BASE_MAPS[base]?.layers || ['img', 'cia'];
  return keys.map((k) => {
    if (k === 'osm') return osmLayer();
    if (k === 'esri') return esriLayer();
    return tiandiLayer(k);
  });
}

function switchBaseLayer(base) {
  if (!map) return;
  baseLayer?.forEach((l) => map.removeLayer(l));
  baseLayer = buildBaseLayer(base);
  baseLayer.forEach((l) => map.addLayer(l));
}

function onBaseMapChange(v) {
  baseMap.value = v;
  switchBaseLayer(v);
}

// 项目经纬度中心：优先当前项目 address
const defaultCenter = ref([113.5, 34.5]);
let centered = false;

async function loadProjectCenter() {
  if (!projectId.value || !map) return;
  try {
    const res = await new Resource('projects').get(projectId.value);
    const addr = res?.data?.address || res?.address;
    const lat = Number(addr?.latitude);
    const lng = Number(addr?.longitude);
    if (lat && lng) {
      const center = fromLonLat([lng, lat]);
      defaultCenter.value = [lng, lat];
      map.getView().setCenter(center);
      map.getView().setZoom(14);
      centered = true;
    }
  } catch (error) {
    console.error('加载项目经纬度失败:', error);
  }
}

function initMap() {
  if (!mapEl.value || map) return;
  map = new Map({
    target: mapEl.value,
    layers: [],
    view: new View({
      center: fromLonLat(defaultCenter.value),
      zoom: 12,
      maxZoom: 18,
      minZoom: 2,
    }),
  });

  switchBaseLayer(baseMap.value);

  pointLayer = new VectorLayer({ source: pointSource });
  trackLayer = new VectorLayer({ source: trackSource });
  map.addLayer(trackLayer);
  map.addLayer(pointLayer);

  loadProjectCenter();
}

// ── 实时分布 ─────────────────────────────────────────
const liveData = ref([]);
const liveLoading = ref(false);
let liveTimer = null;

async function loadLive() {
  if (!canRealtime.value) return;
  liveLoading.value = true;
  try {
    const { data } = await new Resource('location').get('live', {
      project_id: projectId.value,
    });
    liveData.value = Array.isArray(data) ? data : [];
    renderLive();
  } catch (error) {
    console.error(error);
  } finally {
    liveLoading.value = false;
  }
}

function renderLive() {
  pointSource.clear();
  if (!map || !liveData.value.length) return;

  const features = liveData.value.map((p) => {
    const online = Number(p.online) === 1;
    const feature = new Feature({
      geometry: new Point(fromLonLat([Number(p.lng), Number(p.lat)])),
      ...p,
    });
    feature.setStyle(
      new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: online ? '#52c41a' : '#d9d9d9' }),
          stroke: new Stroke({ color: '#fff', width: 2 }),
        }),
        text: new Text({
          text: p.user_name || '',
          offsetY: -14,
          fill: new Fill({ color: '#333' }),
          font: '12px sans-serif',
        }),
      }),
    );
    return feature;
  });
  pointSource.addFeatures(features);

  const extent = pointSource.getExtent();
  if (extent && liveData.value.length) {
    map.getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 16, duration: 500 });
  }
}

// ── 历史轨迹回放 ─────────────────────────────────────
const trackPoints = ref([]);
const trackLoading = ref(false);
const playing = ref(false);
const playSpeed = ref(1);
const playIndex = ref(0);
let playTimer = null;
let playMarkerFeature = null;

async function loadHistory() {
  if (!canHistory.value || !selectedMember.value || !trackDate.value) {
    message.warning('请选择成员与日期');
    return;
  }
  trackLoading.value = true;
  pausePlay();
  try {
    const { data } = await new Resource('location').get('history', {
      user_id: selectedMember.value,
      project_id: projectId.value,
      date: trackDate.value,
    });
    trackPoints.value = Array.isArray(data) ? data : [];
    if (!trackPoints.value.length) {
      message.info('该日无轨迹数据');
      pointSource.clear();
      trackSource.clear();
      return;
    }
    renderTrack();
    playIndex.value = 0;
  } catch (error) {
    console.error(error);
  } finally {
    trackLoading.value = false;
  }
}

function renderTrack() {
  pointSource.clear();
  trackSource.clear();
  if (!map || !trackPoints.value.length) return;

  const coords = trackPoints.value.map((p) =>
    fromLonLat([Number(p.lng), Number(p.lat)]),
  );
  const line = new Feature({
    geometry: new LineString(coords),
  });
  line.setStyle(
    new Style({
      stroke: new Stroke({ color: '#1677ff', width: 3 }),
    }),
  );
  trackSource.addFeature(line);

  // 起点
  const start = new Feature({
    geometry: new Point(coords[0]),
  });
  start.setStyle(
    new Style({
      image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color: '#52c41a' }),
        stroke: new Stroke({ color: '#fff', width: 2 }),
      }),
    }),
  );
  pointSource.addFeature(start);

  // 回放 marker（当前点）
  playMarkerFeature = new Feature({ geometry: new Point(coords[0]) });
  updatePlayMarker();

  const extent = trackSource.getExtent();
  if (extent) {
    map.getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 16, duration: 400 });
  }
}

function play() {
  if (playing.value || !trackPoints.value.length) return;
  playing.value = true;
  const step = () => {
    if (playIndex.value >= trackPoints.value.length - 1) {
      pausePlay();
      return;
    }
    playIndex.value += 1;
    updatePlayMarker();
  };
  playTimer = setInterval(step, Math.round(1000 / playSpeed.value));
}

function pausePlay() {
  playing.value = false;
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}

function updatePlayMarker() {
  const p = trackPoints.value[playIndex.value];
  if (!p || !playMarkerFeature || !map) return;
  playMarkerFeature.setGeometry(new Point(fromLonLat([Number(p.lng), Number(p.lat)])));
  playMarkerFeature.setStyle(
    new Style({
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: '#f5222d' }),
        stroke: new Stroke({ color: '#fff', width: 2 }),
      }),
      text: new Text({
        text: `[${playIndex.value + 1}/${trackPoints.value.length}] ${p.collected_at || ''}`,
        offsetY: -18,
        fill: new Fill({ color: '#f5222d' }),
        font: '12px sans-serif',
      }),
    }),
  );
  map.getView().setCenter(fromLonLat([Number(p.lng), Number(p.lat)]));
}

function onSpeedChange(v) {
  playSpeed.value = v;
  if (playing.value) {
    pausePlay();
    play();
  }
}

async function exportCsv() {
  if (!canHistory.value || !selectedMember.value || !trackDate.value) {
    message.warning('请选择成员与日期');
    return;
  }
  const qs = `user_id=${selectedMember.value}&project_id=${projectId.value ?? ''}&date=${trackDate.value}`;
  window.open(`/api/v1/location/export?${qs}`, '_blank');
}

// ── 模式切换 ─────────────────────────────────────────
function onModeChange(v) {
  mode.value = v;
  pausePlay();
  trackSource.clear();
  pointSource.clear();
  if (v === 'live') {
    loadLive();
  }
}

// ── 生命周期 ─────────────────────────────────────────
onMounted(() => {
  initMap();
  loadMembers();
  if (canRealtime.value) {
    loadLive();
    liveTimer = setInterval(() => {
      if (mode.value === 'live') loadLive();
    }, 30000);
  }
});

onBeforeUnmount(() => {
  pausePlay();
  if (liveTimer) clearInterval(liveTimer);
  map?.setTarget(undefined);
});
</script>

<template>
  <div class="flex h-[calc(100vh-120px)] flex-col p-4">
    <div
      class="mb-4 flex flex-shrink-0 flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-sm"
    >
      <Radio.Group
        :value="mode"
        option-type="button"
        button-style="solid"
        :options="[
          { label: '实时分布', value: 'live' },
          { label: '轨迹回放', value: 'history' },
        ]"
        @change="(e) => onModeChange(e.target.value)"
      />
      <span class="text-sm text-gray-500">项目：{{ projectLabel }}</span>

      <Select
        v-model:value="baseMap"
        class="w-40"
        :options="Object.entries(BASE_MAPS).map(([value, m]) => ({ value, label: m.label }))"
        @change="onBaseMapChange"
      />

      <template v-if="mode === 'live'">
        <Tag color="green">实时定位（近30分钟）</Tag>
        <Button size="small" :loading="liveLoading" @click="loadLive">刷新</Button>
      </template>

      <template v-else>
        <Select
          v-model:value="selectedMember"
          :options="memberOptions"
          placeholder="选择成员"
          show-search
          option-filter-prop="label"
          class="w-48"
        />
        <DatePicker
          v-model:value="trackDate"
          value-format="YYYY-MM-DD"
          placeholder="选择日期"
          class="w-40"
        />
        <Button
          type="primary"
          size="small"
          :loading="trackLoading"
          @click="loadHistory"
        >
          查询轨迹
        </Button>
        <Button size="small" @click="exportCsv">导出 CSV</Button>
      </template>
    </div>

    <div v-if="mode === 'history' && !canHistory" class="mb-3">
      <Empty description="无查看历史轨迹权限（需 location.history）" />
    </div>
    <div v-else-if="mode === 'live' && !canRealtime" class="mb-3">
      <Empty description="无查看实时定位权限（需 location.realtime）" />
    </div>

    <div class="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-white">
      <div ref="mapEl" class="h-full w-full"></div>

      <!-- 实时图例（右上，避免遮挡左上缩放控件） -->
      <div
        v-if="mode === 'live'"
        class="absolute right-3 top-3 z-10 rounded bg-white/90 p-2 text-xs shadow"
      >
        <div class="flex items-center gap-1">
          <span class="h-2.5 w-2.5 rounded-full bg-green-500"></span> 在线（10分钟内）
        </div>
        <div class="mt-1 flex items-center gap-1">
          <span class="h-2.5 w-2.5 rounded-full bg-gray-300"></span> 离线
        </div>
      </div>

      <!-- 回放控制条 -->
      <div
        v-if="mode === 'history' && trackPoints.length"
        class="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded bg-white/95 px-4 py-2 shadow"
      >
        <Button
          size="small"
          type="primary"
          @click="playing ? pausePlay() : play()"
        >
          {{ playing ? '暂停' : '播放' }}
        </Button>
        <Radio.Group
          :value="playSpeed"
          size="small"
          :options="[
            { label: '1x', value: 1 },
            { label: '2x', value: 2 },
            { label: '4x', value: 4 },
          ]"
          option-type="button"
          @change="(e) => onSpeedChange(e.target.value)"
        />
        <span class="text-xs text-gray-500">
          {{ playIndex + 1 }}/{{ trackPoints.length }} 点
        </span>
      </div>
    </div>

    <!-- 轨迹统计信息 -->
    <div
      v-if="mode === 'history' && trackPoints.length"
      class="mt-3 rounded-lg bg-white p-3 text-sm shadow-sm"
    >
      共 {{ trackPoints.length }} 个轨迹点，起点
      <Tag color="green">{{ trackPoints[0]?.collected_at || '-' }}</Tag>
      终点
      <Tag color="blue">
        {{ trackPoints[trackPoints.length - 1]?.collected_at || '-' }}
      </Tag>
      <span class="ml-2 text-gray-400">
        命中风险点 {{ trackPoints.filter((p) => p.risk_level > 0).length }} 个
      </span>
    </div>
  </div>
</template>
