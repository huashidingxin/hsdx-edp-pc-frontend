<script setup lang="ts">
/**
 * 自定义菜单编辑器。
 *
 * 读取微信当前菜单（get_current_selfmenu_info，sub_button 是 {list:[...]} 结构），
 * 转换为扁平 sub_button:[...] 便于编辑；保存时直接提交 button 数组给后端，
 * 后端做长度与必填字段校验后下发微信。删除即清空公众号全部菜单。
 */
import { computed, onMounted, ref } from 'vue';

import {
  Alert,
  Button,
  Card,
  Input,
  message,
  Popconfirm,
  Radio,
  RadioGroup,
  Select,
  Spin,
  Tag,
} from 'antdv-next';

import {
  deleteWechatMenuApi,
  getWechatMenuApi,
  saveWechatMenuApi,
} from '#/api/core/wechat';
import type { WechatMenuButton } from '#/api/core/wechat';

const props = defineProps({
  canWrite: { type: Boolean, default: true },
});

const TYPE_OPTIONS = [
  { value: 'click', label: '点击推事件' },
  { value: 'view', label: '跳转网页' },
  { value: 'scancode_push', label: '扫码推事件' },
  { value: 'scancode_waitmsg', label: '扫码带提示' },
  { value: 'pic_sysphoto', label: '系统拍照发图' },
  { value: 'pic_photo_or_album', label: '拍照或相册' },
  { value: 'pic_weixin', label: '微信相册发图' },
  { value: 'location_select', label: '发送位置' },
  { value: 'miniprogram', label: '小程序' },
  { value: 'media_id', label: '图片素材' },
  { value: 'view_limited', label: '图文素材（受限）' },
  { value: 'article_id', label: '图文消息' },
  { value: 'article_view_limited', label: '图文消息（受限）' },
];

const REQUIRED_FIELDS: Record<string, string[]> = {
  click: ['key'],
  scancode_push: ['key'],
  scancode_waitmsg: ['key'],
  pic_sysphoto: ['key'],
  pic_photo_or_album: ['key'],
  pic_weixin: ['key'],
  location_select: ['key'],
  view: ['url'],
  miniprogram: ['url', 'appid', 'pagepath'],
  media_id: ['media_id'],
  view_limited: ['media_id'],
  article_id: ['article_id'],
  article_view_limited: ['article_id'],
};

const FIELD_LABELS: Record<string, string> = {
  key: '事件 Key',
  url: '跳转链接',
  appid: '小程序 AppID',
  pagepath: '小程序页面路径',
  media_id: '素材 media_id',
  article_id: '图文 article_id',
};

const loading = ref(false);
const saving = ref(false);
const buttons = ref<WechatMenuButton[]>([]);

function emptyButton(): WechatMenuButton {
  return { name: '', type: 'click', key: '' };
}

function emptySubButton(): WechatMenuButton {
  return { name: '', type: 'click', key: '' };
}

function normalize(raw: any): WechatMenuButton[] {
  const list = raw?.selfmenu_info?.button || [];
  return list.map((b: any) => {
    const children = b.sub_button?.list || b.sub_button || [];
    if (Array.isArray(children) && children.length) {
      return {
        name: b.name,
        sub_button: children.map((c: any) => ({
          name: c.name,
          type: c.type,
          key: c.key,
          url: c.url,
          appid: c.appid,
          pagepath: c.pagepath,
          media_id: c.media_id,
          article_id: c.article_id,
        })),
      };
    }
    return {
      name: b.name,
      type: b.type,
      key: b.key,
      url: b.url,
      appid: b.appid,
      pagepath: b.pagepath,
      media_id: b.media_id,
      article_id: b.article_id,
    };
  });
}

function isLeaf(btn: WechatMenuButton) {
  return !btn.sub_button || btn.sub_button.length === 0;
}

function requiredFor(btn: WechatMenuButton): string[] {
  return REQUIRED_FIELDS[btn.type || ''] || [];
}

function validate(): string | null {
  if (buttons.value.length < 1) return '至少保留 1 个一级菜单';
  if (buttons.value.length > 3) return '一级菜单最多 3 个';
  for (const btn of buttons.value) {
    if (!btn.name || btn.name.length > 16) return `一级菜单「${btn.name || '未命名'}」名称不能为空且不超过 16 字`;
    if (isLeaf(btn)) {
      for (const f of requiredFor(btn)) {
        if (!String((btn as any)[f] || '').trim()) {
          return `菜单「${btn.name}」缺少 ${FIELD_LABELS[f] || f}`;
        }
      }
    } else {
      if (btn.sub_button!.length > 5) return `「${btn.name}」子菜单最多 5 个`;
      for (const sub of btn.sub_button!) {
        if (!sub.name || sub.name.length > 60) return `子菜单「${sub.name || '未命名'}」名称不能超过 60 字`;
        for (const f of requiredFor(sub)) {
          if (!String((sub as any)[f] || '').trim()) {
            return `子菜单「${sub.name}」缺少 ${FIELD_LABELS[f] || f}`;
          }
        }
      }
    }
  }
  return null;
}

async function load() {
  loading.value = true;
  try {
    const raw = await getWechatMenuApi().catch(() => null);
    buttons.value = raw ? normalize(raw) : [];
    if (!buttons.value.length) buttons.value = [emptyButton()];
  } finally {
    loading.value = false;
  }
}

