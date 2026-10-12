<script setup>
/**
 * 选择要同步到公众号的源内容。
 *
 * 公众号图文不是「新建」出来的，而是从已有内容派生的一条渠道记录，
 * 所以入口不是空表单，而是先选源：内容类型 → 关键词搜候选 → 选一条 → 选语言。
 *
 * 类型与候选列表 uri 都由后端 /wechat-articles/types 下发，前端不维护类型→路由的映射。
 */
import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Empty,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Spin,
  Tag,
} from 'antdv-next';

import {
  getWechatTypesApi,
  previewWechatSourceApi,
} from '#/api/core/wechat';
import Resource from '#/api/resource';

const props = defineProps({
  open: { type: Boolean, default: false },
  /** 应用启用的语言列表，用于语言选择 */
  locales: { type: Array, default: () => [] },
  defaultLocale: { type: String, default: 'zh-CN' },
});

const emit = defineEmits(['update:open', 'previewed']);

const types = ref([]);
const typeValue = ref(null);
const keyword = ref('');
/** 候选列表项：实体字段 + locales[]（标题/语种/状态在 locales 里，见下方说明） */
const candidates = ref([]);
/** 后端 meta.total：搜索命中的总数，用来判断还有没有更多 */
const total = ref(0);
const page = ref(1);
const loadingTypes = ref(false);
const loadingList = ref(false);
const loadingMore = ref(false);
const submitting = ref(false);
const pickedId = ref(null);
const localeValue = ref(props.defaultLocale || 'zh-CN');
/** 手工指定内容 id（搜不到时的兜底入口） */
const manualId = ref(null);

const currentType = computed(
  () => types.value.find((t) => t.type === typeValue.value) || null,
);
const canSubmit = computed(
  () => !!typeValue.value && (!!pickedId.value || !!manualId.value),
);
const hasMore = computed(() => candidates.value.length < total.value);

const localeOptions = computed(() =>
  (props.locales || []).map((code) => ({ label: code, value: code })),
);

/**
 * 内容列表接口是多语言的：标题在 `locales[0]`，不在顶层。
 * 顶层只有实体字段（id、status、cover/image 等媒体），所以这里按「语言版本 + 实体媒体键」
 * 两个来源取数——直接读 row.title 会恒为 undefined，选择器里只剩一个谁也看不懂的 ID。
 *
 * 注意列表的语种投影是窄的（id/locale/title/slug/status），**没有 summary**，
 * 摘要只在详情接口返回，所以这里不显示摘要。
 */
const MEDIA_KEYS = ['cover', 'image', 'image2', 'thumb', 'thumbnail', 'avatar'];

function firstLocale(row) {
  const locales = Array.isArray(row?.locales) ? row.locales : [];
  // 优先默认语言，拿不到再退回第一个
  return (
    locales.find((l) => l?.locale === props.defaultLocale) ||
    locales.find((l) => l?.locale === 'zh-CN') ||
    locales[0] ||
    null
  );
}

function titleOf(row) {
  return String(firstLocale(row)?.title || row?.title || '').trim();
}

/** 各内容模型的封面列名不一致（article/case-study/product=cover，gallery/honor=image） */
function coverOf(row) {
  for (const key of MEDIA_KEYS) {
    const value = row?.[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  return '';
}

function statusOf(row) {
  return firstLocale(row)?.status_label || row?.status_label || '';
}

function statusColorOf(row) {
  const locale = firstLocale(row);
  return Number(locale?.status ?? row?.status) === 1 ? 'green' : 'default';
}

async function loadTypes() {
  if (types.value.length > 0) return;
  loadingTypes.value = true;
  try {
    types.value = (await getWechatTypesApi()) || [];
  } catch (error) {
    message.error(error?.message || '加载可同步类型失败');
  } finally {
    loadingTypes.value = false;
  }
}

async function loadCandidates() {
  if (!currentType.value) {
    candidates.value = [];
    total.value = 0;
    return;
  }
  loadingList.value = true;
  page.value = 1;
  try {
    const result = await fetchPage();
    candidates.value = result.items;
    total.value = result.total;
  } catch (error) {
    message.error(error?.message || '加载候选内容失败');
    candidates.value = [];
    total.value = 0;
  } finally {
    loadingList.value = false;
  }
}

/** 追加一页（「加载更多」）：用 per_page = 页大小 × 页码 一次拿够，避免后端游标分页。 */
async function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  page.value += 1;
  try {
    const result = await fetchPage();
    candidates.value = [...candidates.value, ...result.items];
    total.value = result.total;
  } catch (error) {
    message.error(error?.message || '加载更多失败');
    page.value -= 1;
  } finally {
    loadingMore.value = false;
  }
}

const PAGE_SIZE = 20;

/**
 * 取一页候选内容。
 *
 * 内容列表是 offset 分页（page + per_page），而「加载更多」要的是追加语义，
 * 所以这里用 per_page = PAGE_SIZE × page 一次拿够前 N 条，再按 PAGE_SIZE 切片取当前页。
 * 这样既复用了后端现有的分页语义，也不用前端自己维护游标。
 */
async function fetchPage() {
  const params = { per_page: PAGE_SIZE * page.value };
  if (keyword.value.trim()) params.title = keyword.value.trim();
  const body = await new Resource(currentType.value.uri).list(params);
  const items = Array.isArray(body?.data) ? body.data : [];
  const size = Number(body?.meta?.total);
  const slice = items.slice(PAGE_SIZE * (page.value - 1), PAGE_SIZE * page.value);

  return { items: slice, total: Number.isFinite(size) ? size : items.length };
}

function onTypeChange() {
  pickedId.value = null;
  keyword.value = '';
  candidates.value = [];
  loadCandidates();
}

function onPick(row) {
  pickedId.value = row.id;
  manualId.value = null;
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    pickedId.value = null;
    manualId.value = null;
    keyword.value = '';
    localeValue.value = props.defaultLocale || 'zh-CN';
    await loadTypes();
    if (!typeValue.value && types.value.length > 0) {
      typeValue.value = types.value[0].type;
    }
    await loadCandidates();
  },
);

