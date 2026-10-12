<script setup>
/**
 * 公众号手机视口预览。
 *
 * 样式口径与 AppEditor 内置的「文档排版预览」保持一致（375 手机 / 677 公众号 / 宽屏），
 * 这样运营在编辑器里看到的排版和最终在微信里看到的是同一套视口宽度，不会出现
 * 「编辑器里好好的、发出去乱了」。
 *
 * 注意：预览区必须套 `vben-tiptap-content`，否则正文里的 h2/blockquote/列表
 * 拿不到排版样式，预览出来的效果与微信不一致。
 */
import { computed, ref } from 'vue';

const props = defineProps({
  html: { type: String, default: '' },
  title: { type: String, default: '' },
  author: { type: String, default: '' },
  digest: { type: String, default: '' },
  coverUrl: { type: String, default: '' },
  /** 预览视口：mobile=手机 375 / wechat=公众号正文 677 / full=宽屏 */
  device: { type: String, default: 'mobile' },
  /** 是否渲染公众号图文头部（标题/作者/时间） */
  header: { type: Boolean, default: true },
});

const emit = defineEmits(['update:device']);

const DEVICES = [
  { value: 'mobile', label: '手机 375', icon: '📱' },
  { value: 'wechat', label: '公众号 677', icon: '📰' },
  { value: 'full', label: '宽屏', icon: '💻' },
];

// 预览用的「发布时间」：真实值由父级给不到（发布后才产生），这里只做版式占位，
// 用固定日期避免每次渲染都变、干扰视觉比对。
const previewDate = ref('2026-10-12');

const frameClass = computed(() => {
  if (props.device === 'mobile') {
    return 'max-w-[375px] rounded-[2.5rem] border-[6px] border-slate-800 p-5 min-h-[667px]';
  }
  if (props.device === 'wechat') {
    return 'max-w-[677px] rounded-xl border border-border p-6 min-h-[500px]';
  }
  return 'max-w-full rounded-xl border border-border p-6 min-h-[500px]';
});

const hasHeader = computed(
  () =>
    props.header &&
    (props.title || props.author || props.digest || props.coverUrl),
);
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 视口切换 -->
    <div
      class="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2"
    >
      <span class="text-xs font-semibold text-foreground">公众号效果预览</span>
      <div
        class="flex items-center gap-1 rounded-lg border border-border/80 bg-background/80 p-0.5 text-xs shadow-xs"
      >
        <button
          v-for="item in DEVICES"
          :key="item.value"
          type="button"
          class="rounded-md px-2.5 py-1 font-medium transition-colors"
          :class="
            device === item.value
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="emit('update:device', item.value)"
        >
          {{ item.icon }} {{ item.label }}
        </button>
      </div>
    </div>

    <!-- 视口内容 -->
    <div
      class="flex flex-1 justify-center overflow-y-auto bg-muted/20 p-4"
    >
      <div
        class="w-full bg-card shadow-xl transition-all duration-300"
        :class="frameClass"
      >
        <!-- 手机状态栏装饰 -->
        <div
          v-if="device === 'mobile'"
          class="mb-3 flex items-center justify-between border-b border-border/50 pb-3 text-[10px] text-muted-foreground select-none"
        >
          <span>9:41</span>
          <span class="size-2 rounded-full bg-slate-400"></span>
          <span>100%</span>
        </div>

        <!-- 公众号图文头部：标题 / 作者·时间 / 封面 / 摘要 -->
        <div v-if="hasHeader" class="mb-4">
          <h1
            v-if="title"
            class="mb-2 text-[22px] leading-[1.4] font-bold text-foreground"
          >
            {{ title }}
          </h1>
          <div
            v-if="author || previewDate"
            class="mb-3 flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span v-if="author">{{ author }}</span>
            <span v-if="author && previewDate">·</span>
            <span>{{ previewDate }}</span>
          </div>
          <img
            v-if="coverUrl"
            :src="coverUrl"
            alt=""
            class="mb-3 max-h-[200px] w-full rounded object-cover"
          />
          <p
            v-if="digest"
            class="rounded bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
          >
            {{ digest }}
          </p>
        </div>

        <div
          v-if="html"
          class="vben-tiptap-content"
          v-html="html"
        ></div>
        <p v-else class="py-12 text-center text-sm text-gray-400">
          暂无正文，点「重新生成」从源内容同步
        </p>
      </div>
    </div>
  </div>
</template>
