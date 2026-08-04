<script setup>
/**
 * AppCrudTable - 通用 CRUD 表格壳组件
 *
 * 编排 7 个 composables + 6 个子组件
 * 通过 pageModel 切换 list / detail 渲染
 */
import { computed, onMounted, provide, ref, useSlots, watch } from 'vue';
import { useRoute } from 'vue-router';

import { cloneDeep } from 'lodash-es';

// Composables
import { useCrudTableActions } from './composables/useCrudTableActions.js';
import { useCrudTableData } from './composables/useCrudTableData.js';
import {
  resolveOpenMode,
  useCrudTableDetail,
} from './composables/useCrudTableDetail.js';
import { useCrudTableFilters } from './composables/useCrudTableFilters.js';
import { useCrudTableForm } from './composables/useCrudTableForm.js';
import { useCrudTablePermission } from './composables/useCrudTablePermission.js';
import { useCrudTableRoute } from './composables/useCrudTableRoute.js';
// 子组件
import CrudAuditModal from './parts/CrudAuditModal.vue';
import CrudDetailView from './parts/CrudDetailView.vue';
import CrudFilterBar from './parts/CrudFilterBar.vue';
import CrudFormActions from './parts/CrudFormActions.vue';
import CrudGrid from './parts/CrudGrid.vue';
import CrudToolbar from './parts/CrudToolbar.vue';

defineOptions({ name: 'AppCrudTable' });

// ========================= Props =========================
const props = defineProps({
  // 资源
  apiUrl: { type: String, required: true },
  apiPrefix: { type: String, default: '' },
  idKey: { type: String, default: 'id' },
  listScope: { type: [String, Number], default: 1 },
  extraQuery: { type: Object, default: () => ({}) },
  listFormat: { type: Function, default: (e) => e },
  detailFormat: { type: Function, default: (e) => e },
  saveFormat: { type: Function, default: (e) => e },
  flatField: { type: String, default: '' },

  // 网格
  gridOptions: { type: Object, default: () => ({}) },
  columnFormat: { type: Function, default: null },
  selected: { type: Array, default: () => [] },
  clickOpen: { type: [Function, Boolean], default: () => true },

  // 筛选
  filterFields: { type: Array, default: () => [] },
  excludeFilters: { type: Array, default: () => [] },
  filterExpandDefault: { type: Boolean, default: false },
  filterCollapseRows: { type: Number, default: 1 },
  filterActionable: { type: Boolean, default: true },

  // 表单
  modelValue: { type: Object, default: () => ({}) },
  fields: { type: Array, default: () => [] },
  fieldFormat: { type: Function, default: (e) => e },
  excludeFields: { type: Array, default: () => [] },
  formAttrs: { type: Object, default: () => ({}) },

  // 行操作
  showActions: { type: Boolean, default: true },
  inlineActions: { type: Array, default: () => ['view', 'edit', 'delete'] },
  actionsConfig: { type: Array, default: () => [] },
  // 操作按钮溢出展示模式：'wrap'（全部展开，超出换行）| 'more'（超出阈值收为“更多”下拉）
  actionOverflow: {
    type: String,
    default: 'more',
    validator: (v) => v === 'wrap' || v === 'more',
  },
  // 'more' 模式下，操作列单行最多显示的 inline 按钮数量（超出部分收进“更多”）
  maxInlineActions: { type: Number, default: 3 },

  // 详情
  openMode: {
    type: Object,
    default: () => ({ create: 'modal', detail: 'page' }),
  },
  detailProps: { type: Object, default: () => ({ class: 'w-[800px]' }) },
  title: { type: String, default: '' },

  // 路由
  routeMatch: { type: [Object, Function], default: null },
  pageRouteName: { type: String, default: '' },

  // 工具栏
  toolbar: {
    type: [Object, Boolean],
    default: () => ({
      filter: true,
      create: true,
      refresh: true,
      print: false,
      export: false,
      more: true,
    }),
  },

  // 权限
  permissionName: { type: String, default: '' },
  superRoles: { type: Array, default: () => ['Super Admin'] },
  superRoleExcludeActions: { type: Array, default: () => [] },
});

