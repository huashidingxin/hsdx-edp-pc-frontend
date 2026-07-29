<script setup>
import { computed, onMounted, ref, shallowRef, watch } from 'vue';

import {
  AutoComplete,
  Button,
  Cascader,
  Checkbox,
  DatePicker,
  DateRangePicker,
  FormItem,
  Input,
  InputNumber,
  RadioGroup,
  Select,
  Switch,
  TextArea,
  TimePicker,
  TreeSelect,
  CheckboxGroup,
  SpaceCompact,
} from 'antdv-next';
import dayjs from 'dayjs';
import { cloneDeep, debounce, isEqual } from 'lodash-es';
import { Solar } from 'lunar-javascript';

import Resource from '#/api/resource';
import AppUpload from '#/components/AppUpload.vue';
import AppAddress from './AppAddress.vue';

const props = defineProps({
  field: {
    default: () => ({}),
    type: Object,
  },
  name: {
    default: '',
    type: String,
  },
  // 表单只读：渲染禁用的输入组件
  readonly: {
    default: false,
    type: Boolean,
  },
  modelValue: {
    default: '',
    type: [Object, String, Array, Number, Boolean],
  },
  // 纯显示模式下显示的文本，优先于 modelValue
  displayValue: {
    default: '',
    type: [String, Number],
  },
  // 纯显示模式：不渲染表单组件，只显示文本
  displayOnly: {
    default: false,
    type: Boolean,
  },
  showLabel: {
    default: true,
    type: Boolean,
  },
  // 是否渲染 FormItem 包裹（包含 label）
  withFormItem: {
    default: true,
    type: Boolean,
  },
});
const emit = defineEmits(['update:modelValue', 'update:model-value']);
// 获取 useAccess，如果不存在则使用默认值
let hasAccessByCodes;
try {
  const access = useAccess();
  hasAccessByCodes = access.hasAccessByCodes;
} catch {
  hasAccessByCodes = () => true;
}

const router = useRouter() || {
  push: (_path) => {},
};

const value = ref('');
const defaultValue = ref(null);
const defaultAttrs = ref({});
const defaultEvents = ref({});
const component = shallowRef(Input);
const attrs = ref({});

const fieldRef = ref(null);
const attrItems = ref([]);
let formatter = (e) => e;

function normalizeFieldValue(field, val) {
  switch (field?.type) {
    case 'checkbox-group': {
      if (val === undefined || val === null || val === '') {
        return [];
      }
      return Array.isArray(val) ? val : [val];
    }
    case 'checkbox':
      attrs.value.checked = val;
      return val ? 1 : 0;
    default: {
      return val;
    }
  }
}

// DatePicker 组件值：字符串 ↔ dayjs 自动转换
const componentValue = computed({
  get() {
    const val = normalizeFieldValue(props.field, value.value);
    if (val && typeof val === 'string') {
      const type = props.field.type;
      if (type === 'date') return dayjs(val, 'YYYY-MM-DD');
      if (type === 'datetime') return dayjs(val);
      if (type === 'time') return dayjs(val, 'HH:mm:ss');
    }
    return val;
  },
  set(val) {
    value.value = val;
  },
});

// 计算纯显示模式下显示的文本
const displayOnlyText = computed(() => {
  // 优先使用 displayValue
  if (
    props.displayValue !== '' &&
    props.displayValue !== null &&
    props.displayValue !== undefined
  ) {
    return props.displayValue;
  }

  // 对于选择类型，从 options 中查找对应的 label
  if (
    ['autocomplete', 'radio', 'select', 'tree-select'].includes(
      props.field.type,
    )
  ) {
    const options = props.field.options || props.field.attrs?.options || [];
    const fieldNames = props.field.attrs?.fieldNames || {
      label: 'name',
      value: 'id',
    };
    const findLabel = (opts, val) => {
      for (const opt of opts) {
        if (opt[fieldNames.value] === val || opt.id === val) {
          return opt[fieldNames.label] || opt.name;
        }
        if (opt.children) {
          const found = findLabel(opt.children, val);
          if (found) return found;
        }
      }
      return null;
    };
    const label = findLabel(options, props.modelValue);
    if (label) return label;
  }

  // 默认返回 modelValue
  if (
    props.modelValue === null ||
    props.modelValue === undefined ||
    props.modelValue === ''
  ) {
    return '-';
  }
  return props.modelValue;
});

