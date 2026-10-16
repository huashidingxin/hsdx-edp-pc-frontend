<script setup lang="ts">
/**
 * 公众号微信侧资产列表（永久素材 / 草稿箱 / 已发布内容）。
 *
 * 三类接口结构高度一致（offset 分页、total_count + item[]），故合并为一个组件，
 * 由 kind 区分。删除会直接落到微信服务器，不可恢复。
 */
import { computed, h, onMounted, ref } from 'vue';

import {
  Button,
  Drawer,
  Empty,
  Image,
  message,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
} from 'antdv-next';

import {
  deleteWechatDraftApi,
  deleteWechatMaterialApi,
  deleteWechatPublishedApi,
  getWechatDraftCountApi,
  getWechatDraftsApi,
  getWechatMaterialCountApi,
  getWechatMaterialsApi,
  getWechatPublishedApi,
  getWechatPublishedArticleApi,
} from '#/api/core/wechat';

const props = defineProps({
  kind: { type: String as () => 'material' | 'draft' | 'published', required: true },
  canWrite: { type: Boolean, default: true },
});

const PAGE_SIZE = 20;

const loading = ref(false);
const rows = ref<any[]>([]);
const total = ref(0);
const offset = ref(0);
const materialType = ref<'image' | 'voice' | 'video' | 'news'>('image');

const materialCount = ref<Record<string, number>>({});
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailData = ref<any>(null);

const typeOptions = [
  { value: 'image', label: '图片' },
  { value: 'voice', label: '语音' },
  { value: 'video', label: '视频' },
  { value: 'news', label: '图文' },
];

const kindLabel = computed(() => {
  if (props.kind === 'material') return '永久素材';
  if (props.kind === 'draft') return '草稿箱';
  return '已发布内容';
});

const page = computed(() => Math.floor(offset.value / PAGE_SIZE) + 1);
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

function formatTime(ts?: number) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString();
}

function extractRow(item: any) {
  const news = item.content?.news_item?.[0] || {};
  const id = item.media_id || item.article_id || '';
  const thumb = item.url || news.thumb_url || news.cover_url || '';
  const title =
    item.name ||
    news.title ||
    (props.kind === 'published' ? '图文消息' : props.kind === 'material' ? '素材' : '草稿');
  return { id, title, thumb, updateTime: item.update_time, raw: item };
}

async function load() {
  loading.value = true;
  try {
    if (props.kind === 'material') {
      const [count, list] = await Promise.all([
        getWechatMaterialCountApi().catch(() => ({})),
        getWechatMaterialsApi({
          type: materialType.value,
          offset: offset.value,
          count: PAGE_SIZE,
        }).catch(() => ({ total_count: 0, item: [] })),
      ]);
      materialCount.value = count || {};
      total.value =
        (count as any)?.[`${materialType.value}_count`] ?? list.total_count ?? 0;
      rows.value = list.item.map(extractRow);
    } else if (props.kind === 'draft') {
      const [count, list] = await Promise.all([
        getWechatDraftCountApi().catch(() => ({ total_count: 0 })),
        getWechatDraftsApi({ offset: offset.value, count: PAGE_SIZE, no_content: false }).catch(
          () => ({ total_count: 0, item: [] }),
        ),
      ]);
      total.value = count.total_count ?? list.total_count ?? 0;
      rows.value = list.item.map(extractRow);
    } else {
      const list = await getWechatPublishedApi({
        offset: offset.value,
        count: PAGE_SIZE,
        no_content: false,
      }).catch(() => ({ total_count: 0, item: [] }));
      total.value = list.total_count ?? 0;
      rows.value = list.item.map(extractRow);
    }
  } finally {
    loading.value = false;
  }
}

function prevPage() {
  if (offset.value >= PAGE_SIZE) {
    offset.value -= PAGE_SIZE;
    load();
  }
}

function nextPage() {
  if (offset.value + PAGE_SIZE < total.value) {
    offset.value += PAGE_SIZE;
    load();
  }
}

function changeType() {
  offset.value = 0;
  load();
}

