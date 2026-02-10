<script setup lang="ts">
import 'ol/ol.css'
import {get} from "ol/proj";
import Map from "ol/Map";
import TileLayer from "ol/layer/Tile";
import {XYZ} from "ol/source";
import View from "ol/View";
import VectorSource from "ol/source/Vector";
import VectorLayer from "ol/layer/Vector";
import {Fill, Stroke, Style} from "ol/style";
import Draw from "ol/interaction/Draw";
import Polygon from "ol/geom/Polygon";
import Feature from "ol/Feature";
import Resource from "@/api/resource";
import {useAppStore} from "@/store";
import projectTable from '#/props/projectTable.js'

import {requestClient} from '#/api/request';
const appStore = useAppStore()
const $toast = inject('$toast')


const props = defineProps({
  projectId: {
    default: '',
    type: String
  },
  title: {
    default: '',
    type: String
  }
})
const options = ref({
  columns: [
    {field: 'name', title: '名称', fixed: 'left', minWidth: '200px'},
    {field: 'project.name', title: '项目'},
    {field: 'code', title: '编号'},
    {field: 'created_at', title: '创建时间'},
  ],
  data: []
});
const filters = ref([
  {
    field: 'name',
    type: 'text',
    col: 3,
    label: '名称',
  },
  {
    field: 'code',
    type: 'text',
    col: 3,
    label: '编号',
  },
]);

const fields = ref([
  {
    field: 'name',
    type: 'text',
    col: 3,
    label: '名称',
    rules: [v => !!v || '请输入名称']
  },
  {
    field: 'code',
    type: 'text',
    col: 3,
    label: '编号',
    rules: [v => !!v || '请输入编号']
  },
  {
    field: 'location',
    type: 'slot',
    col: 6,
    label: '位置',
    attrs:{}
  },
  {
    field: 'boundary',
    type: 'slot',
    col: 12,
    label: '地理位置范围',
    rules: [v => !!v || '请绘制位置范围']
  },
]);

const editingItem = ref({})

const mapRef = ref(null)
const map = ref(null)

