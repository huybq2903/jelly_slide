// Bộ vẽ giao diện kiểu game casual "juicy": tông tím-indigo bão hoà, khối bo tròn phồng (nút bánh mì), panel lồng nhau, gradient sáng
// trên đậm dưới, viền tối đậm hơn nền, chữ trắng viền dày. Chỉ có hàm vẽ Canvas 2D, không giữ trạng thái. Màu của khối len và giỏ vẫn ở render.ts.

export const PAL = {
  navy: '#143470',
  navyDeep: '#0b224a',
  ink: '#23448f',
  cream: '#fff3d6',
  gold: '#ffc83d',
  plum: '#1f4b96',
  lav: '#8bb3ff',
};

import { FONT_STACK } from './fonts';

/**
 * Chủ đề màu của màn: `hue` là độ xoay sắc độ (độ) áp lên toàn bộ bảng màu xanh của nền và HUD. 0 = xanh (màn thường);
 * game chạy dần tới ~142 (đỏ, màn khó) hoặc ~58 (tím, màn siêu khó) khi vào level.
 */
export const theme = { hue: 0 };

const themeCache = new Map<string, string>();

function parseColor(c: string): [number, number, number, number] | null {
  if (c[0] === '#') {
    const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join('') : c.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x));
  return [p[0], p[1], p[2], p[3] ?? 1];
}

/** Xoay sắc độ của một màu (hex hoặc rgb/rgba) theo `theme.hue`, giữ nguyên độ bão hoà và độ sáng. */
export function th(color: string): string {
  const deg = Math.round(theme.hue);
  if (deg === 0) return color;
  const key = `${deg}|${color}`;
  const hit = themeCache.get(key);
  if (hit) return hit;
  const p = parseColor(color);
  if (!p) return color;
  const r = p[0] / 255;
  const g = p[1] / 255;
  const b = p[2] / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  let hh = 0;
  let sat = 0;
  if (d > 1e-6) {
    sat = d / (1 - Math.abs(2 * l - 1));
    if (mx === r) hh = ((g - b) / d + 6) % 6;
    else if (mx === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh *= 60;
  }
  hh = (hh + deg + 360) % 360;
  const c1 = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c1 * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m0 = l - c1 / 2;
  const [r1, g1, b1] = hh < 60 ? [c1, x, 0] : hh < 120 ? [x, c1, 0] : hh < 180 ? [0, c1, x] : hh < 240 ? [0, x, c1] : hh < 300 ? [x, 0, c1] : [c1, 0, x];
  const to = (v: number): number => Math.round((v + m0) * 255);
  const out = p[3] < 1 ? `rgba(${to(r1)},${to(g1)},${to(b1)},${p[3]})` : `rgb(${to(r1)},${to(g1)},${to(b1)})`;
  themeCache.set(key, out);
  return out;
}

/** Chuỗi font cho ctx.font. Nunito được khai báo một cut (weight 400) nên không ghi weight (tránh trình duyệt giả in đậm). */
export const font = (size: number): string => `${size}px ${FONT_STACK}`;

export type ButtonKind = 'green' | 'blue' | 'red' | 'orange' | 'gold' | 'gray' | 'purple';

const KINDS: Record<ButtonKind, { top: string; bot: string; edge: string; outline: string }> = {
  green: { top: '#7af050', bot: '#22a822', edge: '#0c4a16', outline: '#0f5a1a' },
  blue: { top: '#5cc8ff', bot: '#1670cc', edge: '#0f3a82', outline: '#1650a8' },
  red: { top: '#ff8c8c', bot: '#e8303c', edge: '#b01e2a', outline: '#5a0a14' },
  orange: { top: '#ffd86a', bot: '#ff9420', edge: '#d9700f', outline: '#7a3a08' },
  gold: { top: '#ffe27a', bot: '#ffb52e', edge: '#d98a14', outline: '#7a4a10' },
  gray: { top: '#d9d4e2', bot: '#aaa3b9', edge: '#857d98', outline: '#4d4660' },
  purple: { top: '#9dbcff', bot: '#457bdc', edge: '#2a5fb8', outline: '#12356e' },
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function vgrad(ctx: CanvasRenderingContext2D, y0: number, y1: number, top: string, bot: string): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  return g;
}

/** Chữ trắng đậm có viền dày và bóng đổ phía dưới, dấu hiệu nhận ra của kiểu giao diện này. */
export function strokedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke: string,
  align: CanvasTextAlign = 'center',
  thin = 1,
): void {
  ctx.save();
  ctx.font = font(size);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = size * 0.3 * thin;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.strokeText(text, x, y + size * 0.12);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = size * 0.27 * thin;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Nền tím-indigo có hoạ tiết chần bông (đường khâu chéo), tối dần ra mép. */
export function quiltBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, th('#4d91f0'));
  g.addColorStop(0.5, th('#2763bd'));
  g.addColorStop(1, th('#143a78'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  const s = 72;
  for (let k = -h; k < w + h; k += s) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + h, h);
    ctx.moveTo(k, h);
    ctx.lineTo(k + h, 0);
    ctx.stroke();
  }
  ctx.restore();
  const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.2, w / 2, h * 0.45, Math.max(w, h) * 0.75);
  v.addColorStop(0, th('rgba(4,22,48,0)'));
  v.addColorStop(1, th('rgba(4,22,48,0.5)'));
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** Hệ số co của phần bên trong nút khi bấm (press 0..1). Viền ngoài giữ nguyên, chỉ mặt nút và nhãn/biểu tượng co vào. */
export function pressScale(press: number): number {
  return 1 - 0.1 * Math.min(1, Math.max(0, press));
}

