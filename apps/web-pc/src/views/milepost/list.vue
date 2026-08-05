<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { Button, message, Modal, Select } from 'antdv-next';

import { requestClient } from '#/api/request';
import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppChooseLocation from '#/components/AppChooseLocation.vue';
import AppMapDraw from '#/components/AppMapDraw.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();
const editingItem = ref({});
const tableRef = ref(null);

const currentProjectId = computed(
  () => appStore.defaultProject?.id || undefined,
);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

const filterFields = ref([
  { field: 'name', label: '名称', type: 'text', span: 8 },
  { field: 'code', label: '编号', type: 'text', span: 8 },
]);

const formFields = ref([
  { field: 'name', type: 'text', label: '名称', span: 12, required: true },
  { field: 'code', type: 'text', label: '编号', span: 12, required: true },
  { field: 'location', type: 'slot', label: '位置（经纬度）', span: 24 },
  { field: 'boundary', type: 'slot', label: '地理位置范围', span: 24 },
]);

const gridColumns = ref([
  { field: 'name', title: '名称', minWidth: 200 },
  { field: 'project.name', title: '项目', minWidth: 160 },
  { field: 'code', title: '编号', width: 120 },
  { field: 'longitude', title: '经度', width: 120 },
  { field: 'latitude', title: '纬度', width: 120 },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

function detailFormat(data) {
  return {
    ...data,
    location: { longitude: data.longitude, latitude: data.latitude },
  };
}

function saveFormat(payload) {
  const loc = payload.location || {};
  return {
    ...payload,
    project_id: payload.project_id || currentProjectId.value,
    longitude: loc.longitude,
    latitude: loc.latitude,
  };
}

// ---- KML/KMZ 批量导入 ----
const importDialog = ref(false);
const importFile = ref([]);
const importProjectId = ref(null);
const projectOptions = ref([]);
const importing = ref(false);

async function loadProjects() {
  const { data } = await new Resource('projects').list({
    per_page: 'all',
    parent_id: 0,
  });
  projectOptions.value = (data || []).map((p) => ({
    value: p.id,
    label: p.name,
  }));
}

async function submitImport() {
  if (!importFile.value?.length) {
    message.error('请选择地图文件');
    return;
  }
  const file = importFile.value[0];
  const fileObj = file instanceof File ? file : file.file;
  if (!fileObj) {
    message.error('请选择文件');
    return;
  }
  importing.value = true;
  try {
    const formData = new FormData();
    formData.append('file', fileObj);
    formData.append(
      'project_id',
      importProjectId.value || currentProjectId.value,
    );
    await requestClient.post('/mileposts/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    message.success('导入成功');
    importDialog.value = false;
    tableRef.value?.reload?.();
  } catch (error) {
    console.error(error);
  } finally {
    importing.value = false;
  }
}

function openImport() {
  importProjectId.value = null;
  importFile.value = [];
  importDialog.value = true;
}

onMounted(() => {
  if (!currentProjectId.value) loadProjects();
});

watch(
  () => appStore.defaultProject?.id,
  (v) => {
    if (!v) loadProjects();
  },
);
</script>

<template>
  <div>
    <AppCrudTable
      ref="tableRef"
      v-model="editingItem"
      api-url="mileposts"
      permission-name="milepost"
      :extra-query="extraQuery"
      :filter-fields="filterFields"
      :fields="formFields"
      :detail-format="detailFormat"
      :save-format="saveFormat"
      :grid-options="{
        columns: gridColumns,
        showOverflow: false,
        columnConfig: { resizable: true },
      }"
      :open-mode="{ create: 'drawer', detail: 'drawer' }"
      :form-attrs="{ layout: 'vertical', size: 'medium' }"
      title="桩号管理"
      class="p-4"
    >
      <template #toolbar-append>
        <Button @click="openImport">导入</Button>
      </template>

      <template #field_location="{ modelValue, update }">
        <AppChooseLocation
          :model-value="modelValue || {}"
          :return-address="false"
          label="桩号位置"
          placeholder="点击地图选点"
          @update:model-value="update"
        />
      </template>

      <template #field_boundary="{ modelValue, update }">
        <AppMapDraw
          :model-value="modelValue || []"
          :center="[
            editingItem.location?.longitude || 116.28,
            editingItem.location?.latitude || 39.48,
          ]"
          @update:model-value="update"
        />
      </template>
    </AppCrudTable>

    <!-- KML/KMZ 导入弹窗 -->
    <Modal
      v-model:open="importDialog"
      title="批量导入桩号"
      ok-text="导入"
      cancel-text="取消"
      :confirm-loading="importing"
      @ok="submitImport"
    >
      <div class="space-y-4">
        <div v-if="!currentProjectId">
          <label class="mb-1 block text-sm text-gray-500">项目</label>
          <Select
            v-model:value="importProjectId"
            :options="projectOptions"
            style="width: 100%"
            placeholder="请选择项目"
          />
        </div>
        <div>
          <label class="mb-1 block text-sm text-gray-500">地图文件</label>
          <input
            type="file"
            accept=".kml,.kmz,.ovkml,.ovkmz"
            class="w-full rounded border border-gray-300 p-2"
            @change="(e) => (importFile = [...(e.target.files || [])])"
          />
          <div class="mt-1 text-xs text-gray-400">
            支持 kmz/kml（奥维地图导出格式 ovkml/ovkmz，坐标类型
            CGCS2000/WGS84）；编号已存在将覆盖原桩号
          </div>
        </div>
      </div>
    </Modal>
  </div>
</template>
