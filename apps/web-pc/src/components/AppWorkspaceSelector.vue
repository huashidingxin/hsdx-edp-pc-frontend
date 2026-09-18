<script lang="ts" setup>
import type { ApplicationItem } from '#/store/current-app';

import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { IconifyIcon as Icon } from '@vben/icons';

import {
  Button,
  Divider,
  Empty,
  Input,
  message,
  Popover,
  Spin,
  Tag,
} from 'antdv-next';

import { useCurrentAppStore } from '#/store/current-app';

defineOptions({ name: 'AppWorkspaceSelector' });

const currentAppStore = useCurrentAppStore();
const router = useRouter();
const route = useRoute();

const popoverOpen = ref(false);
const keyword = ref('');
const loading = ref(false);

const typeConfig: Record<number, { color: string; icon: string; label: string }> = {
  1: { label: '官网', color: '#1677ff', icon: 'lucide:globe' },
  2: { label: '小程序', color: '#52c41a', icon: 'lucide:smartphone' },
  3: { label: '公众号/H5', color: '#722ed1', icon: 'lucide:layout' },
};

function getTypeMeta(type?: number) {
  return (
    typeConfig[type ?? 1] || {
      label: '应用',
      color: '#fa8c16',
      icon: 'lucide:box',
    }
  );
}

const currentApp = computed(() => currentAppStore.currentApp);

const currentTypeMeta = computed(() => getTypeMeta(currentApp.value?.type));

const filteredApplications = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return currentAppStore.applications;
  return currentAppStore.applications.filter(
    (app) =>
      app.name?.toLowerCase().includes(kw) ||
      app.code?.toLowerCase().includes(kw),
  );
});

async function refreshApps() {
  loading.value = true;
  try {
    await currentAppStore.loadApplications(true);
  } finally {
    loading.value = false;
  }
}

function handleSelect(app: ApplicationItem) {
  if (currentAppStore.currentAppId === app.id) {
    popoverOpen.value = false;
    return;
  }
  currentAppStore.selectApp(app.id);
  popoverOpen.value = false;
  message.success(`已切换应用：${app.name}`);

  // 如果当前在应用私有页面（页面、菜单、设置、词条），重新导航或触发就地刷新
  const appBoundPaths = [
    '/site/pages',
    '/config/menus',
    '/config/settings',
    '/config/ui-strings',
  ];
  if (appBoundPaths.some((p) => route.path.startsWith(p))) {
    router.replace({ path: route.path, query: { ...route.query, _t: Date.now() } });
  }
}

function primaryHost(app: ApplicationItem) {
  const domains = app?.domains || [];
  return (
    domains.find((d) => d?.is_primary)?.host ||
    domains[0]?.host ||
    (app.type === 2 ? '微信小程序' : '暂未绑定域名')
  );
}

function goToAppCenter() {
  popoverOpen.value = false;
  router.push('/site/applications');
}

onMounted(() => {
  currentAppStore.initContext().catch(() => {});
});
</script>

