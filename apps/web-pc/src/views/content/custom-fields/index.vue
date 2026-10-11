<script setup>
/**
 * 内容自定义字段（租户级）：为各内容模型声明标准字段之外的个性化字段
 * （如产品的「应用领域」）。保存即生效：内容编辑页动态出现这些字段，
 * 公开接口按声明交集输出（值存各内容语言表 custom_fields）。
 *
 * 交互范式对齐 PageSchemaEditor（页面数据 Schema 编辑器）：字段卡片、
 * 类型选择、子字段声明（白名单键 Select + 显示名称）；只取需要的部分——
 * 本页无 provider/config 概念，左侧按内容模型类型切换定义。
 */
import { computed, onMounted, ref } from 'vue';

import { Button, Card, Empty, Input, Select, Tag, message } from 'antdv-next';

import Resource from '#/api/resource';

const TYPE_OPTIONS = [
  { label: '单行文本 (text)', value: 'text' },
  { label: '富文本 (richtext)', value: 'richtext' },
  { label: '单图 (image)', value: 'image' },
  { label: '图片组 (images)', value: 'images' },
  { label: '视频 (video)', value: 'video' },
  { label: '标签数组 (tags)', value: 'tags' },
  { label: '对象 (object)', value: 'object' },
  { label: '对象数组 (array)', value: 'array' },
];
const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.map((item) => [item.value, item.label]));
const TYPE_TAG_COLORS = {
  object: 'geekblue',
  array: 'purple',
  text: 'cyan',
  richtext: 'cyan',
  image: 'cyan',
  images: 'cyan',
  video: 'cyan',
  tags: 'cyan',
};

/** object / array 的子字段白名单（与后端 BLOCK_FIELDS、静态块编辑器同词汇）。 */
const BLOCK_SUB_FIELDS = [
  { key: 'title', label: '标题' },
  { key: 'subtitle', label: '副标题' },
  { key: 'content', label: '内容' },
  { key: 'text', label: '文本' },
  { key: 'text2', label: '文本2' },
  { key: 'text3', label: '文本3' },
  { key: 'image', label: '图片' },
  { key: 'image2', label: '图片2' },
  { key: 'images', label: '图片组' },
  { key: 'video', label: '视频' },
  { key: 'tags', label: '标签' },
  { key: 'target', label: '链接' },
];
const BLOCK_SUB_LABELS = Object.fromEntries(BLOCK_SUB_FIELDS.map((item) => [item.key, item.label]));
const BLOCK_SUB_OPTIONS = BLOCK_SUB_FIELDS.map((item) => ({
  label: `${item.key}（${item.label}）`,
  value: item.key,
}));

const types = ref([]);
const activeType = ref(null);
const rows = ref([]);
const dirty = ref(false);
const saving = ref(false);
const loading = ref(false);

const activeMeta = computed(
  () => types.value.find((item) => item.type === activeType.value) || null,
);
const keyPattern = /^[a-z][a-z0-9_]{0,31}$/;

function isBlockType(row) {
  return row.type === 'object' || row.type === 'array';
}

function selectType(item) {
  if (dirty.value) {
    message.warning('当前类型有未保存的修改，请先保存或重置');
    return;
  }
  activeType.value = item?.type || null;
  rows.value = Object.entries(item?.fields || {}).map(([key, definition]) => ({
    key,
    label: definition?.label || '',
    type: TYPE_OPTIONS.some((option) => option.value === definition?.type)
      ? definition.type
      : 'text',
    // object/array 的子字段声明（[{key,label}]）；未声明 = 全部白名单可用。
    subs: definition?.fields && typeof definition.fields === 'object'
      ? Object.entries(definition.fields).map(([subKey, meta]) => ({
          key: subKey,
          label: meta?.label || BLOCK_SUB_LABELS[subKey] || subKey,
        }))
      : null,
  }));
  dirty.value = false;
}

function addRow() {
  if (!activeMeta.value) return;
  rows.value = [...rows.value, { key: '', label: '', type: 'text', subs: null }];
  dirty.value = true;
}

function removeRow(index) {
  rows.value = rows.value.filter((_, i) => i !== index);
  dirty.value = true;
}