// ========================= Emits =========================
const emit = defineEmits([
  'update:modelValue',
  'update:list',
  'update:selected',
  'update:filters',
  'reset',
  'choose',
  'cellClick',
  'showDetail',
  'detailClose',
  'saved',
  'export',
]);

// ========================= 内部状态 =========================
const route = useRoute();
const slots = useSlots();

// 受控的 modelValue。所有 composable 与子组件共享这一个 ref。
const currentModelValue = ref(cloneDeep(props.modelValue));

function setModelValue(value) {
  currentModelValue.value = value;
}

// ========================= Composables 编排 =========================

// 1. 权限
const permissionApi = useCrudTablePermission(props);

// 2. 路由
const routeApi = useCrudTableRoute(props, { emit });
const { pageModel, detailRouteId, detailRouteAction } = routeApi;

// 3. 表单
const formApi = useCrudTableForm(props, { emit }, currentModelValue);
const { formatedFields, validateMessages, setFieldRef } = formApi;

// 4. 数据
const dataApi = useCrudTableData(props, { emit });
const { gridOptions: gridState, columnSlots } = dataApi;

// 5. 筛选
const filterApi = useCrudTableFilters(props, { emit }, dataApi);
const { filters, filterExpand, visibleFilterFields, canToggleExpand } =
  filterApi;

dataApi.setFiltersRef(filters);
dataApi.setRouteRef(route);

// 6. 行操作（先声明回调引用，下面 detailApi 创建后再绑定具体函数）
const callbacks = {
  openDetail: null,
  deleteItem: null,
  openAuditDialog: null,
  audit: null,
  refresh: dataApi.refresh,
  reload: dataApi.reload,
};
const actionsApi = useCrudTableActions(
  props,
  { emit },
  callbacks,
  permissionApi,
);

// 7. 详情
const detailApi = useCrudTableDetail(
  props,
  { emit },
  {
    refresh: dataApi.refresh,
    reload: dataApi.reload,
    formApi,
    routeApi,
    permissionApi,
    modelValue: currentModelValue,
  },
);
const {
  ModalComponent,
  DrawerComponent,
  editing,
  loading: detailLoading,
  refreshing: detailRefreshing,
  saving,
  openType,
  detailError,
  auditDialog,
  auditSubmitting,
} = detailApi;

// 绑定行操作回调
callbacks.openDetail = detailApi.openDetail;
callbacks.deleteItem = detailApi.deleteItem;
callbacks.openAuditDialog = detailApi.openAuditDialog;
callbacks.audit = detailApi.audit;

// ========================= 计算属性 =========================
const pageTitle = computed(() => props.title || route?.meta?.title || '');

const isListMode = computed(() => pageModel.value === 'list');
const isPageDetailMode = computed(
  () => pageModel.value === 'detail' && openType.value === 'page',
);
const isOverlayDetailMode = computed(
  () => openType.value === 'modal' || openType.value === 'drawer',
);

const detailContainer = computed(() =>
  openType.value === 'drawer' ? DrawerComponent : ModalComponent,
);

const slotFilterEntries = computed(() =>
  visibleFilterFields.value
    .filter((f) => f.type === 'slot')
    .map((f) => ({ field: f, slotName: `filter_${f.field}` })),
);

const formDisabled = computed(() => {
  if (!editing.value) return true;
  const action = currentModelValue.value?.[props.idKey] ? 'edit' : 'create';
  return !permissionApi.checkPermission(action);
});

const detailTitle = computed(() => {
  const base = pageTitle.value;
  if (editing.value) {
    return currentModelValue.value?.[props.idKey]
      ? `编辑 - ${base}`
      : `新增 - ${base}`;
  }
  return `查看 - ${base}`;
});

// 收集动态 column slot 名（响应式）
const columnSlotNames = computed(() => Object.keys(columnSlots.value || {}));

