<script setup>
import { computed, onMounted, ref } from 'vue';

import {
  Button,
  DatePicker,
  Input,
  message,
  Modal,
  Select,
  Tag,
} from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();
const tableRef = ref(null);
// 详情打开模式：view=false（查看该成员在项目中的信息）/ edit=true（编辑该成员在项目中的信息）
const isEditing = ref(true);

function onShowDetail(editing) {
  isEditing.value = editing;
}

const currentProjectId = computed(
  () => appStore.defaultProject?.id || undefined,
);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

// ========================= 远程选项 =========================
const roleOptions = ref([]);
const staffOptions = ref([]);

async function loadRoles() {
  const { data } = await new Resource('roles').list({
    per_page: 'all',
    type: 'project',
  });
  roleOptions.value = (data || []).map((r) => ({ value: r.id, label: r.name }));
}

async function loadStaff() {
  const { data } = await new Resource('staff').list({ per_page: 'all' });
  staffOptions.value = (data || []).map((s) => ({
    value: s.id,
    label: s.name,
    avatar: s.avatar,
    name: s.name,
  }));
}

// ========================= 列表 =========================
const filterFields = ref([
  { field: 'name', label: '姓名', type: 'text', span: 8 },
  { field: 'mobile', label: '手机号', type: 'text', span: 8 },
  {
    field: 'statuses',
    label: '状态',
    type: 'select',
    span: 8,
    attrs: {
      options: [
        { value: 1, label: '在岗' },
        { value: 2, label: '请假' },
        { value: 3, label: '借调' },
        { value: 4, label: '撤离' },
      ],
      multiple: true,
    },
  },
]);

const gridColumns = ref([
  { type: 'checkbox', width: 45, align: 'center' },
  { field: 'user.name', title: '姓名', minWidth: 110 },
  { field: 'user.mobile', title: '手机号', width: 130 },
  { field: 'project.name', title: '项目', minWidth: 140 },
  { field: 'joining_date', title: '加入时间', width: 110 },
  {
    field: 'roles',
    title: '角色',
    minWidth: 160,
    slots: { default: 'default_roles' },
  },
  {
    field: 'leave',
    title: '状态',
    width: 100,
    slots: { default: 'default_status' },
  },
  { field: 'created_at', title: '创建时间', width: 160 },
]);

const leaveTypeName = { 1: '请假', 2: '借调', 3: '撤离' };

// ========================= 离岗 =========================
const leaveDialog = ref(false);
const leaveTarget = ref(null);
const leaveForm = ref({ type: 1, start_time: '', end_time: '', reason: '' });
const leaveTypeOptions = [
  { value: 1, label: '请假' },
  { value: 2, label: '借调' },
  { value: 3, label: '撤离' },
];

function openLeave(row) {
  if (row.leave?.status === 'active') {
    Modal.confirm({
      title: '撤销离岗',
      content: `预计离岗时间：${row.leave.start_time} ~ ${row.leave.end_time || '长期'}`,
      onOk: async () => {
        try {
          await new Resource(`project-leaves/${row.leave.id}/cancel`).store();
          message.success('撤销成功');
          tableRef.value?.reload?.();
        } catch (error) {
          message.error(error?.message || '撤销失败');
        }
      },
    });
    return;
  }
  leaveTarget.value = row;
  leaveForm.value = { type: 1, start_time: '', end_time: '', reason: '' };
  leaveDialog.value = true;
}

async function submitLeave() {
  if (!leaveForm.value.start_time) {
    message.warning('请选择开始时间');
    return;
  }
  if (leaveForm.value.type !== 3 && !leaveForm.value.end_time) {
    message.warning('请选择结束时间');
    return;
  }
  if (!leaveForm.value.reason.trim()) {
    message.warning('请输入离岗原因');
    return;
  }
  try {
    await new Resource(`project-users/${leaveTarget.value.id}/leave`).store(
      leaveForm.value,
    );
    message.success('操作成功');
    leaveDialog.value = false;
    tableRef.value?.reload?.();
  } catch (error) {
    message.error(error?.message || '离岗操作失败');
  }
}

