<script setup>
/**
 * 公众号设置（应用级）。
 *
 * 双用组件：独立页面时自带应用选择；嵌入抽屉时由 appId 指定应用
 * （接口走请求头 X-Application-Id，仍需同步 localStorage）。
 *
 * AppSecret 只写不回显：后端只回 secret_configured / secret_from_env，
 * 这里输入框永远为空，输入即代表「重新设置」。
 */
import { computed, onMounted, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Divider,
  Input,
  message,
  Select,
  Spin,
  Tag,
} from 'antdv-next';

import {
  getCurrentApplicationId,
  setCurrentApplicationId,
} from '#/api/application-context';
import { getWechatSettingsApi, putWechatSettingsApi } from '#/api/core/wechat';
import Resource from '#/api/resource';

const props = defineProps({
  appId: { type: [Number, String], default: null },
});

const applications = ref([]);
const selectedAppId = ref(null);
const loading = ref(false);
const saving = ref(false);
const form = ref({
  app_id: '',
  secret: '',
  token: '',
  aes_key: '',
  author: '',
  source_url_template: '',
  link_strategy: 'strip',
  preview_touser: '',
  preview_wxname: '',
});
const configured = ref(false);
const secretConfigured = ref(false);
const secretFromEnv = ref(false);

const embedded = computed(() => Number(props.appId) > 0);
const appIdNum = computed(() => Number(selectedAppId.value) || null);

const LINK_STRATEGY_OPTIONS = [
  { label: '剥离外链（订阅号推荐）', value: 'strip' },
  { label: '保留外链（服务号可用）', value: 'keep' },
];

const PLACEHOLDERS = {
  '{slug}': '内容 slug',
  '{id}': '内容 ID',
  '{locale}': '语言代码',
};

async function load() {
  if (!appIdNum.value) return;
  loading.value = true;
  try {
    const data = await getWechatSettingsApi();
    form.value = {
      app_id: data?.app_id || '',
      secret: '', // 后端不回显，留空表示不修改
      token: data?.token || '',
      aes_key: data?.aes_key || '',
      author: data?.author || '',
      source_url_template: data?.source_url_template || '',
      link_strategy: data?.link_strategy || 'strip',
      preview_touser: data?.preview_touser || '',
      preview_wxname: data?.preview_wxname || '',
    };
    configured.value = !!data?.configured;
    secretConfigured.value = !!data?.secret_configured;
    secretFromEnv.value = !!data?.secret_from_env;
  } catch (error) {
    message.error(error?.message || '加载公众号设置失败');
  } finally {
    loading.value = false;
  }
}

function switchApplication(id) {
  selectedAppId.value = id;
  setCurrentApplicationId(id);
  load();
}