// 是否为纯显示模式（不渲染输入组件，只显示文本）
const isDisplayOnly = computed(() => {
  return props.displayOnly || props.field?.displayOnly;
});

// 是否使用 FormItem 包裹
const shouldUseFormItem = computed(() => {
  return props.withFormItem && props.field.type !== 'hidden';
});

// FormItem 的 props
const formItemProps = computed(() => {
  if (!shouldUseFormItem.value) return {};
  let _props = {
    ...props.field.formItemProps,
    label: props.showLabel ? props.field.label : '',
    name: props.field.field,

    rootClass: props.field.rootClass,
    validateFirst: props.field.validateFirst !== false,
  };
  if (isDisplayOnly.value) {
    return _props;
  }
  return {
    ..._props,
    required: props.field.required,
    rules: props.field.rules,
  };
});

function filterOption(input, option) {
  const searchValue = input.toLowerCase();
  const fieldsToCheck = [
    option?.label,
    option?.name,
    option?.pinyin,
    option?.abbr,
  ];
  return fieldsToCheck.some(
    (field) => field && String(field).toLowerCase().includes(searchValue),
  );
}

function initComponent() {
  if (props.field.loadRemoteOptions) {
    defaultEvents.value = {
      onSearch: debounce((e) => {
        loadRemoteOptions(e);
      }, 500),
    };

    // 初始化加载远程数据
    loadRemoteOptions();
  }

  switch (props.field.type) {
    case 'autocomplete': {
      defaultAttrs.value = {
        fieldNames: { label: 'name', value: 'id' },
        allowClear: !props.field.attrs?.readonly && !props.readonly,
      };
      defaultEvents.value = {};
      component.value = AutoComplete;
      break;
    }
    case 'combobox': {
      defaultAttrs.value = {
        allowClear: !props.field.attrs?.readonly && !props.readonly,
        filterOption: true,
      };
      component.value = AutoComplete;
      break;
    }
    case 'component': {
      component.value = props.field.component;
      break;
    }
    case 'date': {
      component.value = DatePicker;
      let pickerType = props.field?.attrs?.picker || 'date';
      const pickerTypes = {
        date: 'YYYY-MM-DD',
        year: 'YYYY',
        month: 'YYYY-MM',
      };
      defaultAttrs.value = {
        format: pickerTypes[pickerType],
        valueFormat:pickerTypes[pickerType]
      };
      // formatter = (e) => (e?.format ? e.format(pickerTypes[pickerType]) : e);
      break;
    }
    case 'daterange': {
      component.value = DateRangePicker;
      let pickerType = props.field?.attrs?.picker || 'date';
      const pickerTypes = {
        date: 'YYYY-MM-DD',
        year: 'YYYY',
        month: 'YYYY-MM',
      };
      defaultAttrs.value = {
        format: pickerTypes[pickerType],
      };
      formatter = (e) => (e?.format ? e.format(pickerTypes[pickerType]) : e);
      break;
    }
    case 'datetime': {
      component.value = DatePicker;
      defaultAttrs.value = {
        showTime: true,
        format: 'YYYY-MM-DD HH:mm:ss',
        inputProps: {
          ...(props.field.inputProps || []),
          rules: props.field.rules,
        },
        rules: props.field.rules,
      };

      formatter = (e) => (e?.format ? e.format('YYYY-MM-DD HH:mm:ss') : e);
      break;
    }
    case 'editor': {
      defaultAttrs.value = {};
      component.value = TextArea;
      break;
    }
    case 'file': {
      defaultAttrs.value = {
        maxCount: props.field.attrs?.multiple ? 10 : 1,
      };
      component.value = AppUpload;
      break;
    }
    case 'number': {
      defaultAttrs.value = {};
      component.value = InputNumber;
      break;
    }
    case 'radio': {
      defaultAttrs.value = {};
      component.value = RadioGroup;
      break;
    }
    case 'checkbox': {
      defaultAttrs.value = {
        checkedValue: 1,
        unCheckedValue: 0,
      };
      component.value = Checkbox;
      defaultEvents.value = {
        change: (e) => {
          emit('update:modelValue', e ? 1 : 0);
        },
      };
      break;
    }
    case 'checkbox-group': {
      defaultAttrs.value = {};
      component.value = CheckboxGroup;
      break;
    }
    case 'region': {
      defaultAttrs.value = {
        allowClear: !props.field.attrs?.readonly && !props.readonly,
      };
      component.value = AppAddress;
      break;
    }
    case 'select': {
      defaultAttrs.value = {
        fieldNames: { label: 'name', value: 'id' },
        allowClear: !props.field.attrs?.readonly && !props.readonly,
        showSearch: true,
        filterOption,
        style: { width: '100%' },
      };
      component.value = Select;
      break;
    }
    case 'switch': {
      defaultAttrs.value = {
        unCheckedValue: 0,
        checkedValue: 1,
      };
      component.value = Switch;
      formatter = (e) => {
        return e ? 1 : 0;
      };
      break;
    }
    case 'textarea': {
      defaultAttrs.value = {
        rows: 4,
      };
      component.value = TextArea;
      break;
    }
    case 'time': {
      component.value = TimePicker;
      defaultAttrs.value = {
        format: 'HH:mm:ss',
      };
      formatter = (e) => (e?.format ? e.format('HH:mm:ss') : e);
      break;
    }
    case 'tree-select': {
      defaultAttrs.value = {
        fieldNames: { label: 'name', value: 'id', children: 'children' },
        allowClear: !props.field.attrs?.readonly && !props.readonly,
        treeDefaultExpandAll: false,
      };
      component.value = TreeSelect;
      break;
    }
    default: {
      component.value = Input;
    }
  }

  defaultAttrs.value.allowClear = true;
  // defaultAttrs.value.style = {width: '100%'}
  if (!props.field.attrs?.placeholder) {
    defaultAttrs.value.placeholder = props.field.label;
  }

  attrs.value = { ...defaultAttrs.value, ...props.field.attrs };

  if (isDisplayOnly.value) {
    delete attrs.value.allowClear;
  }
}