/**
 * 只试算，不落库。
 *
 * 需求是「先用编辑器预览并编辑，确定好样式后再同步」，所以这里点确定只是把源内容
 * 适配成公众号样式交给编辑器，由运营在编辑器里确认后才 commit。
 * 在这里直接落库的话，运营只是点开看看就会在列表里留下一条半成品记录。
 */
async function submit() {
  const contentId = pickedId.value || manualId.value;
  if (!currentType.value || !contentId) return;
  submitting.value = true;
  try {
    const preview = await previewWechatSourceApi({
      content_type: currentType.value.type,
      content_id: Number(contentId),
      locale: localeValue.value,
    });
    emit('previewed', { preview, warnings: preview?.warnings || [] });
    emit('update:open', false);
  } catch (error) {
    message.error(error?.message || '生成公众号预览失败');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    title="选择要同步的内容"
    width="760px"
    :confirm-loading="submitting"
    ok-text="生成预览"
    cancel-text="取消"
    :ok-button-props="{ disabled: !canSubmit }"
    @update:open="(v) => emit('update:open', v)"
    @ok="submit"
  >
    <Spin :spinning="loadingTypes">
      <div class="mb-3 flex items-end gap-3">
        <div class="flex-1">
          <div class="mb-1 text-sm font-medium">内容类型</div>
          <Select
            v-model:value="typeValue"
            :options="types.map((t) => ({ label: t.label, value: t.type }))"
            style="width: 100%"
            @change="onTypeChange"
          />
        </div>
        <div class="flex-1">
          <div class="mb-1 text-sm font-medium">语言</div>
          <Select
            v-model:value="localeValue"
            :options="localeOptions"
            style="width: 100%"
          />
        </div>
      </div>
    </Spin>

    <Alert
      class="mb-3"
      type="info"
      show-icon
      message="这一步只生成预览，不会落库。请在编辑器里调整好样式后点「确定同步」。"
    />

    <div class="mb-2 flex items-center gap-2">
      <Input
        v-model:value="keyword"
        placeholder="按标题搜索"
        allow-clear
        style="width: 260px"
        @press-enter="loadCandidates"
      />
      <a class="text-sm text-primary" @click="loadCandidates">搜索</a>
      <span class="text-xs text-gray-400">
        已加载 {{ candidates.length }} / 共 {{ total }} 条，点选一条
      </span>
    </div>

    <Spin :spinning="loadingList">
      <div class="max-h-[320px] overflow-y-auto rounded border border-border">
        <div
          v-for="row in candidates"
          :key="row.id"
          class="flex cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-muted/50"
          :class="pickedId === row.id ? 'bg-primary/10' : ''"
          @click="onPick(row)"
        >
          <img
            v-if="coverOf(row)"
            :src="coverOf(row)"
            alt=""
            class="h-11 w-16 flex-none rounded object-cover"
          />
          <div
            v-else
            class="flex h-11 w-16 flex-none items-center justify-center rounded bg-muted text-[10px] text-gray-400"
          >
            无封面
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">
              {{ titleOf(row) || '（无标题）' }}
            </div>
            <div class="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
              <span class="rounded bg-muted px-1">{{
                firstLocale(row)?.locale || 'zh-CN'
              }}</span>
              <span>#{{ row.id }}</span>
            </div>
          </div>
          <Tag :color="statusColorOf(row)">{{ statusOf(row) || '未知' }}</Tag>
        </div>
        <Empty
          v-if="candidates.length === 0"
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="没有匹配的内容"
          class="py-6"
        />
      </div>
      <div v-if="hasMore" class="mt-2 text-center">
        <Button size="small" :loading="loadingMore" @click="loadMore">
          加载更多（还有 {{ total - candidates.length }} 条）
        </Button>
      </div>
    </Spin>

    <div class="mt-3 flex items-center gap-2">
      <span class="text-sm text-gray-500">或直接用内容 ID：</span>
      <InputNumber
        v-model:value="manualId"
        :min="1"
        placeholder="内容 ID"
        style="width: 160px"
        @change="() => (pickedId = null)"
      />
    </div>
  </Modal>
</template>
