<script setup>
/**
 * 扩展分类管理（京华兆建规划 §4.1）
 *
 * 与「分类管理」的分工：公共分类（`categories`）承载内容固有分类、单值 `category_id`；
 * 扩展分类承载正交维度（品牌 / 应用场景 / 生产线类型…），多对多、按维度分 Tab。
 *
 * 两条约束来自后端契约，页面上不要绕过：
 * 1. 维度本身**不在页面上随意新增**：必须声明 `key / label / tree / models`，
 *    没有 `models` 的裸维度后端会 422 —— 所以走「维度配置」弹窗统一维护。
 * 2. `slug` 在「租户 + 语言」内全局唯一（不按维度分池），跨维度同名同样 409。
 */
import { computed, onMounted, ref } from 'vue';

import {
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Switch,
  Tabs,
  Tag,
  message,
} from 'antdv-next';

import { requestClient } from '#/api/request';
import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

import LocaleManager from '../_components/LocaleManager.vue';

const props = defineProps({ appId: { type: [Number, String], default: null } });
void props; // 扩展分类是租户级资源、不按应用发布，保留 prop 只为与其他模块页签名一致

const dimensions = ref([]);
const availableModels = ref([]);
const activeDimension = ref('');
const loadingDimensions = ref(true);
const crudRef = ref(null);
const localeOptions = ref([]);
const treeNodes = ref([]);
const formData = ref(null);

const activeMeta = computed(
  () => dimensions.value.find((d) => d.key === activeDimension.value) || null,
);

const tabItems = computed(() =>
  dimensions.value.map((d) => ({ key: d.key, label: d.label || d.key })),
);

/** 父级选项：当前维度的整棵树拍平（排除自身，避免提交时被后端以「移到子树下」拒绝）。 */
const parentOptions = computed(() => {
  const excludeId = Number(formData.value?.id) || 0;
  return treeNodes.value
    .filter((n) => n.id !== excludeId)
    .map((n) => ({ id: n.id, name: `${'　'.repeat(n.depth)}${n.name}` }));
});

const formFields = computed(() => [
  {
    field: 'parent_id',
    type: 'select',
    label: '父级',
    span: 12,
    attrs: {
      options: parentOptions,
      fieldNames: { label: 'name', value: 'id' },
      allowClear: true,
      showSearch: true,
      disabled: !activeMeta.value?.tree,
      placeholder: activeMeta.value?.tree ? '不选 = 顶级' : '该维度未声明树形',
    },
  },
  { field: 'sort', type: 'number', label: '排序', span: 12 },
  {
    field: 'status',
    type: 'select',
    label: '状态',
    span: 12,
    attrs: { options: [{ id: 1, name: '启用' }, { id: 0, name: '停用' }] },
  },
  // 名称/Slug 是语种内容，由 LocaleManager 按语言维护（节点无顶层 name 字段）
  {
    field: 'locale_manager',
    type: 'slot',
    label: '语言名称与 Slug',
    span: 24,
    renderKey: 'locale_manager',
  },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  {
    field: 'name',
    title: '名称',
    minWidth: 160,
    formatter: ({ row }) => row.locales?.[0]?.name || '-',
  },
  {
    field: 'slug',
    title: 'Slug',
    minWidth: 140,
    formatter: ({ row }) => row.locales?.[0]?.slug || '-',
  },
  {
    field: 'parent_id',
    title: '父级',
    minWidth: 140,
    slots: { default: 'default_parent' },
  },
  { field: 'sort', title: '排序', width: 80 },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'default_status' },
  },
  { field: 'created_at', title: '创建时间', minWidth: 160 },
]);

/* ===================== 维度配置 ===================== */
const configOpen = ref(false);
const configDraft = ref([]);
const savingConfig = ref(false);

const modelOptions = computed(() =>
  availableModels.value.map((m) => ({
    id: m.key,
    name: `${m.label}（${m.key}）`,
  })),
);

function openConfig() {
  configDraft.value = dimensions.value.map((d) => ({
    key: d.key,
    label: d.label,
    tree: !!d.tree,
    models: [...(d.models || [])],
  }));
  configOpen.value = true;
}

