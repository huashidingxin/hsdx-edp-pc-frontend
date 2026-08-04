<script setup>
import { ref } from 'vue';

import { VxeGrid } from 'vxe-table';

import CrudRowActionBar from './CrudRowActionBar.vue';

defineProps({
  gridOptions: { type: Object, required: true },
  columnSlots: { type: Object, default: () => ({}) },
  rowKey: { type: String, default: 'id' },
  showActions: { type: Boolean, default: true },
  resolveRowActions: { type: Function, default: null },
  actionOverflow: { type: String, default: 'more' },
});

const emit = defineEmits([
  'cellClick',
  'cellDblclick',
  'pageChange',
  'sortChange',
  'checkboxChange',
  'checkboxAll',
]);

const gridRef = ref(null);

function handleCellClick(params) {
  emit('cellClick', params);
}

function handleCellDblclick(params) {
  emit('cellDblclick', params);
}

function handlePageChange(params) {
  emit('pageChange', params);
}

function handleSortChange(params) {
  emit('sortChange', params);
}

function handleCheckboxChange(params) {
  emit('checkboxChange', params);
}

function handleCheckboxAll(params) {
  emit('checkboxAll', params);
}

defineExpose({
  /** 获取原生 vxe-grid 实例 */
  getGridInstance: () => gridRef.value,
});
</script>

<template>
  <div class="h-full rounded-md bg-card">
    <VxeGrid
      ref="gridRef"
      class="p-2"
      v-bind="gridOptions"
      @cell-click="handleCellClick"
      @cell-dblclick="handleCellDblclick"
      @page-change="handlePageChange"
      @sort-change="handleSortChange"
      @checkbox-change="handleCheckboxChange"
      @checkbox-all="handleCheckboxAll"
    >
      <!-- 动态列 slot 透传 -->
      <template
        v-for="slotName in Object.keys(columnSlots)"
        :key="slotName"
        #[slotName]="scope"
      >
        <slot :name="slotName" v-bind="scope"></slot>
      </template>

      <!-- 空状态 -->
      <template #empty>
        <slot name="empty">
          <div class="py-6 text-center text-gray-400">暂无数据</div>
        </slot>
      </template>

      <!-- 操作列 slot -->
      <template #default_action="{ row }">
        <CrudRowActionBar
          v-if="showActions && resolveRowActions"
          :row="row"
          :actions="resolveRowActions(row)"
          :action-overflow="actionOverflow"
        >
          <template #extra="{ row: actionRow, location }">
            <slot
              name="row-action-extra"
              :row="actionRow"
              :location="location"
            ></slot>
          </template>
          <template #more-trigger="{ row: actionRow }">
            <slot name="more-trigger" :row="actionRow"></slot>
          </template>
        </CrudRowActionBar>
      </template>
    </VxeGrid>
  </div>
</template>
