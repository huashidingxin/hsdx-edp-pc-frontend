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
import { computed, onMounted, reactive, ref, watch } from 'vue';

import {
  Button,
  ColorPicker,
  Empty,
  Form,
  FormItem,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Switch,
  Tabs,
  Tag,
  message,
} from 'antdv-next';

import { upload } from '#/api';
import {
  getCurrentApplicationId,
  setCurrentApplicationId,
} from '#/api/application-context';
import { requestClient } from '#/api/request';
import Resource from '#/api/resource';
import AppUpload from '#/components/AppUpload.vue';
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

/* ===================== 漫游设置（应用级） ===================== */

/**
 * 应用级配置：自动旋转 / 背景音乐 / 陀螺仪 / 足迹 / 小行星 / ui 主题 /
 * 电子沙盘 / P2 零散（开场提示、滚动字幕、导航按钮、导览、过渡动画）。
 * 存 application_settings（group=panorama），GET/PUT 的形状与公开 API 的
 * features + ui + sand_table + extras 一致 —— 管理端读到的就是「当前生效值」。
 */
const settingsOpen = ref(false);
const settingsSaving = ref(false);
/** 漫游设置分页签：一个 Modal 塞五个区块没法看，按「体验 / 外观 / 公告 / 导览」拆开 */
const settingsTab = ref('experience');
/**
 * 读取成功才允许保存：读取失败时表单里是「默认值」而不是「现有配置」，
 * 此时保存会把配置清空（真实发生过的事故），必须拦下。
 */
const settingsLoaded = ref(false);
const settingsForm = reactive({
  autorotate: true,
  autorotate_speed: null,
  bg_music: '',
  gyro: false,
  footmark: true,
  littleplanet: true,
  theme_primary: '',
  theme_logo: '',
  theme_loading_img: '',
  compass: true,
  scenesBar: true,
  // ---- P2 零散（extras）----
  transition: 'fade',
  open_alert: '',
  top_ad: '',
  nav_links: [],
  tour_guide: [],
});

const TRANSITION_OPTIONS = [
  { value: 'fade', label: '淡入淡出' },
  { value: 'black', label: '黑场' },
  { value: 'white', label: '白场' },
];

async function openSettings() {
  settingsOpen.value = true;
  settingsLoaded.value = false;
  try {
    const data = await requestClient.get('/panorama-scenes/settings');
    settingsLoaded.value = true;
    settingsForm.autorotate = data?.autorotate ?? true;
    settingsForm.autorotate_speed = data?.autorotate_speed ?? null;
    settingsForm.bg_music = data?.bg_music || '';
    settingsForm.gyro = Boolean(data?.gyro);
    settingsForm.footmark = data?.footmark ?? true;
    settingsForm.littleplanet = data?.littleplanet ?? true;
    settingsForm.theme_primary = data?.ui?.theme?.primary || '';
    settingsForm.theme_logo = data?.ui?.theme?.logo || '';
    settingsForm.theme_loading_img = data?.ui?.theme?.loading_img || '';
    settingsForm.compass = data?.ui?.features?.compass ?? true;
    settingsForm.scenesBar = data?.ui?.features?.scenesBar ?? true;
    settingsForm.transition = data?.extras?.transition || 'fade';
    settingsForm.open_alert = data?.extras?.open_alert || '';
    settingsForm.top_ad = data?.extras?.top_ad || '';
    settingsForm.nav_links = Array.isArray(data?.extras?.nav_links)
      ? data.extras.nav_links.map((item) => ({ ...item }))
      : [];
    settingsForm.tour_guide = Array.isArray(data?.extras?.tour_guide)
      ? data.extras.tour_guide.map((item) => ({ ...item }))
      : [];
  } catch {
    message.error('读取漫游设置失败');
  }
}