function addDimension() {
  configDraft.value.push({ key: '', label: '', tree: false, models: [] });
}

function removeDimension(index) {
  configDraft.value.splice(index, 1);
}

/**
 * 客户端预校验只为少跑一趟请求；权威判定在后端（`CustomCategoryService::saveDimensions`）。
 * 标识格式与后端 `DIMENSION_PATTERN` 保持一致。
 */
function validateDraft() {
  const seen = new Set();
  for (const [i, d] of configDraft.value.entries()) {
    const row = i + 1;
    const key = String(d.key || '').trim();
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(key)) {
      return `第 ${row} 行：维度标识须为小写字母开头，仅含小写字母、数字与下划线`;
    }
    if (seen.has(key)) return `第 ${row} 行：维度标识重复（${key}）`;
    seen.add(key);
    if (!d.models?.length) return `第 ${row} 行：必须选择至少一个适用内容模型`;
  }
  return '';
}

async function saveConfig() {
  const error = validateDraft();
  if (error) {
    message.error(error);
    return;
  }
  savingConfig.value = true;
  try {
    const body = await requestClient.put('/custom-categories/dimensions', {
      dimensions: configDraft.value.map((d) => {
        const key = String(d.key).trim();
        return {
          key,
          label: String(d.label || '').trim() || key,
          tree: !!d.tree,
          models: d.models,
        };
      }),
    });
    applyDimensions(body?.data ?? body ?? {});
    message.success('维度配置已保存');
    configOpen.value = false;
    await loadTree();
  } catch (error) {
    console.error(error);
  } finally {
    savingConfig.value = false;
  }
}

/* ===================== 数据加载 ===================== */

function applyDimensions(data) {
  dimensions.value = data?.dimensions || [];
  availableModels.value = data?.available_models || [];
  if (!dimensions.value.some((d) => d.key === activeDimension.value)) {
    activeDimension.value = dimensions.value[0]?.key || '';
  }
}

/** 树拍平为带缩进层级的扁平列表（父级选择器与「父级」列共用）。 */
function flattenTree(nodes, depth = 0, out = []) {
  for (const node of nodes || []) {
    out.push({ id: node.id, name: node.name || `#${node.id}`, depth });
    flattenTree(node.children, depth + 1, out);
  }
  return out;
}

async function loadTree() {
  if (!activeDimension.value) {
    treeNodes.value = [];
    return;
  }
  try {
    const { data } = await new Resource('custom-categories/tree').list({
      dimension: activeDimension.value,
    });
    treeNodes.value = flattenTree(data?.items);
  } catch (error) {
    console.error(error);
    treeNodes.value = [];
  }
}

function parentName(row) {
  if (!row?.parent_id) return '顶级';
  const hit = treeNodes.value.find((n) => n.id === Number(row.parent_id));
  return hit ? hit.name.trim() : `#${row.parent_id}`;
}

/** 新增时把当前维度带上（列表查询参数不参与创建请求体）。 */
function normalizeSave(payload) {
  const next = { ...payload };
  if (!next.dimension) next.dimension = activeDimension.value;
  if (next.parent_id === undefined || next.parent_id === '') next.parent_id = null;
  return next;
}

async function switchDimension(key) {
  activeDimension.value = key;
  formData.value = null;
  await loadTree();
}

