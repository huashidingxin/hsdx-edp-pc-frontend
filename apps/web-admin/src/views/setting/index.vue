<script setup lang="ts">

import Resource from "@/api/resource";
import {ref} from "vue";
import {useAppStore} from "@/store";

const appStore = useAppStore()
const $toast = inject('$toast')
const fields = ref([])
const editedItem = ref({})
async function getConfig() {
  try{
    const api = new Resource('settings')
    const {data} = await api.list({per_page:'all',manage:1})
    data.forEach((e)=>{
      const field = {...e,field:e.name,attrs:{}}
      if(e.type === 'image'){
        field.type = 'file'
        field.attrs.fileType = 'image'
      }
      fields.value.push(field)
      editedItem.value[e.name] = e.value
    })
  }catch(e) {
    console.log(e)
  }
}


const formRef = ref(null)
const fieldRef = ref([])
async function save() {
  // todo
  const {valid} = await formRef.value.validate()
  if(!valid){
    $toast.error('表单有误');
    return
  }

  // 是否有文件需要上传
  for (const i in fields.value) {

    if (fields.value[i].type === 'file' && editedItem.value[fields.value[i].field]) {
      const urls = Array.isArray(editedItem.value[fields.value[i].field]) ? editedItem.value[fields.value[i].field] : [editedItem.value[fields.value[i].field]]
      console.log('URLS', urls,fields.value[i].field)
      const uploads = urls.filter((e) => {
        return typeof e === 'object' && !e.url.startsWith('http')
      })

      console.log('UPLOADS', uploads)
      if (uploads.length) {
        await fieldRef.value[i].fieldRef.upload();
      }
    }
  }
  try{
    const api = new Resource('settings')
    const {data} = await api.store(editedItem.value)
    $toast.success('保存成功');
    appStore.getConfig()
  }catch(e) {
    console.log(e)
  }
}
onBeforeMount(()=>{
  getConfig()
})
</script>

<template>
  <v-card>
    <v-card-text>
      <v-form ref="formRef">
        <v-row align="end">
          <template v-for="(item, key) in fields"
                    :key="key">
            <v-col
              :md="item.cols || 12"
              cols="12"
              v-if="!item.hidden"
            >
              <div v-if="item.type=='slot'" ref="fieldRef">
                <slot :name="'field_'+(item.slot || item.field)" :item="item"></slot>
              </div>
              <AppField
                v-else
                ref="fieldRef"
                :key="'field_'+item.field"
                v-model="editedItem[item.field]"
                :field="item"
              />
            </v-col>
          </template>

        </v-row>
      </v-form>
    </v-card-text>
    <v-card-actions class="px-5">
      <v-spacer />
      <v-btn color="primary" variant="elevated" @click="save">确定</v-btn>
    </v-card-actions>
  </v-card>
</template>

<style scoped>

</style>
