export default {
  apiUrl: "procedures",
  resourceName: "工序",
  requestData: {},
  options: {
    columns: [
      {field:'name',title:'名称',fixed:'left'},
      {field:'category.name',title:'分类'},
      {field:'created_at',title:'创建时间'},
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
