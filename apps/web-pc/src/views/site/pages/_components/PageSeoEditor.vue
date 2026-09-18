<script setup>
import { computed, ref, watch } from 'vue';

import {
  Button,
  Card,
  Form,
  FormItem,
  Input,
  Spin,
  Tag,
  message,
} from 'antdv-next';

import { requestClient } from '#/api/request';
import AppUpload from '#/components/AppUpload.vue';

const props = defineProps({
  pageId: { type: [Number, String], required: true },
  locale: { type: String, required: true },
  pageCode: { type: String, default: '' },
});

const emit = defineEmits(['saved']);

const loading = ref(false);
const saving = ref(false);
const form = ref({
  title: '',
  slug: '',
  seo_title: '',
  seo_keywords: '',
  seo_description: '',
  og_image: null,
});

async function load() {
  if (!props.pageId || !props.locale) return;
  loading.value = true;
  try {
    const res = await requestClient.get(
      `/pages/${props.pageId}/locales/${props.locale}`,
    );
    const data = res?.data ?? res ?? {};
    form.value = {
      title: data.title || '',
      slug: data.slug || '',
      seo_title: data.seo_title || '',
      seo_keywords: data.seo_keywords || '',
      seo_description: data.seo_description || '',
      og_image: data.og_image || null,
    };
  } catch (err) {
    console.error('Failed to load page locale:', err);
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.value.slug?.trim()) {
    message.warning('请填写页面 URL 路径 (slug)');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      title: form.value.title || '',
      slug: form.value.slug.trim(),
      seo_title: form.value.seo_title || undefined,
      seo_keywords: form.value.seo_keywords || undefined,
      seo_description: form.value.seo_description || undefined,
      og_image: form.value.og_image || undefined,
    };
    await requestClient.put(
      `/pages/${props.pageId}/locales/${props.locale}`,
      payload,
    );
    message.success(`已保存 [${props.locale}] SEO 与基本设置`);
    emit('saved', { locale: props.locale, ...payload });
  } catch (err) {
    message.error(err?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

watch(
  () => [props.pageId, props.locale],
  () => {
    load();
  },
  { immediate: true },
);
</script>

<template>
  <Spin :spinning="loading">
    <div class="page-seo-editor grid grid-cols-1 lg:grid-cols-12 gap-6 p-4">
      <!-- 表单区 -->
      <div class="lg:col-span-7">
        <Form layout="vertical">
          <div class="grid grid-cols-2 gap-4">
            <FormItem label="页面标题 (Title)" required>
              <Input
                v-model:value="form.title"
                placeholder="例如：关于我们 / 首页"
              />
            </FormItem>
            <FormItem label="URL 路径 (Slug)" required>
              <Input
                v-model:value="form.slug"
                placeholder="例如：about / home（首页通常为空或 home）"
              />
            </FormItem>
          </div>

          <FormItem label="SEO 页面标题 (SEO Title)">
            <Input
              v-model:value="form.seo_title"
              placeholder="留空时默认使用上方页面标题"
            />
          </FormItem>

          <FormItem label="SEO 关键词 (Keywords)">
            <Input
              v-model:value="form.seo_keywords"
              placeholder="以英文逗号分隔，如：磨具, 砂轮, 金刚石"
            />
          </FormItem>

          <FormItem label="SEO 摘要描述 (Meta Description)">
            <Input.TextArea
              v-model:value="form.seo_description"
              :rows="3"
              placeholder="简要概括本页面核心内容，建议 80~150 字符以内..."
            />
          </FormItem>

          <FormItem label="社交分享封面图 (OG Image)">
            <AppUpload
              v-model:value="form.og_image"
              accept="image/*"
              :max-count="1"
            />
            <div class="text-xs text-gray-400 mt-1">
              建议尺寸 1200x630，在微信、Facebook、Twitter 分享时作为预览大图展现。
            </div>
          </FormItem>

          <div class="mt-4">
            <Button type="primary" :loading="saving" @click="save">
              保存 SEO 与语言配置
            </Button>
          </div>
        </Form>
      </div>

      <!-- 实时预览区 -->
      <div class="lg:col-span-5 flex flex-col gap-4">
        <Card size="small" title="🔍 搜索引擎收录预览 (SERP Mockup)">
          <div class="serp-preview">
            <div class="serp-url">
              https://example.com/{{ locale }}/{{ form.slug || pageCode }}
            </div>
            <div class="serp-title">
              {{ form.seo_title || form.title || pageCode || '页面标题' }} - 网站品牌名
            </div>
            <div class="serp-desc">
              {{
                form.seo_description ||
                '请在左侧填写 SEO 描述。一个吸引人且切合主题的描述能够大幅提升搜索点击率。'
              }}
            </div>
          </div>
        </Card>

        <Card size="small" title="📱 社交分享预览 (Open Graph Card)">
          <div class="og-card">
            <div class="og-image-box">
              <img
                v-if="form.og_image"
                :src="form.og_image"
                class="w-full h-36 object-cover"
                alt="OG"
              />
              <div
                v-else
                class="w-full h-36 bg-gray-100 flex items-center justify-center text-gray-400 text-xs"
              >
                未设置封面图 (默认显示网站 LOGO)
              </div>
            </div>
            <div class="p-3 bg-gray-50 border-t border-gray-100">
              <div class="font-medium text-sm text-gray-800 line-clamp-1">
                {{ form.seo_title || form.title || pageCode }}
              </div>
              <div class="text-xs text-gray-500 mt-1 line-clamp-2">
                {{ form.seo_description || '暂无描述' }}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  </Spin>
</template>

<style scoped>
.page-seo-editor {
  background: #fff;
  border-radius: 8px;
}

.serp-preview {
  font-family: Arial, sans-serif;
  padding: 10px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.serp-url {
  font-size: 12px;
  color: #202124;
  margin-bottom: 2px;
  word-break: break-all;
}

.serp-title {
  font-size: 16px;
  color: #1a0dab;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: 4px;
}

.serp-title:hover {
  text-decoration: underline;
}

.serp-desc {
  font-size: 13px;
  color: #4d5156;
  line-height: 1.4;
}

.og-card {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}
</style>
