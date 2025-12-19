<script setup lang="ts">
const options = ref({
  columns:[
    {field:'id',title:'编号',fixed:'left',minWidth:300},
    {field:'display_name',title:'名称',minWidth:300},
    {field:'created_at',title:'创建时间',width:200},
  ],
  data:[]
});
const filters = ref([
  {
    field:'name',
    type: 'text',
    col: 3,
    label: '名称',
  },
]);

const fields = ref([
  {
    field:'name',
    type: 'text',
    col: 8,
    label: '显示名称',
    rules:[v=>!!v || '请输入显示名称']
  },
]);

const editingItem = ref({})
const $toast = inject('$toast')


</script>
<template>
  <AppTable
      v-model="editingItem"
      :options="options"
      :filter-fields="filters"
      :fields="fields"
      create-open-type="modal"
      detail-open-type="modal"
      api-url="roles"
  >
  </AppTable>
</template>

<style scoped>

</style>
