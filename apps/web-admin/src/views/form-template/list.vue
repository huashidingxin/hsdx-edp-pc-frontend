<script setup lang="ts">
import { useAccess } from '@vben/access';
import { useUserStore } from '@vben/stores';

import Resource from '@/api/resource';
import { cloneDeep } from 'lodash';

import { useAppStore, useProjectStore } from '#/store';
import { getTree } from '#/utils/index.js';

const props = defineProps({
  formId: {
    default: undefined,
    type: String,
  },
  type: {
    default: 2,
    type: [String, Number],
  },
  formFields: {
    default: () => [],
    type: Array,
  },
});
const { hasAccessByCodes, hasAccessByRoles } = useAccess();
const appStore = useAppStore();
const tableRef = ref(null);
const options = ref({
  columns: [
    { field: 'name', title: '名称', minWidth: 200 },
    { field: 'code', title: '编号', width: 200 },
    {
      field: 'is_default',
      title: '默认',
      width: 200,
      slots: { default: 'default_is_default' },
    },
    {
      field: 'project.name',
      title: '项目',
      slots: { default: 'default_project' },
    },
  ],
  data: [],
});
const filters = ref([
  {
    field: 'name',
    type: 'text',
    col: 3,
    label: '名称',
  },
]);
const fields = ref([
  {
    field: 'name',
    type: 'text',
    col: 9,
    label: '名称',
    rules: [(v) => !!v || '请输入名称'],
  },
  {
    field: 'code',
    type: 'text',
    col: 3,
    label: '编号',
    rules: [(v) => !!v || '请输入编号'],
  },
  {
    field: 'file_path',
    type: 'file',
    col: 12,
    label: '模板',
    attrs: {
      fileType: 'file',
      accept: '.docx,.doc',
    },
    rules: [(v) => !!v || '请上传模板'],
  },
  {
    field: 'is_default',
    type: 'switch',
    col: 3,
    label: '默认',
  },
  {
    field: 'content',
    type: 'slot',
    col: 12,
    label: '模板',
  },
]);

