<script setup>
import {
  computed,
  inject,
  nextTick,
  onMounted,
  provide,
  reactive,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useVbenDrawer, useVbenModal } from '@vben/common-ui';
import { useTabs } from '@vben/hooks';

import Resource from '@/api/resource';
import {
  Button,
  Card,
  Col,
  // Drawer,
  Dropdown,
  Form,
  FormItem,
  Input,
  Menu,
  MenuItem,
  message,
  // Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Divider,
} from 'antdv-next';
import { cloneDeep, isEqual } from 'lodash-es';
import XEUtils from 'xe-utils';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { DotDuration } from 'antdv-next/dist/carousel/style/index';

// const cellRender = {
//   name: 'CellRender',
//   renderTableDefault: ({ row, column, $table }, options) => {
//     const customRender = column.cellRender?.customRender;
//     if (!customRender) return '';
//     return h(customRender.component, {
//       text: row[column.field],
//       ...(customRender?.props || {}),
//       ...(typeof customRender?.setProps === 'function' ? customRender.setProps(row) : {}),
//     });
//   },
// };
//
// const imageRender = ref({
//   name: 'VxeImage',
//   renderTableDefault: ({ row, column }) => {
//     return h('img', {
//       src: row[column.field],
//       style: {
//         width: '36px',
//         height: '36px',
//         objectFit: 'cover',
//         borderRadius: '4px',
//       },
//     });
//   },
// });

// // 注册自定义渲染器
// if (!VxeUI.renderer.has('CellRender')) {
//   VxeUI.renderer.add('CellRender', cellRender);
// }
//
// if (!VxeUI.renderer.has('VxeImage')) {
//   VxeUI.renderer.add('VxeImage', imageRender.value);
// }

const props = defineProps({
  modelValue: {
    default: () => ({}),
    type: Object,
  },
  options: {
    default: () => ({}),
    type: Object,
  },
  events: {
    default: () => ({}),
    type: Object,
  },
  selected: {
    type: Array,
    default: () => [],
  },
  apiUrl: {
    default: '',
    type: String,
  },
  apiPrefix: {
    default: '',
    type: String,
  },
  requestData: {
    default: () => ({}),
    type: Object,
  },
  filterFields: {
    default: () => [{ field: 'id', label: 'ID', col: 3, type: 'text' }],
    type: Array,
  },
  filterData: {
    default: () => ({}),
    type: Object,
  },
  filterExpandDefault: {
    default: false,
    type: Boolean,
  },
  title: {
    default: '',
    type: String,
  },
  createOpenType: {
    default: 'modal', // modal drawer page
    type: String,
  },
  detailOpenType: {
    default: 'page', // modal drawer page
    type: String,
  },
  idKey: {
    default: 'id',
    type: String,
  },
  actions: {
    default: () => ['filter', 'create', 'edit', 'delete', 'actions', 'tools'],
    type: Array,
  },
  formAttrs: {
    default: () => ({}),
    type: Object,
  },
  pageRouteName: {
    default: '',
    type: String,
  },
  // 如果传入ID 访问详情页 一定是单页
  action: {
    default: undefined,
    type: [String, Number],
  },
  id: {
    default: undefined,
    type: [String, Number],
  },
  fields: {
    default: () => [],
    type: Array,
  },
  listFormat: {
    default: (e) => e,
    type: Function,
  },
  detailFormat: {
    default: (e) => e,
    type: Function,
  },
  saveFormat: {
    default: (e) => e,
    type: Function,
  },
  detailClass: {
    default: '',
    type: [String, Object],
  },
  listScope: {
    default: 1,
    type: [String, Number],
  },
  showToolbar: {
    default: true,
    type: [Boolean, Function],
  },
  showActions: {
    default: true,
    type: [Boolean, Function],
  },
  showFilter: {
    default: true,
    type: Boolean,
  },
  showCreate: {
    default: true,
    type: [Boolean, Function],
  },
  showView: {
    default: true,
    type: [Boolean, Function],
  },
  showEdit: {
    default: true,
    type: [Boolean, Function],
  },
  showDelete: {
    default: true,
    type: [Boolean, Function],
  },
  showSave: {
    default: true,
    type: Boolean,
  },
  showTools: {
    default: true,
    type: Boolean,
  },
  showPrint: {
    default: true,
    type: Boolean,
  },
  showExport: {
    default: false,
    type: Boolean,
  },
  clickOpen: {
    default: () => (e) => true,
    type: [Function, Boolean],
  },
  columnFormat: {
    default: null,
    type: Function,
  },
  flatField: {
    default: '',
    type: String,
  },
  showCheckbox: {
    type: Boolean,
    default: false,
  },
  permissionName: {
    type: String,
    default: '',
  },
  auditType: {
    type: String,
    default: '',
  },
  auditKey: {
    type: String,
    default: 'id',
  },
  showAudit: {
    default: () => (e) => e && 'audit_id' in e && !e.audit_id,
    type: [Function, Boolean],
  },
  auditPermissionName: {
    type: String,
    default: '',
  },
  showReserveAudit: {
    default: () => (e) => e?.audit_status,
    type: [Boolean, Function],
  },
  mergeAction: {
    type: Boolean,
    default: true,
  },
  showRowAction: {
    default: true,
    type: [Function, Boolean],
  },
  excludeFields: {
    default: () => [],
    type: Array,
  },
  excludeFilters: {
    default: () => [],
    type: Array,
  },
  fieldFormat: {
    default: (e) => e,
    type: Function,
  },
  superRoles: {
    default: () => ['Super Admin'],
    type: Array,
  },
  // 超级角色排除权限
  superRoleExcludeActions: {
    default: () => [],
    type: Array,
  },
  projectProps: {
    default: () => ({
      filter: false,
      edit: false,
      filterRequired: false,
      editRequired: false,
    }),
    type: Object,
  },
  detailProps: {
    default: () => ({ class: 'w-[800px]' }),
    type: Object,
  },
});
const emit = defineEmits([
  'update:list',
  'update:modelValue',
  'update:selected',
  'reset',
  'dialog-change',
  'choose',
  'cell-click',
  'show-detail',
  'update:filters',
]);
const [Modal, modalApi] = useVbenModal({
  draggable: true,
  onCancel() {},
  onOpenChange(e) {
    detailVisible.value = e;
  },
});
const [AuditModal, auditModalApi] = useVbenModal({
  draggable: true,
  onCancel() {
    auditModalApi.close();
  },
});
const [Drawer, drawerApi] = useVbenDrawer({
  onCancel() {},
  onOpenChange(e) {
    detailVisible.value = e;
  },
});

