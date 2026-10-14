// Vật liệu 3D cho game len, tạo hoàn toàn bằng thủ tục (không cần tệp ảnh): vân quấn sợi len, mũi đan chữ V,
// lớp xơ len, đan giỏ, nỉ. Mỗi chất liệu là một cặp bản đồ màu (map) và bản đồ pháp tuyến (normal map) sinh từ
// bản đồ độ cao, nên ánh sáng bắt vào từng sợi như vật thật.

import {
  CanvasTexture,
  Color,
  LinearMipmapLinearFilter,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  type Texture,
} from 'three';

/** PRNG mulberry32 để họa tiết giống hệt nhau mỗi lần chạy. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(n: number): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  return { cv, ctx: cv.getContext('2d', { willReadFrequently: true })! };
}

/** Bản đồ pháp tuyến từ bản đồ độ cao `h` (n x n, giá trị 0..1, lặp liền mạch). */
function normalFromHeight(h: Float32Array, n: number, strength: number): HTMLCanvasElement {
  const { cv, ctx } = makeCanvas(n);
  const img = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const l = h[y * n + ((x - 1 + n) % n)];
      const r = h[y * n + ((x + 1) % n)];
      const u = h[((y - 1 + n) % n) * n + x];
      const d = h[((y + 1) % n) * n + x];
      const dx = (r - l) * strength;
      const dy = (d - u) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * n + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Bản đồ màu xám từ độ cao: chỗ lõm (kẽ giữa các sợi) tối hơn, tạo bóng che sáng giả. */
function albedoFromHeight(h: Float32Array, n: number, lo = 0.5, hi = 1): HTMLCanvasElement {
  const { cv, ctx } = makeCanvas(n);
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const v = Math.round((lo + (hi - lo) * Math.pow(h[i], 1.2)) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function tex(cv: HTMLCanvasElement, color: boolean, repeat = 1): CanvasTexture {
  const t = new CanvasTexture(cv);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = 4;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

export interface SurfaceMaps {
  map: Texture;
  normal: Texture;
}

const cache = new Map<string, SurfaceMaps>();
function once(key: string, make: () => SurfaceMaps): SurfaceMaps {
  let v = cache.get(key);
  if (!v) cache.set(key, (v = make()));
  return v;
}

/**
 * Sợi len quấn chéo quanh khối: các sợi tròn song song theo đường chéo 45°, mỗi sợi xoắn từ hai tao nhỏ,
 * có lông tơ li ti. Lặp liền mạch 256px, 8 sợi mỗi ô lặp.
 */
export function yarnWrapMaps(): SurfaceMaps {
  return once('wrap', () => {
    const n = 256;
    const strands = 4;
    const pitch = n / strands;
    const twist = 6; // số vòng xoắn dọc theo sợi trên một ô lặp
    const rand = rng(11);
    const strandTone = Array.from({ length: strands }, () => 0.9 + rand() * 0.14);
    const h = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const t = (x + y) % n;
        const c = ((t % pitch) / pitch) * 2 - 1; // -1..1 ngang sợi
        let prof = Math.sqrt(Math.max(0, 1 - c * c)) * strandTone[Math.floor(t / pitch)]; // mỗi sợi sáng tối hơi khác nhau
        const along = ((x - y + n) % n) / n;
        const ply = 0.5 + 0.5 * Math.sin(2 * Math.PI * (twist * along + 0.9 * c)); // hai tao xoắn
        prof *= 0.78 + 0.22 * ply;
        prof += (rand() - 0.5) * 0.05; // lông tơ
        h[y * n + x] = Math.min(1, Math.max(0, prof));
      }
    }
    return { map: tex(albedoFromHeight(h, n, 0.5, 1), true), normal: tex(normalFromHeight(h, n, 9), false) } as SurfaceMaps;
  });
}

/** Lớp xơ len: các nét mảnh ngẫu nhiên, dùng làm alphaMap cho các lớp vỏ bao quanh khối. */
export function fuzzAlphaMap(): Texture {
  return once('fuzz', () => {
    const n = 256;
    const { cv, ctx } = makeCanvas(n);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, n, n);
    const rand = rng(23);
    ctx.lineCap = 'round';
    for (let i = 0; i < 1400; i++) {
      const x = rand() * n;
      const y = rand() * n;
      const a = rand() * Math.PI * 2;
      const len = 4 + rand() * 9;
      const g = Math.floor(120 + rand() * 135);
      ctx.strokeStyle = `rgb(${g},${g},${g})`;
      ctx.lineWidth = 0.7 + rand() * 0.9;
      for (const ox of [-n, 0, n]) {
        for (const oy of [-n, 0, n]) {
          ctx.beginPath();
          ctx.moveTo(x + ox, y + oy);
          ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
          ctx.stroke();
        }
      }
    }
    return { map: tex(cv, false), normal: tex(cv, false) };
  }).map;
}

/**
 * Len đan bện (cable knit): bốn cột, mỗi cột là hai sợi bện chéo nhau, sợi nào nổi lên trên thay phiên theo nhịp,
 * giữa các cột là rãnh có gờ đan nhỏ. `loose` = vệt sắp tuột: một số đoạn bện bị rơi mũi, chỉ còn rãnh trống
 * như bậc thang (dropped stitch). Lặp liền mạch 256px.
 */
export function cableMaps(loose: boolean): SurfaceMaps {
  return once(loose ? 'cable-loose' : 'cable-tight', () => {
    const n = 256;
    const cols = 4;
    const cw = n / cols; // bề rộng một cột
    const period = 128; // một nhịp bện theo chiều dọc: hai lần chéo nhau
    const amp = 13;
    const half = loose ? 6.5 : 8.2; // nửa bề rộng mỗi sợi
    const rand = rng(loose ? 17 : 13);
    // mỗi đoạn nửa nhịp của mỗi cột có bị rơi mũi hay không (chỉ ở bản lỏng)
    const dropped = Array.from({ length: cols * 4 }, () => loose && rand() < 0.38);
    const h = new Float32Array(n * n);
    const profile = (d: number): number => Math.sqrt(Math.max(0, 1 - (d / half) * (d / half)));
    for (let y = 0; y < n; y++) {
      const ph = (2 * Math.PI * y) / period;
      const s = Math.sin(ph);
      const over = Math.cos(ph) > 0; // sợi 1 nổi trên khi cos > 0
      const seg = Math.floor((y % n) / (period / 2)); // 0..1 trong nhịp, nhân với số cột bên dưới
      for (let x = 0; x < n; x++) {
        const c = Math.floor(x / cw);
        const cx = c * cw + cw / 2;
        let v = 0.2 + 0.07 * Math.sin((2 * Math.PI * y) / 16 + c); // rãnh giữa các cột có gờ đan nhỏ
        if (!dropped[c * 4 + (seg % 4)]) {
          const d1 = Math.abs(x - (cx + amp * s));
          const d2 = Math.abs(x - (cx - amp * s));
          const twist = 0.88 + 0.12 * Math.sin((2 * Math.PI * y) / 14 + x * 0.35); // thớ xoắn trên mỗi sợi
          const h1 = profile(d1) * twist * (over ? 1 : 0.8);
          const h2 = profile(d2) * twist * (over ? 0.8 : 1);
          v = Math.max(v, 0.28 + 0.72 * Math.max(h1, h2));
        }
        h[y * n + x] = v;
      }
    }
    return { map: tex(albedoFromHeight(h, n, 0.62, 1), true), normal: tex(normalFromHeight(h, n, 6), false) };
  });
}

/** Nỉ: các sợi nỉ li ti, không có hướng. */
export function feltMaps(): SurfaceMaps {
  return once('felt', () => {
    const n = 128;
    const rand = rng(41);
    const h = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) h[i] = 0.5 + (rand() - 0.5) * 0.5;
    // làm mịn nhẹ để thành hạt nỉ thay vì nhiễu từng điểm
    const s = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let acc = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) acc += h[((y + dy + n) % n) * n + ((x + dx + n) % n)];
        s[y * n + x] = acc / 9;
      }
    }
    return { map: tex(albedoFromHeight(s, n, 0.8, 1), true), normal: tex(normalFromHeight(s, n, 9), false) };
  });
}

