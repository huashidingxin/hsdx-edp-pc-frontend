<script setup>
import { computed, onMounted, ref } from 'vue';

import { Tag } from 'antdv-next';
import Resource from '#/api/resource';

const filterFields = ref([
  { field: 'name', label: '姓名', type: 'text', span: 4 },
  { field: 'username', label: '用户名', type: 'text', span: 4 },
  { field: 'mobile', label: '手机号', type: 'text', span: 4 },
  { field: 'is_staff', label: '员工', type: 'switch', span: 4 },
]);

const formFields = ref([
  { field: 'id', type: 'text', label: '用户ID', span: 12, displayOnly: true },
  { field: 'name', type: 'text', label: '名称', span: 12 },
  { field: 'username', type: 'text', label: '用户名', span: 12 },
  { field: 'mobile', type: 'text', label: '手机号', span: 12 },
  { field: 'email', type: 'text', label: '邮箱', span: 12 },
  { field: 'avatar', type: 'text', label: '头像', span: 12 },
  {
    field: 'role_ids',
    type: 'select',
    label: '管理角色',
    span: 24,
    attrs: {
      mode: 'multiple',
      fieldNames: { label: 'display_name', value: 'id' },
      optionFilterProp: 'display_name',
      placeholder: '请选择角色；清空则为普通用户',
    },
  },
  { field: 'is_staff', type: 'switch', label: '员工', span: 12, displayOnly: true },
  {
    field: 'mobile_verified_at',
    type: 'datetime',
    label: '手机号验证时间',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'last_login_at',
    type: 'datetime',
    label: '最后登录时间',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'created_at',
    type: 'datetime',
    label: '创建时间',
    span: 12,
    displayOnly: true,
  },
  {
    field: 'updated_at',
    type: 'datetime',
    label: '更新时间',
    span: 12,
    displayOnly: true,
  },
  { field: 'point_transactions', type: 'slot', label: '积分流水', span: 24 },
]);

const gridColumns = ref([
  {
    field: 'id',
    title: 'ID',
    align: 'left',
    width: 150,
    slots: { default: 'default_id' },
  },
  {
    field: 'name',
    title: '名称',
    align: 'left',
    minWidth: 120,
    formatter: emptyText,
  },
  { field: 'username', title: '用户名', minWidth: 130, formatter: emptyText },
  { field: 'mobile', title: '手机号', width: 130, formatter: emptyText },
  { field: 'email', title: '邮箱', minWidth: 160, formatter: emptyText },
  {
    field: 'pointAccount.balance',
    title: '积分余额',
    width: 100,
    align: 'center',
    slots: { default: 'default_points' },
  },
  {
    field: 'is_staff',
    title: '员工',
    width: 90,
    slots: { default: 'default_is_staff' },
  },
  { field: 'roles', title: '管理角色', minWidth: 180, slots: { default: 'default_roles' } },
  {
    field: 'mobile_verified_at',
    title: '手机号验证',
    width: 110,
    slots: { default: 'default_mobile_verified_at' },
  },

  {
    field: 'last_login_at',
    title: '最后登录',
    width: 150,
    formatter: emptyText,
  },
  { field: 'created_at', title: '创建时间', width: 150 },
]);

const pointTransactionFields = ref([
  { field: 'id', type: 'text', label: 'ID', span: 12, displayOnly: true },
  { field: 'user_id', type: 'text', label: '用户ID', span: 12, displayOnly: true },
  { field: 'points', type: 'number', label: '调整积分', span: 12, required: true },
  { field: 'description', type: 'text', label: '说明', span: 12 },
  { field: 'created_at', type: 'datetime', label: '创建时间', span: 12, displayOnly: true },
]);

const pointTransactionColumns = ref([
  { field: 'id', title: 'ID', width: 80 },
  { field: 'type', title: '类型', width: 90, slots: { default: 'default_type' } },
  { field: 'channel', title: '场景', width: 140 },
  {
    field: 'points',
    title: '积分',
    width: 90,
    align: 'center',
    slots: { default: 'default_points_change' },
  },
  { field: 'balance_after', title: '变更后余额', width: 110, align: 'center' },
  { field: 'description', title: '说明', minWidth: 180, formatter: emptyText },
  { field: 'created_at', title: '时间', width: 160 },
]);