// ========================= 批量操作 =========================
const selectedRows = ref([]);

const batchLeaveDialog = ref(false);
const batchLeaveForm = ref({
  type: 1,
  start_time: '',
  end_time: '',
  reason: '',
});

function openBatchLeave() {
  const rows = selectedRows.value || [];
  if (rows.length === 0) {
    message.warning('请先勾选成员');
    return;
  }
  batchLeaveForm.value = { type: 1, start_time: '', end_time: '', reason: '' };
  batchLeaveDialog.value = true;
}

async function submitBatchLeave() {
  const form = batchLeaveForm.value;
  if (!form.start_time) {
    message.warning('请选择开始时间');
    return;
  }
  if (form.type !== 3 && !form.end_time) {
    message.warning('请选择结束时间');
    return;
  }
  if (!form.reason.trim()) {
    message.warning('请输入离岗原因');
    return;
  }
  const rows = selectedRows.value || [];
  const userIds = rows.map((r) => r.id).filter(Boolean);
  if (userIds.length === 0) {
    message.warning('未选中有效成员');
    return;
  }
  try {
    await new Resource('project-users/batch-leave').store({
      ids: userIds,
      ...form,
    });
    message.success(`已对 ${userIds.length} 名成员执行离岗`);
    batchLeaveDialog.value = false;
    tableRef.value?.reload?.();
  } catch (error) {
    message.error(error?.message || '批量离岗失败');
  }
}

// 批量撤销离岗（后端自动过滤无有效离岗的成员）
async function submitBatchCancel() {
  const rows = selectedRows.value || [];
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (ids.length === 0) {
    message.warning('请先勾选成员');
    return;
  }
  try {
    const res = await new Resource('project-leaves/batch-cancel').store({
      ids,
    });
    const count = res?.data?.count;
    message.success(count ? `已撤销 ${count} 名成员离岗` : '操作完成');
    tableRef.value?.reload?.();
  } catch (error) {
    message.error(error?.message || '批量撤销失败');
  }
}

// ========================= 批量添加成员 =========================
const batchAddDialog = ref(false);
const batchAddForm = ref({ staff: [], roles: [], joining_date: '' });

// 用于批量添加的成员表格数据
const batchAddTableRows = ref([]);
// 批量填写角色
const batchFillRoles = ref([]);
// 批量填写加入时间
const batchFillJoiningDate = ref('');

// 自定义员工选择下拉框状态
const showStaffDropdown = ref(false);
const staffSearchText = ref('');

// 过滤后的员工选项
const filteredStaffOptions = computed(() => {
  const text = staffSearchText.value.toLowerCase();
  if (!text) return staffOptions.value;
  return staffOptions.value.filter(
    (opt) =>
      opt.name?.toLowerCase().includes(text) ||
      opt.label?.toLowerCase().includes(text),
  );
});

function toggleStaffDropdown() {
  showStaffDropdown.value = !showStaffDropdown.value;
  if (showStaffDropdown.value) {
    // 点击外部关闭下拉框
    setTimeout(() => {
      document.addEventListener('click', closeStaffDropdown);
    }, 0);
  }
}

function closeStaffDropdown(e) {
  if (!e.target.closest('.relative')) {
    showStaffDropdown.value = false;
    document.removeEventListener('click', closeStaffDropdown);
  }
}

function toggleStaffOption(id) {
  if (!batchAddForm.value.staff) {
    batchAddForm.value.staff = [];
  }
  const index = batchAddForm.value.staff.indexOf(id);
  if (index === -1) {
    batchAddForm.value.staff.push(id);
  } else {
    batchAddForm.value.staff.splice(index, 1);
  }
  onStaffSelectChange([...batchAddForm.value.staff]);
}

function removeStaffFromSelection(id) {
  const index = batchAddForm.value.staff.indexOf(id);
  if (index !== -1) {
    batchAddForm.value.staff.splice(index, 1);
    onStaffSelectChange([...batchAddForm.value.staff]);
  }
}