/**
 * Khối "đùn" cứng kiểu juicy: một lớp đáy đặc đậm màu lệch xuống `depth` px (không nhoè), viền dày `bw`, ruột gradient trên sáng dưới đậm,
 * vòng sáng bên trong, dải tối ở đáy ruột và vệt sáng bo tròn nửa trên. `blur` > 0 thêm bóng mềm đổ phía dưới.
 */
function hardBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  o: { top: string; bot: string; border: string; bw: number; base: string; depth: number; blur?: number; band?: number; gloss?: boolean; glossH?: number; ring?: string },
): void {
  if (o.blur) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = o.blur;
    ctx.shadowOffsetY = o.depth + o.blur * 0.4;
    ctx.fillStyle = o.base;
    rr(ctx, x, y + o.depth, w, h, r);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = o.base;
  rr(ctx, x, y + o.depth, w, h, r);
  ctx.fill();
  ctx.fillStyle = o.border;
  rr(ctx, x, y, w, h, r);
  ctx.fill();
  const ix = x + o.bw;
  const iy = y + o.bw;
  const iw = w - o.bw * 2;
  const ih = h - o.bw * 2;
  const ir = Math.max(2, r - o.bw);
  ctx.fillStyle = vgrad(ctx, iy, iy + ih, o.top, o.bot);
  rr(ctx, ix, iy, iw, ih, ir);
  ctx.fill();
  ctx.save();
  rr(ctx, ix, iy, iw, ih, ir);
  ctx.clip();
  if (o.band) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(ix, iy + ih - o.band, iw, o.band);
  }
  if (o.ring) {
    ctx.strokeStyle = o.ring;
    ctx.lineWidth = 4;
    rr(ctx, ix + 2, iy + 2, iw - 4, ih - 4, Math.max(2, ir - 2));
    ctx.stroke();
  }
  ctx.restore();
  if (o.gloss !== false) {
    ctx.fillStyle = vgrad(ctx, iy, iy + ih * 0.4, 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.04)');
    const gh = ih * (o.glossH ?? 0.3);
    rr(ctx, ix + iw * 0.07, iy + ih * (o.glossH ? 0.02 : 0.05), iw * 0.86, gh, gh / 2);
    ctx.fill();
  }
}

/**
 * Nút chữ nhật phồng kiểu juicy (xem hardBox). Phần cố định chỉ là lớp mờ đen bên dưới, rộng hơn nút một chút; toàn bộ nút là MỘT
 * vật thể và co lại cùng nhau khi bấm (`press` 0..1).
 */
export function chunkyButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  kind: ButtonKind,
  fontScale = 0.5,
  press = 0,
): void {
  const k = KINDS[kind];
  const depth = Math.max(6, h * 0.13);
  const r = h * 0.4;
  ctx.save();
  const fadeTop = y - 5;
  const fadeH = h + depth + 13;
  const fg = ctx.createLinearGradient(0, fadeTop, 0, fadeTop + fadeH);
  fg.addColorStop(0, 'rgba(0,0,0,0.14)');
  fg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = fg;
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 10;
  rr(ctx, x - 5, fadeTop, w + 10, fadeH, r + 5);
  ctx.fill();
  ctx.restore();
  const s = pressScale(press);
  const cx = x + w / 2;
  const cy = y + (h + depth) / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  hardBox(ctx, x, y, w, h, r, { top: k.top, bot: k.bot, border: k.outline, bw: Math.max(4, h * 0.07), base: k.edge, depth, band: h * 0.1 });
  strokedText(ctx, label, x + w / 2, y + h / 2 + 1, h * fontScale, '#ffffff', k.outline);
  ctx.restore();
}

