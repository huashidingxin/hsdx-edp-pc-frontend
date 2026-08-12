<script setup lang="ts">
import NavPermission from "@/views/permission/components/NavPermission.vue";
import Resource from "@/api/resource";
import ResourcePermission from "@/views/permission/components/ResourcePermission.vue";

const options = ref({
  columns: [
    {field: 'display_name', title: '名称', width: 300, fixed: 'left'},
    {field: 'scope_desc', title: '权限范围'},
    // {field:'collaboration.collaboratable_type_desc',title:'角色组',fixed:'left'},
  ],
  data: []
});
const fields = ref([
  {
    field: 'name',
    type: 'text',
    col: 4,
    label: '标识',
    attrs:{
      readonly:false
    },
    rules: [v => !!v || '请输入标识']
  },
  {
    field: 'display_name',
    type: 'text',
    col: 4,
    label: '名称',
    attrs:{
      readonly:false
    },
    rules: [v => !!v || '请输入名称']
  },
  {
    field: 'scope',
    type: 'select',
    col: 4,
    label: '权限范围',
    default:1,
    attrs:{
      items:[
        {id:0,name:'全部权限'},
        {id:1,name:'自身权限'},
        {id:2,name:'部门/组内权限'},
      ]
    },
    rules: [v => v != undefined || '请选择权限范围']
  },
  {
    field: 'permission',
    type: 'slot',
    col: 12,
    label: '名称',
  },
]);
const filters = ref([{
  field: 'name',
  type: 'text',
  col: 3,
  label: '标识',
},
  {
    field: 'name',
    type: 'text',
    col: 3,
    label: '名称',
  },
]);

const editingItem = ref({})
const navSelected = ref([])
const resourceSelected = ref([])

const navPermissions = ref([])
const resourcePermissions = ref([])

async function getPermissions() {
  try {
    const api = new Resource('permissions')
    const {data} = await api.list({per_page: 'all'})
    let nav = [];
    let res = []
    for (let i in data) {
      if (data[i].type == 1) {
        nav.push(data[i])
      } else {
        res.push(data[i])
      }
    }
    navPermissions.value = nav;
    resourcePermissions.value = res
  } catch (e) {
    console.log(e)
  }
}

const rolePermissions = ref([])

async function getRolePermissions(roleId) {
  try {
    const api = new Resource('roles/' + roleId + '/permissions')
    const {data} = await api.list()
    rolePermissions.value = data;

    initRolePermissions()
  } catch (e) {
    console.log(e)
  }
}

function initRolePermissions() {
  let nav = [];
  let res = [];
  for (let i in rolePermissions.value) {
    if (rolePermissions.value[i].type == 1) {
      nav.push(rolePermissions.value[i].id)
    } else {
      res.push(rolePermissions.value[i].id)
    }
  }
  navSelected.value = nav
  resourceSelected.value = res
}

function detailFormat(e) {

  getRolePermissions(e.id)
  if(e.id <= 100){
    fields.value[0].attrs.readonly = true
    fields.value[1].attrs.readonly = true
  }
}

function onReset() {
  initRolePermissions()
}

function saveFormat(e) {
  e.permissions = navSelected.value.concat(resourceSelected.value)
  return e;
}

const navRef = ref(null)
const resourceRef = ref(null)
function selectAllNav() {
  navRef.value.selectAll(navSelected.value.length !== navPermissions.value.length)
}

function selectAllRes() {
  resourceRef.value.selectAll(resourceSelected.value.length !== resourcePermissions.value.length)
}
function showEdit(e) {
  return e.id > 10;
}
function showDelete(e) {
  return e.id > 10;
}

onBeforeMount(() => {
  getPermissions()
})


</script>

<template>
  <AppTable
    v-model="editingItem"
    :options="options"
    :filter-fields="filters"
    api-url="roles"
    :fields="fields"
    @reset="onReset"
    :save-format="saveFormat"
    :detail-format="detailFormat"
    :show-edit="showEdit"
    :show-delete="showDelete"
  >
    <template v-if="editingItem.id" #field_permission>
      <v-card flat class="mt-2" v-if="navPermissions?.length">
        <v-card-title class="d-flex justify-between align-center">
          <div class="card-title">权限配置</div>
<!--          <div class="d-flex justify-between">-->
<!--            <v-btn color="warning" variant="tonal" class="mr-3" @click="onReset">重置</v-btn>-->
<!--            <v-btn color="primary" variant="flat" @click="savePermissions">保存权限</v-btn>-->
<!--          </div>-->

        </v-card-title>
        <v-card-text>
          <div class="text-subtitle-1 font-weight-bold mb-2 d-flex justify-between align-center">
            页面权限
            <div>
              <v-checkbox :model-value="navSelected.length === navPermissions.length" label="全选" color="primary" hide-details density="compact" @click="selectAllNav"></v-checkbox>
            </div>
          </div>
          <NavPermission ref="navRef" :data="navPermissions" v-model="navSelected"></NavPermission>
        </v-card-text>

        <div class="my-3 "></div>
        <v-card-text>
          <div class="text-subtitle-1 font-weight-bold mb-2 d-flex justify-between align-center">
            功能权限
            <div>
              <v-checkbox :model-value="resourceSelected.length === resourcePermissions.length" label="全选" color="primary" hide-details density="compact" @click="selectAllRes"></v-checkbox>
            </div>
          </div>
          <ResourcePermission ref="resourceRef" :data="resourcePermissions"
                              v-model="resourceSelected"></ResourcePermission>
        </v-card-text>
      </v-card>
    </template>
  </AppTable>
</template>

<style scoped>

</style>
