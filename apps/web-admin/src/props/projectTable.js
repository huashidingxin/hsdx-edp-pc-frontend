export default {
  apiUrl: "projects",
  resourceName: "项目",
  requestData: {type: 2},
  options: {
    columns: [
      {field: 'name', title: '名称', minWidth: 200,},
      {field: 'owner.name', title: '业主', minWidth: 200,},
      {field: 'created_at', title: '创建时间', width: 200,},
    ]
  },
  filters: [
    {
      field:'code',
      type: 'text',
      col: 4,
      label: '编号',
    },
    {
      field:'name',
      type: 'text',
      col: 4,
      label: '名称',
    },
  ]
}
