<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { Button, DatePicker, Input, message, Modal, Select, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppList from '#/components/AppList.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();
const tableRef = ref(null);
const editingItem = ref({});
// 详情打开模式：view=false（单成员详情）/ edit=true（成员维护）
const isEditing = ref(true);

function onShowDetail(editing) {
  isEditing.value = editing;
}

const currentProjectId = computed(() => appStore.defaultProject?.id || undefined);
const extraQuery = computed(() => ({ project_id: currentProjectId.value }));

// ========================= 远程选项 =========================
const roleOptions = ref([]);
const roleNameIdMap = ref({});
const staffOptions = ref([]);
const addUserIds = ref([]);

async function loadRoles() {
  const { data } = await new Resource('roles').list({ per_page: 'all', type: 'project' });
  roleOptions.value = (data || []).map((r) => ({ value: r.id, label: r.name }));
  roleNameIdMap.value = {};
  (data || []).forEach((r) => {
    roleNameIdMap.value[r.name] = r.id;
  });
}

async function loadStaff() {
  const { data } = await new Resource('staff').list({ per_page: 'all' });
  staffOptions.value = (data || []).map((s) => ({ value: s.id, label: s.name }));
}

// ========================= 成员子表 =========================
// 后端 store 为全量替换语义：保存的 users 未包含的成员会被自动撤离，
// 因此编辑时必须加载项目全部成员（列表接口 roles 无 id，按角色名映射回 id）
async function loadProjectMembers() {
  if (!currentProjectId.value) return;
  const { data } = await new Resource('project-users').list({
    project_id: currentProjectId.value,
    per_page: 'all',
  });
  editingItem.value.users = (data || []).map((m) => ({
    id: m.user_id,
    name: m.user?.name || `#${m.user_id}`,
    roles: (m.roles || [])
      .map((r) => roleNameIdMap.value[r.name])
      .filter(Boolean),
    joining_date: m.joining_date || '',
  }));
}

watch(
  () => editingItem.value?.id,
  (id) => {
    if (id) loadProjectMembers();
  },
);

function handleAddUsers(ids) {
  const users = editingItem.value.users || (editingItem.value.users = []);
  const existing = new Set(users.map((u) => u.id));
  const staffMap = new Map(staffOptions.value.map((s) => [s.value, s.label]));
  ids.forEach((id) => {
    if (!existing.has(id)) {
      users.push({ id, name: staffMap.get(id) || `#${id}`, roles: [], joining_date: '' });
      existing.add(id);
    }
  });
  addUserIds.value = [];
}

// 保存：{project_id, users} 全量替换
function saveFormat(e) {
  return {
    project_id: currentProjectId.value,
    users: (e.users || []).map((u) => ({
      id: u.id,
      roles: u.roles || [],
      joining_date: u.joining_date || null,
    })),
  };
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
  { field: 'roles', title: '角色', minWidth: 160, slots: { default: 'default_roles' } },
  { field: 'leave', title: '状态', width: 100, slots: { default: 'default_status' } },
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
          console.error(error);
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
    await new Resource(`project-users/${leaveTarget.value.id}/leave`).store(leaveForm.value);
    message.success('操作成功');
    leaveDialog.value = false;
    tableRef.value?.reload?.();
  } catch (error) {
    console.error(error);
  }
}

// ========================= 批量操作 =========================
const selectedRows = ref([]);
const allSelected = ref(false);

// 全选/取消全选（经 AppCrudTable 的 getGrid 拿到 VxeGrid 实例）
function toggleSelectAll() {
  const grid = tableRef.value?.getGrid?.();
  if (!grid) return;
  const target = !allSelected.value;
  grid.setAllCheckboxRow(target);
  allSelected.value = target;
}

// 勾选变化时同步全选状态
function onSelectedChange(rows) {
  selectedRows.value = rows;
  const grid = tableRef.value?.getGrid?.();
  if (grid && typeof grid.getCheckboxRecords === 'function') {
    const total = grid.getFullData?.()?.length ?? 0;
    const checked = grid.getCheckboxRecords().length;
    allSelected.value = total > 0 && checked >= total;
  }
}

const batchLeaveDialog = ref(false);
const batchLeaveForm = ref({ type: 1, start_time: '', end_time: '', reason: '' });

