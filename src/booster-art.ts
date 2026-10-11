// Hình vẽ 2D của booster: biểu tượng (Ghim, Bom bông, Nam châm, Giỏ vạn năng) và nút tròn ở thanh dưới.
// Mọi biểu tượng là khối có sáng tối cùng kiểu mascot, vẽ trong khung ~54x54 quanh tâm.

import type { BoosterKey } from './boosters';
import blockUrl from './assets/icons/block.png';
import bombUrl from './assets/icons/bomb.png';
import gateUrl from './assets/icons/gate.png';
import magnetUrl from './assets/icons/magnet.png';
import { boosterIconSnapshot } from './scene3d';

/** Icon do designer cung cấp (PNG nền trong suốt, nhúng vào file build qua Vite). Chưa tải xong thì dùng bản 3D dựng bằng mã. */
const ART: Record<BoosterKey, HTMLImageElement> = {
  pin: new Image(),
  bomb: new Image(),
  magnet: new Image(),
  basket: new Image(),
};
ART.pin.src = blockUrl;
ART.bomb.src = bombUrl;
ART.magnet.src = magnetUrl;
ART.basket.src = gateUrl;
for (const im of Object.values(ART)) im.decode().catch(() => undefined);
import { drawLockedSlot } from './render';
import { roundButton, strokedText } from './ui-kit';

const TAU = Math.PI * 2;

function ball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, mid: string, dark: string): void {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, light);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
}

// ---------- Biểu tượng booster (vẽ trong ô 54x54, gốc ở tâm) ----------
// Phong cách chung: viền tối dày bo tròn, tô gradient sáng trên đậm dưới, vệt sáng bóng ở góc trên trái, bóng đổ mềm dưới chân.

type Ctx2 = CanvasRenderingContext2D;

/** Tô một đường (đã dựng sẵn bằng `path`) với gradient dọc, viền tối dày và chừa lề trong để viền không ăn vào hình. */
function shape(ctx: Ctx2, path: () => void, top: string, bot: string, edge: string, lw = 3.2, y0 = -24, y1 = 24): void {
  path();
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = edge;
  ctx.stroke();
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  path();
  ctx.fill();
}

function gloss(ctx: Ctx2, x: number, y: number, rx: number, ry: number, rot = -0.5, a = 0.8): void {
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fill();
}

function groundShadow(ctx: Ctx2, w: number): void {
  ctx.fillStyle = 'rgba(8,24,70,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 23, w, 3.6, 0, 0, TAU);
  ctx.fill();
}

function rrect(ctx: Ctx2, x: number, y: number, w: number, h: number, r: number): () => void {
  return () => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };
}

