<script setup>
/**
 * 热点图标选择器（弹窗组件）。
 *
 * 借鉴老全景平台与现代全景 SaaS 设计：
 *   1. 预设库：从后端 /panorama-scenes/icons 获取 98+ 个分类系统图标；
 *   2. 分类筛选：漫游方向、标记锚点、图文音视、业务服务，支持关键词搜索；
 *   3. 动态预览：雪碧图在悬停/选中时支持逐帧动效预览；
 *   4. 自定义上传：支持本租户上传专有图标；
 *   5. 默认圆点：一键清空自定义图标，沿用高反差通用标记。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { IconifyIcon as Icon } from '@vben/icons';
import {
  Button,
  Empty,
  Input,
  Modal,
  Radio,
  Spin,
  Tag,
  Tabs,
  message,
} from 'antdv-next';
import { upload } from '#/api';
import { requestClient } from '#/api/request';

const props = defineProps({
  open: { type: Boolean, default: false },
  /** 当前选中的 icon 标识（key、相对路径或 CDN URL） */
  modelValue: { type: String, default: '' },
  /** 当前热点类型，用于智能推荐初始分类 */
  hotspotType: { type: String, default: 'scene' },
});

const emit = defineEmits(['update:open', 'update:modelValue', 'select']);

const loading = ref(false);
const uploading = ref(false);
const icons = ref([]);
const activeTab = ref('all');
const searchKeyword = ref('');
const selectedIcon = ref('');

const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'direction', label: '漫游方向' },
  { key: 'marker', label: '标记锚点' },
  { key: 'media', label: '图文音视' },
  { key: 'service', label: '业务服务' },
  { key: 'custom', label: '自定义上传' },
];

/** 加载系统预设图标库 */
async function loadIcons() {
  if (icons.value.length) return;
  loading.value = true;
  try {
    const res = await requestClient.get('/panorama-scenes/icons');
    icons.value = Array.isArray(res) ? res : (res?.data || []);
  } catch (error) {
    console.error('[hotspot-icon-picker] loadIcons error:', error);
    message.warning('加载系统图标库失败，请稍后重试');
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      selectedIcon.value = props.modelValue || '';
      searchKeyword.value = '';
      // 按热点类型初选标签页
      if (props.hotspotType === 'scene') {
        activeTab.value = 'direction';
      } else if (['info', 'image', 'video', 'link'].includes(props.hotspotType)) {
        activeTab.value = 'media';
      } else {
        activeTab.value = 'all';
      }
      loadIcons();
    }
  },
  { immediate: true },
);

/** 过滤后的图标列表 */
const filteredIcons = computed(() => {
  let list = icons.value;
  if (activeTab.value !== 'all' && activeTab.value !== 'custom') {
    list = list.filter((item) => item.category === activeTab.value);
  }
  const kw = searchKeyword.value.trim().toLowerCase();
  if (kw) {
    list = list.filter(
      (item) =>
        (item.label && item.label.toLowerCase().includes(kw)) ||
        (item.key && item.key.toLowerCase().includes(kw)) ||
        (item.category_label && item.category_label.toLowerCase().includes(kw)),
    );
  }
  return list;
});

/** 当前选中的图标对象信息 */
const currentMatchedItem = computed(() => {
  const cur = selectedIcon.value;
  if (!cur) return null;
  return icons.value.find(
    (item) =>
      item.key === cur ||
      item.path === cur ||
      item.url === cur ||
      (item.aliases && item.aliases.includes(cur)),
  );
});

function isSelected(item) {
  const cur = selectedIcon.value;
  if (!cur) return false;
  return (
    item.key === cur ||
    item.path === cur ||
    item.url === cur ||
    (item.aliases && item.aliases.includes(cur))
  );
}

function handlePick(item) {
  selectedIcon.value = item.path || item.key;
}

function handleClearDefault() {
  selectedIcon.value = '';
}