/**
 * 从远程 API 加载字段的 options 数据
 * @param {string} keyword - 搜索关键词
 * @param {boolean} refresh - 是否强制刷新（忽略缓存）
 */
async function loadRemoteOptions(keyword = '', refresh = false) {
  const remoteConfig = props.field.loadRemoteOptions;
  if (!remoteConfig?.apiUrl) return;

  // 如果已有数据且不是强制刷新，则不再请求
  if (!refresh && defaultAttrs.value.options?.length) {
    return;
  }

  try {
    const api = new Resource(remoteConfig.apiUrl);
    const { data } = await api.list({
      keyword,
      per_page: 'all',
      ...remoteConfig.params,
    });

    defaultAttrs.value.options = data || [];
    // 保存完整数据，用于前端过滤
    if (!keyword) {
      attrItems.value = data || [];
    }
  } catch (error) {
    console.error('加载远程选项失败:', error);
    defaultAttrs.value.options = [];
  }
}

function filter(callback = null) {
  // 选择类型的
  defaultAttrs.value.options = callback
    ? callback(cloneDeep(attrItems.value))
    : cloneDeep(attrItems.value);

  return defaultAttrs.value.options;
}

function reset() {
  value.value = defaultValue.value;
}

watch(value, (newVal) => {
  const formattedValue = formatter(newVal);
  if (isEqual(formattedValue, props.modelValue)) {
    return;
  }
  emit('update:modelValue', formattedValue);
});

