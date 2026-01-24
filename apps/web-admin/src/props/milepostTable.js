export default {
  apiUrl: "mileposts",
  resourceName: "桩号",
  requestData: {},
  options: {
    columns: [
      {field: 'name', title: '名称', fixed: 'left', width: '300px'},
      {field: 'code', title: '编号'},
    ]
  },
  filters: [
    {
      field:'keyword',
      type: 'text',
      col: 4,
      label: '名称/code关键字',
    },
  ]
}