async function saveSettings() {
  if (!settingsLoaded.value) {
    message.error('漫游设置尚未读取成功，已阻止保存（避免用空值覆盖现有配置），请关闭后重试');
    return;
  }
  settingsSaving.value = true;
  try {
    await flushUploads();
    await requestClient.put('/panorama-scenes/settings', {
      autorotate: settingsForm.autorotate,
      autorotate_speed: settingsForm.autorotate_speed ?? null,
      bg_music: asUrlString(settingsForm.bg_music),
      gyro: settingsForm.gyro,
      footmark: settingsForm.footmark,
      littleplanet: settingsForm.littleplanet,
      ui: {
        theme: {
          primary: settingsForm.theme_primary || null,
          logo: asUrlString(settingsForm.theme_logo),
          loading_img: asUrlString(settingsForm.theme_loading_img),
        },
        features: {
          compass: settingsForm.compass,
          scenesBar: settingsForm.scenesBar,
        },
      },
      // extras 各项整体覆盖；空值传 null = 关闭该能力；导航按钮丢弃没填完的行
      transition: settingsForm.transition,
      open_alert: settingsForm.open_alert.trim() || null,
      top_ad: settingsForm.top_ad.trim() || null,
      nav_links: settingsForm.nav_links.filter((link) => link.title.trim() && link.url.trim()).length
        ? settingsForm.nav_links
            .filter((link) => link.title.trim() && link.url.trim())
            .map((link) => ({ ...link, icon: asUrlString(link.icon) }))
        : null,
      tour_guide: settingsForm.tour_guide.length ? settingsForm.tour_guide : null,
    });
    message.success('已保存，播放页刷新后生效');
    settingsOpen.value = false;
  } catch (error) {
    message.error(error?.message || '保存漫游设置失败');
  } finally {
    settingsSaving.value = false;
  }
}

/* ---- 导航按钮 / 导览点 行编辑 ---- */

/** ColorPicker 写回主题色：value-format=hex 给字符串，清空时给 null —— 统一成字符串存表单。 */
function onThemePrimaryChange(value) {
  settingsForm.theme_primary = typeof value === 'string' ? value : '';
}

function addNavLink() {
  if (settingsForm.nav_links.length >= 6) {
    message.warning('导航按钮最多 6 个');
    return;
  }
  settingsForm.nav_links.push({ title: '', url: '', icon: null });
}

function removeNavLink(index) {
  settingsForm.nav_links.splice(index, 1);
}

/** 导航按钮行的图标上传控件（每行一个 AppUpload，v-for 里用函数式 ref 收集）。 */
const navIconRefs = ref([]);

/** 导览点行可用的场景下拉（场景 code 是 tour_guide 的关联键）。 */
const sceneCodeOptions = computed(() =>
  allScenes.value.map((scene) => ({ value: scene.code, label: scene.title || scene.code })),
);

/** 场景 code → 缩略图地址（沙盘/导览列表里帮用户认场景）。 */
const sceneThumbByCode = computed(() => {
  const map = {};
  for (const scene of allScenes.value) {
    map[scene.code] = scene.thumb || scene.image || '';
  }
  return map;
});

function addTourPoint() {
  if (settingsForm.tour_guide.length >= 30) {
    message.warning('导览点最多 30 个');
    return;
  }
  settingsForm.tour_guide.push({ scene_code: undefined, yaw: 0, pitch: 0, hfov: null, stay: 4 });
}

function removeTourPoint(index) {
  settingsForm.tour_guide.splice(index, 1);
}

/** 上移 / 下移导览点：列表顺序就是播放页的飞行顺序。 */
function moveTourPoint(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= settingsForm.tour_guide.length) return;
  const [row] = settingsForm.tour_guide.splice(index, 1);
  settingsForm.tour_guide.splice(target, 0, row);
}

/* ---- 上传（AppUpload 不自动上传：选中文件先挂在表单上，保存那一刻 flush 成远程地址） ---- */

const bgMusicUploadRef = ref(null);
const logoUploadRef = ref(null);
const loadingImgUploadRef = ref(null);
const sandImageUploadRef = ref(null);

/** 把面板上所有待上传文件真正传出去（AppUpload 约定：save 前 flush）。 */
async function flushUploads() {
  const refs = [
    bgMusicUploadRef.value,
    logoUploadRef.value,
    loadingImgUploadRef.value,
    sandImageUploadRef.value,
    ...navIconRefs.value,
  ];
  for (const instance of refs) {
    if (typeof instance?.upload === 'function') {
      await instance.upload();
    }
  }
}

