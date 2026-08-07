<script lang="ts" setup>
import type { ProjectItem } from '#/store/app';

import { computed, ref, watch } from 'vue';

import { IconifyIcon as Icon } from '@vben/icons';

import { Empty, Input, message, Pagination, Popover, Spin } from 'antdv-next';

import { useAppStore } from '#/store/app';

defineOptions({ name: 'AppProject' });

const props = defineProps<{ modelValue?: boolean }>();

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const appStore = useAppStore();

const popoverOpen = ref(false);
const keyword = ref('');

watch(
  () => props.modelValue,
  (v) => {
    if (v !== undefined) popoverOpen.value = v;
  },
  { immediate: true },
);

watch(popoverOpen, (v) => {
  emit('update:modelValue', v);
  if (v) {
    keyword.value = '';
    loadPage(1, true);
    if (!appStore.projects?.length) {
      appStore.getProjects('all').catch(() => {});
    }
  } else if (searchTimer) {
    clearTimeout(searchTimer);
  }
});

const perPage = 8;
const page = ref(1);
const total = ref(0);
const pageList = ref<ProjectItem[]>([]);
const loading = ref(false);
let reqSeq = 0;
let lastLoadedKey = '';
let searchTimer: null | ReturnType<typeof setTimeout> = null;

const searchMode = computed(() => !!keyword.value.trim());

function queryKey(p: number, kw: string) {
  return `${p}|${kw}`;
}

async function loadPage(p: number, force = false) {
  const kw = keyword.value.trim();
  const key = queryKey(p, kw);
  if (!force && lastLoadedKey === key) return;
  lastLoadedKey = key;
  const seq = ++reqSeq;
  loading.value = true;
  try {
    const res = await appStore.getProjectsPaged({
      page: p,
      per_page: perPage,
      keyword: kw,
    });
    if (seq !== reqSeq) return;
    pageList.value = res?.data || [];
    total.value = res?.meta?.total ?? 0;
    page.value = p;
  } catch (error) {
    console.error(error);
    if (seq === reqSeq) pageList.value = [];
    message.error('项目加载失败，请重试');
  } finally {
    if (seq === reqSeq) loading.value = false;
  }
}

watch(keyword, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadPage(1), 300);
});

function onSearchEnter() {
  if (searchTimer) clearTimeout(searchTimer);
  loadPage(1, true);
}

function handlePageChange(p: number) {
  if (p === page.value) return;
  if (searchTimer) clearTimeout(searchTimer);
  loadPage(p, true);
}

const allProject = ref<ProjectItem>({ id: undefined, name: '所有项目' });

const currentProjectId = computed(() => appStore.defaultProject?.id);

const showAllCard = computed(
  () => !searchMode.value && (appStore.projects.length > 1 || total.value > 1),
);

const displayList = computed<ProjectItem[]>(() =>
  searchMode.value
    ? pageList.value
    : [...(showAllCard.value ? [allProject.value] : []), ...pageList.value],
);

const emptyStateText = computed(() =>
  searchMode.value ? '未找到符合条件的项目' : '暂未加入任何项目',
);

function roleText(role: any): string {
  if (!role) return '';
  if (typeof role === 'string') return role;
  return role.display_name || role.name || '';
}

function getAvatarColor(id?: number | string): string {
  const colors = [
    '#1677ff',
    '#722ed1',
    '#13c2c2',
    '#52c41a',
    '#fa8c16',
    '#eb2f96',
    '#2f54eb',
    '#fa541c',
  ];
  const s = String(id ?? '');
  let h = 0;
  for (const ch of s) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 1e9;
  return colors[h % colors.length] || '#1677ff';
}

const projectName = computed(() => {
  const name = appStore.defaultProject?.name;
  if (name && name !== '所有项目') return name;
  return appStore.projects.length > 1 ? '所有项目' : projectEmptyLabel();
});

function projectEmptyLabel() {
  if (appStore.projects.length === 0) return '未选择项目';
  return '所有项目';
}

async function setDefault(project: ProjectItem) {
  if (
    appStore.defaultProject?.id === project?.id &&
    !!appStore.defaultProject?.id === !!project?.id
  ) {
    popoverOpen.value = false;
    return;
  }
  popoverOpen.value = false;
  const name = project?.name ?? '所有项目';
  try {
    await appStore.switchProject(project);
    message.success(`已切换至项目：${name}`);
  } catch (error) {
    console.error(error);
    message.error('切换项目失败，请重试');
  }
}
</script>

