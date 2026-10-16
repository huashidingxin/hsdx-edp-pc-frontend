<script setup lang="ts">
/**
 * 账号与连接：展示公众号基本信息、连接状态、能力清单与自动回复规则。
 *
 * 微信侧只读信息（账号信息、自动回复规则）+ 一次主动连接探测（test-connection）。
 * 真正改配置在「公众号设置」页（AppSecret / Token 等）。
 */
import { computed, onMounted, ref } from 'vue';

import { Alert, Button, Card, Descriptions, DescriptionsItem, message, Skeleton, Spin, Tag } from 'antdv-next';

import {
  getWechatAccountApi,
  getWechatAutoReplyApi,
  getWechatCapabilitiesApi,
  testWechatConnectionApi,
} from '#/api/core/wechat';

const props = defineProps({
  canWrite: { type: Boolean, default: true },
});

const loading = ref(false);
const testing = ref(false);
const account = ref<Record<string, any> | null>(null);
const autoReply = ref<Record<string, any> | null>(null);
const capabilities = ref<{ configured: boolean; modules: any[] }>({
  configured: false,
  modules: [],
});
const connection = ref<{ connected: boolean; checked_at: string } | null>(null);

const serviceTypeMap: Record<number, string> = {
  0: '订阅号',
  1: '旧式订阅号',
  2: '服务号',
  3: '旧式服务号',
};
const verifyTypeMap: Record<number, string> = {
  '-1': '未认证',
  0: '微信认证',
  1: '新浪微博认证',
  2: '腾讯微博认证',
  3: '已资质认证',
};

const descItems = computed(() => {
  const a = account.value || {};
  const info = a as any;
  return [
    { label: '公众号名称', value: info.nick_name },
    { label: '微信号', value: info.alias },
    { label: 'AppID', value: info.app_id },
    { label: '主体名称', value: info.principal_name },
    {
      label: '账号类型',
      value: info.account_type != null ? serviceTypeMap[info.account_type] ?? info.account_type : undefined,
    },
    {
      label: '认证状态',
      value:
        info.verify_type_info?.id != null
          ? verifyTypeMap[Number(info.verify_type_info.id)] ?? info.verify_type_info.id
          : undefined,
    },
    { label: '二维码', value: info.qrcode_url, image: true },
    { label: '头像', value: info.head_image, image: true },
  ].filter((it) => it.value != null && it.value !== '');
});

const autoReplySummary = computed(() => {
  const r = autoReply.value || {};
  return {
    isAutoreplyOpen: !!r.is_autoreply_open,
    isAddFriendReplyOpen: !!r.is_add_friend_reply_open,
    defaultContent: (r.message_default_autoreply_info as any)?.content || '',
    keywordCount: (r.keyword_autoreply_info as any)?.list?.length ?? 0,
  };
});

async function loadAll() {
  loading.value = true;
  try {
    const [cap, acc, reply] = await Promise.all([
      getWechatCapabilitiesApi().catch(() => ({ configured: false, modules: [] })),
      getWechatAccountApi().catch(() => null),
      getWechatAutoReplyApi().catch(() => null),
    ]);
    capabilities.value = cap;
    account.value = acc;
    autoReply.value = reply;
  } finally {
    loading.value = false;
  }
}

async function testConnection() {
  testing.value = true;
  try {
    connection.value = await testWechatConnectionApi();
    message.success('公众号连接正常');
  } catch (e: any) {
    connection.value = null;
    message.error(e?.message || '连接失败');
  } finally {
    testing.value = false;
  }
}

onMounted(loadAll);
</script>

<template>
  <Spin :spinning="loading">
    <div class="flex flex-col gap-4">
      <Alert
        v-if="!capabilities.configured"
        type="warning"
        show-icon
        message="公众号未配置"
        description="尚未在「公众号设置」中填写 AppID / AppSecret，以下信息暂不可用。配置保存后即可读取账号与运营数据。"
      />

      <Card title="账号信息" size="small">
        <Skeleton v-if="!account && !loading" active :paragraph="{ rows: 3 }" />
        <Descriptions v-else :column="2" bordered size="small">
          <DescriptionsItem
            v-for="item in descItems"
            :key="item.label"
            :label="item.label"
          >
            <img
              v-if="item.image"
              :src="item.value"
              class="h-16 w-16 object-contain"
              alt=""
            />
            <span v-else>{{ item.value }}</span>
          </DescriptionsItem>
        </Descriptions>
      </Card>

      <Card title="连接状态" size="small">
        <div class="mb-3 flex items-center gap-3">
          <Button :loading="testing" type="primary" @click="testConnection">
            测试连接
          </Button>
          <Tag v-if="connection?.connected" color="success">连接正常</Tag>
          <Tag v-else-if="connection === null && !testing" color="default">未测试</Tag>
          <span v-if="connection?.checked_at" class="text-xs text-gray-400">
            最近检测：{{ connection.checked_at }}
          </span>
        </div>
        <div class="text-xs text-gray-500">可运营的模块：</div>
        <div class="mt-2 flex flex-wrap gap-2">
          <Tag v-for="m in capabilities.modules" :key="m.key" color="blue">
            {{ m.label }}
          </Tag>
          <span v-if="!capabilities.modules.length" class="text-xs text-gray-400">
            暂无
          </span>
        </div>
      </Card>

      <Card title="自动回复规则" size="small">
        <Skeleton v-if="!autoReply && !loading" active :paragraph="{ rows: 2 }" />
        <template v-else>
          <div class="mb-2 flex gap-4 text-sm">
            <span>
              被关注自动回复：
              <Tag :color="autoReplySummary.isAddFriendReplyOpen ? 'success' : 'default'">
                {{ autoReplySummary.isAddFriendReplyOpen ? '已开启' : '未开启' }}
              </Tag>
            </span>
            <span>
              消息自动回复：
              <Tag :color="autoReplySummary.isAutoreplyOpen ? 'success' : 'default'">
                {{ autoReplySummary.isAutoreplyOpen ? '已开启' : '未开启' }}
              </Tag>
            </span>
            <span>
              关键词规则：
              <Tag>{{ autoReplySummary.keywordCount }} 条</Tag>
            </span>
          </div>
          <div v-if="autoReplySummary.defaultContent" class="rounded bg-gray-50 p-2 text-sm">
            {{ autoReplySummary.defaultContent }}
          </div>
          <div v-else class="text-xs text-gray-400">
            微信仅提供读取接口，如需修改请到公众号后台「自动回复」配置。
          </div>
        </template>
      </Card>
    </div>
  </Spin>
</template>
