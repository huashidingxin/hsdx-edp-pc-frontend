import {defineOverridesPreferences} from '@vben/preferences';

/**
 * @description 项目配置文件
 * 只需要覆盖项目中的一部分配置，不需要的配置不用覆盖，会自动使用默认配置
 */
export const overridesPreferences = defineOverridesPreferences({
	// overrides
	app: {
		accessMode: 'backend',
		name: import.meta.env.VITE_APP_TITLE,
		watermark: false,
    authPageLayout:'panel-center',
    enablePreferences:false
	},
  copyright: {
    companyName: '华视鼎信',
    companySiteLink: 'https://www.hsdxchina.com',
    date: new Date().getFullYear(),
    enable: true,
    icp: '',
    icpLink: '',
    settingShow: true,
  },
	widget: {
		languageToggle: false,
	},
	logo: {
		enable: true,
		source: '/logo.png',
	},
	theme: {
		mode: 'light',
		semiDarkSidebar: false
	},
});

