<script setup lang="ts">
import { computed, nextTick, ref, reactive, watch } from 'vue';
import { Button, Form, FormItem, RadioGroup, Select, Switch, Tooltip, Row, Col, message } from 'antdv-next';
import { IconifyIcon as Icon } from '@vben/icons';

import AppField from '#/components/AppField.vue';
import AppFreeDate from '#/components/app-free-date/index.vue';
import AIGenerateImageModal from '#/components/AIGenerateImageModal.vue';

import Resource from '#/api/resource';
import { requestClient } from '#/api/request';

const props = defineProps({
  /** 表单数据对象（v-model） */
  modelValue: {
    type: Object,
    default: () => ({})
  },
  /** 所有字段配置（可选，如果提供了 fields 则优先使用 fields） */
  allFields: {
    type: Array,
    default: () => []
  },
  /** 排除的字段 */
  excludeFields: {
    type: Array,
    default: () => []
  },
  /** 直接传入的字段列表（优先级最高） */
  fields: {
    type: Array,
    default: () => []
  },
  /** 必填字段列表 */
  requiredFields: {
    type: Array,
    default: () => ['name']
  },
  /** 是否显示智能识别区域 */
  showParse: {
    type: Boolean,
    default: true
  },
  /** 解析加载状态 */
  parseLoading: {
    type: Boolean,
    default: false
  },
  /** 表单保存加载状态 */
  saving: {
    type: Boolean,
    default: false
  },
  /** 是否显示 AI 生图入口（仅在 avatar 字段显示） */
  showAIGenerate: {
    type: Boolean,
    default: false
  },
  /** 当前编辑的成员数据（用于 AI 生图参考图） */
  memberData: {
    type: Object,
    default: () => ({})
  },
  /** 表单 ref（用于 validate） */
  formRef: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['update:modelValue', 'parse', 'fileSelect', 'save', 'aiGenerate']);

// ==================== 本地表单数据 ====================
const localForm = reactive({
  id: '',
  name: '',
  avatar: '',
  gender: 1,
  birth_date: '',
  birth_date_precision: 3,
  is_living: 1,
  death_date: '',
  death_date_precision: 3,
  bio: '',
  region: null,
  address: '',
  native_region: null,
  native_address: '',
  father_id: '',
  mother_id: '',
  start_date: '',
  end_date: '',
});

// 保留外部传入的原始数据
const originalData = ref({});

// 头像字段引用
const avatarFieldRef = ref(null);

// ==================== 智能识别 ====================
const parseText = ref('');

// 计算属性：过滤后的字段（优先使用 props.fields）
const displayedFields = computed(() => {
  // 如果直接提供了 fields，优先使用
  if (props.fields && props.fields.length > 0) {
    return props.fields;
  }
  // 否则使用 allFields + excludeFields
  return props.allFields.filter((f: any) => props.excludeFields.indexOf(f.field) === -1);
});

// 监听外部 modelValue 变化
watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal) {
      originalData.value = { ...newVal };
      // 同步到 localForm
      Object.keys(newVal).forEach(key => {
        if (localForm[key] !== undefined || newVal[key] !== undefined) {
          localForm[key] = newVal[key];
        }
      });
    }
  },
  { immediate: true, deep: true }
);

// 监听 localForm 变化，同步到外部
watch(
  localForm,
  (newVal) => {
    emit('update:modelValue', { ...originalData.value, ...newVal });
  },
  { deep: true }
);

// ==================== 日期处理 ====================
const datePrecisions = {
  1: 'year',
  2: 'month',
  3: 'date',
};
const datePrecisionNumbers = {
  year: 1,
  month: 2,
  date: 3,
};

function handleDateChange(fieldName: string, e: any, targetData?: any) {
  const data = targetData || localForm;
  data[fieldName] = e.value;
  data[`${fieldName}_precision`] = datePrecisionNumbers[e.precision] || 1;
}

// ==================== 解析功能 ====================
async function handleParse() {
  if (!parseText.value.trim()) return;
  emit('parse', { text: parseText.value.trim() });
  parseText.value = '';
}

async function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0] || null;
  if (file) {
    emit('fileSelect', file);
  }
  (e.target as HTMLInputElement).value = '';
}

// ==================== AI 生图 ====================
const aiGenerateRef = ref<any>(null);
const aiRefImages = ref<Array<{ name: string; avatar: string }>>([]);

function openAIGenerate() {
  // 收集参考图
  aiRefImages.value = [];
  const currentData = props.memberData || {};

  if (currentData.father?.avatar) {
    aiRefImages.value.push({
      name: currentData.father?.name || '',
      avatar: currentData.father.avatar,
    });
  }

  if (currentData.mother?.avatar) {
    aiRefImages.value.push({
      name: currentData.mother?.name || '',
      avatar: currentData.mother.avatar,
    });
  }

  nextTick(() => {
    aiGenerateRef.value?.open();
  });
}

function handleAIGenerateSelect(imageUrl: string) {
  localForm.avatar = imageUrl;
  aiGenerateRef.value?.close();
  message.success('已应用生成的图片，请点击提交保存');
}

// ==================== 表单验证 ====================
function validate() {
  for (const field of props.requiredFields) {
    if (field === 'name' && !localForm.name?.trim()) {
      return '请输入姓名';
    }
  }
  return '';
}