const [SubModal, subModalApi] = useVbenModal({
  draggable: true,
  onCancel() {
    subModalApi.close();
  },
});
const [SubDrawer, subDrawerApi] = useVbenDrawer({
  onCancel() {
    subDrawerApi.close();
  },
});

// import 'vxe-table/lib/style.css';

// 获取 useAccess，如果不存在则使用默认值
let hasAccessByCodes, hasAccessByRoles;
try {
  const access = useAccess();
  hasAccessByCodes = access.hasAccessByCodes;
  hasAccessByRoles = access.hasAccessByRoles;
} catch {
  hasAccessByCodes = () => true;
  hasAccessByRoles = () => true;
}

const tabs = useTabs();

const route = useRoute();
const router = useRouter();

provide('isNested', true);
const isNested = inject('isNested');

/**
 * GRID OPTIONS
 */
const gridOptions = reactive({
  // border: 'none',
  loading: false,
  size: 'small',
  showOverflow: true,
  // height: 'auto',
  data: [],
  columns: [],
  stripe: true,
  rowConfig: {
    keyField: props.idKey || 'id',
    isHover: true,
    isCurrent: true,
  },
  pagerConfig: {
    enabled: true,
    pageSize: 15,
    pageSizes: [10, 15, 20, 30, 50, 100],
  },
  ...props.options,
});

const gridEvents = {
  cellClick: ({ row, column }) => {
    emit('cell-click', { row, column });
  },
  cellDblclick: ({ row }) => {
    emit('choose', row);
    if (
      !(typeof props.clickOpen === 'function'
        ? props.clickOpen(row)
        : props.clickOpen)
    ) {
      return;
    }
    openDetail(
      row[props.idKey || 'id'],
      !!checkItemAction(props.showEdit, row),
    );
  },
  pageChange: ({ currentPage, pageSize }) => {
    gridOptions.pagerConfig.currentPage = currentPage;
    gridOptions.pagerConfig.pageSize = pageSize;
    handlePageData();
  },
  sortChange: ({ column, property, order }) => {
    const sortBy = [];
    if (property && order) {
      sortBy.push({
        key: property,
        order: order === 'asc' ? 'asc' : 'desc',
      });
    }
    handlePageData(sortBy);
  },
  checkboxChange: () => {
    handleCheckboxChange();
  },
  checkboxAll: () => {
    handleCheckboxChange();
  },
};

const [Grid, gridApi] = useVbenVxeGrid({ gridEvents, gridOptions });

