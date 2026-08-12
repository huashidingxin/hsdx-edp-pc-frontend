export default {
  apiUrl: "activities",
  resourceName: "活动",
  requestData: {},
  options: {
    columns: [
      {field:'content',title:'内容',fixed:'left',width:200},
      {field:'procedure.name',title:'工序'},
      {field:'notes',title:'注意事项'},
      {field:'created_at',title:'创建时间'},
    ]
  },
  filters: [
    {
      field:'keyword',
      type: 'text',
      col: 4,
      label: '内容',
    },
  ]
}
