<template>
  <div class="">
    <!-- 使用改造后的 field 组件 -->
    <app-form
      ref="formRef"
      v-model="formData"
      :rules="baseRules"
      :fields="fields"
      @update:base-rule="updateBaseRule"
      @update:model-value="handleFormChange"
      @update:warnings="handleWarnings"
    ></app-form>
  </div>
</template>

<script setup>
import {nextTick, onBeforeMount, ref, watch} from 'vue';
import {getTree} from '#/utils/index.js';
import Resource from "#/api/resource.js";

const props = defineProps({
  values: {
    type: Object,
    default: () => ({})
  },
  formId: {
    type: [String, Number],
    default: undefined
  },
  projectId: {
    type: [String, Number],
    default: undefined
  },
  id: {
    type: String,
    default: undefined
  },
  title: {
    type: String,
    default: '记录'
  },
  readonly: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['restoreDraft', 'saveDraft', 'saved']);

// 表单数据
const formData = ref({});
const formFields = ref([]);
const fields = ref([]);
const warnings = ref({});
const rules = ref({});
const baseRules = ref({});
const formRef = ref(null);
const fieldDefaultRules = ref({});

async function getForm(id) {
  // 替换为您的API调用
  const api = new Resource('forms', {params: {project_id: props.projectId}});
  const {data} = await api.get(id);

  formFields.value = data.fields;
  fields.value = await formatFields(data.fields);
}

watch(
  () => props.values,
  (newValue) => {
    setValues(newValue);
    nextTick(() => {
      setTimeout(() => {
        validate();
      }, 1500);
    });
  },
  {immediate: true, deep: true}
);

function setValues(values) {
  if (values && Object.values(values).length > 0) {
    formData.value = formatValues(values, null);
    //baseRules.value = formatValues(values, null, 'rule_id');
    //console.log('@@@@baseRules.value',baseRules.value)
  } else {
    formData.value = {};
    baseRules.value = {};
  }
}

function updateBaseRule(e) {
  console.log('@@@@updateBaseRule1111',e)
  rules.value = e;
}

function formatValues(values, parentId, contentKey = 'content') {

  const result = {};

  values.forEach(field => {
    if (field.parent_id == parentId) {
      const fieldKey = '_' + field.field_id;

      if (field.type === 'list') {
        result[fieldKey] = result[fieldKey] || [];

        const listChildren = values.filter(item => item.parent_id === field.id);

        if (listChildren.length > 0) {
          const listItem = {};
          listChildren.forEach(child => {
            listItem['_' + child.field_id] = child[contentKey];
          });
          result[fieldKey].push(listItem);
        } else {
          result[fieldKey] = [];
        }
      } else {
        result[fieldKey] = field[contentKey];
      }
    }
  });

  return result;
}

const unitProjectFieldId = ref(null)
const unitProjectCodeFieldId = ref(null)

async function formatFields(arr) {
  let tree = [];
  let formated = []
  for (let i in arr) {
    let item = arr[i]
    //const formated = arr.map((item) => {
    const _attrs = {};
    let _type = item.type || 'text';
    let _rules = item.rules || [];

    let direction = 'column';
    let isNumeric = false;

    if (['stakeholders', 'construction'].includes(item.type)) {
      _attrs.items = await getStakholders(item.type === 'construction' ? 2 : undefined)
      _type = 'multiselect'
    } else if (item.type === 'unit_project') {
      unitProjectFieldId.value = item.id
      const items = await getUnitProjects()
      _attrs.items = items.map((e) => {
        return {
          id: e.name,
          name: e.name
        }
      })
      _type = 'select'
    } else if (item.type === 'unit_project_code') {
      unitProjectCodeFieldId.value = item.id
      _attrs.disabled = true
    }

    if (['temperature', 'humidity', 'wind', 'number', 'digit'].includes(_type) && item.name.length < 6) {
      direction = 'row';
      isNumeric = true;
      _type = 'decimal';
      item.col = item.col || 3
    }

    if (item.type === 'image') {
      _type = 'file';
      _attrs.limit = 1;
      _attrs.fileType = 'image';
    }
    if (item.type === 'file') {
      _type = 'file';
      _attrs.limit = 1;
      _attrs.fileType = 'file';
    } else if (item.type === 'images') {
      _type = 'file';
      _attrs.fileType = 'image';
      _attrs.multiple = true
    } else if (item.type === 'video') {
      _type = 'file';
      _attrs.limit = 1;
      _attrs.fileType = 'video';
    } else if (item.type === 'videos') {
      _type = 'file';
      _attrs.fileType = 'video';
    } else if (item.type === 'textarea') {
      _attrs.autoGrow = true;
      _attrs.rows = 3;
    } else if (item.type === 'select' || item.type === 'multiselect') {
      _attrs.items = item.options.map((e) => ({
        name: e,
        value: e
      }));
      _type = 'select'
      _attrs.multiple = item.type === 'multiselect';
    } else if (item.type == 'date') {
      _type = 'date';
    } else if (item.type == 'time') {
      _type = 'time';
    } else if (item.type == 'datetime') {
      _type = 'datetime';
    } else if (item.type == 'switch') {
      item.default = "0";
    }
    _attrs.placeholder = item.placeholder || ('请输入' + item.name);

    if (item.hint) {
      _attrs.hint = item.hint;
    }

    if (item.required) {
      _rules.push({
        type: 'required',
        message: (item.name.length < 10 ? item.name : '该字段') + '必填',
        level: 1
      });
    }

    if (props.readonly) {
      _attrs.readonly = true;
      _attrs.disabled = true;
    }

    _attrs.hideDetails = true

    const defaultRuleId = fieldDefaultRules.value?.[item.id] || 0;

    formated.push({
      label: item.name,
      field: item.key || ('_' + item.id + ''),
      ...item,
      readonly: props.readonly,
      label_desc: item.hint,
      type: _type,
      required: item.required,
      rules: _rules.filter((e) => !e.rule_id),
      base_rules: item.rules?.filter((e) => e.rule_id > 0),
      attrs: _attrs,
      direction
    });
  }

  return getTree(formated);
}

const unitProjects = ref([])

async function getUnitProjects() {
  try {
    const api = new Resource('divisions')
    const {data} = await api.list({per_page: 'all', project_id: props.projectId, level: 1})
    unitProjects.value = data
    return data
  } catch (e) {
    console.log(e)
  }
}

const stakeholders = ref([])

async function getStakholders(type = undefined) {
  try {
    const types = !type ? [2, 3, 4, 5] : undefined
    const api = new Resource('stakeholders')
    const {data} = await api.list({per_page: 'all', project_id: props.projectId, type, types})
    return data
  } catch (e) {
    console.log(e)
  }
}

const handleFormChange = (newValue) => {
  // 表单数据变化处理
  if (unitProjectCodeFieldId.value && unitProjectFieldId.value) {
    const unitProject = unitProjects.value.find(v => v.name === newValue['_' + unitProjectFieldId.value])
    formData.value['_' + unitProjectCodeFieldId.value] = unitProject?.code
  }
};

function handleWarnings(e) {
  warnings.value = e;
}

const submitForm = async () => {
  const isValid = await formRef.value.validate();
  if (isValid) {
    console.log('表单数据:', formData.value);
    // 提交逻辑
  } else {
    console.log('表单校验失败');
    return;
  }

  // 替换为您的API调用
  const api = new uni.Resource('task-activity-submissions');
  const {data} = await api.store({
    values: formData.value,
    warnings: warnings.value,
    rules: rules.value
  });
};

async function validate() {
  return await formRef.value?.validate();
}

async function getFormData() {
  const validateStatus = await validate();

  // 处理文件上传
  for (let i in formRef.value.fieldRef) {
    if (typeof formRef.value.fieldRef[i].fieldRef?.upload === 'function') {
      await formRef.value.fieldRef[i].fieldRef.upload();
    }

    // 处理子表单
    if (formRef.value.childForms?.length > 0) {
      for (let childForm of formRef.value.childForms) {
        for (let childFieldRef of childForm.fieldRef) {
          if (typeof childFieldRef.fieldRef?.upload === 'function') {
            await childFieldRef.fieldRef.upload();
          }
        }
      }
    }
  }

  return {
    values: formData.value,
    warnings: warnings.value,
    rules: {...baseRules.value, ...rules.value},
    validated: validateStatus
  };
}

function setFormData(data) {
  console.log(data);
  formData.value = data.values;
  baseRules.value = data.rules;
}

onBeforeMount(() => {
  getForm(props.formId);
});

defineExpose({
  formRef,
  formFields,
  getFormData,
  setFormData,
  validate
});
</script>
