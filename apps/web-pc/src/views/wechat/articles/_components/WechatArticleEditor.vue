<script setup>
/**
 * 公众号图文编辑器（左表单 / 右手机预览）。
 *
 * 「同步公众号」的完整顺序就在这里完成：
 *   1. 选择内容后后端先试算一份适配结果（不落库），本组件以手机视口渲染出来；
 *   2. 运营在左侧调整标题/摘要/正文/封面，右侧实时跟着变；
 *   3. 确认样式后点「确定同步」才落库（可同时写入微信草稿箱）；
 *   4. 之后在编辑器里「微信预览」（推到指定人手机上看真实效果）→「发布」。
 *
 * 契约与 PanoramaSceneEditor 一致：保存成功后只 emit saved/committed，
 * 由父级刷新列表，本组件不直接碰列表。
 */
import { computed, ref, watch } from 'vue';

import { IconifyIcon as Icon } from '@vben/icons';

import {
  Alert,
  Button,
  Drawer,
  Input,
  message,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
} from 'antdv-next';

import {
  commitWechatArticleApi,
  draftWechatArticleApi,
  getWechatArticleApi,
  previewWechatArticleApi,
  publishWechatArticleApi,
  putWechatArticleApi,
  refreshWechatArticleApi,
} from '#/api/core/wechat';
import AppEditor from '#/components/app-editor/index.vue';
import AppUpload from '#/components/AppUpload.vue';

import PhonePreview from './PhonePreview.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  /** 列表行对象（可只带 id，完整正文会在打开时重新拉） */
  row: { type: Object, default: null },
  /**
   * 试算结果（来自 SyncTargetPicker，未落库）。
   * 有它 = 创建模式：先在编辑器里预览并调整，确认样式后才「确定同步」。
   */
  preview: { type: Object, default: null },
  /** 是否具备发布权限（cms.wechat.publish） */
  canPublish: { type: Boolean, default: false },
  /** 是否具备写权限（cms.wechat.write） */
  canWrite: { type: Boolean, default: false },
});

const emit = defineEmits(['update:open', 'saved', 'committed']);

const loading = ref(false);
const saving = ref(false);
const acting = ref('');
const detail = ref(null);
const form = ref({
  title: '',
  author: '',
  digest: '',
  cover_path: '',
  content_source_url: '',
  content_html: '',
});
const previewDevice = ref('mobile');
const warnings = ref([]);
const dirty = ref(false);

/** 预览用的封面地址（库内路径或绝对 URL 都能直接展示） */
const coverUrl = computed(() => form.value.cover_path || '');

const statusMeta = computed(() => {
  const map = {
    draft: { color: 'default', text: '未同步' },
    drafted: { color: 'blue', text: '已进草稿箱' },
    published: { color: 'green', text: '已发布' },
    failed: { color: 'red', text: '同步失败' },
  };
  return map[detail.value?.status] || map.draft;
});

const sourceLabel = computed(() => {
  const d = detail.value || props.preview;
  if (!d) return '';
  const locale = d.locale ? ` · ${d.locale}` : '';
  return `${d.content_type_label || d.content_type} #${d.content_id}${locale}`;
});

/** 创建模式：还没落库，走「确定同步」而不是「保存」。 */
const isCreate = computed(() => !detail.value?.id && !!props.preview);

function syncFormFrom(row) {
  form.value = {
    title: row?.title || '',
    author: row?.author || '',
    digest: row?.digest || '',
    cover_path: row?.cover_path || '',
    content_source_url: row?.content_source_url || '',
    content_html: row?.content_html || '',
  };
}

async function loadDetail() {
  const id = props.row?.id;
  if (!id) return;
  loading.value = true;
  try {
    const data = await getWechatArticleApi(id);
    detail.value = data;
    syncFormFrom(data);
    dirty.value = false;
  } catch (error) {
    message.error(error?.message || '加载图文失败');
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.open, props.row?.id],
  async ([open]) => {
    if (!open) return;
    warnings.value = [];
    // 创建模式用试算结果填充；编辑模式重新拉详情
    if (props.preview) {
      detail.value = null;
      syncFormFrom(props.preview);
      warnings.value = props.preview.warnings || [];
      dirty.value = false;
      return;
    }
    await loadDetail();
  },
  { immediate: true },
);

function onFormChange() {
  dirty.value = true;
}

/**
 * 确认样式后同步：落库（编辑器里改过的内容优先）+ 可选写入微信草稿箱。
 *
 * 凭据没配好时后端仍然落库、只把状态标成 failed，所以这里不能当成整体失败：
 * 要提示"已保存但草稿没写进去"，让运营去补配置后重试。
 */