const typeModels = {
  1: [
    {
      key: 'template_code',
      name: '表编号',
    },
    {
      key: 'submission_code',
      name: '文档编号',
    },
    {
      key: 'signature_image',
      name: '手写签名',
    },
    {
      key: 'datetime',
      name: '时间',
      children: [
        { key: 'year', name: '年' },
        { key: 'month', name: '月' },
        { key: 'day', name: '日' },
        { key: 'date', name: '日期' },
        { key: 'time', name: '时间' },
      ],
    },
    {
      key: 'weather',
      name: '天气',
      children: [
        { key: 'name', name: '名称' },
        { key: 'degree', name: '温度' },
        { key: 'humidity', name: '湿度' },
        { key: 'pressure', name: '气压' },
        { key: 'day_degree_min', name: '最低温度' },
        { key: 'day_degree_max', name: '最高温度' },
        { key: 'wind_power', name: '风级' },
        { key: 'wind_speed', name: '风速' },
        { key: 'wind_direction_name', name: '风向' },
        { key: 'weather', name: '名称+温度范围+风速' },
      ],
    },
    {
      key: 'project',
      name: '项目',
      children: [
        { key: 'name', name: '名称' },
        { key: 'code', name: '编号' },
        { key: 'owner_name', name: '业主' },
        { key: 'supervisor_name', name: '监理单位' },
        { key: 'supervisor_manager', name: '监理单位项目经理' },
      ],
    },
    {
      key: 'task',
      name: '任务',
      children: [
        { key: 'staff_name', name: '执行人' },
        { key: 'mileposts', name: '桩号' },
      ],
    },
  ],
  2: [
    {
      key: 'template_code',
      name: '表编号',
    },
    {
      key: 'submission_code',
      name: '文档编号',
    },
    {
      key: 'signature_image',
      name: '手写签名',
    },
    {
      key: 'datetime',
      name: '时间',
      children: [
        { key: 'year', name: '年' },
        { key: 'month', name: '月' },
        { key: 'day', name: '日' },
        { key: 'date', name: '日期' },
        { key: 'time', name: '时间' },
      ],
    },
    {
      key: 'weather',
      name: '天气',
      children: [
        { key: 'name', name: '名称' },
        { key: 'degree', name: '温度' },
        { key: 'humidity', name: '湿度' },
        { key: 'pressure', name: '气压' },
        { key: 'day_degree_min', name: '最低温度' },
        { key: 'day_degree_max', name: '最高温度' },
        { key: 'wind_power', name: '风级' },
        { key: 'wind_speed', name: '风速' },
        { key: 'wind_direction_name', name: '风向' },
        { key: 'weather', name: '名称+温度范围+风速' },
      ],
    },
    {
      key: 'project',
      name: '项目',
      children: [
        { key: 'name', name: '名称' },
        { key: 'code', name: '编号' },
        { key: 'owner_name', name: '业主' },
        { key: 'supervisor_name', name: '监理单位' },
        { key: 'supervisor_manager', name: '监理单位项目经理' },
      ],
    },
    {
      key: 'task',
      name: '任务',
      children: [
        { key: 'staff_name', name: '执行人' },
        { key: 'mileposts', name: '桩号' },
      ],
    },
  ],
  3: [
    {
      key: 'template_code',
      name: '表编号',
    },
    {
      key: 'submission_code',
      name: '文档编号',
    },
    {
      key: 'signature_image',
      name: '手写签名',
    },
    {
      key: 'datetime',
      name: '时间',
      children: [
        { key: 'year', name: '年' },
        { key: 'month', name: '月' },
        { key: 'day', name: '日' },
        { key: 'date', name: '日期' },
        { key: 'time', name: '时间' },
      ],
    },
    {
      key: 'weather',
      name: '天气',
      children: [
        { key: 'name', name: '名称' },
        { key: 'degree', name: '温度' },
        { key: 'humidity', name: '湿度' },
        { key: 'pressure', name: '气压' },
        { key: 'day_degree_min', name: '最低温度' },
        { key: 'day_degree_max', name: '最高温度' },
        { key: 'wind_power', name: '风级' },
        { key: 'wind_speed', name: '风速' },
        { key: 'wind_direction_name', name: '风向' },
        { key: 'weather', name: '名称+温度范围+风速' },
      ],
    },
    {
      key: 'project',
      name: '项目',
      children: [
        { key: 'name', name: '名称' },
        { key: 'code', name: '编号' },
        { key: 'owner_name', name: '业主' },
        { key: 'supervisor_name', name: '监理单位' },
        { key: 'supervisor_manager', name: '监理单位项目经理' },
      ],
    },
    {
      key: 'task',
      name: '任务',
      children: [
        { key: 'staff_name', name: '执行人' },
        { key: 'mileposts', name: '桩号' },
      ],
    },
  ],
};
const formData = ref(null);
// const formModels = computed(() => {
//   const _formFields = props.formFields.map((item) => {
//     return {
//       key: item.id,
//       ...item,
//     };
//   });
//   const tree = getTree(_formFields, null);
//   console.log(tree);
//   console.log(typeModels, props.type);
//   return [
//     ...typeModels[props.type],
//     { key: 'fields', name: '字段', children: tree },
//   ];
// });

function formatFormField() {
  const _formFields = formData.value.fields.map((item) => {
    return {
      key: `_${item.id}`,
      ...item,
    };
  });
  const tree = getTree(_formFields, null);
  let list = [];
  const commonFields = cloneDeep(typeModels[props.type]);
  commonFields.forEach((e) => {
    if (e.children?.length) {
      e.children = e.children.map((val) => {
        return {
          key: `${e.key}.${val.key}`,
          name: `${val.name}(${e.name})`,
        };
      });
    }
    list.push(e);
  });

  list = [...list, { key: 'fields', name: '字段', children: tree }];
  return list;
}

const editingItem = ref({ content: '' });

function saveFormat(e) {
  e.form_id = props.formId;
  return {
    ...e,
    printable_type: 'form',
    printable_id: props.formId,
    project_id: appStore.defaultProject?.id,
  };
}