<template>
  <div class="app-workspace-selector">
    <Popover
      v-model:open="popoverOpen"
      trigger="click"
      placement="bottomLeft"
      :destroy-on-hidden="false"
      overlay-class-name="workspace-popover"
    >
      <div class="selector-trigger" :class="{ 'is-open': popoverOpen }">
        <div
          class="app-badge-icon"
          :style="{ background: currentTypeMeta.color }"
        >
          <Icon :icon="currentTypeMeta.icon" class="text-white text-sm" />
        </div>
        <div class="app-info">
          <span class="app-name">
            {{ currentApp?.name || '选择工作区应用' }}
          </span>
          <span
            class="app-type-tag"
            :style="{
              color: currentTypeMeta.color,
              background: currentTypeMeta.color + '18',
            }"
          >
            {{ currentTypeMeta.label }}
          </span>
        </div>
        <Icon
          icon="lucide:chevrons-up-down"
          class="trigger-chevron"
          :class="{ 'is-rotated': popoverOpen }"
        />
      </div>

      <template #content>
        <div class="popover-container">
          <div class="popover-header">
            <div class="header-title">
              <span>当前租户应用</span>
              <span class="header-count">
                ({{ currentAppStore.applications.length }})
              </span>
              <Button
                type="text"
                size="small"
                class="refresh-btn"
                :loading="loading"
                title="刷新应用列表"
                @click.stop="refreshApps"
              >
                <template #icon>
                  <Icon icon="lucide:rotate-cw" class="text-xs text-gray-400 hover:text-blue-500" />
                </template>
              </Button>
            </div>
            <Button
              type="link"
              size="small"
              class="header-link"
              @click="goToAppCenter"
            >
              应用看板
              <Icon icon="lucide:arrow-right" class="ml-1 text-xs" />
            </Button>
          </div>

          <div class="search-box">
            <Input
              v-model:value="keyword"
              allow-clear
              size="small"
              placeholder="搜索应用名称或编码..."
            >
              <template #prefix>
                <Icon icon="lucide:search" class="text-gray-400 text-xs" />
              </template>
            </Input>
          </div>

          <Spin :spinning="loading" size="small">
            <div class="apps-list">
              <template v-if="filteredApplications.length">
                <div
                  v-for="item in filteredApplications"
                  :key="item.id"
                  class="app-item"
                  :class="{ 'is-active': currentAppStore.currentAppId === item.id }"
                  @click="handleSelect(item)"
                >
                  <div
                    class="item-icon"
                    :style="{ background: getTypeMeta(item.type).color }"
                  >
                    <Icon
                      :icon="getTypeMeta(item.type).icon"
                      class="text-white text-sm"
                    />
                  </div>
                  <div class="item-body">
                    <div class="item-title-row">
                      <span class="item-name">{{ item.name }}</span>
                      <span
                        class="item-type-badge"
                        :style="{
                          color: getTypeMeta(item.type).color,
                          background: getTypeMeta(item.type).color + '15',
                        }"
                      >
                        {{ getTypeMeta(item.type).label }}
                      </span>
                    </div>
                    <div class="item-host-row">
                      <span class="item-host">{{ primaryHost(item) }}</span>
                      <Tag
                        size="small"
                        :color="item.status === 1 ? 'success' : 'default'"
                        class="status-tag"
                      >
                        {{ item.status === 1 ? '已启用' : '草稿' }}
                      </Tag>
                    </div>
                  </div>
                  <Icon
                    v-if="currentAppStore.currentAppId === item.id"
                    icon="lucide:check"
                    class="active-check"
                  />
                </div>
              </template>
              <Empty
                v-else
                :description="keyword ? '无匹配应用' : '暂无应用'"
                :image="Empty.PRESENTED_IMAGE_SIMPLE"
                class="my-4"
              />
            </div>
          </Spin>

          <Divider style="margin: 8px 0" />

          <div class="popover-footer">
            <Button
              type="dashed"
              size="small"
              block
              class="footer-btn"
              @click="goToAppCenter"
            >
              <Icon icon="lucide:plus" class="mr-1" />
              新建或管理应用
            </Button>
          </div>
        </div>
      </template>
    </Popover>
  </div>
</template>

<style scoped>
.app-workspace-selector {
  display: inline-flex;
  align-items: center;
}

.selector-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.06);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.selector-trigger:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.12);
}

.selector-trigger.is-open {
  background: rgba(22, 119, 255, 0.08);
  border-color: #1677ff;
}

.app-badge-icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-info {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 200px;
}

.app-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-type-tag {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.trigger-chevron {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  transition: transform 0.2s;
  margin-left: 2px;
}

.trigger-chevron.is-rotated {
  transform: rotate(180deg);
}
</style>

<style>
.workspace-popover .ant-popover-inner {
  padding: 0 !important;
  border-radius: 10px !important;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12) !important;
}

.popover-container {
  width: 320px;
  max-width: calc(100vw - 32px);
  padding: 8px 10px;
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 8px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.85);
}

.header-count {
  font-size: 12px;
  font-weight: normal;
  color: rgba(0, 0, 0, 0.45);
}

.refresh-btn {
  padding: 0 !important;
  width: 20px !important;
  height: 20px !important;
  min-width: 20px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 4px;
}

.header-link {
  font-size: 12px;
  padding: 0 4px;
  height: 22px;
  display: inline-flex;
  align-items: center;
}

.search-box {
  padding: 0 4px 8px;
}

.apps-list {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.app-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
  position: relative;
}

.app-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.app-item.is-active {
  background: rgba(22, 119, 255, 0.08);
}

.app-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background: #1677ff;
  border-radius: 2px;
}

.item-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-type-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 0 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

.item-host-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.item-host {
  color: rgba(0, 0, 0, 0.45);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.status-tag {
  font-size: 10px;
  line-height: 16px;
  padding: 0 4px;
  margin: 0;
  flex-shrink: 0;
}

.active-check {
  font-size: 16px;
  color: #1677ff;
  flex-shrink: 0;
  margin-left: 4px;
}

.footer-btn {
  font-size: 12px;
  height: 28px;
  border-radius: 6px;
}
</style>
