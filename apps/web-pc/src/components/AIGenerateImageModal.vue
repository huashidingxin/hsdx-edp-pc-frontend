<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, Input, Image, Spin, message } from 'antdv-next';
import { IconifyIcon as Icon } from '@vben/icons';
import { useVbenModal } from '@vben/common-ui';
import { useAppStore } from '#/store/app';

import Resource from '#/api/resource';
import AppUpload from './AppUpload.vue';

const Textarea = (Input as any).TextArea;
const appStore = useAppStore();

const props = defineProps<{
  /** 当前成员数据 */
  memberData?: Record<string, any>;
}>();

const emit = defineEmits<{
  (e: 'select', imageUrl: string): void;
}>();

// ========== 风格图标映射 ==========
const styleIconMap: Record<string, string> = {
  'oil-painting': 'mdi:palette-outline',
  'watercolor': 'mdi:water-outline',
  '素描': 'mdi:drawing',
  '古风': 'mdi:image-frame',
  '写实': 'mdi:camera-outline',
  'cartoon': 'mdi:emoticon-outline',
};

// ========== 风格列表（从全局配置获取）==========
const styleOptions = computed(() => {
  const config = appStore.setting?.ai_avatar_styles;

  let parsedConfig = null;

  if (typeof config === 'string') {
    try {
      parsedConfig = JSON.parse(config);
    } catch (e) {
      console.warn('解析 ai_avatar_styles 失败，使用默认配置', e);
      parsedConfig = null;
    }
  } else if (Array.isArray(config)) {
    parsedConfig = config;
  }

  if (Array.isArray(parsedConfig) && parsedConfig.length > 0) {
    const validOptions = parsedConfig.filter((item: any) => item && item.label && item.value);
    if (validOptions.length > 0) {
      return validOptions;
    }
  }

  return [
    { label: '素描', value: '素描' },
    { label: '写实', value: '写实' },
    { label: '古风', value: '古风' },
  ];
});

// ========== 表单数据 ==========
const selectedStyle = ref<string>('素描');
const description = ref('');
const negativePrompt = ref('');
const showAdvanced = ref(false);
const generating = ref(false);
const generatedImageUrl = ref('');
const generatedImageBlob = ref<Blob | null>(null);

// ========== 上传组件引用 ==========
const uploadRef = ref<InstanceType<typeof AppUpload> | null>(null);

// ========== 生成图片 ==========
async function handleGenerate() {
  if (!description.value.trim()) {
    message.warning('请输入描述');
    return;
  }

  generating.value = true;
  generatedImageUrl.value = '';
  generatedImageBlob.value = null;

  try {
    // 先上传参考图片（如果有）
    let referenceImageUrls: string[] = [];
    if (uploadRef.value) {
      const uploadResult = await uploadRef.value.upload();
      // upload 返回的是更新后的 list
      referenceImageUrls = uploadResult
        .filter((item: any) => item.url && item.url.startsWith('http'))
        .map((item: any) => item.url);
    }

    const api = new Resource('ai/generate-avatar');
    const response: any = await api.store({
      prompt: `中国人，性别：${props.memberData?.gender == 1 ? '男' : '女'}，${description.value}`,
      style: selectedStyle.value || undefined,
      reference_images: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
      negative_prompt: negativePrompt.value || undefined,
      width: 512,
      height: 720,
    });

    const data = response.data || response;

    if (data.url) {
      generatedImageUrl.value = data.url;
    } else if (data.base64) {
      const base64Str = data.base64;
      const base64Data = base64Str.includes(',') ? (base64Str.split(',')[1] || base64Str) : base64Str;
      const byteCharacters = atob(base64Data);
      const byteNumbers = new ArrayBuffer(byteCharacters.length);
      const byteArray = new Uint8Array(byteNumbers);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: 'image/png' });
      generatedImageBlob.value = blob;
      generatedImageUrl.value = URL.createObjectURL(blob);
    }

    message.success('图片生成成功');
  } catch (error: any) {
    message.error(error.message || '图片生成失败');
  } finally {
    generating.value = false;
  }
}

function handleSelectImage() {
  if (!generatedImageUrl.value) return;
  emit('select', generatedImageUrl.value);
  modalApi.close();
}

