<script setup>
import { onMounted, ref } from 'vue';

import { Button, message, Modal, Select, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const filterFields = ref([
  { field: 'name', label: '姓名', type: 'text', span: 6 },
  { field: 'username', label: '用户名', type: 'text', span: 6 },
  { field: 'mobile', label: '手机号', type: 'text', span: 6 },
  {
    field: 'state',
    label: '状态',
    type: 'select',
    span: 6,
    attrs: {
      allowClear: true,
      items: [
        { id: 1, name: '在职' },
        { id: 2, name: '请假' },
        { id: 3, name: '离职' },
        { id: 4, name: '禁用' },
      ],
    },
  },
]);

const formFields = ref([
  { field: 'username', type: 'text', label: '用户名', span: 12, required: true },
  { field: 'password', type: 'text', label: '密码', span: 12,
    attrs: { type: 'password', autocomplete: 'new-password', placeholder: '留空则不修改' } },
  { field: 'name', type: 'text', label: '姓名', span: 12, required: true },
  { field: 'mobile', type: 'text', label: '手机号', span: 12 },
  { field: 'email', type: 'text', label: '邮箱', span: 12 },
  { field: 'avatar', type: 'file', label: '头像', span: 12 },
  { field: 'id_photo', type: 'file', label: '证件照', span: 12 },
  { field: 'code', type: 'text', label: '工号', span: 12 },
  {
    field: 'position_id',
    type: 'select',
    label: '职位',
    span: 12,
    attrs: { allowClear: true, fieldNames: { label: 'name', value: 'id' }, placeholder: '请选择职位' },
  },
  { field: 'joining_date', type: 'datetime', label: '入职日期', span: 12 },
  {
    field: 'state',
    type: 'select',
    label: '状态',
    span: 12,
    attrs: {
      items: [
        { id: 1, name: '在职' },
        { id: 2, name: '请假' },
        { id: 3, name: '离职' },
        { id: 4, name: '禁用' },
      ],
    },
  },
]);

const gridColumns = ref([
  { field: 'avatar', title: '头像', width: 70, slots: { default: 'default_avatar' } },
  { field: 'name', title: '姓名', minWidth: 100 },
  { field: 'username', title: '用户名', minWidth: 120 },
  { field: 'mobile', title: '手机号', width: 130, formatter: emptyText },
  { field: 'email', title: '邮箱', minWidth: 160, formatter: emptyText },
  { field: 'department', title: '部门', minWidth: 120, slots: { default: 'default_department' } },
  { field: 'position', title: '职位', minWidth: 120, slots: { default: 'default_position' } },
  { field: 'state', title: '状态', width: 90, slots: { default: 'default_state' } },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

function emptyText({ cellValue }) {
  return cellValue == null || cellValue === '' ? '-' : cellValue;
}
function stateText(s) {
  return { 1: '在职', 2: '请假', 3: '离职', 4: '禁用' }[s] || '-';
}
function stateColor(s) {
  return { 1: 'green', 2: 'orange', 3: 'red', 4: 'default' }[s] || 'default';
}

const positions = ref([]);
async function loadPositions() {
  try {
    const { data } = await new Resource('positions').list({ per_page: 'all' });
    positions.value = data || [];
    const field = formFields.value.find((f) => f.field === 'position_id');
    if (field) field.attrs.items = positions.value;
  } catch (error) {
    console.error(error);
  }
}

/* ===================== 单个离职 ===================== */
function resign(row) {
  Modal.confirm({
    title: `确认将 ${row.name || row.username} 设为离职？`,
    okText: '确认离职',
    okType: 'danger',
    onOk: async () => {
      try {
        await new Resource(`staff/${row.id}/resign`).store({});
        message.success('操作成功');
      } catch {
        message.error('操作失败');
      }
    },
  });
}

const actionsConfig = ref([
  {
    key: 'resign',
    label: '离职',
    icon: 'mdi--account-off-outline',
    danger: true,
    permission: 'resign',
    visible: (row) => row.state !== 3 && row.state !== 4,
    onClick: (row) => resign(row),
    order: 35,
  },
]);

/* ===================== 批量离职 ===================== */
const batchOpen = ref(false);
const batchSelected = ref([]);
const batchOptions = ref([]);
const batchLoading = ref(false);
const showBatchDropdown = ref(false);
const batchSearchText = ref('');

const filteredBatchOptions = computed(() => {
  const text = batchSearchText.value.toLowerCase();
  if (!text) return batchOptions.value;
  return batchOptions.value.filter(opt => 
    opt.label?.toLowerCase().includes(text)
  );
});

function toggleBatchDropdown() {
  showBatchDropdown.value = !showBatchDropdown.value;
  if (showBatchDropdown.value) {
    setTimeout(() => {
      document.addEventListener('click', closeBatchDropdown);
    }, 0);
  }
}

function closeBatchDropdown(e) {
  if (!e.target.closest('.relative')) {
    showBatchDropdown.value = false;
    document.removeEventListener('click', closeBatchDropdown);
  }
}

function toggleBatchOption(id) {
  const index = batchSelected.value.indexOf(id);
  if (index > -1) {
    batchSelected.value.splice(index, 1);
  } else {
    batchSelected.value.push(id);
  }
}

function removeBatchSelection(id) {
  const index = batchSelected.value.indexOf(id);
  if (index > -1) {
    batchSelected.value.splice(index, 1);
  }
}

async function openBatch() {
  batchSelected.value = [];
  batchOptions.value = [];
  showBatchDropdown.value = false;
  batchSearchText.value = '';
  batchOpen.value = true;
  try {
    const { data } = await new Resource('staff').list({ per_page: 'all' });
    batchOptions.value = (data || []).map((s) => ({
      label: s.name || s.username,
      value: s.id,
      avatar: s.avatar,
    }));
  } catch (error) {
    console.error(error);
  }
}

async function saveBatch() {
  if (batchSelected.value.length === 0) {
    message.warning('请选择员工');
    return;
  }
  Modal.confirm({
    title: `确认将选中的 ${batchSelected.value.length} 名员工设为离职？`,
    okText: '确认离职',
    okType: 'danger',
    onOk: async () => {
      batchLoading.value = true;
      try {
        await new Resource('batch-resign').store({ list: batchSelected.value });
        message.success('操作成功');
        batchOpen.value = false;
      } catch {
        message.error('操作失败');
      } finally {
        batchLoading.value = false;
      }
    },
  });
}

onMounted(loadPositions);
</script>

<template>
  <AppCrudTable
    api-url="staff"
    :filter-fields="filterFields"
    :fields="formFields"
    :actions-config="actionsConfig"
    permission-name="staff"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="员工管理"
    class="p-4"
  >
    <template #toolbar-append>
      <Button type="primary" @click="openBatch">批量离职</Button>
    </template>
    <template #default_avatar="{ row }">
      <img v-if="row.avatar" :src="row.avatar" class="h-8 w-8 rounded-full object-cover" />
      <span v-else>-</span>
    </template>
    <template #default_department="{ row }">
      {{ row.department?.name || '-' }}
    </template>
    <template #default_position="{ row }">
      {{ row.position?.name || '-' }}
    </template>
    <template #default_state="{ row }">
      <Tag :color="stateColor(row.state)">{{ stateText(row.state) }}</Tag>
    </template>
  </AppCrudTable>

  <Modal
    :open="batchOpen"
    title="批量离职"
    :confirm-loading="batchLoading"
    @cancel="batchOpen = false"
    @ok="saveBatch"
  >
    <p class="mb-2 text-gray-500">选择需要设为离职的员工：</p>
    <div class="relative">
      <div
        class="flex min-h-[32px] cursor-pointer flex-wrap items-center gap-1 rounded border border-gray-300 px-2 py-1"
        @click="toggleBatchDropdown"
      >
        <span v-if="!batchSelected.length" class="text-gray-400">请选择员工</span>
        <template v-else>
          <span
            v-for="id in batchSelected.slice(0, 5)"
            :key="id"
            class="inline-flex items-center rounded bg-blue-100 pl-2 pr-1 text-sm text-blue-800"
          >
            {{ batchOptions.find(opt => opt.value === id)?.label || id }}
            <button
              class="ml-1 rounded-full p-0.5 hover:bg-blue-200"
              @click.stop="removeBatchSelection(id)"
            >
              ×
            </button>
          </span>
          <span v-if="batchSelected.length > 5" class="text-sm text-gray-500">
            +{{ batchSelected.length - 5 }} 项
          </span>
        </template>
      </div>
      <!-- 自定义下拉列表 -->
      <div
        v-if="showBatchDropdown"
        class="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
      >
        <div class="sticky top-0 border-b border-gray-100 bg-white p-2">
          <input
            v-model="batchSearchText"
            type="text"
            class="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="搜索员工..."
            @click.stop
          />
        </div>
        <div
          v-for="option in filteredBatchOptions"
          :key="option.value"
          class="flex cursor-pointer items-center px-3 py-2 hover:bg-blue-50"
          :class="{ 'bg-blue-50': batchSelected.includes(option.value) }"
          @click="toggleBatchOption(option.value)"
        >
          <div class="flex flex-1 items-center">
            <img
              v-if="option.avatar"
              :src="option.avatar"
              class="mr-2 h-8 w-8 rounded-full object-cover"
            />
            <div
              v-else
              class="mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-sm font-medium text-white"
            >
              {{ option.label?.charAt(0) || '?' }}
            </div>
            <div>
              <div class="text-sm font-medium text-gray-800">{{ option.label }}</div>
            </div>
          </div>
          <div
            v-if="batchSelected.includes(option.value)"
            class="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500"
          >
            <svg class="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <div v-if="filteredBatchOptions.length === 0" class="p-4 text-center text-gray-500">
          暂无数据
        </div>
      </div>
    </div>
  </Modal>
</template>