async function save() {
  if (!appIdNum.value) return;
  saving.value = true;
  try {
    const payload = { ...form.value };
    // 空 secret = 沿用 env 兜底/不修改，不把空串写进库里覆盖已有值
    if (!payload.secret) delete payload.secret;
    const data = await putWechatSettingsApi(payload);
    configured.value = !!data?.configured;
    secretConfigured.value = !!data?.secret_configured;
    secretFromEnv.value = !!data?.secret_from_env;
    form.value.secret = '';
    message.success('公众号设置已保存');
  } catch (error) {
    message.error(error?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  try {
    const { data } = await new Resource('applications').list({ per_page: 100 });
    applications.value = data || [];
    const propApp = Number(props.appId);
    if (propApp > 0 && applications.value.some((a) => Number(a.id) === propApp)) {
      selectedAppId.value = propApp;
    } else {
      const stored = getCurrentApplicationId();
      selectedAppId.value =
        stored && applications.value.some((a) => Number(a.id) === stored)
          ? stored
          : (Number(applications.value[0]?.id) || null);
    }
    if (selectedAppId.value) {
      setCurrentApplicationId(selectedAppId.value);
    }
    await load();
  } catch (error) {
    console.error(error);
  }
});

watch(
  () => props.appId,
  (id) => {
    const num = Number(id);
    if (num > 0 && num !== selectedAppId.value) switchApplication(num);
  },
);
</script>

<template>
  <div class="p-4">
    <Card>
      <template #title>
        <div class="flex items-center gap-2">
          <span>公众号设置</span>
          <Tag v-if="configured" color="green">已配置</Tag>
          <Tag v-else color="red">未配置</Tag>
        </div>
      </template>

      <div class="mb-4 flex items-center justify-between">
        <div v-if="!embedded" class="flex items-center gap-3">
          <span class="text-sm text-gray-600">应用</span>
          <Select
            :value="selectedAppId"
            :options="
              applications.map((a) => ({ label: a.name, value: a.id }))
            "
            style="width: 240px"
            @change="switchApplication"
          />
        </div>
        <span v-else class="text-sm text-gray-400">当前应用</span>
        <Button type="primary" :loading="saving" @click="save">保存</Button>
      </div>

      <Spin :spinning="loading">
        <Alert
          v-if="!configured"
          class="mb-4"
          type="warning"
          show-icon
          message="尚未配置 AppID / AppSecret，同步与发布都会被拒绝"
          description="凭据存在应用级配置里（application_settings），不是全局环境变量 —— 一个租户可以有多个公众号应用。"
        />

        <Divider orientation="left">接口凭据</Divider>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div class="mb-1 text-sm font-medium">AppID</div>
            <Input v-model:value="form.app_id" placeholder="wx..." />
          </div>
          <div>
            <div class="mb-1 text-sm font-medium">
              AppSecret
              <Tag v-if="secretConfigured" color="green" class="ml-1">已设置</Tag>
              <Tag v-else color="red" class="ml-1">未设置</Tag>
            </div>
            <Input
              v-model:value="form.secret"
              type="password"
              placeholder="留空表示不修改"
            />
            <p v-if="secretFromEnv" class="mt-1 text-xs text-gray-400">
              当前生效值来自环境变量兜底（config/wechat.php）
            </p>
          </div>
          <div>
            <div class="mb-1 text-sm font-medium">
              Token
              <span class="text-xs font-normal text-gray-400">
                消息回调校验用，后续接管消息/粉丝时生效
              </span>
            </div>
            <Input v-model:value="form.token" placeholder="Token" />
          </div>
          <div>
            <div class="mb-1 text-sm font-medium">EncodingAESKey</div>
            <Input v-model:value="form.aes_key" placeholder="43 位密钥" />
          </div>
        </div>

        <Divider orientation="left">同步行为</Divider>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div class="mb-1 text-sm font-medium">默认作者</div>
            <Input
              v-model:value="form.author"
              placeholder="留空则不填作者"
            />
          </div>
          <div>
            <div class="mb-1 text-sm font-medium">正文外链处理</div>
            <Select
              v-model:value="form.link_strategy"
              :options="LINK_STRATEGY_OPTIONS"
              style="width: 100%"
            />
          </div>
          <div class="md:col-span-2">
            <div class="mb-1 text-sm font-medium">原文链接模板</div>
            <Input
              v-model:value="form.source_url_template"
              placeholder="https://www.example.com/articles/{slug}"
            />
            <div class="mt-1 flex flex-wrap gap-2 text-xs text-gray-400">
              <span>可用占位符：</span>
              <span
                v-for="(desc, key) in PLACEHOLDERS"
                :key="key"
                class="rounded bg-muted px-1.5 py-0.5"
              >
                {{ key }} · {{ desc }}
              </span>
              <span>留空则不填原文链接</span>
            </div>
          </div>
        </div>

        <Divider orientation="left">预览接收人</Divider>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div class="mb-1 text-sm font-medium">默认接收人 openid</div>
            <Input
              v-model:value="form.preview_touser"
              placeholder="编辑器里不填时使用"
            />
          </div>
          <div>
            <div class="mb-1 text-sm font-medium">默认接收人微信号</div>
            <Input
              v-model:value="form.preview_wxname"
              placeholder="如 wxid_xxx"
            />
          </div>
        </div>
      </Spin>
    </Card>
  </div>
</template>