async function handleCustomUpload(e) {
  const files = e.target?.files;
  if (!files || !files.length) return;
  const file = files[0];
  uploading.value = true;
  try {
    const res = await upload(file, { scene: 'panorama' });
    const url = typeof res === 'string' ? res : (res?.[0] ?? '');
    if (url) {
      selectedIcon.value = url;
      message.success('自定义图标上传成功');
    }
  } catch (error) {
    console.error('[hotspot-icon-picker] upload failed:', error);
    message.error('上传失败');
  } finally {
    uploading.value = false;
    e.target.value = '';
  }
}

function handleConfirm() {
  emit('update:modelValue', selectedIcon.value);
  emit('select', {
    icon: selectedIcon.value,
    meta: currentMatchedItem.value,
  });
  emit('update:open', false);
}

function handleCancel() {
  emit('update:open', false);
}
</script>

<template>
  <Modal
    :open="open"
    title="选择热点图标"
    width="860px"
    :body-style="{ padding: '16px 20px', maxHeight: '72vh', overflowY: 'auto' }"
    @ok="handleConfirm"
    @cancel="handleCancel"
  >
    <div class="icon-picker-container">
      <!-- 顶部控制条：分类 Tab + 搜索框 + 恢复默认 -->
      <div class="icon-picker-header">
        <Tabs v-model:activeKey="activeTab" size="small" class="icon-picker-tabs">
          <Tabs.TabPane
            v-for="cat in CATEGORIES"
            :key="cat.key"
            :tab="cat.label"
          />
        </Tabs>

        <div class="icon-picker-actions">
          <Input.Search
            v-if="activeTab !== 'custom'"
            v-model:value="searchKeyword"
            placeholder="搜索图标名称/关键词..."
            allow-clear
            size="small"
            style="width: 200px"
          />
          <Button
            size="small"
            :type="selectedIcon === '' ? 'primary' : 'default'"
            ghost
            class="ml-2"
            @click="handleClearDefault"
          >
            ● 默认圆点标记
          </Button>
        </div>
      </div>

      <!-- 当前选中摘要提示条 -->
      <div class="icon-picker-preview-bar">
        <span class="text-xs text-gray-500 mr-2">当前选择：</span>
        <template v-if="!selectedIcon">
          <Tag color="default">默认圆点（无自定义图标）</Tag>
        </template>
        <template v-else-if="currentMatchedItem">
          <div class="flex items-center gap-2">
            <span
              class="icon-preview-mini"
              :style="{ backgroundImage: `url(${currentMatchedItem.thumb_url || currentMatchedItem.url})` }"
            ></span>
            <span class="text-xs font-medium text-gray-800">{{ currentMatchedItem.label }}</span>
            <Tag color="blue" class="text-xs">{{ currentMatchedItem.category_label }}</Tag>
            <Tag v-if="currentMatchedItem.animated" color="green" class="text-xs">
              动态雪碧图 ({{ currentMatchedItem.frames }}帧)
            </Tag>
          </div>
        </template>
        <template v-else>
          <div class="flex items-center gap-2">
            <span
              class="icon-preview-mini"
              :style="{ backgroundImage: `url(${selectedIcon})` }"
            ></span>
            <span class="text-xs text-gray-800">自定义上传图标</span>
          </div>
        </template>
      </div>

      <!-- 内容区 -->
      <Spin :spinning="loading || uploading">
        <!-- 自定义上传面板 -->
        <div v-if="activeTab === 'custom'" class="custom-upload-panel">
          <div class="upload-dropzone">
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif"
              class="hidden"
              id="hotspot-custom-icon-file"
              @change="handleCustomUpload"
            />
            <label for="hotspot-custom-icon-file" class="upload-label">
              <Icon icon="lucide:folder-up" class="text-3xl text-blue-500 mb-2" />
              <span class="upload-title">点击选择图片或拖拽上传</span>
              <span class="upload-tip">建议尺寸 80×80 ~ 128×128 的透明底 PNG，文件自动归一至素材库</span>
            </label>
          </div>

          <div v-if="selectedIcon && !currentMatchedItem" class="mt-4 p-3 bg-gray-50 rounded flex items-center gap-3">
            <img :src="selectedIcon" class="w-12 h-12 rounded object-contain border bg-white" alt="自定义图标" />
            <div>
              <p class="text-xs font-semibold text-gray-800 mb-0">已选用自定义图标</p>
              <p class="text-xs text-gray-500 mb-0 break-all">{{ selectedIcon }}</p>
            </div>
          </div>
        </div>

        <!-- 预设图标网格 -->
        <div v-else class="icon-grid-wrap">
          <div v-if="!filteredIcons.length" class="py-12 text-center">
            <Empty description="未找到符合条件的图标" />
          </div>

          <div v-else class="icon-grid">
            <div
              v-for="item in filteredIcons"
              :key="item.key"
              class="icon-card"
              :class="{ 'is-active': isSelected(item) }"
              @click="handlePick(item)"
            >
              <div class="icon-card-visual">
                <!-- 静态或动画展示 -->
                <span
                  class="icon-card-thumb"
                  :class="{ 'is-animated': item.animated }"
                  :style="{
                    backgroundImage: `url(${item.thumb_url || item.url})`,
                    backgroundSize: item.animated ? `100% ${item.frames * 100}%` : 'contain',
                    '--anim-frames': item.frames || 25,
                  }"
                ></span>
                <span v-if="item.animated" class="anim-badge">动效</span>
              </div>
              <div class="icon-card-info">
                <span class="icon-card-name" :title="item.label">{{ item.label }}</span>
              </div>
              <span v-if="isSelected(item)" class="icon-card-check"><Icon icon="lucide:check" class="text-xs" /></span>
            </div>
          </div>
        </div>
      </Spin>
    </div>
  </Modal>
