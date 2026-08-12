<script setup lang="ts">
const options = ref({
  columns:[
    {field:'name',title:'名称',fixed:'left',width:300},
    {field:'created_at',title:'创建时间'},
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
    label: '名称',
    attrs:{

    }
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
    detail-open-type="modal"
    api-url="measures"
  >

  </AppTable>
</template>

<style scoped>

</style>
