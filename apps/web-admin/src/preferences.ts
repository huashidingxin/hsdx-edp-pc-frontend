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
    date: '2025',
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
		source: 'image/2efdc02ecb8149cbc2ee6a335114b3ddc71f1e8c.png',
	},
	theme: {
		mode: 'light',
		semiDarkSidebar: false
	},
});