function openBatchAdd() {
  if (!currentProjectId.value) {
    message.warning('请先选择项目');
    return;
  }
  batchAddForm.value = { staff: [], roles: [], joining_date: '' };
  batchAddTableRows.value = [];
  batchFillRoles.value = [];
  batchFillJoiningDate.value = '';
  showStaffDropdown.value = false;
  staffSearchText.value = '';
  batchAddDialog.value = true;
}

// 当选择员工时更新表格
function onStaffSelectChange(selectedIds) {
  // 保留已有配置
  const existingRows = new Map(
    batchAddTableRows.value.map((row) => [row.id, row]),
  );
  const newRows = [];

  for (const id of selectedIds) {
    if (existingRows.has(id)) {
      newRows.push(existingRows.get(id));
    } else {
      const staffOption = staffOptions.value.find((opt) => opt.value === id);
      if (staffOption) {
        newRows.push({
          id: staffOption.value,
          name: staffOption.name,
          avatar: staffOption.avatar,
          roles: [],
          joining_date: batchFillJoiningDate.value || '',
        });
      }
    }
  }

  batchAddTableRows.value = newRows;
}

// 应用批量填写
function applyBatchFill() {
  for (const row of batchAddTableRows.value) {
    if (batchFillRoles.value.length > 0) {
      row.roles = [...batchFillRoles.value];
    }
    if (batchFillJoiningDate.value) {
      row.joining_date = batchFillJoiningDate.value;
    }
  }
}

// 从表格中移除行
function removeBatchAddRow(staffId) {
  batchAddTableRows.value = batchAddTableRows.value.filter(
    (row) => row.id !== staffId,
  );
  batchAddForm.value.staff = batchAddForm.value.staff.filter(
    (id) => id !== staffId,
  );
}

async function submitBatchAdd() {
  if (batchAddTableRows.value.length === 0) {
    message.warning('请选择要添加的员工');
    return;
  }

  // 检查每个员工是否都选择了角色
  const missingRoles = batchAddTableRows.value.filter(
    (row) => !row.roles || row.roles.length === 0,
  );
  if (missingRoles.length > 0) {
    message.warning('请为每个员工至少选择一个角色');
    return;
  }

  try {
    const res = await new Resource('project-users/batch-store').store({
      project_id: currentProjectId.value,
      users: batchAddTableRows.value.map((row) => ({
        id: row.id,
        roles: row.roles,
        joining_date: row.joining_date || null,
      })),
    });
    const { added = 0, updated = 0 } = res?.data || {};
    message.success(
      `已添加 ${added} 名成员${updated ? `，更新 ${updated} 名` : ''}`,
    );
    batchAddDialog.value = false;
    tableRef.value?.reload?.();
  } catch (error) {
    message.error(error?.message || '添加成员失败');
  }
}

// ========================= 详情表单 =========================
// 查看/编辑均为该成员在项目中的信息：角色、加入时间
const formFields = computed(() => {
  if (isEditing.value) {
    return [
      {
        field: 'user.name',
        type: 'text',
        span: 12,
        label: '姓名',
        displayOnly: true,
      },
      {
        field: 'user.mobile',
        type: 'text',
        span: 12,
        label: '手机号',
        displayOnly: true,
      },
      {
        field: 'project.name',
        type: 'text',
        span: 12,
        label: '项目',
        displayOnly: true,
      },
      { field: 'joining_date', type: 'date', span: 12, label: '加入时间' },
      {
        field: 'roles',
        type: 'select',
        span: 24,
        label: '角色',
        attrs: { options: roleOptions, multiple: true },
      },
      { field: 'leave', type: 'slot', span: 24, label: '状态' },
    ];
  }
  return [
    {
      field: 'user.name',
      type: 'text',
      span: 12,
      label: '姓名',
      displayOnly: true,
    },
    {
      field: 'user.mobile',
      type: 'text',
      span: 12,
      label: '手机号',
      displayOnly: true,
    },
    {
      field: 'project.name',
      type: 'text',
      span: 12,
      label: '项目',
      displayOnly: true,
    },
    {
      field: 'joining_date',
      type: 'text',
      span: 12,
      label: '加入时间',
      displayOnly: true,
    },
    { field: 'roles', type: 'slot', span: 12, label: '角色' },
    { field: 'leave', type: 'slot', span: 12, label: '状态' },
  ];
});

