<script lang="ts" setup>
import type { ProjectItem } from '#/store/app';

import { computed, ref, watch } from 'vue';

import { IconifyIcon as Icon } from '@vben/icons';

import { Empty, Input, message, Pagination, Popover, Spin } from 'antdv-next';

import { useUserStore } from '@vben/stores';

import { useAppStore } from '#/store/app';

defineOptions({ name: 'AppProject' });

const props = defineProps<{ modelValue?: boolean }>();

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const appStore = useAppStore();
const userStore = useUserStore();

// 仅管理员允许切换“全部项目”跨项目访问
const isAdmin = computed(() => !!userStore.userInfo?.is_admin);

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
  // 必须强制刷新：lastLoadedKey 会缓存「页码|关键词」，重复输入相同关键词
  // （或上次请求失败后重试）时非强制调用会被缓存拦截而不发请求，
  // 导致输入后列表不更新。竞态由 reqSeq 序号守卫，旧响应不会覆盖新结果。
  searchTimer = setTimeout(() => loadPage(1, true), 300);
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

const currentProjectId = computed(() => appStore.defaultProject?.id);

// 所有项目只用于聚合统计展示，绝不写入 defaultProject，也不参与权限/业务切换。
const allProject = computed<ProjectItem>(() => {
  const totals: Record<string, Record<string, number>> = {};
  for (const project of appStore.projects || []) {
    for (const type of statTypes) {
      const source = getNestedValue(project, type.dataPath);
      if (!source) continue;
      const bucket = totals[type.dataPath] || (totals[type.dataPath] = {});
      for (const item of type.items) {
        bucket[item.key] =
          (bucket[item.key] || 0) + Number(source[item.key] || 0);
      }
    }
  }
  return { id: undefined, name: '所有项目', ...totals };
});

