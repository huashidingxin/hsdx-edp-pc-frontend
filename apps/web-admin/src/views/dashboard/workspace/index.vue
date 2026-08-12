<script lang="ts" setup>


import {ref} from 'vue';
import {useRouter} from 'vue-router';
import {useAppStore} from "#/store/app";
import {useProjectStore}  from "#/store";


import {preferences} from '@vben/preferences';
import {useUserStore} from '@vben/stores';
import {openWindow} from '@vben/utils';

import Resource from "#/api/resource";
import AppProject from "@/components/AppProject.vue";

const userStore = useUserStore();
const appStore = useAppStore();
const projectStore = useProjectStore();

const router = useRouter();
const appData = ref({})

async function getIndex() {
  try {
    const api = new Resource('index')
    const {data} = await api.list({})
    appData.value = data;
  } catch (e) {
    console.log(e)
  }
}

function getIcon(item) {
  const url = appStore.setting.file_category_icon_url;
  if (item.is_folder) {
    return url + '/0.svg'
  } else if (item.file) {
    // todo 或者用扩展名解析
    return url + '/' + item.file?.category_id + '.svg'
  } else {
    return ''
  }
}

function openFile(e) {
  console.log(e)
  window.open(appStore.setting.file_preview_url+'?file='+encodeURIComponent(e.file.url))
}

const newsDialog = ref(false)
const currentNews = ref(null)
function openNews(e) {
  currentNews.value = e;
  newsDialog.value = true
}

function flattenObject(obj, parentKey = '', result = {}) {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = parentKey ? `${parentKey}_${key}` : key;

      if (typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key] !== null) {
        // 递归处理子对象
        flattenObject(obj[key], newKey, result);
      } else {
        // 直接赋值到结果中
        result[newKey] = obj[key];
      }
    }
  }
  return result;
}

function getObjectValue(obj, path) {
  const keys = path.split('.')
  let value = obj
  for (const key of keys) {
    if (value == null) return 0
    value = value[key]
  }
  return value || 0
}

const todoConfig = [
  {
    key: 'task_personal_pending',
    name: '监理任务',
    icon: 'mdi-file-document-outline',
    path: 'task.personal_pending',
    url: '/tasks'
  },
  {
    key: 'task_personal_tobe_submit',
    name: '监理记录',
    icon: 'mdi-text-box-edit-outline',
    path: 'task.personal_log_tobe_submit',
    url: '/task-submissions'
  },
  {
    key: 'supervision_log_personal_tobe_submit',
    name: '监理日志',
    icon: 'mdi-file-document-edit-outline',
    path: 'supervision_log.personal_tobe_submit',
    url: '/supervision-logs'
  },
  {
    key: 'submission_team_task_log_pending_audit',
    name: '待审核任务记录',
    icon: 'mdi-text-box-edit',
    path: 'task.team_log_tobe_audit',
    url: '/task-submissions'
  },
  {
    key: 'submission_team_supervision_log_pending_audit',
    name: '待审核监理日志',
    icon: 'mdi-file-document-edit',
    path: 'supervision_log.team_tobe_audit',
    url: '/supervision-logs'
  },
  {
    key: 'project_user_team_pending_audit',
    name: '待审核项目成员',
    icon: 'mdi-account-group-outline',
    path: 'project_user.team_tobe_audit',
    url: '/project-user-applications'
  },
  {
    key: 'nonconformance_team_pending_audit',
    name: '处理中不符合项',
    icon: 'mdi-alert-circle-outline',
    path: 'nonconformance.processing',
    url: '/nonconformances'
  },
  {
    key: 'nonconformance_team_pending_audit',
    name: '待审核不符合项',
    icon: 'mdi-alert-outline',
    path: 'nonconformance.team_tobe_audit',
    url: '/nonconformances'
  }
]

const todos = computed(() => {
  const _todo = appStore.dashboard || {};
  let list = {}
  for (const config of todoConfig) {
    const value = getObjectValue(_todo, config.path)
    if (value > 0) {
      list[config.key] = {
        ...config,
        value
      }
    }
  }
  return list;
})

