<template>
  <div>
    <v-menu v-model="menu" :close-on-content-click="false">
      <template v-slot:activator="{ props }">
        <v-text-field  :label="label" :model-value="viewFormat(editingItem)" :placeholder="placeholder" v-bind="props" readonly >
          <template v-if="returnAddress &&  editingItem && editingItem.longitude" #details>
            <div>
              {{editingItem.longitude}},{{editingItem.latitude}}
            </div>
          </template>
        </v-text-field>
      </template>
      <v-card min-width="75vw">
        <v-card-title class="d-flex align-center pa-4">
          <span>选择位置</span>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="menu = false" />
        </v-card-title>
        <v-card-text style="height: 500px" class="pa-0">
          <div style="position: relative; height: 500px">
            <!-- 搜索栏 - 悬浮在地图上 -->
            <div style="position: absolute; top: 10px; left: 10px; right: 10px; z-index: 1000; max-width: 400px;">
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
                autocomplete="off"
                density="compact"
                bg-color="white"
                rounded
                :readonly="false"
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
              <v-card v-if="searchResults.length > 0" class="mt-2 elevation-4" rounded>
                <div class="text-caption pa-2 pb-0">找到 {{ searchResults.length }} 个结果</div>
                <v-list density="compact" max-height="250" class="overflow-y-auto">
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
              </v-card>
              <v-card v-else-if="searchKeyword && !searchLoading && searchAttempted" class="mt-2 elevation-4" rounded>
                <v-list density="compact">
                  <v-list-item>
                    <v-list-item-title>未找到相关结果</v-list-item-title>
                    <v-list-item-subtitle>请尝试其他关键词</v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </v-card>
            </div>

            <div id="map-container" ></div>
            <div id="popup-box" class="popup-box">
              <button id="close-button" class="close-button">&times;</button>
              <div id="popup-content" class="popup-content"></div>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-menu>

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
    default:'vector',
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
  console.log(newVal)
  // nextTick(()=>{
  //   if(JSON.stringify(newVal) !== JSON.stringify(editingItem.value)){
  //
  //   }
  // })
  editingItem.value = newVal
  if(newVal){
    addPoints([newVal.longitude,newVal.latitude]);
  }

},{immediate:true,dep:true})

watch(menu,(newVal)=>{
  if(newVal){
    nextTick(()=>{
      initMap()
    })
  } else {
    // 关闭时清空搜索结果
    searchResults.value = []
    searchKeyword.value = ''
    searchAttempted.value = false
  }
})

onMounted(() => {
  //initMap() // 加载矢量底图
})

// 搜索地址
async function searchAddress() {
  if (!searchKeyword.value.trim()) return

  console.log('开始搜索:', searchKeyword.value.trim())

  searchLoading.value = true
  searchAttempted.value = true
  try {
    const results = await geocodeSearch(searchKeyword.value.trim())
    searchResults.value = results
    console.log('搜索结果数量:', results.length)
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

  // 选中后自动关闭搜索结果列表
  setTimeout(() => {
    searchAttempted.value = false;
  }, 100);
}

// 地理编码搜索
async function geocodeSearch(keyword) {
  return new Promise((resolve, reject) => {
    const postStr = JSON.stringify({
      keyWord: keyword,
      level: 12,
      mapBound: "-180,-90,180,90",
      queryType: 1,
      start: 0,
      count: 10
    })

    const url = `https://api.tianditu.gov.cn/v2/search?postStr=${encodeURIComponent(postStr)}&type=query&tk=${TIAN_DI_KEY}`
    console.log('搜索请求URL:', url)

    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok')
        }
        return response.json()
      })
      .then(data => {
        console.log('搜索返回数据:', data)

        if (data.status && data.status.infocode === 1000 && data.pois) {
          const results = data.pois.map(poi => ({
            name: poi.name,
            address: poi.address,
            lon: poi.lonlat.split(',')[0],
            lat: poi.lonlat.split(',')[1],
            addressDetail: poi.address
          }))
          console.log('处理后的结果:', results)
          resolve(results)
        } else {
          console.log('未找到结果，状态:', data.status)
          resolve([])
        }
      })
      .catch(error => {
        console.error('地理编码搜索失败:', error)
        reject(error)
      })
  })
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
  });
  map.value.addOverlay(overlay);
  // 添加地图点击事件
  map.value.on('singleclick', (evt) => {
    pointLayer.value.getSource().clear()
    addPoints(evt.coordinate)
    let lonLat = evt.coordinate;
    popupContent.innerHTML = `<div>经度：${lonLat[0]}</div><div>纬度：${lonLat[1]}</div>`;
    overlay.setPosition(lonLat);

    complete(lonLat)
  });
  // 关闭弹出框的事件处理
  closeButton.addEventListener('click', () => {
    overlay.setPosition(undefined); // 关闭弹出框
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
        src: 'https://api.tianditu.gov.cn/img/map/markerA.png',
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
    if (tempLocation.value) {
      // 使用搜索结果的数据
      if (props.returnAddress) {
        const data = await geocoder(coordinates)
        editingItem.value = data;
        emit('update:model-value', data)
      } else {
        editingItem.value = {
          longitude: coordinates[0],
          latitude: coordinates[1]
        }
        emit('update:model-value', editingItem.value)
      }
      tempLocation.value = null
    } else if (props.returnAddress) {
      const data = await geocoder(coordinates)
      editingItem.value = data;
      emit('update:model-value', data)
    } else {
      editingItem.value = {
        longitude: coordinates[0],
        latitude: coordinates[1]
      }
      emit('update:model-value', editingItem.value)
    }
    if(props.closeOnChoose){
      menu.value = false
    }

  } catch (e) {
    console.log(e)
  }
}

async function geocoder(coordinates) {
  return new Promise((resolve,reject)=>{
    const postStr = JSON.stringify({lon: coordinates[0], lat: coordinates[1], ver: 1})
    const url = `https://api.tianditu.gov.cn/geocoder?postStr=${encodeURIComponent(postStr)}&type=geocode&tk=${TIAN_DI_KEY}`
    console.log('逆地理编码请求URL:', url)

    fetch(url)
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
          detail:result.formatted_address.replace(province+city+area,'')
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
#map-container {
  width: 100%;
  height: 100%;
}

.popup-box {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 20px;
  z-index: 1000;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  max-width: 300px;
  font-family: 'Arial', sans-serif;
  position: absolute;
  transform: translate(-50%, -100%); /* 使弹出框上移并居中 */
}

/* 添加箭头样式 */
.popup-box::after {
  content: "";
  position: absolute;
  top: 100%; /* 箭头位于弹出框的底部 */
  left: 50%; /* 箭头横向居中 */
  margin-left: -6px; /* 调整箭头与弹出框的间距 */
  border-width: 6px; /* 箭头的大小 */
  border-style: solid;
  border-color: rgba(255, 255, 255, 0.95) transparent transparent transparent; /* 箭头的颜色 */
}

.close-button {
  background: none;
  color: gray;
  border: none;
  font-size: 20px;
  position: absolute;
  top: 10px;
  right: 10px;
  cursor: pointer;
}

.popup-content {
  width: 240px;
  margin-top: 10px;
  font-size: 16px;
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
