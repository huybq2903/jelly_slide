// Màu và vài hình vẽ 2D cho game thạch (Jelly Slide).
// Chỉ có hàm vẽ; không giữ trạng thái game.

import type { Dir, Level } from './core/rules';
import { chunkyButton, quiltBackground, ribbon3d, roundButton, type ButtonKind } from './ui-kit';

export const COLOR_HEX: Record<string, string> = {
  pink: '#ff3b80',
  teal: '#12b9e0',
  gold: '#ffbf1f',
  violet: '#8657ff',
};

export const THEME = {
  panel: '#e59a1f',
  cellA: '#eef3ff',
  cellB: '#dce7ff',
  trail: '#fff2d2',
  trailEdge: '#e9cf94',
  stitch: '#d9aa55',
  ink: '#33406e',
  button: '#b87a4f',
};

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    return Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount);
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  quiltBackground(ctx, w, h);
}

export interface BallStyle {
  alpha?: number;
  scale?: number;
  /** Nhấc lên (đơn vị: ô) khi đang kéo. */
  lift?: number;
  ghost?: boolean;
}

/** Khối len: hộp chữ nhật bo góc, quấn len ở mặt trên, mặt trước đậm hơn, một đầu sợi thò ra. */
export function drawBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string, st: BallStyle = {}): void {
  const hex = COLOR_HEX[color] ?? '#888888';
  const scale = st.scale ?? 1;
  ctx.save();
  ctx.globalAlpha = (st.alpha ?? 1) * (st.ghost ? 0.45 : 1);
  ctx.translate(cx, cy - (st.lift ?? 0) * s);
  ctx.scale(scale, scale);
  // Khối phủ gần hết ô (chừa khe nhỏ giữa các ô).
  const bw = s * 0.94;
  const topH = s * 0.7;
  const frontH = s * 0.24;
  const x0 = -bw / 2;
  const y0 = -(topH + frontH) / 2;
  const r = s * 0.18;
  // mặt trước
  ctx.fillStyle = shade(hex, -0.3);
  rr(ctx, x0, y0 + topH - r, bw, frontH + r, r);
  ctx.fill();
  // mặt trên
  const g = ctx.createLinearGradient(0, y0, 0, y0 + topH);
  g.addColorStop(0, shade(hex, 0.3));
  g.addColorStop(1, hex);
  ctx.fillStyle = g;
  rr(ctx, x0, y0, bw, topH, r);
  ctx.fill();
  // sọc quấn len
  ctx.save();
  rr(ctx, x0, y0, bw, topH, r);
  ctx.clip();
  ctx.strokeStyle = shade(hex, -0.2);
  ctx.globalAlpha *= 0.55;
  ctx.lineWidth = s * 0.05;
  const step = s * 0.14;
  for (let x = x0 - topH; x < x0 + bw + topH; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, y0 + topH);
    ctx.lineTo(x + topH * 0.5, y0);
    ctx.stroke();
  }
  ctx.restore();
  // viền sáng trên cùng + sợi len thò ra
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = s * 0.035;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0 + s * 0.02);
  ctx.lineTo(x0 + bw - r, y0 + s * 0.02);
  ctx.stroke();
  ctx.strokeStyle = shade(hex, -0.15);
  ctx.lineWidth = s * 0.045;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0 + bw - r * 1.3, y0 + topH * 0.6);
  ctx.quadraticCurveTo(x0 + bw - s * 0.01, y0 + topH * 0.95, x0 + bw - s * 0.07, y0 + topH + frontH * 0.85);
  ctx.stroke();
  ctx.restore();
}

/** Biểu tượng trắng có bóng đổ dưới, vẽ lên nút tròn. */
function iconStyle(ctx: CanvasRenderingContext2D, lineWidth: number): void {
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 2;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** Nút chơi lại (trong menu cài đặt): nút tròn cam với mũi tên vòng. */
export function drawRestartIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, enabled: boolean, press = 0): void {
  ctx.save();
  ctx.globalAlpha *= enabled ? 1 : 0.5;
  const ps = roundButton(ctx, cx, cy, radius, 'orange', false, press);
  ctx.translate(cx, cy);
  ctx.scale(ps, ps);
  ctx.translate(-cx, -cy);
  iconStyle(ctx, radius * 0.17);
  const r = radius * 0.5;
  const start = -Math.PI * 0.35;
  const end = Math.PI * 1.55;
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, end);
  ctx.stroke();
  const ex = cx + Math.cos(end) * r;
  const ey = cy + Math.sin(end) * r;
  const tx = -Math.sin(end);
  const ty = Math.cos(end);
  const nx = Math.cos(end);
  const ny = Math.sin(end);
  const h = radius * 0.34;
  ctx.beginPath();
  ctx.moveTo(ex + tx * h, ey + ty * h);
  ctx.lineTo(ex + nx * h * 0.8, ey + ny * h * 0.8);
  ctx.lineTo(ex - nx * h * 0.8, ey - ny * h * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Nút chữ nhật 3D cho popup. 'primary' = xanh lá, 'secondary' = xanh dương. */
export function drawPillButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  kind: 'primary' | 'secondary',
  press = 0,
): void {
  chunkyButton(ctx, x, y, w, h, label, kind === 'primary' ? 'green' : 'blue', 0.42, press);
}

/** Ruy-băng tiêu đề vắt ngang mép trên popup. */
export function drawRibbon(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, kind: ButtonKind, label: string): void {
  ribbon3d(ctx, cx, cy, w, h, kind, label);
}

