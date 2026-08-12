<script setup lang="ts">
import { ref, watch } from "vue";
import dayjs from 'dayjs'
import type { PropType } from 'vue'

const props = defineProps({
  modelValue: {
    default: () => ([]),
    type: [String, Array] as PropType<string | string[]>
  },
  range: {
    default: false,
    type: Boolean
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
  inputProps: {
    default: () => ({}),
    type: Object
  },
  dateFormat: {
    default: 'YYYY-MM-DD',
    type: String
  },
  timeFormat: {
    default: 'HH:mm:ss',
    type: String
  }
})

const emit = defineEmits(['update:model-value'])
const menuVisible = ref(false)
const date = ref<(Date | Date[])>([])

// 内部临时状态
const tempDate1 = ref('')
const tempTime1 = ref(props.defaultStartTime)
const tempDate2 = ref('')
const tempTime2 = ref(props.defaultEndTime)
const hasSelectedDate = ref(false)

// 显示值
const displayValue = ref('')

// 格式化日期时间
const formatDateTime = (date: string, time: string) => {
  if (!date) return ''
  return props.onlyDate
    ? dayjs(date).format(props.dateFormat)
    : `${dayjs(date).format(props.dateFormat)} ${time}`
}

// 处理外部值变化
const parseModelValue = (value: string | string[]) => {
  if (!value) {
    displayValue.value = ''
    return
  }

  if (props.range && Array.isArray(value)) {
    const [start, end] = value
    displayValue.value = `${formatDateTime(dayjs(start).format(props.dateFormat), dayjs(start).format(props.timeFormat))} ~ ${formatDateTime(dayjs(end).format(props.dateFormat), dayjs(end).format(props.timeFormat))}`
  } else if (!props.range && typeof value === 'string') {
    displayValue.value = formatDateTime(dayjs(value).format(props.dateFormat), dayjs(value).format(props.timeFormat))
  }
}

// 监听菜单打开
watch(menuVisible, (visible) => {
  if (visible) {
    if (props.modelValue) {
      if (props.range && Array.isArray(props.modelValue)) {
        const [start, end] = props.modelValue
        const startDate = dayjs(start)
        const endDate = dayjs(end)

        tempDate1.value = startDate.format(props.dateFormat)
        tempTime1.value = props.onlyDate ? props.defaultStartTime : startDate.format(props.timeFormat)
        tempDate2.value = endDate.format(props.dateFormat)
        tempTime2.value = props.onlyDate ? props.defaultEndTime : endDate.format(props.timeFormat)

        date.value = [startDate.toDate(), endDate.toDate()]
      } else if (!props.range && typeof props.modelValue === 'string') {
        const dateTime = dayjs(props.modelValue)
        tempDate1.value = dateTime.format(props.dateFormat)
        tempTime1.value = props.onlyDate ? props.defaultStartTime : dateTime.format(props.timeFormat)
        date.value = [dateTime.toDate()]
      }
    } else {
      const now = dayjs()
      tempDate1.value = now.format(props.dateFormat)
      tempTime1.value = props.onlyDate ? props.defaultStartTime : now.format(props.timeFormat)
      if (props.range) {
        tempDate2.value = now.format(props.dateFormat)
        tempTime2.value = props.onlyDate ? props.defaultEndTime : now.format(props.timeFormat)
        date.value = [now.toDate(), now.add(1, 'day').toDate()]
      } else {
        date.value = [now.toDate()]
      }
    }
    hasSelectedDate.value = true
  }
})

// 监听日期选择变化
watch(date, (newDates) => {
  if (!newDates) {
    tempDate1.value = ''
    tempDate2.value = ''
    hasSelectedDate.value = false
    return
  }

  const datesArray = Array.isArray(newDates) ? newDates : [newDates]

  if (datesArray.length === 0) {
    tempDate1.value = ''
    tempDate2.value = ''
    hasSelectedDate.value = false
    return
  }

  hasSelectedDate.value = true

  if (props.range) {
    const sortedDates = [...datesArray].sort((a, b) => a.getTime() - b.getTime())
    tempDate1.value = dayjs(sortedDates[0]).format(props.dateFormat)
    tempDate2.value = dayjs(sortedDates[sortedDates.length - 1]).format(props.dateFormat)
  } else {
    tempDate1.value = dayjs(datesArray[0]).format(props.dateFormat)
  }
}, { deep: true })

// 监听外部值变化
watch(() => props.modelValue, (newVal) => {
  parseModelValue(newVal)
}, { immediate: true, deep: true })

// 修复：改进时间处理逻辑
const normalizeTime = (time: string) => {
  if (!time) return props.defaultStartTime

  // 处理各种时间格式
  const parts = time.split(':')
  if (parts.length === 1) return `${parts[0].padStart(2, '0')}:00:00`
  if (parts.length === 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`
  if (parts.length === 3) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`

  return props.defaultStartTime
}

// 保存选择
const save = () => {
  if (!hasSelectedDate.value) {
    const now = dayjs()
    tempDate1.value = now.format(props.dateFormat)
    if (props.range) {
      tempDate2.value = now.format(props.dateFormat)
    }
    date.value = props.range ? [now.toDate(), now.add(1, 'day').toDate()] : [now.toDate()]
  }

  // 确保时间格式正确
  const normalizedTime1 = normalizeTime(tempTime1.value)
  const normalizedTime2 = props.range ? normalizeTime(tempTime2.value) : ''

  // 生成输出值
  let output
  if (props.range) {
    const start = formatDateTime(tempDate1.value, normalizedTime1)
    const end = formatDateTime(tempDate2.value, normalizedTime2)
    output = [start, end]
    displayValue.value = `${start} ~ ${end}`
  } else {
    output = formatDateTime(tempDate1.value, normalizedTime1)
    displayValue.value = output
  }

  // 更新内部状态以确保下次打开时显示正确
  tempTime1.value = normalizedTime1
  if (props.range) {
    tempTime2.value = normalizedTime2
  }

  emit('update:model-value', output)
  menuVisible.value = false
}

// 取消选择
const cancel = () => {
  parseModelValue(props.modelValue)
  menuVisible.value = false
}
</script>

<template>
  <div>
    <v-menu v-model="menuVisible" :close-on-content-click="false">
      <template v-slot:activator="{ props: menuProps }">
        <v-text-field
          clearable
          v-bind="Object.assign({}, inputProps, menuProps)"
          :model-value="modelValue?.length ? displayValue : ''"
          :placeholder="range ? '请选择时间范围' : '请选择时间'"
          :label="label"
          readonly
          persistent-placeholder
        >
          <template v-if="!displayValue" #append>
            <v-icon icon="mdi-clock-outline" />
          </template>
        </v-text-field>
      </template>

      <v-date-picker
        v-model="date"
        :multiple="range ? 'range' : false"
        hide-header
        color="primary"
        @click.stop
      >
        <template #actions>
          <div class="w-100 pa-2">
            <div class="time-inputs" v-if="!onlyDate">
              <div class="d-flex align-center gap-2 mb-2">
                <v-text-field
                  v-model="tempTime1"
                  label="开始时间"
                  type="time"
                  step="1"
                  variant="outlined"
                  density="compact"
                  :disabled="!hasSelectedDate"
                  :max="range ? tempTime2 : undefined"
                  placeholder="HH:mm:ss"
                  persistent-hint
                  hint="时:分:秒"
                  @blur="tempTime1 = normalizeTime(tempTime1)"
                />
                <v-icon v-if="range" icon="mdi-arrow-right" />
                <v-text-field
                  v-if="range"
                  v-model="tempTime2"
                  label="结束时间"
                  type="time"
                  step="1"
                  variant="outlined"
                  density="compact"
                  :disabled="!hasSelectedDate"
                  :min="tempTime1"
                  placeholder="HH:mm:ss"
                  persistent-hint
                  hint="时:分:秒"
                  @blur="tempTime2 = normalizeTime(tempTime2)"
                />
              </div>
            </div>

            <v-divider class="my-2" />

            <div class="d-flex justify-end gap-2">
              <v-btn
                variant="text"
                color="secondary"
                @click="cancel"
              >
                取消
              </v-btn>
              <v-btn
                color="primary"
                @click="save"
                :disabled="!hasSelectedDate"
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
.gap-2 {
  gap: 8px;
}

.time-inputs :deep(.v-field__input) {
  padding-top: 4px;
}
</style>
