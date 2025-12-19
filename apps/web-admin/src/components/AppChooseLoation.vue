<template>
  <div>
    <v-text-field 
      :label="label" 
      :model-value="viewFormat(editingItem)" 
      :placeholder="placeholder" 
      readonly
      @click="openLocationPicker"
    >
      <template v-if="returnAddress && editingItem && editingItem.longitude" #details>
        <div class="text-caption text-medium-emphasis">
          {{editingItem.longitude}}, {{editingItem.latitude}}
        </div>
      </template>
      <template #append-inner>
        <v-btn
          icon="mdi-map-marker"
          variant="text"
          size="small"
          @click="openLocationPicker"
        />
      </template>
    </v-text-field>

    <v-dialog v-model="menu" max-width="90vw" width="900">
      <v-card>
        <v-card-title class="d-flex align-center pa-4">
          <v-icon class="mr-2">mdi-map-marker</v-icon>
          选择位置
          <v-spacer />
          <v-btn variant="text" size="small" @click="locateCurrentPosition">
            <v-icon>mdi-crosshairs-gps</v-icon>
            <span class="ml-1">定位</span>
          </v-btn>
          <v-btn icon="mdi-close" variant="text" @click="menu = false" />
        </v-card-title>
        
        <v-card-text class="pa-0">
          <!-- 搜索栏 -->
          <div class="pa-4 border-b">
            <v-text-field
              v-model="searchKeyword"
              label="搜索地址"
              placeholder="输入地址或关键词搜索"
              prepend-inner-icon="mdi-magnify"
              clearable
              @keyup.enter="searchAddress"
              @click:clear="clearSearch"
              :loading="searchLoading"
              hide-details
            >
              <template #append>
                <v-btn 
                  variant="elevated" 
                  color="primary"
                  :disabled="!searchKeyword.trim()"
                  @click="searchAddress"
                  size="small"
                >
                  搜索
                </v-btn>
              </template>
            </v-text-field>
            
            <!-- 搜索结果 -->
            <div v-if="searchResults.length > 0" class="mt-3">
              <v-list density="compact" max-height="200" class="overflow-y-auto">
                <v-list-item
                  v-for="(item, index) in searchResults"
                  :key="index"
                  @click="selectSearchResult(item)"
                  class="cursor-pointer"
                >
                  <v-list-item-title>{{ item.name }}</v-list-item-title>
                  <v-list-item-subtitle>{{ item.address }}</v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </div>
            <div v-else-if="searchKeyword && !searchLoading && searchAttempted" class="mt-3">
              <v-list density="compact" max-height="200" class="overflow-y-auto">
                <v-list-item>
                  <v-list-item-title>未找到相关结果</v-list-item-title>
                </v-list-item>
              </v-list>
            </div>
          </div>
          
          <!-- 地图容器 -->
          <div class="map-wrapper">
            <div id="map-container"></div>
            <div id="popup-box" class="popup-box">
              <button id="close-button" class="close-button">&times;</button>
              <div id="popup-content" class="popup-content"></div>
            </div>
          </div>
        </v-card-text>
        
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="outlined" @click="resetLocation">重置</v-btn>
          <v-btn variant="elevated" color="primary" @click="confirmLocation">
            确认选择
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
<script setup>
import {ref, onMounted,watch,nextTick} from 'vue'
import {Map, View, Feature} from 'ol'
import {Tile as TileLayer} from 'ol/layer'
import {get} from 'ol/proj';
import {getWidth, getTopLeft} from 'ol/extent'
import {WMTS} from 'ol/source'
import WMTSTileGrid from 'ol/tilegrid/WMTS'
import {defaults as defaultControls} from 'ol/control';

import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import {Point} from "ol/geom";
import {Icon, Style} from "ol/style";
import Overlay from 'ol/Overlay';
import {XYZ} from "ol/source.js";

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({})
  },
  label:{
    default:'位置',
    type:String
  },
  placeholder:{
    default:'请选择位置',
    type:String
  },
  layerType:{
    default:'image',
    type:String
  },
  viewFormat:{
    type:Function,
    default:(e)=>{
      return e?.province ? (e && e.province ? e.province+e.city+e.area+(e.town || '')+e.address : '') :  (e.longitude ? e.longitude+','+e.latitude : '')
    }
  },
  closeOnChoose:{
    type:Boolean,
    default:false
  },
  returnAddress:{
    type:Boolean,
    default:true
  }
})