/** Chuyển màu hex sang màu sáng hơn (cho ánh vải sheen). */
function lighten(hex: string, amount: number): Color {
  const c = new Color(hex);
  return c.lerp(new Color('#ffffff'), amount);
}

/** Vật liệu len: màu nền, vân sợi nổi, ánh vải (sheen) ở các cạnh nhìn nghiêng, nhám hoàn toàn. */
export function woolMaterial(hex: string): MeshPhysicalMaterial {
  const m = yarnWrapMaps();
  return new MeshPhysicalMaterial({
    color: hex,
    map: m.map,
    normalMap: m.normal,
    normalScale: new Vector2(1.3, 1.3),
    roughness: 0.95,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: lighten(hex, 0.55),
  });
}

/** Một lớp vỏ xơ len bao quanh khối: nhiều lớp mỏng chồng nhau cho cảm giác lông tơ. */
export function fuzzShellMaterial(hex: string, layer: number): MeshLambertMaterial {
  const alpha = fuzzAlphaMap().clone();
  alpha.offset.set(layer * 0.37, layer * 0.23);
  alpha.repeat.set(3, 3);
  alpha.needsUpdate = true;
  return new MeshLambertMaterial({
    color: lighten(hex, 0.12),
    alphaMap: alpha,
    transparent: true,
    opacity: 0.85 - layer * 0.2,
    depthWrite: false,
  });
}

