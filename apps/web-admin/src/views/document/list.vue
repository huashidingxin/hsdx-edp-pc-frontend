<script setup>
import { computed, inject, ref } from 'vue';

import { useUserStore } from '@vben/stores';

import Resource from '@/api/resource.js';
import { useAppStore } from '@/store/app.js';
import { cloneDeep } from 'lodash';
import { VChip, VListItem } from 'vuetify/components';

import SubmissionEdit from '../submission/edit.vue';

const props = defineProps({
  type: {
    default: 'supervision_log',
    type: String,
  },
});
const $loader = inject('$loader');
const appStore = useAppStore();

const $confirm = inject('$confirm');
const userStore = useUserStore();
const stateRender = {
  name: 'CellRender',
  render: ({ row }) => {
    if (!row.submission_id) {
      return '待提交';
    }
    const colors = { 1: 'primary', 2: 'success', 3: 'error', 4: '' };
    return h(VChip, {
      text: row.state_label,
      color: colors[row.state],
      label: true,
      size: 'small',
    });
  },
};

// 表格配置
const options = ref({
  rowConfig: {
    keyField: 'id',
  },
  checkboxConfig: {
    reserve: true,
  },
  columns: [
    {
      field: 'submission.code',
      title: '编号',
      width: 200,
      slots: { default: 'default_submission_code' },
    },
    { field: 'form.name', title: '文档类型', width: 200, sortable: true },
    {
      field: 'deadline_time',
      title: '截止提交日期',
      width: 200,
      sortable: true,
    },
    { field: 'user.name', title: '记录人', width: 200 },
    {
      field: 'submission.state_label',
      title: '记录状态',
      width: 200,
      cellRender: stateRender,
    },
    { field: 'submitted_at', title: '记录时间', width: 200 },
    { field: 'project.name', title: '项目', minWidth: 300 },
    // {field: 'submission_timeout', title: '超时',width:200,slots:{default:'default_submission_timeout'}},
    // {field: 'created_at', title: '创建时间',minWidth:200},
  ],
  data: [],
});

// 过滤条件
const filters = ref([
  {
    field: 'submission_code',
    type: 'text',
    col: 3,
    label: '编号',
  },
  {
    field: 'form_id',
    type: 'autocomplete',
    col: 3,
    updateSearch: {
      apiUrl: 'forms',
      params: {
        type: 4,
      },
    },
    label: '类型',
  },
  {
    field: 'user_id',
    type: 'autocomplete',
    col: 3,
    label: '记录人',
    attrs: {
      items: [],
    },
    slots: [
      {
        name: 'chip',
        component: markRaw(VChip),
        bind: (e) => {
          return {
            ...e.props,
            prependAvatar: e.item.raw?.avatar,
            text: e.item.raw?.name || '',
          };
        },
      },
      {
        name: 'item',
        component: markRaw(VListItem),
        bind: (e) => {
          return {
            ...e.props,
            prependAvatar: e.item.raw?.avatar || '',
            text: e.item.raw?.name,
            subtitle: e.item.raw.id,
          };
        },
      },
    ],
  },
  {
    field: 'date_range',
    type: 'datetime',
    col: 3,
    label: '日期',
    attrs: {
      onlyDate: true,
      range: true,
      inputProps: { clearable: true },
    },
  },
  {
    field: 'submission_status',
    type: 'select',
    col: 3,
    label: '提交状态',
    default: appStore.defaultProject?.id > 0 ? undefined : 1,
    attrs: {
      items: [
        { id: 0, name: '待提交' },
        { id: 1, name: '已提交' },
      ],
    },
  },
  // {
  //   field: 'submission_states',
  //   type: 'select',
  //   col: 3,
  //   label: '审核状态',
  //   attrs:{
  //     items:[
  //       {id:1,name:'待审核'},
  //       {id:2,name:'审核通过'},
  //       {id:3,name:'审核不通过'},
  //     ],
  //     multiple: true
  //   }
  // },
  // {
  //   field: 'submission_timeouts',
  //   type: 'select',
  //   col: 3,
  //   label: '超时状态',
  //   attrs:{
  //     items:[
  //       {id:0,name:'正常'},
  //       {id:1,name:'超时'},
  //     ],
  //     multiple:true
  //   }
  // },
]);