const emit = defineEmits(['update:model-value'])

const projection = get("EPSG:4326");
const projectionExtent = projection.getExtent();
const size = getWidth(projectionExtent) / 256;
const resolutions = [];
for (let z = 0; z < 19; ++z) {
  resolutions[z] = size / Math.pow(2, z);
}
const TIAN_DI_KEY = import.meta.env.VITE_TIANDI_KEY;

const map = ref(null)

const pointLayer = ref(new VectorLayer({
  source: new VectorSource(),
}))

const feature = ref(null)


const menu = ref(false)
const editingItem = ref({})
const searchKeyword = ref('')
const searchResults = ref([])
const searchLoading = ref(false)
const searchAttempted = ref(false)
const tempLocation = ref(null)

watch(()=>props.modelValue,(newVal)=>{
  editingItem.value = newVal
  if(newVal && newVal.longitude && newVal.latitude){
    addPoints([parseFloat(newVal.longitude), parseFloat(newVal.latitude)]);
  }
},{immediate:true,deep:true})

watch(menu,(newVal)=>{
  if(newVal){
    nextTick(()=>{
      initMap()
    })
  } else {
    // 关闭时清空搜索结果
    searchResults.value = []
    searchKeyword.value = ''
  }
})

onMounted(() => {
  //initMap() // 加载矢量底图
})

// 打开位置选择器
function openLocationPicker() {
  menu.value = true
}

// 自动定位到当前位置
function locateCurrentPosition() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(position => {
      const coords = [position.coords.longitude, position.coords.latitude];
      addPoints(coords);
      if (map.value) {
        map.value.getView().setCenter(coords);
        map.value.getView().setZoom(15);
      }
    }, error => {
      console.error('获取当前位置失败:', error);
    });
  }
}

// 搜索地址
async function searchAddress() {
  if (!searchKeyword.value.trim()) return
  
  searchLoading.value = true
  searchAttempted.value = true
  try {
    const results = await geocodeSearch(searchKeyword.value.trim())
    searchResults.value = results
  } catch (error) {
    console.error('搜索失败:', error)
    searchResults.value = []
  } finally {
    searchLoading.value = false
  }
}

// 清空搜索
function clearSearch() {
  searchResults.value = []
  searchKeyword.value = ''
  searchAttempted.value = false
}

// 选择搜索结果
function selectSearchResult(item) {
  const coordinates = [parseFloat(item.lon), parseFloat(item.lat)]
  addPoints(coordinates)
  
  if (map.value) {
    map.value.getView().setCenter(coordinates)
    map.value.getView().setZoom(15)
  }
  
  tempLocation.value = item
  searchResults.value = []
  searchKeyword.value = item.name
  
  // 选中后自动关闭搜索结果列表
  setTimeout(() => {
    searchAttempted.value = false;
  }, 100);
}

// 地理编码搜索
async function geocodeSearch(keyword) {
  return new Promise((resolve, reject) => {
    const params = {
      postStr: JSON.stringify({
        keyWord: keyword,
        level: 12,
        mapBound: "-180,-90,180,90",
        queryType: 1,
        start: 0,
        count: 10
      }),
      type: 'query',
      tk: TIAN_DI_KEY
    }
    
    fetch('https://api.tianditu.gov.cn/v2/search?' + (new URLSearchParams(params)).toString())
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok')
        }
        return response.json()
      })
      .then(data => {
        if (data.status === '0' && data.pois) {
          resolve(data.pois.map(poi => ({
            name: poi.name,
            address: poi.address,
            lon: poi.lon,
            lat: poi.lat,
            addressDetail: poi.address
          })))
        } else {
          resolve([])
        }
      })
      .catch(error => {
        console.error('地理编码搜索失败:', error)
        reject(error)
      })
  })
}

// 重置位置
function resetLocation() {
  pointLayer.value.getSource().clear()
  tempLocation.value = null
  editingItem.value = {}
  searchKeyword.value = ''
  searchResults.value = []
  searchAttempted.value = false
  emit('update:model-value', {})
  
  // 重置地图视图
  if (map.value) {
    map.value.getView().setCenter([116.763598, 39.587285]);
    map.value.getView().setZoom(10);
  }
}

