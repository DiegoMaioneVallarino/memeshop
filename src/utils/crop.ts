import type { ImageLayer, MaskStroke } from '../types/editor';

export type CropRatio = 'Libre' | 'Cuadrado' | '4:3' | '3:4' | '16:9' | '9:16';
export const CROP_RATIOS: CropRatio[] = ['Libre', 'Cuadrado', '4:3', '3:4', '16:9', '9:16'];
const RATIO_VALUE: Record<CropRatio, number | null> = { Libre: null, Cuadrado: 1, '4:3': 4 / 3, '3:4': 3 / 4, '16:9': 16 / 9, '9:16': 9 / 16 };

export type CropState = {
  ratio: CropRatio;
  // Libre: margins in % of the image (0..45 each), so the rectangle can be asymmetric.
  left: number; right: number; top: number; bottom: number;
  // Fixed ratio: zoom 1..4 (1 = largest rectangle) and position 0..1 inside the free travel.
  zoom: number; panX: number; panY: number;
  // Straighten angle in degrees (-45..45), as the user sees it.
  angle: number;
};
export const initialCrop: CropState = { ratio: 'Libre', left: 0, right: 0, top: 0, bottom: 0, zoom: 1, panX: .5, panY: .5, angle: 0 };

export type Rect = { x: number; y: number; w: number; h: number };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/**
 * Crop rectangle as FRACTIONS (0..1) of the image, in image-local coordinates.
 * `width`/`height` are the layer's displayed size (the ratio is what the user sees).
 * When the layer is mirrored (flipX) the user's "left" is the image's right, so we swap.
 */
export function cropRect(c: CropState, width: number, height: number, flipX = false): Rect {
  const ratio = RATIO_VALUE[c.ratio];
  if (ratio === null) {
    let l = c.left, r = c.right;
    if (flipX) [l, r] = [r, l];
    const w = Math.max(.1, 1 - (l + r) / 100), h = Math.max(.1, 1 - (c.top + c.bottom) / 100);
    return { x: clamp(l / 100, 0, 1 - w), y: clamp(c.top / 100, 0, 1 - h), w, h };
  }
  let w = width, h = width / ratio;
  if (h > height) { h = height; w = height * ratio; }
  const z = clamp(c.zoom, 1, 4);
  w /= z; h /= z;
  const px = flipX ? 1 - c.panX : c.panX;
  return { x: ((width - w) * clamp(px, 0, 1)) / width, y: ((height - h) * clamp(c.panY, 0, 1)) / height, w: w / width, h: h / height };
}

/** Angle in radians in image-local space (the preview/bake rotate inside the mirrored frame, so mirror the sign). */
export const cropLocalAngle = (c: CropState, flipX = false) => (c.angle * Math.PI / 180) * (flipX ? -1 : 1);
export const isCropNoop = (c: CropState, r: Rect) => Math.abs(c.angle) < .01 && r.x < 1e-4 && r.y < 1e-4 && r.w > 1 - 1e-4 && r.h > 1 - 1e-4;

/** Integer pixel rectangle on the source bitmap + the fractions it really corresponds to after rounding. */
export function pixelRect(r: Rect, sw: number, sh: number) {
  const x = clamp(Math.round(r.x * sw), 0, sw - 1), y = clamp(Math.round(r.y * sh), 0, sh - 1);
  const w = clamp(Math.round(r.w * sw), 1, sw - x), h = clamp(Math.round(r.h * sh), 1, sh - y);
  return { px: { x, y, w, h }, frac: { x: x / sw, y: y / sh, w: w / sw, h: h / sh } as Rect };
}

/**
 * New geometry for a layer after cropping to `frac` (and baking `angle` radians of straightening about the image center).
 * - The cropped content stays where it was on the document (center is moved, not re-centered).
 * - maskStrokes live in layer-local coords, so they are rotated (if straightened) and shifted into the new frame.
 */
export function croppedGeometry(layer: Pick<ImageLayer, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipX' | 'maskStrokes'>, frac: Rect, angle: number) {
  const W = layer.width, H = layer.height;
  const newW = W * frac.w, newH = H * frac.h;
  const dx = ((frac.x + frac.w / 2) * W - W / 2) * (layer.flipX ? -1 : 1);
  const dy = (frac.y + frac.h / 2) * H - H / 2;
  const cr = Math.cos(layer.rotation), sr = Math.sin(layer.rotation);
  const cx = layer.x + W / 2 + dx * cr - dy * sr, cy = layer.y + H / 2 + dx * sr + dy * cr;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const map = (p: { x: number; y: number }) => {
    let x = p.x, y = p.y;
    if (angle) { const ux = x - W / 2, uy = y - H / 2; x = W / 2 + ux * ca - uy * sa; y = H / 2 + ux * sa + uy * ca; }
    return { x: x - frac.x * W, y: y - frac.y * H };
  };
  const maskStrokes: MaskStroke[] | undefined = layer.maskStrokes?.map(s => ({ ...s, points: s.points.map(map) }));
  return { x: cx - newW / 2, y: cy - newH / 2, width: newW, height: newH, maskStrokes };
}