function openBatchLeave() {
  const rows = selectedRows.value || [];
  if (!rows.length) {
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
  if (!userIds.length) {
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
    console.error(error);
  }
}

// 批量撤销离岗（后端自动过滤无有效离岗的成员）
async function submitBatchCancel() {
  const rows = selectedRows.value || [];
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (!ids.length) {
    message.warning('请先勾选成员');
    return;
  }
  try {
    const res = await new Resource('project-leaves/batch-cancel').store({ ids });
    const count = res?.data?.count;
    message.success(count ? `已撤销 ${count} 名成员离岗` : '操作完成');
    allSelected.value = false;
    tableRef.value?.reload?.();
  } catch (error) {
    console.error(error);
  }
}

// ========================= 表单 =========================
// view 模式：单成员详情；edit 模式：成员维护（添加/改角色/删除，后端 store 全量替换）
const formFields = computed(() => {
  if (isEditing.value) {
    return [
      { field: '_add', type: 'slot', span: 24, label: '添加成员' },
      { field: '_members', type: 'slot', span: 24, label: '成员明细' },
    ];
  }
  return [
    { field: 'user.name', type: 'text', span: 12, label: '姓名', displayOnly: true },
    { field: 'user.mobile', type: 'text', span: 12, label: '手机号', displayOnly: true },
    { field: 'project.name', type: 'text', span: 12, label: '项目', displayOnly: true },
    { field: 'staff.joining_date', type: 'text', span: 12, label: '加入时间', displayOnly: true },
    { field: 'roles', type: 'slot', span: 12, label: '角色' },
    { field: 'departments.name', type: 'text', span: 12, label: '部门', displayOnly: true },
    { field: 'positions.name', type: 'text', span: 12, label: '职位', displayOnly: true },
    { field: 'leave', type: 'slot', span: 12, label: '状态' },
  ];
});

const listFields = ref([
  { field: 'roles', type: 'select', attrs: { options: roleOptions, multiple: true } },
  { field: 'joining_date', type: 'date' },
]);

const listOptions = ref({
  columns: [
    { field: 'name', title: '成员', minWidth: 120 },
    { field: 'roles', title: '角色', minWidth: 280 },
    { field: 'joining_date', title: '加入时间', width: 150 },
  ],
  showFooter: false,
});

onMounted(() => {
  loadRoles();
  loadStaff();
});
</script>

<template>
  <AppCrudTable
    ref="tableRef"
    v-model="editingItem"
    v-model:selected="selectedRows"
    @update:selected="onSelectedChange"
    api-url="project-users"
    permission-name="project_user"
    :extra-query="extraQuery"
    :filter-fields="filterFields"
    :fields="formFields"
    :inline-actions="['view', 'edit']"
    :grid-options="{ columns: gridColumns, checkboxConfig: { highlight: true, checkStrictly: true }, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="项目成员"
    class="p-4"
    :save-format="saveFormat"
    @show-detail="onShowDetail"
  >
    <template #toolbar-append>
      <div class="flex items-center gap-2">
        <Button size="small" @click="toggleSelectAll">
          {{ allSelected ? '取消全选' : '全选' }}
        </Button>
        <Button size="small" type="primary" ghost @click="openBatchLeave">批量离岗</Button>
        <Button size="small" danger @click="submitBatchCancel">批量撤销离岗</Button>
      </div>
    </template>

    <template #field__add>
      <Select
        v-model:value="addUserIds"
        :options="staffOptions"
        placeholder="选择员工加入项目（可多选）"
        mode="multiple"
        allow-clear
        show-search
        option-filter-prop="label"
        style="width: 100%"
        @change="handleAddUsers"
      />
    </template>

    <template #field__members>
      <AppList
        v-model="editingItem.users"
        :options="listOptions"
        :fields="listFields"
        :show-delete="true"
        row-key="id"
        height="320"
      />
    </template>

    <template #row-action-extra="{ row }">
      <Button type="link" size="small" danger @click.stop="openLeave(row)">
        {{ row.leave?.status === 'active' ? '撤销离岗' : '离岗' }}
      </Button>
    </template>

    <!-- view 模式：单成员详情 -->
    <template #field_roles="{ modelValue }">
      <span class="text-sm">
        {{ (modelValue || []).map((r) => r.name || r.display_name).join('、') || '-' }}
      </span>
    </template>
    <template #field_leave="{ modelValue }">
      <Tag v-if="modelValue?.status === 'active'" color="red">
        {{ modelValue.type_label || leaveTypeName[modelValue.type] || '离岗中' }}
      </Tag>
      <Tag v-else color="green">在岗</Tag>
    </template>

    <template #default_roles="{ row }">
      <span class="text-sm">
        {{ row.roles?.map((r) => r.name || r.display_name).join('、') || '-' }}
      </span>
    </template>

    <template #default_status="{ row }">
      <Tag :color="row.leave?.status === 'active' ? 'red' : 'green'">
        {{ row.leave?.status === 'active' ? row.leave.type_label || leaveTypeName[row.leave.type] : '在岗' }}
      </Tag>
    </template>

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
   </AppCrudTable>
 </template>