async function commit(withDraft) {
  const preview = props.preview;
  if (!preview) return;
  saving.value = true;
  try {
    const article = await commitWechatArticleApi({
      content_type: preview.content_type,
      content_id: Number(preview.content_id),
      locale: preview.locale,
      title: form.value.title,
      author: form.value.author,
      digest: form.value.digest,
      content_html: form.value.content_html,
      cover_path: form.value.cover_path,
      content_source_url: form.value.content_source_url,
      sync_draft: withDraft,
    });

    // 落库成功 → 切到编辑模式：后面「微信预览 / 发布」都需要真实 id
    detail.value = { ...article, content_html: form.value.content_html };
    dirty.value = false;
    emit('committed', article);

    if (withDraft && article?.status === 'failed') {
      message.warning(`已保存，但写入微信草稿箱失败：${article.last_error || '未知原因'}`);
    } else if (withDraft) {
      message.success('已同步到公众号草稿箱');
    } else {
      message.success('已保存');
    }
  } catch (error) {
    message.error(error?.message || '同步失败');
  } finally {
    saving.value = false;
  }
}

async function save(silent = false) {
  const id = detail.value?.id;
  if (!id) return;
  saving.value = true;
  try {
    const data = await putWechatArticleApi(id, { ...form.value });
    detail.value = { ...detail.value, ...data, content_html: form.value.content_html };
    dirty.value = false;
    if (!silent) message.success('已保存');
    emit('saved');
  } catch (error) {
    message.error(error?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

/** 重新对齐源内容：会覆盖人工改动，所以先确认。 */
async function refreshFromSource() {
  const id = detail.value?.id;
  if (!id) return;
  acting.value = 'refresh';
  try {
    const data = await refreshWechatArticleApi(id);
    warnings.value = data?.warnings || [];
    await loadDetail();
    message.success('已按源内容重新生成');
    emit('saved');
  } catch (error) {
    message.error(error?.message || '重新生成失败');
  } finally {
    acting.value = '';
  }
}

async function pushDraft() {
  const id = detail.value?.id;
  if (!id) return;
  if (dirty.value) {
    message.warning('有未保存的修改，请先保存');
    return;
  }
  acting.value = 'draft';
  try {
    const data = await draftWechatArticleApi(id);
    detail.value = { ...detail.value, ...data, content_html: form.value.content_html };
    message.success('已写入微信草稿箱');
    emit('saved');
  } catch (error) {
    message.error(error?.message || '写入草稿失败');
  } finally {
    acting.value = '';
  }
}

const previewOpen = ref(false);
const previewForm = ref({ touser: '', towxname: '' });

function openPreview() {
  previewForm.value = { touser: '', towxname: '' };
  previewOpen.value = true;
}

/**
 * 微信预览：把图文以消息推给指定人。
 * touser / towxname 都留空时后端回落到应用配置里的默认接收人。
 */
async function submitPreview() {
  const id = detail.value?.id;
  if (!id) return;
  acting.value = 'preview';
  try {
    await previewWechatArticleApi(id, {
      touser: previewForm.value.touser.trim(),
      towxname: previewForm.value.towxname.trim(),
    });
    previewOpen.value = false;
    message.success('已发送预览，请在微信里查看');
  } catch (error) {
    message.error(error?.message || '发送预览失败');
  } finally {
    acting.value = '';
  }
}

async function publish() {
  const id = detail.value?.id;
  if (!id) return;
  if (dirty.value) {
    message.warning('有未保存的修改，请先保存');
    return;
  }
  acting.value = 'publish';
  try {
    const data = await publishWechatArticleApi(id);
    detail.value = { ...detail.value, ...data, content_html: form.value.content_html };
    message.success('已发布');
    emit('saved');
  } catch (error) {
    message.error(error?.message || '发布失败');
  } finally {
    acting.value = '';
  }
}

function close() {
  emit('update:open', false);
}
</script>

<template>
  <Drawer
    :open="open"
    width="94vw"
    destroy-on-close
    :closable="false"
    class="wechat-article-editor"
    @update:open="(v) => emit('update:open', v)"
  >
    <template #title>
      <div class="flex w-full items-center justify-between gap-3 pr-2">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-base font-semibold">
            {{ form.title || '公众号图文' }}
          </span>
          <Tag :color="statusMeta.color">{{ statusMeta.text }}</Tag>
          <span class="text-xs text-gray-400">{{ sourceLabel }}</span>
          <Tag v-if="isCreate" color="orange">未保存</Tag>
        </div>
        <Space>
          <!-- 创建模式：确认样式后才同步，其余动作都要等落库后有 id -->
          <template v-if="isCreate">
            <Button :loading="saving" @click="commit(false)">仅保存</Button>
            <Popconfirm
              v-if="canWrite"
              title="确定样式后同步：保存内容并写入微信草稿箱"
              ok-text="确定同步"
              cancel-text="取消"
              @confirm="commit(true)"
            >
              <Button type="primary" :loading="saving">
                <Icon icon="lucide:upload-cloud" class="mr-1" />
                确定同步
              </Button>
            </Popconfirm>
          </template>
          <!-- 编辑模式 -->
          <template v-else>
            <Button
              v-if="canWrite"
              :loading="acting === 'refresh'"
              @click="refreshFromSource"
            >
              <Icon icon="lucide:refresh-cw" class="mr-1" />
              重新生成
            </Button>
            <Button
              v-if="canWrite"
              :disabled="!dirty"
              type="primary"
              ghost
              :loading="saving"
              @click="save()"
            >
              保存
            </Button>
            <Button
              v-if="canWrite"
              :loading="acting === 'draft'"
              @click="pushDraft"
            >
              <Icon icon="lucide:save" class="mr-1" />
              存草稿
            </Button>
            <Button
              v-if="canWrite"
              :loading="acting === 'preview'"
              @click="openPreview"
            >
              <Icon icon="lucide:send" class="mr-1" />
              微信预览
            </Button>
            <Popconfirm
              v-if="canPublish"
              title="发布后将在公众号可见，确定继续吗？"
              ok-text="发布"
              cancel-text="取消"
              @confirm="publish"
            >
              <Button type="primary" :loading="acting === 'publish'">
                <Icon icon="lucide:upload-cloud" class="mr-1" />
                发布
              </Button>
            </Popconfirm>
          </template>
          <Button @click="close">关闭</Button>
        </Space>
      </div>
    </template>

    <div class="flex h-full min-h-0">
      <!-- 左：编辑区 -->
      <div class="flex min-h-0 w-[46%] min-w-[420px] flex-col border-r border-border">
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <Alert
            v-if="warnings.length > 0"
            class="mb-3"
            type="warning"
            show-icon
            message="以下内容在公众号里做了降级，可能需要人工补"
          >
            <template #description>
              <ul class="ml-4 list-disc text-xs">
                <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
              </ul>
            </template>
          </Alert>
          <Alert
            v-if="detail?.last_error"
            class="mb-3"
            type="error"
            show-icon
            :message="`上次同步失败：${detail.last_error}`"
          />

          <div class="mb-3">
            <div class="mb-1 text-sm font-medium">标题</div>
            <Input
              v-model:value="form.title"
              :maxlength="64"
              show-count
              placeholder="公众号图文标题"
              @change="onFormChange"
            />
          </div>

          <div class="mb-3 grid grid-cols-2 gap-3">
            <div>
              <div class="mb-1 text-sm font-medium">作者</div>
              <Input
                v-model:value="form.author"
                :maxlength="64"
                placeholder="留空取应用默认作者"
                @change="onFormChange"
              />
            </div>
            <div>
              <div class="mb-1 text-sm font-medium">
                <Tooltip title="公众号建议 54 字内；留空则由摘要/正文自动截取">
                  摘要
                  <Icon icon="lucide:info" class="ml-0.5" />
                </Tooltip>
              </div>
              <Input
                v-model:value="form.digest"
                :maxlength="120"
                placeholder="图文摘要"
                @change="onFormChange"
              />
            </div>
          </div>

          <div class="mb-3">
            <div class="mb-1 text-sm font-medium">封面</div>
            <AppUpload
              v-model="form.cover_path"
              file-type="image"
              @update:model-value="onFormChange"
            />
            <p class="mt-1 text-xs text-gray-400">
              公众号必须有封面；正文含图片时留空会自动取正文第一张
            </p>
          </div>

          <div class="mb-3">
            <div class="mb-1 text-sm font-medium">
              <Tooltip title="订阅号正文外链点不动，留空更安全；服务号可填原文地址">
                原文链接
                <Icon icon="lucide:info" class="ml-0.5" />
              </Tooltip>
            </div>
            <Input
              v-model:value="form.content_source_url"
              placeholder="https://..."
              @change="onFormChange"
            />
          </div>

          <div>
            <div class="mb-1 flex items-center justify-between text-sm font-medium">
              <span>正文</span>
              <span class="text-xs font-normal text-gray-400">
                已按公众号规则适配，可直接编辑
              </span>
            </div>
            <AppEditor
              v-model="form.content_html"
              :min-height="420"
              :max-height="620"
              @update:model-value="onFormChange"
            />
          </div>
        </div>
      </div>

      <!-- 右：手机视口预览 -->
      <div class="min-h-0 flex-1">
        <PhonePreview
          v-model:device="previewDevice"
          :html="form.content_html"
          :title="form.title"
          :author="form.author"
          :digest="form.digest"
          :cover-url="coverUrl"
        />
      </div>
    </div>
  </Drawer>

  <Modal
    v-model:open="previewOpen"
    title="发送微信预览"
    :confirm-loading="acting === 'preview'"
    ok-text="发送"
    cancel-text="取消"
    @ok="submitPreview"
  >
    <p class="mb-3 text-xs text-gray-500">
      图文会以消息形式推给接收人，在微信里看真实排版。两者都留空时使用应用配置里的默认接收人。
    </p>
    <div class="mb-3">
      <div class="mb-1 text-sm font-medium">接收人 openid</div>
      <Input
        v-model:value="previewForm.touser"
        placeholder="关注者的 openid，留空则用微信号"
      />
    </div>
    <div>
      <div class="mb-1 text-sm font-medium">接收人微信号</div>
      <Input v-model:value="previewForm.towxname" placeholder="如 wxid_xxx" />
    </div>
  </Modal>
</template>