function drawBlockIcon(ctx: Ctx2): void {
  groundShadow(ctx, 18);
  // khối hộp 3D: mặt trước, mặt phải và nắp
  const front = (): void => {
    ctx.beginPath();
    ctx.roundRect(-18, -4, 28, 26, 3);
  };
  const right = (): void => {
    ctx.beginPath();
    ctx.moveTo(10, -4);
    ctx.lineTo(18, -10);
    ctx.lineTo(18, 14);
    ctx.lineTo(10, 22);
    ctx.closePath();
  };
  const top = (): void => {
    ctx.beginPath();
    ctx.moveTo(-18, -4);
    ctx.lineTo(-10, -10);
    ctx.lineTo(18, -10);
    ctx.lineTo(10, -4);
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  shape(ctx, right, '#8b95a3', '#5b6573', '#2d3542', 2.4);
  shape(ctx, front, '#c4ccd8', '#8590a0', '#2d3542', 2.4, -4, 22);
  shape(ctx, top, '#f2f5f9', '#cfd6e0', '#2d3542', 2.4, -10, -4);
  // tấm nổi và đinh tán trên mặt trước
  ctx.fillStyle = '#7d8795';
  ctx.beginPath();
  ctx.roundRect(-13, 1, 18, 16, 2);
  ctx.fill();
  const plate = ctx.createLinearGradient(0, 2, 0, 15);
  plate.addColorStop(0, '#e1e6ee');
  plate.addColorStop(1, '#aeb7c4');
  ctx.fillStyle = plate;
  ctx.beginPath();
  ctx.roundRect(-11.5, 2.5, 15, 13, 1.5);
  ctx.fill();
  ctx.fillStyle = '#5d6674';
  for (const [bx, by] of [[-9, 5], [1.5, 5], [-9, 13], [1.5, 13]] as const) {
    ctx.beginPath();
    ctx.arc(bx, by, 1.2, 0, TAU);
    ctx.fill();
  }
  gloss(ctx, -4, -7, 7, 1.6, -0.15, 0.7);
}

function drawBombIcon(ctx: Ctx2): void {
  groundShadow(ctx, 17);
  // ngòi và tia lửa phía sau
  ctx.strokeStyle = '#3a2412';
  ctx.lineWidth = 6.6;
  ctx.beginPath();
  ctx.moveTo(3, -10);
  ctx.quadraticCurveTo(7, -17, 5, -21);
  ctx.stroke();
  ctx.strokeStyle = '#a8703a';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(3, -10);
  ctx.quadraticCurveTo(7, -17, 5, -21);
  ctx.stroke();
  // thân thạch hồng
  const body = (): void => {
    ctx.beginPath();
    ctx.roundRect(-17, -11, 34, 33, 14);
  };
  ctx.lineJoin = 'round';
  shape(ctx, body, '#ffb4d2', '#e8478a', '#7a1f4a', 2.6, -11, 22);
  // ruột sáng và bọt khí
  const core = ctx.createRadialGradient(-3, 5, 1, -1, 7, 13);
  core.addColorStop(0, 'rgba(255,225,238,0.9)');
  core.addColorStop(1, 'rgba(255,225,238,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(-1, 7, 13, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const [bx, by, br] of [[7, 12, 2.3], [11, 6, 1.5], [3, 16, 1.3]] as const) {
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, TAU);
    ctx.fill();
  }
  gloss(ctx, -8, -3, 6.5, 3, -0.6, 0.9);
  // tia lửa
  ctx.fillStyle = '#7a3a08';
  star(ctx, 5, -24, 9.2);
  ctx.fill();
  ctx.fillStyle = '#ffb21f';
  star(ctx, 5, -24, 7.6);
  ctx.fill();
  ctx.fillStyle = '#fff3a8';
  star(ctx, 5, -24, 3.8);
  ctx.fill();
}

function drawMagnetIcon(ctx: Ctx2): void {
  groundShadow(ctx, 17);
  const horseshoe = (): void => {
    ctx.beginPath();
    ctx.moveTo(-13, -14);
    ctx.lineTo(-13, 2);
    ctx.arc(0, 2, 13, Math.PI, 0, true);
    ctx.lineTo(13, -14);
  };
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  // viền tối, thân đỏ, rồi vệt sáng
  ctx.strokeStyle = '#4d0f22';
  ctx.lineWidth = 16.5;
  horseshoe();
  ctx.stroke();
  const g = ctx.createLinearGradient(-14, -14, 14, 18);
  g.addColorStop(0, '#ff8aa0');
  g.addColorStop(0.5, '#e8264f');
  g.addColorStop(1, '#a3123a');
  ctx.strokeStyle = g;
  ctx.lineWidth = 11.5;
  horseshoe();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-15.2, -6);
  ctx.lineTo(-15.2, 2);
  ctx.arc(0, 2, 15.2, Math.PI, Math.PI * 1.45);
  ctx.stroke();
  // hai đầu bạc có vạch
  for (const sx of [-13, 13]) {
    const tip = (): void => {
      ctx.beginPath();
      ctx.roundRect(sx - 6.6, -24, 13.2, 11, 2);
    };
    shape(ctx, tip, '#f4f8ff', '#a9b4c6', '#3b4558', 2, -24, -13);
    ctx.strokeStyle = '#7d889c';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx - 6, -19);
    ctx.lineTo(sx + 6, -19);
    ctx.stroke();
  }
  // tia từ trường
  ctx.strokeStyle = 'rgba(255,214,90,0.95)';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  for (const [x1, y1, x2, y2] of [[-4, -22, -1, -17], [0, -24, 0, -18], [4, -22, 1, -17]] as const) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

