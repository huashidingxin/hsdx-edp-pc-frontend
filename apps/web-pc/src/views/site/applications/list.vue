<script setup>
/**
 * 应用管理（卡片式）。
 *
 * 应用数量很少，不用 CRUD 表格。每张卡片 = 一个应用：
 * 名称/类型/状态/域名 + 快捷入口（与应用强关联的设置一点即进，
 * 进入时写入当前应用 id，目标页沿用各自的应用上下文）。
 */
import { computed, ref, onMounted } from 'vue';

import { useAccess } from '@vben/access';

import {
  Button,
  Drawer,
  Empty,
  Form,
  FormItem,
  Input,
  Modal,
  Popconfirm,
  Select,
  Spin,
  Switch,
  Tag,
  message,
} from 'antdv-next';

import { requestClient } from '#/api/request';
import Resource from '#/api/resource';

// 应用专属模块的抽屉宿主：复用同一页面组件，以 appId prop 指定应用
import FilesList from '../../config/files/list.vue';
import MenusList from '../../config/menus/list.vue';
import SettingsIndex from '../../config/settings/index.vue';
import UiStringsIndex from '../../config/ui-strings/index.vue';
import PagesList from '../pages/list.vue';
// 公共内容模块：也以抽屉打开，传入 appId 自动按应用过滤
import ArticlesList from '../../content/articles/list.vue';
import ProductsList from '../../content/products/list.vue';
import CategoriesList from '../../content/categories/list.vue';

const TYPE_OPTIONS = [
  { id: 1, name: '官网' },
  { id: 2, name: '小程序' },
  { id: 3, name: '公众号' },
];
const STATUS_OPTIONS = [
  { id: 0, name: '草稿' },
  { id: 1, name: '启用' },
  { id: 2, name: '停用' },
];
const SSL_OPTIONS = [
  { id: 0, name: '未配置' },
  { id: 1, name: '有效' },
  { id: 2, name: '过期' },
];
const typeMap = { 1: '官网', 2: '小程序', 3: '公众号' };
const typeColor = { 1: 'blue', 2: 'green', 3: 'purple' };
const statusMap = { 0: '草稿', 1: '启用', 2: '停用' };
const statusColor = { 0: 'default', 1: 'green', 2: 'red' };
const sslMap = { 0: '未配置', 1: '有效', 2: '过期' };

/* ===================== 权限（与原表格页一致：cms.page.*） ===================== */
let hasAccessByCodes = () => true;
try {
  const access = useAccess();
  hasAccessByCodes = access.hasAccessByCodes || (() => true);
} catch {
  // 不在权限上下文中时默认允许，页面级菜单权限已做第一道拦截
}
const canCreate = computed(() => hasAccessByCodes(['cms.page.create']));
const canEdit = computed(() => hasAccessByCodes(['cms.page.edit']));
const canDelete = computed(() => hasAccessByCodes(['cms.page.delete']));

/* ===================== 列表 ===================== */
const applications = ref([]);
const loading = ref(false);
const localeOptions = ref([]);

