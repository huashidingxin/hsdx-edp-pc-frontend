<script lang="ts" setup>
import type { ProjectItem } from '#/store/app';

import { computed, ref, watch } from 'vue';

import {
  IconifyIcon as Icon,
} from '@vben/icons';

import {
  Avatar,
  Badge,
  Button,
  Empty,
  Input,
  message,
  Pagination,
  Popover,
  Spin,
  Tag,
} from 'antdv-next';

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
    // 每次打开回到第一页、清空搜索
    keyword.value = '';
    loadPage(1, true);
    // 冷启动兜底：仅当 store 从未加载全量时补一次（用于“所有项目”聚合与默认项目回退）
    if (!appStore.projects?.length) {
      appStore.getProjects('all').catch(() => {});
    }
  } else if (searchTimer) {
    // 关闭时清掉未决的搜索防抖，避免弹层隐藏后仍触发请求
    clearTimeout(searchTimer);
  }
});

// ---------------- 服务端分页 + 联网搜索 ----------------
const perPage = 6;
const page = ref(1);
const total = ref(0);
const pageList = ref<ProjectItem[]>([]);
const loading = ref(false);
let reqSeq = 0; // 请求序号，丢弃过期响应（快速输入/翻页时避免串数据）
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

// 输入防抖 → 服务端搜索
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
  if (searchTimer) clearTimeout(searchTimer); // 未决的搜索防抖不抢占翻页
  loadPage(p, true);
}

// ---------------- 统计汇总 ----------------
interface DefaultStatItem {
  key: string;
  label: string;
  color: string;
}
interface DefaultType {
  key: string;
  title: string;
  icon: string;
  dataPath: string;
  data: DefaultStatItem[];
}

const defaultTypes: DefaultType[] = [
  {
    key: 'supervision_log',
    title: '监理日志',
    icon: 'ant-design:file-text-outlined',
    dataPath: 'supervision_log_stats',
    data: [
      { key: 'team_submitted', label: '已提交', color: 'green' },
      { key: 'team_tobe_submit', label: '待提交', color: 'gold' },
      { key: 'team_timeout', label: '已逾期', color: 'red' },
    ],
  },
  {
    key: 'task',
    title: '任务记录',
    icon: 'ant-design:check-circle-outlined',
    dataPath: 'task_log_stats',
    data: [
      { key: 'team_submitted', label: '已提交', color: 'green' },
      { key: 'team_tobe_submit', label: '待提交', color: 'gold' },
      { key: 'team_timeout', label: '已逾期', color: 'red' },
    ],
  },
  {
    key: 'nonconformance',
    title: '不符合项',
    icon: 'ant-design:warning-outlined',
    dataPath: 'nonconformance_stats',
    data: [
      { key: 'team_pending', label: '待处理', color: 'gold' },
      { key: 'team_processing', label: '处理中', color: 'blue' },
    ],
  },
  {
    key: 'tool_inspection',
    title: '工具待检',
    icon: 'ant-design:tool-outlined',
    dataPath: 'tool_stats',
    data: [
      { key: 'team_near_due', label: '临期', color: 'blue' },
      { key: 'team_overdue', label: '已逾期', color: 'red' },
    ],
  },
];

function getNestedValue(obj: any, path: string): any {
  let cur = obj;
  for (const key of path.split('.')) cur = cur?.[key];
  return cur;
}

function getTotalCounts() {
  const totalData: Record<string, any> = {};
  appStore.projects.forEach((project) => {
    defaultTypes.forEach((type) => {
      const dataPath = type.dataPath;
      if (project[dataPath]) {
        Object.keys(project[dataPath] as object).forEach((key) => {
          const value = getNestedValue(project, `${dataPath}.${key}`) || 0;
          if (!totalData[dataPath]) totalData[dataPath] = {};
          totalData[dataPath][key] = (totalData[dataPath][key] || 0) + value;
        });
      }
    });
  });
  return totalData;
}

