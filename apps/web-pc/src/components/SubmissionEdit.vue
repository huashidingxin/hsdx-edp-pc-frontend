<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';

import { Form, Input, InputNumber, message } from 'antdv-next';

import Resource from '#/api/resource';
import AppField from '#/components/AppField.vue';

const props = defineProps({
  // 已填入的字段值数组（后端 submission_fields 结构 {field_id,type,content,parent_id,id}）
  values: {
    type: Array,
    default: () => [],
  },
  // 表单 ID（加载 form.fields 配置）
  formId: {
    type: [String, Number],
    default: undefined,
  },
  // 项目 ID（远程选项上下文）
  projectId: {
    type: [String, Number],
    default: undefined,
  },
  // 已存在的 submission ID（编辑模式）
  id: {
    type: [String, Number],
    default: undefined,
  },
  title: {
    type: String,
    default: '记录',
  },
  // 只读模式（仅展示，不编辑）
  readonly: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['restoreDraft', 'saveDraft', 'saved']);

// 表单字段配置（form.fields 后端返回）
const formFieldsConfig = ref([]);
// 渲染字段（map 后给 AppField 使用，扁平化非 list 字段；list 行单独管理）
const renderFields = ref([]);
// 表单数据模型 field_id -> value
const formData = ref({});
// 警告（rule level=2 通过但提示）
const warnings = ref({});
// list 类型字段状态：field_id -> [行对象数组]
const listRows = ref({});

const formRef = ref(null);

// 字段值键名采用后端约定：'_' + field_id
function fkey(f) {
  return `_${f.id}`;
}

// 远程选项预加载：相关方、单位工程
const stakeholderItems = ref([]);
const stakeholderTypeItems = ref([]); // type=construction 时
const unitProjectItems = ref([]);
const unitProjectCodeFieldId = ref(null);
const unitProjectFieldId = ref(null);

async function getStakeholders(type) {
  const params = { per_page: 'all', project_id: props.projectId };
  if (type === 'construction') params.type = 2;
  else params.types = [2, 3, 4, 5];
  const { data } = await new Resource('stakeholders').list(params);
  return data || [];
}

async function getUnitProjects() {
  const { data } = await new Resource('divisions').list({
    per_page: 'all',
    project_id: props.projectId,
    level: 1,
  });
  return data || [];
}

// 字段类型映射 -> AppField type/attrs
function mapFieldType(field) {
  const type = field.type || 'text';
  const attrs = { ...(field.attrs || {}) };
  let fieldType = 'text';
  let needStakeholders = false;
  let stakeholderType = null;

  if (type === 'text') fieldType = 'text';
  else if (type === 'textarea') fieldType = 'textarea';
  else if (type === 'switch') fieldType = 'switch';
  else if (type === 'number') fieldType = 'number';
  else if (type === 'digit') {
    fieldType = 'number';
    attrs.step = 0.01;
  } else if (type === 'select') {
    fieldType = 'select';
    attrs.options = (field.options || []).map((o) => ({ value: o, label: o }));
  } else if (type === 'multiselect') {
    fieldType = 'select';
    attrs.multiple = true;
    attrs.options = (field.options || []).map((o) => ({ value: o, label: o }));
  } else if (type === 'stakeholders' || type === 'construction') {
    fieldType = 'select';
    attrs.multiple = true;
    needStakeholders = true;
    stakeholderType = type;
  } else if (type === 'unit_project') {
    fieldType = 'select';
    attrs.options = unitProjectItems.value.map((u) => ({ value: u.name, label: u.name }));
  } else if (type === 'unit_project_code') {
    fieldType = 'text';
    attrs.disabled = true;
  } else if (type === 'date') fieldType = 'date';
  else if (type === 'time') fieldType = 'time';
  else if (type === 'datetime') fieldType = 'datetime';
  else if (type === 'image') {
    fieldType = 'image';
    attrs.limit = 1;
  } else if (type === 'images') {
    fieldType = 'image';
    attrs.multiple = true;
  } else if (type === 'file') {
    fieldType = 'file';
    attrs.multiple = true;
  } else if (type === 'video') {
    fieldType = 'video';
    attrs.limit = 1;
  } else if (type === 'temperature' || type === 'humidity' || type === 'wind') {
    fieldType = 'number';
  } else if (type === 'list') {
    fieldType = 'list';
  }

  attrs.placeholder = field.placeholder || `请输入${field.name}`;
  if (field.hint) attrs.hint = field.hint;
  if (props.readonly) {
    attrs.readonly = true;
    attrs.disabled = true;
  }
  // AppField hideDetails 等价：通过 FormItem 控制

  return { fieldType, attrs, needStakeholders, stakeholderType };
}

// 调整 AppField 可以接受 list 字段——这里用 slot 自定义渲染：list 字段标记后由 template 单独渲染
// 为简化，list 字段不进 AppField（renderFields 里放占位标识，template 检测单独渲染子表）

async function formatFields(fields) {
  const sorted = [...fields].sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const result = [];

  // 预处理 list 字段的子字段（按 parent_id 索引）
  const childrenOf = {};
  for (const f of sorted) {
    if (f.parent_id) {
      childrenOf[f.parent_id] = childrenOf[f.parent_id] || [];
      childrenOf[f.parent_id].push(f);
    }
  }

  for (const f of sorted) {
    // 跳过 list 字段的子字段（由父 list 单独管理）
    if (f.parent_id && fields.some((p) => p.id === f.parent_id && p.type === 'list')) continue;

    if (f.type === 'list') {
      unitProjectFieldId.value = unitProjectFieldId.value; // 保留占位
      const subFields = (childrenOf[f.id] || []).map((sf) => {
        const sub = mapFieldType(sf);
        return {
          ...sf,
          _fType: sub.fieldType,
          _attrs: sub.attrs,
          required: !!sf.required,
        };
      });
      result.push({
        id: f.id,
        field: fkey(f),
        label: f.name,
        type: 'list',
        subFields,
        required: !!f.required,
      });
      listRows.value[fkey(f)] = [];
      continue;
    }

    const mapped = mapFieldType(f);
    if (f.type === 'unit_project') unitProjectFieldId.value = f.id;
    if (f.type === 'unit_project_code') unitProjectCodeFieldId.value = f.id;

    const rules = [];
    if (f.required) {
      rules.push({
        required: true,
        message: (f.name.length < 10 ? f.name : '该字段') + '必填',
        trigger: 'blur',
      });
    }

    result.push({
      id: f.id,
      field: fkey(f),
      label: f.name,
      type: mapped.fieldType,
      attrs: mapped.attrs,
      required: !!f.required,
      hint: f.hint,
      rules,
      // 标识远程选项类型（异步加载完成后填充）
      _remoteStakeholder: mapped.needStakeholders ? mapped.stakeholderType : null,
    });
  }

  renderFields.value = result;
}

async function loadForm() {
  if (!props.formId) return;
  const { data } = await new Resource('forms').get(props.formId);
  formFieldsConfig.value = data.fields || [];
  await formatFields(data.fields || []);

  // 预加载涉及远程选项的字段
  const hasUnitProject = renderFields.value.some(
    (f) => f.id === unitProjectFieldId.value,
  );
  if (hasUnitProject) {
    unitProjectItems.value = await getUnitProjects();
    for (const f of renderFields.value) {
      if (f.id === unitProjectFieldId.value) {
        f.attrs.options = unitProjectItems.value.map((u) => ({
          value: u.name,
          label: u.name,
        }));
      }
    }
  }

  const hasStakeholders = renderFields.value.some(
    (f) => f._remoteStakeholder === 'stakeholders' || f._remoteStakeholder === 'construction',
  );
  if (hasStakeholders) {
    if (!stakeholderItems.value.length) stakeholderItems.value = await getStakeholders();
    if (!stakeholderTypeItems.value.length) stakeholderTypeItems.value = await getStakeholders('construction');
    for (const f of renderFields.value) {
      if (f._remoteStakeholder === 'stakeholders') {
        f.attrs.options = stakeholderItems.value.map((s) => ({ value: s.id, label: s.name }));
      } else if (f._remoteStakeholder === 'construction') {
        f.attrs.options = stakeholderTypeItems.value.map((s) => ({ value: s.id, label: s.name }));
      }
    }
  }

  setValues(props.values);
}

// 把后端 values（submission_fields 数组）填入 formData + listRows
function setValues(values) {
  if (!values || !values.length) {
    formData.value = {};
    return;
  }
  formData.value = {};
  listRows.value = {};

  const listFields = renderFields.value.filter((f) => f.type === 'list');

  for (const item of values) {
    const key = fkey({ id: item.field_id });
    const configField = renderFields.value.find((f) => f.id === item.field_id);

    if (configField && configField.type === 'list') {
      // list 字段本身是占位，子字段在 children
      continue;
    }

    if (item.parent_id) {
      // list 子字段：归入对应 list 字段的行
      const listField = listFields.find((lf) => lf.id === item.parent_id);
      if (listField) {
        listRows.value[fkey(listField)] = listRows.value[fkey(listField)] || [];
        // 按 list item id（item.list_id 暂用 item.id 行标识，后端结构需明确）分组
        // 简化：暂存为单一数组（按顺序），行分组留后端结构对齐
        listRows.value[fkey(listField)].push({
          field_id: item.field_id,
          value: item.content,
        });
      }
      continue;
    }

    formData.value[key] = item.content;
  }
}

// 单位工程名称变化联动单位工程编号
function onFieldChange(field, val) {
  if (unitProjectFieldId.value && unitProjectCodeFieldId.value && field.id === unitProjectFieldId.value) {
    const up = unitProjectItems.value.find((u) => u.name === val);
    formData.value[fkey({ id: unitProjectCodeFieldId.value })] = up?.code;
  }
}

// list 子表：新增/删除行
function addListRow(listField) {
  const key = fkey(listField);
  listRows.value[key] = listRows.value[key] || [];
  const newRow = {};
  for (const sf of listField.subFields) {
    newRow[fkey(sf)] = null;
  }
  listRows.value[key].push(newRow);
}

function removeListRow(listField, index) {
  const key = fkey(listField);
  listRows.value[key].splice(index, 1);
}

// 校验
async function validate() {
  if (!formRef.value) return true;
  try {
    await formRef.value.validate();
    return true;
  } catch {
    return false;
  }
}

// 返回表单数据 + 文件上传处理（参考 CrudDetailView 文件上传逻辑）
async function getFormData() {
  const validated = await validate();
  // 文件上传：遍历 AppField 实例 upload
  // 简化：依赖 AppField 默认立即上传机制（后续可补 batch upload）
  return {
    values: formData.value,
    listValues: listRows.value,
    warnings: warnings.value,
    validated,
  };
}

function setFormData(data) {
  formData.value = data.values || {};
  listRows.value = data.listValues || {};
}

defineExpose({
  formRef,
  formFields: formFieldsConfig,
  getFormData,
  setFormData,
  validate,
});

onMounted(loadForm);

watch(
  () => props.values,
  (v) => setValues(v),
  { deep: true }
);
</script>

<template>
  <div class="submission-edit">
    <Form ref="formRef" :model="formData" layout="vertical">
      <template v-for="field in renderFields" :key="field.field">
        <!-- list 类型：嵌套子表 -->
        <div v-if="field.type === 'list'" class="mb-4 rounded border p-3">
          <div class="mb-2 flex items-center justify-between">
            <div class="text-sm font-semibold text-gray-600">
              {{ field.label }}
              <span v-if="field.required" class="text-red-500">*</span>
            </div>
            <a-button size="small" @click="addListRow(field)">+ 新增行</a-button>
          </div>
          <div
            v-for="(row, rowIndex) in listRows[field.field] || []"
            :key="rowIndex"
            class="mb-2 flex items-end gap-2 rounded bg-gray-50 p-2"
          >
            <div
              v-for="sf in field.subFields"
              :key="sf.id"
              class="flex-1"
            >
              <div class="mb-1 text-xs text-gray-500">{{ sf.name }}<span v-if="sf.required" class="text-red-500">*</span></div>
              <AppField
                :field="{
                  field: `_${sf.id}`,
                  type: sf._fType,
                  label: sf.name,
                  attrs: sf._attrs,
                }"
                :model-value="row[fkey(sf)]"
                :show-form-item="false"
                @update:model-value="(v) => (row[fkey(sf)] = v)"
              />
            </div>
            <a-button type="link" danger size="small" @click="removeListRow(field, rowIndex)">删除</a-button>
          </div>
          <div v-if="!(listRows[field.field] || []).length" class="py-3 text-center text-sm text-gray-400">
            暂无数据，点击"+ 新增行"
          </div>
        </div>

        <!-- 常规字段 -->
        <AppField
          v-else
          :field="{
            field: field.field,
            type: field.type,
            label: field.label,
            attrs: field.attrs,
            rules: field.rules,
          }"
          :model-value="formData[field.field]"
          @update:model-value="(v) => {
            formData[field.field] = v;
            onFieldChange(field, v);
          }"
        />
      </template>
      <Form.Item v-if="Object.keys(warnings).length">
        <div class="rounded border border-orange-300 bg-orange-50 p-2 text-sm text-orange-700">
          {{ Object.values(warnings).join('；') }}
        </div>
      </Form.Item>
    </Form>
  </div>
</template>
