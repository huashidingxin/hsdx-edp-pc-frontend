<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { DatePicker, Input, message, Modal, Select, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';
import AppList from '#/components/AppList.vue';
import { useAppStore } from '#/store';

const appStore = useAppStore();
const tableRef = ref(null);
const editingItem = ref({});

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

// ========================= 表单（创建/编辑 drawer） =========================
const formFields = ref([
  { field: '_add', type: 'slot', span: 24, label: '添加成员' },
  { field: '_members', type: 'slot', span: 24, label: '成员明细' },
]);

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
    api-url="project-users"
    permission-name="project_user"
    :extra-query="extraQuery"
    :filter-fields="filterFields"
    :fields="formFields"
    :inline-actions="['view', 'edit']"
    :grid-options="{ columns: gridColumns, showOverflow: false, columnConfig: { resizable: true } }"
    :open-mode="{ create: 'drawer', detail: 'drawer' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    title="项目成员"
    class="p-4"
    :save-format="saveFormat"
  >
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
      <Button type="link" size="small" danger @click="openLeave(row)">
        {{ row.leave?.status === 'active' ? '撤销离岗' : '离岗' }}
      </Button>
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
  </AppCrudTable>
</template>
