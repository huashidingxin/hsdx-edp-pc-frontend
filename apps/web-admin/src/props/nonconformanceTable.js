export default {
  apiUrl: "nonconformances",
  resourceName: "不符合项",
  requestData: {},
  options: {
    columns: [
      {field: 'content', title: '内容', minWidth: 200,},
      {field: 'state_desc', title: '状态', minWidth: 100,},
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
  ]
}