const pageModel = computed(() => {
  return !isNested && (route.params.id || route.params.action)
    ? 'detail'
    : 'list';
});

const filterExpand = ref(props.filterExpandDefault);
const filters = ref({});
const filterForm = ref(null);
const fieldRefMap = ref({});

function getFieldRenderKey(field, index) {
  return field?.key || field?.field || `${field?.type || 'field'}-${index}`;
}

const formatedFields = computed(() => {
  return props.fields
    .map((sourceField, index) => {
      const formatted = props.fieldFormat(
        { ...sourceField },
        editing.value ? props.modelValue : null,
      );
      if (formatted === false) return null;
      return {
        field: formatted,
        renderKey: getFieldRenderKey(formatted, index),
      };
    })
    .filter(Boolean);
});

const formatedFilterFields = computed(() => {
  return props.filterFields.filter(
    (e) => !props.excludeFilters.includes(e.field),
  );
});

function filterReset() {
  formatedFilterFields.value.forEach((e) => {
    filters.value[e.field] = e.default;
  });

  if (filters.value.project_id) {
    filters.value.project_id = undefined;
    filterProjectSelected.value = null;
  }
}

function refresh() {
  filterReset();
  handlePageData();
}

function reload() {
  detailVisible.value = false;
  handlePageData();
}

function filter() {
  gridOptions.pagerConfig.currentPage = 1;
  handlePageData();
}

const list = ref([]);
const selectedRowKeys = ref([]);

const handlePageData = async (sortBy = []) => {
  if (pageModel.value !== 'list') {
    return;
  }
  // gridOptions.loading = true;
  gridApi.setLoading(true);
  const { pageSize, currentPage } = gridOptions.pagerConfig;
  const ret = await loadList(currentPage, pageSize, {
    ...filters.value,
    sort_by: JSON.stringify(sortBy),
  });
  gridOptions.data = ret.data;
  if (ret.meta) {
    gridOptions.pagerConfig = {
      ...gridOptions.pagerConfig,
      total: ret.meta.total,
      currentPage: ret.meta.current_page,
      pageSize: ret.meta.per_page,
    };
  }

  gridApi.setGridOptions(gridOptions);

  setSelected();
  // gridOptions.loading = false;
  gridApi.setLoading(false);
};

const search = (
  keyword,
  treeOptions = { children: 'children' },
  searchProps = ['name'],
) => {
  const filterVal = XEUtils.toValueString(keyword).trim().toLowerCase();
  if (filterVal) {
    const filterRE = new RegExp(filterVal, 'gi');
    const rest = XEUtils.searchTree(
      list.value,
      (item) =>
        searchProps.some((key) =>
          String(item[key]).toLowerCase().includes(filterVal),
        ),
      treeOptions,
    );
    XEUtils.eachTree(
      rest,
      (item) => {
        searchProps.forEach((key) => {
          item[key] = String(item[key]).replace(
            filterRE,
            (match) => `<span class="keyword-highlight">${match}</span>`,
          );
        });
      },
      treeOptions,
    );
    gridOptions.data = rest;
  } else {
    gridOptions.data = list.value;
  }
};

const isDBClick = ref(false);

const tableRef = computed(() => {
  return gridApi?.grid;
});

function getGrid() {
  return gridApi.grid();
}

function handleCheckboxChange() {
  if (!tableRef.value) return;
  const selectedRecords = tableRef.value.getCheckboxRecords();
  selectedRowKeys.value = selectedRecords.map(
    (item) => item[props.idKey || 'id'],
  );
  emit('update:selected', selectedRecords);
}

const openType = ref('page');
const detailVisible = ref(false);

const editing = ref(false);
const detailRef = ref(null);

function openDetail(id = null, isEdit = true, tempOpenType = null) {
  if (id > 0) {
    emit(
      'choose',
      gridOptions.data.find((v) => v.id == id),
    );
  }

  emit('show-detail', isEdit);
  // 新建时清空数据，编辑时使用传入的数据
  if (!id) {
    emit('update:modelValue', {});
  } else {
    const row = list.value.find((v) => v.id == id);
    emit('update:modelValue', row || props.modelValue || {});
  }
  editing.value = isEdit;

  fieldRefMap.value = {};

  if (props.id) {
    openType.value = 'page';
    id = props.id;
  } else {
    openType.value = id ? props.detailOpenType : props.createOpenType;
  }

  openType.value = tempOpenType || openType.value;

  // 如果该组件是被嵌套的场景 最多只能是抽屉模式打开 todo page模式打开需要处理路由

  if (isNested && openType.value == 'page') {
    openType.value = 'drawer';
  }
  detailVisible.value = true;
  nextTick(() => {
    if (openType.value === 'drawer') {
      drawerApi.open();
    } else {
      modalApi.open();
    }
  });

  if (openType.value === 'page') {
    if (id) {
      router.push(`${route.path}/${id}${isEdit ? '/edit' : ''}`);
    } else {
      router.push(`${route.path}/new`);
    }
  } else {
    // // 清空一下历史数据
    // editedItem.value = props.modelValue
    if (id) {
      loadDetail(id);
    }
  }
}

