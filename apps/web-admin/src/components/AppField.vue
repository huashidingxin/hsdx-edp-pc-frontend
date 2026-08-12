<script setup lang="ts">
import {isEqual} from 'lodash';
import {onMounted, ref, shallowRef, watch} from 'vue';

import {cloneDeep, debounce} from 'lodash';
import {
  VAutocomplete,
  VSelect,
  VSwitch,
  VTextarea,
  VTextField,
  VCombobox
} from 'vuetify/components';
import {VDateInput} from "vuetify/labs/VDateInput";
import FormRegion from "#/components/AppRegion";
import FormDatetime from "#/components/AppDatetime.vue";
import AppUpload from "#/components/AppUpload.vue";
import AppEditor from '#/components/AppEditor'
import Resource from "#/api/resource";
import AppTreeSelect from "#/components/AppTreeSelect.vue";
import {useAccess} from "@vben/access";
import {isObject} from "lodash-es";
const { hasAccessByCodes,hasAccessByRoles } = useAccess();

/**
 * fields
 *   {
 *     field: 'category_id',
 *     type: 'autocomplete',
 *     col: 4,
 *     label: '合同类型',
 *     updateSearch:{
 *       apiUrl: 'categories',
 *       params:{
 *         pePage:'all',
 *       }
 *     },
 *     attrs: {
 *       chips: false,
 *       closableChips: true,
 *       placeholder: '输入名称搜索',
 *       multiple:true,
 *     },
 *     events: {
 *       // 'update:search': debounce(async (e) => {
 *       //   if (e) {
 *       //     await getFiledItems(e.field,{name: e});
 *       //   }
 *       // }, 500),
 *     },
 *     slots: [
 *       {
 *         name: 'chip',
 *         component: markRaw(VChip),
 *         bind: (e: any) => {
 *           return {
 *             ...e.props,
 *             //prependAvatar: e.item.raw.image,
 *             text: e.item.raw.name || '',
 *           };
 *         },
 *       },
 *       {
 *         name: 'item',
 *         component: markRaw(VListItem),
 *         bind: (e: any) => {
 *           return {
 *             ...e.props,
 *             //prependAvatar: e.item.raw.image,
 *             text: e.item.raw.name,
 *             // subtitle: e.item.raw.remarks,
 *           };
 *         },
 *       },
 *     ],
 *   },
 *  {
 *     field:'image',
 *     type: 'file',
 *     col: 12,
 *     label: '图片',
 *     attrs:{
 *       multiple:true,
 *       fileType:'image',
 *
 *     }
 *   },
 *   {
 *     field:'video',
 *     type: 'file',
 *     col: 12,
 *     label: '视频',
 *     attrs:{
 *       multiple:false,
 *       fileType:'video',
 *       onSnapshot:(e)=>{
 *         editingItem.value.cover = e.data
 *       }
 *     }
 *   },
 *   {
 *     field:'cover',
 *     type: 'file',
 *     col: 12,
 *     label: '图片',
 *     attrs:{
 *       multiple:false,
 *       fileType:'image',
 *
 *     }
 *   },
 *   {
 *     field:'doc',
 *     type: 'file',
 *     col: 12,
 *     label: '文件',
 *     attrs:{
 *       multiple:true,
 *       fileType:'file',
 *       returnObject:true,
 *     },
 *     slots:[
 *       {
 *         name:'default',
 *         content:'1111',
 *
 *       }
 *     ]
 *   },
 */
const props = defineProps({
  field: {
    default: () => {
    },
    type: Object,
  },
  name: {
    default: '',
    type: String,
  },
  readonly: {
    default: false,
    type: Boolean,
  },
  modelValue: {
    default: '',
    type: [Object, String, Array, Number,Boolean],
  },
});

const emit = defineEmits(['update:model-value']);

const $toast = inject('$toast')
const value: any = ref('');
const defaultValue: any = ref(null);
const defaultAttrs = ref({});
const defaultEvents = ref({});
const component: any = shallowRef(VTextField);

