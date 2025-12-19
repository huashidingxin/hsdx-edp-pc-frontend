<template>
  <DocumentEditor
    id="docEditor"
    :document-server-url="documentServerUrl"
    :config="config"
    :events_onDocumentReady="onDocumentReady"
    :onLoadComponentError="onLoadComponentError"
  />
</template>
<script setup>
import {DocumentEditor} from "@onlyoffice/document-editor-vue";

const props = defineProps({
  type:{
    default:'desktop',
    type:String
  },
  documentServerUrl: {
    type: String,
    default: import.meta.env.VITE_OFFICE_URL//'https://onlyoffice.hsdxchina.com/'
  },
  documentType: {
    type: String,
    default: 'word'
  },
  document: {
    type: Object,
    default: () => ({})
  },
  lang: {
    type: String,
    default: 'zh-CN'
  },
  mode: {
    type: String,
    default: 'edit'
  },
  callbackUrl: {
    type: String,
    default: 'https://dev2.cpzhongzhou.com/api/v1/save-template'
  },

  user: {
    type: Object,
    default: () => ({name: '系统', id: 1})
  },
  plugins: {
    type: Object,
    default: () => ({})
  },
  customization: {
    type: Object,
    default: () => ({})
  }

});

const defaultCustomization = {
  about: true,
  anonymous: {
    request: true,
    label: "Guest",
  },
  autosave: true,
  close: {
    visible: true,
    text: "Close file",
  },
  comments: true,
  compactHeader: false,
  compactToolbar: false,
  compatibleFeatures: false,
  // customer: {
  //   address: "My City, 123a-45",
  //   info: "Some additional information",
  //   logo: "https://example.com/logo-big.png",
  //   logoDark: "https://example.com/dark-logo-big.png",
  //   mail: "john@example.com",
  //   name: "John Smith and Co.",
  //   phone: "123456789",
  //   www: "example.com",
  // },
  features: {
    roles: true,
    spellcheck: {
      mode: true,
      change: true,
    },
    tabBackground: {
      mode: "header",
      change: true,
    },
    tabStyle: {
      mode: "fill",
      change: true,
    },
  },
  // feedback: {
  //   url: "https://example.com",
  //   visible: true,
  // },
  // font: {
  //     name: "Arial",
  //     size: "11px",
  // },
  forcesave: true,
  // goback: {
  //   blank: true,
  //   text: "Open file location",
  //   url: "https://example.com",
  // },
  help: true,
  hideNotes: false,
  hideRightMenu: true,
  hideRulers: false,
  integrationMode: "embed",
  layout: {
    header: {
      editMode: true,
      save: true,
      users: true,
    },
    leftMenu: {
      mode: true,
      navigation: true,
      spellcheck: true,
    },
    rightMenu: {
      mode: true,
    },
    statusBar: {
      actionStatus: true,
      docLang: true,
      textLang: true,
    },
    toolbar: {
      collaboration: {
        mailmerge: true,
      },
      draw: true,
      file: {
        close: true,
        info: true,
        save: true,
        settings: true,
      },
      home: {},
      layout: true,
      plugins: true,
      protect: true,
      references: true,
      save: true,
      view: {
        navigation: true,
      },
    },
  },
  // loaderLogo: "https://example.com/loader-logo.png",
  // loaderName: "The document is loading, please wait...",
  // logo: {
  //     image: "https://example.com/logo.png",
  //     imageDark: "https://example.com/dark-logo.png",
  //     imageLight: "https://example.com/light-logo.png",
  //     url: "https://example.com",
  //     visible: true,
  // },
  macros: true,
  macrosMode: "warn",
  mentionShare: true,
  mobile: {
    forceView: true,
    info: false,
    standardView: false,
  },
  plugins: true,
  pointerMode: "select",
  // review: {
  //     hideReviewDisplay: false,
  //     showReviewChanges: false,
  //     reviewDisplay: "original",
  //     trackChanges: true,
  //     hoverMode: false,
  // },
  slidePlayerBackground: "#000000",
  submitForm: {
    visible: true,
    resultMessage: "text",
  },
  toolbarHideFileName: false,
  // uiTheme: "theme-dark",
  unit: "cm",
  wordHeadingsColor: "#00ff00",
  zoom: 100,
}
const config = computed(() => {
  return {
    type:props.type,
    document: props.document,
    documentType: props.documentType,
    editorConfig: {
      lang: props.lang,
      mode: props.mode,
      callbackUrl: props.callbackUrl,
      user: props.user,
      plugins: props.plugins,
      customization: Object.assign(defaultCustomization, props.customization)
    },
    permission:{
      edit:true,
      download:true
    },
  }
})


function onDocumentReady() {
  console.log("Document is loaded");
}

function onLoadComponentError(errorCode, errorDescription) {
  switch (errorCode) {
    case -1: // Unknown error loading component
      console.log(errorDescription);
      break;

    case -2: // Error load DocsAPI from http://documentserver/
      console.log(errorDescription);
      break;

    case -3: // DocsAPI is not defined
      console.log(errorDescription);
      break;
  }
}

</script>

<style>
#app {
  height: 100vh;
  width: 100vw;
}
</style>
