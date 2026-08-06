<script setup>
/**
 * AppChooseLocation —— 地图选点组件（天地图影像底图 + 地址搜索 + 逆地理编码）
 *
 * 对齐 web-admin AppChooseLoation.vue：
 * - 点击地图选点 → 逆地理编码 → modelValue 返回完整地址对象（province/city/area/town/detail + *_id + longitude/latitude）
 * - 地址搜索（天地图 search 接口）→ 选中定位
 * - returnAddress=false 时仅返回 { longitude, latitude }
 * - viewFormat 自定义显示格式（默认 省市区+地址 / 经纬度）
 */
import { computed, nextTick, ref, watch } from 'vue';

import { Button, Input, Modal, Spin } from 'antdv-next';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import Map from 'ol/Map.js';
import { get } from 'ol/proj.js';
import { XYZ } from 'ol/source.js';
import VectorSource from 'ol/source/Vector.js';
import { Icon, Style } from 'ol/style.js';
import View from 'ol/View.js';

import 'ol/ol.css';

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({}),
  },
  label: {
    type: String,
    default: '位置',
  },
  placeholder: {
    type: String,
    default: '请选择位置',
  },
  layerType: {
    type: String,
    default: 'image',
  },
  viewFormat: {
    type: Function,
    default: (e) =>
      e?.province
        ? `${e.province}${e.city}${e.area}${e.town || ''}${e.detail || e.address || ''}`
        : e?.longitude
          ? `${e.longitude},${e.latitude}`
          : '',
  },
  // 选中后是否关闭弹窗
  closeOnChoose: {
    type: Boolean,
    default: false,
  },
  // 是否返回完整地址对象（false 仅经纬度）
  returnAddress: {
    type: Boolean,
    default: true,
  },
  // 只读
  readonly: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue']);

const TIAN_DI_KEY = import.meta.env.VITE_TIANDI_KEY;

const dialog = ref(false);
const editingItem = ref({});
const map = ref(null);
const mapEl = ref(null);
const searchKeyword = ref('');
const searchResults = ref([]);
const searchLoading = ref(false);
const searchAttempted = ref(false);
const tempLocation = ref(null);
const geocoding = ref(false);

const pointLayer = ref(
  new VectorLayer({ source: new VectorSource() }),
);
let feature = null;

const displayText = computed(() =>
  props.viewFormat(editingItem.value),
);

function tiandiLayer(type, matrixSet) {
  return new TileLayer({
    source: new XYZ({
      url: `https://t{0-7}.tianditu.gov.cn/DataServer?T=${type}_${matrixSet}&tk=${TIAN_DI_KEY}&x={x}&y={y}&l={z}`,
      projection: get('EPSG:4326'),
    }),
  });
}

function initMap() {
  const projection = get('EPSG:4326');
  const layerTypeMap = { vector: ['vec', 'cva'], image: ['img', 'cia'], terrain: ['ter', 'cta'] };
  const type = layerTypeMap[props.layerType] || layerTypeMap.image;
  const center = editingItem.value?.longitude
    ? [Number(editingItem.value.longitude), Number(editingItem.value.latitude)]
    : [116.763598, 39.587285];

  map.value = new Map({
    target: mapEl.value,
    layers: [
      tiandiLayer(type[0], 'c'),
      tiandiLayer(type[1], 'c'),
    ],
    view: new View({
      center,
      projection,
      zoom: editingItem.value?.longitude ? 12 : 10,
      maxZoom: 18,
      minZoom: 1,
    }),
  });

  map.value.addLayer(pointLayer.value);
  map.value.on('singleclick', (evt) => {
    pointLayer.value.getSource().clear();
    addPoints(evt.coordinate);
    complete(evt.coordinate);
  });
}

function addPoints(coordinate) {
  feature = new Feature({ geometry: new Point(coordinate) });
  feature.setStyle(
    new Style({
      image: new Icon({
        src: 'https://api.tianditu.gov.cn/img/map/markerA.png',
        scale: 1.2,
      }),
    }),
  );
  pointLayer.value.getSource().addFeature(feature);
  if (map.value && !props.closeOnChoose) {
    map.value.getView().setCenter(coordinate);
    map.value.getView().setZoom(15);
  }
}

// ---- 逆地理编码 ----
function geocoder(coordinates) {
  return new Promise((resolve, reject) => {
    const postStr = JSON.stringify({ lon: coordinates[0], lat: coordinates[1], ver: 1 });
    const url = `https://api.tianditu.gov.cn/geocoder?postStr=${encodeURIComponent(postStr)}&type=geocode&tk=${TIAN_DI_KEY}`;
    fetch(url)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('请求失败'))))
      .then(({ result }) => {
        const comp = result.addressComponent;
        resolve({
          latitude: coordinates[1],
          longitude: coordinates[0],
          province: comp.province,
          province_id: comp.province_code?.substring(3),
          city: comp.city,
          city_id: comp.city_code?.substring(3),
          area: comp.county,
          area_id: comp.county_code?.substring(3),
          town: comp.town,
          town_id: comp.town_code?.substring(3),
          road: comp.road,
          detail: result.formatted_address.replace(comp.province + comp.city + comp.county, ''),
        });
      })
      .catch(reject);
  });
}

