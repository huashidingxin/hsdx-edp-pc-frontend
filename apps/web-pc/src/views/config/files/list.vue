<script setup>
import { computed, onMounted, ref } from 'vue';

import { Tag, Upload, message } from 'antdv-next';

import Resource from '#/api/resource';
import { requestClient } from '#/api/request';

const crudRef = ref(null);
const applications = ref([]);
const uploading = ref(false);

const kindMap = { image: '图片', video: '视频', audio: '音频', document: '文档', archive: '压缩包', other: '其他' };
const kindColor = { image: 'blue', video: 'purple', audio: 'green', document: 'orange', archive: 'default', other: 'default' };

const appId = computed(
  () =>
    Number(localStorage.getItem('edp:current-application-id')) ||
    applications.value[0]?.id ||
    null,
);

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
  { field: 'kind', label: '类型', type: 'select', span: 8, attrs: { items: kindItems } },
]);

const kindItems = [
  { id: 'image', name: '图片' },
  { id: 'video', name: '视频' },
  { id: 'audio', name: '音频' },
  { id: 'document', name: '文档' },
  { id: 'archive', name: '压缩包' },
  { id: 'other', name: '其他' },
];

const formFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'name', type: 'text', label: '名称', span: 12, displayOnly: true },
  { field: 'kind', type: 'text', label: '类型', span: 12, displayOnly: true },
  { field: 'mime', type: 'text', label: 'MIME', span: 12, displayOnly: true },
  { field: 'size', type: 'text', label: '大小', span: 12, displayOnly: true },
  { field: 'url', type: 'text', label: 'URL', span: 24, displayOnly: true },
  { field: 'created_at', type: 'datetime', label: '上传时间', span: 12, displayOnly: true },
]);

const gridColumns = ref([
  { field: 'id', title: 'ID', width: 70 },
  { field: 'preview', title: '预览', width: 90, slots: { default: 'default_preview' } },
  { field: 'name', title: '名称', minWidth: 200 },
  { field: 'kind', title: '类型', width: 90, slots: { default: 'default_kind' } },
  { field: 'size', title: '大小', width: 100, formatter: formatSize },
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
  return row.kind === 'image';
}

async function handleUpload({ file }) {
  uploading.value = true;
  try {
    const formDataObj = new FormData();
    formDataObj.append('file', file);
    if (appId.value) formDataObj.append('application_id', appId.value);
    await requestClient.post('/admin/files/upload', formDataObj, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    message.success('上传成功');
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
    const { data } = await new Resource('admin/applications').list({ per_page: 100 });
    applications.value = data || [];
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <AppCrudTable
    ref="crudRef"
    api-url="admin/files"
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
      <Tag v-else>{{ kindMap[row.kind] || row.kind }}</Tag>
    </template>
    <template #default_kind="{ row }">
      <Tag :color="kindColor[row.kind] || 'default'">{{ kindMap[row.kind] || '-' }}</Tag>
    </template>
  </AppCrudTable>
</template>
