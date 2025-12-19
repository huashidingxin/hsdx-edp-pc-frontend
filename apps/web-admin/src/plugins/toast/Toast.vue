<script setup lang="ts">
import { ref } from 'vue';

// type VARIANT =
//   | 'elevated'
//   | 'flat'
//   | 'outlined'
//   | 'plain'
//   | 'text'
//   | 'tonal'
//   | undefined;
// type COLOR = 'error' | 'info' | 'success' | 'warning' | string;
// 接收数据
// defineProps<{
//   // 可以自己定义其他的参数
//   // snackbar: boolean,//状态  注销：调用即显示 所以不需要
//   color: COLOR; // 颜色
//   message: string; // 消息提示
//   variant: VARIANT; // 类型
// }>();
// 信息提示状态 因为Props接受的数据是只读
const snackbar = ref<boolean | undefined>();
const options = ref({
  color: undefined,
  icon: '',
  location: 'center center',
  text: '',
  timeout: 2000,
  variant: 'elevated',
});
function show(opts = {}) {
  options.value = Object.assign(options.value, opts);
  snackbar.value = true;
}

function close() {
  snackbar.value = false;
}

// 将show方法暴露出去
defineExpose({
  close,
  show,
});
</script>

<template>
  <!--  //vuetify3的snackbar组件-->
  <v-snackbar
    v-model="snackbar"
    :color="options.color"
    :location="options.location"
    :timeout="options.timeout"
    :variant="options.variant"
  >
    <div class="d-flex">
      <v-icon v-if="options.icon" dark left>
        {{ options.icon }}
      </v-icon>

      <div class="ml-3" v-html="options.text"></div>
    </div>
    <!--    <template #actions>-->
    <!--      <v-btn color="white" variant="text" @click="snackbar = false">-->
    <!--        关闭-->
    <!--      </v-btn>-->
    <!--    </template>-->
  </v-snackbar>
</template>
