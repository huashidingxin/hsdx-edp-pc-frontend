import CryptoJS from 'crypto-js';
export async function getInfo(url) {
	try {
		const response = await fetch(url, { method: 'HEAD' });

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		// 获取Content-Length头部
		const contentLength = response.headers.get('Content-Length');
		const contentType = response.headers.get('Content-Type')

		if (contentLength) {
			const sizeInBytes = parseInt(contentLength, 10);
			return {
				size:sizeInBytes,
				type:contentType,
			};
		} else {
			console.error('Content-Length header not found.');
			return null;
		}
	} catch (error) {
		console.error('Error fetching image size:', error);
		return null;
	}
}

export async function blobUrlToFile(blobUrl, filename='image.png', mimeType='image/webp') {
	try {
		// 使用fetch API从Blob URL获取Blob对象
		const response = await fetch(blobUrl);
		if (!response.ok) {
			throw new Error('Network response was not ok');
		}

		// 从响应中读取Blob
		const blob = await response.blob();

		// 创建File对象
		const file = new File([blob], filename, { type: mimeType });

		return file;
	} catch (error) {
		console.error('Error converting Blob URL to File:', error);
		return null;
	}
}

export function base64ToFile(base64String, filename,mimetype='image/webp') {
	// 去掉Base64字符串前面的"data:image/jpeg;base64,"等前缀
	const base64Data = base64String.split(',')[1] || base64String;

	const regex = /^data:([^;]+);base64,/;

	// 使用正则表达式匹配
	const match = base64String.match(regex);

	// 如果匹配成功，返回MIME类型；否则返回null
	mimetype = match ? match[1] : mimetype;
	let extension = mimetype.replace('image/','')
	if(extension === 'jpeg'){
		extension = 'jpg'
	}
	// 将Base64字符串解码为二进制数据
	const byteCharacters = atob(base64Data);
	const byteNumbers = new Array(byteCharacters.length);
	for (let i = 0; i < byteCharacters.length; i++) {
		byteNumbers[i] = byteCharacters.charCodeAt(i);
	}
	const byteArray = new Uint8Array(byteNumbers);

	// 创建Blob对象
	const blob = new Blob([byteArray], { type: mimetype });
	// 创建File对象
	return new File([blob], filename || (Date.now()+'.'+extension), { type: mimetype });

}

export async function videoUrlToBlobUrl(videoUrl) {
	try {
		const response = await fetch(videoUrl, {
			method: 'GET',
			mode: 'cors',  // 明确指定为跨域请求
			credentials: 'omit'  // 不发送认证凭据
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const blob = await response.blob();
		const blobUrl = URL.createObjectURL(blob);

		return blobUrl;
	} catch (error) {
		console.error('Error converting video URL to Blob URL:', error);
		return null;
	}
}

export function isBase64(str) {
	try {
		str = str.replace(/^data:image\/\w+;base64,/, '')
		const decoded = atob(str);
		const reencoded = btoa(decoded);
		return reencoded === str;
	} catch (error) {
		return false;
	}
}

async function calculatePartialHash(file, start, end) {
	const slice = file.slice(start, end);
	const arrayBuffer = await slice.arrayBuffer();
	const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
	return CryptoJS.SHA1(wordArray).toString();
}

export async function calculateFileHash(file) {
	const fileSize = file.size;

	// 计算前 1MB 和最后 1MB 的哈希值
	const firstMBHash = await calculatePartialHash(file, 0, Math.min(1024 * 1024, fileSize));
	const lastMBHash = await calculatePartialHash(file, Math.max(fileSize - 1024 * 1024, 0), fileSize);

	// 合并并计算 SHA-1 哈希
	const combinedString = firstMBHash + lastMBHash + fileSize;
	return CryptoJS.SHA1(combinedString).toString();
}

export function createObjectURL(file) {
  const _URL = window.URL || window.webkitURL;

  return _URL.createObjectURL(file);
}

export function formatSize(e) {
  if(e < 1024){
    return e+'b'
  }else if(e < 1024*1024){
    return (e/1024).toFixed(2) + 'kb'
  }else if(e < 1024*1024*1024){
    return  (e/1024/1024).toFixed(2) +'mb'
  }
}



