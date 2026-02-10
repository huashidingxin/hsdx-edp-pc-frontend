<script setup>
import {shallowRef, nextTick} from 'vue'
import { useAppStore } from "@/store/index.js";
import {useAccessStore} from "@vben/stores";
import {useTabs} from "@vben/hooks";
import Resource from "@/api/resource.js";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(["update:modelValue"]);

const appStore = useAppStore()
const accessStore = useAccessStore()

const $toast = inject('$toast')
const tabs = useTabs()

const dialog = shallowRef(false)
const keyword = ref('')

watch(() => props.modelValue, (newValue) => {
  dialog.value = newValue
})

watch(dialog, async (newValue) => {
  if (newValue) {
    await appStore.getProjects('all')
    nextTick(() => {
      keyword.value = ''
    })
  }
  emit('update:modelValue', newValue)
})

const defaultTypes = [
  {
    key: 'supervision_log',
    title: '监理日志',
    icon: '📋',
    iconColor: 'text-primary-light',
    dataPath: 'supervision_log_stats',
    data: [
      { key: 'team_submitted', label: '已提交', color: 'text-success' },
      { key: 'team_tobe_submit', label: '待提交', color: 'text-warning' },
      { key: 'team_timeout', label: '已逾期', color: 'text-error' },
    ]
  },
  {
    key: 'task',
    title: '任务记录',
    icon: '✓',
    iconColor: 'text-warning-light',
    dataPath: 'task_log_stats',
    data: [
      { key: 'team_submitted', label: '已提交', color: 'text-success' },
      { key: 'team_tobe_submit', label: '待提交', color: 'text-warning' },
      { key: 'team_timeout', label: '已逾期', color: 'text-error' },
    ]
  },
  {
    key: 'nonconformance',
    title: '不符合项',
    icon: '⚠️',
    iconColor: 'text-error-light',
    dataPath: 'nonconformance_stats',
    data: [
      { key: 'team_pending', label: '待处理', color: 'text-warning' },
      { key: 'team_processing', label: '处理中', color: 'text-primary' },
    ],
  },
  {
    key: 'tool_inspection',
    title: '工具待检',
    icon: '🔧',
    iconColor: 'text-success-light',
    dataPath: 'tool_stats',
    data: [
      { key: 'team_near_due', label: '临期', color: 'text-primary' },
      { key: 'team_overdue', label: '已逾期', color: 'text-error' }
    ],
  }
]

function getTotalCounts() {
  const totalData = {};

  appStore.projects.forEach(project => {
    defaultTypes.forEach(type => {
      const dataPath = type.dataPath;

      if (project[dataPath]) {
        const keys = Object.keys(project[dataPath])
        keys.forEach(key => {
          const value = getNestedValue(project, `${dataPath}.${key}`) || 0;

          // 创建嵌套结构
          if (!totalData[dataPath]) {
            totalData[dataPath] = {};
          }

          if (!totalData[dataPath][key]) {
            totalData[dataPath][key] = 0;
          }

          totalData[dataPath][key] += value;
        });
      }
    });
  });

  return totalData;
}
function getTypes(typeData) {
  let types = []
  for(let i in defaultTypes) {
    const type = defaultTypes[i]
    if(!typeData[type.dataPath]) {
      continue
    }
    types.push({
      ...type,
      data: type.data?.map(item => ({
        ...item,
        value: getNestedValue(typeData, type.dataPath + '.' + item.key) || 0
      }))
    })
  }
  return types;
}
// 获取嵌套对象的值
function getNestedValue(obj, path){
  return path.split('.').reduce((current, key) => current?.[key], obj)
}

function getPersonalPendingCount(typeData) {
  let count = 0
  const keys = [
    'task_log_stats.personal_tobe_submit',
    'supervision_log_stats.personal_tobe_submit',
    'submission_stats.team_task_log_pending_audit',
    'submission_stats.team_supervision_log_pending_audit'
  ];
  keys.forEach((key)=>{
    count += getNestedValue(typeData,key) || 0
  })
  return count
}

async function setDefault(project) {
  dialog.value = false
  tabs.closeAllTabs()
  await appStore.setDefaultProject(project)
  accessStore.isAccessChecked = false
  $toast.success(`已切换至项目：${project.name}`)
  await appStore.getPermissions(project?.id)
  window.location.reload()
}

const keywordField = {
  field: 'keyword',
  label: '搜索项目',
  col: 12,
  attrs: {
    hideDetails: true,
    placeholder: '输入项目名称、简称或编码搜索...',
    clearable: true,
    prependInnerIcon: 'mdi-magnify'
  }
}
const allProject = ref({
  id:undefined,
  name:'所有项目',
})
const projects = computed(() => {
  const lowerKeyword = keyword.value?.trim()?.toLowerCase() || '';
  let filtered = []
  if (!lowerKeyword) {
    filtered = appStore.projects || []
  }else{
    filtered =  appStore.projects?.filter(project =>
      project.name?.toLowerCase().includes(lowerKeyword) ||
      project.short_name?.toLowerCase().includes(lowerKeyword) ||
      project.code?.toLowerCase().includes(lowerKeyword)
    ) || []
  }
  return (appStore.projects.length > 1 ? [allProject.value] : []).concat(filtered)
})

watch(() => appStore.projects, async (newVal) => {
  if (newVal?.length) {
    const totalData = getTotalCounts();
    allProject.value = {
      id: undefined,
      name: '所有项目',
      ...totalData
    };
  }
},{immediate:true,deep:true})

