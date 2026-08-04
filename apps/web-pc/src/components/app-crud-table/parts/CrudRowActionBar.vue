<script setup>
/**
 * CrudRowActionBar - 行操作按钮（Inline + More 下拉）
 *
 * 布局采用可换行的 flex 容器，避免按钮过多被列宽裁剪：
 *   - 当 overflow='wrap' 时（由 composable 保证 more 为空），所有按钮平铺并按需换行
 *   - 当 overflow='more' 且按钮超过阈值时，超出部分已被 composable 收进 more 下拉
 *
 * Props: row, actions ({ inline, more }), actionOverflow
 * Slots: extra (location: 'inline' | 'more'), more-trigger
 */
import { computed } from 'vue';

import { Button, Dropdown, Menu, Popconfirm } from 'antdv-next';

const props = defineProps({
  row: { type: Object, default: () => ({}) },
  actions: {
    type: Object,
    default: () => ({ inline: [], more: [] }),
  },
  actionOverflow: {
    type: String,
    default: 'more',
    validator: (v) => v === 'wrap' || v === 'more',
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
    <!-- Inline 按钮（可换行，超出由 composable 收进更多） -->
    <div class="crud-row-action-bar__inline">
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
          {{ action.label }}
        </Button>
      </template>

      <slot name="extra" :row="row" location="inline"></slot>
    </div>

    <!-- More 下拉 -->
    <Dropdown v-if="hasMore" placement="bottomRight">
      <slot name="more-trigger" :row="row">
        <Button type="link" size="small" class="crud-row-action-bar__more">
          <span class="crud-row-action-bar__more-inner">
            更多
            <i class="icon-[mdi--chevron-down]"></i>
          </span>
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
                  {{ action.label }}
                </span>
              </Popconfirm>
              <span v-else @click="runAction(action)">
                {{ action.label }}
              </span>
            </Menu.Item>
          </template>
        </Menu>
      </template>
    </Dropdown>
  </div>
</template>

<style scoped>
.crud-row-action-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 4px;
}

.crud-row-action-bar__inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 4px;
}

.crud-row-action-bar :deep(.ant-btn) {
  padding-inline: 2px;
  vertical-align: middle;
}

.crud-row-action-bar__more :deep(i) {
  font-size: 12px;
}

.crud-row-action-bar__more :deep(.crud-row-action-bar__more-inner) {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
</style>
