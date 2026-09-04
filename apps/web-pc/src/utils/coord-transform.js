/**
 * GCJ-02 (火星坐标) → WGS-84 坐标转换
 *
 * 后端存储的是 GCJ-02 坐标（APP 采集后转换），PC 端 OpenLayers 使用 WGS84。
 * 需要在 fromLonLat() 之前先将 GCJ-02 转回 WGS-84，否则地图上会有 100~700m 偏移。
 */

const PI = Math.PI;
const A = 6378245.0; // 长半轴
const EE = 0.00669342162296594323; // 偏心率平方

function outOfChina(lat, lon) {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
  let ret =
    -100.0 +
    2.0 * x +
    3.0 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret +=
    ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret +=
    ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) *
      2.0) /
    3.0;
  return ret;
}

function transformLon(x, y) {
  let ret =
    300.0 +
    x +
    2.0 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  ret +=
    ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret +=
    ((150.0 * Math.sin((x / 12.0) * PI) +
      300.0 * Math.sin((x / 30.0) * PI)) *
      2.0) /
    3.0;
  return ret;
}

/**
 * GCJ-02 → WGS-84（迭代法，精度约 0.5m）
 * @param {number} gcjLat - GCJ-02 纬度
 * @param {number} gcjLng - GCJ-02 经度
 * @returns {[number, number]} [wgsLat, wgsLng]
 */
export function gcj02ToWgs84(gcjLat, gcjLng) {
  if (outOfChina(gcjLat, gcjLng)) {
    return [gcjLat, gcjLng];
  }
  let wgsLat = gcjLat;
  let wgsLng = gcjLng;
  for (let i = 0; i < 5; i++) {
    const dLat = transformLat(wgsLng - 105.0, wgsLat - 35.0);
    const dLng = transformLon(wgsLng - 105.0, wgsLat - 35.0);
    const radLat = (wgsLat / 180.0) * PI;
    let magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    wgsLat =
      gcjLat -
      (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
    wgsLng =
      gcjLng -
      (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  }
  return [wgsLat, wgsLng];
}

/**
 * 批量 GCJ-02 → WGS-84
 * @param {Array<{lat: number, lng: number}>} points
 * @returns {Array<{lat: number, lng: number}>}
 */
export function batchGcj02ToWgs84(points) {
  return points.map((p) => {
    const [lat, lng] = gcj02ToWgs84(Number(p.lat), Number(p.lng));
    return { ...p, lat, lng };
  });
}
