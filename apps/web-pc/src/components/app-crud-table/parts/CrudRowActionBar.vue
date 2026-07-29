<script setup>
/**
 * CrudRowActionBar - 行操作按钮（Inline + More 下拉）
 *
 * Props: row, actions ({ inline, more })
 * Slots: extra (location: 'inline' | 'more'), more-trigger
 */
import { computed } from 'vue';

import { Button, Dropdown, Menu, Popconfirm, Space } from 'antdv-next';

const props = defineProps({
  row: { type: Object, default: () => ({}) },
  actions: {
    type: Object,
    default: () => ({ inline: [], more: [] }),
  },
});

const inlineActions = computed(() => props.actions?.inline ?? []);
const moreActions = computed(() => props.actions?.more ?? []);
const hasInline = computed(() => inlineActions.value.length > 0);
const hasMore = computed(() => moreActions.value.length > 0);
const hasAny = computed(() => hasInline.value || hasMore.value);

function runAction(action) {
  if (action?.onClick) action.onClick();
}
</script>

<template>
  <div v-if="hasAny" class="crud-row-action-bar">
    <Space :size="[0, 4]">
      <!-- Inline 按钮 -->
      <template v-for="action in inlineActions" :key="action.key">
        <Popconfirm
          v-if="action.confirm"
          :title="action.confirmTitle"
          @confirm="runAction(action)"
        >
          <Button
            type="link"
            size="small"
            :danger="action.danger"
            :disabled="action.disabled"
          >
            <i v-if="action.iconClass" :class="action.iconClass"></i>
            {{ action.label }}
          </Button>
        </Popconfirm>
        <Button
          v-else
          type="link"
          size="small"
          :danger="action.danger"
          :disabled="action.disabled"
          @click="runAction(action)"
        >
          <i v-if="action.iconClass" :class="action.iconClass"></i>
          {{ action.label }}
        </Button>
      </template>

      <slot name="extra" :row="row" location="inline"></slot>

      <!-- More 下拉 -->
      <Dropdown v-if="hasMore">
        <slot name="more-trigger" :row="row">
          <Button type="link" size="small">
            <i class="icon-[mdi--more-vert]"></i>
          </Button>
        </slot>
        <template #popupRender>
          <Menu>
            <template v-for="action in moreActions" :key="action.key">
              <Menu.Item :danger="action.danger" :disabled="action.disabled">
                <Popconfirm
                  v-if="action.confirm"
                  :title="action.confirmTitle"
                  @confirm="runAction(action)"
                >
                  <span @click.stop>
                    <i v-if="action.iconClass" :class="action.iconClass"></i>
                    {{ action.label }}
                  </span>
                </Popconfirm>
                <span v-else @click="runAction(action)">
                  <i v-if="action.iconClass" :class="action.iconClass"></i>
                  {{ action.label }}
                </span>
              </Menu.Item>
            </template>
          </Menu>
        </template>
      </Dropdown>
    </Space>
  </div>
</template>

<style scoped>
.crud-row-action-bar :deep(.ant-btn) {
  vertical-align: middle;
}
</style>
