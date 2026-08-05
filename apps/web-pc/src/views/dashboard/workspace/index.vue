<script setup>
/**
 * 工作台（监理业务概览）—— 对齐 web-admin dashboard/workspace/index.vue
 *
 * - 顶部：问候语 + 当前项目（角色）+ 待办数 + 项目数
 * - 通知公告（GET index → notices）
 * - 最新文件（GET index → knowledge）
 * - 待办事项（appStore.dashboard 八类统计，点击跳转）
 * - 我的项目（appStore.projects）
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useUserStore } from '@vben/stores';
import { preferences } from '@vben/preferences';

import { Modal, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import { useAppStore } from '#/store';

const router = useRouter();
const userStore = useUserStore();
const appStore = useAppStore();

// ---- 首页数据（index API：notices / knowledge / weather）----
const appData = ref({ notices: [], knowledge: [] });
const loading = ref(false);

async function getIndex() {
  loading.value = true;
  try {
    const { data } = await new Resource('index').list({
      project_id: appStore.defaultProject?.id,
    });
    appData.value = data || { notices: [], knowledge: [] };
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

function getFileIcon(item) {
  const url = appStore.setting?.file_category_icon_url;
  if (!url) return '';
  if (item.is_folder) return `${url}/0.svg`;
  if (item.file) return `${url}/${item.file.category_id}.svg`;
  return '';
}

function openFile(item) {
  const preview = appStore.setting?.file_preview_url;
  if (preview && item.file?.url) {
    window.open(`${preview}?file=${encodeURIComponent(item.file.url)}`);
  }
}

// ---- 通知公告弹窗 ----
const newsDialog = ref(false);
const currentNews = ref(null);
function openNews(item) {
  currentNews.value = item;
  newsDialog.value = true;
}

// ---- 待办事项（appStore.dashboard 八类）----
const todoConfig = [
  { key: 'task_personal_pending', name: '监理任务', path: 'task.personal_pending', url: '/tasks' },
  { key: 'task_personal_tobe_submit', name: '监理记录', path: 'task.personal_log_tobe_submit', url: '/task-submissions' },
  { key: 'supervision_log_personal_tobe_submit', name: '监理日志', path: 'supervision_log.personal_tobe_submit', url: '/supervision-logs' },
  { key: 'submission_team_task_log_pending_audit', name: '待审核任务记录', path: 'task.team_log_tobe_audit', url: '/task-submissions' },
  { key: 'submission_team_supervision_log_pending_audit', name: '待审核监理日志', path: 'supervision_log.team_tobe_audit', url: '/supervision-logs' },
  { key: 'project_user_team_pending_audit', name: '待审核项目成员', path: 'project_user.team_tobe_audit', url: '/project-user-applications' },
  { key: 'nonconformance_team_pending_audit', name: '处理中不符合项', path: 'nonconformance.processing', url: '/nonconformances' },
  { key: 'nonconformance_team_pending_audit2', name: '待审核不符合项', path: 'nonconformance.team_tobe_audit', url: '/nonconformances' },
];

function getObjectValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj) || 0;
}

const todos = computed(() => {
  const dashboard = appStore.dashboard || {};
  const list = {};
  for (const cfg of todoConfig) {
    const value = getObjectValue(dashboard, cfg.path);
    if (value > 0) list[cfg.key] = { ...cfg, value };
  }
  return list;
});

const todoCount = computed(() => appStore.personalTodoCount || 0);

function openTodo(item) {
  router.push(item.url);
}

// ---- 我的项目 ----
const projectStateColorMap = { 1: 'orange', 2: 'blue', 3: 'default' };

function switchToProject(item) {
  if (appStore.defaultProject?.id !== item.id) {
    appStore.switchProject(item);
  }
}

// ---- 问候语 ----
const nowTimestamp = ref(Math.floor(Date.now() / 1000));
let timer = null;
onMounted(() => {
  timer = setInterval(() => {
    nowTimestamp.value = Math.floor(Date.now() / 1000);
  }, 60 * 1000);
});
onBeforeUnmount(() => clearInterval(timer));

const greeting = computed(() => {
  const hour = new Date(nowTimestamp.value * 1000).getHours();
  if (hour >= 5 && hour < 9) return { g: '早安', a: '开启美好的一天吧。' };
  if (hour >= 9 && hour < 12) return { g: '上午好', a: '开始高效工作吧。' };
  if (hour >= 12 && hour < 14) return { g: '中午好', a: '记得休息一下哦。' };
  if (hour >= 14 && hour < 18) return { g: '下午好', a: '继续加油，完成任务吧。' };
  if (hour >= 18 && hour < 22) return { g: '晚上好', a: '放松一下，别太晚睡哦。' };
  if (hour >= 22 || hour < 5) return { g: '夜深了', a: '早点休息，养精蓄锐。' };
  return { g: '你好', a: '继续努力吧。' };
});

onMounted(() => {
  getIndex();
  if (!appStore.projects?.length) appStore.getProjects();
  appStore.getDashboard();
});
</script>

<template>
  <div class="p-5">
    <!-- 顶部问候卡片 -->
    <div class="rounded-lg bg-card p-4 shadow-sm">
      <div class="flex items-center">
        <img
          :src="userStore.userInfo?.avatar || preferences.app.defaultAvatar"
          class="h-[72px] w-[72px] rounded-full object-cover"
        />
        <div class="ml-3">
          <div class="text-lg">
            {{ greeting.g }}，{{ userStore.userInfo?.name }}，{{ greeting.a }}
          </div>
          <div class="mt-1 flex items-center text-base font-semibold text-primary">
            {{ appStore.defaultProject?.name || '未设置项目' }}
            <span class="ml-1 text-primary">›</span>
          </div>
          <div v-if="appStore.defaultProject" class="text-sm text-gray-500">
            {{ appStore.defaultProject?.roles?.length ? appStore.defaultProject.roles.join('、') : '未设置角色' }}
          </div>
        </div>
        <div class="ml-auto flex items-end text-right">
          <div class="flex flex-col items-center justify-center">
            <span class="text-sm text-gray-500">待办</span>
            <span class="text-2xl">{{ todoCount }}</span>
          </div>
          <div class="mx-8 flex flex-col items-center justify-center text-right md:mx-12">
            <span class="text-sm text-gray-500">项目</span>
            <span class="text-2xl">{{ appStore.projects?.length }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-5 flex flex-col gap-4 lg:flex-row">
      <!-- 左栏：通知公告 + 最新文件 -->
      <div class="w-full lg:w-3/5">
        <div class="rounded-lg bg-card p-4 shadow-sm">
          <div class="mb-2 font-semibold">通知公告</div>
          <div v-if="!appData.notices?.length" class="flex h-[200px] items-center justify-center text-gray-400">
            暂无通知
          </div>
          <div v-else class="divide-y">
            <div
              v-for="item in appData.notices"
              :key="item.id"
              class="cursor-pointer py-3"
              @click="openNews(item)"
            >
              <div class="line-clamp-1 font-medium">{{ item.title }}</div>
              <div class="text-sm text-gray-400">{{ item.summary || '' }}</div>
              <div class="mt-1 text-xs text-gray-300">{{ item.created_at || '' }}</div>
            </div>
          </div>
        </div>

        <div class="mt-4 rounded-lg bg-card p-4 shadow-sm">
          <div class="mb-2 font-semibold">最新文件</div>
          <div v-if="!appData.knowledge?.length" class="flex h-[200px] items-center justify-center text-gray-400">
            暂无文件
          </div>
          <div v-else class="divide-y">
            <div
              v-for="item in appData.knowledge"
              :key="item.id"
              class="flex cursor-pointer items-center gap-3 py-3"
              @click="openFile(item)"
            >
              <img v-if="getFileIcon(item)" :src="getFileIcon(item)" class="h-10 w-10" />
              <div class="min-w-0 flex-1">
                <div class="line-clamp-1 font-medium">{{ item.name }}</div>
                <div class="text-xs text-gray-400">{{ item.created_at || '' }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右栏：待办事项 + 我的项目 -->
      <div class="w-full lg:w-2/5">
        <div class="rounded-lg bg-card p-4 shadow-sm">
          <div class="mb-2 font-semibold">待办事项</div>
          <div v-if="!Object.keys(todos).length" class="flex h-[200px] items-center justify-center text-gray-400">
            暂无待办事项
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="item in todos"
              :key="item.key"
              class="flex cursor-pointer items-center justify-between rounded border p-3 hover:bg-gray-50"
              @click="openTodo(item)"
            >
              <div>
                <div class="font-medium">{{ item.name }}</div>
                <div class="text-sm text-gray-400">点击查看详情</div>
              </div>
              <div class="flex items-center gap-2">
                <Tag color="red">{{ item.value }}</Tag>
                <span class="text-primary">›</span>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4 rounded-lg bg-card p-4 shadow-sm">
          <div class="mb-2 font-semibold">我的项目</div>
          <div v-if="!appStore.projects?.length" class="flex h-[200px] items-center justify-center text-gray-400">
            暂未加入项目
          </div>
          <div v-else class="divide-y">
            <div
              v-for="item in appStore.projects"
              :key="item.id"
              class="flex cursor-pointer items-center gap-3 py-3"
              @click="switchToProject(item)"
            >
              <Tag :color="projectStateColorMap[item.state] || 'default'">
                {{ item.state_label || item.state }}
              </Tag>
              <div class="min-w-0 flex-1">
                <div class="font-medium">{{ item.name }}</div>
                <div class="text-xs text-gray-400">
                  {{ item.code || '' }}{{ item.roles?.join('、') ? ' · ' + item.roles.join('、') : '' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 通知详情弹窗 -->
    <Modal
      v-model:open="newsDialog"
      :title="currentNews?.title || '通知'"
      :footer="null"
      width="640px"
    >
      <div class="mb-3 text-sm text-gray-400">{{ currentNews?.created_at }}</div>
      <div class="max-h-[60vh] overflow-y-auto" v-html="currentNews?.content"></div>
    </Modal>
  </div>
</template>
