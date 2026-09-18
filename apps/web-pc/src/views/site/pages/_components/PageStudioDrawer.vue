<script setup>
/**
 * 页面综合工作台 (Page Studio)。
 *
 * 统一聚合：
 * 1. 🎨 页面图文装修 (PageContentManager)
 * 2. 🧩 数据块规则配置 (PageSchemaEditor - P17 协议)
 * 3. 🌐 SEO 与多语言 (PageSeoEditor)
 *
 * 底层 100% 沿用后端已有的 4 个 API 契约，彻底告别抽屉嵌套与跳转割裂。
 */
import { computed, ref, watch } from 'vue';

import { IconifyIcon as Icon } from '@vben/icons';

import {
  Button,
  Drawer,
  Radio,
  RadioButton,
  RadioGroup,
  Select,
  Tag,
  message,
} from 'antdv-next';

import { getCurrentApplicationId } from '#/api/application-context';
import { requestClient } from '#/api/request';

import PageContentManager from './PageContentManager.vue';
import PageSchemaEditor from './PageSchemaEditor.vue';
import PageSeoEditor from './PageSeoEditor.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  page: { type: Object, default: null },
  initialTab: { type: String, default: 'content' },
});

const emit = defineEmits(['update:open', 'refresh']);

const activeTab = ref('content');
const selectedLocale = ref('zh-CN');
const localeOptions = ref([]);

const contentManagerRef = ref(null);

const pageId = computed(() => Number(props.page?.id) || null);
const pageCode = computed(() => props.page?.code || '');

const typeColor = { 1: 'blue', 2: 'green', 3: 'purple', 4: 'orange' };

async function loadLocales() {
  const set = new Set();
  const appId = getCurrentApplicationId();
  if (appId) {
    try {
      const app = await requestClient.get(`/applications/${appId}`);
      if (app?.default_locale) set.add(app.default_locale);
      for (const item of app?.enabled_locales ?? []) {
        if (typeof item === 'string' && item) set.add(item);
      }
    } catch {
      // 忽略
    }
  }
  for (const item of props.page?.locales ?? []) {
    if (item?.locale) set.add(item.locale);
  }
  if (set.size === 0) set.add('zh-CN');
  localeOptions.value = [...set];
  if (!localeOptions.value.includes(selectedLocale.value)) {
    selectedLocale.value = localeOptions.value[0];
  }
}

function handleClose() {
  emit('update:open', false);
}

function onSchemaSaved() {
  // 当 Schema 变更保存后，若切换到内容 Tab，内容管理器需要重载以展现新块
  contentManagerRef.value?.load();
  emit('refresh');
}

function onSeoSaved() {
  emit('refresh');
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      activeTab.value = props.initialTab || 'content';
      const firstLocale = props.page?.locales?.[0]?.locale;
      if (firstLocale) {
        selectedLocale.value = firstLocale;
      }
      loadLocales();
    }
  },
  { immediate: true },
);

watch(
  () => props.initialTab,
  (tab) => {
    if (tab) activeTab.value = tab;
  },
);

watch(activeTab, (tab) => {
  if (tab === 'content') {
    contentManagerRef.value?.load();
  }
});
</script>

<template>
  <Drawer
    :open="open"
    width="94vw"
    destroy-on-close
    :closable="false"
    class="page-studio-drawer"
    @update:open="(v) => emit('update:open', v)"
  >
    <!-- 顶部工作台顶栏 -->
    <template #title>
      <div class="studio-header">
        <div class="header-left">
          <div class="header-icon-box">
            <Icon icon="lucide:layout-template" class="text-blue-500 text-lg" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-base font-semibold text-gray-900">
                {{ page?.code || '页面' }}
              </span>
              <Tag :color="typeColor[page?.type] || 'default'">
                {{ page?.type_label || '页面' }}
              </Tag>
              <span class="text-xs text-gray-400">ID: {{ page?.id }}</span>
            </div>
            <div class="text-xs text-gray-500 mt-0.5">
              当前编辑语言：<span class="font-medium text-blue-600">{{ selectedLocale }}</span>
            </div>
          </div>
        </div>

        <!-- 模式分段选择器 -->
        <div class="header-tabs">
          <RadioGroup v-model:value="activeTab" button-style="solid" size="middle">
            <RadioButton value="content">
              <span class="flex items-center gap-1.5 px-1">
                <Icon icon="lucide:paint-bucket" />
                <span>图文装修</span>
              </span>
            </RadioButton>
            <RadioButton value="schema">
              <span class="flex items-center gap-1.5 px-1">
                <Icon icon="lucide:boxes" />
                <span>数据块规则 (Schema)</span>
              </span>
            </RadioButton>
            <RadioButton value="seo">
              <span class="flex items-center gap-1.5 px-1">
                <Icon icon="lucide:globe" />
                <span>SEO 与语言</span>
              </span>
            </RadioButton>
          </RadioGroup>
        </div>

        <!-- 语言与快捷操作 -->
        <div class="header-right">
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500">语言版本</span>
            <Select
              v-model:value="selectedLocale"
              :options="localeOptions.map((l) => ({ label: l, value: l }))"
              style="width: 120px"
              size="middle"
            />
          </div>
          <Button type="text" class="close-btn" @click="handleClose">
            <Icon icon="lucide:x" class="text-lg text-gray-500" />
          </Button>
        </div>
      </div>
    </template>

    <!-- 工作台主体区域 -->
    <div class="studio-body">
      <!-- Tab 1: 图文内容装修 -->
      <div v-show="activeTab === 'content'" class="tab-content">
        <PageContentManager
          ref="contentManagerRef"
          :open="open && activeTab === 'content'"
          :page="page"
          :embed="true"
          :current-locale="selectedLocale"
          @switch-tab="(tab) => (activeTab = tab)"
          @refresh="emit('refresh')"
        />
      </div>

      <!-- Tab 2: 数据块结构定义 -->
      <div v-if="activeTab === 'schema'" class="tab-content">
        <PageSchemaEditor
          :page-id="pageId"
          :page-code="pageCode"
          :locale="selectedLocale"
          @saved="onSchemaSaved"
        />
      </div>

      <!-- Tab 3: SEO 与多语言 -->
      <div v-if="activeTab === 'seo'" class="tab-content">
        <PageSeoEditor
          :page-id="pageId"
          :page-code="pageCode"
          :locale="selectedLocale"
          @saved="onSeoSaved"
        />
      </div>
    </div>
  </Drawer>
</template>

<style scoped>
.studio-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  width: 100%;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #eff6ff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-tabs {
  margin: 0 auto;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 6px;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.studio-body {
  min-height: calc(100vh - 120px);
}

.tab-content {
  padding: 4px 0;
}
</style>

<style>
.page-studio-drawer .ant-drawer-header {
  padding: 12px 24px !important;
  border-bottom: 1px solid #f0f0f0;
}
.page-studio-drawer .ant-drawer-body {
  padding: 16px 24px !important;
  background: #fafbfc;
}
</style>