/** Len đan bện cho vệt, bán trong suốt. Màu được đặt theo khối lúc vẽ (xem scene3d). */
export function knitMaterial(loose: boolean): MeshPhysicalMaterial {
  const m = cableMaps(loose);
  return new MeshPhysicalMaterial({
    color: loose ? '#fdeec6' : '#fff6dc',
    map: m.map,
    normalMap: m.normal,
    normalScale: new Vector2(1.3, 1.3),
    roughness: 0.9,
    sheen: 0,
    transparent: true,
    depthWrite: false,
  });
}

/** Bản đồ pháp tuyến từ bản đồ độ cao hình chữ nhật (không lặp). */
function normalFromHeightRect(h: Float32Array, w: number, ht: number, strength: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = ht;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, ht);
  const at = (x: number, y: number): number => h[Math.min(ht - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < ht; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * Cánh cửa ra: khung viền nổi bao quanh, bên trong là ô panel lõm có gờ nổi ở giữa, giống cánh cửa sơn.
 * Tỉ lệ ảnh khớp tỉ lệ đoạn tường làm cửa (dài : dày = 0.96 : 0.43) để các đường viền không bị méo.
 */
export function doorMaps(): SurfaceMaps {
  return once('door', () => {
    const W = 256;
    const Ht = 116;
    const h = new Float32Array(W * Ht);
    const smooth = (a: number, b: number, x: number): number => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    for (let y = 0; y < Ht; y++) {
      for (let x = 0; x < W; x++) {
        // khoảng cách tới mép, tính theo đơn vị px (ảnh dài 256 ứng với 0.9 ô nên 1px ngang ≈ 1px dọc)
        const d = Math.min(x, W - 1 - x, y, Ht - 1 - y);
        const frame = smooth(11, 4, d); // khung viền nổi sát mép
        // gờ nổi giữa ô panel: hình chữ nhật thu nhỏ vào trong
        const mx = Math.min(x - 26, W - 1 - 26 - x);
        const my = Math.min(y - 22, Ht - 1 - 22 - y);
        const molding = smooth(-2, 3, Math.min(mx, my)); // 0 ngoài gờ, 1 trong gờ
        h[y * W + x] = 0.42 + 0.4 * frame + 0.16 * molding;
      }
    }
    const { cv: ac, ctx } = makeCanvas(W);
    ac.height = Ht;
    const img = ctx.createImageData(W, Ht);
    for (let i = 0; i < W * Ht; i++) {
      const v = Math.round((0.72 + 0.28 * Math.pow(h[i], 1.3)) * 255);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { map: tex(ac, true), normal: tex(normalFromHeightRect(h, W, Ht, 7), false) };
  });
}

/** Vật liệu cánh cửa ra: sơn bóng theo màu của khối cùng màu, có khung và panel nổi. */
export function doorMaterial(hex: string): MeshPhysicalMaterial {
  const m = doorMaps();
  return new MeshPhysicalMaterial({
    color: hex,
    map: m.map,
    normalMap: m.normal,
    normalScale: new Vector2(1.6, 1.6),
    roughness: 0.38,
    metalness: 0.02,
    clearcoat: 0.2, // ít bóng: mặt trên phẳng mà bóng nhiều thì phản chiếu ánh đèn làm màu cửa nhạt đi
    clearcoatRoughness: 0.3,
    specularIntensity: 0.45,
  });
}

/**
 * Cánh cửa cầu vồng cho giỏ vạn năng: cùng khung và panel với cửa thường nhưng sơn dải màu cầu vồng cố định chạy dọc cửa
 * (đỏ, cam, vàng, lục, lam, chàm, tím). Dùng làm lớp phủ mờ dần lên cửa thường. `opacity` do cảnh điều khiển.
 */
/** Lớp sơn cầu vồng của cổng: dùng vật liệu Standard (không clearcoat) vì chỉ là lớp mỏng nửa trong suốt phủ lên cửa, nhẹ hơn nhiều cho GPU. */
export function rainbowDoorMaterial(): MeshStandardMaterial {
  const m = doorMaps();
  const base = (m.map as CanvasTexture).image as HTMLCanvasElement;
  const cv = document.createElement('canvas');
  cv.width = base.width;
  cv.height = base.height;
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, cv.width, 0);
  // dải màu bão hoà, chuyển màu gắt (mỗi màu giữ phẳng rồi đổi nhanh) để các dải tách bạch, không nhoè vào nhau
  const bands = ['#ff1f3d', '#ff7a00', '#ffd400', '#18c02a', '#00b4e6', '#2a46ff', '#a41cff'];
  const edge = 0.35 / bands.length;
  bands.forEach((col, i) => {
    const a = i / bands.length;
    const b = (i + 1) / bands.length;
    g.addColorStop(Math.min(1, a + (i ? edge / 2 : 0)), col);
    g.addColorStop(Math.max(0, b - (i < bands.length - 1 ? edge / 2 : 0)), col);
  });
  c.fillStyle = g;
  c.fillRect(0, 0, cv.width, cv.height);
  c.globalCompositeOperation = 'multiply'; // khung và panel nổi của cửa đè lên dải màu
  c.drawImage(base, 0, 0);
  return new MeshStandardMaterial({
    color: '#ffffff',
    map: tex(cv, true),
    normalMap: m.normal,
    normalScale: new Vector2(1.6, 1.6),
    roughness: 0.3,
    metalness: 0.02,
    emissive: '#ffffff',
    emissiveIntensity: 0.03,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
}

/** Nỉ nâu cho ô tường. */
export function feltMaterial(hex: string): MeshPhysicalMaterial {
  const m = feltMaps();
  return new MeshPhysicalMaterial({
    color: hex,
    map: m.map,
    normalMap: m.normal,
    normalScale: new Vector2(0.8, 0.8),
    roughness: 1,
    sheen: 0.6,
    sheenRoughness: 0.7,
    sheenColor: lighten(hex, 0.4),
  });
}

/** Tam giác chỉ hướng thoát hoặc dấu tích, vẽ trắng viền tối trên nền trong suốt. */
export function symbolTexture(kind: 'check' | 'triangle'): CanvasTexture {
  const n = 128;
  const { cv, ctx } = makeCanvas(n);
  ctx.translate(n / 2, n / 2);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const path = (): void => {
    ctx.beginPath();
    switch (kind) {
      case 'triangle':
        ctx.moveTo(0, -38);
        ctx.lineTo(37, 30);
        ctx.lineTo(-37, 30);
        ctx.closePath();
        break;
      case 'check':
        ctx.moveTo(-34, 2);
        ctx.lineTo(-10, 28);
        ctx.lineTo(36, -26);
        break;
    }
  };
  path();
  if (kind === 'check') {
    ctx.strokeStyle = 'rgba(40,20,50,0.55)';
    ctx.lineWidth = 26;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 16;
    ctx.stroke();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(40,20,50,0.45)';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fill();
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Mặt trên ô tường: đường chỉ khâu đứt nét sáng màu quanh viền. */
export function stitchBorderTexture(): CanvasTexture {
  const n = 128;
  const { cv, ctx } = makeCanvas(n);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 3.5;
  ctx.setLineDash([9, 7]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.roundRect(11, 11, n - 22, n - 22, 14);
  ctx.stroke();
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Sợi len xoắn: hai tao xoắn vào nhau thành những đường chéo quanh sợi. Dùng cho các ống sợi thật (TubeGeometry):
 * u chạy dọc sợi, v chạy quanh sợi, nên các vạch chéo này thành đường xoắn ốc.
 */
export function plyMaps(): SurfaceMaps {
  return once('ply', () => {
    const n = 128;
    const h = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const s = 0.5 + 0.5 * Math.sin(2 * Math.PI * (x / n + (2 * y) / n));
        h[y * n + x] = Math.pow(s, 0.8);
      }
    }
    return { map: tex(albedoFromHeight(h, n, 0.8, 1), true), normal: tex(normalFromHeight(h, n, 2.2), false) };
  });
}

/** Vật liệu sợi len thật cho các ống sợi đan nên khối và vệt. */
export function yarnMaterial(hex: string): MeshPhysicalMaterial {
  const m = plyMaps();
  return new MeshPhysicalMaterial({
    color: hex,
    map: m.map,
    normalMap: m.normal,
    normalScale: new Vector2(0.8, 0.8),
    roughness: 0.92,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: lighten(hex, 0.5),
  });
}