watch(
  () => props.modelValue,
  (newVal) => {
    defaultValue.value = cloneDeep(
      normalizeFieldValue(
        props.field,
        newVal === undefined ? props.field.default : newVal,
      ),
    );
    value.value = newVal;
  },
  { immediate: true },
);

function getClass(_field) {
  const classes = {};
  // if (field.rules?.length) {
  //   for (let i in field.rules) {
  //     if (field.rules[i](undefined) !== true) {
  //       classes = {'required-field': true};
  //       break;
  //     }
  //   }
  // }

  return classes;
}

onMounted(() => {});

watch(
  () => props.field,
  () => {
    initComponent();
  },
  { immediate: true, deep: true },
);

defineExpose({
  reset,
  filter,
  fieldRef,
});

// 农历转换函数
function getLunarDate(date) {
  if (!date) return '';
  try {
    const solar = Solar.fromYmd(date.year(), date.month() + 1, date.date());
    const lunar = solar.getLunar();
    const dayInChinese = lunar.getDayInChinese();
    return dayInChinese == '初一'
      ? `${lunar.getMonthInChinese()}月`
      : dayInChinese;
  } catch (e) {
    return '';
  }
}

function getJieQi(date) {
  const solar = Solar.fromYmd(date.year(), date.month() + 1, date.date());
  const lunar = solar.getLunar();
  return lunar.getJieQi();
}

function getYearInGanZhi(date) {
  const solar = Solar.fromYmd(date.year(), 1, 1);
  const lunar = solar.getLunar();
  return lunar.getYearInGanZhi();
}
function getMonthInGanZhi(date) {
  const solar = Solar.fromYmd(date.year(), date.month() + 1, 1);
  const lunar = solar.getLunar();
  return lunar.getMonthInGanZhi();
}
</script>