// 详情加载后：roles 由 [{id,name}] 归一化为 id 数组，便于 select 多选
function detailFormat(data) {
  if (!data) return data;
  const result = { ...data };
  if (Array.isArray(result.roles)) {
    result.roles = result.roles.map((r) => r.id ?? r).filter(Boolean);
  }
  return result;
}

// 保存：编辑单条成员的项目信息（角色 + 加入时间）
function saveFormat(e) {
  return {
    joining_date: e.joining_date || null,
    roles: e.roles || [],
  };
}

onMounted(() => {
  loadRoles();
  loadStaff();
});
</script>

<template>
  <div class="p-4">
    <AppCrudTable
      ref="tableRef"
      v-model:selected="selectedRows"
      api-url="project-users"
      permission-name="project_user"
      :extra-query="extraQuery"
      :filter-fields="filterFields"
      :fields="formFields"
      :inline-actions="['view', 'edit']"
      :grid-options="{
        columns: gridColumns,
        checkboxConfig: { highlight: true, showHeader: true },
        showOverflow: false,
        columnConfig: { resizable: true },
      }"
      :open-mode="{ create: 'drawer', detail: 'drawer' }"
      :form-attrs="{ layout: 'vertical', size: 'medium' }"
      title="项目成员"
      class="w-full"
      :toolbar-config="{ create: false }"
      :save-format="saveFormat"
      :detail-format="detailFormat"
      @show-detail="onShowDetail"
    >
      <template #toolbar-append>
        <div class="flex items-center gap-2">
          <Button size="small" type="primary" @click="openBatchAdd">
批量添加成员
</Button>
          <Button size="small" type="primary" ghost @click="openBatchLeave">
批量离岗
</Button>
          <Button size="small" danger @click="submitBatchCancel">