const requestData = computed(() => {
  return {
    printable_type: 'form',
    printable_id: props.formId,
    project_id: appStore.defaultProject?.id,
  };
});

const userStore = useUserStore();

const document = ref(null);
const user = computed(() => {
  return {
    ...userStore.userInfo,
    image: userStore.userInfo.avatar,
  };
});
const plugins = computed(() => {
  console.log('formData.value', formData.value);
  return {
    autostart: ['asc.formfields'],
    // pluginsData:[{formId:158},{formId:157}]
    options: {
      'asc.formfields': {
        data: formData.value,
      },
    },
  };
});

async function getForm() {
  try {
    const api = new Resource('forms');
    const { data } = await api.get(props.formId);
    // 格式化fields

    formData.value = data;
  } catch (error) {
    console.log(error);
  }
}

async function openDocument() {
  await getForm();
  formData.value.fields = formatFormField();

  const urlObj = new URL(editingItem.value.file_path);
  const urlPathArr = urlObj.pathname.split('/');
  console.log('urlPathArr', urlPathArr);
  document.value = {
    fileType: 'docx',
    key: urlPathArr.pop().split('.').shift(),
    url: editingItem.value.file_path,
    title: editingItem.value.name,
  };
  tableRef.value.openDialog(editingItem.value.name, 'drawer');
}

// watch(()=>editingItem.value.id,(newVal)=>{
//   if(newVal){
//     if(editingItem.value.file_path){
//       openDocument()
//     }
//
//   }
// })

const officeCallbackUrl = computed(() => {
  return `${import.meta.env.VITE_GLOB_API_URL}/print-templates/${
    editingItem.value?.id
  }/file`;
});

function saved(e) {
  if (e.file_path) {
    openDocument();
  }
}
function rowCan(row, action = 'edit') {
  return (
    hasAccessByRoles(['Super Admin', 'Admin']) ||
    ((!row?.id || appStore.defaultProject?.id == row.project_id) &&
      hasAccessByCodes([`${action} print_template`]))
  );
}
function showEdit(e) {
  return (
    hasAccessByRoles(['Super Admin', 'Admin']) || !e.id || rowCan(e, 'edit')
  );
}
function showDelete(e) {
  return !e.id || rowCan(e, 'delete');
}

function copyCreate(row) {
  const { id, project_id, code, ...copyData } = row;
  tableRef.value.openDetail();
  editingItem.value = copyData;
}
</script>
<template>
  <AppTable
    ref="tableRef"
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    :fields="fields"
    create-open-type="modal"
    detail-open-type="modal"
    :request-data="requestData"
    title="模板列表"
    api-url="print-templates"
    :save-format="saveFormat"
    @saved="saved"
    :show-edit="showEdit"
    :show-delete="showDelete"
    permission-name="print_template"
  >
    <template #action="{ data }">
      <v-list-item
        v-if="
          hasAccessByRoles(['Super Admin', 'Admin']) ||
          hasAccessByCodes(['create print_template'])
        "
        @click="copyCreate(data)"
      >
        <v-list-item-title>复制</v-list-item-title>
      </v-list-item>
    </template>
    <template #default_is_default="{ data: { row } }">
      <v-icon v-if="row.is_default" color="success">mdi-check</v-icon>
    </template>

    <template #default_project="{ data: { row } }">
      {{ row.project_id > 0 ? row.project.name : '通用' }}
    </template>

    <template #form_action>
      <v-btn v-if="editingItem.file_path" variant="text" @click="openDocument">
        <v-icon>mdi-puzzle-edit-outline</v-icon>
        {{ rowCan(editingItem, 'edit') ? '编辑' : '查看' }}模板
      </v-btn>
    </template>

    <template #dialog-content>
      <AppOffice
        :document="document"
        :user="user"
        :plugins="plugins"
        :callback-url="officeCallbackUrl"
        :mode="rowCan(editingItem, 'edit') ? 'edit' : 'view'"
      />
    </template>
  </AppTable>
</template>

<style scoped></style>
