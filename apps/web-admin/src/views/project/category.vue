<script setup lang="ts"
const options = ref({
  treeConfig: {
    transform: true,
    rowField: 'id',
    parentField: 'parent_id'
  },
  columns:[
    {field:'name',title:'名称',fixed:'left',dragSort: true},
  ],
  data:[]
});
const fields = ref([
  {
    field: 'name',
    type: 'text',
    col: 6,
    label: '名称',
    rules: [v => !!v || '请输入名称']
  },
]);
const filters = ref([
  {
    field:'name',
    type: 'text',
    col: 3,
    label: '名称',
  },
]);

const editingItem = ref({})
</script>

<template>
  <AppTable
    :options="options"
    :filter-fields="filters"
    api-url="categories"
    :fields="fields"
    :request-data="{type:'project'}"
  >

  </AppTable>
</template>

<style scoped>

</style>
