import { createApp } from 'vue';

import vuetify from '#/plugins/vuetify';

import Notification from './Notification.vue';

const types = ['success', 'info', 'error', 'warning'];
// const icons: any = {
//   error: 'mdi-close-circle-outline',
//   info: 'mdi-information-outline',
//   success: 'mdi-check-circle-outline',
//   warning: 'mdi-alert-circle-outline',
// };
let component: any = null;
const defaultOptions = {
  closable: true,
  color: '',
  duration: 5000,
  icon: '',
  text: '',
  title: '',
  type: '',
  variant: 'flat',
};
// let notifications: any[] = [];
function createCmp(options: object) {
  // 创建元素节点
  const rootNode = document.createElement('div');
  // 在body标签内部插入此元素
  document.body.append(rootNode);
  // 创建应用实例（第一个参数是根组件。第二个参数可选，它是要传递给根组件的 props，就是<v-snackbar :props="options" />）
  const app = createApp(Notification, {
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
}

function getCmp() {
  if (!component) {
    component = createCmp({});
  }

  return component;
}

function show(options: any) {
  if (typeof options === 'string') {
    defaultOptions.text = options;
    options = {};
  }
  if (options?.type && types.includes(options.type)) {
    options.color = undefined;
    options.icon = undefined;
  }
  getCmp().show({ ...defaultOptions, ...options });
}

function close() {
  getCmp().close();
}

function createShorthands() {
  const shorthands: any = {};

  types.forEach(
    (type) =>
      (shorthands[type] = (text: string, options = {}) =>
        show({ text, type, ...options })),
  );

  return shorthands;
}

const plugin = {
  close,
  defaultOptions,
  show,
  ...createShorthands(),
};

plugin.install = (app: any) => {
  app.config.globalProperties.$notify = plugin;
  app.provide('$notify', plugin);
};

export default plugin;