// 表单字段
const fields = ref([
  {
    field: 'content',
    type: 'slot',
    col: 12,
    label: '内容',
  },
]);

const editingItem = ref({});
const $toast = inject('$toast');
const tableRef = ref(null);
const withSignature = ref(false);
const selectedRows = ref([]);
const selectRows = ref([]);

const requestData = computed(() => ({
  project_id: appStore.defaultProject?.id,
  with_signature: withSignature.value ? 1 : 0,
}));

function showView(e) {
  return e.submission_id > 0;
}
const doc = computed(() => {
  if (!editingItem.value.submission?.file_path) {
    return {};
  }
  const key = editingItem.value.submission.file_path
    .split('/')
    .pop()
    .split('?')
    .shift();
  return {
    url: editingItem.value.submission?.file_path,
    key: `submission_${key}`,
    title: '任务记录',
    fileType: 'docx',
  };
});

const plugins = computed(() => {
  // return {
  //   autostart: ['asc.tools'],
  //   options: {
  //     "asc.tools": {
  //       signatureStatus: false,
  //     },
  //   },
  // }
});
const mergeDoc = ref({});
// 批量打印
async function batch(isExport = false) {
  const canRenders = [];
  selectRows.value.forEach((e) => {
    if (e.submission_id) {
      canRenders.push(e.submission_id);
    }
  });
  if (canRenders.length === 0) {
    $toast.error('请至少选择一条已提交的记录');
    return;
  }
  const loader = $loader.show('处理中，请稍侯');
  try {
    const api = new Resource('submission', { timeout: 60_000 });
    const { data } = await api.get('batch', {
      merge: isExport ? 1 : 0,
      signature: withSignature.value ? 1 : 0,
      list: selectRows.value
        .map((e) => {
          return e.submission_id;
        })
        .join(','),
    });
    if (isExport) {
      const link = window.document.createElement('a');
      link.href = data.url;
      link.setAttribute('download', data.name);
      window.document.body.append(link);
      link.click();
      link.remove();
      $toast.success('下载成功');
    } else {
      mergeDoc.value = data;
      tableRef.value.openDialog(data.name, 'drawer');
    }
  } catch (error) {
    console.log(error);
  }
  loader.close();
}

async function getProjectUsers(projectId = null) {
  try {
    const api = new Resource('project-users');
    const { data } = await api.list({
      per_page: 'all',
      project_id: projectId || appStore.defaultProject?.id,
    });
    filters.value.find((v) => v.field === 'user_id').attrs.items = data.map(
      (e) => {
        return { ...e.user };
      },
    );
  } catch (error) {
    console.log(error);
  }
}

const isEdit = ref(false);
function showDetail(_isEdit) {
  isEdit.value = _isEdit;
}

function dialogChange(status) {
  if (!status) {
    isPreview.value = false;
    isEdit.value = false;
  }
}

function showAudit(e) {
  return e.submission_id > 0 && e.submission.state < 2;
}

function showEdit(e) {
  return (
    (!e.submission_id || !e.submission || e.submission.state < 2) &&
    e.user_id == userStore.userInfo?.id
  );
}
const isPreview = ref(false);
function preview(row) {
  tableRef.value.openDetail(row.id);
  isPreview.value = false;
}

const documentCustomization = {
  autosave: false,
  forcesave: false,
};
const submissionRef = ref(null);

const defaultValues = ref({});

function detailFormat(e) {
  defaultValues.value = e.submission?.values || {};
  return e;
}
async function saveFormat(e) {
  const values = await submissionRef.value.getFormData();
  // console.log(values)
  editingItem.value = values;
  return false;
}

function reset() {
  editingItem.value.submission.values = cloneDeep(defaultValues.value);
}
async function save() {
  const formData = await submissionRef.value.getFormData();
  if (!formData.validated) {
    $toast.error('请检查表单');
    return;
  }
  try {
    const api = new Resource('documents');
    const { data } = await api.update(editingItem.value.id, {
      ...formData,
    });
    $toast.success('提交成功');
    tableRef.value.reload();
  } catch (error) {
    console.log(error);
  }
}