const showAllCard = computed(
  () => !searchMode.value && (appStore.projects.length > 1 || total.value > 1),
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

// 统计相关
interface StatType {
  key: string;
  title: string;
  icon: string;
  dataPath: string;
  items: {
    color: string;
    key: string;
    label: string;
    value?: number;
  }[];
}

const statTypes: StatType[] = [
  {
    key: 'supervision_log',
    title: '日志',
    icon: 'lucide:file-text',
    dataPath: 'supervision_log_stats',
    items: [
      { key: 'team_today_submitted', label: '今日已提交', color: '#52c41a' },
      { key: 'team_tobe_submit', label: '待提交', color: '#faad14' },
      { key: 'team_timeout', label: '逾期', color: '#ff4d4f' },
    ],
  },
  {
    key: 'task',
    title: '任务',
    icon: 'lucide:check-circle',
    dataPath: 'task_stats',
    items: [
      { key: 'team_today_log_submitted', label: '今日已提交', color: '#52c41a' },
      { key: 'team_log_tobe_submit', label: '待提交', color: '#faad14' },
      { key: 'team_log_timeout', label: '逾期', color: '#ff4d4f' },
    ],
  },
  {
    key: 'pending_supplement',
    title: '待补任务',
    icon: 'lucide:clock',
    dataPath: 'pending_supplement_stats',
    items: [
      { key: 'prereq_pending', label: '前置待补', color: '#faad14' },
      { key: 'log_warning', label: '日志待补', color: '#ff4d4f' },
    ],
  },
  {
    key: 'nonconformance',
    title: '不符合项',
    icon: 'lucide:shield-alert',
    dataPath: 'nonconformance_stats',
    items: [
      { key: 'pending', label: '待整改', color: '#faad14' },
      { key: 'processing', label: '整改中', color: '#f97316' },
      { key: 'pending_review', label: '待复查', color: '#ba68c8' },
      { key: 'team_tobe_audit', label: '待审核', color: '#ff4d4f' },
    ],
  },
  {
    key: 'tool_inspection',
    title: '工具待检',
    icon: 'lucide:wrench',
    dataPath: 'tool_stats',
    items: [
      { key: 'near_due', label: '临期', color: '#faad14' },
      { key: 'overdue', label: '逾期', color: '#ff4d4f' },
    ],
  },
];

function getNestedValue(obj: any, path: string): any {
  let cur = obj;
  for (const key of path.split('.')) cur = cur?.[key];
  return cur;
}

function getProjectStats(project: any): StatType[] {
  return statTypes
    .map((type) => {
      const data = getNestedValue(project, type.dataPath);
      if (!data) return null;
      const items = type.items
        .map((item) => ({
          ...item,
          value: getNestedValue(project, `${type.dataPath}.${item.key}`) || 0,
        }))
        .filter((item) => item.value > 0);
      if (items.length === 0) return null;
      return { ...type, items };
    })
    .filter(Boolean) as StatType[];
}

const projectName = computed(() =>
  appStore.isAllProjects
    ? '全部项目'
    : (appStore.defaultProject?.name || '未选择项目'),
);

async function setDefault(project: ProjectItem) {
  if (!project?.id) {
    message.warning('项目相关功能必须指定具体项目');
    return;
  }
  if (appStore.defaultProject?.id === project.id) {
    popoverOpen.value = false;
    return;
  }
  popoverOpen.value = false;
  try {
    await appStore.switchProject(project);
    message.success(`已切换至项目：${project.name || '当前项目'}`);
  } catch (error) {
    console.error(error);
    message.error('切换项目失败，请重试');
  }
}

/** 管理员切换为“全部项目”模式：列表查询忽略全局项目过滤 */
async function setAllProjects() {
  if (appStore.isAllProjects) {
    popoverOpen.value = false;
    return;
  }
  popoverOpen.value = false;
  try {
    await appStore.switchAllProjects();
    message.success('已切换至全部项目');
  } catch (error) {
    console.error(error);
    message.error('切换失败，请重试');
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
              <div v-if="pageList.length || showAllCard" class="project-list-inner">
                <!-- 所有项目：统计展示；管理员可点击切换为“全部项目”跨项目访问 -->
                <div
                  v-if="showAllCard"
                  class="project-item is-all"
                  :class="{ 'is-current': appStore.isAllProjects }"
                  :style="isAdmin ? 'cursor: pointer;' : ''"
                  @click="isAdmin && setAllProjects()"
                >
                  <div class="item-avatar item-avatar--all">
                    <Icon icon="lucide:layout-grid" />
                  </div>
                  <div class="item-content">
                    <div class="item-header">
                      <span class="item-name item-name--all">全部项目</span>
                      <span class="item-disabled-badge">
                        {{ isAdmin ? (appStore.isAllProjects ? '当前' : '点击切换') : '仅统计 · 不可切换' }}
                      </span>
                      <Icon
                        v-if="appStore.isAllProjects"
                        icon="lucide:check"
                        class="item-check"
                      />
                    </div>
                    <div v-if="getProjectStats(allProject).length" class="item-stats">
                      <div
                        v-for="stat in getProjectStats(allProject)"
                        :key="stat.key"
                        class="stat-group"
                      >
                        <div class="stat-group-title">
                          <Icon :icon="stat.icon" class="stat-group-icon" />
                          <span>{{ stat.title }}</span>
                        </div>
                        <div class="stat-group-chips">
                          <div v-for="d in stat.items" :key="d.key" class="stat-chip">
                            <span class="stat-value" :style="{ color: d.color }">{{ d.value }}</span>
                            <span class="stat-label">{{ d.label }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 项目列表 -->
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
                    <div class="item-header">
                      <span class="item-name">{{ item.name }}</span>
                      <Icon
                        v-if="currentProjectId === item.id"
                        icon="lucide:check"
                        class="item-check"
                      />
                    </div>
                    <div class="item-meta">
                      <span v-if="item.code" class="item-code">{{
                        item.code
                      }}</span>
                      <span
                        v-if="item.roles?.length"
                        class="item-role"
                      >{{ roleText(item.roles[0]) }}</span>
                    </div>
                    <!-- 统计 -->
                    <div
                      v-if="getProjectStats(item).length"
                      class="item-stats"
                    >
                      <div
                        v-for="stat in getProjectStats(item)"
                        :key="stat.key"
                        class="stat-group"
                      >
                        <div class="stat-group-title">
                          <Icon :icon="stat.icon" class="stat-group-icon" />
                          <span>{{ stat.title }}</span>
                        </div>
                        <div class="stat-group-chips">
                          <div v-for="d in stat.items" :key="d.key" class="stat-chip">
                            <span class="stat-value" :style="{ color: d.color }">{{ d.value }}</span>
                            <span class="stat-label">{{ d.label }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
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
  width: 360px;
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
  max-height: 400px;
  overflow-y: auto;
}

.project-list {
  padding: 6px 0;
}

.project-list-inner {
  display: flex;
  flex-direction: column;
}

.project-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.project-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.project-item.is-all {
  background: #f8fafc;
  cursor: default;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.project-item.is-all:hover {
  background: #f8fafc;
}

.item-avatar--all {
  background: linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%);
}

.item-name--all {
  color: rgba(0, 0, 0, 0.55);
}

.item-disabled-badge {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background: #eef2f7;
  color: rgba(0, 0, 0, 0.42);
  font-size: 11px;
}

.project-item.is-current {
  background: rgba(22, 119, 255, 0.05);
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

.item-avatar {
  width: 38px;
  height: 38px;
  border-radius: 10px;
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
  gap: 4px;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  padding: 1px 5px;
  border-radius: 3px;
}

.item-role {
  font-size: 12px;
  color: #1677ff;
}

.item-check {
  font-size: 14px;
  color: #1677ff;
  flex-shrink: 0;
  margin-left: auto;
}

.item-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 2px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 6px;
}

.stat-group {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.stat-group-title {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  min-width: 60px;
  padding-top: 2px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.5);
}

.stat-group-icon {
  font-size: 12px;
}

.stat-group-chips {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 4px 12px;
  min-width: 0;
}

.stat-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  font-size: 12px;
}

.stat-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  color: rgba(0, 0, 0, 0.45);
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