function getTypes(typeData: Record<string, any>) {
  const list: Array<{
    data: Array<{ color: string; label: string; value: number }>;
    icon: string;
    title: string;
  }> = [];
  for (const type of defaultTypes) {
    if (!typeData[type.dataPath]) continue;
    list.push({
      title: type.title,
      icon: type.icon,
      data: type.data.map((item) => ({
        label: item.label,
        color: item.color,
        value: getNestedValue(typeData, `${type.dataPath}.${item.key}`) || 0,
      })),
    });
  }
  return list;
}

function getPersonalPendingCount(typeData: Record<string, any>) {
  let count = 0;
  const keys = [
    'task_log_stats.personal_tobe_submit',
    'supervision_log_stats.personal_tobe_submit',
    'submission_stats.team_task_log_pending_audit',
    'submission_stats.team_supervision_log_pending_audit',
  ];
  keys.forEach((key) => {
    count += getNestedValue(typeData, key) || 0;
  });
  return count;
}

const allProject = ref<ProjectItem>({ id: undefined, name: '所有项目' });

watch(
  () => appStore.projects,
  (newVal) => {
    if (newVal?.length) {
      const totalData = getTotalCounts();
      allProject.value = {
        id: undefined,
        name: '所有项目',
        ...totalData,
      } as ProjectItem;
    }
  },
  { immediate: true, deep: true },
);

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

// ---------------- 视觉工具 ----------------
const avatarPalette: Array<[string, string]> = [
  ['#1677ff', '#69b1ff'],
  ['#722ed1', '#b37feb'],
  ['#13c2c2', '#5cdbd3'],
  ['#fa8c16', '#ffc069'],
  ['#52c41a', '#95de64'],
  ['#eb2f96', '#ff85c0'],
  ['#2f54eb', '#85a5ff'],
  ['#fa541c', '#ff9c6e'],
];

