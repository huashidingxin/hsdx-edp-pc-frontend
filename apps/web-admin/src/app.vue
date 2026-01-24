<script lang="ts" setup>
import {preferences} from '@vben/preferences';
import {computed, watch} from "vue";

import {en, zhHans} from "vuetify/locale";

defineOptions({name: 'App'});

const tokenLocale = computed(() => {
    return {
      locale: preferences.app.locale === 'zh-CN' ? 'zhHans' : 'en',
      messages: {zhHans, en}
    }
  }
);


import {useTheme} from 'vuetify'

const theme = useTheme()

import {type VxeGlobalThemeName, VxeUI} from 'vxe-table'

watch(() => preferences.theme, (newTheme) => {
  theme.global.name.value = newTheme.mode
  // 切换为暗黑主题
  VxeUI.setTheme(newTheme.mode as VxeGlobalThemeName)
}, {immediate: true})

import {useAppStore} from "#/store";
import {useAccessStore} from "@vben/stores";
const accessStore = useAccessStore()
const appStore = useAppStore();
watch(()=>accessStore.isAccessChecked,async (isAccessChecked)=>{
  if(isAccessChecked){
    await appStore.getProjects('all');
    appStore.getTodo()
  }
},{immediate: true})

watch(() => appStore.defaultProject, (newVal, oldVal) => {
  if(accessStore.isAccessChecked){
    appStore.getPermissions(newVal?.id || 0)
  }

})

onBeforeMount(()=>{
  appStore.getSetting()
})


</script>

<template>
  <v-theme-provider :theme="preferences.theme.mode">
    <v-locale-provider v-bind="tokenLocale">
      <v-app :theme="preferences.theme.mode">
        <v-main>
          <RouterView />
        </v-main>
      </v-app>
    </v-locale-provider>
  </v-theme-provider>
</template>
<style>
.v-overlay.v-dialog .movable {
  cursor: grab;
}

/*
.v-overlay.v-dialog .movable:hover {
	background-color: #fcfcfc;
}

.v-theme--dark  .movable:hover{
  background-color: var(--v-theme-background)!important;
}
*/

.v-overlay.v-dialog .movable:active {
  cursor: grabbing;
}

@page {
  margin-top: 1mm;
  margin-bottom: 1mm;
}

/* 默认情况下隐藏内容 */
.print-only {
  display: none;
}

/* 在打印时显示内容 */
@media print {
  .print-only {
    display: block !important;
  }
}

.vxe-modal--wrapper.type--modal {
  z-index: 2500 !important;
}

.bg-overlay-content.left-0 {
  left: auto !important;
}

.bg-overlay-content.top-0 {
  top: auto !important;
}
.required-field .vxe-cell--title::before, .required-field .v-field-label::before {
  content: "*";
  color: red;
  font-size: 1.2em;
  margin-right: 4px;
  font-weight: bold;
}

.v-field__input{
  user-select: all!important;
}
</style>