async function load() {
  loading.value = true;
  try {
    const { data } = await new Resource('applications').list({ per_page: 100 });
    applications.value = data || [];
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
}

/* ===================== 快捷入口 ===================== */
// 内容入口（公共模块，卡片抽屉内打开，自动按应用过滤）
const contentLinks = [
  { key: 'articles', label: '文章' },
  { key: 'products', label: '产品' },
  { key: 'categories', label: '分类' },
];
// 设置类（应用专属）：在卡片抽屉内打开同一页面组件，以 appId 指定应用
const settingLinks = [
  { key: 'pages', label: '页面' },
  { key: 'menus', label: '菜单' },
  { key: 'settings', label: '站点设置' },
  { key: 'ui-strings', label: 'UI 词条' },
  { key: 'files', label: '媒体库' },
];

const moduleMap = {
  pages: { title: '页面管理', component: PagesList, width: 1080 },
  menus: { title: '菜单管理', component: MenusList, width: 1080 },
  settings: { title: '站点设置', component: SettingsIndex, width: 920 },
  'ui-strings': { title: 'UI 词条', component: UiStringsIndex, width: 920 },
  files: { title: '媒体库', component: FilesList, width: 1080 },
  articles: { title: '文章管理', component: ArticlesList, width: 1080 },
  products: { title: '产品管理', component: ProductsList, width: 1080 },
  categories: { title: '分类管理', component: CategoriesList, width: 920 },
};

const moduleDrawer = ref({ open: false, key: null, app: null });
const moduleTitle = computed(() => moduleMap[moduleDrawer.value.key]?.title || '');
const moduleWidth = computed(() => moduleMap[moduleDrawer.value.key]?.width || 1000);

function openModule(key, app) {
  moduleDrawer.value = { open: true, key, app };
}

function closeModule() {
  moduleDrawer.value.open = false;
}

function primaryHost(app) {
  const domains = app?.domains || [];
  return domains.find((d) => d?.is_primary)?.host || domains[0]?.host || '-';
}

/* ===================== 新建 / 编辑 ===================== */
const formRef = ref();
const formOpen = ref(false);
const formSaving = ref(false);
const editing = ref(null);
const form = ref({
  name: '',
  code: '',
  type: 1,
  status: 1,
  default_locale: 'zh-CN',
  enabled_locales: [],
});
const formRules = {
  name: [{ required: true, message: '请填写应用名称', trigger: 'blur' }],
  code: [
    {
      pattern: /^[a-z0-9][a-z0-9-]*$/,
      message: '编码仅支持小写字母/数字/中划线',
      trigger: 'blur',
    },
  ],
};

function openCreate() {
  editing.value = null;
  form.value = {
    name: '',
    code: '',
    type: 1,
    status: 1,
    default_locale: 'zh-CN',
    enabled_locales: [],
  };
  formOpen.value = true;
}

function openEdit(app) {
  editing.value = app;
  form.value = {
    name: app.name || '',
    code: app.code || '',
    type: app.type ?? 1,
    status: app.status ?? 1,
    default_locale: app.default_locale || 'zh-CN',
    enabled_locales: [...(app.enabled_locales || [])],
  };
  formOpen.value = true;
}

async function saveForm() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  formSaving.value = true;
  try {
    const payload = {
      name: form.value.name,
      code: form.value.code || undefined,
      type: form.value.type,
      status: form.value.status,
      default_locale: form.value.default_locale,
      enabled_locales: form.value.enabled_locales,
    };
    if (editing.value) {
      await new Resource('applications').update(editing.value.id, payload);
      message.success('应用已更新');
    } else {
      await new Resource('applications').store(payload);
      message.success('应用已创建');
    }
    formOpen.value = false;
    await load();
  } catch (error) {
    console.error(error);
  } finally {
    formSaving.value = false;
  }
}

async function removeApp(app) {
  try {
    await new Resource('applications').destroy(app.id);
    message.success('应用已删除');
    await load();
  } catch (error) {
    console.error(error);
  }
}

/* ===================== 域名管理抽屉（沿用原逻辑） ===================== */
const domainOpen = ref(false);
const domainApp = ref(null);
const domainEditing = ref(null);
const domainSaving = ref(false);
const domainForm = ref({ host: '', is_primary: 0, redirect_to_primary: 0, ssl_status: 0 });

function openDomains(app) {
  domainApp.value = app;
  domainEditing.value = null;
  domainForm.value = { host: '', is_primary: 0, redirect_to_primary: 0, ssl_status: 0 };
  domainOpen.value = true;
}

function editDomain(domain) {
  domainEditing.value = domain;
  domainForm.value = { ...domain };
}

function newDomain() {
  domainEditing.value = null;
  domainForm.value = { host: '', is_primary: 0, redirect_to_primary: 0, ssl_status: 0 };
}

async function saveDomain() {
  if (!domainForm.value.host) {
    message.warning('请填写域名');
    return;
  }
  domainSaving.value = true;
  try {
    if (domainEditing.value) {
      await requestClient.patch(
        `/applications/${domainApp.value.id}/domains/${domainEditing.value.id}`,
        domainForm.value,
      );
    } else {
      await requestClient.post(`/applications/${domainApp.value.id}/domains`, domainForm.value);
    }
    message.success('域名已保存');
    newDomain();
    await load();
    domainApp.value = applications.value.find((a) => a.id === domainApp.value.id) || domainApp.value;
  } catch {
    message.error('保存失败');
  } finally {
    domainSaving.value = false;
  }
}