// 表单字段中 type === 'slot' 的项，预先派生稳定的 slot 名，避免在模板中混用 || 表达式
const formSlotEntries = computed(() =>
  formatedFields.value
    .filter((f) => f.type === 'slot')
    .map((f) => ({
      field: f,
      slotName: `field_${f.slot || f.field}`,
      renderKey: f.renderKey,
    })),
);

// ========================= 事件处理 =========================
function handleCreate() {
  detailApi.openDetail(null, true);
}

function handleRefresh() {
  dataApi.refresh();
}

function handlePrint() {
  window.print();
}

function handleExport() {
  emit('export', {
    filters: { ...filters.value },
    list: [...dataApi.list.value],
  });
}

function handleCellDblclick({ row }) {
  const shouldOpen =
    typeof props.clickOpen === 'function'
      ? props.clickOpen(row)
      : props.clickOpen;
  if (!shouldOpen) return;
  emit('choose', row);
  detailApi.openDetail(row[props.idKey], true, null, row);
}

function handleCellClick(params) {
  emit('cellClick', params);
}

function handleSortChange(params) {
  const sorts = params?.sorts || params?.sortList || [];
  const sortBy = sorts.map((s) => ({
    key: s.field || s.property,
    order: s.order,
  }));
  dataApi.handlePageData(sortBy);
}

function handlePageChange(params) {
  if (params?.currentPage) {
    gridState.pagerConfig.currentPage = params.currentPage;
  }
  if (params?.pageSize) {
    gridState.pagerConfig.pageSize = params.pageSize;
  }
  dataApi.handlePageData();
}

function handleCheckboxChange(params) {
  emit('update:selected', params?.records || []);
}

function handleDetailSubmit() {
  detailApi.submit();
}

function handleDetailClose() {
  detailApi.closeDetail('cancel');
}

function handleDetailReset() {
  formApi.reset();
  emit('reset', currentModelValue.value);
}

function handleFiltersUpdate(next) {
  // 用整体替换的方式同步筛选状态，保持引用稳定
  filters.value = { ...filters.value, ...next };
}

function setAuditDialog(value) {
  auditDialog.value = value;
  if (!value) {
    detailApi.auditRow.value = null;
  }
}

// ========================= 同步 props.modelValue =========================
watch(
  () => props.modelValue,
  (val) => {
    if (val === null || val === undefined) return;
    // 防止环路：仅当外部值确实不同才覆盖
    const next = cloneDeep(val);
    if (JSON.stringify(next) !== JSON.stringify(currentModelValue.value)) {
      currentModelValue.value = next;
    }
  },
  { deep: true },
);

watch(
  currentModelValue,
  (val) => {
    emit('update:modelValue', val);
  },
  { deep: true },
);

// ========================= 路由监听 =========================
watch(
  pageModel,
  async (model) => {
    if (model !== 'detail') return;
    const id = detailRouteId.value;
    const action = detailRouteAction.value;
    openType.value = 'page';

    if (action === 'new') {
      editing.value = true;
      currentModelValue.value = detailApi.buildDefaultItem();
    } else if (id !== undefined && id !== null) {
      editing.value = action === 'edit';
      await detailApi.loadDetail(id);
    }
  },
  { immediate: true },
);

// ========================= 初始化 =========================
onMounted(() => {
  if (isListMode.value) {
    dataApi.handlePageData();
  }
});

watch(
  () => props.extraQuery,
  () => {
    if (isListMode.value) dataApi.handlePageData();
  },
  { deep: true },
);

// 查询范围（scope）变化时重新加载列表
watch(
  () => props.listScope,
  () => {
    if (isListMode.value) dataApi.handlePageData();
  },
);

// ========================= Provide =========================
provide('crudTableContext', {
  isNested: routeApi.isNested,
  registerAction: actionsApi.registerAction,
  unregisterAction: actionsApi.unregisterAction,
});

// ========================= Expose =========================
const crudGridRef = ref(null);

