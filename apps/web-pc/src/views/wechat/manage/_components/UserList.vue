<script setup lang="ts">
/**
 * 粉丝用户管理。
 *
 * 微信粉丝列表只返回 openid 数组（user/get），详情需逐个 user/info 拉取。
 * 这里提供 openid 列表 + 单选「详情」抽屉 + 多选批量打/撤标签。
 */
import { computed, h, onMounted, ref } from 'vue';

import {
  Button,
  Drawer,
  Image,
  message,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
} from 'antdv-next';

import {
  getWechatTagsApi,
  getWechatUserApi,
  getWechatUsersApi,
  tagWechatUsersApi,
  untagWechatUsersApi,
} from '#/api/core/wechat';
import type { WechatTag } from '#/api/core/wechat';

const props = defineProps({
  canWrite: { type: Boolean, default: true },
});

const loading = ref(false);
const openids = ref<string[]>([]);
const total = ref(0);
const nextOpenid = ref('');
const selectedKeys = ref<string[]>([]);

const tags = ref<WechatTag[]>([]);
const tagModalOpen = ref(false);
const tagModalMode = ref<'tag' | 'untag'>('tag');
const tagModalValue = ref<number | undefined>(undefined);
const tagModalLoading = ref(false);

const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<Record<string, any> | null>(null);

const columns = [
  { title: 'OpenID', dataIndex: 'openid', ellipsis: true },
  {
    title: '操作',
    width: 160,
    customRender: ({ record }: any) =>
      h(Space as any, {}, () => [
        h(
          Button as any,
          { size: 'small', type: 'link', onClick: () => openDetail(record.openid) },
          () => '详情',
        ),
      ]),
  },
];

const rowSelection = computed(() => ({
  selectedRowKeys: selectedKeys.value,
  onChange: (keys: any[]) => {
    selectedKeys.value = keys as string[];
  },
}));

async function loadUsers() {
  loading.value = true;
  try {
    const res = await getWechatUsersApi({ next_openid: nextOpenid.value }).catch(() => ({
      total: 0,
      count: 0,
      data: { openid: [] },
      next_openid: '',
    }));
    total.value = res.total ?? 0;
    openids.value = res.data?.openid ?? [];
    nextOpenid.value = res.next_openid ?? '';
    selectedKeys.value = [];
  } finally {
    loading.value = false;
  }
}

function nextPage() {
  if (nextOpenid.value) loadUsers();
}

function hasNext() {
  return !!nextOpenid.value;
}

async function loadTags() {
  tags.value = (await getWechatTagsApi().catch(() => ({ tags: [] }))).tags || [];
}

async function openDetail(openid: string) {
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await getWechatUserApi(openid);
  } catch (e: any) {
    message.error(e?.message || '加载失败');
  } finally {
    detailLoading.value = false;
  }
}

async function openTagModal(mode: 'tag' | 'untag') {
  if (!selectedKeys.value.length) {
    message.warning('请先勾选粉丝');
    return;
  }
  tagModalMode.value = mode;
  tagModalValue.value = undefined;
  tagModalOpen.value = true;
}

async function confirmTag() {
  if (tagModalValue.value == null) {
    message.warning('请选择标签');
    return;
  }
  tagModalLoading.value = true;
  try {
    if (tagModalMode.value === 'tag') {
      await tagWechatUsersApi(tagModalValue.value, selectedKeys.value);
    } else {
      await untagWechatUsersApi(tagModalValue.value, selectedKeys.value);
    }
    message.success('操作成功');
    tagModalOpen.value = false;
  } catch (e: any) {
    message.error(e?.message || '操作失败');
  } finally {
    tagModalLoading.value = false;
  }
}

onMounted(() => {
  loadUsers();
  loadTags();
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <Tag>粉丝总数 {{ total }}</Tag>
      <Button size="small" @click="loadUsers">刷新</Button>
      <Button
        :disabled="!props.canWrite"
        size="small"
        type="primary"
        @click="openTagModal('tag')"
      >
        批量打标签
      </Button>
      <Button :disabled="!props.canWrite" size="small" @click="openTagModal('untag')">
        批量取消标签
      </Button>
      <span class="text-xs text-gray-400">已选 {{ selectedKeys.length }} 个</span>
    </div>

    <Table
      :columns="columns"
      :data-source="openids.map((o) => ({ openid: o, key: o }))"
      :loading="loading"
      :pagination="false"
      :row-selection="rowSelection"
      row-key="openid"
      size="small"
    />

    <div class="flex items-center gap-2 text-xs text-gray-500">
      <span>微信粉丝列表仅支持向后翻页</span>
      <Button :disabled="!hasNext()" size="small" @click="nextPage">下一页</Button>
    </div>

    <Drawer v-model:open="detailOpen" title="粉丝详情" width="460" destroy-on-close>
      <Spin :spinning="detailLoading">
        <div v-if="detail" class="flex flex-col gap-3 text-sm">
          <div class="flex items-center gap-3">
            <Image
              v-if="detail.headimgurl"
              :src="detail.headimgurl"
              width="48"
              height="48"
              class="rounded-full"
            />
            <div>
              <div class="font-medium">{{ detail.nickname || '未关注' }}</div>
              <Tag :color="detail.subscribe ? 'success' : 'default'">
                {{ detail.subscribe ? '已关注' : '未关注' }}
              </Tag>
            </div>
          </div>
          <div>OpenID：{{ detail.openid }}</div>
          <div>性别：{{ ({ 0: '未知', 1: '男', 2: '女' } as Record<number, string>)[detail.sex] || '未知' }}</div>
          <div>地区：{{ [detail.country, detail.province, detail.city].filter(Boolean).join(' / ') || '-' }}</div>
          <div>备注：{{ detail.remark || '-' }}</div>
          <div>标签 ID：{{ (detail.tagid_list || []).join(', ') || '-' }}</div>
          <div v-if="detail.subscribe_time">
            关注时间：{{ new Date(detail.subscribe_time * 1000).toLocaleString() }}
          </div>
        </div>
      </Spin>
    </Drawer>

    <Modal
      v-model:open="tagModalOpen"
      :title="tagModalMode === 'tag' ? '批量打标签' : '批量取消标签'"
      :confirm-loading="tagModalLoading"
      @ok="confirmTag"
    >
      <p class="mb-2 text-xs text-gray-500">
        将操作 {{ selectedKeys.length }} 个粉丝
      </p>
      <Select
        v-model:value="tagModalValue"
        :options="tags.map((t) => ({ value: t.id, label: `${t.name}（${t.count}）` }))"
        placeholder="选择标签"
        class="w-full"
      />
    </Modal>
  </div>
</template>
