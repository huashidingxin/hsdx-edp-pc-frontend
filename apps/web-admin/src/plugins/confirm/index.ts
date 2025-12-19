import {createApp} from 'vue';

import vuetify from '#/plugins/vuetify';
import Confirm from './Confirm.vue'

const defaultOptions: any = {
	buttonTrueText:'确认',
	buttonFalseText:'取消',
	icon:'mdi-help-circle-outline',
	color:'',
	persistent:true,
	centered:false,
};


let cmp: any = null;
const createCmp = (options: object) => {
	const rootNode = document.createElement('div');
	document.body.append(rootNode);
	return new Promise((resolve)=>{
		const app = createApp(Confirm, {
			...options,
			hide() {
				app.unmount();
				rootNode.remove();
				resolve(cmp.result)
			},
		});
		app.use(vuetify);
		cmp = app.mount(rootNode);
	})
};

// function getCmp(options: any) {
// 	if (!cmp) {
// 		cmp = createCmp(options);
// 	}
// 	return cmp;
// }

function show(options: any) {
	if (typeof options === 'string') {
		defaultOptions.message = options;
		options = {};
	}

	return createCmp({...defaultOptions,...options})
	// return getCmp({...defaultOptions,...options})
}

const plugin: any = show;

plugin.install = (app: any) => {
	app.config.globalProperties.$confirm = plugin;
	app.provide('$confirm', plugin);
};

export default plugin;