function checkPermission(permissionAction, actPermissionName = '') {
  const _permission = `${actPermissionName || props.permissionName}.${permissionAction}`;
  if (
    props.superRoles?.length > 0 &&
    hasAccessByRoles(props.superRoles) &&
    !props.superRoleExcludeActions.includes(permissionAction)
  ) {
    return true;
  }
  if (
    permissionAction &&
    props.permissionName &&
    !hasAccessByCodes([_permission])
  ) {
    return false;
  }
  return true;
}

function checkItemAction(
  value,
  row,
  permissionAction = '',
  actPermissionName = '',
) {
  if (!checkPermission(permissionAction, actPermissionName)) {
    return false;
  }
  return typeof value === 'function' ? value(row) : value;
}

function buildApiUrl(usePrefix = false) {
  const prefix = usePrefix && props.apiPrefix ? `${props.apiPrefix}/` : '';
  return `${prefix}${props.apiUrl}`;
}

async function loadList(page = 1, perPage = 10, e = {}) {
  try {
    const req = Object.assign({}, route.query, props.requestData);
    console.log('@@@@@loadList', e);
    const listApi = new Resource(buildApiUrl(true));
    const ret = await listApi.list({
      page,
      per_page: perPage,
      ...req,
      ...e,
      scope: props.listScope,
    });
    list.value = await props.listFormat(ret.data);
    // 展开列表
    if (props.flatField) {
      list.value = flatList(list.value);
    }
    emit('update:list', cloneDeep(list.value));
    return { ...ret, data: cloneDeep(list.value) };
  } catch (error) {
    console.error(error);
  }
}

function flatList(data) {
  const list = [];
  const prefix = `_${props.flatField}`;

  data.forEach((item, index) => {
    if (item[props.flatField]?.length) {
      item[props.flatField].forEach((e) => {
        list.push({
          ...item,
          [prefix]: e,
        });
      });
    } else {
      list.push(item);
    }
  });
  return list;
}

const columnSlots = ref({});

watch(
  () => props.options,
  (newValue) => {
    let options = newValue || {};

    if (newValue?.columns) {
      options.columns = newValue.columns.map((item) => {
        return {
          ...item,
          width: item.width || undefined,
        };
      });
    }

    // 处理自定义渲染
    options.columns = options.columns.map((e) => {
      if (e.customRender) {
        e.cellRender =
          e.customRender.type === 'image'
            ? {
                name: 'VxeImage',
                props: {
                  width: 36,
                  height: 36,
                },
              }
            : {
                name: 'CellRender',
                customRender: e.customRender,
              };
      }

      return e;
    });

    if (props.columnFormat) {
      options.columns = props.columnFormat(options.columns);
    }

    // // 添加序号列
    // if (!options.columns.find((v) => v.type === 'seq')) {
    //   options.columns.unshift({
    //     type: 'seq',
    //     title: '序号',
    //     width: 60,
    //     fixed: 'left',
    //     align: 'center',
    //   });
    // }

    // 添加复选框列
    if (props.showCheckbox) {
      gridOptions.checkboxConfig = {
        checkField: 'checked',
        highlight: true,
        range: true,
      };
    } else {
      delete gridOptions.checkboxConfig;
    }

    // 添加操作列
    if (
      props.showActions &&
      !options.columns.find((v) => v.field === '_action')
    ) {
      options.columns.push({
        title: '操作',
        field: '_action',
        width: 180,
        fixed: 'right',
        slots: { default: 'default_action' },
      });
    }

    gridOptions.columns = options.columns;
    options = { ...gridOptions, ...options };

    options.columns?.forEach((column) => {
      if (!['_action'].includes(column.field)) {
        for (const key in column.slots) {
          columnSlots.value[column.slots[key]] = column.slots[key];
        }
      }
    });
    gridApi.setGridOptions(options);
    refresh();
  },
  { immediate: true },
);