// 确认位置
function confirmLocation() {
  if (tempLocation.value) {
    complete([parseFloat(tempLocation.value.lon), parseFloat(tempLocation.value.lat)])
  } else if (feature.value) {
    const geometry = feature.value.getGeometry()
    const coordinates = geometry.getCoordinates()
    complete(coordinates)
  } else {
    // 如果没有选择位置，使用当前编辑项
    if (editingItem.value && editingItem.value.longitude) {
      emit('update:model-value', editingItem.value)
    }
  }
  
  menu.value = false
  
  // 清除搜索状态
  searchResults.value = []
  searchKeyword.value = ''
  searchAttempted.value = false
}

function initMap() {
  const layerTypeMap = {
    vector: ['vec', 'cva'], // [矢量底图, 矢量注记]
    image: ['img', 'cia'], // [影像底图, 影像注记]
    terrain: ['ter', 'cta'] // [地形晕渲, 地形注记]
  };
  const layerType = 'image'
  const matrixSet = 'c'

  map.value = new Map({
    target: 'map-container',
    layers: [
      // 底图
      // new TileLayer({
      //   source: new WMTS({
      //     url: `http://t{0-6}.tianditu.com/vec_c/wmts?tk=${TIAN_DI_KEY}`,
      //     layer: 'vec', // 矢量底图
      //     matrixSet: 'c', // c: 经纬度投影 w: 球面墨卡托投影
      //     style: "default",
      //     crossOrigin: 'anonymous', // 解决跨域问题 如无该需求可不添加
      //     format: "tiles", //请求的图层格式，这里指定为瓦片格式
      //     wrapX: true, // 允许地图在 X 方向重复（环绕）
      //     tileGrid: new WMTSTileGrid({
      //       origin: getTopLeft(projectionExtent),
      //       resolutions: resolutions,
      //       matrixIds: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18']
      //     })
      //   })
      // }),
      // 标注
      // new TileLayer({
      //   source: new WMTS({
      //     url: `http://t{0-6}.tianditu.com/cva_c/wmts?tk=${TIAN_DI_KEY}`,
      //     layer: 'cva', //矢量注记
      //     matrixSet: 'c',
      //     style: "default",
      //     crossOrigin: 'anonymous',
      //     format: "tiles",
      //     wrapX: true,
      //     tileGrid: new WMTSTileGrid({
      //       origin: getTopLeft(projectionExtent),
      //       resolutions: resolutions,
      //       matrixIds: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18']
      //     })
      //   })
      // })
      new TileLayer({
        source: new XYZ({
          url: `https://t{0-7}.tianditu.gov.cn/DataServer?T=${layerTypeMap[props.layerType][0]}_${matrixSet}&tk=${TIAN_DI_KEY}&x={x}&y={y}&l={z}`,
          projection,
        })
      }),
      new TileLayer({
        source: new XYZ({
          url: `https://t{0-7}.tianditu.gov.cn/DataServer?T=${layerTypeMap[props.layerType][1]}_${matrixSet}&tk=${TIAN_DI_KEY}&x={x}&y={y}&l={z}`,
          projection,
        })
      })
    ],
    view: new View({
      center: editingItem.value?.latitude ? [parseFloat(editingItem.value.longitude),parseFloat(editingItem.value.latitude)] :  [116.763598,39.587285],
      projection: projection,
      zoom: editingItem.value?.latitude ? 12 : 10,
      maxZoom: 17,
      minZoom: 1
    }),
    //加载控件到地图容器中
    controls: defaultControls({
      zoom: false,
      rotate: false,
      attribution: false
    })
  });
  map.value.addLayer(pointLayer.value);
  let popupBox = document.getElementById('popup-box');
  let popupContent = document.getElementById('popup-content');
  let closeButton = document.getElementById('close-button')
  let overlay = new Overlay({
    element: popupBox,
    autoPan: {
      animation: {
        duration: 250,
      },
    },
    positioning: 'bottom-center',
    offset: [0, -20],
  });
  map.value.addOverlay(overlay);
  
  // 初始隐藏弹窗
  popupBox.style.display = 'none';
  // 添加地图点击事件
  map.value.on('singleclick', (evt) => {
    pointLayer.value.getSource().clear()
    addPoints(evt.coordinate)
    let lonLat = evt.coordinate;
    popupContent.innerHTML = `<div>经度：${lonLat[0].toFixed(6)}</div><div>纬度：${lonLat[1].toFixed(6)}</div><div class="mt-2"><small>点击确认按钮保存位置</small></div>`;
    overlay.setPosition(lonLat);

    // 临时存储位置，等待确认
    tempLocation.value = {
      lon: lonLat[0],
      lat: lonLat[1],
      name: '手动选择位置',
      address: `${lonLat[0].toFixed(6)}, ${lonLat[1].toFixed(6)}`
    }
    
    // 显示弹窗
    popupBox.style.display = 'block';
  });
  // 关闭弹出框的事件处理
  closeButton.addEventListener('click', () => {
    overlay.setPosition(undefined); // 关闭弹出框
    popupBox.style.display = 'none';
  });


}

