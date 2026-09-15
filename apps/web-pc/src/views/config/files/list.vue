<script setup>
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { computed, onMounted, ref, watch } from 'vue';

import { Tag, Upload, message } from 'antdv-next';

import Resource from '#/api/resource';
import { setCurrentApplicationId } from '#/api/application-context';
import { requestClient } from '#/api/request';

/**
 * 文件库（双层模型）：按 uploads（上传/引用记录）管理，照抄参考设计。
 * - 上传：POST /files/upload → files(物理) + uploads(引用)，返回 url?upload=ID
 * - 列表：GET /uploads（name/大小/分类/引用状态）
 * - 删除：DELETE /uploads/{id} 解除引用（软删）；物理文件由 files 层管理
 */
const props = defineProps({
  appId: { type: [Number, String], default: null },
});

const crudRef = ref(null);
const applications = ref([]);
const uploading = ref(false);

const kindMap = { image: '图片', video: '视频', audio: '音频', document: '文档', archive: '压缩包', other: '其他' };
const kindColor = { image: 'blue', video: 'purple', audio: 'green', document: 'orange', archive: 'default', other: 'default' };

const appId = computed(() => {
  const propApp = Number(props.appId);
  if (propApp > 0) return propApp;
  return (
    Number(localStorage.getItem('edp:current-application-id')) ||
    applications.value[0]?.id ||
    null
  );
});

watch(
  () => props.appId,
  (id) => {
    const num = Number(id);
    if (num > 0) {
      setCurrentApplicationId(num);
      crudRef.value?.refresh();
    }
  },
);

const filterFields = ref([
  { field: 'keyword', label: '文件名', type: 'text', span: 8 },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'name', type: 'text', label: '文件名', span: 12, displayOnly: true },
  { field: 'category_name', type: 'text', label: '分类', span: 12, displayOnly: true },
  { field: 'mime', type: 'text', label: 'MIME', span: 12, displayOnly: true },
  { field: 'size', type: 'text', label: '大小', span: 12, displayOnly: true },
  { field: 'url', type: 'text', label: 'URL', span: 24, displayOnly: true },
  { field: 'created_at', type: 'text', label: '上传时间', span: 12, displayOnly: true },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'preview', title: '预览', width: 90, slots: { default: 'default_preview' } },
  { field: 'name', title: '文件名', minWidth: 200 },
  {
    field: 'category_name',
    title: '分类',
    width: 90,
    slots: { default: 'default_category' },
  },
  { field: 'size', title: '大小', width: 100, formatter: formatSize },
  {
    field: 'object_id',
    title: '引用',
    width: 80,
    formatter: ({ cellValue }) => (cellValue ? '已引用' : '未引用'),
  },
  { field: 'created_at', title: '上传时间', minWidth: 170 },
]);

const formData = ref(null);

function formatSize({ cellValue }) {
  if (cellValue === null || cellValue === undefined) return '-';
  const kb = cellValue / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function isImage(row) {
  return row.mime?.startsWith('image/');
}

async function handleUpload({ file }) {
  uploading.value = true;
  try {
    const formDataObj = new FormData();
    formDataObj.append('file', file);
    if (appId.value) formDataObj.append('application_id', appId.value);
    const res = await requestClient.post('/files/upload', formDataObj, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    // 双层模型返回 {url?upload=ID, upload_id, isNew, exists}：秒传时 isNew=false
    message.success(res?.exists ? '文件已存在，已复用（秒传）' : '上传成功');
    crudRef.value?.refresh();
  } catch {
    message.error('上传失败');
  } finally {
    uploading.value = false;
  }
  return false;
}

onMounted(async () => {
  try {
    const { data } = await new Resource('applications').list({ per_page: 100 });
    applications.value = data || [];
    // 抽屉嵌入时以传入应用为准，并同步请求头上下文
    const propApp = Number(props.appId);
    if (propApp > 0) {
      setCurrentApplicationId(propApp);
    }
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <AppCrudTable
    ref="crudRef"
    api-url="uploads"
    v-model="formData"
    :extra-query="{ application_id: appId }"
    :filter-fields="filterFields"
    :fields="formFields"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :inline-actions="['view', 'delete']"
    :actions-config="[
      { key: 'delete', permission: 'write' },
    ]"
    :toolbar="{ create: false }"
    permission-name="cms.file"
    title="媒体库"
    class="p-4"
  >
    <template #toolbar-prepend>
      <Upload :show-upload-list="false" :before-upload="handleUpload">
        <button
          type="button"
          class="rounded-md border border-blue-500 px-3 py-1.5 text-sm text-blue-500 transition hover:bg-blue-50"
          :disabled="uploading"
        >
          {{ uploading ? '上传中...' : '上传文件' }}
        </button>
      </Upload>
    </template>

    <template #default_preview="{ row }">
      <img
        v-if="isImage(row)"
        :src="row.url"
        alt=""
        class="h-10 w-14 rounded object-cover"
      />
      <Tag v-else>{{ row.extension || '文件' }}</Tag>
    </template>
    <template #default_category="{ row }">
      <Tag :color="row.mime?.startsWith('image/') ? 'blue' : 'default'">
        {{ row.category_name || '其他' }}
      </Tag>
    </template>
  </AppCrudTable>
</template>
