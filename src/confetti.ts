// Pháo giấy: các mảnh giấy màu bắn chéo lên từ hai bên màn hình, xoay lật rồi rơi xuống theo trọng lực.

type Ctx = CanvasRenderingContext2D;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  flip: number;
  vflip: number;
  w: number;
  h: number;
  color: string;
  born: number;
  life: number;
}

const COLORS = ['#ff4d7a', '#1fc0e6', '#ffd93b', '#7af050', '#a07bff', '#ff9a3d', '#ffffff'];
const GRAVITY = 1100; // px/s²
const DRAG = 1.5; // 1/s

export class Confetti {
  private pieces: Piece[] = [];
  private last = 0;

  clear(): void {
    this.pieces = [];
    this.last = 0;
  }

  get active(): boolean {
    return this.pieces.length > 0;
  }

  /** Bắn một loạt `count` mảnh từ mép màn hình phía `side` (-1 trái, 1 phải), lên chéo vào trong. */
  burst(side: -1 | 1, w: number, h: number, now: number, count: number, rand: () => number = Math.random): void {
    // phát ra từ hai góc dưới của màn hình (còn trong màn hình để thấy rõ chỗ bắn), bắn chéo lên và vào trong
    const x0 = side < 0 ? 14 : w - 14;
    const y0 = h - 14;
    for (let i = 0; i < count; i++) {
      // góc bắn: 52°–82° so với phương ngang (chéo lên, chếch vào giữa); tốc độ rải rộng: mảnh mạnh bay qua cả màn, mảnh yếu rơi gần góc
      const ang = ((52 + 30 * rand()) * Math.PI) / 180;
      const sp = 800 + 1300 * rand();
      const size = 11 + 9 * rand();
      this.pieces.push({
        x: x0,
        y: y0 + (rand() - 0.5) * 16,
        vx: -side * Math.cos(ang) * sp,
        vy: -Math.sin(ang) * sp,
        rot: rand() * Math.PI * 2,
        vr: (rand() - 0.5) * 16,
        flip: rand() * Math.PI * 2,
        vflip: 6 + 8 * rand(),
        w: size,
        h: size * (0.5 + 0.35 * rand()),
        color: COLORS[Math.floor(rand() * COLORS.length)],
        born: now,
        life: 2300 + 900 * rand(),
      });
    }
  }

  /** Cập nhật và vẽ. Trả về còn mảnh nào đang bay không. */
  draw(ctx: Ctx, now: number, h: number): boolean {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    this.pieces = this.pieces.filter((p) => now - p.born < p.life && p.y < h + 40);
    for (const p of this.pieces) {
      p.vx *= Math.exp(-DRAG * dt);
      p.vy = p.vy * Math.exp(-DRAG * 0.5 * dt) + GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.flip += p.vflip * dt;
      const age = (now - p.born) / p.life;
      ctx.save();
      ctx.globalAlpha = age > 0.8 ? (1 - age) / 0.2 : 1;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.flip)); // lật như tờ giấy
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    return this.pieces.length > 0;
  }
}
