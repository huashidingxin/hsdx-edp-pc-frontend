/**
 * plugins/index.ts
 *
 * Automatically included in `./src/main.ts`
 */

// Types
import type { App } from 'vue';
import VueUeditorWrap from 'vue-ueditor-wrap';

import Loader from '#/plugins/loader';
import Notification from '#/plugins/notification';
import Preview from '#/plugins/preview';
import Toast from '#/plugins/toast';
import Confirm from '#/plugins/confirm';

import vuetify from './vuetify';
// import VxeUI from 'vxe-pc-ui'
import {
  VxeUI,

  VxeButton,
  VxeButtonGroup,
  VxeDrawer,
  VxeForm,
  VxeFormGroup,
  VxeFormItem,
  VxeIcon,
  VxeLoading,
  VxeModal,
  VxePager,
  VxePrint,
  VxeTooltip,
  VxeUpload,
  VxeSelect,
  VxeInput,
  VxeCheckbox,
  VxeNumberInput,
  VxeRadioGroup,
  VxeImage,
  VxeSwitch,
} from 'vxe-pc-ui'
import 'vxe-pc-ui/lib/style.css'
import VxeTable from 'vxe-table'
import 'vxe-table/lib/style.css'
import {VChip} from "vuetify/components";

function lazyVxeUI (app) {
  app.use(VxeButton)
  app.use(VxeButtonGroup)
  app.use(VxeDrawer)
  app.use(VxeForm)
  app.use(VxeFormGroup)
  app.use(VxeFormItem)
  app.use(VxeIcon)
  app.use(VxeLoading)
  app.use(VxeModal)
  app.use(VxePager)
  app.use(VxePrint)
  app.use(VxeTooltip)
  app.use(VxeUpload)
  app.use(VxeNumberInput)
  app.use(VxeRadioGroup)
  app.use(VxeImage)
  app.use(VxeSwitch)
  app.use(VxeCheckbox)
}

VxeTable.renderer.add('CellRender',{
  renderTableDefault (renderOpts, params) {
    return renderOpts?.render(params,renderOpts)
  }
})

import Gantt from '@xpyjs/gantt';
import '@xpyjs/gantt/dist/index.css';

import '@/assets/css/tailwind.css'

import {registerEcharts} from "@/plugins/echarts"


export function registerPlugins(app: App) {
  registerEcharts(app)
  app.use(vuetify)
    .use(Loader)
    .use(Notification)
    .use(Toast)
    .use(Confirm)
    .use(Preview)
    .use(VueUeditorWrap)
    .use(lazyVxeUI)
    .use(VxeTable)
    .use(Gantt)
    .use(VxeForm)
}