<template>
  <!-- hidden 字段 -->
  <div v-if="field.type === 'hidden'" ref="fieldRef"></div>

    <!-- 动态包裹组件 -->
    <component
      :is="shouldUseFormItem ? FormItem : 'div'"
      v-bind="shouldUseFormItem ? formItemProps : {}"
      :class="!shouldUseFormItem ? getClass(field) : {}"
    >
      <slot name="default">
        <!-- 纯显示模式：只显示文本 -->
        <div
          v-if="isDisplayOnly"
          class="min-h-[22px] leading-[22px] text-gray-800"
          :class="[
            shouldUseFormItem ? '' : 'flex-1',
            field.attrs?.displayOnlyClass,
          ]"
        >
          {{ displayOnlyText }}
        </div>
        <!-- 编辑模式：渲染输入组件 -->
        <SpaceCompact v-else block>
          <component
            v-if="field.slots?._prefix"
            :is="field.slots._prefix.component"
            v-bind="field.slots._prefix.props || {}"
          ></component>
          <component
            ref="fieldRef"
            :is="component"
            :class="shouldUseFormItem ? '' : 'flex-1'"
            :value="componentValue"
            @update:value="componentValue = $event"
            :placeholder="field.attrs?.placeholder"
            :label="field.label || field.attrs?.label"
            v-bind="attrs"
            :disabled="field.attrs?.readonly || readonly"
            v-on="{ ...defaultEvents, ...field.events }"
            :key="field.field"
            :field-name="field.field"
          >
            <!-- 农历日期单元格渲染 -->
            <template
              v-if="
                ['date', 'datetime'].includes(field.type) &&
                field.attrs?.showLunar
              "
              #cellRender="{ current, info }"
            >
              <component
                :is="info.originNode"
                v-if="!['date', 'year', 'month'].includes(info.type)"
              />
              <div
                v-else
                class="ant-picker-cell-inner ant-picker-cell-inner__lunar"
              >
                <template v-if="info.type == 'date'">
                  <div class="solar-date">{{ current.date() }}</div>
                  <div class="lunar-date">
                    {{
                      getJieQi(current)
                        ? getJieQi(current)
                        : getLunarDate(current)
                    }}
                  </div>
                </template>
                <template v-if="info.type == 'year'">
                  <div class="solar-date">{{ current.year() }}</div>
                  <div class="lunar-date">{{ getYearInGanZhi(current) }}</div>
                </template>
                <template v-if="info.type == 'month'">
                  <div class="solar-date">{{ current.month() + 1 }}</div>
                  <div class="lunar-date">{{ getMonthInGanZhi(current) }}</div>
                </template>
              </div>
            </template>

            <template
              v-for="(slot, slotName) in field.slots"
              :key="index"
              #[slotName]="slotProps"
            >
              <template v-if="!slot.hide?.(slotProps)">
                <component
                  v-if="slot.component"
                  :is="slot.component"
                  v-bind="{ ...slot.props, ...slot.bind?.(slotProps) }"
                />
              </template>
            </template>

            <template
              v-if="
                ['select', 'autocomplete', 'tree-select'].includes(field.type)
              "
              #suffixIcon
            >
              <div
                v-if="
                  field.attrs?.create?.url &&
                  (!field.attrs.create.permission ||
                    hasAccessByCodes([field.attrs.create.permission]))
                "
                style="display: flex; gap: 4px; align-items: center"
              >
                <Button
                  type="link"
                  size="small"
                  @click.stop="router.push(field.attrs.create.url)"
                  style="height: auto; padding: 0 4px"
                >
                  <template #icon><span>+</span></template>
                  新建{{ field.label }}
                </Button>
              </div>
              <Button
                v-if="Boolean(field.attrs?.refresh)"
                type="link"
                size="small"
                @click.stop="field.attrs.refresh()"
                style="height: auto; padding: 0 4px"
              >
                <template #icon><span>↻</span></template>
              </Button>
            </template>
            <template
              v-if="
                ['select', 'autocomplete', 'tree-select'].includes(field.type)
              "
              #notFoundContent
            >
              <div style="padding: 8px">
                <Button
                  v-if="
                    field.attrs?.create?.url &&
                    (!field.attrs.create.permission ||
                      hasAccessByCodes([field.attrs.create.permission]))
                  "
                  type="link"
                  block
                  @click="router.push(field.attrs.create.url)"
                >
                  <template #icon><span>+</span></template>
                  新建{{ field.label }}
                </Button>
                <span v-else>无数据</span>
              </div>
            </template>
          </component>
        </SpaceCompact>
      </slot>
    </component>
</template>

<style scoped>
.required-field :deep(.ant-form-item-label > label) {
  position: relative;
}

.required-field :deep(.ant-form-item-label > label::before) {
  display: inline-block;
  margin-right: 4px;
  font-family: SimSun, sans-serif;
  font-size: 14px;
  line-height: 1;
  color: #ff4d4f;
  content: '*';
}

/* 农历日期样式 */
:deep(.ant-picker-cell-inner__lunar) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: auto;
  min-height: 30px;
  padding: 2px 0;
}

/* 修复当天选中状态的蓝色框样式 */
.ant-picker-cell-selected .ant-picker-cell-inner__lunar,
.ant-picker-cell-in-view.ant-picker-cell-today .ant-picker-cell-inner__lunar {
  position: relative;
  z-index: 1;
  height: unset;
  padding: 2px;
}

.ant-picker-cell-selected .lunar-date {
  color: #fff;
}

:deep(.solar-date) {
  font-size: 14px;
  line-height: 1.2;
}

:deep(.lunar-date) {
  margin-top: 2px;
  font-size: 10px;
  line-height: 1.2;
  color: #999;
}

:deep(.ant-picker-cell-selected .lunar-date),
:deep(.ant-picker-cell:hover .lunar-date) {
  color: rgb(255 255 255 / 70%);
}
</style>