/** AppUpload 的 v-model 在「已上传/已有地址」时是字符串，否则可能是 FileItem 对象 —— 落库前归一。 */
function asUrlString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/* ===================== 电子沙盘（应用级） ===================== */

/**
 * 沙盘标点编辑：底图 + 每个场景一个定位点（百分比坐标）。
 * points 存储形状是 { 场景code: {x,y,rotate,hlookat} }（键=场景 code），
 * 编辑时转成行数组，保存时再转回对象。
 */
const sandOpen = ref(false);
const sandSaving = ref(false);
/** 读取成功才允许保存（同 settingsLoaded：防止读取失败时用空表单覆盖配置）。 */
const sandLoaded = ref(false);
const sandForm = reactive({ open: true, image: '', points: [] });
/** 点击底图记下的待落点坐标（百分比），选好场景后确认成行。 */
const sandPending = ref(null);
/** 当前查看的标点（清单悬停时底图上的圆点同步高亮）。 */
const sandSelectedCode = ref(null);

function openSand() {
  sandOpen.value = true;
  sandPending.value = null;
  sandLoaded.value = false;
  requestClient
    .get('/panorama-scenes/settings')
    .then((data) => {
      sandLoaded.value = true;
      sandForm.open = data?.sand_table?.open ?? true;
      sandForm.image = data?.sand_table?.image || '';
      sandForm.points = Object.entries(data?.sand_table?.points ?? {}).map(([code, point]) => ({
        scene_code: code,
        x: point?.x ?? 0,
        y: point?.y ?? 0,
        rotate: point?.rotate ?? 0,
        hlookat: point?.hlookat ?? null,
      }));
    })
    .catch(() => message.error('读取沙盘配置失败'));
}

async function saveSand() {
  if (!sandLoaded.value) {
    message.error('沙盘配置尚未读取成功，已阻止保存（避免用空值覆盖现有配置），请关闭后重试');
    return;
  }
  await flushUploads();
  const sandImage = asUrlString(sandForm.image);
  if (sandImage && sandForm.points.length === 0) {
    message.warning('已设置底图但还没有标点；清空底图或添加标点后再保存');
    return;
  }

  sandSaving.value = true;
  try {
    const points = {};
    for (const point of sandForm.points) {
      points[point.scene_code] = {
        x: Math.round(point.x * 100) / 100,
        y: Math.round(point.y * 100) / 100,
        rotate: Math.round((point.rotate || 0) * 100) / 100,
        hlookat: point.hlookat === null || point.hlookat === undefined ? null : Math.round(point.hlookat * 100) / 100,
      };
    }
    await requestClient.put('/panorama-scenes/settings', {
      sand_table: {
        open: sandForm.open,
        image: sandImage,
        points: sandImage ? points : null,
      },
    });
    message.success('沙盘已保存，播放页刷新后生效');
    sandOpen.value = false;
  } catch (error) {
    message.error(error?.message || '保存沙盘失败');
  } finally {
    sandSaving.value = false;
  }
}

/** 点击底图取坐标（百分比）。 */
function onSandMapClick(event) {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  sandPending.value = {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    scene_code: undefined,
  };
}

function confirmSandPoint() {
  const pending = sandPending.value;
  if (!pending?.scene_code) {
    message.warning('请先选择要标注的场景');
    return;
  }
  if (sandForm.points.some((point) => point.scene_code === pending.scene_code)) {
    message.warning('该场景已标过点，请直接在列表里调整坐标');
    return;
  }
  sandForm.points.push({
    scene_code: pending.scene_code,
    x: pending.x,
    y: pending.y,
    rotate: 0,
    hlookat: null,
  });
  sandPending.value = null;
}

function removeSandPoint(index) {
  sandForm.points.splice(index, 1);
}