/** Hình vuông bo góc phồng ("bánh mì") nửa cạnh `half` tâm (cx, cy + dy). */
function puff(ctx: CanvasRenderingContext2D, cx: number, cy: number, half: number): void {
  rr(ctx, cx - half, cy - half, half * 2, half * 2, half * 0.62);
}

/**
 * Nút vuông bo phồng kiểu "bánh mì" (booster, bánh răng, bật/tắt, X...). Khung ngoài cố định (vành tuỳ chọn: `ring` true = vàng,
 * 'white' = trắng; viền tối; gờ dưới), mặt bên trong co lại khi bấm (`press` 0..1). Trả về hệ số co để chỗ gọi co luôn biểu tượng
 * vẽ chồng lên (xem pressScale). `r` là nửa cạnh của mặt nút.
 */
export function roundButton(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, kind: ButtonKind, ring: boolean | 'white' = false, press = 0, square = false): number {
  const k = KINDS[kind];
  const shape = (px: number, py: number, half: number): void => {
    if (square) puff(ctx, px, py, half);
    else {
      ctx.beginPath();
      ctx.arc(px, py, half, 0, Math.PI * 2);
    }
  };
  // Khung cố định và mặt nút ĐỒNG TÂM tuyệt đối (không có gờ/đế lệch xuống): chỉ có bóng mờ phía dưới; khe giữa mặt nút và mép khung là 2px.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.38)';
  ctx.shadowBlur = 9;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = k.outline;
  shape(cx, cy, r + 2);
  ctx.fill();
  ctx.restore();
  if (ring) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.38)';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = ring === 'white' ? k.outline : '#5a2f08';
    shape(cx, cy, r + 5.5);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = ring === 'white' ? '#ffffff' : vgrad(ctx, cy - r - 6, cy + r + 6, '#ffe27a', '#d98a14');
    shape(cx, cy, r + 4.2);
    ctx.fill();
    ctx.fillStyle = k.outline;
    shape(cx, cy, r + 2);
    ctx.fill();
  }
  const s = pressScale(press);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  const rf = r; // mặt nút sát viền khung (khe 2px)
  ctx.fillStyle = vgrad(ctx, cy - rf, cy + rf, k.top, k.bot);
  shape(cx, cy, rf);
  ctx.fill();
  const rim = ctx.createLinearGradient(0, cy - rf, 0, cy);
  rim.addColorStop(0, 'rgba(255,255,255,0.8)');
  rim.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2.2;
  shape(cx, cy, rf - 1.8);
  ctx.stroke();
  ctx.fillStyle = vgrad(ctx, cy - rf, cy, 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.05)');
  ctx.beginPath();
  ctx.ellipse(cx, cy - rf * 0.48, rf * 0.68, rf * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return s;
}

/** Thẻ popup: viền xanh dày bo tròn, ruột kem. */
export function chunkyPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 30): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#0d2c80';
  rr(ctx, x - 4, y - 4, w + 8, h + 8, r + 4);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = vgrad(ctx, y, y + h, '#6db6ff', '#2a6df0');
  rr(ctx, x, y, w, h, r);
  ctx.fill();
  const m = 11;
  ctx.fillStyle = '#1f55c8';
  rr(ctx, x + m - 2, y + m - 2, w - (m - 2) * 2, h - (m - 2) * 2, r - 8);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, y + m, y + h - m, '#fffaf0', '#ffedc2');
  rr(ctx, x + m, y + m, w - m * 2, h - m * 2, r - 10);
  ctx.fill();
}