onMounted(async () => {
  try {
    const { data } = await new Resource('custom-categories/dimensions').list({});
    applyDimensions(data);
  } catch (error) {
    console.error(error);
  } finally {
    loadingDimensions.value = false;
  }
  await loadTree();
  try {
    const { data } = await new Resource('applications/locale-catalog').list({});
    localeOptions.value = data || [];
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <div class="p-4">
    <div v-if="loadingDimensions" class="py-16 text-center text-gray-400">
      加载中…
    </div>

    <Empty v-else-if="!dimensions.length">
      <template #description>
        <div class="max-w-[520px] text-gray-500">
          尚未声明任何扩展分类维度。扩展分类承载品牌、应用场景等正交维度，
          与公共分类并存；维度需要先声明「标识 / 名称 / 是否树形 / 适用内容模型」才能使用。
        </div>
      </template>
      <Button type="primary" @click="openConfig">去配置维度</Button>
    </Empty>

    <template v-else>
      <!-- Tabs 只做维度切换（沿用 LocaleTabsEditor 的 items 写法）；表格在 Tabs 体外，
           切换时靠 :key 重建，避免每个维度各挂一个表格实例。 -->
      <Tabs
        :active-key="activeDimension"
        :items="tabItems"
        @change="switchDimension"
      />

      <AppCrudTable
        ref="crudRef"
        :key="activeDimension"
        v-model="formData"
        api-url="custom-categories"
        permission-name="cms.custom_category"
        :extra-query="{ dimension: activeDimension }"
        :save-format="normalizeSave"
        :filter-fields="[]"
        :fields="formFields"
        :grid-options="{
          columns: gridColumns,
          showOverflow: false,
          columnConfig: { resizable: true },
        }"
        :open-mode="{ create: 'modal', detail: 'modal' }"
        :form-attrs="{ layout: 'vertical', size: 'medium' }"
        :inline-actions="['view', 'edit', 'delete']"
        :title="`扩展分类 · ${activeMeta?.label || activeDimension}`"
      >
        <template #sub-title>
          <span class="text-xs text-gray-400">
            维度标识 {{ activeDimension }} · 适用于
            {{ (activeMeta?.models || []).join('、') || '（未声明）' }} ·
            租户级资源，不发布到应用
          </span>
        </template>

        <template #toolbar-append>
          <Button @click="openConfig">维度配置</Button>
        </template>

        <template #default_parent="{ row }">
          <span :class="row.parent_id ? '' : 'text-gray-400'">
            {{ parentName(row) }}
          </span>
        </template>

        <template #default_status="{ row }">
          <Tag :color="row.status ? 'green' : 'default'">
            {{ row.status ? '启用' : '停用' }}
          </Tag>
        </template>

        <template #field_locale_manager="{ formValue }">
          <LocaleManager
            resource="custom-categories"
            :row-id="formValue?.id"
            :locales="formValue?.locales || []"
            @update:locales="
              (v) => {
                if (formValue) formValue.locales = v;
              }
            "
            :locales-pool="localeOptions"
            :fields="[
              { field: 'name', label: '名称', type: 'text' },
              { field: 'slug', label: 'Slug', type: 'text' },
            ]"
          />
        </template>
      </AppCrudTable>
    </template>

    <Modal
      v-model:open="configOpen"
      title="扩展分类维度配置"
      :width="760"
      :confirm-loading="savingConfig"
      ok-text="保存"
      @ok="saveConfig"
    >
      <p class="mb-3 text-xs text-gray-500">
        维度声明是全量替换：移除某个维度前，须先清空该维度下的分类节点，否则保存会被拒绝（409）。
        标识格式为小写字母开头，仅含小写字母、数字与下划线。
      </p>

      <div
        v-for="(d, index) in configDraft"
        :key="index"
        class="mb-3 rounded border border-gray-200 p-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <Input
            v-model:value="d.key"
            class="w-[180px]"
            placeholder="标识，如 brand"
          />
          <Input
            v-model:value="d.label"
            class="w-[180px]"
            placeholder="名称，如 品牌"
          />
          <span class="flex items-center gap-1 text-xs text-gray-500">
            树形
            <Switch v-model:checked="d.tree" size="small" />
          </span>
          <Button danger size="small" type="text" @click="removeDimension(index)">
            移除
          </Button>
        </div>
        <div class="mt-2">
          <Select
            v-model:value="d.models"
            class="w-full"
            mode="multiple"
            :options="modelOptions"
            :field-names="{ label: 'name', value: 'id' }"
            placeholder="适用内容模型（至少一个）"
          />
        </div>
      </div>

      <Button block type="dashed" @click="addDimension">+ 新增维度</Button>
    </Modal>
  </div>
</template>
