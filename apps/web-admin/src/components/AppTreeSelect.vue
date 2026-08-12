<script setup lang="ts">
import {getTree} from '#/utils/index.js'

const attrs = defineProps({
  label: {
    default: '请选择',
    type: String
  },
  items: {
    type: Array,
    default: () => ([])
  },
  readonly: {
    default: false,
    type: Boolean
  },
  modelValue: {
    type: Array,
    default: undefined
  },
  returnObject: {
    default: false,
    type: Boolean
  },
  itemTitle: {
    default: 'name',
    type: String
  },
  itemValue: {
    default: 'id',
    type: String
  },
  rules:{
    default: ()=>([]),
    type: Array
  },

  //  | 'single-leaf'
  //  | 'leaf'
  //  | 'independent'
  //  | 'single-independent'
  //  | 'classic'
  treeProps: {
    default: () => ({
      selectStrategy: 'classic',// 多选
    }),
    type: Object
  },
  maxSelectionVisible: {
    default: undefined,
    type: [Number, String]
  }
})
const emit = defineEmits(['update:model-value'])
const $attrs = useAttrs()
const visible = ref(false)

const selected = ref([])

function updateSelected(e) {
  console.log(e)
  let value = e;
  if (!e?.length) {
    value = [];
  } else {
    if (!attrs.returnObject) {
      value = e.map((v) => {
        return v[attrs.itemValue]
      })
    }
  }

    if(!multiple.value && e.length){
        visible.value = false
    }
console.log(multiple.value ? value : value[0])
  emit('update:model-value', multiple.value ? value : value[0])
}

const activator = ref('activator' + (Math.random() * 100).toFixed(0))
const multiple = computed(() => {
  return !attrs.treeProps.selectStrategy?.startsWith('single');
})
watch(() => attrs.modelValue, (newValue) => {
  nextTick(() => {
    setSelected()
  })
})

watch(() => attrs.items, (newVal) => {
  setSelected()
})

function setSelected() {
  if (attrs.items.length && attrs.modelValue) {
    // 单选
    if (!multiple.value) {
      if (typeof attrs.modelValue == 'object') {
        selected.value = Array.isArray(attrs.modelValue) ? attrs.modelValue : [attrs.modelValue]
      } else {
        const obj = attrs.items.find((v) => v[attrs.itemValue] == attrs.modelValue)
        if (obj) {
          selected.value = [obj]
        }
      }
    } else {
      // 多选
      selected.value = [];
      attrs.modelValue.forEach((item) => {
        if (typeof item == 'object') {
          selected.value.push(attrs.items.find((v) => v[attrs.itemValue] == item[attrs.itemValue]))
        } else {
          selected.value.push(attrs.items.find((v) => v[attrs.itemValue] == item))
        }
      })

    }

  } else {
    selected.value = [];
  }
}
onMounted(()=>{
  nextTick(()=>{
    selected.value = []
  })
})
</script>

<template>
  <div>
    <div :id="activator">
      <v-select
        :model-value="multiple ? selected : selected[0]"
        focused
        :active="selected.length > 0"
        :label="label"
        :items="items"
        readonly
        :clearable="!readonly"
        v-bind="$attrs"
        return-object
        :rules="rules"
        @click:clear="selected=[]"
      >
        <template v-if="selected.length > 0" v-slot:chip="{ props, item,index }">
          <div>
            <v-chip
              v-if="(!maxSelectionVisible || index < maxSelectionVisible || selected.length == 1)"
              :text="item.raw[itemTitle]"></v-chip>

            <span
              v-if="index === maxSelectionVisible"
              class="text-grey text-caption align-self-center"
            >
              (+{{ selected.length - maxSelectionVisible }})
            </span>
          </div>
        </template>

      </v-select>
    </div>

    <v-menu
      v-model="visible"
      :close-on-content-click="false"
      :activator="'#'+activator"
      transition="fade-transition"
    >
      <v-card>
        <v-treeview
          v-model:selected="selected"
          @update:selected="updateSelected"
          open-all
          selectable
          :items="getTree(items)"
          :itemTitle="itemTitle"
          :itemValue="itemValue"
          selected-color="primary"
          return-object
          v-bind="treeProps"
        >
        </v-treeview>
       <div class="pb-2">
         <slot name="append-item"></slot>
       </div>
      </v-card>
    </v-menu>
  </div>
</template>

<style scoped>

</style>
