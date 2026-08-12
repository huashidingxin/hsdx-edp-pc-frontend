<script setup lang="ts">
import Resource from "@/api/resource";

const props = defineProps({
  type:{
    default:'',
    type:String
  },
  buttonText:{
    default:'取消',
    type:String
  }
})

const emit = defineEmits(['confirm'])

const reasons = ref([])
async function getReasons(){
  try{
    const api = new Resource('cancel-reasons')
    let {data} = await api.list({per_page:'all',type:props.type})
    if(!data?.length){
      data = []
    }
    data.push({id:0,name:'其他原因'})
    reasons.value = data

  }catch(e) {
    console.log(e)
  }
}
const form = ref(null)
const dialog = ref(false)
function openDialog() {
  editingItem.value.other_reason = ''
  editingItem.value.reason_id = reasons.value[0].id
  dialog.value = true
}
async function submit() {
  if(!await form.value.validate()){
    return
  }
  emit('confirm',editingItem.value)
  dialog.value = false
}
const editingItem = ref({})
onBeforeMount(()=>{
  getReasons()
})

</script>

<template>
  <div>
    <div>
      <slot name="default">
        <v-btn color="error" @click="openDialog" variant="tonal">{{buttonText}}</v-btn>
      </slot>
    </div>
    <v-dialog v-model="dialog" max-width="600px">
      <v-card>
        <v-card-title class="movable d-flex justify-between align-center">
          <div>操作取消</div>
          <v-icon @click="dialog=false">mdi-close</v-icon>
        </v-card-title>
        <v-card-text>
          <v-form ref="form">
            <v-select v-model="editingItem.reason_id"
                      label="原因"
                      :items="reasons"
                      item-value="id"
                      item-title="name"

                      :rules="[v=>v === 0 || v>0 || '请选择原因']">

            </v-select>
            <v-text-field v-if="editingItem.reason_id === 0" v-model="editingItem.other_reason" label="其他原因" :rules="[v=>!!v || '请输入原因']"></v-text-field>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="flat" @click="dialog=false">暂不取消</v-btn>
          <v-btn variant="flat" color="error" @click="submit">确定取消</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>

</style>
