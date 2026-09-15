<script setup>
/**
 * 内容发布到应用：全局一次创作，按应用多选发布。
 * resource: 'articles' | 'categories'；空选 = 全部取消发布。
 */
import { computed, ref, watch } from 'vue';

import { Checkbox, CheckboxGroup, message, Modal, Tag } from 'antdv-next';

import { requestClient } from '#/api/request';

const props = defineProps({
  open: { type: Boolean, default: false },
  resource: { type: String, required: true },
  contentId: { type: [Number, String], default: null },
  contentTitle: { type: String, default: '' },
  initialIds: { type: Array, default: () => [] },
  applications: { type: Array, default: () => [] },
  // 建议应用（如列表正按某应用筛选）：打开时自动勾选（可见、可手动取消）
  suggestedAppId: { type: [Number, String], default: null },
});

const emit = defineEmits(['update:open', 'saved']);

const typeMap = { 1: '官网', 2: '小程序', 3: '公众号' };
const typeColor = { 1: 'blue', 2: 'green', 3: 'purple' };

const checked = ref([]);
const saving = ref(false);

const allIds = computed(() => (props.applications || []).map((a) => Number(a.id)));

/** 建议应用名称（自动勾选时提示来源） */
const suggestedAppName = computed(() => {
  const id = Number(props.suggestedAppId);
  if (!Number.isSafeInteger(id) || id <= 0) return '';
  return (props.applications || []).find((a) => Number(a?.id) === id)?.name || '';
});const allChecked = computed(
  () => checked.value.length > 0 && checked.value.length === allIds.value.length,
);
const indeterminate = computed(
  () => checked.value.length > 0 && checked.value.length < allIds.value.length,
);

watch(
  () => props.open,
  (open) => {
    if (open) {
      const ids = new Set((props.initialIds || []).map((id) => Number(id)));
      const suggested = Number(props.suggestedAppId);
      if (Number.isSafeInteger(suggested) && suggested > 0) {
        ids.add(suggested);
      }
      checked.value = [...ids].filter((id) => Number.isSafeInteger(id) && id > 0);
    }
  },
  { immediate: true },
);

function close() {
  emit('update:open', false);
}

function toggleAll() {
  checked.value = allChecked.value ? [] : [...allIds.value];
}

function clearAll() {
  checked.value = [];
}

async function save() {
  const id = Number(props.contentId);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  saving.value = true;
  try {
    const body = await requestClient.put(`/${props.resource}/${id}/publications`, {
      application_ids: checked.value,
    });
    // requestClient 默认返回 body.data；兼容 Resource 的 body 形态
    const data = body?.data ?? body ?? {};
    message.success(
      checked.value.length === 0
        ? '已取消全部发布'
        : `已发布到 ${checked.value.length} 个应用`,
    );
    emit('saved', data?.published_applications ?? []);
    close();
  } catch (error) {
    console.error(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="`发布到应用${contentTitle ? ` - ${contentTitle}` : ''}`"
    :confirm-loading="saving"
    ok-text="保存发布"
    cancel-text="取消"
    width="520"
    @ok="save"
    @cancel="close"
  >
    <div class="mb-3 flex items-center justify-between">
      <span class="text-sm text-gray-500">
        已选 {{ checked.length }} / {{ applications.length }} 个应用（不选 = 全部取消发布）
      </span>
      <span class="flex gap-2">
        <a class="text-sm text-blue-500" @click="toggleAll">
          {{ allChecked ? '取消全选' : '全选' }}
        </a>
        <a class="text-sm text-gray-400" @click="clearAll">清空</a>
      </span>
    </div>
    <div v-if="suggestedAppName" class="mb-3 text-xs text-blue-500">
      已按当前应用「{{ suggestedAppName }}」自动勾选，可手动调整
    </div>
    <CheckboxGroup v-model:value="checked" class="publish-checks">
      <div
        v-for="app in applications"
        :key="String(app.id)"
        class="publish-item"
        :class="{ 'is-checked': checked.includes(Number(app.id)) }"
      >
        <Checkbox :value="Number(app.id)">
          <span class="publish-name">{{ app.name }}</span>
        </Checkbox>
        <span class="publish-side">
          <Tag
            v-if="app.type"
            :color="typeColor[app.type] || 'default'"
            class="m-0"
          >
            {{ typeMap[app.type] || '' }}
          </Tag>
          <span v-if="app.code" class="publish-code">{{ app.code }}</span>
        </span>
      </div>
      <div v-if="!applications.length" class="py-6 text-center text-gray-400">
        暂无应用，请先创建应用
      </div>
    </CheckboxGroup>
  </Modal>
</template>

<style scoped>
.publish-checks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-height: 360px;
  overflow-y: auto;
}

.publish-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  cursor: pointer;
}

.publish-item.is-checked {
  border-color: #1677ff;
  background: rgba(22, 119, 255, 0.04);
}

.publish-name {
  font-size: 14px;
  color: rgba(0, 0, 0, 0.85);
}

.publish-side {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.publish-code {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
