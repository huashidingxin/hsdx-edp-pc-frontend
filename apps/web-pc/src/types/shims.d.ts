declare module '#/components/app-crud-table' {
  import type { Component } from 'vue';

  const AppCrudTable: Component;
  export default AppCrudTable;
}

declare module 'vue-cropper/dist/vue-cropper.es.js' {
  import type { Component } from 'vue';

  export const VueCropper: Component;
  export default VueCropper;
}

declare module 'crypto-js' {
  const CryptoJS: any;
  export default CryptoJS;
}
