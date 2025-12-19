export function getTree(data, pid = 0,idKey='id',parentKey='parent_id') {
  let tree = [];
  for (let i in data) {
    if (data[i][parentKey] === pid || (data[i][parentKey] === null && pid === 0)) {
      const children = getTree(data, data[i][idKey],idKey,parentKey)
      if (children?.length > 0) {
        data[i]['children'] = children;
      }
      tree.push(data[i])
    }
  }
  return tree;
}