async function complete(coordinates) {
  geocoding.value = true;
  try {
    if (props.returnAddress) {
      const data = await geocoder(coordinates);
      editingItem.value = data;
      emit('update:modelValue', data);
    } else {
      editingItem.value = { longitude: coordinates[0], latitude: coordinates[1] };
      emit('update:modelValue', editingItem.value);
    }
    tempLocation.value = null;
    if (props.closeOnChoose) dialog.value = false;
  } catch (e) {
    console.error(e);
  } finally {
    geocoding.value = false;
  }
}

// ---- 地址搜索（天地图 search）----
async function searchAddress() {
  if (!searchKeyword.value.trim()) return;
  searchLoading.value = true;
  searchAttempted.value = true;
  try {
    const postStr = JSON.stringify({
      keyWord: searchKeyword.value.trim(),
      level: 12,
      mapBound: '-180,-90,180,90',
      queryType: 1,
      start: 0,
      count: 10,
    });
    const url = `https://api.tianditu.gov.cn/v2/search?postStr=${encodeURIComponent(postStr)}&type=query&tk=${TIAN_DI_KEY}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`请求失败(${resp.status})`);
    const data = await resp.json();
    if (data.status?.infocode === 1000 && Array.isArray(data.pois)) {
      searchResults.value = data.pois
        .filter((poi) => poi?.lonlat?.includes(','))
        .map((poi) => ({
          name: poi.name,
          address: poi.address,
          lon: poi.lonlat.split(',')[0],
          lat: poi.lonlat.split(',')[1],
        }));
    } else {
      searchResults.value = [];
    }
  } catch (e) {
    console.error('地址搜索失败:', e);
    searchResults.value = [];
  } finally {
    searchLoading.value = false;
  }
}

function selectSearchResult(item) {
  const coordinates = [Number(item.lon), Number(item.lat)];
  pointLayer.value.getSource().clear();
  addPoints(coordinates);
  map.value?.getView().setCenter(coordinates);
  map.value?.getView().setZoom(15);
  tempLocation.value = item;
  searchResults.value = [];
  searchAttempted.value = false;
  complete(coordinates);
}

function clearSearch() {
  searchResults.value = [];
  searchKeyword.value = '';
  searchAttempted.value = false;
}

// ---- modelValue 回显 ----
watch(
  () => props.modelValue,
  (v) => {
    editingItem.value = v || {};
    if (v?.longitude && map.value) {
      pointLayer.value.getSource().clear();
      addPoints([Number(v.longitude), Number(v.latitude)]);
    }
  },
  { immediate: true, deep: true },
);

// 打开弹窗时初始化地图
watch(dialog, (open) => {
  if (open) {
    nextTick(() => {
      if (map.value) {
        map.value.setTarget(mapEl.value);
      } else {
        initMap();
      }
      if (editingItem.value?.longitude) {
        pointLayer.value.getSource().clear();
        addPoints([Number(editingItem.value.longitude), Number(editingItem.value.latitude)]);
      }
    });
  }
});

function openDialog() {
  if (props.readonly) return;
  dialog.value = true;
}

defineExpose({ openDialog });
</script>

<template>
  <div>
    <Input
      :value="displayText"
      :placeholder="placeholder"
      readonly
      :disabled="readonly"
      @click="openDialog"
    />
    <Modal
      :open="dialog"
      :title="`选择位置 - ${label}`"
      :footer="null"
      width="75vw"
      @cancel="dialog = false"
    >
      <div class="relative" style="height: 500px">
        <!-- 搜索栏 -->
        <div class="absolute left-2 right-2 top-2 z-10 max-w-[400px]">
          <Input
            v-model:value="searchKeyword"
            placeholder="输入地址或关键词搜索"
            allow-clear
            @keyup.enter="searchAddress"
            @clear="clearSearch"
          >
            <template #suffix>
              <Button
                type="primary"
                size="small"
                :disabled="!searchKeyword.trim()"
                :loading="searchLoading"
                @click="searchAddress"
              >
                搜索
              </Button>
            </template>
          </Input>
          <!-- 搜索结果 -->
          <div
            v-if="searchResults.length"
            class="mt-2 max-h-[250px] overflow-y-auto rounded border border-gray-200 bg-white shadow"
          >
            <div class="px-3 pb-1 pt-2 text-xs text-gray-400">找到 {{ searchResults.length }} 个结果</div>
            <div
              v-for="(item, index) in searchResults"
              :key="index"
              class="cursor-pointer px-3 py-2 hover:bg-gray-50"
              @click="selectSearchResult(item)"
            >
              <div class="text-sm font-medium">{{ item.name }}</div>
              <div class="text-xs text-gray-400">{{ item.address }}</div>
            </div>
          </div>
          <div
            v-else-if="searchKeyword && !searchLoading && searchAttempted"
            class="mt-2 rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-400"
          >
            未找到相关结果，请尝试其他关键词
          </div>
        </div>

        <!-- 地图 -->
        <div ref="mapEl" class="h-full w-full"></div>

        <!-- 逆地理编码中 -->
        <div
          v-if="geocoding"
          class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-white/90 px-4 py-2 shadow"
        >
          <Spin size="small" /> <span class="ml-2 text-sm text-gray-500">获取位置信息中...</span>
        </div>
      </div>
    </Modal>
  </div>
</template>
