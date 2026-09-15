<script setup>
/**
 * 单字段属性弹窗（作为 Vben Modal 的内容组件）。
 * 只负责「基础属性 + 类型相关项 + 基础校验」，规则编辑在 FormSchemaEditor 行内「规则」按钮完成。
 */
import { computed, reactive, watch } from 'vue';

import {
  Button,
  Form,
  FormItem,
  Input,
  InputNumber,
  Select,
  Switch,
  message,
} from 'antdv-next';

import {
  CHILD_FIELD_TYPES,
  DATE_TYPE_OPTIONS,
  FILE_ACCEPTS,
  FIELD_TYPES,
  SPAN_OPTIONS,
  createFieldDraft,
  draftToField,
  fieldToDraft,
  isContainerType,
  isOptionType,
  validateFieldDraft,
  validationFieldsFor,
} from './formSchema.js';

const props = defineProps({
  field: { type: Object, default: null },
  // 子字段模式（作为父字段的子字段编辑）：类型受限为 CHILD_FIELD_TYPES，隐藏栅格宽度
  childMode: { type: Boolean, default: false },
  existingNames: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['submit', 'cancel']);

const draft = reactive(createFieldDraft('text', []));

function initFrom(field) {
  const source = field && typeof field === 'object' ? field : null;
  const next = fieldToDraft(source);
  Object.keys(next).forEach((key) => {
    draft[key] = next[key];
  });
  draft._original = source;
}
watch(() => props.field, (f) => initFrom(f), { immediate: true });

const isOption = computed(() => isOptionType(draft.type));
const isContainer = computed(() => isContainerType(draft.type));

const validationItems = computed(() =>
  validationFieldsFor(draft.type, { multiple: draft.multiple }),
);

function onTypeChange() {
  draft.optionsText = '';
  draft.multiple = false;
  draft.rows = 5;
  draft.date_type = 'date';
  draft.accept = ['image/*'];
  draft.min_files = 0;
  draft.max_files = 1;
  draft.max_file_size_mb = 10;
  if (!isContainer.value) draft.fields = [];
}

function addChild() {
  draft.fields.push(createFieldDraft('text', draft.fields));
}
function removeChild(index) {
  draft.fields.splice(index, 1);
}

const defaultChecked = computed(() => !!draft.default);
function onDefaultChecked(checked) {
  draft.default = checked ? true : '';
}

function handleSubmit() {
  const error = validateFieldDraft(draft, { existingNames: props.existingNames });
  if (error) {
    message.error(error);
    return;
  }
  emit('submit', draftToField(draft));
}
</script>

<template>
  <div class="p-1">
    <Form layout="vertical" :disabled="disabled">
      <div class="grid grid-cols-2 gap-x-4">
        <FormItem label="字段名（name）" required>
          <Input
            v-model:value="draft.name"
            placeholder="如 contact_name"
            :disabled="disabled"
          />
        </FormItem>
        <FormItem label="字段类型" required>
          <Select
            v-model:value="draft.type"
            :options="props.childMode ? CHILD_FIELD_TYPES : FIELD_TYPES"
            :disabled="disabled"
            @change="onTypeChange"
          />
        </FormItem>
      </div>

      <FormItem label="字段标签" required>
        <Input v-model:value="draft.label" placeholder="如 联系人姓名" :disabled="disabled" />
      </FormItem>

      <div class="grid grid-cols-2 gap-x-4">
        <FormItem label="占位提示">
          <Input v-model:value="draft.placeholder" :disabled="disabled" />
        </FormItem>
        <FormItem v-if="!props.childMode" label="栅格宽度（/12）">
          <Select v-model:value="draft.span" :options="SPAN_OPTIONS" :disabled="disabled" />
        </FormItem>
      </div>

      <FormItem label="帮助说明">
        <Input v-model:value="draft.help" :disabled="disabled" />
      </FormItem>

      <FormItem label="默认值">
        <InputNumber
          v-if="draft.type === 'number'"
          v-model:value="draft.default"
          class="w-full"
          :disabled="disabled"
        />
        <Switch
          v-else-if="draft.type === 'consent'"
          :checked="defaultChecked"
          :disabled="disabled"
          @change="onDefaultChecked"
        />
        <Input v-else v-model:value="draft.default" :disabled="disabled" />
      </FormItem>

      <FormItem label="必填">
        <Switch v-model:checked="draft.required" :disabled="disabled" />
      </FormItem>

      <!-- 选项类 -->
      <template v-if="isOption">
        <FormItem label="选项（每行一个，值=显示名）" required>
          <Input.TextArea
            v-model:value="draft.optionsText"
            :rows="4"
            placeholder="apple=苹果&#10;banana=香蕉"
            :disabled="disabled"
          />
        </FormItem>
        <FormItem v-if="draft.type === 'select'" label="允许多选">
          <Switch v-model:checked="draft.multiple" :disabled="disabled" />
        </FormItem>
      </template>

      <!-- 多行文本 -->
      <FormItem v-if="draft.type === 'textarea'" label="行数">
        <InputNumber v-model:value="draft.rows" :min="2" :max="20" :disabled="disabled" />
      </FormItem>

      <!-- 日期 -->
      <FormItem v-if="draft.type === 'date'" label="日期精度">
        <Select
          v-model:value="draft.date_type"
          :options="DATE_TYPE_OPTIONS"
          :disabled="disabled"
        />
      </FormItem>

      <!-- 文件 -->
      <template v-if="draft.type === 'file'">
        <FormItem label="允许类型">
          <Select
            v-model:value="draft.accept"
            mode="multiple"
            :options="FILE_ACCEPTS"
            :disabled="disabled"
          />
        </FormItem>
        <div class="grid grid-cols-3 gap-x-4">
          <FormItem label="最少文件数">
            <InputNumber
              v-model:value="draft.min_files"
              :min="0"
              :max="10"
              :disabled="disabled"
            />
          </FormItem>
          <FormItem label="最多文件数">
            <InputNumber
              v-model:value="draft.max_files"
              :min="1"
              :max="10"
              :disabled="disabled"
            />
          </FormItem>
          <FormItem label="单文件上限(MB)">
            <InputNumber
              v-model:value="draft.max_file_size_mb"
              :min="1"
              :max="50"
              :disabled="disabled"
            />
          </FormItem>
        </div>
      </template>

      <!-- 容器（字段组 / 列表）子字段 -->
      <template v-if="isContainer">
        <FormItem label="子字段">
          <div class="rounded border border-gray-200 p-2 dark:border-gray-600">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-gray-500">
                  <th class="py-1">字段名</th>
                  <th class="py-1">类型</th>
                  <th class="py-1">标签</th>
                  <th class="py-1">必填</th>
                  <th class="py-1"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(child, index) in draft.fields" :key="index">
                  <td class="py-1 pr-1">
                    <Input v-model:value="child.name" size="small" :disabled="disabled" />
                  </td>
                  <td class="py-1 pr-1">
                    <Select
                      v-model:value="child.type"
                      size="small"
                      :options="CHILD_FIELD_TYPES"
                      :disabled="disabled"
                    />
                  </td>
                  <td class="py-1 pr-1">
                    <Input v-model:value="child.label" size="small" :disabled="disabled" />
                  </td>
                  <td class="py-1 pr-1 text-center">
                    <Switch v-model:checked="child.required" size="small" :disabled="disabled" />
                  </td>
                  <td class="py-1 text-right">
                    <Button
                      size="small"
                      danger
                      :disabled="disabled"
                      @click="removeChild(index)"
                    >
                      删
                    </Button>
                  </td>
                </tr>
                <tr v-if="!draft.fields.length">
                  <td colspan="5" class="py-2 text-center text-gray-400">暂无子字段</td>
                </tr>
              </tbody>
            </table>
            <Button
              size="small"
              type="dashed"
              class="mt-2 w-full"
              :disabled="disabled"
              @click="addChild"
            >
              + 添加子字段
            </Button>
          </div>
        </FormItem>
        <FormItem label="可重复（最少/最多项数）">
          <div class="flex items-center gap-2">
            <InputNumber
              v-model:value="draft.repeatable.min_items"
              :min="0"
              :max="20"
              :disabled="disabled"
            />
            <span class="text-gray-400">~</span>
            <InputNumber
              v-model:value="draft.repeatable.max_items"
              :min="1"
              :max="20"
              :disabled="disabled"
            />
          </div>
        </FormItem>
      </template>

      <!-- 基础校验 -->
      <FormItem v-if="validationItems.length" label="基础校验">
        <div class="space-y-2">
          <div
            v-for="item in validationItems"
            :key="item.key"
            class="grid grid-cols-[140px_1fr] items-center gap-2"
          >
            <span class="text-xs text-gray-500">{{ item.label }}</span>
            <InputNumber
              v-if="item.type === 'number'"
              v-model:value="draft.validation[item.key]"
              :min="item.min"
              :max="item.max"
              class="w-full"
              :disabled="disabled"
            />
            <Input
              v-else
              v-model:value="draft.validation[item.key]"
              :placeholder="item.placeholder"
              :disabled="disabled"
            />
          </div>
        </div>
      </FormItem>
    </Form>

    <div class="mt-4 flex justify-end gap-2">
      <Button :disabled="disabled" @click="emit('cancel')">取消</Button>
      <Button type="primary" :disabled="disabled" @click="handleSubmit">保存</Button>
    </div>
  </div>
</template>
