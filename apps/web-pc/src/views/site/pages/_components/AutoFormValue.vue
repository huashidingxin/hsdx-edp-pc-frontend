<script setup>
/**
 * 通用 JSON → 图形表单（递归渲染单个字段）。
 *
 * 用途：页面静态内容编辑。静态块的 `editor` 提示是可选的，真实数据里 107 个静态块有 45 个
 * 没有提示，旧实现对这些块只给一个裸 JSON 文本框，非技术人员无法操作。
 * 这里改为按**数据形状**渲染控件：对象→分组、对象数组→可增删排序的条目、
 * 图片路径→上传、HTML→富文本、长文本→多行、数字/布尔→数字框/开关。
 *
 * 绑定约定（重要）：组件不持有值的副本，直接读写 `parent[fieldKey]`。
 * `parent` 就是 PageContentManager 的 `drafts[blockName]`（reactive 深代理），
 * 因此编辑立刻反映到草稿，`isDirty` 与「按块保存」无需改动即可工作。
 * 若在此处 copy 一份局部状态，保存时还得合回去，容易丢字段——所以有意不这么做。
 *
 * 上传约定：媒体控件用 `AppUpload`，它**不自动上传**。选中的文件先以
 * `{ url: 'blob:...', file: File }` 落在草稿里，必须由使用页在**真正保存那一刻**
 * 调用本组件暴露的 `upload()`（见 defineExpose），否则 PUT 出去的是 blob 地址。
 */
import { computed } from 'vue';

import {
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  TextArea,
} from 'antdv-next';

import AppUpload from '#/components/AppUpload.vue';
import AppEditor from '#/components/app-editor/index.vue';

import {
  blankItemFor,
  describeArray,
  describeObject,
  MEDIA_KINDS,
  resolveFieldKind,
  summarize,
} from './pageContentAutoForm';

const props = defineProps({
  /** 持有该字段的容器（对象或数组）。 */
  parent: { type: [Object, Array], required: true },
  /** 在容器里的键或下标。 */
  fieldKey: { type: [String, Number], required: true },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  /** 只渲染控件本身，不渲染外层标题/边框（列表条目内部用）。 */
  bare: { type: Boolean, default: false },
  /** 递归深度，防御异常数据无限嵌套。 */
  depth: { type: Number, default: 0 },
});

/** 递归上限：真实数据最深 3 层，6 层足够且能挡住环状/畸形数据。 */
const MAX_DEPTH = 6;

const value = computed(() => props.parent[props.fieldKey]);

/** 可写 computed：直接落到父容器的属性上，保证草稿对象引用不变。 */
const model = computed({
  get: () => props.parent[props.fieldKey],
  set: (next) => {
    props.parent[props.fieldKey] = next;
  },
});

/**
 * 上一次真正推断出来的媒体控件。
 *
 * 值处于上传中转态时（刚删完的 null/''/[]，或刚拖完文件时 AppUpload 回传的
 * `{ url: 'blob:…', file }`）不能按形状重新推断：没有键名提示的媒体字段会从
 * 上传控件掉回文本框/对象表单，用户再也传不了图。这里记住上一次的媒体控件沿用。
 */
let previousMediaKind = '';

const kind = computed(() => {
  const resolved = resolveFieldKind(
    String(props.fieldKey),
    value.value,
    previousMediaKind,
  );
  if (MEDIA_KINDS.has(resolved)) previousMediaKind = resolved;

  return resolved;
});

/** object 分支的字段描述（list 里的每个条目自己再算一遍）。 */
const childFields = computed(() => describeObject(value.value));

const arrayInfo = computed(() => describeArray(value.value));

const tooDeep = computed(() => props.depth >= MAX_DEPTH);

/**
 * 本字段树下的上传目标：媒体控件（AppUpload）与子节点（AutoFormValue）都暴露 `upload()`。
 *
 * ref 回调按 key 缓存复用：每次渲染换一个新函数会让 Vue 对旧 ref 走一次 set(null)、
 * 再对新 ref 走 set(el)，白抖一轮（极端情况下会把刚登记的实例删掉）。
 */
const uploadTargets = new Map();
const uploadRefCallbacks = new Map();

function uploadRef(key) {
  if (!uploadRefCallbacks.has(key)) {
    uploadRefCallbacks.set(key, (el) => {
      if (el) uploadTargets.set(key, el);
      else uploadTargets.delete(key);
    });
  }

  return uploadRefCallbacks.get(key);
}

/** 递归上传本字段树下所有待上传文件；没有待上传文件时是空操作。 */
async function upload() {
  const tasks = [];
  for (const target of uploadTargets.values()) {
    if (typeof target?.upload === 'function') tasks.push(target.upload());
  }
  await Promise.all(tasks);
}

defineExpose({ upload });

function addItem() {
  const list = Array.isArray(model.value) ? [...model.value] : [];
  list.push(blankItemFor(list));
  model.value = list;
}

function removeItem(index) {
  const list = Array.isArray(model.value) ? [...model.value] : [];
  list.splice(index, 1);
  model.value = list;
}