watch(
  () => props.selected,
  (newVal) => {
    setSelected();
  },
  { immediate: true },
);

function setSelected() {
  nextTick(() => {
    if (props.selected?.length) {
      const keys = props.selected.map((item) => {
        return typeof item === 'object' ? item[props.idKey] : item;
      });
      selectedRowKeys.value = keys;
      // 同步 vxe-table 的复选框状态
      if (tableRef.value && gridOptions.checkboxConfig) {
        tableRef.value.setCheckboxRow(keys, true);
      }
    } else {
      selectedRowKeys.value = [];
      if (tableRef.value) {
        // tableRef.value.clearCheckboxRow();
      }
    }
  });
}

async function deleteItem(e) {
  try {
    const deleteApi = new Resource(buildApiUrl(false));
    await deleteApi.destroy(e[props.idKey]);
    message.success('删除成功');
    handlePageData();
  } catch (error) {
    console.log(error);
  }
}

onMounted(() => {
  Object.assign(gridEvents, props.events);
  if (!isNested && route.params.id) {
    initDetail();
  }
});

/**
 * ADD_FORM START
 */

const defaultItem = ref({});

function fieldValueChange(fieldKey, fieldValue) {
  if (isEqual(props.modelValue?.[fieldKey], fieldValue)) {
    return;
  }
  emit('update:modelValue', { ...props.modelValue, [fieldKey]: fieldValue });
}

watch(
  () => props.requestData,
  (newVal) => {
    if (pageModel.value == 'list') {
      handlePageData();
    }
  },
);

watch(detailVisible, (newVal) => {
  if (!newVal) {
    emit('update:modelValue', {});
    if (['drawer', 'modal'].includes(openType.value)) {
      if (openType.value == 'drawer') {
        drawerApi.close();
      } else {
        modalApi.close();
      }
    }
  }
  emit('dialog-change', newVal);
});

const formRef = ref(null);

function setFieldRef(renderKey, el) {
  if (el) {
    fieldRefMap.value[renderKey] = el;
    return;
  }
  delete fieldRefMap.value[renderKey];
}

async function reset() {
  const resetData = cloneDeep(defaultItem.value);
  emit('update:modelValue', resetData);
  emit('reset', resetData);
  formRef.value?.resetFields?.();
}

const loading = ref(false);
const saving = ref(false);

const dotFieldNames = computed(() => {
  return props.fields
    .map((field) => field.field)
    .filter((field) => typeof field === 'string' && field.includes('.'));
});

function flattenDotFieldValues(data) {
  const formattedData = { ...data };

  dotFieldNames.value.forEach((field) => {
    const fieldArr = field.split('.');
    if (formattedData[fieldArr[0]]) {
      formattedData[field] = formattedData[fieldArr[0]][fieldArr[1]];
    }
  });

  return formattedData;
}

async function loadDetail(id) {
  loading.value = true;
  try {
    const detailApi = new Resource(buildApiUrl(false));
    const { data } = await detailApi.get(id, props.requestData);
    let formattedData = (await props.detailFormat?.(data)) || data;
    formattedData = flattenDotFieldValues(formattedData);
    Object.assign(defaultItem.value, cloneDeep(formattedData));
    emit('update:modelValue', formattedData);
  } catch (error) {
    console.log(error);
  }
  loading.value = false;
}

function expandDotKeys(obj) {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split('.');
    let current = result;

    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        current[part] = value;
      } else {
        if (!current[part] || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part];
      }
    });
  }

  return result;
}

const validateMessages = {
  required: '${label}不能为空',
};

async function submit() {
  try {
    saving.value = true;
    try {
      const ret = await formRef.value.validate();
    } catch {
      saving.value = false;
      message.error('表单有误');
      return;
    }

    // 是否有文件需要上传
    for (const item of formatedFields.value) {
      if (item.field.type === 'file' && props.modelValue[item.field.field]) {
        const urls = Array.isArray(props.modelValue[item.field.field])
          ? props.modelValue[item.field.field]
          : [props.modelValue[item.field.field]];
        console.log('URLS', urls, item.field.field);
        const uploads = urls.filter((e) => {
          return typeof e === 'object' && !e.url.startsWith('http');
        });

        const currentFieldRef = fieldRefMap.value[item.renderKey]?.fieldRef;
        console.log('UPLOADS', uploads, currentFieldRef);
        if (uploads.length > 0 && currentFieldRef?.upload) {
          await currentFieldRef.upload();
        }
      }
    }
    const submitApi = new Resource(
      buildApiUrl(props.modelValue.id ? false : true),
    );
    let requestData = expandDotKeys({ ...props.modelValue });
    requestData = await props.saveFormat(requestData);
    if (requestData === false) {
      saving.value = false;
      return;
    }
    let { data } = await (props.modelValue.id
      ? submitApi.update(props.modelValue.id, requestData)
      : submitApi.store(requestData));
    saving.value = false;
    message.success('提交成功');

    data = props.detailFormat?.(data) || data || {};
    emit('update:modelValue', data);
    emit('saved', data);

    detailVisible.value = false;
    handlePageData();

    if (openType.value == 'page') {
      if (router.getRoutes().length > 1) {
        router.back();
      } else {
        router.push('/');
      }
      tabs.closeCurrentTab();
    }
    emit('update:modelValue', {});
  } catch (error) {
    saving.value = false;
    console.log(error);
  }
}

