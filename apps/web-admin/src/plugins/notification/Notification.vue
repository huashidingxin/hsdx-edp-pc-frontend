<script setup lang="ts">
import { ref } from 'vue';

const notifications = ref<Map<string, string>>(new Map());
const options: any = ref({
  closable: true,
  color: '',
  duration: 5000,
  icon: '',
  text: '',
  title: '',
  type: '',
  variant: '',
});
function show(opts: any) {
  // eslint-disable-next-line no-restricted-globals
  const notificationId = opts.id || self.crypto.randomUUID();
  const notificationOpts = Object.assign(options.value, opts);

  notifications.value.set(notificationId, notificationOpts);

  setTimeout(() => removeNotification(notificationId), opts.duration);
}

function removeNotification(notificationId: any) {
  notifications.value.delete(notificationId);
}

defineExpose({
  show,
});
</script>
<template>
  <div class="notificationContainer">
    <v-slide-y-transition group>
      <v-alert
        v-for="(notification, index) in notifications"
        :key="index"
        :closable="notification[1].closable"
        :color="notification[1].color"
        :icon="notification[1].icon"
        :title="notification[1].title"
        :type="notification[1].type"
        :variant="notification[1].variant"
        min-height="100px"
        width="360px"
      >
        {{ notification[1].text }}
      </v-alert>
    </v-slide-y-transition>
  </div>
</template>
<style scoped>
.notificationContainer {
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 201;
  display: grid;
  gap: 0.5em;
}
</style>
