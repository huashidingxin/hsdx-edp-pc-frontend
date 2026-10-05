<script setup>
/**
 * 菜单项树形管理器
 *
 * 旧 list.vue 的抽屉只 v-for 顶层节点，子项不可见；表单仅 zh-CN 标题 + url + sort，
 * 缺 parent_id / link_type / 多语言 titles / status / meta。本组件重做：
 *
 * - antdv-next Tree（draggable + block-node）渲染层级，拖拽重排 + 调级，落点后
 *   逐条 PATCH parent_id/sort。
 * - 编辑 Modal：父级 TreeSelect、多语言 titles、link_type + link_value（按类型
 *   切换 Select）、sort、status、完整 Mega meta（variant/columns/featured/
 *   active_prefixes/hidden_locales）+ meta JSON 兜底。
 *
 * 后端 MenuController::storeItem/updateItem 已校验接收全部字段；deleteItem 已把
 * 子项 parent_id 置空（升为顶级）。本组件纯前端，不改后端。
 */
import { computed, reactive, ref, watch } from 'vue';

import {
  Button,
  Collapse,
  CollapsePanel,
  Drawer,
  Form,
  FormItem,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Tag,
  Tree,
  TreeSelect,
  message,
} from 'antdv-next';

import Resource from '#/api/resource';
import { requestClient } from '#/api/request';
import AppUpload from '#/components/AppUpload.vue';
import LocaleTabsEditor from '#/components/LocaleTabsEditor.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  menu: { type: Object, default: null },
});

const emit = defineEmits(['update:open', 'refresh']);

/** 顶层“无父级”占位 id（TreeSelect 用） */
const ROOT_KEY = 'root';

const LINK_TYPES = {
  1: { label: '外链', value: 1 },
  2: { label: '页面', value: 2 },
  3: { label: '分类', value: 3 },
  4: { label: '文章', value: 4 },
};
const linkTypeOptions = Object.values(LINK_TYPES);

/** 主语种（tenant/locale-config.default_locale），树标题按它优先展示 */
const defaultLocale = ref('zh-CN');

function itemTitle(item) {
  const t = item?.titles || {};
  if (t[defaultLocale.value]) return t[defaultLocale.value];
  // 回退：任意非空 → link_value → '-'
  return (
    Object.values(t).find(Boolean) ||
    item?.link_value ||
    '-'
  );
}

function linkTypeLabel(item) {
  return item?.link_type_label || LINK_TYPES[item?.link_type]?.label || '外链';
}

/* ------------------------------------------------------------------ *
 * 数据：页面 / 分类 / 文章 下拉源（语种走 LocaleTabsEditor 内部 locale-config）
 * ------------------------------------------------------------------ */
const pages = ref([]);
const categories = ref([]);
const articles = ref([]);

async function loadOptions() {
  try {
    const cfg = await requestClient.get('tenant/locale-config');
    if (cfg?.default_locale) defaultLocale.value = cfg.default_locale;
    if (Array.isArray(cfg?.enabled_locales) && cfg.enabled_locales.length > 0) {
      enabledLocales.value = cfg.enabled_locales;
    }
  } catch (error) {
    console.error(error);
  }
  try {
    const { data } = await new Resource('pages').list({ per_page: 100 });
    pages.value = data || [];
  } catch (error) {
    console.error(error);
    pages.value = [];
  }
  try {
    const { data } = await new Resource('categories').list({ per_page: 100 });
    categories.value = (data || []).map((c) => ({
      id: c.id,
      name: c.locales?.[0]?.name || `#${c.id}`,
    }));
  } catch (error) {
    console.error(error);
    categories.value = [];
  }
  try {
    const { data } = await new Resource('articles').list({ per_page: 100 });
    articles.value = (data || []).map((a) => ({
      id: a.id,
      // 详情 locales[0] 已按默认语种排序，取其标题作为展示名
      name: a.locales?.[0]?.title || `#${a.id}`,
    }));
  } catch (error) {
    console.error(error);
    articles.value = [];
  }
}

/* ------------------------------------------------------------------ *
 * 树
 * ------------------------------------------------------------------ */
const treeData = computed(() => buildTreeNodes(props.menu?.items || []));
/** 展开节点：默认全展开，保证子项可见可管 */
const expandedKeys = ref([]);
watch(
  treeData,
  (nodes) => {
    expandedKeys.value = collectKeys(nodes);
  },
  { immediate: true },
);

