<script setup lang="ts">
const props = defineProps({
  modelValue:{
    default:[],
    type:[Array,String,Number]
  }
})
</script>

<template>
  <v-treeview
    v-model:selected="selection"
    item-value="id"
    return-object
    selectable
    v-bind="$attrs"
  >

  </v-treeview>
</template>

<style scoped>

</style>
