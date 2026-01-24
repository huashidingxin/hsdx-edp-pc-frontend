<script setup lang="ts">
import AppForm from "#/components/AppForm.vue";

const $confirm = inject('$confirm')

import 'ol/ol.css'
import Map from 'ol/Map.js';
import TileLayer from 'ol/layer/Tile.js';
import View from 'ol/View.js';
import { get } from 'ol/proj';
import { XYZ } from 'ol/source';

import Draw from 'ol/interaction/Draw';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Feature from 'ol/Feature';
import {Style,Fill,Stroke} from 'ol/style';
import Polygon from 'ol/geom/Polygon';
import { fromLonLat } from 'ol/proj';
import Resource from "@/api/resource";


const map = ref(null)
const projection = get('EPSG:4326');
const layerTypeMap = {
  vector: ['vec', 'cva'], // [矢量底图, 矢量注记]
  image: ['img', 'cia'], // [影像底图, 影像注记]
  terrain: ['ter', 'cta'] // [地形晕渲, 地形注记]
};
const layerType = 'image'

function initMap() {
  const key = 'f98d0ccbc79338374531bedf8aa26311';
  // c: 经纬度投影 w: 墨卡托投影
  const matrixSet = 'c';
  map.value = new Map({
    target: 'map',
    layers: [
      // new TileLayer({
      //   source: new OSM(),
      // }),
      // 底图
      new TileLayer({
        source: new XYZ({
          url: `https://t{0-7}.tianditu.gov.cn/DataServer?T=${layerTypeMap[layerType][0]}_${matrixSet}&tk=${key}&x={x}&y={y}&l={z}`,
          projection,
        })
      }),
      // 注记
      new TileLayer({
        source: new XYZ({
          url: `https://t{0-7}.tianditu.gov.cn/DataServer?T=${layerTypeMap[layerType][1]}_${matrixSet}&tk=${key}&x={x}&y={y}&l={z}`,
          projection,
        })
      })

    ],

    //editingItem.value.id ? editingItem.value.boundary[0][0] : [parseFloat(project.value.address.longitude), parseFloat(project.value.address.latitude)],
    view: new View({
      center: [116.28,39.48],
      projection: projection,
      zoom: 16,
      maxZoom: 18,
      minZoom: 1
    })

  });


  addInteraction()
}

let draw = reactive({})
const vectorSource = reactive(new VectorSource());
let vectorLayer = (new VectorLayer({
  source: vectorSource,
  style: new Style({
    fill: new Fill({
      color: 'rgba(255, 255, 0, 0.5)'
    }),
    stroke: new Stroke({
      color: '#ffcc33',
      width: 2
    })
  })
}));


// 移除所有特征并重置绘制交互
function resetDrawing() {
  vectorSource.clear(); // 清空矢量源中的所有特征
  if (draw) {
    map.value.removeInteraction(draw);
    draw.setActive(true);
  }
}

function addInteraction() {
  map.value.addLayer(vectorLayer);
// 创建绘制交互
  draw = new Draw({
    source: vectorSource,
    type: 'Polygon', // 可以选择其他类型如'Point', 'LineString'
  });

  map.value.addInteraction(draw);

  draw.on('drawend', async function (event) {
    const feature = event.feature;
    const geometry = feature.getGeometry();
    const coordinates = geometry.getCoordinates();

    editingItem.value.boundary = coordinates;
    // // 将坐标转换为GeoJSON格式
    // const geojsonFormat = new GeoJSON();
    // const geojson = geojsonFormat.writeFeatures([feature]);

    // 禁用绘制交互，防止用户继续绘制更多多边形
    map.value.removeInteraction(draw);
    draw.setActive(false);
  })
}


function loadFence(coordinates) {
  var polygon = new Polygon(coordinates);

// 获取多边形的中心点
  var interiorPoint = polygon.getInteriorPoint();

// 获取中心点的坐标
  var centerCoordinates = interiorPoint.getCoordinates();
  map.value.getView().setCenter(centerCoordinates)

  // 加载围栏
  const feature = new Feature({
    geometry: polygon,
  })
  // 清空现有特征
  vectorSource.clear();
  // 添加新的特征到源
  vectorSource.addFeature(feature);
  draw?.setActive(false)
}


const $route = useRoute()

const props = defineProps({
  fields: {
    default: () => ([]),
    type: Object
  },
  id: {
    default: undefined,
    type: [String,Number]
  },
  type:{
    default:'show', // show edit update
    type:String
  },
  projectId:{
    default:undefined,
    type: [String,Number]
  }
})
const formFields = ref([
  {
    field: 'name',
    type: 'text',
    col: 6,
    label: '名称',
    rules: [v => !!v || '请输入名称']
  },
  {
    field: 'code',
    type: 'text',
    col: 6,
    label: '编号',
    rules: [v => !!v || '请输入编号']
  },
  {
    field: 'boundary',
    type: 'slot',
    col: 12,
    label: '地理位置',
    rules: [v => !!v || '请绘制位置']
  },
]);

const project = ref(null)
async function getProject(projectId) {
  try {
    const api = new Resource('projects')
    const {data} = await api.get(projectId)
    project.value = data
  }catch (e){
    console.log(e)
  }
}
watch(() => props.fields, (newValue) => {
  formFields.value = Object.assign(formFields.value, newValue || {})
}, {immediate: true})

const editingItem = ref({})
const objectId = ref(null)
onMounted( async () => {
  if($route.name == 'MilepostDetail'){
    objectId.value =  $route.params.id || props.id
  }else{
    objectId.value =  props.id
  }
  initMap();
  editingItem.value.project_id = $route.query?.projectId || props.projectId
  await getProject(editingItem.value.project_id)
  if(!objectId.value){
    //editingItem.value.id ? editingItem.value.boundary[0][0] : [parseFloat(project.value.address.longitude), parseFloat(project.value.address.latitude)],
    map.value.getView().setCenter([parseFloat(project.value.address.longitude), parseFloat(project.value.address.latitude)])
  }
})

watch(()=>editingItem.value.boundary,(newValue)=>{
  if(newValue){
    loadFence(newValue)
  }
})


defineExpose({
  fields:formFields.value
})
</script>

<template>
  <v-sheet flat>
    <AppForm v-model="editingItem" api-url="mileposts" :objectId="objectId"  :fields="formFields">
      <template #boundary>
        <div class="py-3">
          <div class="d-flex justify-space-between align-center mb-2">
            <div class="text-subtitle-1 font-weight-bold">地理位置标注</div>
            <div v-if="vectorSource.getFeatures().length">
              <v-btn color="warning" @click="resetDrawing">
                <v-icon icon="mdi-lock-reset"></v-icon>
                重新绘制
              </v-btn>
            </div>
          </div>
          <div id="map" class="map"></div>
        </div>
      </template>
    </AppForm>

  </v-sheet>

</template>

<style scoped>
#map {
  width: 100%;
  height: 50vw;
  margin: 0 auto;
  border: 1px solid #42B983;
  position: relative;
}
</style>
