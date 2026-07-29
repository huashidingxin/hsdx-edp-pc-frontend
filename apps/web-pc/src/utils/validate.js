/**
 * Created by PanJiaChen on 16/11/18.
 */

/**
 * @param {string} path
 * @returns {Boolean}
 */
export function isExternal(path) {
  return /^(https?:|mailto:|tel:)/.test(path)
}

/**
 * @param {string} str
 * @returns {Boolean}
 */
export function validUsername(str) {
  const reg = /^[a-zA-Z]{1}([a-zA-Z0-9]|[._]){3,15}$/;
  return reg.test(str);
}

export function validUsernameLogin(str) {
  const reg1 = /^[a-zA-Z]{1}([a-zA-Z0-9]|[._]){3,15}$/;
  const reg2 = /^1[3456789]\d{9}$/;
  return reg1.test(str) || reg2.test(str)
}

/**
 * @param {string} str
 * @returns {Boolean}
 */
export function validNickname(str) {
  const reg = /^[0-9a-zA-Z\u4e00-\u9fa5]{2,16}$/;
  return reg.test(str);
}

/**
 * @param {string} url
 * @returns {Boolean}
 */
export function validURL(url) {
  const reg = /^(https?|ftp):\/\/([a-zA-Z0-9.-]+(:[a-zA-Z0-9.&%$-]+)*@)*((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}|([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.(com|edu|gov|int|mil|net|org|biz|arpa|info|name|pro|aero|coop|museum|[a-zA-Z]{2}))(:[0-9]+)*(\/($|[a-zA-Z0-9.,?'\\+&%$#=~_-]+))*$/
  return reg.test(url)
}

export function validDecimal(str) {

}

/**
 * @param {string} mobile
 * @returns {Boolean}
 */
export function validMobile(mobile) {
  const reg = /^1[3456789]\d{9}$/;
  return reg.test(mobile)
}

export function validPhone(phone,both=true){
  const reg = /^([0-9]{3,4}-)?[0-9]{7,8}$/;
  if(both){
    return reg.test(phone) || validMobile(phone)
  }else{
    return reg.test(phone);
  }

}

/**
 * @param {string} name
 * @returns {Boolean}
 */
export function validName(name) {
  const reg = /^[\u4e00-\u9fa5\·]{2,25}$/;
  return reg.test(name)
}

export function validIdCard(id) {
  var flag = true;
  //转换大小写
  id = id.toUpperCase();
  var arrVerifyCode = [1, 0, "X", 9, 8, 7, 6, 5, 4, 3, 2];
  var Wi = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  var Checker = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];
  if(id.length !== 15 && id.length !== 18) {
    //身份证号不符合规则
    flag = false;
  }
  var Ai = id.length === 18 ? id.substring(0, 17) : id.slice(0, 6) + "19" + id.slice(6, 16);
  if(!/^\d+$/.test(Ai)) {
    // 身份证号不符合规则
    flag = false;
  }
  var yyyy = Ai.slice(6, 10),
    mm = Ai.slice(10, 12) - 1,
    dd = Ai.slice(12, 14);
  var d = new Date(yyyy, mm, dd),
    now = new Date();
  var year = d.getFullYear(),
    mon = d.getMonth(),
    day = d.getDate();
  if(year != yyyy || mon != mm || day != dd || d > now || year < 1800) {
    // 身份证号不符合规则
    flag = false;
  }
  for(var i = 0, ret = 0; i < 17; i++) {
    ret += Ai.charAt(i) * Wi[i]
  }
  Ai += arrVerifyCode[ret %= 11];
  if(id.length === 18 && id != Ai) {
    // 身份证号不符合规则
    flag = false;
  }
  return flag;
}

/**
 * @param {string} str
 * @returns {Boolean}
 */
export function validLowerCase(str) {
  const reg = /^[a-z]+$/
  return reg.test(str)
}

/**
 * @param {string} str
 * @returns {Boolean}
 */
export function validUpperCase(str) {
  const reg = /^[A-Z]+$/
  return reg.test(str)
}

/**
 * @param {string} str
 * @returns {Boolean}
 */
export function validAlphabets(str) {
  const reg = /^[A-Za-z]+$/
  return reg.test(str)
}

/**
 * @param {string} email
 * @returns {Boolean}
 */
export function validEmail(email) {
  const reg = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  return reg.test(email)
}

/**
 * @param {string} str
 * @returns {Boolean}
 */
export function isString(str) {
  if (typeof str === 'string' || str instanceof String) {
    return true
  }
  return false
}

/**
 * @param {Array} arg
 * @returns {Boolean}
 */
export function isArray(arg) {
  if (typeof Array.isArray === 'undefined') {
    return Object.prototype.toString.call(arg) === '[object Array]'
  }
  return Array.isArray(arg)
}

export function formatFieldRule(arr,isNumeric=false) {
  if(!arr) {
    return []
  }
  const rules = [];
  isNumeric = arr[0].includes('numeric') || isNumeric
  for(let i in arr[0]) {
    const ruleItem = arr[0][i];
    const ruleItemArr = ruleItem.split(':')
    const errMsg =  arr?.[1]?.[i] || '格式有误';
    switch(ruleItemArr[0]){
      case 'required':
        rules.push(v=>!!v || errMsg)
        break;
      case 'min':
        if(isNumeric){
          rules.push(v=> v >= parseFloat(ruleItemArr[1]) || errMsg)
        }else{
          rules.push(v=> v.length >= ruleItemArr[1] || errMsg)
        }
        break;
      case 'max':
        if(isNumeric){
          rules.push(v=> v <= parseFloat(ruleItemArr[1]) || errMsg)
        }else{
          rules.push(v=> v.length <= ruleItemArr[1] || errMsg)
        }
        break;
    }
  }
  return rules;
}