const formData = ref(null);
const crudRef = ref(null);
const pointData = ref(null);

// 积分流水查询参数：computed 保持引用稳定，避免父表单每次重渲染生成新对象触发嵌套列表刷新
const pointExtraQuery = computed(() => ({ user_id: formData.value?.id }));

const typeLabelMap = {
  adjust: '调整',
  earn: '获得',
  refund: '退回',
  spend: '消耗',
};

const typeColorMap = {
  adjust: 'blue',
  earn: 'green',
  refund: 'cyan',
  spend: 'red',
};

function emptyText({ cellValue }) {
  return cellValue === null || cellValue === undefined || cellValue === ''
    ? '-'
    : cellValue;
}

function roleTitle(role) {
  return role?.display_name || role?.name || '-';
}

function openDetail(row) {
  crudRef.value?.openDetail(row.id);
}

async function pointSaveFormat(payload) {
  payload.user_id = formData.value.id;
  return payload;
}

function onShowDetail() {
  pointData.value = { user_id: formData.value?.id };
}

async function loadRoles() {
  try {
    const api = new Resource('roles');
    const { data } = await api.list({ per_page: 'all' });
    formFields.value[6].attrs.options = data;
  } catch {
    // 角色加载失败时字段选项留空
  }
}

onMounted(() => {
  loadRoles();
});
</script>
<template>
  <AppCrudTable
    ref="crudRef"
    api-url="users"
    v-model="formData"
    :filter-fields="filterFields"
    :fields="formFields"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: {
        resizable: true,
      },
    }"
    :open-mode="{ create: 'modal', detail: 'modal' }"
    :form-attrs="{ layout: 'vertical', size: 'medium' }"
    :toolbar="{ create: false }"
    :actions-config="[
      { key: 'edit', visible: true },
      { key: 'delete', visible: false },
    ]"
    title="用户"
    class="p-4"
    @show-detail="onShowDetail"
  >
    <template #default_id="{ row }">
      <div
        v-if="row"
        class="cursor-pointer text-start text-blue-500"
        @click="openDetail(row)"
      >
        {{ row.id }}
      </div>
    </template>

    <template #default_is_staff="{ row }">
      <Tag :color="row.is_staff ? 'green' : 'default'">
        {{ row.is_staff ? '是' : '否' }}
      </Tag>
    </template>

    <template #default_roles="{ row }">
      <div class="flex flex-wrap gap-1">
        <Tag v-for="role in row.roles || []" :key="role.id || role.name" color="blue">
          {{ roleTitle(role) }}
        </Tag>
        <span v-if="!row.roles?.length">-</span>
      </div>
    </template>

    <template #default_points="{ row }">
      <Tag color="blue">{{ row.point_account?.balance || 0 }}</Tag>
    </template>

    <template #field_point_transactions>
      <div v-if="formData?.id" class="mt-6 border-t border-gray-200 pt-5">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="m-0 text-base font-semibold text-gray-800">积分流水</h3>
          <span class="text-sm text-gray-500">
            当前余额：{{ formData.point_account?.balance || 0 }}
          </span>
        </div>
        <AppCrudTable
          api-url="point-transactions"
          :extra-query="pointExtraQuery"
          :fields="pointTransactionFields"
          :grid-options="{
            columns: pointTransactionColumns,
            showOverflow: false,
            columnConfig: { resizable: true },
          }"
          :open-mode="{ create: 'modal', detail: 'modal' }"
          :form-attrs="{ layout: 'vertical', size: 'medium' }"
          :model-value="pointData"
          :save-format="pointSaveFormat"
          :actions-config="[
            { key: 'edit', visible: false },
            { key: 'delete', visible: false },
          ]"
          title=""
        >
          <template #default_type="{ row }">
            <Tag :color="typeColorMap[row.type] || 'default'">
              {{ typeLabelMap[row.type] || row.type }}
            </Tag>
          </template>

          <template #default_points_change="{ row }">
            <span :class="row.points >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ row.points >= 0 ? '+' : '' }}{{ row.points }}
            </span>
          </template>
        </AppCrudTable>
      </div>
    </template>
  </AppCrudTable>
</template>
