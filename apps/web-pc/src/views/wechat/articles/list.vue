<script setup>
/**
 * 公众号图文同步（应用类型=公众号）。
 *
 * 这里的每一行都不是「新建的内容」，而是**源内容在微信公众号这一侧的投影**：
 * 源内容仍归租户全局所有（官网/小程序照常使用），公众号正文是适配后的一份副本，
 * 可以随便改，改坏了点「重新生成」重新对齐源内容即可。
 *
 * 主要操作都收在编辑器抽屉里（左表单右手机预览），列表只做筛选与发起。
 */
import { computed, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon as Icon } from '@vben/icons';

import { Button, Drawer, message, Tag, Tooltip } from 'antdv-next';

import { getCurrentApplicationId } from '#/api/application-context';
import {
  draftWechatArticleApi,
  publishWechatArticleApi,
  refreshWechatArticleApi,
} from '#/api/core/wechat';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { useCurrentAppStore } from '#/store/current-app';

import WechatSettingsIndex from '../settings/index.vue';
import SyncTargetPicker from './_components/SyncTargetPicker.vue';
import WechatArticleEditor from './_components/WechatArticleEditor.vue';

const props = defineProps({
  /** 嵌入应用卡片抽屉时由宿主指定应用 */
  appId: { type: [Number, String], default: null },
});

/** 权限：发布单独一枚 cms.wechat.publish，其余写操作 cms.wechat.write */
let hasAccessByCodes = () => true;
try {
  const access = useAccess();
  hasAccessByCodes = access.hasAccessByCodes || (() => true);
} catch {
  // 不在权限上下文中时默认允许，页面级菜单权限已做第一道拦截
}
const canWrite = computed(() => hasAccessByCodes(['cms.wechat.write']));
const canPublish = computed(() => hasAccessByCodes(['cms.wechat.publish']));

const crudRef = ref(null);
const appStore = useCurrentAppStore();
/** 兜底表单的值容器：正常不走 CRUD 自带表单，但 v-model 是必填 prop */
const formData = ref({});

const appIdNum = computed(() => Number(props.appId) || Number(getCurrentApplicationId()) || null);
const locales = computed(() => appStore.currentApp?.enabled_locales || []);
const defaultLocale = computed(() => appStore.currentApp?.default_locale || 'zh-CN');

const STATUS_COLOR = {
  draft: 'default',
  drafted: 'blue',
  published: 'green',
  failed: 'red',
};

const filterFields = ref([
  { field: 'keyword', label: '标题', type: 'text', span: 6 },
  { field: 'content_type', label: '内容类型', type: 'text', span: 6 },
  {
    field: 'status',
    label: '同步状态',
    type: 'select',
    span: 6,
    attrs: {
      options: [
        { id: 'draft', name: '未同步' },
        { id: 'drafted', name: '已进草稿箱' },
        { id: 'published', name: '已发布' },
        { id: 'failed', name: '同步失败' },
      ],
      fieldNames: { label: 'name', value: 'id' },
    },
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'cover_url', title: '封面', width: 76, slots: { default: 'default_cover' } },
  { field: 'title', title: '标题', minWidth: 220 },
  { field: 'content_type_label', title: '源内容', width: 150, slots: { default: 'default_source' } },
  { field: 'status', title: '状态', width: 110, slots: { default: 'default_status' } },
  { field: 'article_url', title: '图文链接', width: 110, slots: { default: 'default_url' } },
  { field: 'synced_at', title: '生成时间', width: 170 },
  { field: 'published_at', title: '发布时间', width: 170 },
  { field: 'updated_at', title: '更新时间', minWidth: 170 },
]);

/** 兜底表单：正常走自定义抽屉，保留它是为了详情视图不会渲染成空壳 */
const formFields = ref([
  { field: 'title', label: '标题', type: 'text', span: 24 },
  { field: 'author', label: '作者', type: 'text', span: 12 },
  { field: 'digest', label: '摘要', type: 'textarea', span: 12 },
  { field: 'cover_path', label: '封面', type: 'image', span: 12 },
  { field: 'content_source_url', label: '原文链接', type: 'text', span: 12 },
  { field: 'content_html', label: '正文', type: 'editor', span: 24 },
]);

const actionsConfig = ref([
  {
    // 编辑走自定义抽屉（左表单右手机预览），不用 CRUD 自带表单
    key: 'edit',
    label: '编辑',
    icon: 'lucide:pen-line',
    permission: 'edit',
    onClick: (row) => openEditor(row),
    order: 10,
  },
  { key: 'view', visible: () => false },
  {
    key: 'wechat_publish',
    label: '发布',
    icon: 'lucide:upload-cloud',
    permission: 'publish',
    confirm: true,
    confirmTitle: '发布后将在公众号可见，确定继续吗？',
    onClick: (row) => submitPublish(row),
    order: 30,
  },
  {
    key: 'wechat_draft',
    label: '存草稿',
    icon: 'lucide:save',
    permission: 'edit',
    onClick: (row) => submitDraft(row),
    order: 40,
  },
  {
    key: 'wechat_refresh',
    label: '重新生成',
    icon: 'lucide:refresh-cw',
    permission: 'edit',
    confirm: true,
    confirmTitle: '会用源内容覆盖当前正文（人工改动会丢失），确定继续吗？',
    onClick: (row) => submitRefresh(row),
    order: 50,
  },
]);