/** Ruy-băng 3D vắt ngang mép trên popup: thân có viền, vệt bóng, hai đuôi xẻ chữ V. */
export function ribbon3d(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  kind: ButtonKind,
  label: string,
): void {
  const k = KINDS[kind];
  ctx.save();
  for (const sx of [-1, 1]) {
    ctx.fillStyle = k.outline;
    ctx.beginPath();
    ctx.moveTo(cx + sx * (w / 2 - 12), cy - h * 0.2);
    ctx.lineTo(cx + sx * (w / 2 + 34), cy - h * 0.2);
    ctx.lineTo(cx + sx * (w / 2 + 18), cy + h * 0.3);
    ctx.lineTo(cx + sx * (w / 2 + 34), cy + h * 0.8);
    ctx.lineTo(cx + sx * (w / 2 - 12), cy + h * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = k.edge;
    ctx.beginPath();
    ctx.moveTo(cx + sx * (w / 2 - 12), cy - h * 0.1);
    ctx.lineTo(cx + sx * (w / 2 + 29), cy - h * 0.1);
    ctx.lineTo(cx + sx * (w / 2 + 14), cy + h * 0.3);
    ctx.lineTo(cx + sx * (w / 2 + 29), cy + h * 0.7);
    ctx.lineTo(cx + sx * (w / 2 - 12), cy + h * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = k.outline;
  rr(ctx, cx - w / 2 - 3, cy - h / 2 - 3, w + 6, h + 6, h * 0.34);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = vgrad(ctx, cy - h / 2, cy + h / 2, k.top, k.bot);
  rr(ctx, cx - w / 2, cy - h / 2, w, h, h * 0.3);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, cy - h / 2, cy, 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.05)');
  rr(ctx, cx - w / 2 + 4, cy - h / 2 + 3, w - 8, h * 0.4, h * 0.25);
  ctx.fill();
  ctx.restore();
  strokedText(ctx, label, cx, cy + 1, h * 0.5, '#ffffff', k.outline);
}

/** Tia sáng xoay quanh điểm (cx, cy), mờ dần ra ngoài: hậu cảnh cho hình minh hoạ ở popup thắng. */
export function sunburst(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, t: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.35);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  g.addColorStop(0, 'rgba(255,240,170,0.85)');
  g.addColorStop(1, 'rgba(255,240,170,0)');
  ctx.fillStyle = g;
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, a0, a0 + (Math.PI * 2) / n / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Thanh trên: dải tím, mép dưới sáng. */
export function topBar(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = vgrad(ctx, 0, h, '#5995f6', '#2b67bd');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(0, 0, w, h * 0.35);
  ctx.fillStyle = '#a6c6ff';
  ctx.fillRect(0, h - 6, w, 4);
  ctx.fillStyle = '#0c2c5c';
  ctx.fillRect(0, h - 2, w, 2);
}

/** Thanh dưới: dải tím đậm, mép trên sáng. */
export function bottomBar(ctx: CanvasRenderingContext2D, w: number, h: number, barH: number, dim = 0): void {
  const y = h - barH;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = -4;
  ctx.fillStyle = vgrad(ctx, y, h, th('#2f6ac0'), th('#12376f'));
  ctx.fillRect(0, y, w, barH);
  ctx.restore();
  ctx.fillStyle = th('#a6c6ff');
  ctx.fillRect(0, y, w, 4);
  ctx.fillStyle = th('#0c2c5c');
  ctx.fillRect(0, y - 2, w, 2);
  if (dim > 0) {
    ctx.fillStyle = `rgba(2,6,26,${dim})`;
    ctx.fillRect(0, y - 2, w, barH + 2);
  }
}

/**
 * Panel thống kê lồng nhau: khung tím ngoài, nhãn trắng viền tím, ô giá trị tím nhạt phía trong. `danger` đổi số sang đỏ (sắp hết lượt);
 * `pop` phóng con số khi giá trị đổi.
 */
export function statPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  danger = false,
  pop = 1,
): void {
  const r = 22;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.42)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#0c2c5c';
  rr(ctx, x - 2, y - 2, w + 4, h + 4, r + 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = vgrad(ctx, y, y + h, '#6ca2f8', '#2258a6');
  rr(ctx, x, y, w, h, r);
  ctx.fill();
  const rim = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
  rim.addColorStop(0, 'rgba(255,255,255,0.7)');
  rim.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2;
  rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, r - 1.5);
  ctx.stroke();
  const strip = h * 0.32;
  strokedText(ctx, label, x + w / 2, y + 4 + strip / 2, strip * 0.78, '#ffffff', '#1f4b96', 'center', 0.6);
  const wx = x + 8;
  const wy = y + 4 + strip;
  const ww = w - 16;
  const wh = h - strip - 4 - 8;
  ctx.fillStyle = '#1a4585';
  rr(ctx, wx - 1.5, wy - 1.5, ww + 3, wh + 3, r - 8);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, wy, wy + wh, '#f0f3ff', '#c2d5ff');
  rr(ctx, wx, wy, ww, wh, r - 9);
  ctx.fill();
  ctx.save();
  ctx.translate(x + w / 2, wy + wh / 2 + 2);
  ctx.scale(pop, pop);
  strokedText(ctx, value, 0, 0, wh * 0.74, danger ? '#ff4d5d' : '#ffffff', danger ? '#7a0f1c' : '#23448f', 'center', 0.6);
  ctx.restore();
}

