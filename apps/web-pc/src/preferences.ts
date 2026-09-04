import { defineOverridesPreferences } from '@vben/preferences';

/**
 * @description 项目配置文件
 * 只需要覆盖项目中的一部分配置，不需要的配置不用覆盖，会自动使用默认配置
 * !!! 更改配置后请清空缓存，否则可能不生效
 */
export const overridesPreferences = defineOverridesPreferences({


  app: {
    accessMode: 'backend',
    name: import.meta.env.VITE_APP_TITLE,
    watermark: false,
    authPageLayout:'panel-center',
    // enablePreferences:true,
    defaultHomePath: '/workspace',
    "layout": "header-sidebar-nav",
  },
  "breadcrumb": {
    "enable": false
  },
  copyright: {
    companyName: '华视鼎信',
    companySiteLink: 'https://www.hsdxchina.com',
    date: String(new Date().getFullYear()),
    enable: true,
    icp: '',
    icpLink: '',
    settingShow: true,
  },

  logo: {
    enable: true,
    source: '/favicon.ico',
  },
  theme: {
    mode: 'light',
    semiDarkSidebar: false
  },
  widget: {
    logoutButtonPosition: 'user-dropdown',
  },
});