async function initDetail() {
  const formDefault = {};
  props.fields.forEach((field) => {
    if (!field.field) {
      return;
    }
    formDefault[field.field] = cloneDeep(field.default ?? '');
  });
  defaultItem.value = props.modelValue?.id
    ? cloneDeep(Object.assign(formDefault, props.modelValue))
    : cloneDeep(formDefault);

  if (!isNested && route.params.id) {
    loadDetail(route.params.id);
  }
}

/**
 * TABLE PUBLIC DIALOG
 */

const dialog = ref(false);
const dialogType = ref('modal');
const dialogTitle = ref('');

function openDialog(title = '', type = 'modal') {
  dialogType.value = type;
  dialog.value = true;
  dialogTitle.value = title;
}

function closeDialog() {
  dialog.value = false;
}

const auditItem = ref(null);
const auditDialog = ref(false);
const auditData = ref({ status: 0 });
const auditForm = ref(null);

function openAuditDialog(row, status = true) {
  auditItem.value = row;
  auditDialog.value = true;
}

function auditReasonValidate(e) {
  return !!auditData.value.status || !!e || '请输入原因';
}

/**
 * 审核 反审核
 */
async function audit(row, status = true) {
  try {
    await auditForm.value.validate();
    const auditApi = new Resource(
      `${buildApiUrl(false)}/${auditItem.value[props.auditKey]}/audit`,
    );
    await auditApi.store(auditData.value);
    $toast.success('审核成功');
    auditData.value = { status: 0 };
    auditDialog.value = false;
    reload();
  } catch (error) {
    console.log(error);
  }
}

watch(
  filters,
  (newFilters) => {
    emit('update:filters', newFilters);
  },
  { deep: true },
);

watch(
  () => props.filterData,
  (newData) => {
    if (!isEqual(newData, filters.value)) {
      filters.value = newData;
    }
    // emit('update:filter-data', newData);
  },
  { deep: true },
);

// 占位导入，实际项目中需要实现
const projectTable = {};
const appStore = { defaultProject: { id: null } };
const projectSelectDialog = ref(false);
const filterProjectSelected = ref(null);

function projectConfirm(e) {
  emit('update:modelValue', { ...props.modelValue, project_id: e?.id });
  emit('project-change', e);
}

function projectFilterChange(e) {
  filters.value.project_id = e?.id;
  reload();
}

/**
 * ADD_FORM END
 */
defineExpose({
  openDetail,
  deleteItem,
  getGrid,
  gridRef: tableRef,
  openDialog,
  closeDialog,
  search,
  fieldRef: fieldRefMap,
  refresh,
  reload,
  gridApi,
});
</script>