function resetForm() {
  selectedStyle.value = '素描';
  description.value = '';
  negativePrompt.value = '';
  showAdvanced.value = false;
  generatedImageUrl.value = '';
  generatedImageBlob.value = null;
}

function getStyleIcon(value: string): string {
  return styleIconMap[value] || 'mdi:image-outline';
}

const [ModalComponent, modalApi] = useVbenModal({
  onOpened: () => {
    resetForm();
  },
  onClosed: () => {
    if (generatedImageUrl.value.startsWith('blob:')) {
      URL.revokeObjectURL(generatedImageUrl.value);
    }
  },
});

defineExpose({
  open: () => modalApi.open(),
  close: () => modalApi.close(),
});
</script>

<template>
  <ModalComponent
    title="AI 生成头像"
    :show-confirm-button="false"
    :show-cancel-button="false"
    width="980px"
    class="ai-generate-image-modal"
  >
    <div class="ai-modal-body">
      <!-- 左侧：配置区域 -->
      <div class="ai-config-panel">
        <!-- 风格选择 -->
        <div class="config-section">
          <div class="section-header">
            <Icon icon="mdi:palette-swatch-outline" class="section-icon" />
            <span class="section-title">选择风格</span>
            <span class="section-hint">选填</span>
          </div>
          <div class="style-grid">
            <div
              v-for="style in styleOptions"
              :key="style.value"
              class="style-card"
              :class="{ 'style-card--active': selectedStyle === style.value }"
              @click="selectedStyle = selectedStyle === style.value ? '' : style.value"
            >
              <div class="style-card-icon">
                <Icon :icon="getStyleIcon(style.value)" />
              </div>
              <span class="style-card-label">{{ style.label }}</span>
            </div>
          </div>
        </div>

        <!-- 描述输入 -->

        <div class="config-section">
          <div class="section-header">
            <Icon icon="mdi:text-box-edit-outline" class="section-icon" />
            <span class="section-title">描述提示词</span>
            <span class="section-hint">必填</span>
          </div>
          <Textarea
            v-model:value="description"
            placeholder="例如：一位慈祥的老爷爷，穿着传统中式服装，面带微笑"
            :rows="3"
            :maxlength="500"
            show-count
            class="ai-textarea"
          />
        </div>

        <!-- 参考图片上传 -->
        <div class="config-section">
          <div class="section-header">
            <Icon icon="mdi:image-outline" class="section-icon" />
            <span class="section-title">参考图片</span>
            <span class="section-hint">选填，上传参考图片</span>
          </div>
          <AppUpload
            ref="uploadRef"
            file-type="image"
            :multiple="false"
            :max="1"
            scene="ai-reference"
          />
        </div>

        <!-- 高级选项 -->
        <div class="config-section">
          <div
            class="advanced-toggle"
            @click="showAdvanced = !showAdvanced"
          >
            <Icon
              :icon="showAdvanced ? 'mdi:chevron-up' : 'mdi:chevron-down'"
              class="toggle-icon"
            />
            <span>高级选项</span>
          </div>
          <div v-show="showAdvanced" class="advanced-content">
            <div class="section-header" style="margin-top: 0;">
              <Icon icon="mdi:block-helper" class="section-icon" />
              <span class="section-title">负面提示词</span>
              <span class="section-hint">不希望出现的内容</span>
            </div>
            <Textarea
              v-model:value="negativePrompt"
              placeholder="例如：变形、皱纹"
              :rows="2"
              :maxlength="200"
              show-count
              class="ai-textarea"
            />
          </div>
        </div>

        <!-- 生成按钮 -->
        <Button
          type="primary"
          block
          size="large"
          :loading="generating"
          :disabled="!description.trim()"
          @click="handleGenerate"
          class="generate-btn"
        >
          <template #icon><Icon icon="mdi:auto-fix" /></template>
          {{ generating ? 'AI 正在生成中...' : '开始生成头像' }}
        </Button>


      </div>

      <!-- 右侧：预览区域 -->
      <div class="ai-preview-panel">
        <div class="preview-header">
          <Icon icon="mdi:image-multiple-outline" class="section-icon" />
          <span class="section-title">生成结果</span>
        </div>

        <Spin :spinning="generating" tip="AI 正在生成..." class="preview-spin">
          <div class="preview-stage">
            <!-- 空状态 -->
            <div v-if="!generatedImageUrl && !generating" class="preview-empty">
              <div class="empty-illustration">
                <Icon icon="mdi:robot-outline" />
              </div>
              <p class="empty-title">AI 生成区</p>
              <p class="empty-desc">填写左侧描述并点击生成<br />AI 将为您创作专属头像</p>
            </div>

            <!-- 已生成图片 -->
            <div v-if="generatedImageUrl" class="preview-result">
              <div class="result-image-wrap">
                <Image
                  :src="generatedImageUrl"
                  :preview="false"
                  class="result-image"
                />
                <div class="result-glow" />
              </div>
            </div>
          </div>
        </Spin>

        <!-- 操作按钮 -->
        <div v-if="generatedImageUrl" class="preview-actions">
          <Button
            size="large"
            class="action-btn action-btn--retry"
            @click="generatedImageUrl = ''; generatedImageBlob = null;"
          >
            <template #icon><Icon icon="mdi:refresh" /></template>
            重新生成
          </Button>
          <Button
            type="primary"
            size="large"
            class="action-btn action-btn--confirm"
            @click="handleSelectImage"
          >
            <template #icon><Icon icon="mdi:check-circle-outline" /></template>
            采用此头像
          </Button>
        </div>
                <!-- AI 免责提示语 -->
        <div class="ai-disclaimer">
          <Icon icon="mdi:information-outline" class="disclaimer-icon" />
          <span>AI 生成内容仅供参考，请遵守相关法律法规，禁止利用本工具生成涉政、涉黄、侵权或造谣等违规内容。</span>
        </div>
      </div>
    </div>
  </ModalComponent>
