<script setup lang="ts">
import { ref } from 'vue';

const text = ref('加载中');

const loader = ref(false);

function show(str: string) {
  text.value = str;
  loader.value = true;
}

function close() {
  loader.value = false;
}

defineExpose({
  close,
  show,
});
</script>

<template>
  <v-overlay
    :model-value="loader"
    class="align-center justify-center"
    persistent
  >
    <v-progress-circular color="primary" indeterminate size="64" />
    <div class="text-grey-darken-1 mt-3 text-center">{{ text }}</div>
  </v-overlay>
</template>

<style scoped></style>