/**
 * 根据经纬度坐标添加自定义图标 支持base64
 */
function addPoints(coordinate) {

  // 创建feature要素，一个feature就是一个点坐标信息
  feature.value = new Feature({
    geometry: new Point(coordinate),
  });
  // 设置要素的图标
  feature.value.setStyle(
    new Style({
      // 设置图片效果
      image: new Icon({
        src: 'http://api.tianditu.gov.cn/img/map/markerA.png',
        // anchor: [0.5, 0.5],
        scale: 1.2,
      }),
    })
  );
  // 要素添加到地图图层上
  pointLayer.value.getSource().addFeature(feature.value);

  if(map.value && !props.closeOnChoose){
    map.value.getView().setCenter(coordinate); // 设置中心
    map.value.getView().setZoom(15); // 设置缩放级别（已经定义为13）
  }

}

async function complete(coordinates) {
  try {
    if(props.returnAddress){
      const data = await geocoder(coordinates)
      editingItem.value = data;
      emit('update:model-value',data)
    }else{
      editingItem.value = {longitude:coordinates[0],latitude:coordinates[1]}
      emit('update:model-value',editingItem.value)
    }
    tempLocation.value = null
    if(props.closeOnChoose){
      menu.value = false
    }

  } catch (e) {
    console.log(e)
  }
}

async function geocoder(coordinates) {
  return new Promise((resolve,reject)=>{
    const params = {
      postStr: JSON.stringify({lon: coordinates[0], lat: coordinates[1], ver: 1}),
      type: 'geocode',
      tk: TIAN_DI_KEY
    }
    fetch('https://api.tianditu.gov.cn/geocoder?' + (new URLSearchParams(params)).toString())
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json(); // 或者 response.text() 如果你需要文本格式的响应
      })
      .then(({result}) => {
        const province = result.addressComponent.province;
        const city = result.addressComponent.city;
        const area = result.addressComponent.county;
        resolve({
          latitude:coordinates[1],
          longitude:coordinates[0],
          province:province,
          province_id:result.addressComponent.province_code.substring(3),
          city:city,
          city_id:result.addressComponent.city_code.substring(3),
          area:area,
          area_id:result.addressComponent.county_code.substring(3),
          town:result.addressComponent.town,
          town_id:result.addressComponent.town_code.substring(3),
          road:result.addressComponent.road,
          address:result.formatted_address.replace(province+city+area,'')
        })
      })
      .catch(error => {
        console.error('There was a problem with the fetch operation:', error);
        reject(error)
      });
  })



}


</script>
<style scoped>
.map-wrapper {
  position: relative;
  height: 500px;
  width: 100%;
}

#map-container {
  width: 100%;
  height: 100%;
}

.popup-box {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 16px;
  z-index: 1000;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  max-width: 280px;
  font-family: 'Arial', sans-serif;
  position: absolute;
  transform: translate(-50%, -100%);
  display: none;
}

.popup-box::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -6px;
  border-width: 6px;
  border-style: solid;
  border-color: rgba(255, 255, 255, 0.95) transparent transparent transparent;
}

.close-button {
  background: none;
  color: #666;
  border: none;
  font-size: 18px;
  position: absolute;
  top: 8px;
  right: 8px;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.close-button:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

.popup-content {
  width: 240px;
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.5;
}

.cursor-pointer {
  cursor: pointer;
}

.cursor-pointer:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

.border-b {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
</style>