function drawJarIcon(ctx: Ctx2): void {
  groundShadow(ctx, 17);
  // thân thuỷ tinh
  const glass = (): void => {
    ctx.beginPath();
    ctx.roundRect(-15, -12, 30, 34, 10);
  };
  ctx.lineJoin = 'round';
  shape(ctx, glass, '#e8f8ff', '#a9d8f0', '#2b6b92', 2.4, -12, 22);
  // thạch cầu vồng bên trong
  const jelly = (): void => {
    ctx.beginPath();
    ctx.roundRect(-10.5, -2, 21, 20, 7);
  };
  const rb = ctx.createLinearGradient(-10, -2, 10, 18);
  rb.addColorStop(0, '#ff5c8a');
  rb.addColorStop(0.3, '#ffc93c');
  rb.addColorStop(0.6, '#3fd16a');
  rb.addColorStop(0.8, '#2fb9cc');
  rb.addColorStop(1, '#9b6bff');
  ctx.fillStyle = rb;
  jelly();
  ctx.fill();
  gloss(ctx, -4.5, 3, 4.2, 1.8, -0.5, 0.85);
  // vệt sáng thuỷ tinh
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.roundRect(-13, -8, 3.2, 24, 1.6);
  ctx.fill();
  // nắp vàng
  const lid = (): void => {
    ctx.beginPath();
    ctx.roundRect(-13, -19, 26, 9, 4);
  };
  shape(ctx, lid, '#ffe27a', '#e69a1f', '#7a4608', 2.2, -19, -10);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(-9.5, -17, 11, 2);
  // ngôi sao lấp lánh
  ctx.fillStyle = '#fff6c8';
  star(ctx, 13, -20, 5);
  ctx.fill();
}

const OUTLINE_PAD = 14; // px viền thêm mỗi phía trên ảnh 256
const OUTLINE_SCALE = (256 + 2 * OUTLINE_PAD) / 256;
const outlineCache = new Map<string, HTMLCanvasElement>();

/** Ảnh icon kèm viền kiểu sticker: viền trắng dày bên trong, viền xanh navy mỏng bên ngoài; dựng một lần rồi nhớ lại. */
function outlined(key: BoosterKey, art: HTMLImageElement): HTMLCanvasElement {
  const hit = outlineCache.get(key);
  if (hit) return hit;
  const n = 256 + 2 * OUTLINE_PAD;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const c = cv.getContext('2d')!;
  // bóng đơn sắc của ảnh: tô màu rồi lặp quanh theo vòng tròn để dày ra
  const sil = (color: string): HTMLCanvasElement => {
    const t = document.createElement('canvas');
    t.width = t.height = 256;
    const x = t.getContext('2d')!;
    x.drawImage(art, 0, 0, 256, 256);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, 256, 256);
    return t;
  };
  const ring = (img: HTMLCanvasElement, r: number): void => {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      c.drawImage(img, OUTLINE_PAD + Math.cos(a) * r, OUTLINE_PAD + Math.sin(a) * r);
    }
  };
  ring(sil('#1a3a86'), 12);
  ring(sil('#ffffff'), 8);
  // tăng độ bão hoà và tương phản cho phần ruột icon (trình duyệt không hỗ trợ ctx.filter thì giữ nguyên màu gốc)
  c.filter = 'saturate(1.55) contrast(1.22) brightness(0.96)';
  c.drawImage(art, OUTLINE_PAD, OUTLINE_PAD, 256, 256);
  c.filter = 'none';
  outlineCache.set(key, cv);
  return cv;
}

/** Biểu tượng booster, vừa trong ô 54x54 (bán kính `u`) quanh (cx, cy). */
export function drawBoosterIcon(ctx: CanvasRenderingContext2D, key: BoosterKey, cx: number, cy: number, u: number): void {
  const art = ART[key];
  const img = art.complete && art.naturalWidth > 0 ? outlined(key, art) : boosterIconSnapshot(key);
  if (img) {
    const side = u * 2.5 * (img instanceof HTMLCanvasElement && img.width > 256 ? OUTLINE_SCALE : 1);
    ctx.drawImage(img, cx - side / 2, cy - side / 2, side, side);
    return;
  }
  ctx.save();
  ctx.translate(cx, cy);
  const sc = u / 27;
  ctx.scale(sc, sc);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (key === 'pin') drawBlockIcon(ctx);
  else if (key === 'bomb') drawBombIcon(ctx);
  else if (key === 'magnet') drawMagnetIcon(ctx);
  else drawJarIcon(ctx);
  ctx.restore();
}

export interface BoosterSlotState {
  /** 0..1: mức đang khoá (1 = khoá hẳn); mở khoá thì chuyển dần chứ không đổi tức thì. */
  lock: number;
  unlock: number;
  count: number;
  /** 0..1: mức đang chờ chọn mục tiêu (chỉ thêm quầng sáng phía sau nút). */
  arm: number;
  /** Hệ số phóng của huy hiệu số lượng (nảy lên khi số đổi); 1 là bình thường. */
  pop: number;
  /** 0..1: mức đang bấm xuống (viền giữ nguyên, mặt nút và biểu tượng co vào). */
  press: number;
  /** Giây, cho nhịp phát sáng khi đang chờ chọn. */
  t: number;
}