<template>
  <div variant="borderless">
    <!-- 传入ID的情况为打开详情页不需要列表 -->
    <template v-if="pageModel === 'list'">
      <div v-if="showToolbar" class="app-table-toolbar">
        <div class="toolbar-left">
          <div class="toolbar-header">
            <div class="align-center flex gap-3">
              <h3 class="toolbar-title">
                {{ title || $route.meta.title }}
              </h3>
              <Button
                v-if="showFilter"
                @click="filterExpand = !filterExpand"
                :type="filterExpand ? 'primary' : 'default'"
                size="medium"
              >
                <template #icon>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polygon
                      points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
                    ></polygon>
                  </svg>
                </template>
                {{ filterExpand ? '收起筛选' : '展开筛选' }}
              </Button>
            </div>

            <div class="toolbar-subtitle">
              <slot name="sub-title"></slot>
            </div>
          </div>
        </div>

        <div class="toolbar-right">
          <slot name="right"></slot>

          <Button
            v-if="showCreate && checkPermission('create')"
            type="primary"
            @click="openDetail()"
          >
            <template #icon>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </template>
            新增
          </Button>
          <Dropdown v-if="showTools" :trigger="['click']">
            <Button>
              <template #icon>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="12" cy="5" r="1"></circle>
                  <circle cx="12" cy="19" r="1"></circle>
                </svg>
              </template>
            </Button>
            <template #overlay>
              <Menu>
                <MenuItem @click="handlePageData()">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    style="margin-right: 8px"
                  >
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                  </svg>
                  刷新
                </MenuItem>
                <MenuItem v-if="showPrint" @click="$message.info('打印功能')">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    style="margin-right: 8px"
                  >
                    <polyline points="6 9 6 2 18 2 18 9"></polyline>
                    <path
                      d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
                    ></path>
                    <rect x="6" y="14" width="12" height="8"></rect>
                  </svg>
                  打印
                </MenuItem>
                <MenuItem v-if="showExport" @click="$message.info('导出功能')">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    style="margin-right: 8px"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  导出
                </MenuItem>
                <slot name="action_more"></slot>
              </Menu>
            </template>
          </Dropdown>
        </div>
      </div>

      <div v-show="filterExpand" class="filter-container">
        <Card variant="borderless" class="filter-card">
          <Form ref="filterForm">
            <Row :gutter="[16, 16]">
              <template v-for="(item, key) in formatedFilterFields" :key="key">
                <slot
                  v-if="item.type == 'slot'"
                  :name="`filter_${item.field}`"
                ></slot>
                <AppField
                  v-else
                  v-model="filters[item?.field]"
                  :show-label="true"
                  :field="item"
                />
              </template>
              <Col :span="6" class="filter-actions">
                <Space :size="[8, 4]" wrap>
                  <Button @click="refresh">
                    <template #icon>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                      </svg>
                    </template>
                    重置
                  </Button>
                  <Button type="primary" @click="filter">
                    <template #icon>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      </svg>
                    </template>
                    查询
                  </Button>
                </Space>
              </Col>
            </Row>
          </Form>
        </Card>
      </div>

      <slot name="header"></slot>

      <div class="table-container">
        <slot name="grid" :list="list">
          <Grid>
            <template
              v-for="(slot, index) in columnSlots"
              :key="index"
              #[slot]="slotData"
            >
              <slot :name="slot" :data="slotData"></slot>
            </template>
            <template #default_action="{ row }">
              <slot name="actions" :row="row">
                <Space :size="[8, 4]" wrap>
                  <Button
                    v-if="checkItemAction(showRowAction, row)"
                    type="link"
                    size="small"
                    @click="openDetail(row.id, false)"
                  >
                    查看
                  </Button>
                  <Button
                    v-if="checkItemAction(showEdit, row, 'update')"
                    type="link"
                    size="small"
                    @click="openDetail(row.id, true)"
                  >
                    编辑
                  </Button>
                  <Button
                    v-if="
                      checkItemAction(
                        showAudit,
                        row,
                        'audit',
                        auditPermissionName,
                      )
                    "
                    type="link"
                    size="small"
                    @click="openAuditDialog(row, true)"
                  >
                    审核
                  </Button>
                  <Button
                    v-if="
                      checkItemAction(showReserveAudit, row, 'reverse audit')
                    "
                    type="link"
                    size="small"
                    @click="audit(row, false)"
                  >
                    反审核
                  </Button>
                  <slot :data="row" name="action"></slot>
                  <Popconfirm
                    v-if="checkItemAction(showDelete, row, 'delete')"
                    title="确定要删除吗？"
                    @confirm="deleteItem(row)"
                  >
                    <Button type="link" danger size="small">删除</Button>
                  </Popconfirm>
                </Space>
              </slot>
            </template>
          </Grid>
        </slot>
      </div>
    </template>

    <component
      ref="detailRef"
      :is="openType === 'drawer' ? Drawer : Modal"
      :show-confirm-button="false"
      :show-cancel-button="false"
      :close-on-click-modal="false"
      :close-on-press-escape="true"
      :destroy-on-close="true"
      :loading="loading"
      v-bind="detailProps"
    >
      <template #title>
        <slot name="detail-title">{{
          (title || $route.meta.title).replace(/列表$/, '')
        }}</slot>
      </template>
      <template #description>
        <slot name="detail-description">
          <div></div>
        </slot>
      </template>

      <slot name="form-description"></slot>
      <div class="flex">
        <slot name="form-left"></slot>
        <div class="flex-1">
          <Form
            ref="formRef"
            :model="modelValue || {}"
            :colon="false"
            :validate-messages="validateMessages"
            :disabled="
              !checkItemAction(
                showEdit,
                modelValue,
                modelValue?.id ? 'update' : 'create',
              ) || !editing
            "
            v-bind="formAttrs"
          >
            <Row :gutter="16">
              <template v-for="item in formatedFields" :key="item.renderKey">
                <template v-if="item.field.type === 'title'">
                  <Col span="24" class="mb-3 font-bold">
                    {{ item.field.label }}
                  </Col>
                </template>
                <Divider v-else-if="item.field.type === 'divider'"></Divider>
                <AppField
                  v-else
                  :ref="(el) => setFieldRef(item.renderKey, el)"
                  :model-value="modelValue[item.field.field]"
                  @update:modelValue="
                    fieldValueChange(item.field.field, $event)
                  "
                  :readonly="
                    !editing || (editing && item.field.editable === false)
                  "
                  :field="item.field"
                >
                  <div v-if="item.field.type === 'slot'">
                    <slot
                      :name="`field_${item.field.slot || item.field.field}`"
                      :item="item.field"
                    ></slot>
                  </div>
                </AppField>
              </template>
            </Row>
          </Form>
        </div>
      </div>
      <template #prepend-footer>
        <slot name="form-actions" :item="modelValue">
          <slot name="form-action" :item="modelValue"></slot>
          <template
            v-if="
              (checkItemAction(
                showEdit,
                modelValue,
                modelValue?.id ? 'update' : 'create',
              ) &&
                editing) ||
              ['new', 'edit'].includes(route.params.action)
            "
          >
            <Button @click="reset">重置</Button>
            <Button type="primary" :loading="saving" @click="submit">
              提交
            </Button>
          </template>
        </slot>
      </template>
      <slot name="form-default"></slot>
    </component>

    <SubModal v-model:open="dialog" :title="dialogTitle || ''">
      <template #closeIcon>
        <span>×</span>
      </template>
      <slot name="dialog-content"></slot>
    </SubModal>

    <AuditModal v-model:open="auditDialog" title="审核" width="500px">
      <template #closeIcon>
        <span>×</span>
      </template>
      <Form ref="auditForm" :model="auditData" :colon="false">
        <FormItem label="审核状态" name="status">
          <Select v-model:value="auditData.status">
            <Select.Option :value="1">通过</Select.Option>
            <Select.Option :value="0">不通过</Select.Option>
          </Select>
        </FormItem>
        <FormItem
          label="审核意见"
          name="reason"
          :rules="[
            {
              validator: (_, value) =>
                !!auditData.status || !!value
                  ? Promise.resolve()
                  : Promise.reject('请输入原因'),
            },
          ]"
        >
          <Input.TextArea v-model:value="auditData.reason" :rows="4" />
        </FormItem>
      </Form>
      <template #footer>
        <Button type="primary" @click="audit">确定</Button>
        <Button @click="auditDialog = false">取消</Button>
      </template>
    </AuditModal>
  </div>