function projectGradient(id?: number | string): string {
  const s = String(id ?? '');
  let h = 0;
  for (const ch of s) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 1e9;
  const pair =
    avatarPalette[h % avatarPalette.length] ?? ['#1677ff', '#69b1ff'];
  const [from, to] = pair;
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

const rolePalette = [
  { bg: 'rgba(22, 119, 255, 0.10)', color: '#1677ff' },
  { bg: 'rgba(114, 46, 209, 0.10)', color: '#722ed1' },
  { bg: 'rgba(19, 194, 194, 0.10)', color: '#08979c' },
  { bg: 'rgba(250, 140, 22, 0.12)', color: '#d46b08' },
];

function roleChipStyle(idx: number) {
  const c =
    rolePalette[idx % rolePalette.length] ??
    ({ bg: 'rgba(22, 119, 255, 0.10)', color: '#1677ff' } as const);
  return { background: c.bg, color: c.color, borderColor: 'transparent' };
}

const colorDotMap: Record<string, string> = {
  green: '#52c41a',
  gold: '#faad14',
  red: '#ff4d4f',
  blue: '#1677ff',
  cyan: '#13c2c2',
  purple: '#722ed1',
  orange: '#fa8c16',
};

function colorDot(color: string): string {
  return colorDotMap[color] || '#1677ff';
}

// ---------------- 切换 ----------------
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

const projectName = computed(() => {
  const name = appStore.defaultProject?.name;
  if (name && name !== '所有项目') return name;
  return appStore.projects.length > 1 ? '所有项目' : projectEmptyLabel();
});

function projectEmptyLabel() {
  if (appStore.projects.length === 0) return '未选择项目';
  return '所有项目';
}

const personalPending = computed(() => {
  const cur = currentProjectId.value
    ? (appStore.defaultProject as any)
    : allProject.value;
  return getPersonalPendingCount(cur);
});
</script>

<template>
  <div class="app-project">
    <Popover
      v-model:open="popoverOpen"
      trigger="click"
      placement="bottomLeft"
      :destroy-on-hidden="true"
    >
      <Badge
        :count="personalPending"
        :overflow-count="99"
        :offset="[-2, 4]"
      >
        <Button
          type="primary"
          ghost
          class="project-trigger"
        >
          <Icon icon="ant-design:appstore-outlined" class="text-base" />
          <span class="trigger-name">{{ projectName }}</span>
          <Icon
            icon="ant-design:down-outlined"
            class="text-xs opacity-70 ml-1 trigger-caret"
            :class="{ 'is-open': popoverOpen }"
          />
        </Button>
      </Badge>

      <template #content>
        <div class="project-popover-content">
          <!-- 头部：标题 + 联网搜索 -->
          <div class="popover-header">
            <div class="header-row">
              <span class="header-title">
                <Icon icon="ant-design:appstore-outlined" class="header-title-icon" />
                项目切换
              </span>
              <span class="header-count">
                {{ searchMode ? `找到 ${total} 个` : `共 ${total} 个项目` }}
              </span>
            </div>
            <Input
              v-model:value="keyword"
              allow-clear
              class="search-input"
              placeholder="搜索项目名称、简称或编码..."
              @keyup.enter="onSearchEnter"
            >
              <template #prefix>
                <Icon icon="ant-design:search-outlined" />
              </template>
              <template #suffix>
                <Spin v-if="loading && searchMode" size="small" />
              </template>
            </Input>
          </div>

          <!-- 列表 -->
          <Spin :spinning="loading" class="list-spin">
            <div class="project-list">
              <div v-if="displayList.length" class="project-list-inner">
                <!-- “所有项目”聚合卡片 -->
                <div
                  v-if="showAllCard"
                  class="project-item project-item--all"
                  :class="{ 'current-project': !currentProjectId }"
                  @click="setDefault(allProject)"
                >
                  <div class="project-main">
                    <div class="project-head">
                      <div class="all-avatar">
                        <Icon icon="ant-design:appstore-outlined" />
                      </div>
                      <div class="project-info">
                        <div class="project-title">所有项目</div>
                        <div class="project-subtitle">全部项目统计概览</div>
                      </div>
                    </div>
                    <div v-if="getTypes(allProject).length" class="stats-section">
                      <div class="stats-panel">
                        <div
                          v-for="(type, tidx) in getTypes(allProject)"
                          :key="tidx"
                          class="stats-row"
                        >
                          <div class="stats-title">
                            <Icon :icon="type.icon" class="mr-1" />
                            {{ type.title }}
                          </div>
                          <div class="stats-values">
                            <div
                              v-for="d in type.data"
                              :key="d.label"
                              class="stats-item"
                            >
                              <span
                                class="stats-dot"
                                :style="{ background: colorDot(d.color) }"
                              ></span>
                              <span class="stats-label">{{ d.label }}</span>
                              <Tag :color="d.color" class="!m-0 stats-tag">
                                {{ d.value || 0 }}
                              </Tag>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 分页项目 -->
                <div
                  v-for="(item, idx) in pageList"
                  :key="String(item.id) + (item.code || '')"
                  class="project-item"
                  :class="{ 'current-project': currentProjectId === item.id }"
                  :style="{ animationDelay: `${idx * 35}ms` }"
                  @click="setDefault(item)"
                >
                  <div class="action-area action-area--right">
                    <Tag
                      v-if="currentProjectId === item.id"
                      color="success"
                      class="!m-0 current-tag"
                    >
                      <template #icon>
                        <Icon icon="ant-design:check-circle-filled" />
                      </template>
                      当前
                    </Tag>
                    <Icon
                      v-else
                      icon="ant-design:right-outlined"
                      class="item-chevron text-gray-400"
                    />
                  </div>
                  <div class="project-main">
                    <div class="project-head">
                      <Badge
                        :count="getPersonalPendingCount(item)"
                        :offset="[-2, 4]"
                        :overflow-count="99"
                      >
                        <Avatar
                          :size="44"
                          shape="square"
                          class="project-avatar"
                          :style="{ backgroundImage: projectGradient(item.id) }"
                        >
                          {{ item.name?.[0] || 'P' }}
                        </Avatar>
                      </Badge>
                      <div class="project-info">
                        <div class="project-title">
                          {{ item.name }}
                        </div>
                        <div v-if="item.code" class="project-code">
                          <span class="code-chip">{{ item.code }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="role-row">
                      <Tag
                        v-for="(role, ridx) in (item.roles || []).slice(0, 3)"
                        :key="ridx"
                        class="role-chip"
                        :style="roleChipStyle(ridx)"
                      >
                        {{ roleText(role) }}
                      </Tag>
                      <span v-if="!item.roles?.length" class="role-empty">
                        暂无角色
                      </span>
                    </div>
                    <div v-if="getTypes(item).length" class="stats-section">
                      <div class="stats-panel">
                        <div
                          v-for="(type, tidx) in getTypes(item)"
                          :key="tidx"
                          class="stats-row"
                        >
                          <div class="stats-title">
                            <Icon :icon="type.icon" class="mr-1" />
                            {{ type.title }}
                          </div>
                          <div class="stats-values">
                            <div
                              v-for="d in type.data"
                              :key="d.label"
                              class="stats-item"
                            >
                              <span
                                class="stats-dot"
                                :style="{ background: colorDot(d.color) }"
                              ></span>
                              <span class="stats-label">{{ d.label }}</span>
                              <Tag :color="d.color" class="!m-0 stats-tag">
                                {{ d.value || 0 }}
                              </Tag>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Empty
                v-else-if="!loading"
                class="empty-state"
                :description="emptyStateText"
                :image="Empty.PRESENTED_IMAGE_SIMPLE"
              />
            </div>
          </Spin>

          <!-- 分页 -->
          <div v-if="total > perPage" class="pagination-section">
            <Pagination
              size="small"
              :current="page"
              :total="total"
              :page-size="perPage"
              :show-size-changer="false"
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
  gap: 6px;
  padding: 0 12px;
  height: 34px;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.06);
  border: 1px solid rgba(128, 128, 128, 0.16);
  font-weight: 500;
  transition: all 0.2s ease;
}