<template>
  <div class="app-project">
    <Popover
      v-model:open="popoverOpen"
      trigger="click"
      placement="bottomLeft"
      :destroy-on-hidden="true"
    >
      <div class="project-trigger" :class="{ 'is-active': popoverOpen }">
        <span class="trigger-text">{{ projectName }}</span>
        <Icon
          icon="lucide:chevron-down"
          class="trigger-chevron"
          :class="{ 'is-open': popoverOpen }"
        />
      </div>

      <template #content>
        <div class="project-popover">
          <div class="popover-search">
            <Input
              v-model:value="keyword"
              allow-clear
              size="small"
              placeholder="搜索项目..."
              @keyup.enter="onSearchEnter"
            >
              <template #prefix>
                <Icon icon="lucide:search" class="search-icon" />
              </template>
            </Input>
          </div>

          <Spin :spinning="loading" size="small" class="popover-list">
            <div class="project-list">
              <div v-if="displayList.length" class="project-list-inner">
                <div
                  v-if="showAllCard"
                  class="project-item"
                  :class="{ 'is-current': !currentProjectId }"
                  @click="setDefault(allProject)"
                >
                  <Icon icon="lucide:layout-grid" class="item-icon" />
                  <div class="item-content">
                    <span class="item-name">所有项目</span>
                    <span class="item-desc">全部项目统计概览</span>
                  </div>
                </div>

                <div
                  v-for="item in pageList"
                  :key="String(item.id)"
                  class="project-item"
                  :class="{ 'is-current': currentProjectId === item.id }"
                  @click="setDefault(item)"
                >
                  <div
                    class="item-avatar"
                    :style="{ background: getAvatarColor(item.id) }"
                  >
                    {{ item.name?.[0] || 'P' }}
                  </div>
                  <div class="item-content">
                    <span class="item-name">{{ item.name }}</span>
                    <div class="item-meta">
                      <span v-if="item.code" class="item-code">{{
                        item.code
                      }}</span>
                      <span
                        v-if="item.roles?.length"
                        class="item-role"
                      >{{ roleText(item.roles[0]) }}</span>
                    </div>
                  </div>
                  <Icon
                    v-if="currentProjectId === item.id"
                    icon="lucide:check"
                    class="item-check"
                  />
                </div>
              </div>

              <Empty
                v-else-if="!loading"
                :description="emptyStateText"
                :image="Empty.PRESENTED_IMAGE_SIMPLE"
                class="empty-state"
              />
            </div>
          </Spin>

          <div v-if="total > perPage" class="popover-pagination">
            <Pagination
              size="small"
              :current="page"
              :total="total"
              :page-size="perPage"
              :show-size-changer="false"
              simple
              @change="handlePageChange"
            />
          </div>
        </div>
      </template>
    </Popover>
  </div>
</template>

<style scoped>
.app-project {
  display: inline-flex;
  align-items: center;
}

.project-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  background: transparent;
}

.project-trigger:hover {
  background: rgba(0, 0, 0, 0.04);
}

.project-trigger.is-active {
  background: rgba(0, 0, 0, 0.06);
}

.trigger-text {
  font-size: 14px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.85);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-chevron {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  transition: transform 0.2s;
}

.trigger-chevron.is-open {
  transform: rotate(180deg);
}
</style>

<style>
.project-popover {
  width: 320px;
  max-width: calc(100vw - 32px);
}

.popover-search {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.search-icon {
  font-size: 14px;
  color: rgba(0, 0, 0, 0.35);
}

.popover-list {
  max-height: 320px;
  overflow-y: auto;
}

.project-list {
  padding: 4px 0;
}

.project-list-inner {
  display: flex;
  flex-direction: column;
}

.project-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.project-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.project-item.is-current {
  background: rgba(22, 119, 255, 0.06);
}

.project-item.is-current::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  background: #1677ff;
  border-radius: 2px;
}

.item-icon {
  font-size: 18px;
  color: #1677ff;
  flex-shrink: 0;
}

.item-avatar {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-desc {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-code {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 4px;
  border-radius: 3px;
}

.item-role {
  font-size: 12px;
  color: #1677ff;
}

.item-check {
  font-size: 16px;
  color: #1677ff;
  flex-shrink: 0;
}

.empty-state {
  padding: 40px 0;
}

.popover-pagination {
  padding: 8px 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  justify-content: center;
}
</style>
