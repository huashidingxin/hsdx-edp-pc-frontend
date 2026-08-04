<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue';

import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  message,
  Popover,
  Tag,
} from 'antdv-next';
import {
  IconifyIcon as Icon,
} from '@vben/icons';

import { useAppStore } from '#/store/app';
import type { ProjectItem } from '#/store/app';

const props = defineProps<{ modelValue?: boolean }>();

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

defineOptions({ name: 'AppProject' });

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

watch(popoverOpen, async (v) => {
  emit('update:modelValue', v);
  if (v) {
    await appStore.getProjects('all');
    nextTick(() => {
      keyword.value = '';
    });
  }
});

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
  return path.split('.').reduce((cur, key) => cur?.[key], obj);
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
    title: string;
    icon: string;
    data: Array<{ label: string; color: string; value: number }>;
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

const projects = computed<ProjectItem[]>(() => {
  const lowerKeyword = keyword.value?.trim()?.toLowerCase() || '';
  let filtered: ProjectItem[] = [];
  if (!lowerKeyword) {
    filtered = appStore.projects || [];
  } else {
    filtered =
      appStore.projects?.filter((project) => {
        return (
          project.name?.toLowerCase().includes(lowerKeyword) ||
          project.short_name?.toLowerCase().includes(lowerKeyword) ||
          project.code?.toLowerCase().includes(lowerKeyword)
        );
      }) || [];
  }
  return (appStore.projects.length > 1 ? [allProject.value] : []).concat(
    filtered,
  );
});

const currentProjectId = computed(() => appStore.defaultProject?.id);

const emptyStateText = computed(() => {
  if (projects.value.length === 0 && keyword.value) {
    return '未找到符合条件的项目';
  }
  return '暂未加入任何项目';
});

function roleText(role: any): string {
  if (!role) return '';
  if (typeof role === 'string') return role;
  return role.display_name || role.name || '';
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
  } catch (e) {
    console.error(e);
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
      :overlay-class-name="'app-project-popover'"
      :destroy-on-hide="true"
    >
      <Badge
        :count="personalPending"
        :overflow-count="99"
        :offset="[-4, 4]"
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
            class="text-xs opacity-70 ml-1"
          />
        </Button>
      </Badge>

      <template #content>
        <div class="project-popover-content">
          <div class="search-section">
            <Input
              v-model:value="keyword"
              allow-clear
              class="search-input"
              placeholder="输入项目名称、简称或编码搜索..."
            >
              <template #prefix>
                <Icon icon="ant-design:search-outlined" />
              </template>
            </Input>
          </div>

          <div class="project-list">
            <div v-if="projects.length" class="project-list-inner">
              <div
                v-for="item in projects"
                :key="String(item.id) + (item.code || '')"
                class="project-item"
                :class="{ 'current-project': currentProjectId === item.id }"
                @click="setDefault(item)"
              >
                <div class="action-area action-area--right">
                  <Tag
                    v-if="currentProjectId === item.id"
                    color="success"
                    class="!m-0"
                  >
                    <template #icon>
                      <Icon icon="ant-design:check-circle-filled" />
                    </template>
                    当前
                  </Tag>
                  <Icon
                    v-else
                    icon="ant-design:right-outlined"
                    class="text-gray-400"
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
                        :size="40"
                        :style="{
                          backgroundColor:
                            currentProjectId === item.id ? '#1677ff' : '#91caff',
                          color: '#fff',
                        }"
                      >
                        {{ item.name?.[0] || 'P' }}
                      </Avatar>
                    </Badge>
                    <div class="project-info">
                      <div class="project-title">
                        {{ item.name }}
                      </div>
                      <div v-if="item.code" class="project-code">
                        {{ item.code }}
                      </div>
                    </div>
                  </div>
                  <div class="role-row">
                    <Tag
                      v-for="(role, idx) in (item.roles || []).slice(0, 3)"
                      :key="idx"
                      class="role-chip"
                    >
                      {{ roleText(role) }}
                    </Tag>
                    <span v-if="!item.roles?.length" class="role-empty">
                      暂无角色
                    </span>
                  </div>
                  <div v-if="getTypes(item).length" class="stats-section">
                    <Card size="small" class="stats-card">
                      <div
                        v-for="(type, idx) in getTypes(item)"
                        :key="idx"
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
                            <span class="stats-label">{{ d.label }}</span>
                            <Tag :color="d.color" class="!m-0 !ml-1">
                              {{ d.value || 0 }}
                            </Tag>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            </div>

            <Empty
              v-else
              class="empty-state"
              :description="emptyStateText"
              :image="Empty.PRESENTED_IMAGE_SIMPLE"
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
  padding: 0 10px;
  height: 32px;
  background: transparent;
  border: 1px solid transparent;
  color: inherit;
  font-weight: 500;
  max-width: 260px;
}

.project-trigger:hover {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
}

.trigger-name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

<style>
.app-project-popover .ant-popover-inner {
  padding: 0 !important;
  width: 480px;
  max-width: 90vw;
}

.app-project-popover .ant-popover-inner-content {
  padding: 0 !important;
}

.project-popover-content {
  display: flex;
  flex-direction: column;
  max-height: 560px;
}

.project-popover-content .search-section {
  padding: 12px 12px 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.02);
}

.project-popover-content .search-input .ant-input-affix-wrapper {
  height: 36px;
  border-radius: 8px;
}

.project-popover-content .project-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.project-popover-content .project-list-inner {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.project-popover-content .action-area {
  display: inline-flex;
  align-items: center;
}

.project-popover-content .action-area--right {
  position: absolute;
  top: 12px;
  right: 14px;
}

.project-popover-content .project-item {
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 6px;
}

.project-popover-content .project-item:hover {
  transform: translateX(4px);
  background: rgba(22, 119, 255, 0.04);
}

.project-popover-content .current-project {
  background: linear-gradient(
    135deg,
    rgba(22, 119, 255, 0.08),
    rgba(22, 119, 255, 0.14)
  ) !important;
  border: 1px solid #1677ff;
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

.project-popover-content .project-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-popover-content .project-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.project-popover-content .project-code {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.project-popover-content .role-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: 52px;
}

.project-popover-content .role-chip {
  font-size: 12px;
  height: 22px;
  line-height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.04);
}

.project-popover-content .role-empty {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.35);
}

.project-popover-content .stats-section {
  margin-left: 52px;
}

.project-popover-content .stats-card .ant-card-body {
  padding: 8px 12px;
}

.project-popover-content .stats-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.project-popover-content .stats-row + .stats-row {
  border-top: 1px dashed rgba(0, 0, 0, 0.06);
}

.project-popover-content .stats-title {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
}

.project-popover-content .stats-values {
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-popover-content .stats-item {
  display: inline-flex;
  align-items: center;
}

.project-popover-content .stats-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.project-popover-content .empty-state {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
</style>
