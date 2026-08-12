<template>
  <div class="position-relative1">
    <div id="sheet" ref="container" />
<!--    <div class="position-absolute right-0 top-0 h-100 bg-white elevation-1 ma-6" style="z-index: 11;width: 50vw">111</div>-->

    <teleport v-if="formVisible"  to=".univer-sidebar-body">
      <div>
        <textarea v-model="currentCellValue"></textarea>
        <v-btn @click="setCellValue">设置值</v-btn>
      </div>

    </teleport>
  </div>
</template>

<script setup>
import {ref,onMounted} from 'vue'
import {VSheet,VCard} from "vuetify/components";
import {LocaleType, merge, Univer, UniverInstanceType, FUniver, LogLevel} from "@univerjs/core";
import { defaultTheme } from "@univerjs/design";

import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverUIPlugin } from "@univerjs/ui";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import { UniverSheetsUIPlugin } from "@univerjs/sheets-ui";
import { UniverSheetsFormulaPlugin } from "@univerjs/sheets-formula";
import { UniverSheetsFormulaUIPlugin } from "@univerjs/sheets-formula-ui";
import { UniverSheetsNumfmtPlugin } from "@univerjs/sheets-numfmt";
import { UniverSheetsNumfmtUIPlugin } from "@univerjs/sheets-numfmt-ui";

import DesignZhCN from '@univerjs/design/locale/zh-CN';
import UIZhCN from '@univerjs/ui/locale/zh-CN';
import DocsUIZhCN from '@univerjs/docs-ui/locale/zh-CN';
import SheetsZhCN from '@univerjs/sheets/locale/zh-CN';
import SheetsUIZhCN from '@univerjs/sheets-ui/locale/zh-CN';
import SheetsFormulaUIZhCN from '@univerjs/sheets-formula-ui/locale/zh-CN';
import SheetsNumfmtUIZhCN from '@univerjs/sheets-numfmt-ui/locale/zh-CN';

// 这里的 Facade API 是可选的，你可以根据自己的需求来决定是否引入
import '@univerjs/engine-formula/facade';
import '@univerjs/ui/facade';
import '@univerjs/docs-ui/facade';
import '@univerjs/sheets/facade';
import '@univerjs/sheets-ui/facade';
import '@univerjs/sheets-formula/facade';
import '@univerjs/sheets-numfmt/facade';

import "@univerjs/design/lib/index.css";
import "@univerjs/ui/lib/index.css";
import "@univerjs/docs-ui/lib/index.css";
import "@univerjs/sheets-ui/lib/index.css";
import "@univerjs/sheets-formula-ui/lib/index.css";
import "@univerjs/sheets-numfmt-ui/lib/index.css";



const container = ref(null)
const docContainer = ref(null)
const formVisible = ref(false)
let univer = reactive({})
let univerAPI = reactive({})
let workbook = reactive({})
let sheet = reactive({})
const currentCellValue = ref(null)
onMounted(()=>{
  univer = new Univer({
    theme: defaultTheme,
    locale: LocaleType.ZH_CN,
    locales: {
      [LocaleType.ZH_CN]: merge(
        {},
        DesignZhCN,
        UIZhCN,
        DocsUIZhCN,
        SheetsZhCN,
        SheetsUIZhCN,
        SheetsFormulaUIZhCN,
        SheetsNumfmtUIZhCN
      ),
    },
    LogLevel:LogLevel.VERBOSE,
  });

  univer.registerPlugin(UniverRenderEnginePlugin);
  univer.registerPlugin(UniverFormulaEnginePlugin);

  univer.registerPlugin(UniverUIPlugin, {
    container: container.value,
  });

  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  //
  univer.registerPlugin(UniverSheetsPlugin);
  univer.registerPlugin(UniverSheetsUIPlugin);
  univer.registerPlugin(UniverSheetsFormulaPlugin);
  univer.registerPlugin(UniverSheetsFormulaUIPlugin);
  univer.registerPlugin(UniverSheetsNumfmtPlugin);
  univer.registerPlugin(UniverSheetsNumfmtUIPlugin);

  univer.createUnit(UniverInstanceType.UNIVER_SHEET, {});

  univerAPI = FUniver.newAPI(univer);
  univerAPI.addEvent(univerAPI.Event.CellClicked,(e)=>{
    console.log(e)
    currentLocation.value = e.location
    openSidebar()
  })

  // const Vue3Component = defineComponent({
  //   setup(props) {
  //     console.log('Vue3Component', props);
  //     return ''
  //   }
  // });

  univerAPI.getComponentManager().register(
    'myComponentKey',
    VCard,
    {
      framework: 'vue3',
    }
  );

  workbook = univerAPI.getActiveWorkbook()
  sheet = workbook.getActiveSheet()

  // 稍后关闭侧边栏
  // sidebar.dispose();

  univerAPI.createMenu({
    id: 'custom-menu-id-1',
    title: '属性面板',
    action: () => {
      //console.log(111)
      openSidebar()
    },
  }).appendTo('contextMenu.others')


})


const currentLocation = ref({
  row:0,
  col:0
})
const data = ref({});
const object = ref([
  {name:'对象',key:'project',fields:[{name:'ID',key:'id',}]}
])

function openSidebar() {
  const sidebar = workbook.openSiderbar({
    header: { title: '属性面板' },
    children: { label: 'myComponentKey',props:{flat:true} },
    onClose: () => {
      console.log('close');
    },
    width: 360,
  });

  data.value = workbook.save()

  // currentCellValue.value = sheet.getRange(currentLocation.value.row,currentLocation.value.col).getValue()
  const range = univerAPI.getActiveWorkbook()
    .getActiveSheet()
    .getActiveRange();

  const value = range.getValueAndRichTextValues()
  console.log(value)
  if(value[0]){
    currentCellValue.value = typeof value[0][0] === 'object' ? value[0][0]._data.body.dataStream : value[0][0]
  }
  console.log(currentCellValue.value)
  formVisible.value = true

}

function setCellValue() {
  //sheet.getRange(currentLocation.value.row,currentLocation.value.col).setValue(currentCellValue.value)
  const range = univerAPI.getActiveWorkbook()
    .getActiveSheet()
    .getActiveRange();

  console.log(currentCellValue.value)
  // 创建富文本并插入文本
  const richText = univerAPI.newRichText()
    .insertText(currentCellValue.value);

  // 设置富文本值
  range.setRichTextValueForCell(richText);
}
</script>
<style>
#sheet {
  height: 700px;
  padding: 0;
  margin: 0;

}

.univer-sheets-print-limit{
  display: none;
}

#doc{
  height: 200px;
  padding: 0;
  margin: 0;
}
</style>
