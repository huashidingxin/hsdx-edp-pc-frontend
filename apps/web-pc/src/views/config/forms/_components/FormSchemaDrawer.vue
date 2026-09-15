<script setup>
/**
 * 表单字段配置抽屉「内容组件」：抽屉壳由 list.vue 的 Vben Drawer 承载。
 *
 * 字段定义整体存在 forms.fields_schema（JSON），本组件编辑后一次性 PATCH 回后端，
 * 由 FormSchemaService::normalize 做服务端规约。
 */
import { ref, watch } from 'vue';

import { Button, message } from 'antdv-next';

import Resource from '#/api/resource';

import { normalizeSchemaInput } from './formSchema.js';

import FormSchemaEditor from './FormSchemaEditor.vue';

const props = defineProps({
  form: { type: Object, default: null },
});

const emit = defineEmits(['saved', 'close']);

const schema = ref(normalizeSchemaInput(null));
const saving = ref(false);

watch(
  () => props.form?.id,
  () => {
    schema.value = normalizeSchemaInput(props.form?.fields_schema);
  },
  { immediate: true },
);

async function save() {
  if (!props.form?.id) return;
  saving.value = true;
  try {
    await new Resource('forms').update(props.form.id, {
      fields_schema: schema.value,
    });
    message.success('字段已保存');
    emit('saved', schema.value);
    emit('close');
  } catch (error) {
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error?.message ||
      '字段保存失败';
    message.error(typeof msg === 'string' ? msg : '字段保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="p-1">
    <FormSchemaEditor v-model="schema" />

    <div class="mt-4 flex justify-end gap-2">
      <Button @click="emit('close')">取消</Button>
      <Button type="primary" :loading="saving" @click="save">保存</Button>
    </div>
  </div>
</template>