/** Nút cài đặt: bánh răng trắng trên nút tròn xanh dương. `angle` (radian) để xoay khi menu mở. */
export function drawGearIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, angle: number, enabled: boolean, press = 0): void {
  ctx.save();
  ctx.globalAlpha *= enabled ? 1 : 0.5;
  const ps = roundButton(ctx, cx, cy, radius, 'blue', true, press);
  ctx.translate(cx, cy);
  ctx.scale(ps, ps);
  ctx.rotate(angle);
  // bánh răng phẳng một khối trắng, không bóng đổ: 8 răng bo nhẹ, lỗ giữa cùng màu nút
  ctx.fillStyle = '#ffffff';
  const teeth = 8;
  const ro = radius * 0.62;
  const ri = radius * 0.46;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    for (const [f, rad] of [[-0.3, ri], [-0.17, ro], [0.17, ro], [0.3, ri]] as const) {
      const a = a0 + f * step;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = radius * 0.08;
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = '#3a7cf2';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Nút bật/tắt trong menu cài đặt: nhạc, âm thanh, rung. Bật = xanh lá; tắt = xám và có gạch chéo. */
export function drawToggleButton(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  kind: 'music' | 'sound' | 'haptic',
  on: boolean,
  press = 0,
): void {
  ctx.save();
  const ps = roundButton(ctx, cx, cy, radius, on ? 'green' : 'gray', false, press);
  ctx.translate(cx, cy);
  ctx.scale(ps, ps);
  const u = radius;
  iconStyle(ctx, u * 0.1);
  if (kind === 'music') {
    ctx.beginPath();
    ctx.ellipse(-u * 0.14, u * 0.24, u * 0.2, u * 0.15, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(u * 0.04, u * 0.2);
    ctx.lineTo(u * 0.04, -u * 0.3);
    ctx.quadraticCurveTo(u * 0.1, -u * 0.12, u * 0.32, -u * 0.08);
    ctx.stroke();
  } else if (kind === 'sound') {
    ctx.beginPath();
    ctx.moveTo(-u * 0.4, -u * 0.13);
    ctx.lineTo(-u * 0.22, -u * 0.13);
    ctx.lineTo(u * 0.02, -u * 0.34);
    ctx.lineTo(u * 0.02, u * 0.34);
    ctx.lineTo(-u * 0.22, u * 0.13);
    ctx.lineTo(-u * 0.4, u * 0.13);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(u * 0.02, 0, u * 0.28, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(u * 0.02, 0, u * 0.46, -0.8, 0.8);
    ctx.stroke();
  } else {
    rr(ctx, -u * 0.15, -u * 0.34, u * 0.3, u * 0.68, u * 0.07);
    ctx.stroke();
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * u * 0.32, -u * 0.16);
      ctx.lineTo(sx * u * 0.32, u * 0.16);
      ctx.moveTo(sx * u * 0.48, -u * 0.1);
      ctx.lineTo(sx * u * 0.48, u * 0.1);
      ctx.stroke();
    }
  }
  if (!on) {
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(60,40,80,0.6)';
    ctx.lineWidth = u * 0.22;
    ctx.beginPath();
    ctx.moveTo(-u * 0.42, -u * 0.42);
    ctx.lineTo(u * 0.42, u * 0.42);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = u * 0.1;
    ctx.beginPath();
    ctx.moveTo(-u * 0.42, -u * 0.42);
    ctx.lineTo(u * 0.42, u * 0.42);
    ctx.stroke();
  }
  ctx.restore();
}

/** Ô booster đang khoá ở thanh dưới: nút tròn xanh lá viền vàng với ổ khoá vàng. */
export function drawLockedSlot(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, press = 0): void {
  const ps = roundButton(ctx, cx, cy, radius, 'green', true, press);
  const u = radius;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(ps, ps);
  ctx.translate(-cx, -cy);
  ctx.lineCap = 'round';
  // quai khoá
  ctx.strokeStyle = '#6b3d0a';
  ctx.lineWidth = u * 0.26;
  ctx.beginPath();
  ctx.arc(cx, cy - u * 0.1, u * 0.27, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = u * 0.13;
  ctx.beginPath();
  ctx.arc(cx, cy - u * 0.1, u * 0.27, Math.PI, Math.PI * 2);
  ctx.stroke();
  // thân khoá
  ctx.fillStyle = '#6b3d0a';
  rr(ctx, cx - u * 0.42, cy - u * 0.12, u * 0.84, u * 0.66, u * 0.14);
  ctx.fill();
  const g = ctx.createLinearGradient(0, cy - u * 0.1, 0, cy + u * 0.52);
  g.addColorStop(0, '#ffe27a');
  g.addColorStop(1, '#e59a1f');
  ctx.fillStyle = g;
  rr(ctx, cx - u * 0.37, cy - u * 0.07, u * 0.74, u * 0.56, u * 0.11);
  ctx.fill();
  // lỗ khoá
  ctx.fillStyle = '#6b3d0a';
  ctx.beginPath();
  ctx.arc(cx, cy + u * 0.16, u * 0.1, 0, Math.PI * 2);
  ctx.fill();
  rr(ctx, cx - u * 0.04, cy + u * 0.18, u * 0.08, u * 0.18, u * 0.03);
  ctx.fill();
  ctx.restore();
}