async function remove(row: any) {
  try {
    if (props.kind === 'material') await deleteWechatMaterialApi(row.id);
    else if (props.kind === 'draft') await deleteWechatDraftApi(row.id);
    else await deleteWechatPublishedApi(row.id);
    message.success('已删除');
    load();
  } catch (e: any) {
    message.error(e?.message || '删除失败');
  }
}

async function openDetail(row: any) {
  detailOpen.value = true;
  detailLoading.value = true;
  detailData.value = null;
  try {
    detailData.value = await getWechatPublishedArticleApi(row.id);
  } catch (e: any) {
    message.error(e?.message || '加载失败');
  } finally {
    detailLoading.value = false;
  }
}

const columns = computed(() => {
  const base: any[] = [
    {
      title: '封面',
      dataIndex: 'thumb',
      width: 80,
      customRender: ({ text }: any) =>
        text
          ? h(Image as any, { src: text, width: 56, height: 56, class: 'object-contain' })
          : h(Tag as any, {}, () => '无'),
    },
    { title: '标题 / 名称', dataIndex: 'title', ellipsis: true },
    {
      title: 'ID',
      dataIndex: 'id',
      width: 200,
      ellipsis: true,
      customRender: ({ text }: any) => h(Tag as any, { color: 'default' }, () => text),
    },
    {
      title: '更新时间',
      dataIndex: 'updateTime',
      width: 180,
      customRender: ({ text }: any) => formatTime(text),
    },
  ];
  const actions: any = {
    title: '操作',
    width: 140,
    customRender: ({ record }: any) =>
      h(Space as any, {}, () => [
        props.kind === 'published'
          ? h(
              Button as any,
              { size: 'small', type: 'link', onClick: () => openDetail(record) },
              () => '查看',
            )
          : null,
        props.canWrite
          ? h(
              Popconfirm as any,
              {
                title: '确认从微信删除？不可恢复',
                onConfirm: () => remove(record),
              },
              {
                default: () =>
                  h(Button as any, { size: 'small', type: 'link', danger: true }, () => '删除'),
              },
            )
          : null,
      ]),
  };
  return [...base, actions];
});

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <span v-if="kind === 'material'" class="flex items-center gap-2">
        素材类型
        <Select
          v-model:value="materialType"
          :options="typeOptions"
          class="w-28"
          @change="changeType"
        />
        <Tag>共 {{ total }} 个</Tag>
      </span>
      <Tag v-else>共 {{ total }} 个</Tag>
      <Button size="small" @click="load">刷新</Button>
    </div>

    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="false"
      row-key="id"
      size="small"
    >
      <template #emptyText>
        <Empty :description="`暂无${kindLabel}`" />
      </template>
    </Table>

    <div class="flex items-center justify-between text-xs text-gray-500">
      <span>第 {{ page }} / {{ pageCount }} 页 · 每页 {{ PAGE_SIZE }}</span>
      <Space>
        <Button :disabled="offset === 0" size="small" @click="prevPage">上一页</Button>
        <Button
          :disabled="offset + PAGE_SIZE >= total"
          size="small"
          @click="nextPage"
        >
          下一页
        </Button>
      </Space>
    </div>

    <Drawer
      v-model:open="detailOpen"
      :title="`已发布图文详情`"
      width="520"
      destroy-on-close
    >
      <Spin :spinning="detailLoading">
        <div v-if="detailData" class="flex flex-col gap-2 text-sm">
          <div
            v-for="(item, i) in detailData.news_item || []"
            :key="i"
            class="rounded border border-gray-100 p-3"
          >
            <div class="mb-1 font-medium">{{ item.title }}</div>
            <div class="text-xs text-gray-500">作者：{{ item.author || '-' }}</div>
            <div class="text-xs text-gray-500">摘要：{{ item.digest || '-' }}</div>
            <div v-if="item.url" class="mt-1">
              <a :href="item.url" target="_blank" rel="noreferrer">微信链接</a>
            </div>
            <div v-if="item.content_url" class="mt-1">
              <a :href="item.content_url" target="_blank" rel="noreferrer">图文页</a>
            </div>
          </div>
        </div>
      </Spin>
    </Drawer>
  </div>
</template>
