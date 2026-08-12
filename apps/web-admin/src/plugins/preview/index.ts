import { createApp } from 'vue';

import vuetify from '#/plugins/vuetify';

import Preview from './Preview.vue';

let component: any = null;

function createCmp(options: object) {
  // 创建元素节点
  const rootNode = document.createElement('div');
  // 在body标签内部插入此元素
  document.body.append(rootNode);
  // 创建应用实例（第一个参数是根组件。第二个参数可选，它是要传递给根组件的 props，就是<v-snackbar :props="options" />）
  const app = createApp(Preview, {
    ...options,
    close() {
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

function show(urls: any, index = 0, type = 'image') {
  const _component = getCmp();
  if (!Array.isArray(urls)) {
    urls = [urls];
  }
  _component.show(urls, index, type);
  return _component;
}
//
// function close() {
//   getCmp().close();
// }

const plugin: any = {
  close,
  show,
};

plugin.install = (app: any) => {
  app.config.globalProperties.$loader = plugin;
  app.provide('$preview', plugin);
};

export default plugin;