function moveItem(index, delta) {
  const list = Array.isArray(model.value) ? [...model.value] : [];
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  model.value = list;
}

/** 条目标题：优先用条目自身的标题类字段，避免「第 N 项」这种无信息量标题。 */
function itemLabel(item, index) {
  const text = summarize(item);
  return text ? `${index + 1}. ${text}` : `第 ${index + 1} 项`;
}
</script>

<template>
  <div :class="bare ? '' : 'flex flex-col gap-1'">
    <span v-if="!bare && label" class="text-xs text-gray-500">{{ label }}</span>

    <!-- 深度超限：不再往下渲染，提示改用高级模式 -->
    <span v-if="tooDeep" class="text-xs text-orange-500">
      嵌套层级过深，请用「高级（JSON）」编辑
    </span>

    <!-- 布尔 -->
    <Switch
      v-else-if="kind === 'boolean'"
      v-model:checked="model"
      :disabled="disabled"
    />

    <!-- 数字 -->
    <InputNumber
      v-else-if="kind === 'number'"
      v-model:value="model"
      :disabled="disabled"
      style="width: 100%"
    />

    <!-- 图片 -->
    <AppUpload
      v-else-if="kind === 'image'"
      :ref="uploadRef('@self')"
      v-model="model"
      :disabled="disabled"
      file-type="image"
    />

    <!-- 图片集合 -->
    <AppUpload
      v-else-if="kind === 'images'"
      :ref="uploadRef('@self')"
      v-model="model"
      :disabled="disabled"
      file-type="image"
      multiple
    />

    <!-- 视频（真实数据里 image2 曾存过 .mp4；空值靠键名提示） -->
    <AppUpload
      v-else-if="kind === 'video'"
      :ref="uploadRef('@self')"
      v-model="model"
      :disabled="disabled"
      file-type="video"
    />

    <!-- 标签 -->
    <Select
      v-else-if="kind === 'tags'"
      v-model:value="model"
      :disabled="disabled"
      mode="tags"
      placeholder="回车添加"
      style="width: 100%"
    />

    <!-- 富文本 -->
    <AppEditor
      v-else-if="kind === 'richtext'"
      v-model="model"
      :disabled="disabled"
    />

    <!-- 长文本 -->
    <TextArea
      v-else-if="kind === 'textarea'"
      v-model:value="model"
      :disabled="disabled"
      :rows="4"
    />

    <!-- 对象：逐键渲染 -->
    <div
      v-else-if="kind === 'object'"
      :class="
        bare
          ? 'flex flex-col gap-3'
          : 'flex flex-col gap-3 rounded border border-gray-200 bg-gray-50/60 p-3'
      "
    >
      <AutoFormValue
        v-for="field in childFields"
        :key="field.key"
        :ref="uploadRef(field.key)"
        :parent="value"
        :field-key="field.key"
        :label="field.label"
        :disabled="disabled"
        :depth="depth + 1"
      />
      <span v-if="!childFields.length" class="text-xs text-gray-400">（空对象）</span>
    </div>

    <!-- 数组：可增删/排序的条目 -->
    <div v-else-if="kind === 'list'" class="flex flex-col gap-3">
      <Empty v-if="!arrayInfo.count" description="暂无条目" />
      <Card
        v-for="(item, index) in value"
        :key="index"
        size="small"
        class="bg-gray-50"
      >
        <template #title>
          <span class="text-xs font-normal text-gray-600">
            {{ itemLabel(item, index) }}
          </span>
        </template>
        <template v-if="!disabled" #extra>
          <Space :size="4">
            <Button size="small" :disabled="index === 0" @click="moveItem(index, -1)">
              上移
            </Button>
            <Button
              size="small"
              :disabled="index === arrayInfo.count - 1"
              @click="moveItem(index, 1)"
            >
              下移
            </Button>
            <Button danger size="small" @click="removeItem(index)">删除</Button>
          </Space>
        </template>

        <!-- 对象条目：按条目自身的键渲染，不丢键 -->
        <div
          v-if="item !== null && typeof item === 'object' && !Array.isArray(item)"
          class="flex flex-col gap-3"
        >
          <AutoFormValue
            v-for="field in describeObject(item)"
            :key="field.key"
            :ref="uploadRef(`@item:${index}:${field.key}`)"
            :parent="item"
            :field-key="field.key"
            :label="field.label"
            :disabled="disabled"
            :depth="depth + 1"
          />
        </div>

        <!-- 标量条目：直接给一个控件 -->
        <AutoFormValue
          v-else
          :ref="uploadRef(`@item:${index}`)"
          :parent="value"
          :field-key="index"
          :disabled="disabled"
          bare
          :depth="depth + 1"
        />
      </Card>

      <Button v-if="!disabled" type="dashed" block @click="addItem">
        新增一项
      </Button>
    </div>

    <!-- 文本（含 null/undefined 兜底） -->
    <Input v-else v-model:value="model" :disabled="disabled" placeholder="请输入" />
  </div>
</template>
