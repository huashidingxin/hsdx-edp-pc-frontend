<script setup lang="ts">
const props = defineProps({
  detailPage:{
    default:undefined,
    type:Object
  }
})
const detailRef = ref(null)
</script>

<template>
  <component :is="detailPage" ref="detailRef"></component>
</template>

<style scoped>

</style>