async function save() {
  const err = validate();
  if (err) {
    message.error(err);
    return;
  }
  saving.value = true;
  try {
    await saveWechatMenuApi(
      buttons.value.map((b) => ({
        name: b.name,
        ...(isLeaf(b)
          ? { type: b.type, key: b.key, url: b.url, appid: b.appid, pagepath: b.pagepath, media_id: b.media_id, article_id: b.article_id }
          : { sub_button: b.sub_button }),
      })) as WechatMenuButton[],
    );
    message.success('菜单已保存并下发到微信');
  } catch (e: any) {
    message.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function remove() {
  try {
    await deleteWechatMenuApi();
    buttons.value = [emptyButton()];
    message.success('已清空公众号菜单');
  } catch (e: any) {
    message.error(e?.message || '删除失败');
  }
}

function addTop() {
  if (buttons.value.length < 3) buttons.value.push(emptyButton());
}

function removeTop(index: number) {
  buttons.value.splice(index, 1);
}

function addSub(btn: WechatMenuButton) {
  if (!btn.sub_button) btn.sub_button = [];
  if (btn.sub_button.length < 5) btn.sub_button.push(emptySubButton());
}

function removeSub(btn: WechatMenuButton, index: number) {
  btn.sub_button?.splice(index, 1);
}

/** 切换一级菜单是否含子菜单：同步 sub_button 的空/非空状态 */
function toggleHasSub(btn: WechatMenuButton, has: boolean) {
  if (has) {
    if (!btn.sub_button || btn.sub_button.length === 0) {
      btn.sub_button = [emptySubButton()];
    }
  } else {
    btn.sub_button = undefined;
  }
}

/** 模板事件入口：从 RadioGroup 变更事件取选中值 */
function onTopSubChange(btn: WechatMenuButton, e: any) {
  toggleHasSub(btn, !!e?.target?.value);
}

const canEdit = computed(() => props.canWrite);

onMounted(load);
</script>

<template>
  <Spin :spinning="loading">
    <div class="flex flex-col gap-4">
      <Alert
        type="info"
        show-icon
        message="一级菜单 1-3 个，每个一级菜单最多 5 个子菜单；有子菜单时一级菜单本身不可点击。"
        description="修改后点「保存菜单」下发到微信，约 5-10 分钟生效。删除将清空全部菜单。"
      />

      <div class="flex gap-2">
        <Button :disabled="!canEdit || buttons.length >= 3" @click="addTop">
          添加一级菜单
        </Button>
        <Button :disabled="!canEdit" :loading="saving" type="primary" @click="save">
          保存菜单
        </Button>
        <Popconfirm
          :disabled="!canEdit"
          title="确认清空公众号全部菜单？"
          @confirm="remove"
        >
          <Button :disabled="!canEdit" danger>删除全部菜单</Button>
        </Popconfirm>
      </div>

      <Card
        v-for="(btn, i) in buttons"
        :key="i"
        size="small"
        class="border border-gray-200"
      >
        <template #title>
          <div class="flex items-center gap-2">
            <span>一级菜单 {{ i + 1 }}</span>
            <Tag v-if="!isLeaf(btn)" color="blue">含子菜单</Tag>
            <Button
              :disabled="!canEdit"
              size="small"
              type="text"
              danger
              @click="removeTop(i)"
            >
              移除
            </Button>
          </div>
        </template>

        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <span class="w-16 text-xs text-gray-500">名称</span>
            <Input
              v-model:value="btn.name"
              :disabled="!canEdit"
              :maxlength="16"
              placeholder="菜单名称（≤16字）"
              class="max-w-xs"
            />
          </div>

          <RadioGroup
            :value="!!btn.sub_button?.length"
            :disabled="!canEdit"
            class="ml-0"
            @change="onTopSubChange(btn, $event)"
          >
            <Radio :value="false">直接动作</Radio>
            <Radio :value="true">包含子菜单</Radio>
          </RadioGroup>

          <!-- 直接动作：类型 + 字段 -->
          <div v-if="!btn.sub_button?.length" class="flex flex-col gap-2 pl-16">
            <Select
              v-model:value="btn.type"
              :disabled="!canEdit"
              class="max-w-xs"
              :options="TYPE_OPTIONS"
            />
            <div
              v-for="f in requiredFor(btn)"
              :key="f"
              class="flex items-center gap-2"
            >
              <span class="w-28 text-xs text-gray-500">{{ FIELD_LABELS[f] || f }}</span>
              <Input
                v-model:value="(btn as any)[f]"
                :disabled="!canEdit"
                :placeholder="FIELD_LABELS[f] || f"
                class="max-w-md"
              />
            </div>
          </div>

          <!-- 子菜单 -->
          <div v-else class="flex flex-col gap-2 pl-16">
            <Button
              :disabled="!canEdit || (btn.sub_button?.length ?? 0) >= 5"
              size="small"
              @click="addSub(btn)"
            >
              添加子菜单
            </Button>
            <div
              v-for="(sub, j) in btn.sub_button"
              :key="j"
              class="rounded border border-gray-100 p-2"
            >
              <div class="mb-2 flex items-center gap-2">
                <Input
                  v-model:value="sub.name"
                  :disabled="!canEdit"
                  :maxlength="60"
                  placeholder="子菜单名称（≤60字）"
                  class="max-w-xs"
                />
                <Button
                  :disabled="!canEdit"
                  size="small"
                  type="text"
                  danger
                  @click="removeSub(btn, j)"
                >
                  移除
                </Button>
              </div>
              <div class="flex flex-col gap-2 pl-2">
                <Select
                  v-model:value="sub.type"
                  :disabled="!canEdit"
                  class="max-w-xs"
                  :options="TYPE_OPTIONS"
                />
                <div
                  v-for="f in requiredFor(sub)"
                  :key="f"
                  class="flex items-center gap-2"
                >
                  <span class="w-28 text-xs text-gray-500">{{ FIELD_LABELS[f] || f }}</span>
                  <Input
                    v-model:value="(sub as any)[f]"
                    :disabled="!canEdit"
                    :placeholder="FIELD_LABELS[f] || f"
                    class="max-w-md"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </Spin>
</template>
