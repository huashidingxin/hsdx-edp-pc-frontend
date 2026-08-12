<script setup lang="ts">
import {onMounted, onUnmounted, ref} from "vue";
import vuetify from "#/plugins/vuetify";

import {useTheme} from "vuetify";

const theme = useTheme();
const props = defineProps({
	buttonTrueText: {
		type: String,
		default: 'Yes'
	},
	buttonFalseText: {
		type: String,
		default: 'No'
	},
	buttonTrueColor: {
		type: String,
		default: 'primary'
	},
	buttonFalseColor: {
		type: String,
		default: 'grey'
	},
	buttonFalseFlat: {
		type: Boolean,
		default: true
	},
	buttonTrueFlat: {
		type: Boolean,
		default: true
	},
	color: {
		type: String,
		default: 'warning'
	},
	icon: {
		type: String,
		default () {
			return 'mdi-warning'
		}
	},
	message: {
		type: String,
		required: true
	},
	persistent: Boolean,
	title: {
		type: String
	},
	width: {
		type: Number,
		default: 350
	},
	centered:{
		type:Boolean,
		default:false,
	},
	hideOverlay:{
		type:Boolean,
		default:false,
	},
	hide:{
		type:Function,
		default:()=>{}
	}
});
const emit = defineEmits(['update:result']);
const dialog = ref(true);
const result = ref(false)
function onEnterPressed (e) {
	if (e.keyCode === 13) {
		e.stopPropagation()
		choose(true)
	}
}
function choose (e: any) {
	//emit('update:result', e)
	result.value = e;
	close()
}
function close () {
	dialog.value = false
	props.hide()
}

onMounted(()=>{
	document.addEventListener('keyup', onEnterPressed)
})

onUnmounted(()=>{
	document.removeEventListener('keyup', onEnterPressed)
})

defineExpose({
	result
})
</script>

<template>
	<v-dialog v-model="dialog" eager scrollable :max-width="width" :persistent="persistent" @keydown.esc="choose(false)">
		<v-card>
      <v-card-title class="pa-1 movable d-flex justify-space-between align-center border-b" :style="{backgroundColor:color}">
        <div class="text-body-2 d-flex align-center">
          <v-icon class="ml-2" v-if="Boolean(icon)" size="small" :icon="icon" ></v-icon>
          <span class="ms-2">{{title || '提示'}}</span>
        </div>
        <v-btn
          icon
          @click="choose(false)"
          size="small"
        >
          <v-icon :color="color">mdi-close</v-icon>
        </v-btn>
      </v-card-title>


			<v-card-text class="px-4 py-3" :class="centered?'text-center':''" style="max-height: 60vh;overflow-y: auto" v-html="message"/>
			<v-card-actions>
				<v-spacer/>
				<v-btn
					v-if="Boolean(buttonFalseText)"
					:color="buttonFalseColor"
					:text="buttonFalseText"
					@click="choose(false)"
				>
					{{ buttonFalseText }}
				</v-btn>
				<v-btn
					v-if="Boolean(buttonTrueText)"
					:color="buttonTrueColor"
					:text="buttonFalseText"
					@click="choose(true)"
				>
					{{ buttonTrueText }}
				</v-btn>
				<v-spacer v-if="centered"></v-spacer>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<style scoped>

</style>