function buildTreeNodes(items) {
  const nodes = new Map(
    (items || []).map((i) => [i.id, { ...i, children: [] }]),
  );
  const roots = [];
  (items || []).forEach((i) => {
    const node = nodes.get(i.id);
    if (i.parent_id && nodes.has(i.parent_id)) {
      nodes.get(i.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots.map((n) => toNode(n));
}

function toNode(raw) {
  return {
    key: String(raw.id),
    raw,
    title: itemTitle(raw),
    children: (raw.children || []).map(toNode),
  };
}

function collectKeys(nodes, acc = []) {
  for (const n of nodes) {
    acc.push(n.key);
    if (n.children?.length) collectKeys(n.children, acc);
  }
  return acc;
}

/** TreeSelect 用的树（含“无父级”虚拟根） */
const parentTreeData = computed(() => [
  {
    key: ROOT_KEY,
    value: ROOT_KEY,
    title: '（无父级 / 顶层）',
    children: buildParentTree(props.menu?.items || []),
  },
]);

function buildParentTree(items) {
  return buildTreeNodes(items).map((n) => ({
    key: n.key,
    value: n.key,
    title: itemTitle(n.raw),
    children: n.children,
  }));
}

/** 编辑时父级下拉需排除自身及子孙，防止把自己挂到自己子树下成环 */
function buildParentTreeExcluding(excludeId) {
  const items = props.menu?.items || [];
  const ids = new Set([excludeId]);
  // 收集 excludeId 的全部子孙
  const byParent = new Map();
  items.forEach((i) => {
    const k = i.parent_id ?? 0;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(i);
  });
  const stack = [excludeId];
  while (stack.length) {
    const cur = stack.pop();
    for (const child of byParent.get(cur) || []) {
      if (!ids.has(child.id)) {
        ids.add(child.id);
        stack.push(child.id);
      }
    }
  }
  const filtered = items.filter((i) => !ids.has(i.id));
  return [
    {
      key: ROOT_KEY,
      value: ROOT_KEY,
      title: '（无父级 / 顶层）',
      children: buildTreeNodes(filtered).map((n) => ({
        key: n.key,
        value: n.key,
        title: itemTitle(n.raw),
        children: n.children,
      })),
    },
  ];
}

/** 阻止把节点拖进自身子孙（前端防环；后端 updateItem 也会校验） */
function allowDrop({ dragNode, dropNode, dropPosition }) {
  if (!dragNode || !dropNode) return true;
  if (dragNode.key === dropNode.key) return false;
  const dragRaw = dragNode.raw ?? dragNode;
  const dropRaw = dropNode.raw ?? dropNode;
  if (dropPosition === 0) {
    // 成为 dropNode 的子项：dropNode 不能是 dragNode 的子孙
    return !isDescendant(Number(dragRaw.id), Number(dropRaw.id));
  }
  return true;
}

function isDescendant(ancestorId, maybeChildId) {
  const items = props.menu?.items || [];
  const byParent = new Map();
  items.forEach((i) => {
    const k = i.parent_id ?? 0;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(i);
  });
  const stack = [ancestorId];
  while (stack.length) {
    const cur = stack.pop();
    for (const child of byParent.get(cur) || []) {
      if (child.id === maybeChildId) return true;
      stack.push(child.id);
    }
  }
  return false;
}

async function onDrop(info) {
  const menuId = props.menu?.id;
  if (!menuId) return;
  const dragNode = info.dragNode || {};
  const dropNode = info.node || {};
  const dragId = Number(dragNode.raw?.id ?? dragNode.key);
  const dropRaw = dropNode.raw ?? dropNode;
  const dropId = Number(dropRaw?.id);
  // dropPosition: 0=成为 dropNode 子项；-1/1=dropNode 前/后（同级）
  const dp = info.dropPosition;
  const dropToGap = info.dropToGap === true;

  let parentId;
  const items = props.menu?.items || [];
  if (dp === 0 && !dropToGap) {
    parentId = dropId;
  } else {
    parentId = dropRaw?.parent_id ?? null;
  }

  // 计算新顺序：取目标父项当前子项（剔除拖动项），按 dp 插入
  const siblings = items.filter(
    (i) => (i.parent_id ?? null) === parentId && i.id !== dragId,
  );
  let insertIndex = siblings.length;
  if (dp === 0 && !dropToGap) {
    insertIndex = siblings.length; // 成为子项，放末尾
  } else {
    const dropIdx = siblings.findIndex((i) => i.id === dropId);
    if (dropIdx !== -1) {
      insertIndex = dp < 0 ? dropIdx : dropIdx + 1;
    }
  }
  siblings.splice(insertIndex, 0, {
    id: dragId,
    parent_id: parentId,
    sort: 0,
  });

  const ordered = siblings.map((i, idx) => ({
    id: i.id,
    parent_id: i.parent_id,
    sort: idx,
  }));

  try {
    for (const it of ordered) {
      await requestClient.patch(`/menus/${menuId}/items/${it.id}`, {
        parent_id: it.parent_id,
        sort: it.sort,
      });
    }
    message.success('已调整');
    emit('refresh');
  } catch {
    message.error('调整失败');
  }
}

/* ------------------------------------------------------------------ *
 * 编辑表单
 * ------------------------------------------------------------------ */
const editingOpen = ref(false);
const editingId = ref(null); // null=新增
const saving = ref(false);
/** Mega 菜单的 Featured 图片上传控件（AppUpload 不自动上传，保存前要手动 flush）。 */
const featuredUploadRef = ref(null);

/**
 * AppUpload 有意不自动上传：选中的文件先以 `{ url: 'blob:...', file: File }` 挂在表单上，
 * 必须在**真正保存那一刻**调用 upload()（同 AppCrudTable / LocaleTabsEditor 的约定），
 * 否则 meta.featured.image 里会写进 blob 地址甚至整个 FileItem 对象。
 */
async function flushFeaturedUpload() {
  if (typeof featuredUploadRef.value?.upload === 'function') {
    await featuredUploadRef.value.upload();
  }
}
const form = reactive({
  parent_id: ROOT_KEY,
  /** 多语言标题：[{locale, title}]，LocaleTabsEditor 双向绑定 */
  titleLocales: [],
  link_type: 1,
  link_value: '',
  meta_category_id: undefined,
  meta_article_id: undefined,
  sort: 0,
  status: 1,
  variant: '',
  columns: 2,
  featured: {
    image: '',
    image_alt: '',
    eyebrow: '',
    title: '',
    description: '',
    href: '',
  },
  active_prefixes: '',
  hidden_locales: [],
  meta_json: '{}',
});
const metaJsonError = ref('');

const isEditing = computed(() => editingId.value !== null);
const editorParentTree = computed(() =>
  isEditing.value
    ? buildParentTreeExcluding(editingId.value)
    : parentTreeData.value,
);

function openCreate(parentId = ROOT_KEY) {
  editingId.value = null;
  resetForm();
  form.parent_id = parentId;
  editingOpen.value = true;
}

function openEdit(item) {
  editingId.value = item.id;
  resetForm();
  form.parent_id = item.parent_id ? String(item.parent_id) : ROOT_KEY;
  // titles { code: text } → titleLocales [{ locale, title }]，供 LocaleTabsEditor
  form.titleLocales = Object.entries(item.titles || {}).map(([locale, title]) => ({
    locale,
    title,
  }));
  form.link_type = item.link_type ?? 1;
  form.link_value = item.link_value || '';
  form.meta_category_id = item.meta?.category_id
    ? Number(item.meta.category_id)
    : undefined;
  form.meta_article_id = item.meta?.article_id
    ? Number(item.meta.article_id)
    : undefined;
  form.sort = item.sort ?? 0;
  form.status = item.status ?? 1;
  const meta = item.meta || {};
  form.variant = meta.variant === 'mega' ? 'mega' : '';
  form.columns = meta.columns ?? 2;
  form.featured = {
    image: meta.featured?.image || '',
    image_alt: meta.featured?.image_alt || '',
    eyebrow: meta.featured?.eyebrow || '',
    title: meta.featured?.title || '',
    description: meta.featured?.description || '',
    href: meta.featured?.href || '',
  };
  form.active_prefixes = (meta.active_prefixes || []).join('\n');
  form.hidden_locales = meta.hidden_locales || [];
  form.meta_json = JSON.stringify(simplifyMeta(meta) || {}, null, 2);
  editingOpen.value = true;
}

function resetForm() {
  form.parent_id = ROOT_KEY;
  form.titleLocales = [];
  form.link_type = 1;
  form.link_value = '';
  form.meta_category_id = undefined;
  form.meta_article_id = undefined;
  form.sort = 0;
  form.status = 1;
  form.variant = '';
  form.columns = 2;
  form.featured = {
    image: '',
    image_alt: '',
    eyebrow: '',
    title: '',
    description: '',
    href: '',
  };
  form.active_prefixes = '';
  form.hidden_locales = [];
  form.meta_json = '{}';
  metaJsonError.value = '';
}

/** titleLocales [{locale,title}] → titles { code: text } */
function titlesFromLocales(list) {
  const out = {};
  for (const l of list || []) {
    if (l.locale && l.title !== '' && l.title !== null && l.title !== undefined) {
      out[l.locale] = l.title;
    }
  }
  return out;
}

/** meta JSON 兜底区只保留没有专用 UI 的键 */
function simplifyMeta(meta) {
  const known = new Set([
    'variant',
    'columns',
    'featured',
    'active_prefixes',
    'hidden_locales',
    'category_id',
    'article_id',
  ]);
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) {
    if (!known.has(k)) out[k] = v;
  }
  return out;
}

function buildMetaPayload() {
  let parsed = {};
  if (form.meta_json && form.meta_json.trim() !== '{}' && form.meta_json.trim()) {
    try {
      parsed = JSON.parse(form.meta_json);
      metaJsonError.value = '';
    } catch (error) {
      metaJsonError.value = `JSON 解析失败：${error.message}`;
      return null;
    }
  }
  const meta = { ...parsed };
  if (form.variant === 'mega') {
    meta.variant = 'mega';
    meta.columns = Math.min(Math.max(Number(form.columns) || 2, 1), 4);
    const featured = {};
    for (const [k, v] of Object.entries(form.featured)) {
      if (v !== '' && v !== null && v !== undefined) featured[k] = v;
    }
    if (Object.keys(featured).length) meta.featured = featured;
    else delete meta.featured;
  } else {
    delete meta.variant;
    delete meta.featured;
  }
  const ap = (form.active_prefixes || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && s.startsWith('/'));
  if (ap.length) meta.active_prefixes = ap;
  else delete meta.active_prefixes;
  if (form.hidden_locales?.length) meta.hidden_locales = form.hidden_locales;
  else delete meta.hidden_locales;
  if (form.link_type === 3 && form.meta_category_id) {
    meta.category_id = Number(form.meta_category_id);
  } else {
    delete meta.category_id;
  }
  if (form.link_type === 4 && form.meta_article_id) {
    meta.article_id = Number(form.meta_article_id);
  } else {
    delete meta.article_id;
  }
  return meta;
}

function buildPayload() {
  const titles = titlesFromLocales(form.titleLocales);
  const meta = buildMetaPayload();
  if (meta === null) return null;
  const parent = form.parent_id === ROOT_KEY ? null : Number(form.parent_id);
  return {
    parent_id: parent,
    titles,
    link_type: Number(form.link_type) || 1,
    link_value: form.link_value || null,
    sort: Number(form.sort) || 0,
    // 0（停用）是合法值，不能写 `|| 1`；只在拿不到数字时才兜「启用」。
    status: Number.isFinite(Number(form.status)) ? Number(form.status) : 1,
    meta,
  };
}

async function saveItem() {
  const menuId = props.menu?.id;
  if (!menuId) return;
  saving.value = true;
  try {
    // 先把待上传的 Featured 图片传完，再组装 payload —— 否则拿到的是 blob 地址/FileItem。
    await flushFeaturedUpload();
    const payload = buildPayload();
    if (!payload) {
      message.error(metaJsonError.value || '保存失败');
      return;
    }
    if (editingId.value) {
      await requestClient.patch(
        `/menus/${menuId}/items/${editingId.value}`,
        payload,
      );
    } else {
      await requestClient.post(`/menus/${menuId}/items`, payload);
    }
    message.success('已保存');
    editingOpen.value = false;
    emit('refresh');
  } catch (error) {
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error?.message ||
      '保存失败';
    message.error(msg);
  } finally {
    saving.value = false;
  }
}

async function deleteItem(item) {
  const menuId = props.menu?.id;
  if (!menuId) return;
  try {
    await requestClient.delete(`/menus/${menuId}/items/${item.id}`);
    message.success('已删除');
    emit('refresh');
  } catch (error) {
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error?.message ||
      '删除失败';
    message.error(msg);
  }
}

/* ------------------------------------------------------------------ *
 * 抽屉打开时加载下拉源
 * ------------------------------------------------------------------ */
watch(
  () => props.open,
  (open) => {
    if (open) loadOptions();
  },
  { immediate: true },
);

// 分类/文章 Select 选项
const categoryOptions = computed(() =>
  categories.value.map((c) => ({ label: c.name, value: c.id })),
);
const articleOptions = computed(() =>
  articles.value.map((a) => ({ label: a.name, value: a.id })),
);
const pageOptions = computed(() =>
  pages.value.map((p) => ({
    label: `${p.code}${p.locales?.[0]?.title ? ` · ${p.locales[0].title}` : ''}`,
    value: p.code,
  })),
);

/** 租户已启用语种（loadOptions 时随 default_locale 一起取） */
const enabledLocales = ref([]);

/** 隐藏语种下拉：租户已启用语种 */
const hiddenLocaleOptions = computed(() =>
  enabledLocales.value.map((c) => ({ label: c, value: c })),
);

function onPageSelected(value) {
  // 页面用 code 寻址，link_value 存 page-data 寻址用的 code
  form.link_value = value;
}
</script>

<template>
  <Drawer
    :open="open"
    :title="`菜单项 - ${menu?.name || menu?.code || ''}`"
    width="640"
    @close="emit('update:open', false)"
  >
    <div class="mb-3 flex items-center justify-between">
      <span class="text-sm text-gray-500">
        拖拽节点可重排顺序或调整层级；保存后即时生效。
      </span>
      <Button type="primary" size="small" @click="openCreate(ROOT_KEY)">
        新增顶层项
      </Button>
    </div>

    <Tree
      v-if="treeData.length"
      :tree-data="treeData"
      :expanded-keys="expandedKeys"
      :auto-expand-parent="true"
      :block-node="true"
      :draggable="true"
      :allow-drop="allowDrop"
      @drop="onDrop"
      @expand="(keys) => (expandedKeys = keys)"
    >
      <template #titleRender="{ raw }">
        <div class="group flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <Tag
              v-if="raw.link_type && raw.link_type !== 1"
              color="blue"
              class="!m-0 !text-xs"
            >
              {{ linkTypeLabel(raw) }}
            </Tag>
            <span
              class="truncate text-sm"
              :class="raw.status === 0 ? 'text-gray-400 line-through' : 'text-gray-800'"
            >
              {{ itemTitle(raw) }}
            </span>
            <span v-if="raw.link_value" class="truncate text-xs text-gray-400">
              {{ raw.link_value }}
            </span>
          </div>
          <div class="flex shrink-0 gap-1 opacity-60 group-hover:opacity-100">
            <Button size="small" @click.stop="openCreate(String(raw.id))">
              子项
            </Button>
            <Button size="small" @click.stop="openEdit(raw)">编辑</Button>
            <Popconfirm
              title="确定删除此菜单项？子项会升为顶层"
              @confirm="deleteItem(raw)"
            >
              <Button size="small" danger @click.stop>删除</Button>
            </Popconfirm>
          </div>
        </div>
      </template>
    </Tree>
    <div v-else class="py-10 text-center text-gray-400">
      暂无菜单项，点击右上角「新增顶层项」开始
    </div>

    <!-- 编辑 / 新增 Modal：常驻不 destroy，避免每次重新挂载 TreeSelect/AppUpload 导致慢 -->
    <Modal
      v-model:open="editingOpen"
      :title="isEditing ? '编辑菜单项' : '新增菜单项'"
      width="760"
      :footer="null"
    >
      <Form layout="vertical" :model="form">
        <div class="grid grid-cols-2 gap-3">
          <FormItem label="父级" class="col-span-2">
            <TreeSelect
              v-model:value="form.parent_id"
              :tree-data="editorParentTree"
              tree-default-expand-all
              allow-clear
              placeholder="无父级（顶层）"
            />
          </FormItem>

          <FormItem label="链接类型" class="col-span-1">
            <Select v-model:value="form.link_type" :options="linkTypeOptions" />
          </FormItem>

          <FormItem label="排序" class="col-span-1">
            <InputNumber v-model:value="form.sort" class="w-full" />
          </FormItem>

          <!-- 链接值：按类型切换 -->
          <FormItem
            v-if="form.link_type === 1"
            label="链接 URL"
            class="col-span-2"
          >
            <Input
              v-model:value="form.link_value"
              placeholder="如 /products 或 https://..."
            />
          </FormItem>
          <FormItem
            v-else-if="form.link_type === 2"
            label="页面"
            class="col-span-2"
          >
            <Select
              :value="form.link_value || undefined"
              :options="pageOptions"
              show-search
              option-filter-prop="label"
              placeholder="选择页面（按 code 寻址）"
              @change="onPageSelected"
            />
          </FormItem>
          <FormItem
            v-else-if="form.link_type === 3"
            label="分类（写入 meta.category_id，渲染时按命名空间生成路径）"
            class="col-span-2"
          >
            <Select
              v-model:value="form.meta_category_id"
              :options="categoryOptions"
              show-search
              option-filter-prop="label"
              placeholder="选择分类"
            />
          </FormItem>
          <FormItem
            v-else-if="form.link_type === 4"
            label="文章（写入 meta.article_id）"
            class="col-span-2"
          >
            <Select
              v-model:value="form.meta_article_id"
              :options="articleOptions"
              show-search
              option-filter-prop="label"
              placeholder="选择文章"
            />
          </FormItem>

          <FormItem label="状态" class="col-span-1">
            <Select
              v-model:value="form.status"
              :options="[
                { label: '启用', value: 1 },
                { label: '停用', value: 0 },
              ]"
            />
          </FormItem>
        </div>

        <!-- 多语言标题：Tabs 切换，仅展示租户启用语种 -->
        <div class="mb-2 mt-2 text-xs font-medium text-gray-500">
          多语言标题
        </div>
        <LocaleTabsEditor
          :fields="[{ field: 'title', label: '标题', type: 'text' }]"
          :locales="form.titleLocales"
          @update:locales="(v) => (form.titleLocales = v)"
        />

        <!-- Mega / meta 高级配置 -->
        <Collapse class="mt-3">
          <CollapsePanel key="mega" header="Mega 导航 meta（高级）">
            <div class="grid grid-cols-2 gap-3">
              <FormItem label="变体" class="col-span-1">
                <Select
                  v-model:value="form.variant"
                  :options="[
                    { label: '普通', value: '' },
                    { label: 'Mega 巨幕', value: 'mega' },
                  ]"
                />
              </FormItem>
              <FormItem
                v-if="form.variant === 'mega'"
                label="列数（1-4）"
                class="col-span-1"
              >
                <InputNumber
                  v-model:value="form.columns"
                  :min="1"
                  :max="4"
                  class="w-full"
                />
              </FormItem>
            </div>

            <div v-if="form.variant === 'mega'" class="grid grid-cols-2 gap-3">
              <FormItem label="Featured 图片" class="col-span-2">
                <AppUpload
                  :ref="featuredUploadRef"
                  v-model="form.featured.image"
                  file-type="image"
                  :multiple="false"
                />
              </FormItem>
              <FormItem label="图片 Alt" class="col-span-1">
                <Input v-model:value="form.featured.image_alt" />
              </FormItem>
              <FormItem label="眉标 (eyebrow)" class="col-span-1">
                <Input v-model:value="form.featured.eyebrow" />
              </FormItem>
              <FormItem label="标题" class="col-span-1">
                <Input v-model:value="form.featured.title" />
              </FormItem>
              <FormItem label="链接 href" class="col-span-1">
                <Input v-model:value="form.featured.href" />
              </FormItem>
              <FormItem label="描述" class="col-span-2">
                <Input.TextArea
                  v-model:value="form.featured.description"
                  :rows="2"
                />
              </FormItem>
            </div>

            <FormItem
              label="激活前缀（每行一个 / 开头的路径）"
              class="mt-2"
            >
              <Input.TextArea
                v-model:value="form.active_prefixes"
                :rows="3"
                placeholder="/about/guanyuwomen&#10;/about/lvsuojieshao"
              />
            </FormItem>

            <FormItem label="隐藏语种（在这些语种下不显示）">
              <Select
                v-model:value="form.hidden_locales"
                :options="hiddenLocaleOptions"
                mode="multiple"
                placeholder="选择要隐藏的语种"
              />
            </FormItem>
          </CollapsePanel>

          <CollapsePanel key="raw" header="meta 原始 JSON（兜底，覆盖未做 UI 的字段）">
            <Input.TextArea
              v-model:value="form.meta_json"
              :rows="6"
              placeholder='如 {"landing_category_id": 12}'
            />
            <div
              v-if="metaJsonError"
              class="mt-1 text-xs text-red-500"
            >
              {{ metaJsonError }}
            </div>
            <div class="mt-1 text-xs text-gray-400">
              已有专用 UI 的字段（variant/columns/featured/active_prefixes/hidden_locales/category_id/article_id）会由表单覆盖，不要在此重复填写。
            </div>
          </CollapsePanel>
        </Collapse>

        <div class="mt-4 flex justify-end gap-2">
          <Button @click="editingOpen = false">取消</Button>
          <Button type="primary" :loading="saving" @click="saveItem">
            保存
          </Button>
        </div>
      </Form>
    </Modal>
  </Drawer>
</template>