.project-trigger:hover {
  background: rgba(22, 119, 255, 0.08);
  border-color: rgba(22, 119, 255, 0.35);
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.12);
}

.trigger-name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-caret {
  transition: transform 0.2s ease;
}

.trigger-caret.is-open {
  transform: rotate(180deg);
}
</style>

<style>
/* 该版本 antdv-next 不渲染 .ant-popover-inner，且 overlay-class-name 不生效，
   因此宽度/圆角/溢出约束直接落在唯一内容节点 .project-popover-content 上 */
.project-popover-content {
  display: flex;
  flex-direction: column;
  width: 480px;
  max-width: calc(100vw - 32px);
  max-height: min(560px, calc(100vh - 140px));
  overflow: hidden;
  border-radius: 12px;
}

/* ------- 头部 ------- */
.project-popover-content .popover-header {
  padding: 14px 14px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: linear-gradient(180deg, rgba(22, 119, 255, 0.04), transparent);
  flex-shrink: 0;
}

.project-popover-content .header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.project-popover-content .header-title {
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.project-popover-content .header-title-icon {
  color: #1677ff;
}

.project-popover-content .header-count {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 8px;
  border-radius: 10px;
}

.project-popover-content .search-input .ant-input-affix-wrapper {
  height: 36px;
  border-radius: 8px;
}

/* ------- 列表 ------- */
/* 该版本 Spin 直接把 .ant-spin-container 作为 .list-spin 的直接子元素（无
   .ant-spin-nested-loading 包裹层），两种结构都约束，保证列表在弹层内滚动 */
.project-popover-content .list-spin,
.project-popover-content .list-spin > .ant-spin-container,
.project-popover-content .list-spin > .ant-spin-nested-loading,
.project-popover-content
  .list-spin
  > .ant-spin-nested-loading
  > .ant-spin-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.project-popover-content .project-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.project-popover-content .project-list::-webkit-scrollbar {
  width: 6px;
}

.project-popover-content .project-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.12);
  border-radius: 3px;
}

