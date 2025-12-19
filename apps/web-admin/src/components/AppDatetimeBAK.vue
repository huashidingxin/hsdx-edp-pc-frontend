<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue";
import dayjs from 'dayjs'
import {format} from "ol/coordinate";

const props = defineProps({
  modelValue: {
    default: () => ([]),
    type: [String, Array]
  },
  range: {
    default: false,
    type: [String, Boolean]
  },
  onlyDate: {
    default: false,
    type: Boolean
  },
  defaultStartTime: {
    default: '00:00:00',
    type: String
  },
  defaultEndTime: {
    default: '23:59:59',
    type: String
  },
  label: {
    default: '',
    type: String
  },
  inputProps:{
    default: ()=>({}),
    type: Object
  }
})

const emit = defineEmits(['update:model-value'])
const menuVisible = ref(false)
const date = ref([])

const date1 = ref('')
const time1 = ref('00:00:00')

const date2 = ref('')
const time2 = ref('23:59:59')

const datetime1 = computed(() => {

  return props.onlyDate ? date1.value : ((date1.value || '年-月-日') + ' ' + time1.value)
})

const datetime2 = computed(() => {

  return props.onlyDate ? date2.value : ((date2.value || '年-月-日') + ' ' + time2.value)
})

const changed = ref(false)

watch(date, (newVal) => {
  if (!newVal) {
    date1.value = '';
    date2.value = '';
  } else {
    if (props.range) {
      date1.value = dayjs(newVal[0]).format('YYYY-MM-DD')
      date2.value = newVal.length > 1 ? dayjs(newVal[newVal.length - 1]).format('YYYY-MM-DD') : date1.value
    }else{
      date1.value = dayjs(newVal).format('YYYY-MM-DD')
    }
  }

})

watch(()=>props.modelValue,(newValue)=>{
  if(!props.onlyDate && !props.range){
    console.log('2222',props.modelValue)
    const _datetime = dayjs(props.modelValue)
    date1.value = _datetime.format('YYYY-MM-DD')
    time1.value = _datetime.format('HH:mm:ss')

    console.log(date1.value,time1.value)
  }
})

watch(time2,(newVal)=>{
  // if(newVal === '23:59'){
  // 	time2.value = '23:59:59'
  // }
})

function cancel() {
  menuVisible.value = false
}

function save() {
  menuVisible.value = false
  //resultStr.value = props.range ? datetime1.value +'~'+datetime2.value : '请选择时间'
  emit('update:model-value', props.range ? [datetime1.value, datetime2.value] : datetime1.value)
}

watch(menuVisible,()=>{
  date1.value = props.modelValue?.length ? props.modelValue : dayjs().format('YYYY-MM-DD')
})

onMounted(() => {
  time1.value = props.defaultStartTime
  time2.value = props.defaultEndTime
  if(props.modelValue){
    if(props.range){
      const _datetime1 = dayjs(props.modelValue[0])
      const _datetime2 = dayjs(props.modelValue[1])
      date1.value = dayjs(_datetime1).format('YYYY-MM-DD')
      time1.value = dayjs(_datetime1).format('HH:mm:ss')

      date2.value = dayjs(_datetime2).format('YYYY-MM-DD')
      time2.value = dayjs(_datetime2).format('HH:mm:ss')

      let _range = [];
      const days = _datetime2.diff(_datetime1,'day')
      for(let i = 0;i<=days;i++){
        _range.push(_datetime1.add(i,'day').toDate())
      }
      date.value = _range
    }else{
      const _datetime1 = dayjs(props.modelValue)
      date1.value = dayjs(_datetime1).format('YYYY-MM-DD')
      time1.value = dayjs(_datetime1).format('HH:mm:ss')
    }
  }
})
</script>

<template>
  <div>
    <v-menu v-model="menuVisible" min-width="0">
      <template v-slot:activator="{ props }">
        <v-text-field v-bind="Object.assign({},inputProps,props)"
                      :model-value="modelValue?.length ? (range ? modelValue[0]+' ~ '+modelValue?.[modelValue.length-1] : date1) : ''"
                      placeholder="请选择时间"
                      :label="label" readonly></v-text-field>
      </template>
      <v-date-picker v-model="date" :multiple="range ? 'range' : false" hide-header color="primary"
                     @click.stop="null" >
        <template #actions>
          <div class="w-100 pa-2">
            <div v-if="!onlyDate">
              <div class="d-flex align-center">
                <v-text-field :model-value="date1 || '年/月/日'"
                              variant="underlined" readonly
                              hide-details density="compact"></v-text-field>
                <v-text-field v-if="!onlyDate" v-model="time1" variant="underlined"
                              type="time"
                              step="1"
                              hide-details density="compact"></v-text-field>
              </div>

              <div class="d-flex align-center" v-if="range">

                <v-text-field :model-value="date2 || '年/月/日'"
                              variant="underlined" readonly
                              hide-details density="compact"></v-text-field>
                <v-text-field v-if="!onlyDate" v-model="time2" variant="underlined"
                              type="time"
                              step="1"
                              hide-details density="compact"></v-text-field>
              </div>
            </div>

            <div class="d-flex mt-3">
              <v-spacer/>
              <v-btn
                color="primary"
                @click="menuVisible = false"
              >
                取消
              </v-btn>
              <v-btn
                color="primary"
                @click="save"
              >
                确定
              </v-btn>
            </div>
          </div>
        </template>
      </v-date-picker>
    </v-menu>
  </div>
</template>

<style scoped>
:deep(.v-picker-title) {
  padding-left: 12px;
}

</style>