function projectChange(e) {
  getProjectUsers(e?.id);
}

onBeforeMount(() => {
  getProjectUsers();
});
</script>

<template>
  <div>
    <AppTable
      ref="tableRef"
      v-model="editingItem"
      v-model:selected="selectRows"
      :options="options"
      :filter-fields="filters"
      :fields="fields"
      :request-data="requestData"
      detail-open-type="drawer"
      create-open-type="page"
      api-url="documents"
      :list-scope="3"
      show-edit
      :show-delete="false"
      :show-create="false"
      :show-checkbox="false"
      :show-audit="false"
      @show-detail="showDetail"
      @dialog-change="dialogChange"
      :detail-format="detailFormat"
      :save-format="saveFormat"
      :exclude-filters="excludeFilters"
      :project-props="{ filter: true }"
      @project-change="projectChange"
    >
      <!--      <template #right>-->
      <!--        <div class="me-2">-->
      <!--          <v-btn-->
      <!--              color="warning"-->
      <!--              variant="outlined"-->
      <!--              :disabled="!selectRows.length"-->
      <!--              @click="batch(true)"-->
      <!--          >-->
      <!--            批量导出-->
      <!--          </v-btn>-->
      <!--        </div>-->
      <!--        <div class="me-2">-->
      <!--          <v-btn-->
      <!--              color="primary"-->
      <!--              variant="outlined"-->
      <!--              :disabled="!selectRows.length"-->
      <!--              @click="batch(false)"-->
      <!--          >-->
      <!--            批量打印-->
      <!--          </v-btn>-->
      <!--        </div>-->
      <!--      </template>-->

      <!--      <template #action="{data}">-->
      <!--        <v-list-item v-if="data.submission_id > 0" @click="preview(data)">-->
      <!--          <v-list-item-title >预览</v-list-item-title>-->
      <!--        </v-list-item>-->
      <!--      </template>-->

      <template #default_submission_code="{ data: { row } }">
        <VChip
          v-if="row.submission_id"
          size="small"
          label
          color="primary"
          @click="preview(row)"
        >
          {{ row.submission?.code }}
        </VChip>
        <div v-else>-</div>
      </template>

      <template #default_state_desc="{ data: { row } }"></template>

      <template #default_submission_timeout="{ data: { row } }">
        <VChip
          :color="row.submission_timeout ? 'error' : 'primary'"
          size="small"
        >
          {{ row.submission_timeout ? '超时' : '正常' }}
        </VChip>
      </template>

      <template #dialog-content>
        <AppOffice
          :document="mergeDoc"
          :plugins="plugins"
          callback-url="https://www.cpzhongzhou.com/api/v1/mock-save"
          :customization="documentCustomization"
        />
      </template>

      <template #field_content>
        <div v-if="editingItem.id" style="height: calc(100vh - 70px)">
          <AppOffice
            v-if="isPreview"
            :document="doc"
            :plugins="plugins"
            callback-url="https://www.cpzhongzhou.com/api/v1/mock-save"
            :customization="documentCustomization"
            style="height: 90vh"
          />

          <div v-else class="d-flex flex-column align-center justify-center">
            <div class="w-100">
              <SubmissionEdit
                v-if="!isPaper"
                ref="submissionRef"
                :form-id="editingItem.form_id || editingItem.submission.form_id"
                :project-id="editingItem.project_id"
                :values="editingItem.submission?.values"
              />
              <SubmissionEdit
                v-else
                ref="submissionRef"
                v-model="editingItem.values"
                :form-id="1"
                :project-id="editingItem.project_id"
                :values="editingItem.submission?.values"
              />
            </div>
          </div>
        </div>
      </template>

      <template v-if="isEdit" #form_actions>
        <v-spacer />
        <v-btn color="warning" variant="tonal" @click="reset">重置</v-btn>
        <v-btn color="primary" variant="elevated" @click="save">提交</v-btn>
      </template>
    </AppTable>
  </div>
</template>

<style scoped></style>