defineExpose({
  // 列表 / 数据
  refresh: dataApi.refresh,
  reload: dataApi.reload,
  search: dataApi.search,
  getGrid: () => crudGridRef.value?.getGridInstance?.(),
  // 筛选
  setFilterState: filterApi.setFilterState,
  resetFilters: filterApi.reset,
  applyFilters: filterApi.apply,
  // 详情
  openDetail: detailApi.openDetail,
  closeDetail: detailApi.closeDetail,
  deleteItem: detailApi.deleteItem,
  resolveOpenMode,
  isPageDetailMode,
  // Action 注册表
  registerAction: actionsApi.registerAction,
  unregisterAction: actionsApi.unregisterAction,
});
</script>

<template>
  <div class="app-crud-table">
    <!-- ==================== LIST 模式 ==================== -->
    <template v-if="isListMode">
      <div class="crud-header">
        <CrudToolbar
          :title="pageTitle"
          :toolbar-config="toolbar"
          :filter-expand="filterExpand"
          :can-create="permissionApi.checkPermission('create')"
          @update:filter-expand="filterApi.toggleExpand"
          @create="handleCreate"
          @refresh="handleRefresh"
          @print="handlePrint"
          @export="handleExport"
        >
          <template #prepend>
            <slot name="toolbar-prepend"></slot>
          </template>
          <template v-if="slots['toolbar-append']" #append>
            <slot name="toolbar-append"></slot>
          </template>
          <template #sub-title>
            <slot name="sub-title"></slot>
          </template>
        </CrudToolbar>

        <CrudFilterBar
          :fields="visibleFilterFields"
          :model-value="filters"
          :expanded="filterExpand"
          :can-expand="canToggleExpand"
          :show-actions="filterActionable"
          :filter-immediate="!filterActionable"
          @update:model-value="handleFiltersUpdate"
          @reset="filterApi.reset"
          @apply="filterApi.apply"
          @update:expanded="filterApi.toggleExpand"
        >
          <template
            v-for="entry in slotFilterEntries"
            :key="entry.field.field"
            #[entry.slotName]="scope"
          >
            <slot :name="entry.slotName" v-bind="scope"></slot>
          </template>

          <template #prepend>
            <slot name="filter-prepend"></slot>
          </template>

          <template #actions="scope">
            <slot name="filter-actions" v-bind="scope"></slot>
          </template>
        </CrudFilterBar>
      </div>

      <CrudGrid
        ref="crudGridRef"
        :grid-options="gridState"
        :column-slots="columnSlots"
        :row-key="idKey"
        :show-actions="showActions"
        :resolve-row-actions="actionsApi.resolveRowActions"
        :action-overflow="actionOverflow"
        @cell-click="handleCellClick"
        @cell-dblclick="handleCellDblclick"
        @sort-change="handleSortChange"
        @page-change="handlePageChange"
        @checkbox-change="handleCheckboxChange"
      >
        <template
          v-for="slotName in columnSlotNames"
          :key="slotName"
          #[slotName]="scope"
        >
          <slot :name="slotName" v-bind="scope"></slot>
        </template>

        <template #row-action-extra="scope">
          <slot name="row-action-extra" v-bind="scope"></slot>
        </template>

        <template #more-trigger="scope">
          <slot name="more-trigger" v-bind="scope"></slot>
        </template>
      </CrudGrid>
    </template>

    <!-- ==================== DETAIL 模式（Modal / Drawer） ==================== -->
    <component
      :is="detailContainer"
      v-if="isOverlayDetailMode"
      v-bind="detailProps"
      :title="$slots['detail-title'] ? undefined : detailTitle"
    >
      <!-- 自定义标题插槽（Modal/Drawer 模式） -->
      <template v-if="$slots['detail-title']" #title>
        <slot name="detail-title" :editing="editing" :model-value="currentModelValue"></slot>
      </template>

      <CrudDetailView
        :mode="openType"
        :title="pageTitle"
        :model-value="currentModelValue"
        :fields="formatedFields"
        :editing="editing"
        :disabled="formDisabled"
        :form-attrs="formAttrs"
        :saving="saving"
        :loading="detailLoading"
        :refreshing="detailRefreshing"
        :validate-messages="validateMessages"
        :set-field-ref="setFieldRef"
        :detail-error="detailError"
        @update:model-value="setModelValue"
        @submit="handleDetailSubmit"
        @reset="handleDetailReset"
        @close="handleDetailClose"
        @form-mounted="(formInst) => (formApi.formRef.value = formInst)"
      >
        <template #detail-title="scope">
          <slot name="detail-title" v-bind="scope"></slot>
        </template>
        <template #detail-description="scope">
          <slot name="detail-description" v-bind="scope"></slot>
        </template>
        <template #form-description="scope">
          <slot name="form-description" v-bind="scope"></slot>
        </template>
        <template #form-default="scope">
          <slot name="form-default" v-bind="scope"></slot>
        </template>

        <template
          v-for="entry in formSlotEntries"
          :key="entry.renderKey"
          #[entry.slotName]="scope"
        >
          <slot :name="entry.slotName" v-bind="scope"></slot>
        </template>
      </CrudDetailView>

      <template #footer>
        <CrudFormActions
          :editing="editing"
          :disabled="formDisabled"
          :saving="saving"
          @submit="handleDetailSubmit"
          @reset="handleDetailReset"
          @close="handleDetailClose"
        >
          <template v-if="slots['form-actions']" #form-actions="scope">
            <slot name="form-actions" v-bind="scope"></slot>
          </template>
          <template #form-action="scope">
            <slot name="form-action" v-bind="scope"></slot>
          </template>
        </CrudFormActions>
      </template>
    </component>

    <!-- ==================== DETAIL 模式（Page） ==================== -->
    <template v-if="isPageDetailMode">
      <slot
        name="detail"
        :id="detailRouteId"
        :action="detailRouteAction"
        :model-value="currentModelValue"
        :editing="editing"
      >
        <CrudDetailView
          mode="page"
          :title="pageTitle"
          :model-value="currentModelValue"
          :fields="formatedFields"
          :editing="editing"
          :disabled="formDisabled"
          :form-attrs="formAttrs"
          :saving="saving"
          :loading="detailLoading"
          :refreshing="detailRefreshing"
          :validate-messages="validateMessages"
          :set-field-ref="setFieldRef"
          :detail-error="detailError"
          @update:model-value="setModelValue"
          @submit="handleDetailSubmit"
          @reset="handleDetailReset"
          @close="handleDetailClose"
          @form-mounted="(formInst) => (formApi.formRef.value = formInst)"
        >
          <template #detail-title="scope">
            <slot name="detail-title" v-bind="scope"></slot>
          </template>
          <template #detail-description="scope">
            <slot name="detail-description" v-bind="scope"></slot>
          </template>
          <template #form-description="scope">
            <slot name="form-description" v-bind="scope"></slot>
          </template>
          <template #form-default="scope">
            <slot name="form-default" v-bind="scope"></slot>
          </template>

          <template
            v-for="entry in formSlotEntries"
            :key="entry.renderKey"
            #[entry.slotName]="scope"
          >
            <slot :name="entry.slotName" v-bind="scope"></slot>
          </template>
        </CrudDetailView>

        <CrudFormActions
          class="mt-4"
          :editing="editing"
          :disabled="formDisabled"
          :saving="saving"
          @submit="handleDetailSubmit"
          @reset="handleDetailReset"
          @close="handleDetailClose"
        >
          <template v-if="slots['form-actions']" #form-actions="scope">
            <slot name="form-actions" v-bind="scope"></slot>
          </template>
          <template #form-action="scope">
            <slot name="form-action" v-bind="scope"></slot>
          </template>
        </CrudFormActions>
      </slot>
    </template>

    <!-- ==================== 审核弹窗 ==================== -->
    <CrudAuditModal
      :open="auditDialog"
      :submitting="auditSubmitting"
      @update:open="setAuditDialog"
      @submit="detailApi.submitAudit"
    />
  </div>
</template>

<style scoped>
.app-crud-table {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.app-crud-table :deep(.crud-grid) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.app-crud-table :deep(.crud-grid .h-full) {
  height: 100% !important;
}

.crud-header {
  flex-shrink: 0;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
</style>