/** 沙盘行里可选的场景（排除已标注的）。 */
const sandSceneOptions = computed(() =>
  sceneCodeOptions.value.filter((option) => !sandForm.points.some((point) => point.scene_code === option.value)),
);

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
    field: 'group',
    type: 'text',
    label: '分组',
    span: 12,
    attrs: { placeholder: '播放页场景条按分组名归组；留空 = 未分组' },
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
  { field: 'group', title: '分组', width: 110 },
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
        <Button class="mr-2" @click="openSand">电子沙盘</Button>
        <Button class="mr-2" @click="openSettings">漫游设置</Button>
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

    <!-- 漫游设置：应用级配置（自动旋转/背景音乐/足迹/ui 主题），存 application_settings -->
    <Modal
      v-model:open="settingsOpen"
      title="漫游设置"
      :width="560"
      :confirm-loading="settingsSaving"
      :ok-button-props="{ disabled: !settingsLoaded }"
      ok-text="保存"
      cancel-text="取消"
      @ok="saveSettings"
    >
      <Tabs v-model:activeKey="settingsTab" size="small" class="mt-1">
        <!-- ===== 页签 1：播放体验 ===== -->
        <Tabs.TabPane key="experience" tab="播放体验">
          <p class="mb-3 text-xs text-gray-400">
            控制观众进入播放页后的自动行为，全部即时生效，不用改场景数据。
          </p>
          <Form layout="vertical">
            <div class="grid grid-cols-2 gap-x-4">
              <FormItem label="自动旋转" extra="无人操作时镜头缓慢自转，拖动即停">
                <Switch v-model:checked="settingsForm.autorotate" />
              </FormItem>
              <FormItem label="自动旋转速度（度/秒）" extra="不填用默认 3，一圈约 2 分钟">
                <InputNumber
                  v-model:value="settingsForm.autorotate_speed"
                  class="w-full"
                  :min="0.1"
                  :max="30"
                  :step="0.5"
                  placeholder="3"
                />
              </FormItem>
              <FormItem label="小行星开场" extra="进入时从高空俯瞰展开成全景（约 2 秒）">
                <Switch v-model:checked="settingsForm.littleplanet" />
              </FormItem>
              <FormItem label="足迹" extra="看过的场景在底部场景条上描一圈主题色">
                <Switch v-model:checked="settingsForm.footmark" />
              </FormItem>
              <FormItem label="陀螺仪（手机）" extra="手机转动时镜头跟着转，需 HTTPS 环境">
                <Switch v-model:checked="settingsForm.gyro" />
              </FormItem>
              <FormItem label="背景音乐" extra="选择音频文件，保存时自动上传；不选则关闭">
                <AppUpload
                  ref="bgMusicUploadRef"
                  v-model:value="settingsForm.bg_music"
                  file-type="audio"
                  scene="panorama"
                />
              </FormItem>
            </div>
          </Form>
        </Tabs.TabPane>

        <!-- ===== 页签 2：界面外观 ===== -->
        <Tabs.TabPane key="appearance" tab="界面外观">
          <p class="mb-3 text-xs text-gray-400">
            播放页顶栏与控件的样子。主题色、logo、启动图支持每个应用单独设置。
          </p>
          <Form layout="vertical">
            <div class="grid grid-cols-2 gap-x-4">
              <FormItem label="主题色" extra="按钮、足迹圈、罗盘等控件的颜色，如 #185fa5">
                <div class="flex items-center gap-2">
                  <ColorPicker
                    :value="settingsForm.theme_primary || undefined"
                    value-format="hex"
                    show-text
                    allow-clear
                    @update:value="onThemePrimaryChange"
                  />
                  <Input v-model:value="settingsForm.theme_primary" class="flex-1" placeholder="#185fa5" />
                </div>
              </FormItem>
              <div class="grid grid-cols-2 gap-x-4">
                <FormItem label="指北针" extra="右上角的小罗盘">
                  <Switch v-model:checked="settingsForm.compass" />
                </FormItem>
                <FormItem label="场景条" extra="底部的场景缩略图列表">
                  <Switch v-model:checked="settingsForm.scenesBar" />
                </FormItem>
              </div>
              <FormItem label="品牌 logo" extra="显示在左上角替代应用名文字" class="col-span-2">
                <AppUpload
                  ref="logoUploadRef"
                  v-model:value="settingsForm.theme_logo"
                  file-type="image"
                  scene="panorama"
                  item-width="80px"
                />
              </FormItem>
              <FormItem label="启动图" extra="播放页打开前显示的整屏图片（即加载画面）" class="col-span-2">
                <AppUpload
                  ref="loadingImgUploadRef"
                  v-model:value="settingsForm.theme_loading_img"
                  file-type="image"
                  scene="panorama"
                  item-width="80px"
                />
              </FormItem>
            </div>
          </Form>
        </Tabs.TabPane>

        <!-- ===== 页签 3：公告与导航按钮 ===== -->
        <Tabs.TabPane key="notice" tab="公告与导航">
          <p class="mb-3 text-xs text-gray-400">
            想告诉观众的话、以及固定入口按钮。不填的内容播放页里就不出现。
          </p>
          <Form layout="vertical">
            <FormItem label="开场提示（弹窗公告）" extra="观众进入播放页时弹出的文字说明，点「我知道了」关闭；留空不弹">
              <Input.TextArea
                v-model:value="settingsForm.open_alert"
                :rows="3"
                :maxlength="2000"
                placeholder="例如：欢迎参观线上展馆，建议使用电脑端获得最佳体验。"
              />
            </FormItem>
            <FormItem label="顶部滚动字幕" extra="屏幕顶部横向滚动的文字；留空关闭">
              <Input v-model:value="settingsForm.top_ad" :maxlength="500" placeholder="例如：欢迎光临××园区" />
            </FormItem>
            <FormItem label="场景切换动画" extra="场景之间怎么过渡">
              <Select v-model:value="settingsForm.transition" :options="TRANSITION_OPTIONS" class="w-48" />
            </FormItem>
          </Form>

          <div class="mb-2 mt-2 flex items-center justify-between">
            <span class="text-sm">导航按钮</span>
            <span class="text-xs text-gray-400">显示在播放页左下角，最多 6 个</span>
          </div>
          <div v-for="(link, index) in settingsForm.nav_links" :key="index" class="mb-2 flex items-center gap-2">
            <AppUpload
              :ref="(el) => (navIconRefs[index] = el)"
              v-model="link.icon"
              file-type="image"
              scene="panorama"
              item-width="56px"
              :aspect-ratio="1"
              class="w-16 flex-none"
            />
            <Input v-model:value="link.title" :maxlength="32" class="w-36" placeholder="按钮文字，如 咨询热线" />
            <Input v-model:value="link.url" placeholder="网址 https://… 或电话 tel:…" />
            <Button danger type="text" @click="removeNavLink(index)">删除</Button>
          </div>
          <Button size="small" @click="addNavLink">+ 添加按钮</Button>
        </Tabs.TabPane>

        <!-- ===== 页签 4：一键导览 ===== -->
        <Tabs.TabPane key="tour" tab="一键导览">
          <p class="mb-3 text-xs text-gray-400">
            观众点播放页的 ▶ 按钮后，镜头按下面的顺序自动逐个场景游览。
            不添加导览点则不显示该按钮。
          </p>

          <div v-if="settingsForm.tour_guide.length" class="tour-table tour-6">
            <div class="tour-row tour-head">
              <span>顺序</span>
              <span>场景</span>
              <span>看的方向（水平°）</span>
              <span>看的方向（垂直°）</span>
              <span>停留（秒）</span>
              <span></span>
            </div>
            <div v-for="(point, index) in settingsForm.tour_guide" :key="index" class="tour-row">
              <span class="text-xs text-gray-400">{{ index + 1 }}</span>
              <Select
                v-model:value="point.scene_code"
                :options="sceneCodeOptions"
                placeholder="选择场景"
                show-search
                option-filter-prop="label"
              />
              <InputNumber v-model:value="point.yaw" :min="-360" :max="360" title="0=初始朝向，正值向右转" />
              <InputNumber v-model:value="point.pitch" :min="-90" :max="90" title="正值抬头看，负值低头看" />
              <InputNumber v-model:value="point.stay" :min="1" :max="30" />
              <span class="flex gap-1">
                <Button size="small" type="text" :disabled="index === 0" @click="moveTourPoint(index, -1)">↑</Button>
                <Button
                  size="small"
                  type="text"
                  :disabled="index === settingsForm.tour_guide.length - 1"
                  @click="moveTourPoint(index, 1)"
                >
                  ↓
                </Button>
                <Button danger size="small" type="text" @click="removeTourPoint(index)">删除</Button>
              </span>
            </div>
          </div>
          <p v-else class="mb-2 text-xs text-gray-400">还没有导览点。</p>
          <Button size="small" @click="addTourPoint">+ 添加导览点</Button>
          <p class="mt-2 text-xs text-gray-400">
            「看的方向」不知道填什么可以先保持 0 —— 镜头会停在场景的默认视角。
          </p>
        </Tabs.TabPane>
      </Tabs>
    </Modal>

    <!-- 电子沙盘：底图 + 场景标点（点击底图取坐标），存 application_settings.sand_table -->
    <Modal
      v-model:open="sandOpen"
      title="电子沙盘"
      :width="720"
      :confirm-loading="sandSaving"
      :ok-button-props="{ disabled: !sandLoaded }"
      ok-text="保存"
      cancel-text="取消"
      @ok="saveSand"
    >
      <p class="mb-3 text-xs text-gray-400">
        电子沙盘 = 一张园区 / 楼宇平面图，上面标出每个场景的位置；观众点沙盘上的圆点就能跳到对应场景，
        并用扇形显示当前视线方向。
      </p>

      <!-- 第 1 步：底图 -->
      <div class="mb-4">
        <div class="mb-1 flex items-center gap-2">
          <span class="step-no">1</span>
          <span class="text-sm font-medium">上传平面底图</span>
        </div>
        <div class="ml-6">
          <AppUpload
            ref="sandImageUploadRef"
            v-model:value="sandForm.image"
            file-type="image"
            scene="panorama"
            item-width="140px"
          />
          <p class="text-xs text-gray-400">建议用横版平面图（园区 / 楼宇俯视图）；也支持直接粘贴外部图片地址</p>
        </div>
      </div>

      <template v-if="sandForm.image">
        <!-- 第 2 步：点图落点 -->
        <div class="mb-4">
          <div class="mb-1 flex items-center gap-2">
            <span class="step-no">2</span>
            <span class="text-sm font-medium">点击底图，标出各场景的位置</span>
          </div>
          <div class="ml-6">
            <div class="sand-map-wrap">
              <img :src="sandForm.image" alt="沙盘底图" class="sand-map" @click="onSandMapClick" />
              <span
                v-for="point in sandForm.points"
                :key="point.scene_code"
                class="sand-marker"
                :class="{ 'is-active': point.scene_code === sandSelectedCode }"
                :style="{ left: `${point.x}%`, top: `${point.y}%` }"
                :title="point.scene_code"
                @click="sandSelectedCode = point.scene_code"
              ></span>
              <span
                v-if="sandPending"
                class="sand-marker sand-marker--pending"
                :style="{ left: `${sandPending.x}%`, top: `${sandPending.y}%` }"
              ></span>
            </div>

            <div v-if="sandPending" class="mt-2 flex items-center gap-2 rounded border border-blue-200 bg-blue-50 p-2">
              <span class="text-xs">新标点位置 {{ sandPending.x }}%, {{ sandPending.y }}%，属于哪个场景？</span>
              <Select
                v-model:value="sandPending.scene_code"
                class="w-48"
                :options="sandSceneOptions"
                placeholder="选择场景"
                show-search
                option-filter-prop="label"
              />
              <Button type="primary" size="small" @click="confirmSandPoint">确认</Button>
              <Button size="small" @click="sandPending = null">取消</Button>
            </div>
            <p v-else class="mt-1 text-xs text-gray-400">点击底图任意位置开始放置圆点</p>
          </div>
        </div>

        <!-- 第 3 步：标点清单 -->
        <div>
          <div class="mb-1 flex items-center gap-2">
            <span class="step-no">3</span>
            <span class="text-sm font-medium">标点清单（{{ sandForm.points.length }}）</span>
          </div>
          <div v-if="sandForm.points.length" class="ml-6">
            <div class="tour-table">
              <div class="tour-row tour-head">
                <span>场景</span>
                <span>位置（横向% / 纵向%）</span>
                <span>点进去后看的方向（°）</span>
                <span></span>
              </div>
              <div
                v-for="(point, index) in sandForm.points"
                :key="point.scene_code"
                class="tour-row"
                :class="{ 'is-active': point.scene_code === sandSelectedCode }"
                @mouseenter="sandSelectedCode = point.scene_code"
              >
                <span class="flex items-center gap-2">
                  <img
                    v-if="sceneThumbByCode[point.scene_code]"
                    :src="sceneThumbByCode[point.scene_code]"
                    alt=""
                    class="h-7 w-12 rounded object-cover"
                  />
                  <span class="truncate text-xs" :title="point.scene_code">
                    {{ sceneCodeOptions.find((option) => option.value === point.scene_code)?.label || point.scene_code }}
                  </span>
                </span>
                <span class="flex items-center gap-1">
                  <InputNumber v-model:value="point.x" :min="0" :max="100" />
                  <span class="text-xs text-gray-400">/</span>
                  <InputNumber v-model:value="point.y" :min="0" :max="100" />
                </span>
                <InputNumber v-model:value="point.hlookat" :min="-360" :max="360" :placeholder="'不填用默认视角'" />
                <Button danger size="small" type="text" @click="removeSandPoint(index)">删除</Button>
              </div>
            </div>
          </div>
          <p v-else class="ml-6 text-xs text-gray-400">还没有标点 —— 回到第 2 步点击底图放置第一个圆点</p>
        </div>
      </template>

      <Form layout="vertical" class="mt-4">
        <FormItem class="mb-0">
          <Switch v-model:checked="sandForm.open" class="mr-2" />
          <span class="text-sm">启用沙盘</span>
          <span class="ml-2 text-xs text-gray-400">关闭后播放页导航栏不显示沙盘按钮（已标的点会保留）</span>
        </FormItem>
      </Form>
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