</template>

<style scoped>
.app-table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  margin-bottom: 16px;
  background: linear-gradient(to right, #fff, #fafafa);
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 3%);
}

.toolbar-left {
  display: flex;
  gap: 16px;
  align-items: center;
}

.toolbar-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toolbar-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  color: #1f1f1f;
}

.toolbar-subtitle {
  font-size: 13px;
  line-height: 1.4;
  color: #8c8c8c;
}

.toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.filter-container {
  margin-bottom: 16px;
  overflow: hidden;
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.filter-card {
  background: #fafafa;
  border: 1px solid #e8e8e8;
  transition: all 0.3s ease;
}

.filter-card:hover {
  border-color: #d9d9d9;
  box-shadow: 0 2px 8px rgb(0 0 0 / 4%);
}

.filter-card :deep(.ant-card-body) {
  padding: 20px;
}

.filter-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-left: 8px;
}

.table-container {
  padding: 2px;
  background: #fff;
  border-radius: 10px;
}

:deep(.readonly-form .ant-form-item-control-input) {
  opacity: 1;
}

:deep(.ant-card-body) {
  padding: 16px;
}

:deep(.ant-form-item) {
  margin-bottom: 16px;
}

:deep(.vxe-table) {
  font-size: 14px;
}

:deep(.vxe-table--render-default .vxe-body--row.row--striped) {
  background-color: #fafafa;
}

:deep(.vxe-table--render-default .vxe-body--row:hover) {
  background-color: #f0f0f0;
}

:deep(.keyword-highlight) {
  font-weight: bold;
  color: #ff4d4f;
}
</style>
