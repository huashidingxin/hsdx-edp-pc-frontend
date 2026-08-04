<script setup>
import { onMounted, ref } from 'vue';

import { Button, message, Select, Switch, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppList from '#/components/AppList.vue';

const props = defineProps({
  formId: {
    type: [String, Number],
    default: undefined,
  },
  ruleCategoryId: {
    type: [String, Number],
    default: undefined,
  },
});

// 字段类型（与后端 Field 枚举一致）
const typeOptions = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'switch', label: '是否' },
  { value: 'number', label: '数字' },
  { value: 'select', label: '选项' },
  { value: 'list', label: '列表' },
  { value: 'stakeholder', label: '相关单位' },
  { value: 'construction', label: '施工单位' },
  { value: 'unit_project', label: '单位工程' },
  { value: 'unit_project_code', label: '单位工程编号' },
  { value: 'date', label: '日期' },
  { value: 'time', label: '时间（不带日期）' },
  { value: 'datetime', label: '时间（带日期）' },
  { value: 'image', label: '单图片' },
  { value: 'images', label: '多图片' },
  { value: 'file', label: '文件' },
  { value: 'video', label: '视频' },
];

const rows = ref([]);
const loading = ref(false);
const saving = ref(false);
const snapshotIds = ref([]);

// 行内字段渲染配置（name/type 走自定义列 slot；其余走 AppField 行内编辑）
const listFields = ref([
  { field: 'options', type: 'combobox', label: '选项列表', span: 10, attrs: { multiple: true, placeholder: '输入选项后按回车新增' } },
  { field: 'sort', type: 'number', label: '排序', span: 4, attrs: { hint: '升序排列' } },
  { field: 'required', type: 'switch', label: '必填', span: 4 },
  { field: 'failed_proof', type: 'switch', label: '不通过时上传证明', span: 8 },
]);

const listColumns = ref([
  { field: 'id', title: 'ID', width: 60 },
  { field: 'name', title: '名称', minWidth: 140, slots: { default: 'default_name' } },
  { field: 'type', title: '类型', width: 110, slots: { default: 'default_type' } },
  { field: 'options', title: '选项', minWidth: 160 },
  { field: 'sort', title: '排序', width: 60 },
  { field: 'required', title: '必填', width: 70 },
  { field: 'failed_proof', title: '失败证明', width: 90 },
]);

// 行内 select 类型联动：select 需 options，行内渲染 options 列（combobox）

async function loadFields() {
  if (!props.formId) return;
  loading.value = true;
  try {
    const params = { per_page: 'all', form_id: props.formId };
    if (props.ruleCategoryId) params.rule_category_id = props.ruleCategoryId;
    const { data } = await new Resource('fields').list(params);
    rows.value = (data || []).map((f) => ({ ...f }));
    snapshotIds.value = rows.value.map((r) => r.id).filter(Boolean);
  } finally {
    loading.value = false;
  }
}

function addRow() {
  rows.value.push({ type: 'text', required: true, sort: rows.value.length + 1, options: [] });
}

// 与后端独立 CRUD 同步：新增 POST / 修改 PUT / 删除 DELETE
async function saveFields() {
  if (saving.value) return;
  for (const row of rows.value) {
    if (!row.name || !row.type) {
      message.error('每行需填写名称和字段类型');
      return;
    }
    if (row.type === 'select' && (!row.options || !row.options.length)) {
      message.error(`字段「${row.name}」类型为选项时，选项列表不能为空`);
      return;
    }
  }

  saving.value = true;
  try {
    const api = new Resource('fields');
    const currentIds = rows.value.map((r) => r.id).filter(Boolean);
    const removedIds = snapshotIds.value.filter((id) => !currentIds.includes(id));

    const removed = [];
    for (const id of removedIds) removed.push(api.destroy(id));

    const created = [];
    const updated = [];
    for (const row of rows.value) {
      const payload = {
        name: row.name,
        type: row.type,
        hint: row.hint,
        placeholder: row.placeholder,
        options: row.options,
        sort: row.sort || 0,
        required: row.required ? 1 : 0,
        failed_proof: row.failed_proof ? 1 : 0,
        parent_id: row.parent_id,
        base_field_id: row.base_field_id,
        form_id: props.formId,
        rule_category_id: props.ruleCategoryId,
      };
      if (row.id) {
        updated.push(api.update(row.id, payload));
      } else {
        created.push(api.store(payload));
      }
    }
    await Promise.all([...removed, ...created, ...updated]);
    message.success('字段已保存');
    await loadFields();
  } catch (e) {
    message.error('字段保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(loadFields);
</script>

<template>
  <div class="rounded border p-3">
    <div class="mb-2 flex items-center justify-between">
      <div class="text-sm font-semibold text-gray-500">字段列表</div>
      <div class="space-x-2">
        <Button size="small" @click="addRow">+ 新增字段</Button>
        <Button size="small" type="primary" :loading="saving" @click="saveFields">保存字段</Button>
      </div>
    </div>

    <AppList
      v-model="rows"
      :options="{ columns: listColumns, showFooter: false }"
      :fields="listFields"
      :loading="loading"
      :show-delete="true"
      :show-edit="false"
      row-key="id"
      height="260"
    >
      <template #default_name="{ row, rowIndex }">
        <input
          v-model="row.name"
          placeholder="字段名称"
          class="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </template>
      <template #default_type="{ row, rowIndex }">
        <Select
          v-model:value="row.type"
          :options="typeOptions"
          size="small"
          style="width: 100%"
          @change="(v) => (row.showOptions = v === 'select')"
        />
      </template>
    </AppList>
  </div>
</template>
