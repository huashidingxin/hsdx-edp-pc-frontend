<script setup lang="ts">
import regions from './region'
import Resource from "@/api/resource";
const $attrs = useAttrs()
const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({})
  },
  level: {
    default: 3,
    type: Number
  },
  minLevel: {
    default: 1,
    type: Number
  },
  includeOther: {
    type: Boolean,
    default: true
  },
})
const emit = defineEmits(['update:model-value', 'confirm'])
const visible = ref(false)
// 选择的index
const selected = ref([])
// 层级的待选数据
const levelList = ref([])

const levelIndex = ref(0)
// 直辖市
const provinceLevelCityList = [110000, 120000, 310000, 500000]
const levelNames = ['省', '市', '区', '街道'];
const levelFields = ['province', 'city', 'area', 'town'];

function levelChange(e) {
  levelIndex.value = e;
}

function regionClick(e) {
  const nextLevelIndex = levelIndex.value + 1;

  // 清空之前的选择
  selected.value.splice(levelIndex.value, props.level - levelIndex.value)
  // 重置待选列表
  levelList.value.splice(nextLevelIndex, props.level - nextLevelIndex)

  selected.value[levelIndex.value] = e;

  if (selected.value.length === props.level) {
    visible.value = false
    updateModelValue();
    return;
  }

  if (e?.c) {
    levelList.value[nextLevelIndex] = e.c
  } else if (nextLevelIndex === 2 && !e.c) {
    // 没有下级 东莞 济源 等 本机作为下级
    levelList.value[nextLevelIndex] = { [e.id]: e }
  }

  levelChange(nextLevelIndex)

  // 如果只有一个下级，直接选择
  if (levelList.value[nextLevelIndex] && Object.keys(levelList.value[nextLevelIndex]).length === 1) {
    const firstKey = Object.keys(levelList.value[nextLevelIndex])[0];
    regionClick({ ...levelList.value[nextLevelIndex][firstKey], id: firstKey })
  }
}

watch(visible, (newVal) => {
  if (!newVal) {
    // 只有在手动选择完成时才更新值
    if (selected.value.length === props.level) {
      updateModelValue();
    }
  }
})

const levelDesc = { 1: '省', 2: '市', 3: '区县', 4: '镇/街道' }
function validLevel(e) {
  return selected.value.length >= props.minLevel ? true : '至少选择到' + levelDesc[props.minLevel]
}

function updateModelValue() {
  const value = selected.value.map((e) => {
    return {
      id: e.id,
      name: e.n
    }
  })
  emit('update:model-value', value)
  emit('confirm', value)
}

const selectedFormated = computed(() => {
  if (!selected.value.length) {
    return ''
  }
  const arr = [];
  for (let i in selected.value) {
    // 是否为直辖市 如果是直辖市
    if (provinceLevelCityList.includes(parseInt(selected.value[i].id))) {
      // 对于直辖市，只添加一次名称
      if (i === '0') {
        arr.push(selected.value[i].n)
      }
      continue
    }
    // 跳过重复的名称
    if (i > 0 && selected.value[i].n === selected.value[i - 1].n) {
      continue
    }
    arr.push(selected.value[i].n)
  }
  return arr.join(' / ') + (selected.value.length < props.level ? ' / ' : '')
})

watch(() => props.modelValue, (newValue) => {
  if (newValue && Object.keys(newValue).length > 0) {
    // 重置选择
    selected.value = []
    levelList.value = [regions]

    for (let i = 0; i < props.level; i++) {
      if (!newValue[i]) break

      const obj = typeof newValue[i] === "object" ? newValue[i] : { id: newValue[i], name: newValue[i] }
      let region = null;

      if (levelList.value[i]) {
        Object.keys(levelList.value[i]).forEach((key) => {
          if (key == obj.id || levelList.value[i][key].n == obj.name) {
            region = { ...levelList.value[i][key], id: key };
            return
          }
        })
      }

      if (!region) {
        break;
      }

      selected.value[i] = region

      // 准备下一级数据
      if (i < props.level - 1) {
        if (region.c) {
          levelList.value[i + 1] = region.c
        } else if (i === 1 && !region.c) {
          // 没有下级 东莞 济源 等 本机作为下级
          levelList.value[i + 1] = { [region.id]: region }
        }
      }
    }
  }
}, { immediate: true })

onBeforeMount(() => {
  levelList.value = [regions]
})
</script>

<template>
  <v-menu v-model="visible" :disabled="$attrs.readonly || $attrs.disabled" :close-on-content-click="false">
    <template v-slot:activator="{ props }">
      <v-text-field
        v-bind="props"
        readonly
        label="省市区"
        :model-value="selectedFormated"
        :rules="[...($attrs.rules || []), (v) => validLevel(v)]"
      ></v-text-field>
    </template>

    <v-card>
      <v-card-text class="pa-0">
        <v-tabs v-model="levelIndex" grow @update:modelValue="levelChange" bg-color="grey-lighten-3" color="primary">
          <v-tab v-for="index in level" :key="index" :value="index-1" :disabled="!levelList[index-1]" @click.stop="()=>{}">
            {{levelNames[index-1]}}
          </v-tab>
        </v-tabs>
        <v-tabs-window v-model="levelIndex" class="overflow-y-auto pa-0" style="height: 300px">
          <v-tabs-window-item v-for="(list,index) in levelList" :key="index" :value="index">
            <v-list>
              <v-list-item
                v-for="(item,id) in list"
                :key="id"
                @click.stop="regionClick({...item,id})"
              >
                <v-list-item-title :class="{'text-primary' : id == selected[index]?.id}">
                  {{item.n}}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-tabs-window-item>
        </v-tabs-window>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<style scoped>
/* 可以添加必要的样式 */
</style>
