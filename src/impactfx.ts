// Hiệu ứng va chạm khi logo đập xuống: một vòng sóng xung kích nở ra từ tâm logo và các tia sáng hình sao bắn ra quanh mép logo.

type Ctx = CanvasRenderingContext2D;

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  born: number;
  life: number;
}

const COLORS = ['#ffffff', '#ffe27a', '#ffd93b', '#ff9db4', '#9af0ff'];
const RING_MS = 320;
const SPARK_COUNT = 20;

export class ImpactFx {
  private ring: { cx: number; cy: number; r0: number; r1: number; t0: number } | null = null;
  private sparks: Spark[] = [];
  private last = 0;

  clear(): void {
    this.ring = null;
    this.sparks = [];
    this.last = 0;
  }

  get active(): boolean {
    return !!this.ring || this.sparks.length > 0;
  }

  /** Kích hoạt tại tâm (cx, cy) của logo rộng `width`, cao khoảng `height`. */
  trigger(cx: number, cy: number, width: number, height: number, now: number, rand: () => number = Math.random): void {
    this.ring = { cx, cy, r0: width * 0.22, r1: width * 0.64, t0: now };
    for (let i = 0; i < SPARK_COUNT; i++) {
      const a = ((i + rand() * 0.8) / SPARK_COUNT) * Math.PI * 2;
      // xuất phát từ mép elip bao quanh logo, bay ra ngoài
      const sx = cx + Math.cos(a) * width * 0.46;
      const sy = cy + Math.sin(a) * height * 0.46;
      const sp = 240 + 260 * rand();
      this.sparks.push({
        x: sx,
        y: sy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        size: 8 + 8 * rand(),
        rot: rand() * Math.PI,
        vr: (rand() - 0.5) * 6,
        color: COLORS[Math.floor(rand() * COLORS.length)],
        born: now,
        life: 420 + 240 * rand(),
      });
    }
  }

  draw(ctx: Ctx, now: number): void {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.ring) {
      const u = (now - this.ring.t0) / RING_MS;
      if (u >= 1) this.ring = null;
      else {
        const e = 1 - Math.pow(1 - u, 3);
        const r = this.ring.r0 + (this.ring.r1 - this.ring.r0) * e;
        ctx.save();
        ctx.globalAlpha = 0.9 * (1 - u);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#ffd93b';
        ctx.lineWidth = 18 * (1 - u) + 4;
        ctx.beginPath();
        ctx.ellipse(this.ring.cx, this.ring.cy, r, r * 0.72, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 8 * (1 - u) + 2;
        ctx.stroke();
        ctx.restore();
      }
    }
    this.sparks = this.sparks.filter((s) => now - s.born < s.life);
    for (const s of this.sparks) {
      const age = (now - s.born) / s.life;
      s.vx *= Math.exp(-3 * dt);
      s.vy *= Math.exp(-3 * dt);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
      const k = s.size * (1 - age * age); // nhỏ dần về cuối đời
      ctx.save();
      ctx.globalAlpha = 1 - age * age;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = s.color;
      // sao 4 cánh
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rad = i % 2 === 0 ? k : k * 0.28;
        const ang = (i * Math.PI) / 4;
        ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}