.project-popover-content .project-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.22);
}

.project-popover-content .project-list-inner {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ------- 项目卡片 ------- */
.project-popover-content .action-area {
  display: inline-flex;
  align-items: center;
}

.project-popover-content .action-area--right {
  position: absolute;
  top: 12px;
  right: 14px;
  z-index: 1;
}

.project-popover-content .current-tag {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.project-popover-content .item-chevron {
  transition: transform 0.2s ease, color 0.2s ease;
}

.project-popover-content .project-item:hover .item-chevron {
  transform: translateX(3px);
  color: #1677ff !important;
}

.project-popover-content .project-item {
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 10px;
  padding: 12px 14px;
  border: 1px solid transparent;
  animation: projectItemIn 0.28s ease backwards;
}

@keyframes projectItemIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.project-popover-content .project-item:hover {
  transform: translateX(3px);
  background: rgba(22, 119, 255, 0.04);
  border-color: rgba(22, 119, 255, 0.28);
  box-shadow: 0 4px 14px rgba(22, 119, 255, 0.1);
}

.project-popover-content .current-project {
  background: linear-gradient(
    135deg,
    rgba(22, 119, 255, 0.07),
    rgba(22, 119, 255, 0.13)
  ) !important;
  border: 1px solid rgba(22, 119, 255, 0.4);
  box-shadow: inset 3px 0 0 #1677ff;
}

.project-popover-content .project-item--all {
  border: 1px dashed rgba(22, 119, 255, 0.4);
  background: linear-gradient(
    135deg,
    rgba(22, 119, 255, 0.05),
    rgba(22, 119, 255, 0.02)
  );
}

.project-popover-content .project-item--all:hover {
  border-style: solid;
}

.project-popover-content .project-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.project-popover-content .project-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-popover-content .project-avatar {
  border-radius: 12px;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.project-popover-content .all-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1677ff, #69b1ff);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  box-shadow: 0 2px 6px rgba(22, 119, 255, 0.3);
  flex-shrink: 0;
}

.project-popover-content .project-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.project-popover-content .project-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-popover-content .project-subtitle {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.4);
}

.project-popover-content .project-code {
  display: flex;
}

.project-popover-content .code-chip {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  padding: 1px 6px;
}

/* ------- 角色 ------- */
.project-popover-content .role-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: 56px;
}

.project-popover-content .role-chip {
  font-size: 12px;
  height: 22px;
  line-height: 20px;
  padding: 0 7px;
  border-radius: 5px;
  font-weight: 500;
}

.project-popover-content .role-empty {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.35);
}

/* ------- 统计面板 ------- */
.project-popover-content .stats-section {
  margin-left: 56px;
}

.project-popover-content .stats-panel {
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.025);
  border: 1px solid rgba(0, 0, 0, 0.05);
  padding: 6px 10px;
}

.project-popover-content .stats-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  gap: 8px;
}

.project-popover-content .stats-row + .stats-row {
  border-top: 1px dashed rgba(0, 0, 0, 0.06);
}

.project-popover-content .stats-title {
  font-size: 12.5px;
  color: rgba(0, 0, 0, 0.62);
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.project-popover-content .stats-values {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}

.project-popover-content .stats-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.project-popover-content .stats-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.project-popover-content .stats-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.project-popover-content .stats-tag {
  font-size: 12px;
}

/* ------- 空态 ------- */
.project-popover-content .empty-state {
  min-height: 260px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

/* ------- 分页 ------- */
.project-popover-content .pagination-section {
  padding: 10px 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  justify-content: center;
  background: rgba(0, 0, 0, 0.015);
  flex-shrink: 0;
}
</style>