const emptyStateText = computed(() => {
  return projects.value.length === 0 && keyword.value
    ? '未找到符合条件的项目'
    : '暂未加入任何项目'
})
</script>

<template>
  <div class="text-center">
    <v-dialog
      v-model="dialog"
      transition="dialog-bottom-transition"
      max-width="640px"
      persistent
    >
      <v-card class="project-dialog">
        <v-card-title class="d-flex justify-between align-center pa-4">
          <div class="d-flex align-center gap-2">
            <v-icon color="primary">mdi-folder-multiple-outline</v-icon>
            <span class="text-h6">选择项目</span>
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            @click="dialog = false"
            density="comfortable"
          ></v-btn>
        </v-card-title>

        <v-divider></v-divider>

        <v-card-text class="pa-4">
          <div class="search-section mb-4">
            <AppField v-model="keyword" :field="keywordField"></AppField>
          </div>

          <div class="project-list overflow-y-auto" style="max-height: 500px">
            <v-list v-if="projects.length" class="pa-0">
              <v-list-item
                v-for="project in projects"
                :key="project.id"
                :title="project.name"
                :subtitle="project.code"
                @click="setDefault(project)"
                rounded
                class="mx-2 my-1 project-item"
                :class="{ 'current-project': appStore.defaultProject?.id === project.id }"
              >
                <template #prepend>
                  <v-badge
                    v-if="getPersonalPendingCount(project) > 0"
                    :content="getPersonalPendingCount(project)"
                    color="error"
                    offset-x="0"
                    offset-y="4"
                  >

                    <v-avatar :color="appStore.defaultProject?.id === project.id ? 'primary' : 'blue-lighten-2'" size="40" >
                      <span class="text-h6 text-white">{{ project.name?.[0] || 'P' }}</span>
                    </v-avatar>
                  </v-badge>
                  <v-avatar v-else :color="appStore.defaultProject?.id === project.id ? 'primary' : 'blue-lighten-2'" size="40" >
                    <span class="text-h6 text-white">{{ project.name?.[0] || 'P' }}</span>
                  </v-avatar>
                </template>
                <template #append>

                  <v-icon v-if="appStore.defaultProject?.id !== project.id" color="grey-lighten-1">mdi-chevron-right</v-icon>
                </template>
                <template #title>
                  <div class="d-flex align-center">
                    <div class="text-body-1">{{ project.name }}</div>
                    <v-chip
                      v-if="appStore.defaultProject?.id === project.id"
                      size="x-small"
                      color="success"
                      variant="elevated"
                      prepend-icon="mdi-check-circle"
                    >
                      当前
                    </v-chip>
                  </div>
                </template>
                <div class="mt-2">
                  <v-chip
                    v-for="(role, idx) in project.roles"
                    :key="idx"
                    size="x-small"
                    :variant="appStore.defaultProject?.id === project.id ? 'tonal' : 'outlined'"
                    :color="appStore.defaultProject?.id === project.id ? 'primary' : 'grey-darken-1'"
                    class="mr-1"
                  >
                    {{ role }}
                  </v-chip>
                  <span v-if="!project.roles?.length" class="text-caption text-grey">
                    暂无角色
                  </span>
                </div>
                <v-expand-transition>
                  <div v-if="getTypes(project).length" class="stats-section">
                    <v-sheet
                      class="pa-3 rounded-lg"
                      color="grey-lighten-5"
                    >
                      <div
                        v-for="(type, idx) in getTypes(project)"
                        :key="idx"
                        class="d-flex justify-space-between align-center py-1"
                      >
                        <div class="text-body-2 text-grey-darken-1">{{ type.title }}</div>
                        <div class="d-flex align-center">
                          <div
                            v-for="typeItem in type.data"
                            :key="typeItem.key"
                            class="d-flex align-center ml-3"
                          >
                            <span class="text-caption text-grey-darken-2">{{ typeItem.label }}</span>
                            <span class="text-body-2 ml-1 font-weight-medium" :class="typeItem.color || 'text-primary'">
                              {{ typeItem.value || 0 }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </v-sheet>
                  </div>
                </v-expand-transition>
              </v-list-item>
            </v-list>

            <div v-else class="empty-state d-flex flex-column justify-center align-center text-grey py-12">
              <v-icon size="64" color="grey-lighten-1" class="mb-4">
                {{ keyword ? 'mdi-magnify' : 'mdi-folder-open-outline' }}
              </v-icon>
              <div class="text-body-1 mb-2">{{ emptyStateText }}</div>
              <div v-if="keyword" class="text-caption">
                试试搜索其他关键词
              </div>
            </div>
          </div>
        </v-card-text>

        <v-card-actions class="pa-4 bg-grey-lighten-5">
          <v-spacer></v-spacer>
          <v-btn
            variant="text"
            @click="dialog = false"
          >
            取消
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.project-dialog :deep(.v-card-text) {
  padding: 16px;
}

.search-section {
  background: var(--v-theme-surface);
  border-radius: 8px;
  padding: 12px;
}

.current-project {
  background: linear-gradient(135deg, var(--v-theme-primary-lighten-5), var(--v-theme-primary-lighten-3)) !important;
  border: 2px solid var(--v-theme-primary);
}

.project-item {
  transition: all 0.2s ease;
}

.project-item:hover {
  transform: translateX(4px);
}

.project-list :deep(.v-list-item) {
  padding: 12px 16px;
}

.stats-section {
  margin-top: 8px;
}

.empty-state {
  min-height: 300px;
}

:deep(.v-field__input) {
  font-size: 14px;
}
</style>