function onTypeChange(row) {
  // 切到裸字段类型时清掉子字段声明（裸字段不允许 fields，留着会被后端 422 拒绝）。
  if (!isBlockType(row)) {
    row.subs = null;
  }
  dirty.value = true;
}

function addSubField(row) {
  row.subs = [...(row.subs || []), { key: '', label: '' }];
  dirty.value = true;
}

function removeSubField(row, index) {
  row.subs = (row.subs || []).filter((_, i) => i !== index);
  dirty.value = true;
}

function onSubKeyChange(row, field) {
  // 选中白名单键后自动填默认显示名（用户已填则不覆盖）。
  if (!String(field.label || '').trim()) {
    field.label = BLOCK_SUB_LABELS[field.key] || '';
  }
  dirty.value = true;
}

function markDirty() {
  dirty.value = true;
}

async function load() {
  loading.value = true;
  try {
    const { data } = await new Resource('content-schemas').list();
    types.value = data?.items || [];
    const current = types.value.find((item) => item.type === activeType.value);
    selectType(current || types.value[0] || null);
    dirty.value = false;
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
}

function validate() {
  const seen = new Set();
  const fields = {};
  for (const row of rows.value) {
    const key = String(row.key || '').trim();
    if (!keyPattern.test(key)) {
      message.error(`字段名「${key || '(空)'}」非法：需以小写字母开头，仅含小写字母/数字/下划线`);
      return null;
    }
    if (seen.has(key)) {
      message.error(`字段名「${key}」重复`);
      return null;
    }
    seen.add(key);
    if (!String(row.label || '').trim()) {
      message.error(`字段「${key}」缺少显示名称`);
      return null;
    }

    const definition = { label: String(row.label).trim(), type: row.type };
    if (isBlockType(row)) {
      const seenSubs = new Set();
      const subFields = {};
      for (const sub of row.subs || []) {
        const subKey = String(sub.key || '').trim();
        if (!subKey) {
          message.error(`字段「${key}」存在未选择键名的子字段`);
          return null;
        }
        if (seenSubs.has(subKey)) {
          message.error(`字段「${key}」的子字段「${subKey}」重复`);
          return null;
        }
        seenSubs.add(subKey);
        subFields[subKey] = {
          label: String(sub.label || '').trim() || BLOCK_SUB_LABELS[subKey] || subKey,
        };
      }
      // 已声明子字段才下发 fields；空声明 = 全部白名单可用。
      if (Object.keys(subFields).length > 0) {
        definition.fields = subFields;
      }
    }
    fields[key] = definition;
  }
  return fields;
}

async function save() {
  if (!activeMeta.value) return;
  const fields = validate();
  if (fields === null) return;
  saving.value = true;
  try {
    const { data } = await new Resource(`content-schemas/${activeType.value}`).update('', {
      fields,
    });
    message.success('字段定义已保存，内容编辑页与公开接口即时生效');
    dirty.value = false;
    const index = types.value.findIndex((item) => item.type === activeType.value);
    if (index >= 0 && data) {
      types.value[index] = data;
      const keep = activeType.value;
      rows.value = Object.entries(data?.fields || {}).map(([key, definition]) => ({
        key,
        label: definition?.label || '',
        type: definition?.type || 'text',
        subs: definition?.fields && typeof definition.fields === 'object'
          ? Object.entries(definition.fields).map(([subKey, meta]) => ({
              key: subKey,
              label: meta?.label || BLOCK_SUB_LABELS[subKey] || subKey,
            }))
          : null,
      }));
      activeType.value = keep;
    }
  } catch (error) {
    // 后端 422 的具体原因（保留字冲突/超限等）由请求层统一提示。
    console.error(error);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="p-4">
    <Card :loading="loading">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="m-0 text-base font-semibold">内容自定义字段</h2>
          <p class="mb-0 mt-1 text-xs text-gray-500">
            按内容模型声明标准字段之外的个性化字段（租户级，保存即生效）；字段值随内容语言版本维护，公开接口按声明交集输出。
          </p>
        </div>
        <div class="flex gap-2">
          <Button :disabled="!dirty" @click="load">重置</Button>
          <Button type="primary" :disabled="!activeMeta || !dirty" :loading="saving" @click="save">
            保存
          </Button>
        </div>
      </div>

      <div class="grid grid-cols-[220px_1fr] gap-4">
        <div class="flex flex-col gap-1">
          <div
            v-for="item in types"
            :key="item.type"
            class="flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm"
            :class="item.type === activeType ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
            @click="selectType(item)"
          >
            <span>{{ item.label }}</span>
            <Tag v-if="Object.keys(item.fields || {}).length > 0" color="blue" class="ml-1">
              {{ Object.keys(item.fields).length }}
            </Tag>
          </div>
        </div>

        <div v-if="activeMeta" class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div class="text-xs text-gray-500">
              字段名用于接口与数据存储（小写字母/数字/下划线，如 application_area）；显示名称是编辑表单里的中文标签。
            </div>
            <Button size="small" @click="addRow">+ 添加字段</Button>
          </div>

          <Empty v-if="rows.length === 0" description="该内容模型尚未声明任何自定义字段">
            <Button type="primary" @click="addRow">新增第一个字段</Button>
          </Empty>

          <template v-else>
            <Card
              v-for="(row, index) in rows"
              :key="index"
              size="small"
              class="border border-gray-200"
            >
            <template #title>
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-gray-800">#{{ index + 1 }}</span>
                <Tag color="geekblue">{{ row.label || row.key || '(未命名字段)' }}</Tag>
                <Tag :color="TYPE_TAG_COLORS[row.type] || 'default'">
                  {{ TYPE_LABELS[row.type] || row.type }}
                </Tag>
              </div>
            </template>
            <template #extra>
              <Button danger size="small" type="link" @click="removeRow(index)">
                删除字段
              </Button>
            </template>

            <div class="flex flex-col gap-3">
              <!-- 基础属性行（参照 PageSchemaEditor 的灰色 grid） -->
              <div class="grid grid-cols-1 gap-3 rounded bg-gray-50 p-3 md:grid-cols-3">
                <div>
                  <label class="mb-1 block text-xs text-gray-500">
                    字段名 (例如: application_area)
                  </label>
                  <Input
                    v-model:value="row.key"
                    placeholder="小写字母/数字/下划线"
                    @change="markDirty"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-xs text-gray-500">显示名称</label>
                  <Input
                    v-model:value="row.label"
                    placeholder="如「应用领域」"
                    @change="markDirty"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-xs text-gray-500">字段类型</label>
                  <Select
                    v-model:value="row.type"
                    :options="TYPE_OPTIONS"
                    class="w-full"
                    @change="onTypeChange(row)"
                  />
                </div>
              </div>

              <!-- 对象 / 对象数组：子字段声明（对齐 PageSchemaEditor 的字段展示声明） -->
              <div
                v-if="isBlockType(row)"
                class="rounded border border-blue-100 bg-blue-50/30 p-3"
              >
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-xs font-medium text-gray-700">
                    子字段声明（{{ row.type === 'object' ? '对象内' : '数组每项' }}可用：字段键 → 显示名称）
                  </span>
                  <Button size="small" type="link" @click="addSubField(row)">
                    + 添加子字段
                  </Button>
                </div>
                <p class="mb-2 text-xs text-gray-400">
                  子字段键固定取自块字段白名单（title / subtitle / text / image / video / tags
                  等，与站点静态图文块同一套词汇）；不声明时全部白名单键可用，按默认名称展示。
                </p>

                <div
                  v-for="(field, fieldIndex) in row.subs || []"
                  :key="fieldIndex"
                  class="mb-2 flex items-center gap-2"
                >
                  <Select
                    v-model:value="field.key"
                    :options="BLOCK_SUB_OPTIONS"
                    placeholder="子字段键"
                    class="w-48 shrink-0"
                    @change="onSubKeyChange(row, field)"
                  />
                  <Input
                    v-model:value="field.label"
                    placeholder="显示名称，如「案例名称」"
                    @change="markDirty"
                  />
                  <Button danger size="small" type="link" @click="removeSubField(row, fieldIndex)">
                    删除
                  </Button>
                </div>

                <span v-if="!row.subs || row.subs.length === 0" class="text-xs text-gray-400">
                  未声明子字段：编辑页将展示全部白名单子字段（默认名称）。
                </span>
              </div>
            </div>
          </Card>
          </template>
        </div>
      </div>
    </Card>
  </div>
</template>