/* 电子沙盘底图与标点 */
.sand-map-wrap {
  position: relative;
  display: inline-block;
  max-width: 100%;
}

.sand-map {
  display: block;
  max-width: 100%;
  max-height: 320px;
  cursor: crosshair;
  border-radius: 6px;
}

.sand-marker {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #1677ff;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 4px rgb(0 0 0 / 40%);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.sand-marker--pending {
  background: #faad14;
}

/* 沙盘圆点：清单悬停行时高亮对应圆点 */
.sand-marker.is-active {
  background: #faad14;
  box-shadow:
    0 0 0 3px rgb(250 173 20 / 40%),
    0 0 4px rgb(0 0 0 / 40%);
}

/* 引导步骤序号圆片 */
.step-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: none;
  color: #fff;
  font-size: 12px;
  background: #1677ff;
  border-radius: 50%;
}

/* 行编辑表格（导览点 / 沙盘标点共用）：表头行 + 数据行 */
.tour-table {
  overflow: hidden;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
}

/* 默认 4 列（沙盘标点）：场景 / 位置 / 朝向 / 操作 */
.tour-row {
  display: grid;
  grid-template-columns: minmax(150px, 1.4fr) minmax(150px, 1fr) minmax(130px, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
}

/* 6 列版（导览点）：顺序 / 场景 / 水平 / 垂直 / 停留 / 操作 */
.tour-6 .tour-row {
  grid-template-columns: 44px minmax(150px, 1.4fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(90px, 0.7fr) auto;
}

.tour-row.tour-head {
  font-size: 12px;
  color: rgb(0 0 0 / 45%);
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
}

.tour-row:not(.tour-head):not(:last-child) {
  border-bottom: 1px solid #f5f5f5;
}

.tour-row.is-active {
  background: #fffbe6;
}
</style>
