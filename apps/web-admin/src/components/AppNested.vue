<script setup lang="ts">
import draggable from "vuedraggable";
import AppNested from "#/components/AppNested.vue";

const props = defineProps({
  modelValue:{
    default:()=>([]),
    type:[Array,String,Number]
  },
  itemTitle:{
    default:'title',
    type:String
  },
  itemKey:{
    default:'id',
    type:String
  },
  disabled:{
    default:false,
    type:Boolean
  },
  group:{
    default:'group',
    type:[Object,String]
  },
  options:{
    default:()=>({
      animation: 100,
      ghostClass: "ghost"
    }),
    type:Object
  }
})
const value = ref([])


onMounted(()=>{
  value.value = props.modelValue
})
const emit = defineEmits(['update:model-value'])
watch(value,(newVal)=>{
  emit('update:model-value',newVal)
})


</script>

<template>
  <draggable
    class="v-list-group dragArea "
    tag="div"
    :group="group"
    :list="value"
    :item-key="itemKey"
    :disabled="disabled"
    v-bind="options"
  >
    <template #item="{ element }">
      <v-list-item class="border-dashed  border">
          <p>{{ element.title }}</p>
          <AppNested v-model="element.children" :group="group" :disabled="disabled" :item-key="itemKey" v-bind="options" />
      </v-list-item>
    </template>
  </draggable>
</template>

<style  scoped>
.dragArea {
  min-height: 20px;
  /*outline: 1px dashed;*/
}
</style>
