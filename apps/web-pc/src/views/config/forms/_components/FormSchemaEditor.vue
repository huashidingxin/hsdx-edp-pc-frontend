<script setup>
/**
 * 表单字段定义编辑器（fields_schema）
 *
 * 参考 zyzz 表单管理的「字段列表 + 属性弹窗 + 规则弹窗」三层结构，落到 edp 的
 * JSON 内嵌协议上：schema = { layout, fields }，字段顺序即数组顺序。
 */
import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Button, Popconfirm, Select, Tag, message } from 'antdv-next';

import {
  GAP_OPTIONS,
  LABEL_POSITION_OPTIONS,
  SUBMIT_ALIGN_OPTIONS,
  countFieldRules,
  fieldTypeLabel,
  isContainerType,
  isRuleSupported,
  normalizeSchemaInput,
} from './formSchema.js';

import FormFieldModal from './FormFieldModal.vue';
import FormRuleModal from './FormRuleModal.vue';

const props = defineProps({
  modelValue: { type: [Object, Array], default: () => ({}) },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);

const schema = computed(() => normalizeSchemaInput(props.modelValue));
const fields = computed(() => schema.value.fields);

/* ---------------- 整体布局 ---------------- */
function updateLayout(key, value) {
  emit('update:modelValue', {
    ...schema.value,
    layout: { ...schema.value.layout, [key]: value },
  });
}

/* ---------------- 字段增删改序 ---------------- */
function commit(nextFields) {
  emit('update:modelValue', { ...schema.value, fields: nextFields });
}

function move(index, offset) {
  const next = [...fields.value];
  const target = index + offset;
  if (target < 0 || target >= next.length) return;
  [next[index], next[target]] = [next[target], next[index]];
  commit(next);
}

function remove(index) {
  const next = [...fields.value];
  next.splice(index, 1);
  commit(next);
}

/** 子字段在兄弟内移动 */
function moveChild(parentIndex, childIndex, offset) {
  const parent = fields.value[parentIndex];
  const children = [...(parent.fields || [])];
  const target = childIndex + offset;
  if (target < 0 || target >= children.length) return;
  [children[childIndex], children[target]] = [
    children[target],
    children[childIndex],
  ];
  const next = [...fields.value];
  next[parentIndex] = { ...parent, fields: children };
  commit(next);
}

/** 删除子字段 */
function removeChild(parentIndex, childIndex) {
  const parent = fields.value[parentIndex];
  const children = [...(parent.fields || [])];
  children.splice(childIndex, 1);
  const next = [...fields.value];
  next[parentIndex] = { ...parent, fields: children };
  commit(next);
}

/* ---------------- 树形行模型：父字段（容器）直接列出子字段 ----------------
 * 与 zyzz 表单管理一致：子字段作为树形行紧跟父字段，每行均可独立配置校验规则
 * （后端协议：容器的规则配置在子字段上，子字段为标量类型）。 */
const gridRows = computed(() => {
  const rows = [];
  fields.value.forEach((field, parentIndex) => {
    rows.push({ field, depth: 0, parentIndex, childIndex: -1 });
    (field.fields || []).forEach((child, childIndex) => {
      rows.push({ field: child, depth: 1, parentIndex, childIndex });
    });
  });
  return rows;
});

const childCount = computed(() => gridRows.value.length - fields.value.length);

function rowKey(row) {
  return `${row.parentIndex}-${row.childIndex}-${row.field?.name || ''}`;
}

function siblingCount(row) {
  const parent = fields.value[row.parentIndex];
  return (parent?.fields || []).length;
}

/* ---------------- 字段属性弹窗 ---------------- */
const [FieldModal, fieldModalApi] = useVbenModal({
  class: 'w-[760px]',
  destroyOnClose: true,
  closeOnClickModal: false,
  // 内容组件自带页脚（取消/保存），隐藏默认页脚
  footer: false,
});

const [RuleModal, ruleModalApi] = useVbenModal({
  class: 'w-[1100px]',
  destroyOnClose: true,
  closeOnClickModal: false,
  footer: false,
});

const editingField = ref(null);
// 编辑目标：level 'top'（顶层字段）/ 'child'（父字段的子字段）；index -1 表示新增
const editingTarget = ref({ level: 'top', parentIndex: -1, childIndex: -1 });
const childMode = ref(false);

function openCreate() {
  editingField.value = null;
  editingTarget.value = { level: 'top', parentIndex: -1, childIndex: -1 };
  childMode.value = false;
  fieldModalApi.setState({ title: '新增字段' });
  fieldModalApi.open();
}

function openEdit(row) {
  editingField.value = row.field;
  editingTarget.value = {
    level: row.depth === 0 ? 'top' : 'child',
    parentIndex: row.parentIndex,
    childIndex: row.childIndex,
  };
  childMode.value = row.depth === 1;
  fieldModalApi.setState({
    title: `编辑字段 - ${row.field?.label || row.field?.name || ''}`,
  });
  fieldModalApi.open();
}

function openChildCreate(parentIndex) {
  const parent = fields.value[parentIndex];
  editingField.value = null;
  editingTarget.value = { level: 'child', parentIndex, childIndex: -1 };
  childMode.value = true;
  fieldModalApi.setState({
    title: `新增子字段 - ${parent?.label || parent?.name || ''}`,
  });
  fieldModalApi.open();
}

/** 同级已有字段名（顶层或子字段层），用于重名校验，排除正在编辑的那一行 */
function otherNames() {
  const target = editingTarget.value;
  const list =
    target.level === 'child'
      ? fields.value[target.parentIndex]?.fields || []
      : fields.value;
  const excludeIndex =
    target.level === 'child' ? target.childIndex : target.parentIndex;
  return list
    .filter((_, i) => i !== excludeIndex)
    .map((field) => field?.name)
    .filter(Boolean);
}

function onFieldSubmit(stored) {
  const target = editingTarget.value;
  const next = [...fields.value];
  if (target.level === 'child') {
    const parent = fields.value[target.parentIndex];
    const children = [...(parent.fields || [])];
    if (target.childIndex >= 0) children[target.childIndex] = stored;
    else children.push(stored);
    next[target.parentIndex] = { ...parent, fields: children };
  } else if (target.parentIndex >= 0) {
    next[target.parentIndex] = stored;
  } else {
    next.push(stored);
  }
  commit(next);
  fieldModalApi.close();
}

/* ---------------- 校验规则弹窗 ---------------- */
const ruleField = ref(null);
const ruleTarget = ref({ level: 'top', parentIndex: -1, childIndex: -1 });

function openRules(row) {
  const field = row.field;
  if (!isRuleSupported(field?.type)) {
    message.info('字段组 / 列表 / 文件 / 地址 不支持自定义规则');
    return;
  }
  ruleField.value = field;
  ruleTarget.value = {
    level: row.depth === 0 ? 'top' : 'child',
    parentIndex: row.parentIndex,
    childIndex: row.childIndex,
  };
  ruleModalApi.setState({
    title: `校验规则 - ${field?.label || field?.name || ''}`,
  });
  ruleModalApi.open();
}

function onRuleSubmit(stored) {
  const target = ruleTarget.value;
  const next = [...fields.value];
  if (target.level === 'child') {
    const parent = fields.value[target.parentIndex];
    const children = [...(parent.fields || [])];
    children[target.childIndex] = stored;
    next[target.parentIndex] = { ...parent, fields: children };
  } else {
    next[target.parentIndex] = stored;
  }
  commit(next);
  ruleModalApi.close();
}
</script>

<template>
  <div class="form-schema-editor">
    <div class="mb-3 grid grid-cols-3 gap-3">
      <div>
        <div class="mb-1 text-xs text-gray-500">标签位置</div>
        <Select
          :value="schema.layout.label_position"
          :options="LABEL_POSITION_OPTIONS"
          :disabled="disabled"
          @change="(v) => updateLayout('label_position', v)"
        />
      </div>
      <div>
        <div class="mb-1 text-xs text-gray-500">提交按钮对齐</div>
        <Select
          :value="schema.layout.submit_align"
          :options="SUBMIT_ALIGN_OPTIONS"
          :disabled="disabled"
          @change="(v) => updateLayout('submit_align', v)"
        />
      </div>
      <div>
        <div class="mb-1 text-xs text-gray-500">字段间距</div>
        <Select
          :value="schema.layout.gap"
          :options="GAP_OPTIONS"
          :disabled="disabled"
          @change="(v) => updateLayout('gap', v)"
        />
      </div>
    </div>

    <div class="mb-2 flex items-center justify-between">
      <span class="text-sm text-gray-500">
        共 {{ fields.length }} 个字段<template v-if="childCount > 0">
          （含 {{ childCount }} 个子字段）</template
        >，顺序即表单渲染顺序；列表字段的子字段可在其下直接配置校验规则
      </span>
      <Button
        type="primary"
        size="small"
        :disabled="disabled"
        @click="openCreate"
      >
        + 新增字段
      </Button>
    </div>

    <table class="w-full border-collapse text-sm">
      <thead>
        <tr class="bg-gray-50 dark:bg-gray-800">
          <th class="border border-gray-200 px-2 py-2 text-left dark:border-gray-600">字段名</th>
          <th class="border border-gray-200 px-2 py-2 text-left dark:border-gray-600">标签</th>
          <th class="border border-gray-200 px-2 py-2 text-left dark:border-gray-600">类型</th>
          <th class="border border-gray-200 px-2 py-2 text-center dark:border-gray-600">必填</th>
          <th class="border border-gray-200 px-2 py-2 text-center dark:border-gray-600">规则</th>
          <th class="border border-gray-200 px-2 py-2 text-center dark:border-gray-600">宽度</th>
          <th
            class="border border-gray-200 px-2 py-2 text-center dark:border-gray-600"
            style="width: 280px"
          >
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in gridRows" :key="rowKey(row)">
          <td class="border border-gray-200 px-2 py-1.5 font-mono text-xs dark:border-gray-600">
            <div :style="{ paddingLeft: `${row.depth * 20}px` }">
              <span v-if="row.depth > 0" class="mr-1 text-gray-400">└</span>
              {{ row.field.name }}
            </div>
          </td>
          <td
            class="border border-gray-200 px-2 py-1.5 dark:border-gray-600"
            :class="row.depth > 0 ? 'text-gray-500' : ''"
          >
            {{ row.field.label }}
          </td>
          <td class="border border-gray-200 px-2 py-1.5 dark:border-gray-600">
            {{ fieldTypeLabel(row.field.type) }}
          </td>
          <td class="border border-gray-200 px-2 py-1.5 text-center dark:border-gray-600">
            <Tag v-if="row.field.required" color="red" class="!m-0">必填</Tag>
            <span v-else class="text-gray-300">-</span>
          </td>
          <td class="border border-gray-200 px-2 py-1.5 text-center dark:border-gray-600">
            <Tag
              v-if="countFieldRules(row.field)"
              color="blue"
              class="!m-0 cursor-pointer"
              @click="openRules(row)"
            >
              {{ countFieldRules(row.field) }} 条
            </Tag>
            <span
              v-else-if="isContainerType(row.field.type)"
              class="text-gray-300"
            >
              -
            </span>
            <span v-else class="text-gray-300">-</span>
          </td>
          <td class="border border-gray-200 px-2 py-1.5 text-center text-xs dark:border-gray-600">
            <template v-if="row.depth === 0">
              {{ row.field.layout?.span ?? 12 }}/12
            </template>
            <span v-else class="text-gray-300">-</span>
          </td>
          <td class="border border-gray-200 px-2 py-1.5 text-center dark:border-gray-600">
            <div class="flex flex-wrap justify-center gap-1">
              <Button
                size="small"
                :disabled="disabled"
                @click="openEdit(row)"
              >
                编辑
              </Button>
              <!-- 容器字段：规则在子字段上，提供「+子字段」快捷入口 -->
              <Button
                v-if="row.depth === 0 && isContainerType(row.field.type)"
                size="small"
                type="dashed"
                :disabled="disabled"
                @click="openChildCreate(row.parentIndex)"
              >
                +子字段
              </Button>
              <!-- 子字段行与顶层标量行均可直接配置规则 -->
              <Button
                v-if="
                  row.depth === 1 ||
                  (row.depth === 0 && isRuleSupported(row.field.type))
                "
                size="small"
                :disabled="disabled"
                @click="openRules(row)"
              >
                规则
              </Button>
              <template v-if="row.depth === 1">
                <Button
                  size="small"
                  :disabled="disabled || row.childIndex === 0"
                  @click="moveChild(row.parentIndex, row.childIndex, -1)"
                >
                  ↑
                </Button>
                <Button
                  size="small"
                  :disabled="disabled || row.childIndex === siblingCount(row) - 1"
                  @click="moveChild(row.parentIndex, row.childIndex, 1)"
                >
                  ↓
                </Button>
                <Popconfirm
                  title="确定删除该子字段？其校验规则会一并删除"
                  @confirm="removeChild(row.parentIndex, row.childIndex)"
                >
                  <Button size="small" danger :disabled="disabled">删除</Button>
                </Popconfirm>
              </template>
              <template v-else>
                <Button
                  size="small"
                  :disabled="disabled || row.parentIndex === 0"
                  @click="move(row.parentIndex, -1)"
                >
                  ↑
                </Button>
                <Button
                  size="small"
                  :disabled="disabled || row.parentIndex === fields.length - 1"
                  @click="move(row.parentIndex, 1)"
                >
                  ↓
                </Button>
                <Popconfirm
                  title="确定删除该字段？其子字段与校验规则会一并删除"
                  @confirm="remove(row.parentIndex)"
                >
                  <Button size="small" danger :disabled="disabled">删除</Button>
                </Popconfirm>
              </template>
            </div>
          </td>
        </tr>
        <tr v-if="!fields.length">
          <td
            colspan="7"
            class="border border-gray-200 px-2 py-8 text-center text-gray-400 dark:border-gray-600"
          >
            暂无字段，点击右上角「新增字段」开始配置
          </td>
        </tr>
      </tbody>
    </table>

    <FieldModal>
      <FormFieldModal
        :field="editingField"
        :child-mode="childMode"
        :existing-names="otherNames()"
        :disabled="disabled"
        @submit="onFieldSubmit"
        @cancel="fieldModalApi.close()"
      />
    </FieldModal>

    <RuleModal>
      <FormRuleModal
        :field="ruleField"
        :disabled="disabled"
        @submit="onRuleSubmit"
        @cancel="ruleModalApi.close()"
      />
    </RuleModal>
  </div>
</template>