</template>

<style scoped>
.icon-picker-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.icon-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  border-bottom: 1px solid #f0f0f0;
  padding-bottom: 4px;
}

.icon-picker-tabs {
  margin-bottom: 0;
}

.icon-picker-actions {
  display: flex;
  align-items: center;
}

.icon-picker-preview-bar {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  min-height: 40px;
}

.icon-preview-mini {
  display: inline-block;
  width: 24px;
  height: 24px;
  background-position: center;
  background-size: contain;
  background-repeat: no-repeat;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  background-color: #fff;
}

.icon-grid-wrap {
  min-height: 320px;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 12px;
  padding: 6px 2px;
}

.icon-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 6px 8px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.icon-card:hover {
  border-color: #3b82f6;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.12);
  transform: translateY(-2px);
}

.icon-card.is-active {
  border-color: #2563eb;
  background-color: #eff6ff;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}

.icon-card-visual {
  position: relative;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
}

.icon-card-thumb {
  width: 44px;
  height: 44px;
  background-position: center;
  background-size: contain;
  background-repeat: no-repeat;
  transition: transform 0.2s;
}

.icon-card:hover .icon-card-thumb {
  transform: scale(1.08);
}

.icon-card:hover .icon-card-thumb.is-animated {
  animation: card-sprite-play 1.2s steps(var(--anim-frames, 25)) infinite;
}

@keyframes card-sprite-play {
  from { background-position: 0 0; }
  to { background-position: 0 calc(-44px * var(--anim-frames, 25)); }
}

.anim-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  font-size: 10px;
  line-height: 14px;
  padding: 0 4px;
  background: rgba(16, 185, 129, 0.9);
  color: #fff;
  border-radius: 4px;
  pointer-events: none;
}

.icon-card-info {
  width: 100%;
  text-align: center;
}

.icon-card-name {
  display: block;
  font-size: 11px;
  line-height: 16px;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.icon-card.is-active .icon-card-name {
  color: #1d4ed8;
  font-weight: 600;
}

.icon-card-check {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 16px;
  height: 16px;
  background: #2563eb;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  border-radius: 50%;
}

.custom-upload-panel {
  padding: 20px 0;
}

.upload-dropzone {
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  padding: 32px 16px;
  text-align: center;
  background: #f8fafc;
  transition: border-color 0.2s;
}

.upload-dropzone:hover {
  border-color: #3b82f6;
}

.upload-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
}

.upload-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.upload-title {
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
  margin-bottom: 4px;
}

.upload-tip {
  font-size: 12px;
  color: #64748b;
}
</style>
