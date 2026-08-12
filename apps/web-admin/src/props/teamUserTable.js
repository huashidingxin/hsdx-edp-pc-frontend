export default {
  apiUrl: "project-users",
  resourceName: "项目成员",
  requestData: {},
  options: {
    columns: [
      {field:'staff.staff_name',title:'姓名',width:200,fixed:'left'},
      {field:'user.avatar',title:'照片',width:200,customRender:{type:'image'}},
      {field:'staff.staff_mobile',title:'手机号',width:200},
      {field:'joining_date',title:'加入时间',width:200},
      {field:'roles',title:'角色',width:200,slots:{default:'default_roles'}},
      {field:'status',title:'状态',width:200},
      {field:'created_at',title:'创建时间',width:200},
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
