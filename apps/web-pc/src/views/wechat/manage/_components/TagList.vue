<script setup lang="ts">
/**
 * 用户标签管理（微信侧）。
 *
 * 标签是公众号粉丝的分组维度：列表/新建/重命名/删除都在微信侧生效。
 * 给粉丝打标签的批量操作在「粉丝管理」页完成。
 */
import { h, onMounted, ref } from 'vue';

import {
  Button,
  Input,
  message,
  Modal,
  Popconfirm,
  Space,
  Table,
} from 'antdv-next';

import {
  createWechatTagApi,
  deleteWechatTagApi,
  getWechatTagsApi,
  updateWechatTagApi,
} from '#/api/core/wechat';
import type { WechatTag } from '#/api/core/wechat';

const props = defineProps({
  canWrite: { type: Boolean, default: true },
});

const loading = ref(false);
const tags = ref<WechatTag[]>([]);

const modalOpen = ref(false);
const modalTitle = ref('新建标签');
const editingId = ref<number | null>(null);
const nameValue = ref('');
const saving = ref(false);

const columns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '名称', dataIndex: 'name' },
  { title: '粉丝数', dataIndex: 'count', width: 100 },
  {
    title: '操作',
    width: 160,
    customRender: ({ record }: any) =>
      h(Space as any, {}, () => [
        props.canWrite
          ? h(
              Button as any,
              { size: 'small', type: 'link', onClick: () => openEdit(record) },
              () => '重命名',
            )
          : null,
        props.canWrite
          ? h(
              Popconfirm as any,
              { title: '确认删除该标签？', onConfirm: () => remove(record) },
              {
                default: () =>
                  h(Button as any, { size: 'small', type: 'link', danger: true }, () => '删除'),
              },
            )
          : null,
      ]),
  },
];

async function load() {
  loading.value = true;
  try {
    tags.value = (await getWechatTagsApi().catch(() => ({ tags: [] }))).tags || [];
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  nameValue.value = '';
  modalTitle.value = '新建标签';
  modalOpen.value = true;
}

function openEdit(record: WechatTag) {
  editingId.value = record.id;
  nameValue.value = record.name;
  modalTitle.value = '重命名标签';
  modalOpen.value = true;
}

async function confirmModal() {
  const name = nameValue.value.trim();
  if (!name) {
    message.warning('请输入标签名称');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value == null) {
      await createWechatTagApi(name);
    } else {
      await updateWechatTagApi(editingId.value, name);
    }
    message.success('已保存');
    modalOpen.value = false;
    load();
  } catch (e: any) {
    message.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function remove(record: WechatTag) {
  try {
    await deleteWechatTagApi(record.id);
    message.success('已删除');
    load();
  } catch (e: any) {
    message.error(e?.message || '删除失败');
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <Button :disabled="!props.canWrite" size="small" type="primary" @click="openCreate">
        新建标签
      </Button>
      <Button size="small" @click="load">刷新</Button>
    </div>

    <Table
      :columns="columns"
      :data-source="tags"
      :loading="loading"
      :pagination="false"
      row-key="id"
      size="small"
    />

    <Modal
      v-model:open="modalOpen"
      :title="modalTitle"
      :confirm-loading="saving"
      @ok="confirmModal"
    >
      <Input v-model:value="nameValue" placeholder="标签名称（≤30字）" :maxlength="30" />
    </Modal>
  </div>
</template>
