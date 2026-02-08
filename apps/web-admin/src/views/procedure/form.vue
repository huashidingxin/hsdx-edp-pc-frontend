<script setup lang="ts">
const props = defineProps({
  procedureId:{
    default:undefined,
    type:[String,Number]
  },
  projectCategoryId:{
    default:undefined,
    type:[String,Number]
  }
});
const options = ref({
  columns:[
    {field:'measure.name',title:'监理方式',width:300},
    {field:'form.name',title:'表单'},
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
    field:'measure_id',
    type: 'autocomplete',
    col: 6,
    label: '监理方式',
    updateSearch:{
      apiUrl:'measures',
    },
  },
  {
    field:'form_id',
    type: 'autocomplete',
    col: 6,
    label: '表单',
    updateSearch:{
      apiUrl:'forms',
      params:{
        project_category_ids:[0,props.projectCategoryId],
        type:2
      }
    },
    attrs:{

    }
  },
]);

const editingItem = ref({})

const $toast = inject('$toast')
const requestData = computed(()=>{
  return {procedure_id:props.procedureId}
})
function saveFormat(e) {
  return {...e,procedure_id:props.procedureId}
}
</script>
<template>
  <AppTable
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    :fields="fields"
    :request-data="requestData"
    :save-format="saveFormat"
    detail-open-type="modal"
    api-url="procedure-forms"
    title="工序表单"
  >
    <template v-if="editingItem.id" #form_description>
      <div class="font-weight-bold mb-3">监理方式：{{editingItem.measure.name}}</div>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
