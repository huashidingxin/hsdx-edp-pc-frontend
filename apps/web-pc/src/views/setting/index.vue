<script setup>
import { nextTick, onMounted, ref } from 'vue';

import { Button, Card, Col, Empty, Form, Row, Spin, message } from 'antdv-next';

import Resource from '#/api/resource';
import AppField from '#/components/AppField.vue';

const loading = ref(false);
const saving = ref(false);
const groups = ref([]);
const formData = ref({});
const fieldRefs = ref({});
const uploadTypes = new Set(['audio', 'file', 'image', 'video']);

async function loadSettings() {
  loading.value = true;
  try {
    const api = new Resource('settings/form');
    const { data } = await api.list({});

    groups.value = data?.groups || [];
    formData.value = { ...(data?.values || {}) };
  } catch (error) {
    console.error(error);
    message.error('加载系统配置失败');
  } finally {
    loading.value = false;
  }
}

function setFieldRef(field, el) {
  if (el) {
    fieldRefs.value[field] = el;
  } else {
    delete fieldRefs.value[field];
  }
}

function getFields() {
  return groups.value.flatMap((group) => group.fields || []);
}

async function uploadPendingFiles() {
  for (const field of getFields()) {
    if (!uploadTypes.has(field.type)) {
      continue;
    }

    const appFieldRef = fieldRefs.value[field.field];
    const uploadRef = appFieldRef?.fieldRef?.value || appFieldRef?.fieldRef;
    if (uploadRef?.upload) {
      await uploadRef.upload();
    }
  }

  await nextTick();
}

async function submit() {
  saving.value = true;
  try {
    await uploadPendingFiles();

    const api = new Resource('settings');
    const { data } = await api.store({ settings: formData.value });

    groups.value = data?.groups || groups.value;
    formData.value = { ...(data?.values || formData.value) };
    message.success('保存成功');
  } catch (error) {
    console.error(error);
    message.error('保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadSettings();
});
</script>

<template>
  <div class="setting-page p-4">
    <Card class="setting-shell" :bordered="false">
      <template #title>
        <div class="setting-title">
          <div>
            <div class="text-lg font-semibold">系统配置</div>
          </div>
          <Button type="primary" :loading="saving" @click="submit">保存配置</Button>
        </div>
      </template>

      <Spin :spinning="loading">
        <Empty v-if="!groups.length" description="暂无可配置项" />

        <Form v-else :model="formData" layout="vertical">
          <div class="setting-groups">
            <Card
              v-for="group in groups"
              :key="group.id"
              :bordered="true"
              class="setting-group-card"
              size="small"
            >
              <template #title>{{ group.name }}</template>

              <Row :gutter="[16, 8]">
                <Col
                  v-for="field in group.fields"
                  :key="field.field"
                  :span="field.span || 24"
                >
                  <AppField
                    :ref="(el) => setFieldRef(field.field, el)"
                    v-model="formData[field.field]"
                    :field="field"
                  />
                </Col>
              </Row>
            </Card>
          </div>
        </Form>
      </Spin>
    </Card>
  </div>
</template>

<style scoped>
.setting-shell {
  min-height: calc(100vh - 120px);
}

.setting-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.setting-groups {
  display: grid;
  gap: 16px;
}

.setting-group-card :deep(.ant-card-head) {
  background: #fafafa;
}
</style>
