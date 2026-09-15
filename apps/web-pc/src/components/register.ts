import type { App, Component } from 'vue';

/**
 * 全局注册共享业务组件。
 *
 * 历史上由 unplugin-vue-components 按 src/components 自动注册（见
 * components.d.ts），构建配置重写后插件丢失，模板中的 <AppCrudTable> 等
 * 标签不再被解析，页面只渲染 layout、内容空白。这里改为显式全局注册，
 * 与 components.d.ts 的组件清单保持一致。
 */
import AIGenerateImageModal from './AIGenerateImageModal.vue';
import AppAddress from './AppAddress.vue';
import AppAttachmentPreview from './AppAttachmentPreview.vue';
import AppCancelDialog from './AppCancelDialog.vue';
import AppChooseLocation from './AppChooseLocation.vue';
import AppField from './AppField.vue';
import AppList from './AppList.vue';
import AppMapDraw from './AppMapDraw.vue';
import AppOffice from './AppOffice.vue';
import AppOnlyoffice from './AppOnlyoffice.vue';
import AppProject from './AppProject.vue';
import AppUpload from './AppUpload.vue';
import PersonForm from './PersonForm.vue';
import SubmissionEdit from './SubmissionEdit.vue';
import SubmissionPreviewDrawer from './SubmissionPreviewDrawer.vue';
import AppCrudTable from './app-crud-table/AppCrudTable.vue';
import AppEditor from './app-editor/index.vue';
import AppFreeDate from './app-free-date/index.vue';
import CrudAuditModal from './app-crud-table/parts/CrudAuditModal.vue';
import CrudDetailView from './app-crud-table/parts/CrudDetailView.vue';
import CrudFilterBar from './app-crud-table/parts/CrudFilterBar.vue';
import CrudFormActions from './app-crud-table/parts/CrudFormActions.vue';
import CrudGrid from './app-crud-table/parts/CrudGrid.vue';
import CrudRowActionBar from './app-crud-table/parts/CrudRowActionBar.vue';
import CrudToolbar from './app-crud-table/parts/CrudToolbar.vue';

const components: Array<[string, Component]> = [
  ['AIGenerateImageModal', AIGenerateImageModal],
  ['AppAddress', AppAddress],
  ['AppAttachmentPreview', AppAttachmentPreview],
  ['AppCancelDialog', AppCancelDialog],
  ['AppChooseLocation', AppChooseLocation],
  ['AppCrudTable', AppCrudTable],
  ['AppEditor', AppEditor],
  ['AppField', AppField],
  ['AppFreeDate', AppFreeDate],
  ['AppList', AppList],
  ['AppMapDraw', AppMapDraw],
  ['AppOffice', AppOffice],
  ['AppOnlyoffice', AppOnlyoffice],
  ['AppProject', AppProject],
  ['AppUpload', AppUpload],
  ['CrudAuditModal', CrudAuditModal],
  ['CrudDetailView', CrudDetailView],
  ['CrudFilterBar', CrudFilterBar],
  ['CrudFormActions', CrudFormActions],
  ['CrudGrid', CrudGrid],
  ['CrudRowActionBar', CrudRowActionBar],
  ['CrudToolbar', CrudToolbar],
  ['PersonForm', PersonForm],
  ['SubmissionEdit', SubmissionEdit],
  ['SubmissionPreviewDrawer', SubmissionPreviewDrawer],
];

export function registerGlobalComponents(app: App): void {
  for (const [name, component] of components) {
    app.component(name, component);
  }
}