const todoCount = computed(() => {
  return appStore.personalTodoCount || 0
})

function openTodo(e) {
  router.push(e.url)
}

const projectStateColors = ref({
  1:'primary',
  2:'success',
  3:'gray',
})


// 响应式的时间戳
const nowTimestamp = ref(Math.floor(Date.now() / 1000))

// 每分钟更新一次时间戳
let intervalId = null

onMounted(() => {
  intervalId = setInterval(() => {
    nowTimestamp.value = Math.floor(Date.now() / 1000)
  }, 60 * 1000) // 每分钟更新一次
})

onUnmounted(() => {
  clearInterval(intervalId)
})

// 当前小时数（响应式）
const currentHour = computed(() => {
  const date = new Date(nowTimestamp.value * 1000)
  return date.getHours()
})

// 时间段配置表
const timeMessages = [
  { from: 5, to: 9, greeting: '早安', action: '开启美好的一天吧。' },
  { from: 9, to: 12, greeting: '上午好', action: '开始高效工作吧。' },
  { from: 12, to: 14, greeting: '中午好', action: '记得休息一下哦。' },
  { from: 14, to: 18, greeting: '下午好', action: '继续加油，完成任务吧。' },
  { from: 18, to: 22, greeting: '晚上好', action: '放松一下，别太晚睡哦。' },
  { from: 22, to: 24, greeting: '夜深了', action: '早点休息，养精蓄锐。' },
  { from: 0, to: 5, greeting: '凌晨啦', action: '该休息啦，明天更有精神哦。' },
]

// 根据当前小时匹配问候语和动作提示
const matchedMessage = computed(() => {
  const hour = currentHour.value
  const matched = timeMessages.find(msg => hour >= msg.from && hour < msg.to)
  return matched || { greeting: '你好', action: '继续努力吧。' }
})

const { greeting, action } = matchedMessage.value
const projectSwitchDialog = ref(false)

onBeforeMount(() => {
  getIndex()
  appStore.getProjects()
  appStore.getDashboard()
})
</script>