</template>

<style scoped>
/* ==================== 弹窗整体 ==================== */
.ai-modal-body {
  display: flex;
  gap: 32px;
  min-height: 520px;
}

::deep(.ant-modal-body) {
  padding: 28px 32px !important;
}

::deep(.ant-modal-header) {
  padding: 24px 32px 0 !important;
  border-bottom: none;
}

::deep(.ant-modal-title) {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

/* ==================== 左侧配置面板 ==================== */
.ai-config-panel {
  flex: 1;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.config-section {
  padding: 14px 16px;
  background: #fafbfc;
  border-radius: 10px;
  border: 1px solid #f0f0f5;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.section-icon {
  font-size: 16px;
  color: #00bc7d;
  flex-shrink: 0;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.section-hint {
  font-size: 11px;
  color: #94a3b8;
  margin-left: auto;
  background: #f1f5f9;
  padding: 1px 8px;
  border-radius: 10px;
  line-height: 20px;
}

/* ==================== 风格卡片 ==================== */
.style-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.style-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px 8px;
  border-radius: 8px;
  border: 1.5px solid transparent;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.style-card:hover {
  border-color: #86efac;
  background: #f0fdf4;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 188, 125, 0.06);
}

.style-card--active {
  border-color: #00bc7d;
  background: #fefff9;
  box-shadow: 0 0 0 2px rgba(0, 188, 125, 0.08);
}

.style-card-icon {
  font-size: 22px;
  color: #00bc7d;
  line-height: 1;
}

.style-card--active .style-card-icon {
  color: #059669;
}

.style-card-label {
  font-size: 12px;
  color: #475569;
  font-weight: 500;
  white-space: nowrap;
}

.style-card--active .style-card-label {
  color: #047857;
  font-weight: 600;
}

/* ==================== 输入框 ==================== */
.ai-textarea {
  border-radius: 8px;
  font-size: 13px;
}

::deep(.ai-textarea textarea) {
  border-radius: 8px;
  border-color: #e2e8f0;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}

::deep(.ai-textarea textarea:hover) {
  border-color: #86efac;
}

::deep(.ai-textarea textarea:focus) {
  border-color: #00bc7d;
  box-shadow: 0 0 0 3px rgba(0, 188, 125, 0.08);
}

/* ==================== 高级选项 ==================== */
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #00bc7d;
  cursor: pointer;
  font-weight: 500;
  user-select: none;
  padding: 2px 0;
  transition: color 0.2s;
}

.advanced-toggle:hover {
  color: #059669;
}

.toggle-icon {
  font-size: 16px;
  transition: transform 0.2s;
}

.advanced-content {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e2e8f0;
}

/* ==================== 生成按钮 ==================== */
.generate-btn {
  height: 48px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 10px;
  background: linear-gradient(135deg, #00bc7d 0%, #0d9488 100%);
  border: none;
  box-shadow: 0 4px 14px rgba(0, 188, 125, 0.2);
  transition: all 0.3s ease;
  margin-top: 8px;
}

.generate-btn:hover {
  background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
  box-shadow: 0 6px 20px rgba(0, 188, 125, 0.3);
  transform: translateY(-1px);
}

.generate-btn:active {
  transform: translateY(0);
}

.generate-btn:disabled {
  background: #e2e8f0;
  box-shadow: none;
  color: #94a3b8;
}

::deep(.generate-btn .ant-btn-loading-icon) {
  color: #fff;
}

/* ==================== 右侧预览面板 ==================== */
.ai-preview-panel {
  flex: 1;
  max-width: 420px;
  display: flex;
  flex-direction: column;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  padding-left: 4px;
}

.preview-spin {
  flex: 1;
  display: flex;
}

::deep(.preview-spin .ant-spin-container) {
  flex: 1;
  display: flex;
}

::deep(.preview-spin .ant-spin-nested-loading) {
  flex: 1;
  display: flex;
}

.preview-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: linear-gradient(145deg, #fafbfc 0%, #f5f6f8 30%, #f8f9fa 60%, #fafbfc 100%);
  border: 2px dashed #d1d5db;
  min-height: 380px;
  overflow: hidden;
  position: relative;
}

/* 空状态 */
.preview-empty {
  text-align: center;
  padding: 40px 20px;
}

.empty-illustration {
  font-size: 56px;
  color: #cbd5e1;
  margin-bottom: 16px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: #475569;
  margin: 0 0 8px;
}

.empty-desc {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.6;
}

/* 已生成结果 */
.preview-result {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 20px;
}

.result-image-wrap {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 188, 125, 0.15), 0 2px 8px rgba(0, 0, 0, 0.06);
}

.result-image {
  display: block;
  max-width: 220px;
  max-height: 340px;
  border-radius: 14px;
}

.result-glow {
  position: absolute;
  inset: -2px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(0, 188, 125, 0.1), rgba(5, 150, 105, 0.1));
  pointer-events: none;
  z-index: -1;
}

::deep(.preview-stage .ant-image) {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 操作按钮 */
.preview-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  padding: 0 4px;
}

.action-btn {
  flex: 1;
  height: 44px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 10px;
  transition: all 0.25s ease;
}

.action-btn--retry {
  border: 1.5px solid #e2e8f0;
  color: #475569;
  background: #fff;
}

.action-btn--retry:hover {
  border-color: #86efac;
  color: #00bc7d;
  background: #f0fdf4;
}

.action-btn--confirm {
  background: linear-gradient(135deg, #00bc7d 0%, #0d9488 100%);
  border: none;
  box-shadow: 0 4px 12px rgba(0, 188, 125, 0.2);
}

.action-btn--confirm:hover {
  background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
  box-shadow: 0 6px 18px rgba(0, 188, 125, 0.3);
  transform: translateY(-1px);
}

/* ==================== Spinner覆写 ==================== */
::deep(.ant-spin-dot) {
  font-size: 32px;
}

::deep(.ant-spin-dot-item) {
  background-color: #00bc7d !important;
}

::deep(.ant-spin-text) {
  color: #00bc7d;
  font-size: 13px;
  margin-top: 8px;
}
/* ==================== AI 免责提示语 ==================== */
.ai-disclaimer {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  margin-top: 12px;
  font-size: 12px;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  line-height: 1.6;
}

.disclaimer-icon {
  font-size: 18px;
  color: #94a3b8;
  flex-shrink: 0;
  margin-top: 1px;
}
</style>