/* ===================== 编辑器抽屉 ===================== */
const editorOpen = ref(false);
const editorRow = ref(null);
/** 创建模式的试算结果（未落库）：传给编辑器做预览与调整 */
const editorPreview = ref(null);

function openEditor(row) {
  editorRow.value = row;
  editorPreview.value = null;
  editorOpen.value = true;
}

/** 选择内容后只拿到试算结果，进编辑器预览并调整，确认样式后才同步 */
function onPreviewed({ preview, warnings }) {
  editorRow.value = null;
  editorPreview.value = { ...preview, warnings };
  editorOpen.value = true;
}

/** 确认同步后：编辑器切到编辑模式，父级换成真实行并刷新列表 */
function onCommitted(article) {
  if (article?.id) {
    editorRow.value = article;
    editorPreview.value = null;
  }
  refreshList();
}

function refreshList() {
  crudRef.value?.refresh();
}

/* ===================== 行内快捷操作 ===================== */
async function submitDraft(row) {
  try {
    await draftWechatArticleApi(row.id);
    message.success('已写入微信草稿箱');
    refreshList();
  } catch (error) {
    message.error(error?.message || '写入草稿失败');
  }
}

async function submitRefresh(row) {
  try {
    await refreshWechatArticleApi(row.id);
    message.success('已按源内容重新生成');
    refreshList();
  } catch (error) {
    message.error(error?.message || '重新生成失败');
  }
}

async function submitPublish(row) {
  try {
    await publishWechatArticleApi(row.id);
    message.success('已发布');
    refreshList();
  } catch (error) {
    message.error(error?.message || '发布失败');
  }
}

/* ===================== 选择同步源 ===================== */
const pickerOpen = ref(false);

/* ===================== 公众号设置抽屉 ===================== */
const settingsOpen = ref(false);

onMounted(async () => {
  await appStore.loadApplications();
  const id = Number(props.appId);
  if (id > 0 && id !== Number(appStore.currentAppId)) {
    appStore.selectApp(id);
  }
});
</script>

<template>
  <AppCrudTable
    ref="crudRef"
    api-url="wechat-articles"
    v-model="formData"
    :filter-fields="filterFields"
    :fields="formFields"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :actions-config="actionsConfig"
    :inline-actions="['edit', 'wechat_publish', 'delete']"
    :toolbar="{ filter: true, create: false, refresh: true, print: false, export: false, more: false }"
    permission-name="cms.wechat"
    title="公众号图文同步"
    class="p-4"
  >
    <template #sub-title>
      <span class="text-xs text-gray-400">
        源内容仍归租户全局所有，这里只是它在公众号的副本：随便改，改坏了用「重新生成」对齐源内容
      </span>
    </template>

    <template #toolbar-append>
      <Button v-if="canWrite" type="primary" class="mr-2" @click="pickerOpen = true">
        <Icon icon="lucide:plus" class="mr-1" />
        选择内容同步
      </Button>
      <Button class="mr-2" @click="settingsOpen = true">
        <Icon icon="lucide:settings-2" class="mr-1" />
        公众号设置
      </Button>
    </template>

    <template #default_cover="{ row }">
      <img
        v-if="row.cover_url"
        :src="row.cover_url"
        alt=""
        class="h-9 w-14 rounded object-cover"
      />
      <span v-else class="text-xs text-gray-400">-</span>
    </template>

    <template #default_source="{ row }">
      <div class="flex flex-col leading-tight">
        <span class="text-xs">{{ row.content_type_label || row.content_type }}</span>
        <span class="text-xs text-gray-400">
          #{{ row.content_id }}<template v-if="row.locale"> · {{ row.locale }}</template>
        </span>
      </div>
    </template>

    <template #default_status="{ row }">
      <div class="flex flex-col gap-0.5 leading-tight">
        <Tag :color="STATUS_COLOR[row.status] || 'default'">
          {{ row.status_label }}
        </Tag>
        <Tooltip v-if="row.last_error" :title="row.last_error">
          <span class="cursor-help text-xs text-red-500">查看失败原因</span>
        </Tooltip>
      </div>
    </template>

    <template #default_url="{ row }">
      <a
        v-if="row.article_url"
        :href="row.article_url"
        target="_blank"
        rel="noopener"
        class="text-xs text-primary"
      >
        打开
      </a>
      <span v-else class="text-xs text-gray-400">-</span>
    </template>
  </AppCrudTable>

  <SyncTargetPicker
    v-model:open="pickerOpen"
    :locales="locales"
    :default-locale="defaultLocale"
    @previewed="onPreviewed"
  />

  <WechatArticleEditor
    v-model:open="editorOpen"
    :row="editorRow"
    :preview="editorPreview"
    :can-write="canWrite"
    :can-publish="canPublish"
    @saved="refreshList"
    @committed="onCommitted"
  />

  <Drawer
    v-model:open="settingsOpen"
    title="公众号设置"
    width="920"
    destroy-on-close
  >
    <WechatSettingsIndex :app-id="appIdNum" />
  </Drawer>
</template>