<template>
  <div class="p-5">
    <div>
      <v-card>
        <v-card-text>
          <div class="d-flex align-center">
            <v-avatar size="72" :image="userStore.userInfo?.avatar || preferences.app.defaultAvatar"></v-avatar>
            <div class="ml-3">
              <div class="text-h6">{{ greeting }}，{{ userStore.userInfo?.name }}，{{ action }}</div>
              <div class="d-flex align-center">
                <div class="text-subtitle-1 text-primary font-weight-bold" @click="projectSwitchDialog=true">{{appStore.defaultProject?.name || '未设置项目'}}</div>
                <v-icon color="primary">mdi-chevron-right</v-icon>
              </div>

              <div v-if="appStore.defaultProject" class="text-grey-darken-3">
                {{appStore.defaultProject.roles?.length ? appStore.defaultProject.roles.join('、') : '未设置角色'}}
              </div>

            </div>
            <div class="ml-auto flex align-center align-self-end" >
              <div class="flex flex-col justify-center align-center text-right">
                <span class="text-foreground/80"> 待办 </span>
                <span class="text-2xl">{{todoCount}}</span>
              </div>

              <div class="mx-12 flex flex-col justify-center align-center text-right md:mx-16">
                <span class="text-foreground/80"> 项目 </span>
                <span class="text-2xl">{{appStore.projects?.length}}</span>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <div class="mt-5 flex flex-col lg:flex-row">
      <div class="mr-4 w-full lg:w-3/5">
        <v-card rounded="lg">
          <v-card-title>通知公告</v-card-title>
          <div v-if="!appData.notices?.length" class="d-flex align-center justify-center text-grey" style="height:200px">
            暂无通知
          </div>
          <v-card-text v-else>
            <v-list lines="two">
              <v-list-item
                v-for="item in appData.notices"
                :key="item.id"
                class="px-0"
                @click="openNews(item)"
              >
                <div class="line-clamp-2 text-body-1">
                  {{ item.title }}
                </div>

                <v-list-item-subtitle>
                  {{ item.summary }}
                  <div>{{item.created_at}}</div>
                </v-list-item-subtitle>
                <template #append>
                  <v-icon>mdi-chevron-right</v-icon>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
        <v-card rounded="lg" class="mt-3">
          <v-card-title>最新文件</v-card-title>
          <div v-if="!appData.knowledge?.length" class="d-flex align-center justify-center text-grey" style="height:200px">
            暂无文件
          </div>
          <v-card-text v-else>
            <v-list lines="two">
              <v-list-item
                v-for="item in appData.knowledge"
                :key="item.id"
                class="px-0"
                @click="openFile(item)"
              >
                <div class="line-clamp-2 text-body-1">
                  {{ item.name }}
                </div>

                <v-list-item-subtitle>
                  {{ item.created_at }}
                </v-list-item-subtitle>
                <template v-slot:prepend>
                  <v-img :src="getIcon(item)" width="40" height="40"></v-img>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </div>
      <div class="w-full lg:w-2/5">
        <v-card rounded="lg">
          <v-card-title>待办事项</v-card-title>
          <v-card-text>
            <div v-if="!Object.keys(todos)?.length" class="d-flex align-center justify-center text-grey" style="height:200px">
              暂无待办事项
            </div>
            <div class="todo-list">
              <v-list>
                <v-list-item
                  v-for="item in todos"
                  :key="item.key"
                  @click="openTodo(item)"
                  class="pa-3 mb-2 border rounded"
                >
                  <template v-slot:prepend>
                    <v-avatar
                      color="surface-light"
                      size="40"
                      class="rounded-full"
                    >
                      <v-icon size="24" color="primary">{{item.icon}}</v-icon>
                    </v-avatar>
                  </template>
                  <v-list-item-title class="text-body-1 font-weight-bold">
                    {{item.name}}
                  </v-list-item-title>
                  <v-list-item-subtitle>
                    {{item.description || '点击查看详情'}}
                  </v-list-item-subtitle>
                  <template v-slot:append>
                    <v-badge
                      :content="item.value"
                      color="error"
                      class="mr-2"
                    ></v-badge>
                    <v-icon size="20" color="primary">mdi-chevron-right</v-icon>
                  </template>
                </v-list-item>
              </v-list>
            </div>

          </v-card-text>
        </v-card>
        <v-card rounded="lg" class="mt-3">
          <v-card-title>我的项目</v-card-title>
          <v-card-text class="overflow-y-auto" style="max-height:100vh">
            <div v-if="!appStore.projects.length" class="d-flex align-center justify-center text-grey" style="height:200px">
              暂未加入项目
            </div>
            <v-list v-else lines="two">
              <v-list-item
                v-for="(item,index) in appStore.projects"
                :key="index"
                @click="$router.push('/projects/'+item.id)"
              >
                <div class="text-subtitle-1">
                  <v-chip :color="projectStateColors[item.state]" size="x-small" label>{{item.state_label}}</v-chip>
                  {{item.name}}
                </div>
                <v-list-item-subtitle>
                  <div>{{item.code}}</div>
                  <div class="mt-2">{{item.roles?.join('、')}}</div>
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </div>
    </div>

    <v-dialog v-model="newsDialog" max-width="600px">
      <v-card v-if="currentNews" class="pa-5">
        <v-card-title>{{currentNews.title}}</v-card-title>
        <v-card-subtitle>{{currentNews.created_at}}</v-card-subtitle>
        <v-card-text v-html="currentNews.content" class="overflow-y-auto" style="max-height: 70vh"></v-card-text>
      </v-card>
    </v-dialog>
    <AppProject v-model="projectSwitchDialog"></AppProject>
  </div>
</template>

<style>
.text-line-2 {
  display: -webkit-box;
  display: inline-block;
  max-height: 4.8em; /* 根据字体大小调整，2行的高度 */
  overflow: hidden;
  text-overflow: ellipsis;
  line-clamp: 2; /* 限制为2行 */
  -webkit-line-clamp: 2; /* 对应WebKit浏览器 */
  -webkit-box-orient: vertical;
}
</style>