// ==================== 暴露方法 ====================
async function uploadAvatar() {
  if (avatarFieldRef.value?.fieldRef?.upload) {
    await avatarFieldRef.value.fieldRef.upload();
    return avatarFieldRef.value.fieldRef.list?.value?.map((f: any) => f.url).filter((u: string) => u?.startsWith('http'))?.[0] || localForm.avatar;
  }
  return null;
}

defineExpose({
  localForm,
  validate,
  aiGenerateRef,
  uploadAvatar
});
</script>

<template>
  <div class="person-form">
    <!-- 智能识别区域 -->
    <div v-if="showParse" class="parse-section mb-4 rounded-xl border border-blue-200/70 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 overflow-hidden">
      <!-- 标题栏 -->
      <div class="flex items-center gap-2 px-4 py-2.5 bg-white/60 border-b border-blue-100">
        <Icon icon="mdi:text-recognition" class="text-blue-500 text-base" />
        <span class="text-sm font-semibold text-gray-700">智能识别</span>
        <span class="text-xs text-gray-400 ml-1">粘贴文本或上传图片，自动填充表单</span>
      </div>
      <!-- 输入区 -->
      <div class="relative px-3 pb-2 pt-1.5">
        <!-- loading 遮罩 -->
        <transition name="parse-fade">
          <div v-if="parseLoading"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/85 backdrop-blur-sm">
            <div class="parse-spinner"></div>
            <div class="text-center">
              <div class="text-sm font-medium text-blue-600">正在识别中...</div>
            </div>
          </div>
        </transition>
        <textarea v-model="parseText" rows="2" placeholder="在此粘贴成员信息（如身份证、户口本等识别内容）..."
          :disabled="parseLoading"
          class="w-full resize-y rounded-md border border-gray-200 bg-white px-2.5 py-2 text-sm leading-relaxed text-gray-700
            placeholder:text-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors" />
        <!-- 按钮组在右下角 -->
        <div class="flex items-center justify-end gap-1 mt-1">
          <label class="parse-img-btn group cursor-pointer" title="上传图片自动识别">
            <input type="file" accept="image/*" class="hidden" :disabled="parseLoading" @change="onFileSelect" />
            <svg viewBox="0 0 24 24" class="w-4 h-4 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
          </label>
          <button type="button" class="parse-submit-btn" :disabled="parseLoading || !parseText.trim()"
            @click="handleParse()">
            <template v-if="!parseLoading">识别</template>
            <template v-else>
              <span class="parse-btn-spinner"></span>识别中
            </template>
          </button>
        </div>
      </div>
    </div>

    <!-- 表单区域 -->
    <Form :model="localForm" :colon="false" layout="vertical">
      <Row :gutter="16">
        <Col v-for="field in displayedFields" :key="field.field" :span="field.span || 12">
          <FormItem v-if="['birth_date','death_date'].includes(field.field)" :label="field.label">
            <AppFreeDate v-model="localForm[field.field]" 
              :precision="datePrecisions[localForm[`${field.field}_precision`]] || 'date'" 
              :start-year="1" :end-year="new Date().getFullYear()"
              @change="(e)=>handleDateChange(field.field,e,localForm)" />
          </FormItem>
          <AppField v-else :ref="(el: any) => {
            if (field.field === 'avatar') avatarFieldRef = el;
          }"
            :field="field" :model-value="localForm[field.field]"
            @update:model-value="localForm[field.field] = $event"
            :class="field.field === 'avatar' ? 'avatar-field-with-ai' : ''"
          >
            <!-- AI 生图入口 -->
            <template v-if="field.field === 'avatar' && showAIGenerate" #add-extra>
              <Tooltip title="AI 智能生成头像">
                <button
                  type="button"
                  class="ai-generate-entry absolute bottom-0 right-0"
                  @click="openAIGenerate()"
                >
                  <Icon icon="mdi:auto-fix" class="entry-icon" />
                  <span class="entry-label">AI 生图</span>
                </button>
              </Tooltip>
            </template>
          </AppField>
        </Col>
      </Row>
    </Form>

    <!-- AI 生图 Modal -->
    <AIGenerateImageModal
      v-if="showAIGenerate"
      ref="aiGenerateRef"
      :member-data="memberData"
      :reference-images="aiRefImages"
      @select="handleAIGenerateSelect"
    />
  </div>
</template>

<style scoped>
/* ============ 智能识别区域样式 ============ */
.parse-fade-enter-active,
.parse-fade-leave-active {
  transition: opacity 0.2s ease;
}
.parse-fade-enter-from,
.parse-fade-leave-to {
  opacity: 0;
}

.parse-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(59, 130, 246, 0.15);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: parse-spin 0.7s linear infinite;
}

@keyframes parse-spin {
  to { transform: rotate(360deg); }
}

.parse-img-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  color: #64748b;
  transition: all 0.15s ease;
}

.parse-img-btn:hover {
  background: #f1f5f9;
  border-color: #3b82f6;
  color: #3b82f6;
}

.parse-submit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 16px;
  border-radius: 8px;
  background: #3b82f6;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.parse-submit-btn:hover:not(:disabled) {
  background: #2563eb;
}

.parse-submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.parse-btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: parse-spin 0.6s linear infinite;
}

/* ============ AI 生图入口样式 ============ */
.ai-generate-entry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.ai-generate-entry:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.entry-icon {
  font-size: 14px;
}

.avatar-field-with-ai {
  position: relative;
}
</style>