function initMap() {
  const projection = get('EPSG:4326');
  const layerTypeMap = {
    vector: ['vec', 'cva'], // [矢量底图, 矢量注记]
    image: ['img', 'cia'], // [影像底图, 影像注记]
    terrain: ['ter', 'cta'] // [地形晕渲, 地形注记]
  };
  const layerType = 'image'
  const key = import.meta.env.VITE_TIANDI_KEY;
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
      center: [116.28, 39.48],
      projection: projection,
      zoom:12,
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


const project = ref(null)

async function getProject(projectId) {
  try {
    const api = new Resource('projects')
    const {data} = await api.get(projectId)
    project.value = data
  } catch (e) {
    console.log(e)
  }
}

const route = useRoute()
watch(() => editingItem.value.id, async (newVal) => {


})


function columnFormat(columns) {
  return columns.filter(e=>{
    if(props.projectId && e.field === 'project.name') {
      return false
    }
    return true
  })
}

const excludeFilters = computed(()=>{
  return appStore.defaultProject?.id > 0 ? ['project.name'] : []
})


const isSetCenter  = ref(false)
// map初始化需要等map的dom节点，不要在组件的初始化里去初始化，没有field_boundary这个slot的时候没有map dom
watch(mapRef,(newVal)=>{
  if(newVal){
    initMap();
    setCenter()
  }else{
    resetDrawing()
  }
})

function setCenter() {
  if (!isSetCenter.value) {
    if (!editingItem.value.id && project.value?.address?.longitude && map.value) {

      map.value.getView().setCenter([parseFloat(project.value.address?.longitude), parseFloat(project.value.address?.latitude)])
      isSetCenter.value = true
    }

  }
}

watch(() => editingItem.value.boundary, (newValue) => {
  if (newValue) {
    loadFence(newValue)
  }
})
function detailFormat(e) {
  return {...e,location:{longitude:e.longitude,latitude:e.latitude}}
}
function saveFormat(e) {
  //e.project_id = props.projectId
  return {
    ...e,
    project_id:props.projectId || appStore.defaultProject?.id,
    ...(e.location || {})
  };
}

const requestData = computed(()=>{
  return {project_id:props.projectId || appStore.defaultProject?.id}
})

const importDialog = ref(false)
const projectSelectDialog = ref(false)
const projectSelected = ref(null)
const milepostFile = ref(null)
const importForm = ref(null)
async function importSubmit() {
  const {valid} = await importForm.value.validate()
  if(!valid){
    return
  }

  try{
    const formData: FormData = new FormData();
    formData.append('file',milepostFile.value.file)
    formData.append('project_id',appStore.defaultProject?.id || projectSelected.value.id)
    await requestClient.post('mileposts/import',formData,{
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    $toast.success('导入成功');
  }catch(e) {
    console.log(e)
  }
}

watch(()=>editingItem.value.location,(newLocation)=>{
  if(newLocation?.longitude){
    map.value.getView().setCenter([parseFloat(newLocation.longitude), parseFloat(newLocation.latitude)])
  }
},{deep:true})

onBeforeMount(async () => {
  editingItem.value.project_id = route.query?.projectId || props.projectId || appStore.defaultProject?.id
  await getProject(editingItem.value.project_id)
  setCenter()
})
</script>
<template>
  <div>
    <AppTable
      v-model="editingItem"
      :options="options"
      :filter-fields="filters"
      detail-open-type="drawer"
      create-open-type="drawer"
      :request-data="requestData"
      :title="title"
      :fields="fields"
      api-url="mileposts"
      :detail-format="detailFormat"
      :column-format="columnFormat"
      :save-format="saveFormat"
      permission-name="milepost"
      :project-props="{edit:true,filter:true,editRequired:true}"
    >
      <template #right>
        <v-btn class="mr-3" color="warning" variant="tonal" @click="importDialog=true">导入</v-btn>
      </template>
      <template #field_location>
        <AppChooseLoation v-model="editingItem.location" :return-address="false"  label="桩号位置" class="required-field"></AppChooseLoation>
      </template>
      <template #field_boundary>
        <div class="py-3">
          <div class="d-flex justify-space-between align-center mb-2">
            <div class="text-subtitle-1 font-weight-bold">地理位置范围标注</div>
            <div v-if="vectorSource.getFeatures().length">
              <v-btn color="warning" @click="resetDrawing">
                <v-icon icon="mdi-lock-reset"></v-icon>
                重新绘制
              </v-btn>
            </div>
          </div>
          <div
            ref="mapRef"
            id="map"
            class="map"
          >
          </div>
        </div>
      </template>

    </AppTable>

    <v-dialog v-model="importDialog" max-width="600px">
      <v-card>
        <v-card-title class="d-flex justify-center align-center">
          <div>批量导入</div>
          <v-icon>md-close</v-icon>
        </v-card-title>
        <v-card-text>
          <v-alert type="warning" class="mb-3">
            导入的桩号编号已存在的会直接覆盖原桩号信息，请谨慎操作
          </v-alert>
          <v-form ref="importForm" >
            <AppTableSelect v-if="!appStore.defaultProject?.id" v-model:show="projectSelectDialog"
                            v-model="projectSelected"
                            v-bind="projectTable"
                            :list-scope="3"
                            placeholder="选择项目"
                            required
            ></AppTableSelect>
            <AppUpload v-model="milepostFile" label="桩号文件" type="file" fileType="file" accept=".kml,.kmz,.ovkml,.ovkmz">
              <template #default>
                <div class="text-grey text-body-2">支持kmz、kml后缀的地图文件（奥维地图导出格式：ovkml、ovkmz，坐标类型：CGCS2000/WGS84）</div>
              </template>
            </AppUpload>
          </v-form>

        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="importDialog=false">取消</v-btn>
          <v-btn color="primary" @click="importSubmit">确定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
#map {
  width: 100%;
  height: 60vh;
  margin: 0 auto;
  border: 1px solid #42B983;
  position: relative;
}
</style>
