<script setup>
import { h, onMounted, ref } from 'vue';

import { Button, Input, message, Modal, Select, Tag } from 'antdv-next';

import Resource from '#/api/resource';
import AppCrudTable from '#/components/app-crud-table/AppCrudTable.vue';

const editingItem = ref({});

// 申请关闭：选择项目 + 原因
const applyDialog = ref(false);
const projectOptions = ref([]);
const applyProjectId = ref(null);
const applyReason = ref('');
const applyChecklist = ref(null);
const applying = ref(false);

async function loadProjects() {
  const { data } = await new Resource('projects').list({ per_page: 'all' });
  projectOptions.value = (data || []).map((p) => ({
    value: p.id,
    label: p.name,
  }));
}

async function openApply() {
  applyProjectId.value = null;
  applyReason.value = '';
  applyChecklist.value = null;
  await loadProjects();
  applyDialog.value = true;
}

async function previewChecklist() {
  if (!applyProjectId.value) {
    message.warning('请先选择项目');
    return;
  }
  const { data } = await new Resource('projects').get(
    `projects/${applyProjectId.value}/closure-checklist`,
  );
  applyChecklist.value = data;
  if (data?.pass === false) {
    message.warning('存在未通过检查项，仍可提交申请，审批时需说明');
  }
}

async function submitApply() {
  if (!applyProjectId.value || !applyReason.value.trim()) {
    message.warning('请填写项目与关闭原因');
    return;
  }
  applying.value = true;
  try {
    await new Resource('project-closures').create({
      project_id: applyProjectId.value,
      reason: applyReason.value.trim(),
    });
    message.success('关闭申请已提交');
    applyDialog.value = false;
    reloadKey.value++;
  } catch (error) {
    message.error(error?.response?.data?.message || '提交失败');
  } finally {
    applying.value = false;
  }
}

// 审批
function approve(row) {
  Modal.confirm({
    title: '审批通过关闭申请',
    content: `确认通过 ${row.project?.name || ''} 的关闭申请？`,
    okText: '通过',
    cancelText: '取消',
    onOk: async () => {
      await new Resource('project-closures').create(
        `project-closures/${row.id}/audit`,
        { status: 1 },
      );
      message.success('已通过');
      reloadKey.value++;
    },
  });
}

function reject(row) {
  let reason = '';
  Modal.confirm({
    title: '退回关闭申请',
    content: () =>
      h('div', [
        h('p', { style: 'margin-bottom:8px' }, '请填写退回原因：'),
        h('input', {
          style:
            'width:100%;padding:6px 8px;border:1px solid #d9d9d9;border-radius:4px',
          placeholder: '退回原因',
          onInput: (e) => (reason = e.target.value),
        }),
      ]),
    okText: '退回',
    cancelText: '取消',
    onOk: async () => {
      if (!reason.trim()) {
        message.warning('请填写退回原因');
        throw new Error('请填写退回原因');
      }
      await new Resource('project-closures').create(
        `project-closures/${row.id}/audit`,
        { status: 0, reason: reason.trim() },
      );
      message.success('已退回');
      reloadKey.value++;
    },
  });
}

// 触发归档
async function startArchive(row) {
  Modal.confirm({
    title: '生成归档包',
    content: `将归档 ${row.project?.name || ''}，生成数据清单与附件压缩包，项目转为已归档（只读）。确认继续？`,
    okText: '确认归档',
    cancelText: '取消',
    onOk: async () => {
      try {
        await new Resource('projects').create(
          `projects/${row.project_id}/archive`,
        );
        message.success('归档任务已提交');
        reloadKey.value++;
      } catch (error) {
        message.error(error?.response?.data?.message || '归档失败');
        throw new Error('归档失败', { cause: error });
      }
    },
  });
}

// 下载归档
async function downloadArchive(row) {
  window.open(`/api/v1/archive/download/${row.id}`, '_blank');
}

const reloadKey = ref(0);

const gridColumns = ref([
  { field: 'project.name', title: '项目', minWidth: 180 },
  { field: 'applicant.name', title: '申请人', width: 120 },
  { field: 'reason', title: '关闭原因', minWidth: 180 },
  {
    field: 'state',
    title: '状态',
    width: 110,
    slots: { default: 'default_state' },
  },
  { field: 'audit_remark', title: '审批意见', minWidth: 140 },
  { field: 'created_at', title: '申请时间', width: 160 },
]);

const stateColors = { 0: 'orange', 1: 'green', 2: 'red', 3: 'default' };
const stateLabels = { 0: '待审批', 1: '已通过', 2: '已退回', 3: '已取消' };

onMounted(() => {
  loadProjects();
});
</script>

<template>
  <AppCrudTable
    v-model="editingItem"
    api-url="project-closures"
    permission-name="project_closure"
    :key="reloadKey"
    :grid-options="{
      columns: gridColumns,
      showOverflow: false,
      columnConfig: { resizable: true },
    }"
    :inline-actions="['view']"
    :open-mode="{ detail: 'drawer' }"
    title="项目关闭"
    class="p-4"
  >
    <template #toolbar-append>
      <Button type="primary" size="small" @click="openApply">申请关闭</Button>
    </template>

    <template #row-action-extra="{ row }">
      <template v-if="row.state === 0">
        <Button type="link" size="small" @click.stop="approve(row)">
          通过
        </Button>
        <Button type="link" size="small" danger @click.stop="reject(row)">
          退回
        </Button>
      </template>
      <Button
        v-if="row.state === 1"
        type="link"
        size="small"
        @click.stop="startArchive(row)"
      >
        生成归档包
      </Button>
      <Button
        v-if="row.state === 1"
        type="link"
        size="small"
        @click.stop="downloadArchive(row)"
      >
        下载
      </Button>
    </template>

    <template #default_state="{ row }">
      <Tag :color="stateColors[row.state] || 'default'">
        {{ stateLabels[row.state] || row.state }}
      </Tag>
    </template>
  </AppCrudTable>

  <!-- 申请关闭 -->
  <Modal
    v-model:open="applyDialog"
    title="申请关闭项目"
    ok-text="提交申请"
    cancel-text="取消"
    @ok="submitApply"
    :confirm-loading="applying"
  >
    <div class="space-y-4">
      <div>
        <div class="mb-1 text-sm text-gray-500">项目</div>
        <Select
          v-model:value="applyProjectId"
          :options="projectOptions"
          placeholder="选择项目"
          show-search
          option-filter-prop="label"
          style="width: 100%"
        />
      </div>
      <div>
        <div class="mb-1 text-sm text-gray-500">关闭原因</div>
        <Input.TextArea
          v-model:value="applyReason"
          :rows="3"
          placeholder="填写关闭原因"
        />
      </div>
      <div>
        <Button size="small" @click="previewChecklist">预检关闭清单</Button>
      </div>
      <div v-if="applyChecklist" class="rounded border p-3">
        <div class="mb-2 flex items-center gap-2">
          <span class="font-medium">{{ applyChecklist.project_name }}</span>
          <Tag :color="applyChecklist.pass ? 'green' : 'red'">
            {{ applyChecklist.pass ? '通过' : '未通过' }}
          </Tag>
        </div>
        <div
          v-for="item in applyChecklist.items"
          :key="item.key"
          class="flex items-center gap-2 py-0.5 text-sm"
        >
          <Tag :color="item.pass ? 'green' : item.soft ? 'orange' : 'red'">
            {{ item.pass ? '✓' : '✗' }}
          </Tag>
          <span>{{ item.label }}（{{ item.count }}）</span>
        </div>
      </div>
    </div>
  </Modal>
</template>
