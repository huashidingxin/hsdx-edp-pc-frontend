export default {
  apiUrl: "forms",
  resourceName: "表单",
  requestData: {},
  options: {
    columns: [
      {field:'name',title:'名称',fixed:'left',minWidth:200},
      {field:'category.name',title:'分类',width:200},
    ]
  },
  filters: [
    {
      field:'name',
      type: 'text',
      col: 4,
      label: '名称',
    },
  ]
}