/** Thẻ popup squircle: khối đùn cứng màu indigo, viền tím đậm, vòng sáng bên trong, dải tối ở đáy và bóng mềm phía dưới. */
export function royalPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 50): void {
  hardBox(ctx, x, y, w, h, r, { top: '#5c97f0', bot: '#306cc0', border: '#204f8f', bw: 5, base: '#163c70', depth: 14, blur: 26, band: 12, ring: '#78b4ff', glossH: 0.07 });
}

/** Panel tím nhạt lồng bên trong thẻ (chỗ đặt biểu tượng, hình minh hoạ): viền tím, gờ đùn thấp, vệt sáng mép trên. */
export function insetCell(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 30): void {
  hardBox(ctx, x, y, w, h - 5, r, { top: '#92c0ff', bot: '#76aef5', border: '#3068b8', bw: 4, base: '#265799', depth: 5, gloss: false });
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x + r * 0.7, y + 4, w - r * 1.4, 3);
}

/**
 * Tiêu đề popup: tấm bo tròn tím (viền tím đậm, gờ đùn) vắt ngang mép trên thẻ, chữ trắng viền tím dày. Rộng vừa chữ (tối đa `w`),
 * chữ tự thu nhỏ nếu quá dài. Tâm tấm ở (cx, cy).
 */
export function royalRibbon(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, label: string): void {
  const base = h * 0.66;
  ctx.save();
  ctx.font = font(base);
  const tw = ctx.measureText(label).width;
  ctx.restore();
  const size = Math.min(base, (base * (w - 44)) / Math.max(1, tw));
  const pw = Math.min(w, tw * (size / base) + 44);
  hardBox(ctx, cx - pw / 2, cy - h / 2, pw, h - 6, h * 0.36, { top: '#6da4ff', bot: '#4688f0', border: '#204f8f', bw: 4, base: '#163c70', depth: 6, blur: 8, gloss: false });
  strokedText(ctx, label, cx, cy - 2, size, '#ffffff', '#2c67c0');
}

/** Nút đóng (X): nút tròn đỏ viền trắng, vòng đỏ sẫm và gờ đùn; phần ruột và dấu X co vào khi bấm. */
export function closeButton(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, press = 0): void {
  const circle = (y: number, rad: number): void => {
    ctx.beginPath();
    ctx.arc(cx, y, rad, 0, Math.PI * 2);
  };
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#6a0c0c';
  circle(cy + r * 0.18, r + 3);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#8a1010';
  circle(cy, r + 3);
  ctx.fill();
  const s = pressScale(press);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = '#ffffff';
  circle(cy, r);
  ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * 0.82);
  g.addColorStop(0, '#ff7a7a');
  g.addColorStop(0.6, '#e02828');
  g.addColorStop(1, '#a81414');
  ctx.fillStyle = g;
  circle(cy, r * 0.82);
  ctx.fill();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  const u = r * 0.32;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = r * 0.3;
  ctx.beginPath();
  ctx.moveTo(-u, -u);
  ctx.lineTo(u, u);
  ctx.moveTo(u, -u);
  ctx.lineTo(-u, u);
  ctx.stroke();
  ctx.restore();
}

/** Các tia lấp lánh bốn cánh nhấp nháy quanh (cx, cy), cách tâm chừng `radius`: hậu cảnh cho hình minh hoạ ở popup. */
export function sparkles(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, t: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 11; i++) {
    const a = i * 2.399963 + 0.5; // góc vàng để rải đều
    const rad = radius * (0.55 + 0.45 * ((i * 37) % 11) / 10);
    const ph = (t * (0.9 + (i % 3) * 0.35) + i * 0.37) % 1;
    const tw = Math.sin(Math.PI * ph);
    const sz = (4 + ((i * 5) % 7)) * (0.35 + 0.65 * tw);
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad * 0.8;
    ctx.globalAlpha = 0.25 + 0.75 * tw;
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4 + Math.PI / 4;
      const rr2 = k % 2 === 0 ? sz : sz * 0.28;
      ctx.lineTo(x + Math.cos(ang) * rr2, y + Math.sin(ang) * rr2);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