const fieldRef = ref(null)
const attrItems = ref([])
let formatter = (e)=>{return e}
function initComponent() {
  if(props.field.updateSearch) {
    defaultEvents.value = {
      'update:search': debounce((e)=>{
        updateSearch(e)
      },500),
      'click:append': async ()=>{
        defaultAttrs.value.loading = true
        await updateSearch('',true)
        defaultAttrs.value.loading = false
      }
    }
    if(!props.field.attrs?.readonly && !props.readonly){
      defaultAttrs.value.appendIcon = 'mdi-refresh'
    }

    updateSearch()
  }

  switch (props.field.type) {
    case 'switch': {
      defaultAttrs.value = {color: 'primary', falseValue: 0, trueValue: 1};
      component.value = VSwitch;
      // value.value = false
      formatter = (e)=>{
        return e ? 1 : 0;
      }
      break;
    }
    case 'date': {
      component.value = VDateInput;
      //defaultAttrs.value = {multiple:'string'}
      formatter = (e)=>{
        // return e ? dayjs(e).format("YYYY-MM-DD") : undefined
        return e;
      }
      break;
    }
    case 'datetime':{
      component.value = FormDatetime
      defaultAttrs.value = {
        inputProps:{...(props.field.inputProps || []),rules:props.field.rules}
      }
      break;
    }
    case 'tree-select': {
      defaultAttrs.value = Object.assign(defaultAttrs.value,{
        itemTitle: 'name',
        itemValue: 'id',
        autoSelectFirst: true,
        clearable: !props.field.attrs?.readonly && !props.readonly,
        itemColor:'primary'
      });
      component.value = AppTreeSelect;
      break;
    }
    case 'autocomplete': {
      defaultAttrs.value = Object.assign(defaultAttrs.value, {
        itemTitle: 'name',
        itemValue: 'id',
        autoSelectFirst: true,
        clearable: !props.field.attrs?.readonly && !props.readonly,
        itemColor:'primary'
      });
      component.value = VAutocomplete;
      break;
    }
    case 'select': {
      defaultAttrs.value = Object.assign(defaultAttrs.value,{
        itemTitle: 'name',
        itemValue: 'id',
        autoSelectFirst: true,
        clearable: !props.field.attrs?.readonly && !props.readonly,
        itemColor:'primary'
      });
      component.value = VSelect;
      break;
    }
    case 'combobox':{
      component.value = VCombobox
      break;
    }
    case 'region':{
      component.value = FormRegion
      break;
    }
    case 'textarea': {
      component.value = VTextarea;
      break;
    }
    case 'editor': {
      component.value = AppEditor;
      break;
    }
    case 'file': {
      component.value = AppUpload;
      break;
    }
    case 'component': {
      component.value = props.field.component;
      break;
    }
    case 'number': {
      component.value = VTextField;
      defaultAttrs.value = {type:'number'}
      break;
    }
    default: {
      component.value = VTextField;
    }
  }

  defaultAttrs.value.autocomplete = 'off'
}

async function updateSearch(keyword: string='',refresh=false) {
  if(!props.field.updateSearch?.apiUrl) return;
  // 已经请求过全部不用再请求
  if(!refresh &&  defaultAttrs.value.items?.length){
    return
  }
  const api = new Resource(props.field.updateSearch?.apiUrl)
  const { data } = await api.list({
    keyword,
    per_page:'all',
    ...props.field.updateSearch.params,
    // prioritySort:{key:props.field.updateSearch.priorityKey || 'id',value:props.modelValue}
  })
  defaultAttrs.value.items = data;
  if(!keyword){
    attrItems.value = data;
  }
}

function filter(callback=null) {
  // 选择类型的
  if(callback){
    defaultAttrs.value.items =  callback(cloneDeep(attrItems.value))
  }else{
    defaultAttrs.value.items = cloneDeep(attrItems.value)
  }

  return defaultAttrs.value.items
}

function reset() {
  value.value = defaultValue.value;
}


watch(value, (newVal) => {
  const formattedValue = formatter(newVal);
  if (!isEqual(formattedValue, props.modelValue)) {
    emit('update:model-value', formattedValue);
  }
});

watch(
  () => props.modelValue,
  (newVal) => {
    value.value = newVal;
  },
  {immediate: true},
);

function getClass(field) {
  let classes = {}
  if(field.rules?.length){
    for(let i in field.rules){
      if(field.rules[i](undefined) !== true){
        classes = {'required-field':true}
        break;
      }
    }
  }
  classes.readonly = field.attrs?.readonly || props.readonly
  return classes
}


onMounted(() => {

});

watch(()=>props.field,()=>{
  defaultValue.value = cloneDeep(props.modelValue || props.field.default);

  reset();
  initComponent();
},{immediate: true,deep:true});

defineExpose({
  reset,
  filter,
  fieldRef
});
</script>

<template>
  <div :class="getClass(field)">
    <div v-if="field.type === 'hidden'" ref="fieldRef"></div>
<!--          :rules="Boolean(field.rules) ? field.rules : field.attrs?.rules"-->
    <component
      v-else
      ref="fieldRef"
      :is="component"
      v-model="value"
      :label="field.label || field.attrs?.label"
      :rules="field.rules"
      v-bind="Object.assign(defaultAttrs, field.attrs)"
      :readonly="field.attrs?.readonly || readonly"
      v-on="Object.assign(defaultEvents, field.events)"
      :key="field.field"
      :fieldName="field.field"
    >
      <template
        v-for="(slot, index) in field.slots"
        :key="index"
        #[slot.name]="e"
      >
        <template v-if="!slot.hide?.(e)">
          <component v-if="slot.component" :is="slot.component" v-bind="slot.bind?.(e)"/>
          <div v-bind="slot.bind?.(e)">{{slot.content}}</div>
        </template>
      </template>
      <template v-if="['select','autocomplete','tree-select'].includes(field.type)" #append-item>
        <div class="px-3">
          <v-btn v-if="field.attrs?.create?.url && (!field.attrs.create.permission || hasAccessByCodes([field.attrs.create.permission]))" color="primary" variant="tonal" @click="$router.push(field.attrs.create.url)" class="me-3">
            <v-icon>mdi-plus</v-icon>
            <span class="ms-2">新建{{field.label}}</span>
          </v-btn>
          <v-btn v-if="Boolean(field.attrs?.refresh)" icon="mdi-refresh" color="primary" size="small" variant="tonal" @click="field.attrs.refresh()"></v-btn>
        </div>
      </template>
    </component>
    <slot></slot>
  </div>
</template>

<style scoped></style>