/** Nút booster ở thanh dưới: nút tròn xanh có biểu tượng, số lượng; khoá thì hiện ổ khoá và "Lv N". Hai trạng thái mờ chuyển cho nhau. */
export function drawBoosterSlot(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, key: BoosterKey, st: BoosterSlotState): void {
  const baseAlpha = ctx.globalAlpha;
  if (st.lock > 0.001) {
    ctx.globalAlpha = baseAlpha * st.lock;
    drawLockedSlot(ctx, cx, cy, r, st.press);
    strokedText(ctx, `Lv ${st.unlock}`, cx, cy + r + 21, 14, '#ffffff', '#102a6c');
  }
  if (st.lock < 0.999) {
    ctx.globalAlpha = baseAlpha * (1 - st.lock);
    if (st.arm > 0.001) {
      const pulse = 0.5 + 0.5 * Math.sin(st.t * 7);
      const g = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.1);
      g.addColorStop(0, `rgba(255,236,120,${(0.55 + 0.3 * pulse) * st.arm})`);
      g.addColorStop(1, 'rgba(255,236,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.1, 0, TAU);
      ctx.fill();
    }
    // chờ chọn mục tiêu thì chỉ thêm quầng sáng phía sau: vẫn là đúng nút này (nút được đưa lên lớp nằm trên lớp tối, không đổi kiểu)
    const lift = 0;
    const ps = roundButton(ctx, cx, cy + lift, r, 'green', true, st.press);
    drawBoosterIcon(ctx, key, cx, cy + lift, r * 0.82 * ps); // đúng tâm nút, không đẩy xuống
    // số lượng, hoặc dấu + khi hết (bấm để xem quảng cáo nhận thêm); nảy lên khi số đổi
    const bx = cx + r * 0.78;
    const by = cy + lift - r * 0.78;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(st.pop, st.pop);
    ctx.translate(-bx, -by);
    ctx.fillStyle = '#6b3d0a';
    ctx.beginPath();
    ctx.arc(bx, by + 1, 12.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = st.count > 0 ? '#ff4d5d' : '#3fbf4a';
    ctx.beginPath();
    ctx.arc(bx, by, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(bx - 2, by - 4.5, 6, 3, 0, 0, TAU);
    ctx.fill();
    strokedText(ctx, st.count > 0 ? String(st.count) : '+', bx, by + 0.5, st.count > 0 ? 14 : 18, '#ffffff', st.count > 0 ? '#8a1020' : '#14661e');
    ctx.restore();
  }
  ctx.globalAlpha = baseAlpha;
}

/** Đồng xu vàng 2D: viền gờ, vòng lõm bên trong, ngôi sao nổi ở giữa, vệt sáng cong. Bán kính `r`, tâm (cx, cy). */
export function drawCoin(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  const circle = (y: number, rad: number): void => {
    ctx.beginPath();
    ctx.arc(0, y, rad, 0, TAU);
  };
  ctx.fillStyle = 'rgba(30,10,80,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, r * 1.02, r * 0.95, r * 0.18, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#a8590a';
  circle(r * 0.08, r);
  ctx.fill();
  const rim = ctx.createLinearGradient(0, -r, 0, r);
  rim.addColorStop(0, '#ffe98a');
  rim.addColorStop(1, '#f2a21a');
  ctx.fillStyle = rim;
  circle(0, r * 0.96);
  ctx.fill();
  ctx.fillStyle = '#d98410';
  circle(0, r * 0.74);
  ctx.fill();
  const face = ctx.createLinearGradient(0, -r * 0.7, 0, r * 0.7);
  face.addColorStop(0, '#ffd34a');
  face.addColorStop(1, '#ffb62a');
  ctx.fillStyle = face;
  circle(0, r * 0.7);
  ctx.fill();
  // ngôi sao nổi
  const star = (rad: number, dy: number): void => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const k = i % 2 === 0 ? rad : rad * 0.45;
      ctx.lineTo(Math.cos(a) * k, dy + Math.sin(a) * k);
    }
    ctx.closePath();
  };
  ctx.fillStyle = '#b8660c';
  star(r * 0.46, r * 0.04 + r * 0.04);
  ctx.fill();
  ctx.fillStyle = '#fff2a8';
  star(r * 0.42, r * 0.02);
  ctx.fill();
  // vệt sáng cong
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = r * 0.09;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.84, Math.PI * 1.08, Math.PI * 1.35);
  ctx.stroke();
  ctx.restore();
}