async function deleteDomain(domain) {
  try {
    await requestClient.delete(
      `/applications/${domainApp.value.id}/domains/${domain.id}`,
    );
    message.success('域名已删除');
    await load();
    domainApp.value = applications.value.find((a) => a.id === domainApp.value.id) || domainApp.value;
  } catch {
    message.error('删除失败');
  }
}

function hostText(domain) {
  return domain?.host || '-';
}

onMounted(async () => {
  load();
  try {
    const { data } = await new Resource('applications/locale-catalog').list({});
    localeOptions.value = data || [];
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div class="app-cards-page p-4">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <span class="text-base font-medium">应用管理</span>
        <span class="ml-2 text-xs text-gray-400">
          共 {{ applications.length }} 个应用 · 点卡片快捷入口直接进入该应用的页面/菜单/设置
        </span>
      </div>
      <Button v-if="canCreate" type="primary" @click="openCreate">新建应用</Button>
    </div>

    <Spin :spinning="loading">
      <div v-if="applications.length" class="app-grid">
        <div v-for="app in applications" :key="app.id" class="app-card">
          <div class="card-head">
            <span class="card-name">{{ app.name }}</span>
            <Tag :color="typeColor[app.type] || 'default'">{{ typeMap[app.type] || '-' }}</Tag>
            <Tag :color="statusColor[app.status] || 'default'">{{ statusMap[app.status] || '-' }}</Tag>
          </div>
          <div class="card-meta">
            <span v-if="app.code" class="meta-code">{{ app.code }}</span>
            <span class="meta-host">{{ primaryHost(app) }}</span>
          </div>
          <div class="card-meta">
            <span class="meta-lang">默认 {{ app.default_locale || '-' }}</span>
            <span class="meta-lang">启用 {{ (app.enabled_locales || []).length }} 种语言</span>
          </div>

          <div class="card-group">
            <span class="group-label">内容</span>
            <Button
              v-for="link in contentLinks"
              :key="link.key"
              size="small"
              type="link"
              class="entry-btn"
              @click="openModule(link.key, app)"
            >
              {{ link.label }}
            </Button>
          </div>
          <div class="card-group">
            <span class="group-label">设置</span>
            <Button
              v-for="link in settingLinks"
              :key="link.key"
              size="small"
              type="link"
              class="entry-btn"
              @click="openModule(link.key, app)"
            >
              {{ link.label }}
            </Button>
            <Button size="small" type="link" class="entry-btn" @click="openDomains(app)">
              域名
            </Button>
          </div>

          <div class="card-foot">
            <Button v-if="canEdit" size="small" @click="openEdit(app)">编辑</Button>
            <Popconfirm title="确定删除该应用吗？其页面/菜单/设置将一并删除。" @confirm="removeApp(app)">
              <Button v-if="canDelete" size="small" danger>删除</Button>
            </Popconfirm>
          </div>
        </div>
      </div>
      <Empty v-else-if="!loading" description="暂无应用，请先创建" />
    </Spin>

    <Modal
      v-model:open="formOpen"
      :title="editing ? `编辑应用 - ${editing.name}` : '新建应用'"
      :confirm-loading="formSaving"
      ok-text="保存"
      cancel-text="取消"
      width="560"
      @ok="saveForm"
    >
      <Form ref="formRef" :model="form" :rules="formRules" layout="vertical">
        <FormItem label="名称" name="name" required>
          <Input v-model:value="form.name" placeholder="如 廊坊首创磨具官网" />
        </FormItem>
        <FormItem label="编码" name="code">
          <Input v-model:value="form.code" placeholder="如 demo-site（小写字母/数字/中划线，留空自动生成）" />
        </FormItem>
        <div class="grid grid-cols-2 gap-3">
          <FormItem label="类型" name="type">
            <Select
              v-model:value="form.type"
              :options="TYPE_OPTIONS"
              :field-names="{ label: 'name', value: 'id' }"
            />
          </FormItem>
          <FormItem label="状态" name="status">
            <Select
              v-model:value="form.status"
              :options="STATUS_OPTIONS"
              :field-names="{ label: 'name', value: 'id' }"
            />
          </FormItem>
        </div>
        <FormItem label="默认语言" name="default_locale">
          <Select
            v-model:value="form.default_locale"
            :options="localeOptions"
            :field-names="{ label: 'label', value: 'code' }"
            show-search
          />
        </FormItem>
        <FormItem label="启用语言" name="enabled_locales">
          <Select
            v-model:value="form.enabled_locales"
            mode="multiple"
            :options="localeOptions"
            :field-names="{ label: 'label', value: 'code' }"
            show-search
          />
        </FormItem>
      </Form>
    </Modal>

    <Drawer
      :open="domainOpen"
      :title="`域名管理 - ${domainApp?.name || ''}`"
      width="560"
      @close="domainOpen = false"
    >
      <div class="mb-4 rounded border border-gray-200 p-3">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-sm font-medium text-gray-700">
            {{ domainEditing ? '编辑域名' : '新增域名' }}
          </span>
          <Button size="small" @click="newDomain">新增</Button>
        </div>
        <Form layout="vertical" :model="domainForm">
          <FormItem label="域名" required>
            <Input
              v-model:value="domainForm.host"
              placeholder="如 www.example.com"
            />
          </FormItem>
          <div class="flex flex-wrap gap-4">
            <FormItem label="主域名">
              <Switch
                v-model:checked="domainForm.is_primary"
                :checked-value="1"
                :un-checked-value="0"
              />
            </FormItem>
            <FormItem label="重定向到主域名">
              <Switch
                v-model:checked="domainForm.redirect_to_primary"
                :checked-value="1"
                :un-checked-value="0"
              />
            </FormItem>
            <FormItem label="SSL 状态">
              <Select
                v-model:value="domainForm.ssl_status"
                :options="SSL_OPTIONS"
                :field-names="{ label: 'name', value: 'id' }"
                style="width: 160px"
              />
            </FormItem>
          </div>
          <div class="flex justify-end gap-2">
            <Button size="small" @click="newDomain">重置</Button>
            <Button
              size="small"
              type="primary"
              :loading="domainSaving"
              @click="saveDomain"
            >
              保存
            </Button>
          </div>
        </Form>
      </div>

      <div class="space-y-2">
        <div
          v-for="d in domainApp?.domains || []"
          :key="d.id"
          class="flex items-center justify-between rounded border border-gray-200 px-3 py-2"
        >
          <div class="min-w-0">
            <div class="text-sm text-gray-800">
              {{ hostText(d) }}
              <Tag v-if="d.is_primary" color="blue">主</Tag>
              <Tag v-if="d.redirect_to_primary">重定向</Tag>
            </div>
            <div class="text-xs text-gray-500">SSL：{{ sslMap[d.ssl_status] || '-' }}</div>
          </div>
          <div class="flex shrink-0 gap-2">
            <Button size="small" @click="editDomain(d)">编辑</Button>
            <Popconfirm title="确定删除该域名吗？" @confirm="deleteDomain(d)">
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          </div>
        </div>
        <div v-if="!domainApp?.domains?.length" class="py-6 text-center text-gray-400">
          暂无域名
        </div>
      </div>
    </Drawer>

    <Drawer
      :open="moduleDrawer.open"
      :title="moduleTitle"
      :width="moduleWidth"
      destroy-on-close
      @close="closeModule"
    >
      <component
        :is="moduleMap[moduleDrawer.key]?.component"
        v-if="moduleDrawer.open && moduleDrawer.app"
        :app-id="moduleDrawer.app.id"
      />
    </Drawer>
  </div>
</template>

<style scoped>
.app-cards-page {
  min-height: 100%;
  background: transparent;
}

.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}

.app-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-name {
  font-size: 16px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.meta-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 6px;
  border-radius: 4px;
}

.meta-host {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
}

.group-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  margin-right: 4px;
}

.entry-btn {
  padding: 0 6px;
  height: 24px;
  font-size: 13px;
}

.card-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px dashed rgba(0, 0, 0, 0.08);
}
</style>
