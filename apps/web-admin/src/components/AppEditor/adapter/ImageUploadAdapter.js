import {upload as uploadFile} from "#/api";

export default class ImageUploadAdapter {
  loader
  // 指定图片存储的二级目录
  prefix

  constructor(loader, prefix) {
    this.loader = loader
    this.prefix = prefix
  }

  upload() {
    return this.loader.file.then(async (file) => new Promise(async (resolve, reject) => {
      try {
        const data = await uploadFile(file, {}, (e) => {
          console.log(e)
          //this.loader.uploadedPercent
        })
        console.log(data)
        resolve({default:data})
      } catch (e) {
        console.log(e)
        reject(e)
      }
    }))
  }

  abort() {
    this.loader.abort()
  }
}
