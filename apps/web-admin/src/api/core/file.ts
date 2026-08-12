import {requestClient} from '#/api/request';
import {calculateFileHash} from '#/utils/file.js'

export async function upload(file: any, params: any, onUploadProgress = null) {
  let files = [];
  if (Array.isArray(file)) {
    files = file
  } else {
    files = [file];
  }
  let arr = [];
  let hashSuccess = [];
  for (const index in files) {
    try {
      const hash = await calculateFileHash(files[index])
      const {data} = await requestClient.post('/uploads', {hash, name: files[index].name})
      if (data) {
        files[index].ret = data;
        hashSuccess.push(data)
      }
    } catch (e) {
      console.log(e)
    }
  }

  if(hashSuccess.length === files.length){
    return Array.isArray(file) ? hashSuccess : hashSuccess[0]
  }

  const formData: FormData = new FormData();
  let uploadIndexList = [];
  if (Array.isArray(file)) {
    for (const index in files) {
      if(files[index].ret){
        continue;
      }
      uploadIndexList.push(index)
      formData.append('file[]', files[index]);
    }
  } else {
    formData.append('file', file);
  }
  for (const key in params) {
    formData.append(key, params[key]);
  }

  const {data} = await requestClient.post('/uploads', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout:60000,
    onUploadProgress: onUploadProgress || (() => {
    }),
  });

  if(!Array.isArray(file)){
    return data;
  }else{
    for(let i in uploadIndexList){
      files[uploadIndexList[i]].ret = data[i]
    }
    return files.map((e)=>{
      return e.ret
    })
  }
  // 如果是数组把hash上传成功的合并
  // return !Array.isArray(file) ? data : data.concat(arr);
}
