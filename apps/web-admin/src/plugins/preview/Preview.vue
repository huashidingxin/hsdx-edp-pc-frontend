<script setup lang="ts">
import { ref } from 'vue';

import { useDisplay } from 'vuetify';

const preview = ref(false);
const urls = ref([]);
const index = ref(0);
const type = ref('image');
const { mobile } = useDisplay();
function show(list: any, currentIndex = 0, mediaType = 'image') {
  urls.value = list;
  index.value = currentIndex;
  type.value = mediaType;
  preview.value = true;
}
function close() {
  preview.value = false;
}

function prev() {
  let prevIndex = index.value - 1;
  if (prevIndex < 0) {
    prevIndex = urls.value.length - 1;
  }
  index.value = prevIndex;
}

function next() {
  let nextIndex = index.value + 1;
  if (nextIndex >= urls.value.length) {
    nextIndex = 0;
  }
  index.value = nextIndex;
}

defineExpose({
  close,
  show,
});
</script>

<template>
  <v-dialog v-model="preview" max-height="90vw" :max-width="mobile ? '90vw' : (type === 'image' ? '60vw' : '40vw')">
    <v-hover v-slot="{ isHovering, props }">
      <v-card class="d-flex justify-center bg-black" v-bind="props">
        <v-img v-if="type === 'image'" :src="urls[index]"  max-height="90vh">
          <div
            v-if="isHovering"
            class="h-100 d-flex flex-column position-relative justify-center"
          >
            <div
              class="d-flex justify-space-between align-center w-100 bg-transparent pt-5"
            >
              <v-btn color="transparent" icon @click="prev">
                <v-icon size="48">mdi-chevron-left</v-icon>
              </v-btn>
              <v-btn color="transparent" icon @click="next">
                <v-icon size="48">mdi-chevron-right</v-icon>
              </v-btn>
            </div>

            <div class="position-absolute w-100 bottom-0 text-center">
              <div class="mx-6">
                {{ index + 1 }}
                /{{ urls.length }}
              </div>
            </div>

            <div class="position-absolute right-0 top-0">
              <v-btn color="transparent" icon @click="close">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </div>
          </div>
        </v-img>
        <div v-else-if="type == 'video'" class="position-relative" >
          <video :src="urls[index]" controls style="max-height: 90vh;" class="mx-auto"></video>
          <div class="position-absolute right-0 top-0">
            <v-btn color="transparent" icon @click="close">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </div>
        </div>
		  <div v-else style="width: 100vw;height: 80vh">
			  <iframe :src="'https://dev2.cpzhongzhou.com/file-preview?file='+urls[index]" width="40%" height="100%"></iframe>
			  <div class="position-absolute right-0 top-0">
				  <v-btn color="transparent" icon @click="close">
					  <v-icon>mdi-close</v-icon>
				  </v-btn>
			  </div>
		  </div>
      </v-card>
    </v-hover>
  </v-dialog>
</template>

<style scoped></style>
