import { createApp } from 'vue';

import vuetify from '#/plugins/vuetify';

import Toast from './Toast.vue';

const colors = ['success', 'info', 'error', 'warning'];
const icons: any = {
  error: 'mdi-close-circle-outline',
  info: 'mdi-information-outline',
  success: 'mdi-check-circle-outline',
  warning: 'mdi-alert-circle-outline',
};

const defaultOptions = {
  color: undefined,
  dismissible: true,
  icon: '',
  text: '',
  timeout: 2000,
  variant: 'elevated',
};

let toastCmp: any = null;
const createToastCmp = (options: object) => {
  // 创建元素节点
  const rootNode = document.createElement('div');
  // 在body标签内部插入此元素
  document.body.append(rootNode);
  // 创建应用实例（第一个参数是根组件。第二个参数可选，它是要传递给根组件的 props，就是<v-snackbar :props="options" />）
  const app = createApp(Toast, {
    ...options,
    hide() {
      // 卸载已挂载的应用实例
      app.unmount();
      // 删除rootNode节点
      rootNode.remove();
    },
  });
  // 新创建的app中没有引用vuetify时会报错提示vuetify没有实例
  // 可以参考 https://github.com/vuetifyjs/vuetify/discussions/16026
  app.use(vuetify);
  // 将应用实例挂载到创建的 DOM 元素上
  return app.mount(rootNode);
};

function getToastCmp() {
  if (!toastCmp) {
    toastCmp = createToastCmp({});
  }

  return toastCmp;
}

function show(options: any) {
  if (typeof options === 'string') {
    defaultOptions.text = options;
    options = {};
  }
  if (options?.color && colors.includes(options.color)) {
    options.icon = icons[options.color];
  }
  getToastCmp().show({ ...defaultOptions, ...options });
}

function close() {
  getToastCmp().close();
}

function createShorthands() {
  const shorthands: any = {};

  colors.forEach(
    (color) =>
      (shorthands[color] = (text: string, options = {}) =>
        show({ color, text, ...options })),
  );

  return shorthands;
}

// // 注册插件app.use()会自动执行install函数
// createToastCmp.install = (app: any) => {
//   // 注册全局属性，类似于 Vue2 的 Vue.prototype
//   app.config.globalProperties.$toastMessage = (options: any) =>
//     createToastCmp(options)?.show();
// };
// 定义show方法用于直接调用
// createToastCmp.show = (options: any) => createToastCmp(options).show();
const toastPlugin = {
  close,
  defaultOptions,
  show,
  ...createShorthands(),
};

toastPlugin.install = (app: any) => {
  app.config.globalProperties.$toast = toastPlugin;
  app.provide('$toast', toastPlugin);
};

export default toastPlugin;
