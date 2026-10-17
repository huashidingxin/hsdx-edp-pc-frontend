/**
 * cropperjs 2.x 组合模板：初始选区覆盖整张图，可注入裁剪比例。
 * 不使用库导出的 DEFAULT_TEMPLATE（部分解析路径下导出缺失），自带模板更可控。
 *
 * @param aspectRatio 裁剪宽高比；非有限值（NaN/undefined）为自由比例
 * @returns 传给 createCropper(el, { template }) 的模板字符串
 */
export function buildCropperTemplate(aspectRatio?: number): string {
  // 初始选区交给库自身计算（initial-coverage=1 + aspect-ratio）：
  // 选区坐标是画布可视空间，库会按图片视觉内接盒居中初始化，
  // 即"默认裁剪框=图片本身"；不要再用自然像素坐标 $change 覆盖
  // （曾因此把框撑出容器、被裁剪成整个预览框）。
  const ratioAttr = Number.isFinite(aspectRatio)
    ? ` aspect-ratio="${aspectRatio}"`
    : '';
  // outlined：宿主默认无边框，不加则裁剪框几乎不可见。
  return (
    '<cropper-canvas background style="width:100%;height:100%">'
    + '<cropper-image rotatable scalable skewable translatable></cropper-image>'
    + '<cropper-shade hidden></cropper-shade>'
    + '<cropper-handle action="select" plain></cropper-handle>'
    + `<cropper-selection initial-coverage="1"${ratioAttr} outlined movable resizable>`
    + '<cropper-grid role="grid" bordered covered></cropper-grid>'
    + '<cropper-crosshair centered></cropper-crosshair>'
    + '<cropper-handle action="move" theme-color="rgba(255, 255, 255, 0.35)"></cropper-handle>'
    + '<cropper-handle action="n-resize"></cropper-handle>'
    + '<cropper-handle action="e-resize"></cropper-handle>'
    + '<cropper-handle action="s-resize"></cropper-handle>'
    + '<cropper-handle action="w-resize"></cropper-handle>'
    + '<cropper-handle action="ne-resize"></cropper-handle>'
    + '<cropper-handle action="nw-resize"></cropper-handle>'
    + '<cropper-handle action="se-resize"></cropper-handle>'
    + '<cropper-handle action="sw-resize"></cropper-handle>'
    + '</cropper-selection>'
    + '</cropper-canvas>'
  );
}