批量撤销离岗
</Button>
        </div>
      </template>

      <template #row-action-extra="{ row }">
        <Button type="link" size="small" danger @click.stop="openLeave(row)">
          {{ row.leave?.status === 'active' ? '撤销离岗' : '离岗' }}
        </Button>
      </template>

      <!-- view 模式：单成员项目信息 -->
      <template #field_roles="{ modelValue }">
        <span class="text-sm">
          {{
            (modelValue || [])
              .map((r) => {
                const label =
                  typeof r === 'object' ? r.name || r.display_name : r;
                return (
                  roleOptions.find((o) => o.value === label)?.label || label
                );
              })
              .join('、') || '-'
          }}
        </span>
      </template>
      <template #field_leave="{ modelValue }">
        <Tag v-if="modelValue?.status === 'active'" color="red">
          {{
            modelValue.type_label || leaveTypeName[modelValue.type] || '离岗中'
          }}
        </Tag>
        <Tag v-else color="green">在岗</Tag>
      </template>

      <template #default_roles="{ row }">
        <span class="text-sm">
          {{
            row.roles?.map((r) => r.name || r.display_name).join('、') || '-'
          }}
        </span>
      </template>

      <template #default_status="{ row }">
        <Tag :color="row.leave?.status === 'active' ? 'red' : 'green'">
          {{
            row.leave?.status === 'active'
              ? row.leave.type_label || leaveTypeName[row.leave.type]
              : '在岗'
          }}
        </Tag>
      </template>
    </AppCrudTable>

    <!-- 成员离岗弹窗（放在 AppCrudTable 之外，AppCrudTable 无默认插槽） -->
    <Modal
      v-model:open="leaveDialog"
      title="成员离岗"
      ok-text="提交"
      @ok="submitLeave"
    >
      <div class="space-y-4 py-2">
        <div>
          <div class="mb-1 text-sm text-gray-600">类型</div>
          <Select
            v-model:value="leaveForm.type"
            :options="leaveTypeOptions"
            style="width: 100%"
          />
        </div>
        <div>
          <div class="mb-1 text-sm text-gray-600">开始时间</div>
          <DatePicker
            v-model:value="leaveForm.start_time"
            value-format="YYYY-MM-DD HH:mm:ss"
            show-time
            format="YYYY-MM-DD HH:mm"
            style="width: 100%"
          />
        </div>
        <div v-if="leaveForm.type !== 3">
          <div class="mb-1 text-sm text-gray-600">结束时间</div>
          <DatePicker
            v-model:value="leaveForm.end_time"
            value-format="YYYY-MM-DD HH:mm:ss"
            show-time
            format="YYYY-MM-DD HH:mm"
            style="width: 100%"
          />
        </div>
        <div>
          <div class="mb-1 text-sm text-gray-600">离岗原因</div>
          <Input.TextArea v-model:value="leaveForm.reason" :rows="2" />
        </div>
      </div>
    </Modal>

    <!-- 批量离岗弹窗 -->
    <Modal
      v-model:open="batchLeaveDialog"
      title="批量离岗"
      ok-text="提交"
      @ok="submitBatchLeave"
    >
      <div class="space-y-4 py-2">
        <div class="text-sm text-gray-500">
          已选择 {{ (selectedRows || []).length }} 名成员
        </div>
        <div>
          <div class="mb-1 text-sm text-gray-600">类型</div>
          <Select
            v-model:value="batchLeaveForm.type"
            :options="leaveTypeOptions"
            style="width: 100%"
          />
        </div>
        <div>
          <div class="mb-1 text-sm text-gray-600">开始时间</div>
          <DatePicker
            v-model:value="batchLeaveForm.start_time"
            value-format="YYYY-MM-DD HH:mm:ss"
            show-time
            format="YYYY-MM-DD HH:mm"
            style="width: 100%"
          />
        </div>
        <div v-if="batchLeaveForm.type !== 3">
          <div class="mb-1 text-sm text-gray-600">结束时间</div>
          <DatePicker
            v-model:value="batchLeaveForm.end_time"
            value-format="YYYY-MM-DD HH:mm:ss"
            show-time
            format="YYYY-MM-DD HH:mm"
            style="width: 100%"
          />
        </div>
        <div>
          <div class="mb-1 text-sm text-gray-600">离岗原因</div>
          <Input.TextArea v-model:value="batchLeaveForm.reason" :rows="2" />
        </div>
      </div>
    </Modal>

    <!-- 批量添加成员弹窗 -->
    <Modal
      v-model:open="batchAddDialog"
      title="批量添加成员"
      width="800px"
      ok-text="添加"
      @ok="submitBatchAdd"
    >
      <div class="space-y-4 py-2">
        <div>
          <div class="mb-1 text-sm text-gray-600">选择员工</div>
          <div class="relative">
            <div
              class="flex min-h-[32px] cursor-pointer flex-wrap items-center gap-1 rounded border border-gray-300 px-2 py-1"
              @click="toggleStaffDropdown"
            >
              <span v-if="!batchAddForm.staff?.length" class="text-gray-400">请选择要加入项目的员工（可多选）</span>
              <template v-else>
                <span
                  v-for="id in batchAddForm.staff.slice(0, 5)"
                  :key="id"
                  class="inline-flex items-center rounded bg-blue-100 pl-2 pr-1 text-sm text-blue-800"
                >
                  {{ staffOptions.find((opt) => opt.value === id)?.name || id }}
                  <button
                    class="ml-1 rounded-full p-0.5 hover:bg-blue-200"
                    @click.stop="removeStaffFromSelection(id)"
                  >
                    ×
                  </button>
                </span>
                <span
                  v-if="batchAddForm.staff.length > 5"
                  class="text-sm text-gray-500"
                >
                  +{{ batchAddForm.staff.length - 5 }} 项
                </span>
              </template>
            </div>
            <!-- 自定义下拉列表 -->
            <div
              v-if="showStaffDropdown"
              class="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
            >
              <div class="sticky top-0 border-b border-gray-100 bg-white p-2">
                <input
                  v-model="staffSearchText"
                  type="text"
                  class="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="搜索员工..."
                  @click.stop
                />
              </div>
              <div
                v-for="option in filteredStaffOptions"
                :key="option.value"
                class="flex cursor-pointer items-center px-3 py-2 hover:bg-blue-50"
                :class="{
                  'bg-blue-50': batchAddForm.staff?.includes(option.value),
                }"
                @click="toggleStaffOption(option.value)"
              >
                <div class="flex items-center flex-1">
                  <img
                    v-if="option.avatar"
                    :src="option.avatar"
                    class="mr-2 h-8 w-8 rounded-full object-cover"
                  />
                  <div
                    v-else
                    class="mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-sm font-medium text-white"
                  >
                    {{ option.name?.charAt(0) || '?' }}
                  </div>
                  <div>
                    <div class="text-sm font-medium text-gray-800">
                      {{ option.name }}
                    </div>
                  </div>
                </div>
                <div
                  v-if="batchAddForm.staff?.includes(option.value)"
                  class="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500"
                >
                  <svg
                    class="h-3 w-3 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <div
                v-if="filteredStaffOptions.length === 0"
                class="p-4 text-center text-gray-500"
              >
                暂无数据
              </div>
            </div>
          </div>
        </div>

        <!-- 成员配置表格 -->
        <div v-if="batchAddTableRows.length > 0">
          <div class="mb-2 text-sm text-gray-600">成员配置</div>
          <div class="overflow-x-auto">
            <table class="w-full border-collapse">
              <thead>
                <tr class="bg-gray-50">
                  <th
                    class="border border-gray-200 px-4 py-2 text-left text-sm font-medium text-gray-700"
                  >
                    员工
                  </th>
                  <th
                    class="border border-gray-200 px-4 py-2 text-left text-sm font-medium text-gray-700"
                  >
                    <div class="flex items-center">
                      <span>角色</span>
                      <Select
                        v-model:value="batchFillRoles"
                        :options="roleOptions"
                        mode="multiple"
                        placeholder="批量设置"
                        style="width: 150px; margin-left: 8px; font-size: 12px"
                        size="small"
                        @change="applyBatchFill"
                      />
                    </div>
                  </th>
                  <th
                    class="border border-gray-200 px-4 py-2 text-left text-sm font-medium text-gray-700"
                  >
                    <div class="flex items-center">
                      <span>加入时间</span>
                      <DatePicker
                        v-model:value="batchFillJoiningDate"
                        value-format="YYYY-MM-DD"
                        format="YYYY-MM-DD"
                        placeholder="批量设置"
                        style="width: 150px; margin-left: 8px; font-size: 12px"
                        size="small"
                        @change="applyBatchFill"
                      />
                    </div>
                  </th>
                  <th
                    class="border border-gray-200 px-4 py-2 text-center text-sm font-medium text-gray-700"
                  >
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in batchAddTableRows"
                  :key="row.id"
                  class="hover:bg-gray-50"
                >
                  <td class="border border-gray-200 px-4 py-2">
                    <div class="flex items-center">
                      <img
                        v-if="row.avatar"
                        :src="row.avatar"
                        class="mr-2 h-8 w-8 rounded-full object-cover"
                      />
                      <div
                        v-else
                        class="mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-sm text-white"
                      >
                        {{ row.name?.charAt(0) || '?' }}
                      </div>
                      <span>{{ row.name }}</span>
                    </div>
                  </td>
                  <td class="border border-gray-200 px-4 py-2">
                    <Select
                      v-model:value="row.roles"
                      :options="roleOptions"
                      mode="multiple"
                      placeholder="请选择角色"
                      style="width: 100%"
                    />
                  </td>
                  <td class="border border-gray-200 px-4 py-2">
                    <DatePicker
                      v-model:value="row.joining_date"
                      value-format="YYYY-MM-DD"
                      format="YYYY-MM-DD"
                      style="width: 100%"
                    />
                  </td>
                  <td class="border border-gray-200 px-4 py-2 text-center">
                    <Button
                      type="link"
                      danger
                      size="small"
                      @click="removeBatchAddRow(row.id)"
                    >
                      移除
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="mt-2 text-xs text-gray-500">
            提示：可在表头批量设置角色和加入时间，设置后会应用到所有已选择的员工
          </div>
        </div>
      </div>
    </Modal>
  </div>
</template>
