<script setup>
/**
 * CrudToolbar - 顶部工具栏
 *
 * Props: title, toolbarConfig, canCreate
 * Slots: prepend, append, sub-title（prepend/append 为追加内容，不覆盖默认工具）
 * Events: create, refresh, print, export
 */
import { computed } from 'vue';

import { Button, Dropdown, Menu, Space } from 'antdv-next';

const props = defineProps({
  title: { type: String, default: '' },
  toolbarConfig: { type: [Object, Boolean], default: true },
  canCreate: { type: Boolean, default: true },
});

const emit = defineEmits(['create', 'refresh', 'print', 'export']);

const config = computed(() => {
  if (props.toolbarConfig === false) return null;
  if (props.toolbarConfig === true || !props.toolbarConfig) {
    return {
      create: true,
      refresh: true,
      print: false,
      export: false,
      more: true,
    };
  }
  return {
    create: props.toolbarConfig.create !== false,
    refresh: props.toolbarConfig.refresh !== false,
    print: !!props.toolbarConfig.print,
    export: !!props.toolbarConfig.export,
    more: props.toolbarConfig.more !== false,
  };
});

const showMore = computed(
  () =>
    !!config.value?.more &&
    (config.value.refresh || config.value.print || config.value.export),
);
</script>

<template>
  <div v-if="config" class="crud-toolbar">
    <div class="crud-toolbar__inner flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <slot name="prepend"></slot>
        <h3
          v-if="title"
          class="mb-0 text-[16px] font-semibold leading-none text-gray-800"
        >
          {{ title }}
        </h3>
        <slot name="sub-title"></slot>
      </div>
      <div class="flex items-center gap-1.5">
        <Space :size="6">
          <Button
            v-if="config.create && canCreate"
            type="primary"
            class="toolbar-create-btn"
            @click="emit('create')"
          >
            <i class="icon-[mdi--plus]"></i>
            新增
          </Button>
          <slot name="append"></slot>
          <Dropdown v-if="showMore">
            <Button type="text" size="middle" class="toolbar-btn">
              <i class="icon-[mdi--dots-vertical] text-[18px]"></i>
            </Button>
            <template #popupRender>
              <Menu>
                <Menu.Item v-if="config.refresh" @click="emit('refresh')">
                  <i class="icon-[mdi--refresh]"></i> 刷新
                </Menu.Item>
                <Menu.Item v-if="config.print" @click="emit('print')">
                  <i class="icon-[mdi--printer]"></i> 打印
                </Menu.Item>
                <Menu.Item v-if="config.export" @click="emit('export')">
                  <i class="icon-[mdi--download]"></i> 导出
                </Menu.Item>
              </Menu>
            </template>
          </Dropdown>
        </Space>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crud-toolbar {
  padding: 16px 20px 12px;
}

.crud-toolbar__inner {
  min-height: 32px;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0 !important;
  color: #666;
  border-radius: 6px !important;
  transition: all 0.2s ease;
}

.toolbar-btn:hover {
  color: #333;
  background-color: rgb(0 0 0 / 4%);
}

:deep(.toolbar-create-btn) {
  gap: 4px;
  height: 32px;
  padding: 0 14px;
  font-weight: 500;
  border-radius: 6px;
}

:deep(.toolbar-create-btn .ant-btn-icon) {
  font-size: 15px;
}
</style>
