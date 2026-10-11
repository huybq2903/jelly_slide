// Cảnh 3D của bàn chơi bằng Three.js: khung bàn vàng, ô nền, khối len, vệt đan, cúc áo, giỏ len.
// Module này chỉ biết "mô tả cảnh" (khối/vệt/giỏ ở toạ độ ô) mà game.ts đưa vào mỗi khung hình; logic game ở src/core.
// Lớp giao diện 2D (thanh trên/dưới, popup, menu) vẫn là canvas riêng phủ lên trên.

import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  DoubleSide,
  PCFSoftShadowMap,
  PerspectiveCamera,
  AdditiveBlending,
  CanvasTexture,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  PlaneGeometry,
  RingGeometry,
  Scene,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Light,
  type Material,
  type Texture,
  type Object3D,
  Path,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { gateCell, gateKey, inBoard, type Dir, type Level } from './core/rules';
import { COLOR_HEX } from './render';
import { cellToWorld, fitView, pickBox, screenToCell, worldToScreen, type Rect, type View } from './view3d';
import { doorMaterial, rainbowDoorMaterial, symbolTexture } from './wool';

/** Chỗ giữ tương thích cho các trường điều khiển xổ sợi cũ: thạch không xổ sợi nên không dùng nữa. */
interface Unravel {
  uT: { value: number };
  uDir: { value: Vector3 };
  uDist: { value: number };
  uFly: { value: number };
  uSeq: { value: number };
  uOrd: { value: Vector3 };
  uFace: { value: number[] };
}
const noUnravel = (): Unravel => ({ uT: { value: 0 }, uDir: { value: new Vector3() }, uDist: { value: 0 }, uFly: { value: 0 }, uSeq: { value: 0 }, uOrd: { value: new Vector3() }, uFace: { value: [0, 0, 0, 0, 0] } });

/** Vật liệu thạch: bán trong suốt, bóng ướt (clearcoat), phát sáng nhẹ cùng màu để ruột thạch ánh lên. */
function jellyMaterial(hex: string, opacity = 0.8): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: 0.22,
    roughness: 0.14,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity,
    ior: 1.45,
    specularIntensity: 1,
  });
}

// ---------- Mô tả cảnh (game.ts tính mỗi khung hình, toạ độ tính bằng ô) ----------

export interface BallDesc {
  id: string;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  /** Nhấc lên khỏi mặt bàn (đơn vị ô), dùng khi đang kéo. */
  lift: number;
  /** Độ lệch theo cột và hàng (đơn vị ô): hiệu ứng rung, nhún trước khi phóng và dồn về phía vật cản khi bị ép. */
  ox: number;
  oy: number;
  /** Co giãn thêm theo ba trục thế giới (1 = nguyên trạng): ép khi va chạm, nhún khi chuẩn bị phóng. */
  sx: number;
  sy: number;
  sz: number;
  /** 0..1: khối mất kết cấu, tách thành các sợi bị hút về phía `pull` (hướng ô, vd cửa bên phải = {x:1,y:0}). */
  unravel: number;
  pull: { x: number; y: number };
  /** 0..1: mức che màu của thạch ẩn (1 = xám với dấu ?, 0 = lộ màu thật). Không khai báo = 0. */
  hide?: number;
  /** 0..1: mức đóng băng (1 = bọc trong băng; giảm về 0 thì băng vỡ tung thành mảnh). Không khai báo = 0. */
  ice?: number;
}

export interface TrailDesc {
  x: number;
  y: number;
  /** Màu của khối đã để lại vệt này (tên màu như trong level). */
  color: string;
  kind: 'tight' | 'loose';
  scale: number;
  alpha: number;
  seed: number;
  /** 0..1: xổ chỉ, vệt xoay nhẹ, nhấc lên và mờ dần. */
  dissolve: number;
  /** Vệt đang hết hạn: hướng (đơn vị, toạ độ ô) về phía khối đang giữ sợi; các mũi đan được gỡ dần từ phía xa rồi thu về phía đó. */
  toward?: { x: number; y: number };
  /** Ô đang hết hạn (kể cả lúc chưa tới lượt gỡ). */
  expiring?: boolean;
  /** Vệt đang bị kéo vào cửa (hướng tới cửa): khi co nhỏ gần cửa nó phun sợi len như khối. */
  suck?: { x: number; y: number };
  /** 0..1: vệt mới mọc ra, từng mũi đan hiện dần theo thứ tự ngẫu nhiên. */
  grow: number;
  /** 0..1: chuyển từ đan đặc sang đan lỏng (các mũi nhỏ co lại, các mũi to nở ra). */
  loosen: number;
}

export interface GateDesc {
  side: Dir;
  index: number;
  depth?: number;
  done: boolean;
  glow: boolean;
  /** Giỏ đang là giỏ vạn năng (booster Chọn giỏ): cửa phủ lớp sơn cầu vồng. */
  wild?: boolean;
  /** Mili-giây kể từ lúc cửa cắn khối (khối chui đủ sâu); undefined nếu chưa/đã hết. Điều khiển cú nảy "nhai" của cửa. */
  kick?: number;
  /** 0..1: cổng chớp sáng (luồng sáng của booster vừa bay tới), phình nhẹ và trắng lên rồi tắt. */
  flash?: number;
  /** 0..1: cửa đang hút một khối vào (gió hút, cửa rung và sáng lên). */
  suck: number;
}

/** Ghim đang cắm. `drop` 0..1 là tiến độ rơi xuống ô, `out` 0..1 là tiến độ biến mất khi hết hạn. */
export interface PinDesc {
  x: number;
  y: number;
  drop: number;
  out: number;
}

/** Điểm đánh dấu mục tiêu của booster đang chờ chọn: ô trống hoặc khối. */
export interface MarkDesc {
  x: number;
  y: number;
  kind: 'cell' | 'ball';
}

/** Bom bông đang rơi và nổ tại một ô; `t` là số giây từ lúc thả. */
export interface BombDesc {
  x: number;
  y: number;
  t: number;
}

/** Thời gian bom rơi tới lúc nổ (giây). */
export const BOMB_DROP_S = 0.38;
const BOMB_BLAST_S = 0.55;

/**
 * Chế độ tập trung (booster đang chờ chọn): cả cảnh được vẽ tối đi, riêng các đối tượng được liệt kê vẽ lại sáng đầy đủ ở lượt
 * vẽ thứ hai nằm trên cùng. `amount` 0..1 là mức chuyển cảnh (alpha), các danh sách là khoá "x,y" của ô, id khối, "cạnhchỉ-số" của giỏ.
 */
export interface FocusDesc {
  amount: number;
  cells: string[];
  balls: string[];
  gates: string[];
}

export interface SceneDesc {
  balls: BallDesc[];
  trails: TrailDesc[];
  gates: GateDesc[];
  /** Sợi chỉ nối khối với vệt của nó: đi từ khối qua các ô vệt, theo toạ độ ô. */
  pins: PinDesc[];
  marks: MarkDesc[];
  bomb: BombDesc | null;
  focus: FocusDesc | null;
  threads: { color: string; /** 0..1: tiến độ tuột của phần chỉ nằm trên các ô hết hạn. */ unravel: number; pts: { x: number; y: number; tight: boolean; dying?: boolean }[] }[];
  ghost: { x: number; y: number; color: string } | null;
  line: { from: { x: number; y: number }; to: { x: number; y: number }; /** Đường gấp khúc (khi có mũi tên/cổng dịch chuyển) và chỉ số các đoạn dịch chuyển (không vẽ chấm). */ path?: { x: number; y: number }[]; jumps?: number[] } | null;
}

// ---------- Hằng số kích thước (đơn vị: ô) ----------

const WHITE = new Color('#ffffff');
const TILE_TOP = 0.04; // mặt trên của ô nền; mọi thứ đặt lên đây
const BALL = { w: 0.96, h: 0.84 }; // khối gần đầy ô, khe giữa các khối rất mỏng
const WALL_H = 0.5; // tường cúc áo cao như một khối nỉ
const RING = 0.4; // bề dày viền khung (tính bằng ô); các cửa len được khảm ngay trong viền này
const RING_TOP = TILE_TOP + BALL.h; // viền khung cao ngang các khối; mặt trên viền là mặt trên của cửa


interface BallObj {
  hex: string;
  /** Khối băng bọc quanh thạch đóng băng (chỉ có ở thạch đóng băng) và mức băng ở khung trước (để bắt lúc băng vỡ). */
  ice?: Mesh;
  iceWas?: number;
  /** Dấu ? phủ lên mặt thạch ẩn (chỉ có ở thạch ẩn). */
  q?: Mesh;
  group: Group;
  body: MeshPhysicalMaterial;
  core: MeshStandardMaterial;
  mesh: Mesh;
  un: Unravel;
}

interface GateObj {
  group: Group;
  mat: MeshPhysicalMaterial;
  mark: Mesh;
  check: Mesh;
  baseColor: string;
  /** Vị trí tâm cửa và hướng từ cửa vào trong bàn (cho hiệu ứng gió). */
  pos: Vector3;
  inward: Vector3;
  /** Mức chuyển 0..1 của các trạng thái: đã nhận khối, đang sáng (xem trước), giỏ vạn năng. Chạy dần về đích. */
  doneAmt: number;
  glowAmt: number;
  wildAmt: number;
  inited: boolean;
  /** Lớp sơn cầu vồng phủ lên cửa khi là giỏ vạn năng (mờ dần theo wildAmt). */
  rainbow: Mesh;
}

interface TrailObj {
  group: Group;
  jelly: Mesh;
  mat: MeshPhysicalMaterial;
  /** Lõi sáng bên trong (chỉ có khi vệt còn mới, mờ đi khi chảy xẹp). */
  core: Mesh;
  coreMat: MeshStandardMaterial;
  /** Vũng thạch loang trên sàn dưới chân vệt, rộng dần khi vệt chảy và tan. */
  puddle: Mesh;
  puddleMat: MeshBasicMaterial;
  /** Bốn giọt thạch chảy ra ở góc chân vệt khi sắp hết hạn. */
  drips: Mesh[];
  dripMat: MeshPhysicalMaterial;
  /** Bọt khí bên trong thạch còn mới. */
  bubbles: Mesh[];
  bubbleMat: MeshBasicMaterial;
  /** Vệt sáng phản chiếu ở mặt trên. */
  shine: Mesh;
  shineMat: MeshBasicMaterial;
}

function disposeTree(o: Object3D): void {
  o.traverse((c) => {
    const m = c as Mesh;
    if (m.geometry && (m.geometry as BufferGeometry & { userData: { shared?: boolean } }).userData.shared !== true) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) mat.dispose();
  });
}


const GATE_LONG = 0.96; // bề rộng khối cửa dọc theo cạnh: đúng một ô

type LoopItem = { x: number; y: number; id?: number; end?: 0 | 1 };

/**
 * Các đa giác của viền khung (vòng ngoài w x h bo góc r, vòng trong wi x hi bo góc ri) sau khi cắt hở tại các khe cửa.
 * Mỗi khe rộng 2*hw quanh toạ độ `c` dọc theo cạnh. Toạ độ hình: x sang phải, y lên trên (y hình = -z thế giới).
 * Mỗi đa giác chạy dọc vòng ngoài từ khe này tới khe kế tiếp rồi quay về dọc vòng trong.
 */
function frameLoopPieces(
  w: number,
  h: number,
  r: number,
  wi: number,
  hi: number,
  ri: number,
  slots: { side: Dir; c: number }[],
  hw: number,
): { x: number; y: number }[][] {
  type Notch = { side: Dir; c: number; id: number };
  const order: Dir[] = ['down', 'right', 'up', 'left']; // thứ tự đi ngược chiều kim đồng hồ
  const notches: Notch[] = [];
  for (const side of order) {
    const list = slots.filter((q) => q.side === side).sort((a, b) => (side === 'down' || side === 'right' ? a.c - b.c : b.c - a.c));
    for (const q of list) notches.push({ side, c: q.c, id: notches.length });
  }
  if (!notches.length) return [];
  const loop = (W: number, H: number, R: number): LoopItem[] => {
    const out: LoopItem[] = [];
    const mark = (side: Dir): void => {
      for (const n of notches.filter((q) => q.side === side)) {
        const dirSign = side === 'down' || side === 'right' ? 1 : -1; // chiều đi dọc cạnh
        const a = n.c - dirSign * hw;
        const b = n.c + dirSign * hw;
        const at = (t: number): { x: number; y: number } =>
          side === 'down' ? { x: t, y: -H / 2 } : side === 'up' ? { x: t, y: H / 2 } : side === 'right' ? { x: W / 2, y: t } : { x: -W / 2, y: t };
        out.push({ ...at(a), id: n.id, end: 0 }, { ...at(b), id: n.id, end: 1 });
      }
    };
    const corner = (cx: number, cy: number, a0: number, a1: number, sx: number, sy: number): void => {
      if (R <= 0) {
        out.push({ x: cx + sx * 0, y: cy + sy * 0 });
        return;
      }
      for (let k = 0; k <= 10; k++) {
        const t = a0 + ((a1 - a0) * k) / 10;
        out.push({ x: cx + R * Math.cos(t), y: cy + R * Math.sin(t) });
      }
    };
    mark('down');
    corner(R > 0 ? W / 2 - R : W / 2, R > 0 ? -H / 2 + R : -H / 2, -Math.PI / 2, 0, 1, -1);
    mark('right');
    corner(R > 0 ? W / 2 - R : W / 2, R > 0 ? H / 2 - R : H / 2, 0, Math.PI / 2, 1, 1);
    mark('up');
    corner(R > 0 ? -W / 2 + R : -W / 2, R > 0 ? H / 2 - R : H / 2, Math.PI / 2, Math.PI, -1, 1);
    mark('left');
    corner(R > 0 ? -W / 2 + R : -W / 2, R > 0 ? -H / 2 + R : -H / 2, Math.PI, (3 * Math.PI) / 2, -1, -1);
    return out;
  };
  const outer = loop(w, h, r);
  const inner = loop(wi, hi, ri);
  const find = (items: LoopItem[], id: number, end: 0 | 1): number => items.findIndex((q) => q.id === id && q.end === end);
  const n = notches.length;
  const pieces: { x: number; y: number }[][] = [];
  for (let j = 0; j < n; j++) {
    const next = (j + 1) % n;
    const poly: { x: number; y: number }[] = [];
    // vòng ngoài: từ đầu sau của khe j tới đầu trước của khe kế
    let k = find(outer, j, 1);
    const kEnd = find(outer, next, 0);
    for (let guard = 0; guard <= outer.length; guard++) {
      poly.push({ x: outer[k].x, y: outer[k].y });
      if (k === kEnd) break;
      k = (k + 1) % outer.length;
    }
    // vòng trong: quay ngược lại
    let m = find(inner, next, 0);
    const mEnd = find(inner, j, 1);
    for (let guard = 0; guard <= inner.length; guard++) {
      poly.push({ x: inner[m].x, y: inner[m].y });
      if (m === mEnd) break;
      m = (m - 1 + inner.length) % inner.length;
    }
    pieces.push(poly);
  }
  return pieces;
}

export class BoardScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private view: View | null = null;
  private level: Level | null = null;
  private staticGroup = new Group();
  private dynamicGroup = new Group();
  private balls = new Map<string, BallObj>();
  private gates = new Map<string, GateObj>();
  private trailPool: TrailObj[] = [];
  private windFor: { gate: GateObj; strength: number } | null = null;
  private wind: { mesh: Mesh; mat: MeshBasicMaterial; r1: number; r2: number; r3: number }[] = [];
  private threadPool: { mesh: Mesh; mat: MeshPhysicalMaterial; key: string; dying: Mesh; dyingMat: MeshPhysicalMaterial; un: Unravel; tip: Mesh; tipMat: MeshPhysicalMaterial; tipUn: Unravel; tipT0: number | null }[] = [];
  private tipBusy = false;
  /** Hiệu ứng hút: sợi len cong và búi bông xơ bay xoáy vào cửa. */
  private fibers: { mesh: Mesh; mat: MeshStandardMaterial; on: boolean; t0: number; delay: number; life: number; s: Vector3; t: Vector3; a: number; b: number; c: number; spin: number }[] = [];
  private puffs: { mesh: Mesh; mat: MeshBasicMaterial; on: boolean; t0: number; delay: number; life: number; s: Vector3; t: Vector3; a: number; b: number; c: number }[] = [];
  private fiberGeo: BufferGeometry | null = null;
  private puffGeo = new SphereGeometry(1, 8, 6);
  private lastU = new Map<string, number>();
  private spawnAcc = new Map<string, number>();
  private fxBusy = false;
  /** Mảnh thạch văng ra khi vệt vỡ (hết hạn): có trọng lực, nảy một lần trên sàn rồi co lại và tan. */
  private shards: { mesh: Mesh; mat: MeshPhysicalMaterial; on: boolean; t0: number; life: number; p: Vector3; v: Vector3; w: Vector3; size: number; bounced: boolean; drop: boolean; drag: number; delay: number }[] = [];
  private shardGeo = new RoundedBoxGeometry(1, 1, 1, 3, 0.32);
  private dropGeo = new SphereGeometry(1, 10, 8);
  private burst = new Set<string>();
  private lastShardT = 0;
  private shardBusy = false;
  private lastSuckT = 0;
  private shot = new Set<string>();
  private lastT = 0;
  private fadeBusy = false;
  private ghostAmt = 0;
  private lastGhost: SceneDesc['ghost'] = null;
  private lineAmt = 0;
  private lastLine: SceneDesc['line'] = null;
  private focusAmount = 1;
  private pinPool: Group[] = [];
  /** Ghim đã chạm sàn (để chỉ kích hiệu ứng đập một lần) và các hiệu ứng đập đang chạy: sóng xung kích, rung bàn, ô lún. */
  private pinLanded = new Set<string>();
  private impacts: { x: number; z: number; key: string; t0: number; ring: Mesh; mat: MeshBasicMaterial }[] = [];
  private impactBusy = false;
  private markPool: Mesh[] = [];
  private bombFx: {
    group: Group;
    body: Group;
    sphere: Mesh;
    sphereMat: MeshPhysicalMaterial;
    spark: Sprite;
    shadow: Mesh;
    shadowMat: MeshBasicMaterial;
    flash: Sprite;
    rings: { mesh: Mesh; mat: MeshBasicMaterial }[];
    streaks: { mesh: Mesh; mat: MeshBasicMaterial; a: number; len: number }[];
    splat: Mesh;
    splatMat: MeshBasicMaterial;
    blasted: boolean;
  } | null = null;
  private glowTex: Texture | null = null;
  private softRingTex: Texture | null = null;

  /** Quầng sáng tròn mờ dần ra mép (trắng ở tâm): dùng cho tia lửa, chớp nổ. */
  private glowTexture(): Texture {
    if (!this.glowTex) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const c = cv.getContext('2d')!;
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
      this.glowTex = new CanvasTexture(cv);
    }
    return this.glowTex;
  }

  /** Vòng sóng xung kích mềm: dải sáng ở khoảng 80% bán kính, mờ dần cả hai phía. */
  private softRingTexture(): Texture {
    if (!this.softRingTex) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const c = cv.getContext('2d')!;
      const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.6, 'rgba(255,255,255,0)');
      g.addColorStop(0.82, 'rgba(255,255,255,1)');
      g.addColorStop(0.94, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
      this.softRingTex = new CanvasTexture(cv);
    }
    return this.softRingTex;
  }

  /** Bom nổ: mảnh thạch hồng văng theo mọi hướng (nhiều và mạnh hơn lúc khối vỡ). */
  private spawnBlast(cx: number, cz: number, nowMs: number): void {
    this.ensureShards();
    const slow = Number(new URLSearchParams(location.search).get('slowmo')) || 1;
    const hexes = ['#ff8fb8', '#ff4f86', '#ffc61f', '#ff8a1f'];
    for (let k = 0; k < 44; k++) {
      const q = this.shards.find((x) => !x.on);
      if (!q) break;
      const drop = k % 3 !== 0;
      q.on = true;
      q.drop = drop;
      q.bounced = false;
      q.t0 = nowMs;
      q.delay = 0;
      q.drag = 4.6 + Math.random() * 1.6;
      q.life = (drop ? 380 + Math.random() * 180 : 480 + Math.random() * 240) * slow;
      q.size = drop ? 0.045 + Math.random() * 0.05 : 0.14 + Math.random() * 0.14;
      const a = (k / 44) * Math.PI * 2 + Math.random() * 0.3;
      const sp = 3.4 + Math.random() * 3.4;
      q.p.set(cx + Math.cos(a) * 0.12, TILE_TOP + 0.2 + Math.random() * 0.2, cz + Math.sin(a) * 0.12);
      q.v.set(Math.cos(a) * sp, 3.2 + Math.random() * 3, Math.sin(a) * sp);
      q.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      const hex = hexes[k % hexes.length];
      q.mat.color.set(hex).lerp(WHITE, Math.random() * 0.25);
      q.mat.emissive.set(hex);
      q.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      q.mesh.geometry = drop ? this.dropGeo : this.shardGeo;
    }
  }
  /** Mức ẩn hiện của từng mặt bên của mỗi ô vệt (key: x,y,seed): chạy dần về đích để mặt viền mọc ra/co lại mượt khi ô bên cạnh đổi. */
  private faceMem = new Map<string, number[]>();
  private faceT = 0;
  private faceBusy = false;
  private dots: Mesh[] = [];
  private ghost: { group: Group; mat: MeshStandardMaterial } | null = null;
  private key = new DirectionalLight(0xfff0dc, 2.7);
  /** Đèn và cường độ gốc: lượt vẽ nền ở chế độ tập trung giảm cường độ để bàn tối dịu đi. */
  private lights: { l: Light; base: number }[] = [];
  private tileMeshes = new Map<string, Mesh>();
  private litObjs: Object3D[] = [];
  private dimScene = new Scene();
  private dimCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private dimMat = new MeshBasicMaterial({ color: '#02061a', transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  private ballGeo = new RoundedBoxGeometry(BALL.w, BALL.h, BALL.w, 6, 0.27);
  private fillGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.06);
  private trailGeo = new RoundedBoxGeometry(0.98, 1, 0.98, 5, 0.22);
  private dripGeo = new SphereGeometry(0.1, 12, 9);
  private puddleTex: Texture | null = null;
  /** Vũng thạch: vòng tròn mờ dần từ tâm ra mép (gradient), không có mép cứng. */
  private puddleTexture(): Texture {
    if (!this.puddleTex) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const c = cv.getContext('2d')!;
      const g = c.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
      this.puddleTex = new CanvasTexture(cv);
    }
    return this.puddleTex;
  } // lõi mờ của vệt, cao 1 đơn vị, co giãn theo chiều cao
  private dotGeo = new SphereGeometry(0.055, 10, 8);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.ballGeo.userData.shared = true;
    this.fillGeo.userData.shared = true;
    this.dotGeo.userData.shared = true;

    const hemi = new HemisphereLight(0xeef4ff, 0xa28fc0, 1.55);
    this.scene.add(hemi);
    this.key.position.set(0, 11, -4.3); // đèn gần đỉnh đầu, lệch về phía trên (x = 0): bóng đổ thẳng xuống dưới, không lệch trái/phải
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 3;
    this.key.shadow.intensity = 0.55; // bóng nhạt hơn để vệt đan nằm cạnh khối không bị xám bẩn
    this.scene.add(this.key);
    const fill = new DirectionalLight(0xa8c8ff, 0.55);
    fill.position.set(6, 4, 3);
    this.scene.add(fill);
    this.scene.add(this.staticGroup, this.dynamicGroup);
    for (const l of [hemi, this.key, fill]) {
      l.layers.enable(1); // lượt vẽ đối tượng sáng (layer 1) cũng cần đèn
      this.lights.push({ l, base: l.intensity });
    }
    const quad = new Mesh(new PlaneGeometry(2, 2), this.dimMat);
    quad.frustumCulled = false;
    this.dimScene.add(quad);
  }

  setSize(w: number, h: number, dpr: number): void {
    this.renderer.setPixelRatio(Math.min(dpr, 2)); // tối đa 2x: màn 3x trên điện thoại sẽ quá nặng cho một cảnh toàn màn hình
    this.renderer.setSize(w, h, false);
  }

  /** Dựng phần tĩnh của level: khung vàng, ô nền, cúc áo, giỏ; và các khối len (ẩn cho tới khi được mô tả). */
  setLevel(level: Level): void {
    this.level = level;
    this.tileMeshes.clear();
    this.litObjs = [];
    disposeTree(this.staticGroup);
    this.staticGroup.clear();
    for (const b of this.balls.values()) {
      disposeTree(b.group);
      this.dynamicGroup.remove(b.group);
    }
    this.balls.clear();
    this.gates.clear();
    const W = level.width;
    const H = level.height;

    this.buildBoard(W, H);
    for (const wl of level.walls) this.buildWall(wl.x, wl.y, W, H);
    for (const g of level.gates) this.buildGate(g, g.color, W, H);
    for (const b of level.balls) this.buildBall(b.id, b.color, b.axis, b.hidden, b.frozen);
    this.buildSpecials(level);

    const r = Math.max(W, H) / 2 + 2.5;
    Object.assign(this.key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 40 });
    this.key.shadow.camera.updateProjectionMatrix();
    this.key.target.position.set(0, 0, 0);
    this.scene.add(this.key.target);
  }

  /** Đặt khung nhìn sao cho bàn vừa khít `rect` (px CSS) trong vùng vẽ `viewport`. */
  setView(rect: Rect, viewport: { w: number; h: number }): void {
    if (!this.level) return;
    this.view = fitView(this.level.width, this.level.height, viewport, rect);
  }

  /** Ô của bàn mà toạ độ màn hình chạm vào, hoặc null. */
  pick(px: number, py: number): { x: number; y: number } | null {
    if (!this.view || !this.level) return null;
    return screenToCell(this.view, this.level.width, this.level.height, px, py);
  }

  /**
   * Khối len mà điểm chạm (px, py) trúng, chọn theo hộp bao 3D của từng khối (cả đỉnh lẫn thân), hoặc null.
   * `balls` là các khối đang đứng yên trên bàn (toạ độ ô).
   */
  pickBall(px: number, py: number, balls: readonly { id: string; x: number; y: number }[]): string | null {
    if (!this.view || !this.level) return null;
    const W = this.level.width;
    const H = this.level.height;
    const boxes = balls.map((b) => {
      const c = cellToWorld(W, H, b.x, b.y);
      return { id: b.id, min: new Vector3(c.x - 0.5, TILE_TOP, c.z - 0.5), max: new Vector3(c.x + 0.5, TILE_TOP + BALL.h, c.z + 0.5) };
    });
    return pickBox(this.view, px, py, boxes);
  }

  /** Toạ độ màn hình (px CSS) của tâm ô (x, y) trên mặt bàn. */
  cellScreen(x: number, y: number): { x: number; y: number } | null {
    if (!this.view || !this.level) return null;
    return worldToScreen(this.view, cellToWorld(this.level.width, this.level.height, x, y));
  }

  /** Toạ độ màn hình (px CSS) của tâm cửa (cạnh, chỉ số), hoặc null. */
  gateScreen(side: Dir, index: number, depth?: number): { x: number; y: number } | null {
    const o = this.gates.get(gateKey({ side, index, depth }));
    if (!this.view || !o) return null;
    return worldToScreen(this.view, new Vector3(o.pos.x, RING_TOP, o.pos.z));
  }

  /** Giỏ (cạnh, chỉ số) gần điểm chạm nhất, trong bán kính `radius` px, hoặc null. */
  pickGate(px: number, py: number, radius: number): { side: Dir; index: number; depth?: number } | null {
    if (!this.view || !this.level) return null;
    let best: { side: Dir; index: number; depth?: number } | null = null;
    let bestD = radius;
    for (const g of this.level.gates) {
      const o = this.gates.get(gateKey(g));
      if (!o) continue;
      const sp = worldToScreen(this.view, new Vector3(o.pos.x, RING_TOP, o.pos.z));
      const d = Math.hypot(sp.x - px, sp.y - py);
      if (d < bestD) {
        bestD = d;
        best = { side: g.side, index: g.index, depth: g.depth };
      }
    }
    return best;
  }

  /** Còn hiệu ứng tự chạy theo thời gian (đầu chỉ đang mọc): game cần vẽ tiếp khung sau. */
  animating(): boolean {
    return this.tipBusy || this.faceBusy || this.fadeBusy || this.fxBusy || this.shardBusy || this.impactBusy;
  }

  render(desc: SceneDesc): void {
    if (!this.view || !this.level) return;
    const W = this.level.width;
    const H = this.level.height;

    // khối len
    for (const b of this.balls.values()) b.group.visible = false;
    for (const d of desc.balls) {
      const b = this.balls.get(d.id);
      if (!b) continue;
      const p = cellToWorld(W, H, d.x, d.y);
      b.group.visible = d.alpha > 0.02;
      b.group.position.set(p.x + d.ox, TILE_TOP + (BALL.h / 2) * d.scale * d.sy + d.lift, p.z + d.oy);
      b.group.scale.set(d.scale * d.sx, d.scale * d.sy, d.scale * d.sz);
      const iceAmt = d.ice ?? 0;
      if (b.ice) {
        // băng vỡ: lúc mức băng vừa rời khỏi 1, băng tung thành mảnh tại chỗ khối đứng
        if ((b.iceWas ?? 0) > 0.98 && iceAmt < 0.98) this.spawnShards(p.x, p.z, '#bfe6ff', performance.now());
        b.iceWas = iceAmt;
        b.ice.visible = iceAmt > 0.02;
        (b.ice.material as MeshPhysicalMaterial).opacity = 0.6 * iceAmt;
        b.ice.scale.setScalar(0.9 + 0.1 * iceAmt);
      }
      const hide = d.hide ?? 0;
      if (b.q || hide > 0.001) {
        // thạch ẩn: màu pha về xám theo mức che, dấu ? mờ dần khi lộ
        const mix = new Color(b.hex).lerp(new Color('#aab4c6'), hide);
        b.body.color.copy(mix);
        b.core.color.copy(mix).lerp(WHITE, 0.25);
        b.core.emissive.copy(mix);
        if (b.q) {
          b.q.visible = hide > 0.03;
          (b.q.material as MeshBasicMaterial).opacity = hide;
        }
      }
      const fade = d.alpha < 0.999;
      b.body.opacity = 0.8 * d.alpha; // thạch luôn bán trong suốt
      b.core.transparent = fade;
      b.core.opacity = d.alpha;
      // khối tan: thu nhỏ dần về phía cửa trong lúc các sợi len bay ra (xem updateSuck); không còn xé hình khối bằng shader
      const um = Math.min(1, d.unravel);
      // cổng là máy xay: khối bị kéo sâu vào cửa và ép dẹp theo trục đi vào, bị thân cửa che dần
      const eat = Math.pow(um, 1.2);
      const px = Math.abs(d.pull.x) > 0 ? 1 - 0.85 * eat : 1;
      const pz = Math.abs(d.pull.y) > 0 ? 1 - 0.85 * eat : 1;
      b.group.scale.x *= px;
      b.group.scale.z *= pz;
      b.group.scale.y *= 1 - 0.7 * eat;
      b.group.position.x += d.pull.x * 0.18 * eat; // chỉ chui sâu vào thân cửa, không ló ra phía sau
      b.group.position.z += d.pull.y * 0.18 * eat;
      b.body.opacity *= 1 - eat * eat;
      b.un.uT.value = 0;
      b.mesh.castShadow = d.unravel < 0.02;
    }

    // Vệt thạch theo bốn trạng thái, mọi chuyển tiếp là liên tục:
    //  - mọc (grow): phình lên từ sàn, lõi sáng và bọt khí hiện dần;
    //  - mới (loosen = 0): cột thạch cao, đặc, lõi sáng, bọt khí, vệt sáng ở mặt trên;
    //  - sắp hết hạn (loosen -> 1): chảy xẹp thành mái vòm thấp, nhạt màu, lõi tắt, bọt biến mất, vũng loang rộng và các giọt chảy ra ở chân;
    //  - tan (dissolve): bị ép dẹp thành vũng, vũng loang rồi mờ hẳn.
    this.ensureTrails(desc.trails.length);
    let faceBusy = false;
    const nowShard = performance.now();
    const aliveBurst = new Set<string>();
    this.trailPool.forEach((t, i) => {
      const d = desc.trails[i];
      if (!d) {
        t.group.visible = false;
        return;
      }
      const p = cellToWorld(W, H, d.x, d.y);
      const hex = COLOR_HEX[d.color] ?? '#cccccc';
      if (d.dissolve > 0 && !d.suck) {
        const bk = `${d.x},${d.y},${d.seed}`;
        aliveBurst.add(bk);
        if (!this.burst.has(bk)) {
          this.burst.add(bk);
          this.spawnShards(p.x, p.z, hex, nowShard);
        }
      }
      const l = d.loosen;
      const ds = d.dissolve;
      // vỡ: thân phình lên căng ra trong ~20% đầu rồi biến mất (các mảnh thạch văng ra thay thế, xem spawnShards); vũng loang ở lại
      const pop = Math.min(1, ds / 0.2);
      const bodyFade = ds <= 0 ? 1 : Math.max(0, 1 - Math.pow(pop, 2));
      const fade = Math.max(0, 1 - Math.max(0, ds - 0.55) / 0.45) * d.alpha;
      t.mat.color.set(hex).lerp(WHITE, 0.22 * l + 0.3 * pop);
      t.mat.emissive.set(hex);
      t.mat.emissiveIntensity = 0.22 - 0.1 * l;
      t.mat.opacity = (0.62 - 0.26 * l) * fade * bodyFade;
      const tall = 0.5 + (0.2 - 0.5) * l;
      const hh = Math.max(0.015, tall * (0.1 + 0.9 * d.grow) * (1 + 0.12 * pop));
      const wob = 1 + 0.1 * Math.sin(d.grow * Math.PI) * (1 - ds) + 0.08 * l + 0.14 * pop; // phình lúc mọc, loang khi chảy, căng ra trước khi vỡ
      const sq = 1;
      t.jelly.scale.set(wob * sq, hh, wob * sq);
      t.jelly.position.y = hh / 2;
      // lõi sáng: nhỏ hơn thân, tắt dần khi chảy
      const coreOp = 0.55 * (1 - l) * d.grow * bodyFade * fade;
      t.coreMat.color.set(hex).lerp(WHITE, 0.3);
      t.coreMat.emissive.set(hex);
      t.coreMat.opacity = coreOp;
      t.core.visible = coreOp > 0.01;
      t.core.scale.set(0.6, Math.max(0.01, hh * 0.72), 0.6);
      t.core.position.y = hh / 2;
      // bọt khí bay lên chậm trong thân thạch mới
      t.bubbleMat.opacity = 0.42 * (1 - l) * d.grow * bodyFade * fade;
      t.bubbles.forEach((bm, k) => {
        bm.visible = t.bubbleMat.opacity > 0.01;
        bm.position.y = hh * (0.22 + 0.2 * k);
      });
      // vệt sáng mặt trên
      t.shineMat.opacity = 0.5 * bodyFade * fade * (0.5 + 0.5 * (1 - l));
      t.shine.position.set(-0.2, hh + 0.004, -0.18);
      t.shine.visible = t.shineMat.opacity > 0.01 && hh > 0.05;
      // vũng thạch loang dưới chân: có từ khi sắp hết hạn, rộng dần khi tan
      t.puddleMat.color.set(hex);
      t.puddleMat.opacity = (0.12 + 0.22 * l + 0.25 * pop) * fade * (1 - 0.5 * ds) * Math.max(0.35, d.grow);
      const pr = 0.8 + 0.1 * l + 0.22 * Math.min(1, ds * 2.2); // vũng loang vừa phải ngay khi vỡ
      t.puddle.scale.set(pr, pr, pr);
      t.puddle.position.y = 0.006;
      // giọt chảy ở bốn góc chân (phình theo mức chảy, co lại khi tan)
      t.dripMat.color.set(hex).lerp(WHITE, 0.2);
      t.dripMat.emissive.set(hex);
      t.dripMat.opacity = 0.72 * fade;
      const dr = Math.max(0, l - 0.15) / 0.85 * bodyFade * d.grow;
      t.drips.forEach((dm, k) => {
        const kk = 0.7 + 0.5 * ((k * 5) % 3) / 2;
        dm.visible = dr > 0.02;
        dm.scale.set(dr * kk * 1.2, dr * kk * 0.5, dr * kk * 1.2);
        dm.position.y = 0.02 + 0.03 * dr;
      });
      t.group.visible = fade > 0.02 && d.scale > 0.02;
      t.group.scale.setScalar(d.scale);
      t.group.position.set(p.x, TILE_TOP, p.z);
    });

    this.faceBusy = faceBusy;

    // giỏ: mọi trạng thái (đã nhận, sáng, vạn năng) chuyển dần chứ không đổi tức thì
    const nowMs = performance.now();
    const nowS = nowMs / 1000;
    const dtS = this.lastT ? Math.min(0.034, (nowMs - this.lastT) / 1000) : 0;
    this.lastT = nowMs;
    const kA = 1 - Math.exp(-dtS / 0.09);
    let busy = false;
    const approach = (cur: number, target: number): number => {
      const v = cur + (target - cur) * kA;
      if (Math.abs(target - v) < 0.004) return target;
      busy = true;
      return v;
    };
    this.windFor = null;
    for (const g of desc.gates) {
      const o = this.gates.get(gateKey(g));
      if (!o) continue;
      const tDone = g.done ? 1 : 0;
      const tGlow = g.glow ? 1 : 0;
      const tWild = g.wild ? 1 : 0;
      if (!o.inited) {
        o.inited = true;
        o.doneAmt = tDone;
        o.glowAmt = tGlow;
        o.wildAmt = tWild;
      } else {
        // tiến độ đổi dấu chạy tuyến tính trong ~0.5s (nửa đầu: tam giác thu nhỏ, nửa sau: dấu tick mọc lên)
        const stepD = dtS / 0.5;
        o.doneAmt = o.doneAmt < tDone ? Math.min(tDone, o.doneAmt + stepD) : Math.max(tDone, o.doneAmt - stepD);
        if (o.doneAmt !== tDone) busy = true;
        o.glowAmt = approach(o.glowAmt, tGlow);
        o.wildAmt = approach(o.wildAmt, tWild);
      }
      o.mat.transparent = o.doneAmt > 0.001;
      o.mat.opacity = 1 - 0.58 * o.doneAmt;
      // Cửa đang nuốt: sáng và phình lên MỘT mức mượt theo g.suck (không nhịp nhanh), tránh nhấp nháy
      const pulse = 0.5;
      const baseI = Math.max(o.glowAmt * 0.65, g.suck * 0.6);
      const fl = g.flash ?? 0;
      o.mat.emissive.set(o.baseColor).lerp(WHITE, fl);
      o.mat.emissiveIntensity = Math.max(baseI, 1.5 * fl);
      // giỏ vạn năng: lớp sơn cầu vồng cố định mờ dần lên cửa (không đổi màu liên tục)
      const rm = o.rainbow.material as MeshStandardMaterial;
      rm.opacity = o.wildAmt;
      rm.emissiveIntensity = 0.04 + 0.1 * Math.max(o.glowAmt, g.suck) + 0.025 * Math.sin(nowS * 3) + 1.1 * fl;
      o.rainbow.visible = o.wildAmt > 0.01;
      const sc = 1 + 0.07 * o.glowAmt + 0.2 * (g.flash ?? 0);
      const wildPulse = 1 + 0.05 * Math.sin(nowS * 6) * o.wildAmt;
      // Cửa nuốt khối: dài ra nhẹ (+20%) theo chiều đi vào cửa (bề dày thân cửa) về cả hai phía: vào trong bàn và ra ngoài.
      // To ra 100ms, giữ nguyên 300ms, co về 150ms (đều tuyến tính).
      const kx = 1;
      let kz = 1;
      if (g.kick !== undefined && g.kick >= 0) {
        const k = g.kick;
        kz = 1 + 0.2 * (k < 100 ? k / 100 : k < 400 ? 1 : Math.max(0, 1 - (k - 400) / 150));
        if (k < 560) busy = true;
      }
      o.group.position.set(o.pos.x, 0, o.pos.z); // dài ra đều về HAI phía (vào bàn và ra ngoài), nhẹ nên không vướng
      o.group.scale.set(sc * wildPulse * kx, 1, sc * wildPulse * kz); // không co giãn theo chiều cao: dấu tam giác/tick dán trên mặt cửa đứng yên, cửa nhô cao hơn sẽ che mất nó (nhấp nháy)
      if (g.suck > 0) this.windFor = { gate: o, strength: g.suck };
      // tam giác -> dấu tick: tam giác thu về 0 với easeInBack (lùi nhẹ lấy đà rồi co lại), sau đó tick từ 0 lên 1 với easeOutBack (vọt qua rồi về)
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const inBack = (x: number): number => c3 * x * x * x - c1 * x * x;
      const outBack = (x: number): number => 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
      const markS = o.doneAmt >= 0.5 ? 0 : 1 - inBack(Math.min(1, o.doneAmt / 0.5));
      const checkS = o.doneAmt <= 0.5 ? 0 : outBack(Math.min(1, (o.doneAmt - 0.5) / 0.5));
      (o.check.material as MeshBasicMaterial).opacity = 1;
      (o.mark.material as MeshBasicMaterial).opacity = 1;
      o.mark.scale.setScalar(Math.max(0.0001, markS));
      o.check.scale.setScalar(Math.max(0.0001, checkS));
      o.check.visible = checkS > 0.002;
      o.mark.visible = markS > 0.002;
    }

    for (const k of [...this.burst]) if (!aliveBurst.has(k)) this.burst.delete(k);
    this.updateSuck(desc, nowMs);
    this.updateShards(nowMs);
    this.updatePins(desc.pins, nowMs);
    this.updateImpacts(nowMs);
    this.focusAmount = desc.focus?.amount ?? 1;
    this.updateMarks(desc.marks, nowS);
    this.updateBomb(desc.bomb);

    // khối mờ báo điểm dừng và đường chấm
    // (cả hai mờ vào/mờ ra; khi đang mờ ra vẫn giữ vị trí cũ)
    if (desc.ghost) this.lastGhost = desc.ghost;
    const wasGhost = this.ghostAmt > 0.05;
    this.ghostAmt = approach(this.ghostAmt, desc.ghost ? 1 : 0);
    if (this.lastGhost && this.ghostAmt > 0.003) {
      const gh = this.ensureGhost();
      const p = cellToWorld(W, H, this.lastGhost.x, this.lastGhost.y);
      gh.group.visible = true;
      const target = new Vector3(p.x, TILE_TOP + BALL.h / 2, p.z);
      if (wasGhost) gh.group.position.lerp(target, 1 - Math.exp(-dtS / 0.045)); // đổi hướng kéo thì khối mờ trượt sang chứ không nhảy
      else gh.group.position.copy(target);
      if (gh.group.position.distanceTo(target) > 0.003) busy = true;
      gh.mat.color.set(COLOR_HEX[this.lastGhost.color] ?? '#888888');
      gh.mat.opacity = 0.45 * this.ghostAmt;
    } else if (this.ghost) {
      this.ghost.group.visible = false;
    }
    if (desc.line) this.lastLine = desc.line;
    this.lineAmt = approach(this.lineAmt, desc.line ? 1 : 0);
    this.updateSpecials(performance.now() / 1000);
    this.updateDots(desc.line ?? (this.lineAmt > 0.003 ? this.lastLine : null), this.lineAmt);
    this.fadeBusy = busy;

    const f = desc.focus;
    const cam = this.view.camera;
    const r = this.renderer;
    if (!f || f.amount < 0.002) {
      r.autoClear = true;
      r.shadowMap.autoUpdate = true;
      r.render(this.scene, cam);
      return;
    }
    // Chế độ tập trung: lớp tối phủ toàn khung hình, vẽ cả bàn với đèn dịu đi, rồi vẽ lại chỉ các đối tượng được chọn (layer 1) với
    // đèn đầy đủ và cùng bộ đệm độ sâu nên đúng chỗ che khuất. Mọi mức đều theo `amount` để chuyển cảnh bằng alpha.
    this.applyFocusLayers(f);
    r.autoClear = false;
    r.clear();
    this.dimMat.opacity = 0.9 * f.amount;
    r.render(this.dimScene, this.dimCam);
    for (const q of this.lights) q.l.intensity = q.base * (1 - 0.5 * f.amount);
    r.shadowMap.autoUpdate = true;
    r.render(this.scene, cam);
    for (const q of this.lights) q.l.intensity = q.base;
    r.shadowMap.autoUpdate = false;
    cam.layers.set(1);
    r.render(this.scene, cam);
    cam.layers.set(0);
    r.shadowMap.autoUpdate = true;
    r.autoClear = true;
  }

  /** Bật layer 1 cho đúng các đối tượng cần sáng ở lượt vẽ tập trung (và tắt ở các đối tượng của lần trước). */
  private applyFocusLayers(f: FocusDesc): void {
    for (const o of this.litObjs) o.traverse((c) => c.layers.disable(1));
    this.litObjs = [];
    const add = (o: Object3D | undefined): void => {
      if (!o) return;
      o.traverse((c) => c.layers.enable(1));
      this.litObjs.push(o);
    };
    for (const k of f.cells) add(this.tileMeshes.get(k));
    for (const id of f.balls) add(this.balls.get(id)?.group);
    for (const k of f.gates) {
      const g = this.gates.get(k);
      add(g?.group);
      add(g?.mark);
      add(g?.check);
    }
  }

  dispose(): void {
    disposeTree(this.staticGroup);
    disposeTree(this.dynamicGroup);
    this.renderer.dispose();
  }

  // ---------- dựng phần tĩnh ----------

  /**
   * Bàn có hình dạng: khung vàng, đế nâu và các ô dựng từ các hộp. Khung = vùng cách ô chơi được tối đa RING (khoảng cách Chebyshev, chia lưới mịn 0.1 ô)
   * trừ đi chính các ô; chỗ mỗi cửa được khoét hở. Các hàng liền nhau cùng đoạn được gộp thành một hộp.
   */
  private buildShapedBoard(W: number, H: number): void {
    const level = this.level!;
    const gold = new MeshPhysicalMaterial({ color: '#f6b92f', roughness: 0.32, metalness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.25 });
    const brown = new MeshStandardMaterial({ color: '#6b3d0a', roughness: 0.6 });
    const F = 10; // số ô mịn trên một ô chơi
    const pad = 6;
    const GW = W * F + 2 * pad;
    const GH = H * F + 2 * pad;
    const board = new Uint8Array(GW * GH);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inBoard(level, x, y)) for (let j = 0; j < F; j++) for (let i = 0; i < F; i++) board[(y * F + j + pad) * GW + x * F + i + pad] = 1;
    const dilate = (src: Uint8Array, k: number): Uint8Array => {
      const tmp = new Uint8Array(GW * GH);
      const out = new Uint8Array(GW * GH);
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (src[y * GW + x]) for (let d = -k; d <= k; d++) if (x + d >= 0 && x + d < GW) tmp[y * GW + x + d] = 1;
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (tmp[y * GW + x]) for (let d = -k; d <= k; d++) if (y + d >= 0 && y + d < GH) out[(y + d) * GW + x] = 1;
      return out;
    };
    // toạ độ thế giới của ô mịn (i, j): tâm bàn ở gốc
    const wx = (i: number): number => (i - pad) / F - W / 2;
    const wz = (j: number): number => (j - pad) / F - H / 2;
    const boxes = (mask: Uint8Array, mat: Material, y0: number, y1: number, shadow: boolean): void => {
      const open = new Map<string, { i0: number; i1: number; j0: number; j1: number }>();
      const rects: { i0: number; i1: number; j0: number; j1: number }[] = [];
      for (let j = 0; j <= GH; j++) {
        const runs: [number, number][] = [];
        if (j < GH) {
          let i = 0;
          while (i < GW) {
            if (mask[j * GW + i]) {
              const st = i;
              while (i < GW && mask[j * GW + i]) i++;
              runs.push([st, i]);
            } else i++;
          }
        }
        const keys = new Set(runs.map(([a, b]) => `${a}-${b}`));
        for (const [k, r] of [...open]) {
          if (!keys.has(k)) {
            rects.push(r);
            open.delete(k);
          }
        }
        for (const [a, b] of runs) {
          const k = `${a}-${b}`;
          const r = open.get(k);
          if (r) r.j1 = j + 1;
          else open.set(k, { i0: a, i1: b, j0: j, j1: j + 1 });
        }
      }
      for (const r of rects) {
        const m = new Mesh(new BoxGeometry((r.i1 - r.i0) / F, y1 - y0, (r.j1 - r.j0) / F), mat);
        m.position.set(wx((r.i0 + r.i1) / 2), (y0 + y1) / 2, wz((r.j0 + r.j1) / 2));
        m.castShadow = shadow;
        m.receiveShadow = true;
        this.staticGroup.add(m);
      }
    };
    const ringSteps = Math.round(RING * F);
    const outer = dilate(board, ringSteps);
    // đế nâu: cùng hình với khung vàng (không nhô ngang ra ngoài tường), chỉ lộ thành nâu ở phía dưới
    boxes(outer, brown, -0.16, -0.06, false);
    // khung vàng = vùng giãn trừ các ô, trừ chỗ khoét cho cửa
    const frame = new Uint8Array(GW * GH);
    for (let n = 0; n < frame.length; n++) frame[n] = outer[n] && !board[n] ? 1 : 0;
    for (const g of level.gates) {
      const c = gateCell(level, g);
      const cw = cellToWorld(W, H, c.x, c.y);
      const horizontal = g.side === 'up' || g.side === 'down';
      const sgn = g.side === 'up' || g.side === 'left' ? -1 : 1;
      for (let j = 0; j < GH; j++) {
        for (let i = 0; i < GW; i++) {
          const x = wx(i + 0.5) - 0; // tâm ô mịn
          const z = wz(j + 0.5);
          const along = horizontal ? x - cw.x : z - cw.z;
          const out = (horizontal ? z - cw.z : x - cw.x) * sgn - 0.5;
          if (Math.abs(along) < GATE_LONG / 2 + 0.04 && out > -0.001 && out < RING + 0.04) frame[j * GW + i] = 0;
        }
      }
    }
    boxes(frame, gold, -0.08, RING_TOP + 0.0, true);

    // sàn dưới các ô và các ô sáng tối xen kẽ
    const floorMat = new MeshStandardMaterial({ color: '#a9bff0', roughness: 0.8 });
    const tileGeo = new RoundedBoxGeometry(0.985, 0.08, 0.985, 2, 0.04);
    const matA = new MeshStandardMaterial({ color: '#eef3ff', roughness: 0.55 });
    const matB = new MeshStandardMaterial({ color: '#dce7ff', roughness: 0.55 });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!inBoard(level, x, y)) continue;
        const p = cellToWorld(W, H, x, y);
        const fl = new Mesh(new PlaneGeometry(1.02, 1.02), floorMat);
        fl.rotation.x = -Math.PI / 2;
        fl.position.set(p.x, -0.02, p.z);
        fl.receiveShadow = true;
        this.staticGroup.add(fl);
        const t = new Mesh(tileGeo, (x + y) % 2 ? matB : matA);
        t.position.set(p.x, 0, p.z);
        t.receiveShadow = true;
        this.staticGroup.add(t);
        this.tileMeshes.set(`${x},${y}`, t);
      }
    }
  }

  private buildBoard(W: number, H: number): void {
    if (this.level?.mask) return this.buildShapedBoard(W, H);
    const gold = new MeshPhysicalMaterial({ color: '#f6b92f', roughness: 0.32, metalness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.25 });
    const brown = new MeshStandardMaterial({ color: '#6b3d0a', roughness: 0.6 });
    const roundedRect = (shape: Shape | Path, w: number, h: number, r: number): void => {
      const x = -w / 2;
      const y = -h / 2;
      shape.moveTo(x + r, y);
      shape.lineTo(x + w - r, y);
      shape.quadraticCurveTo(x + w, y, x + w, y + r);
      shape.lineTo(x + w, y + h - r);
      shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      shape.lineTo(x + r, y + h);
      shape.quadraticCurveTo(x, y + h, x, y + h - r);
      shape.lineTo(x, y + r);
      shape.quadraticCurveTo(x, y, x + r, y);
    };

    // viền nâu đậm phía dưới (tạo cảm giác dày), rồi khung vàng có lỗ ở giữa
    const outline = new Shape();
    roundedRect(outline, W + 2 * RING + 0.14, H + 2 * RING + 0.14, 0.5);
    const outlineMesh = new Mesh(new ExtrudeGeometry(outline, { depth: 0.1, bevelEnabled: false, curveSegments: 14 }), brown);
    outlineMesh.rotation.x = -Math.PI / 2;
    outlineMesh.position.y = -0.16;
    outlineMesh.receiveShadow = true;
    this.staticGroup.add(outlineMesh);

    // Viền vàng bị cắt hở thật ở chỗ mỗi cửa: viền được dựng thành các đoạn riêng, giữa hai đoạn là khoảng trống cho cửa lấp vào.
    const slots = (this.level?.gates ?? []).map((g) => {
      const horizontal = g.side === 'up' || g.side === 'down';
      const gcell = gateCell(this.level!, g);
      const along = cellToWorld(W, H, gcell.x, gcell.y);
      return { side: g.side, c: horizontal ? along.x : -along.z }; // toạ độ dọc theo cạnh, trong hệ toạ độ hình (y hình = -z thế giới)
    });
    const frameOpts = { depth: RING_TOP + 0.04, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3, curveSegments: 14 };
    for (const poly of frameLoopPieces(W + 2 * RING, H + 2 * RING, 0.36, W + 0.06, H + 0.06, 0, slots, GATE_LONG / 2 + 0.04)) {
      const shape = new Shape(poly.map((q) => new Vector2(q.x, q.y)));
      const piece = new Mesh(new ExtrudeGeometry(shape, frameOpts), gold);
      piece.rotation.x = -Math.PI / 2;
      piece.position.y = -0.08;
      piece.castShadow = true;
      piece.receiveShadow = true;
      this.staticGroup.add(piece);
    }

    // lòng bàn và các ô sáng tối xen kẽ
    const floor = new Mesh(new PlaneGeometry(W + 0.12, H + 0.12), new MeshStandardMaterial({ color: '#a9bff0', roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    this.staticGroup.add(floor);
    const tileGeo = new RoundedBoxGeometry(0.985, 0.08, 0.985, 2, 0.04);
    const matA = new MeshStandardMaterial({ color: '#eef3ff', roughness: 0.55 });
    const matB = new MeshStandardMaterial({ color: '#dce7ff', roughness: 0.55 });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = new Mesh(tileGeo, (x + y) % 2 ? matB : matA);
        const p = cellToWorld(W, H, x, y);
        t.position.set(p.x, 0, p.z);
        t.receiveShadow = true;
        this.staticGroup.add(t);
        this.tileMeshes.set(`${x},${y}`, t);
      }
    }
  }

  /** Mô hình hộp cứng xám trắng dùng cho cả tường của level lẫn khối do booster Block đặt. */
  private wallGroup(): Group {
    const g = new Group();
    // hộp cứng xám trắng, góc vuông: thân xám nhạt, nắp trắng hơi nhô lên, ba rãnh tối ở mặt trên và chân đế xám đậm
    const body = new Mesh(new BoxGeometry(0.96, WALL_H, 0.96), new MeshStandardMaterial({ color: '#a4abb6', roughness: 0.6, metalness: 0.15 }));
    body.position.y = WALL_H / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const cap = new Mesh(new BoxGeometry(0.88, 0.05, 0.88), new MeshStandardMaterial({ color: '#c2c8d0', roughness: 0.55, metalness: 0.1 }));
    cap.position.y = WALL_H + 0.025;
    cap.castShadow = true;
    g.add(cap);
    const base = new Mesh(new BoxGeometry(0.98, 0.07, 0.98), new MeshStandardMaterial({ color: '#8a919c', roughness: 0.7, metalness: 0.2 }));
    base.position.y = 0.035;
    base.receiveShadow = true;
    g.add(base);
    // mặt trên: ô lõm xám đậm, bên trong một tấm nổi xám nhạt, bốn đinh tán ở góc
    const panelM = new MeshStandardMaterial({ color: '#7f8793', roughness: 0.7, metalness: 0.2 });
    const inset = new Mesh(new BoxGeometry(0.62, 0.012, 0.62), panelM);
    inset.position.set(0, WALL_H + 0.056, 0);
    g.add(inset);
    const plate = new Mesh(new BoxGeometry(0.46, 0.02, 0.46), new MeshStandardMaterial({ color: '#b0b7c1', roughness: 0.55, metalness: 0.15 }));
    plate.position.set(0, WALL_H + 0.068, 0);
    plate.castShadow = true;
    g.add(plate);
    const boltM = new MeshStandardMaterial({ color: '#6e7580', roughness: 0.4, metalness: 0.5 });
    for (const [bx, bz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]] as const) {
      const bolt = new Mesh(new CylinderGeometry(0.035, 0.035, 0.03, 10), boltM);
      bolt.position.set(bx, WALL_H + 0.065, bz);
      g.add(bolt);
    }
    // hai đường ốp ngang ở thân
    const band = new MeshStandardMaterial({ color: '#aeb5bf', roughness: 0.6 });
    for (const y of [0.17, 0.33]) {
      const bd = new Mesh(new BoxGeometry(0.975, 0.02, 0.975), band);
      bd.position.y = y;
      g.add(bd);
    }
    return g;
  }

  private buildWall(cx: number, cy: number, W: number, H: number): void {
    const g = this.wallGroup();
    const p = cellToWorld(W, H, cx, cy);
    g.position.set(p.x, TILE_TOP - 0.0, p.z);
    this.staticGroup.add(g);
  }

  /** Cửa len: một đoạn tường sơn màu, có khung và panel nổi, tam giác trắng trên mặt chỉ hướng thoát. */
  private buildGate(gate: { side: Dir; index: number; depth?: number }, color: string, W: number, H: number): void {
    const { side } = gate;
    const hex = COLOR_HEX[color] ?? '#888888';
    const horizontal = side === 'up' || side === 'down';
    // Cửa đứng ngay ngoài mép của ô chứa nó (nhô ra một nửa ô cộng nửa viền): với bàn chữ nhật đó là cạnh bao, với bàn hình dạng là mép của hình.
    const gc = this.level ? gateCell(this.level, gate) : { x: gate.index, y: 0 };
    const cw = cellToWorld(W, H, gc.x, gc.y);
    const off = 0.5 + RING / 2;
    const pos = { x: cw.x + (side === 'left' ? -off : side === 'right' ? off : 0), z: cw.z + (side === 'up' ? -off : side === 'down' ? off : 0) };
    const g = new Group();
    g.position.set(pos.x, 0, pos.z);
    g.rotation.y = horizontal ? 0 : Math.PI / 2; // trục dài của cửa chạy dọc theo mép bàn
    // Cửa là một đoạn của chính bức tường: cùng độ cao, cùng bề dày, lấp kín chỗ viền vàng, chỉ khác ở màu và lớp sơn.
    // Viền khung bị cắt hở đúng chỗ này; cửa là khối hộp chữ nhật lấp kín khe: cùng độ dày, cùng độ cao với viền.
    const LONG = GATE_LONG;
    const OUT = 0.02;
    const THICK = RING + 2 * OUT;
    const BOTTOM = -0.14;
    const TOP = RING_TOP + 0.006;
    const outSign = side === 'up' || side === 'left' ? -1 : 1;
    const mat = doorMaterial(hex);
    const door = new Mesh(new RoundedBoxGeometry(LONG, TOP - BOTTOM, THICK, 4, 0.06), mat);
    door.position.set(0, (TOP + BOTTOM) / 2 - g.position.y, outSign * OUT);
    door.castShadow = true;
    door.receiveShadow = true;
    g.add(door);
    const rainbow = new Mesh(door.geometry, rainbowDoorMaterial());
    rainbow.position.copy(door.position);
    rainbow.scale.setScalar(1.004);
    rainbow.renderOrder = 2;
    rainbow.visible = false;
    g.add(rainbow);
    this.staticGroup.add(g);

    // mũi tên và ký hiệu: dán phẳng lên mặt cửa, vẽ trong toạ độ thế giới nên luôn đứng thẳng với người nhìn
    const top = TOP + 0.004; // mặt trên của cửa
    const dir = horizontal ? { x: 1, z: 0 } : { x: 0, z: 1 };
    const decalMat = (kind: 'check' | 'triangle'): MeshBasicMaterial =>
      new MeshBasicMaterial({ map: symbolTexture(kind), transparent: true, depthWrite: false });
    const place = (m: Mesh, offset: number): void => {
      m.rotation.x = -Math.PI / 2;
      m.position.set(pos.x + dir.x * offset + (horizontal ? 0 : outSign * OUT), top, pos.z + dir.z * offset + (horizontal ? outSign * OUT : 0));
      m.renderOrder = 5;
      this.staticGroup.add(m);
    };
    const mark = new Mesh(new PlaneGeometry(0.3, 0.3), decalMat('triangle'));
    // tam giác mặc định chỉ về phía -z; xoay quanh trục đứng để chỉ ra ngoài theo từng cạnh
    mark.rotation.order = 'YXZ';
    place(mark, 0);
    mark.rotation.y = side === 'up' ? 0 : side === 'down' ? Math.PI : side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    const check = new Mesh(new PlaneGeometry(0.3, 0.3), decalMat('check'));
    place(check, 0);
    check.visible = false;
    const inward = side === 'up' ? new Vector3(0, 0, 1) : side === 'down' ? new Vector3(0, 0, -1) : side === 'left' ? new Vector3(1, 0, 0) : new Vector3(-1, 0, 0);
    this.gates.set(gateKey(gate), { group: g, mat, mark, check, baseColor: hex, pos: new Vector3(pos.x, 0, pos.z), inward, doneAmt: 0, glowAmt: 0, wildAmt: 0, inited: false, rainbow });
  }

  private buildBall(id: string, color: string, axis?: 'h' | 'v', hidden?: boolean, frozen?: boolean): void {
    const b = makeBall(color, this.ballGeo, axis, hidden);
    if (frozen) {
      // khối băng trong mờ bọc quanh thạch: bóng, hơi xanh, mép bo
      const mat = new MeshPhysicalMaterial({ color: '#cfeeff', roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.6, depthWrite: false });
      const ice = new Mesh(new RoundedBoxGeometry(BALL.w * 1.16, BALL.h + 0.2, BALL.w * 1.16, 4, 0.16), mat);
      ice.position.y = 0.04;
      ice.renderOrder = 6;
      b.group.add(ice);
      b.ice = ice;
      b.iceWas = 1;
    }
    b.group.visible = false;
    this.dynamicGroup.add(b.group);
    this.balls.set(id, b);
  }

  // ---------- phần động ----------

  private ensureTrails(n: number): void {
    while (this.trailPool.length < n) {
      const mat = jellyMaterial('#ffffff', 0.6);
      mat.depthWrite = false;
      const jelly = new Mesh(this.trailGeo, mat);
      jelly.renderOrder = 2;
      const group = new Group();
      // lõi sáng
      const coreMat = new MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.4, transparent: true, opacity: 0.5, depthWrite: false });
      const core = new Mesh(this.fillGeo, coreMat);
      core.renderOrder = 1;
      // vũng thạch trên sàn
      const puddleMat = new MeshBasicMaterial({ color: '#ffffff', map: this.puddleTexture(), transparent: true, opacity: 0.2, depthWrite: false });
      const puddle = new Mesh(new PlaneGeometry(1.1, 1.1), puddleMat);
      puddle.rotation.x = -Math.PI / 2;
      puddle.renderOrder = 0;
      // giọt thạch ở các góc chân
      const dripMat = jellyMaterial('#ffffff', 0.7);
      dripMat.depthWrite = false;
      const drips: Mesh[] = [];
      for (const [x, z] of [[-0.4, -0.38], [0.41, -0.35], [-0.38, 0.41], [0.36, 0.4]] as const) {
        const dm = new Mesh(this.dripGeo, dripMat);
        dm.position.set(x, 0.04, z);
        dm.visible = false;
        dm.renderOrder = 2;
        drips.push(dm);
        group.add(dm);
      }
      // bọt khí
      const bubbleMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false });
      const bubbles: Mesh[] = [];
      for (const [x, z, r] of [[-0.2, 0.18, 0.045], [0.22, -0.16, 0.035], [0.05, 0.28, 0.03]] as const) {
        const bm = new Mesh(new SphereGeometry(r, 10, 8), bubbleMat);
        bm.position.set(x, 0.2, z);
        bm.renderOrder = 3;
        bubbles.push(bm);
        group.add(bm);
      }
      // vệt sáng
      const shineMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false });
      const shine = new Mesh(new SphereGeometry(1, 14, 8), shineMat);
      shine.scale.set(0.2, 0.012, 0.09);
      shine.rotation.y = 0.5;
      shine.renderOrder = 4;
      group.add(puddle, core, jelly, shine);
      group.visible = false;
      this.dynamicGroup.add(group);
      this.trailPool.push({ group, jelly, mat, core, coreMat, puddle, puddleMat, drips, dripMat, bubbles, bubbleMat, shine, shineMat });
    }
  }

  private ensureFx(): void {
    if (this.fiberGeo) return;
    // giọt thạch: hình cầu nhỏ, bị kéo dài theo hướng bay khi chạy
    this.fiberGeo = new SphereGeometry(0.05, 12, 9);
    this.fiberGeo.userData.shared = true;
    this.puffGeo.userData.shared = true;
    for (let i = 0; i < 360; i++) {
      const mat = new MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.15, clearcoat: 1, emissiveIntensity: 0.3, transparent: true, opacity: 0.85 });
      const mesh = new Mesh(this.fiberGeo, mat);
      mesh.visible = false;
      this.dynamicGroup.add(mesh);
      this.fibers.push({ mesh, mat, on: false, t0: 0, delay: 0, life: 1, s: new Vector3(), t: new Vector3(), a: 0, b: 0, c: 0, spin: 0 });
    }
    for (let i = 0; i < 140; i++) {
      const mat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false });
      const mesh = new Mesh(this.puffGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.dynamicGroup.add(mesh);
      this.puffs.push({ mesh, mat, on: false, t0: 0, delay: 0, life: 1, s: new Vector3(), t: new Vector3(), a: 0, b: 0, c: 0 });
    }
  }

  /** Vỡ: ô thạch nổ thành nhiều mảnh to nhỏ và vài giọt bắn ra, rơi xuống sàn nảy một lần rồi co lại và tan. */
  private ensureShards(): void {
    if (this.shards.length > 0) return;
    for (let i = 0; i < 380; i++) {
      const mat = jellyMaterial('#ffffff', 0.82);
      mat.depthWrite = false;
      const mesh = new Mesh(this.shardGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.dynamicGroup.add(mesh);
      this.shards.push({ mesh, mat, on: false, t0: 0, life: 1, p: new Vector3(), v: new Vector3(), w: new Vector3(), size: 0.1, bounced: false, drop: false, drag: 5.5, delay: 0 });
    }
  }

  /**
   * Bắn tung: cửa nhả một loạt mảnh và giọt thạch bắn ra như phát súng hoa cải. Chùm hình quạt rộng hướng ra phía sau cửa (từ mặt ngoài của thân cửa),
   * mảnh bắn rất nhanh, bay xa vài ô (lực cản thấp), rơi xuống nảy rồi tan.
   */
  private spawnShotgun(cx: number, cz: number, pull: { x: number; y: number }, hex: string, nowMs: number): void {
    this.ensureShards();
    const slow = Number(new URLSearchParams(location.search).get('slowmo')) || 1;
    const len = Math.hypot(pull.x, pull.y) || 1;
    const base = Math.atan2(pull.y / len, pull.x / len); // hướng ra phía SAU cửa (x, z): máy xay nhả vụn ra phía sau
    const n = 58;
    for (let k = 0; k < n; k++) {
      const q = this.shards.find((x) => !x.on);
      if (!q) break;
      const drop = k % 2 === 1;
      q.on = true;
      q.drop = drop;
      q.bounced = false;
      q.t0 = nowMs;
      q.delay = Math.random() * 40 * slow;
      q.life = (drop ? 280 + Math.random() * 140 : 360 + Math.random() * 200) * slow;
      q.drag = 6.5 + Math.random() * 3; // lực cản lớn: bắn rất nhanh nhưng phanh gấp nên tầm nhìn xong chỉ trong phạm vi gần
      q.size = drop ? 0.035 + Math.random() * 0.04 : 0.1 + Math.random() * 0.12;
      const a = base + (Math.random() + Math.random() - 1) * 0.95; // quạt rộng (~±55°), đông ở giữa, lác đác ra rìa
      const sp = 6 + Math.random() * 7;
      // xuất phát ngay trên nóc cửa (giữa bề dày thân cửa, sát mặt trên), không cách cửa một đoạn: quạt thu về đúng cửa
      q.p.set(cx + (pull.x / len) * 0.26 + (Math.random() - 0.5) * 0.16 * -(pull.y / len), RING_TOP + 0.02 + Math.random() * 0.12, cz + (pull.y / len) * 0.26 + (Math.random() - 0.5) * 0.16 * (pull.x / len));
      q.v.set(Math.cos(a) * sp, 1.4 + Math.random() * 2.6, Math.sin(a) * sp);
      q.w.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
      q.mat.color.set(hex).lerp(WHITE, Math.random() * 0.3);
      q.mat.emissive.set(hex);
      q.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      q.mesh.geometry = drop ? this.dropGeo : this.shardGeo;
      q.mesh.visible = false;
    }
  }

  private spawnShards(cx: number, cz: number, hex: string, nowMs: number): void {
    this.ensureShards();
    const slow = Number(new URLSearchParams(location.search).get('slowmo')) || 1;
    const nChunks = 8;
    const nDrops = 8;
    for (let k = 0; k < nChunks + nDrops; k++) {
      const q = this.shards.find((x) => !x.on);
      if (!q) break;
      const drop = k >= nChunks;
      q.on = true;
      q.drop = drop;
      q.bounced = false;
      q.t0 = nowMs;
      q.delay = 0;
      q.drag = 5.5;
      q.life = (drop ? 280 + Math.random() * 130 : 380 + Math.random() * 200) * slow;
      q.size = drop ? 0.04 + Math.random() * 0.04 : 0.13 + Math.random() * 0.13;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.3;
      q.p.set(cx + Math.cos(a) * r, TILE_TOP + 0.12 + Math.random() * 0.3, cz + Math.sin(a) * r);
      const sp = (drop ? 2.6 : 1.7) + Math.random() * (drop ? 2.0 : 1.5);
      q.v.set(Math.cos(a) * sp, 2.4 + Math.random() * 1.8, Math.sin(a) * sp);
      q.w.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      q.mat.color.set(hex).lerp(WHITE, Math.random() * 0.3);
      q.mat.emissive.set(hex);
      q.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      q.mesh.geometry = drop ? this.dropGeo : this.shardGeo;
    }
  }

  /** Mô phỏng các mảnh thạch vỡ: trọng lực, nảy một lần trên sàn (mất năng lượng, trượt), rồi co lại và mờ dần. */
  private updateShards(nowMs: number): void {
    const slow = Number(new URLSearchParams(location.search).get('slowmo')) || 1;
    const dt = this.lastShardT ? Math.min(0.04, (nowMs - this.lastShardT) / 1000 / slow) : 0;
    this.lastShardT = nowMs;
    let live = false;
    for (const q of this.shards) {
      if (!q.on) continue;
      const e = (nowMs - q.t0 - q.delay) / q.life;
      if (e >= 1) {
        q.on = false;
        q.mesh.visible = false;
        continue;
      }
      live = true;
      if (e < 0) continue; // chưa tới lúc bắn
      // nổ ra nhanh rồi bị không khí hãm lại (tầm văng ngắn), trọng lực kéo xuống gắt cho cảm giác nặng tay
      const drag = Math.exp(-q.drag * dt);
      q.v.x *= drag;
      q.v.z *= drag;
      q.v.y -= 17 * dt;
      q.p.addScaledVector(q.v, dt);
      const floor = TILE_TOP + q.size * 0.5;
      if (q.p.y < floor) {
        q.p.y = floor;
        if (!q.bounced) {
          q.v.y = -q.v.y * 0.38;
          q.v.x *= 0.55;
          q.v.z *= 0.55;
          q.bounced = true;
        } else {
          q.v.set(q.v.x * 0.85, 0, q.v.z * 0.85);
          q.w.multiplyScalar(0.8);
        }
      }
      q.mesh.position.copy(q.p);
      q.mesh.rotation.x += q.w.x * dt;
      q.mesh.rotation.y += q.w.y * dt;
      q.mesh.rotation.z += q.w.z * dt;
      // co lại và mờ dần ở 35% cuối đời; mảnh vừa chạm sàn bẹp xuống một chút
      const shrink = e < 0.55 ? 1 : 1 - Math.pow((e - 0.55) / 0.45, 1.4);
      const flat = q.bounced && q.p.y <= floor + 0.002 ? 0.72 : 1;
      q.mesh.scale.set(q.size * shrink * (flat < 1 ? 1.12 : 1), q.size * shrink * flat, q.size * shrink * (flat < 1 ? 1.12 : 1));
      q.mat.opacity = 0.82 * Math.min(1, shrink * 1.4);
      q.mesh.visible = shrink > 0.03;
    }
    this.shardBusy = live;
  }

  /** Phun `n` hạt (3 sợi len : 1 búi xơ) từ vùng quanh (cx, cz); chúng bay về phía cửa theo hướng `pull`. `spread` là cỡ vùng phun (ô). */
  private spawnFx(cx: number, cz: number, pull: { x: number; y: number }, hex: string, n: number, nowMs: number, slow: number, spread = 0.8): void {
    // Cổng là máy xay: hạt trào ra từ PHÍA SAU cửa (mặt ngoài của thân cửa, dọc bề rộng cửa), vọt lên rồi rơi xuống phía sau.
    const len = Math.hypot(pull.x, pull.y) || 1;
    const ux = pull.x / len;
    const uz = pull.y / len;
    for (let k = 0; k < n; k++) {
      const isFiber = k % 4 !== 3;
      const pool = isFiber ? this.fibers : this.puffs;
      const q = pool.find((x) => !x.on);
      if (!q) break;
      q.on = true;
      q.t0 = nowMs;
      q.delay = Math.random() * 90 * slow;
      q.life = (520 + Math.random() * 300) * slow;
      const side = (Math.random() - 0.5) * spread;
      q.s.set(cx + ux * 0.62 + -uz * side, TILE_TOP + 0.5 + Math.random() * 0.3, cz + uz * 0.62 + ux * side); // phía SAU cửa (mặt ngoài của thân cửa)
      const back = 0.05 + Math.random() * 0.5; // rơi xa dần ra phía sau cửa
      q.t.set(q.s.x + ux * back + -uz * (Math.random() - 0.5) * 0.3, TILE_TOP + 0.04, q.s.z + uz * back + ux * (Math.random() - 0.5) * 0.3);
      q.a = (Math.random() - 0.5) * 1.6;
      q.b = 0.35 + Math.random() * 0.6;
      q.c = 0.6 + Math.random() * 0.8;
      if (isFiber) {
        const f = q as (typeof this.fibers)[number];
        f.spin = Math.random() * Math.PI * 2;
        f.mat.color.set(hex).lerp(WHITE, Math.random() * 0.35);
      } else {
        (q as (typeof this.puffs)[number]).mat.color.set(hex).lerp(WHITE, 0.55 + Math.random() * 0.3);
      }
    }
  }

  /** Khối bị cửa nuốt: ngay khi khối chui vào cửa, cửa bắn tung một loạt mảnh thạch ra (spawnShotgun), mỗi khối một phát. */
  private updateSuck(desc: SceneDesc, nowMs: number): void {
    for (const d of desc.balls) {
      const b = this.balls.get(d.id);
      if (!b || (d.pull.x === 0 && d.pull.y === 0)) continue;
      if (d.unravel > 0.25 && !this.shot.has(d.id)) {
        this.shot.add(d.id);
        const L = cellToWorld(this.level!.width, this.level!.height, d.x, d.y);
        this.spawnShotgun(L.x, L.z, d.pull, b.hex, nowMs);
      }
    }
    for (const id of [...this.shot]) {
      const bd = desc.balls.find((x) => x.id === id);
      if (!bd || bd.unravel <= 0) this.shot.delete(id);
    }
  }

  /** Gió hút: các vệt trắng mảnh từ trong bàn bay hội tụ vào cửa đang hút khối. */
  private updateWind(nowS: number): void {
    const N = 20;
    while (this.wind.length < N) {
      const mat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
      const mesh = new Mesh(new BoxGeometry(1, 1, 1), mat);
      mesh.renderOrder = 7;
      mesh.visible = false;
      this.dynamicGroup.add(mesh);
      const k = this.wind.length;
      this.wind.push({ mesh, mat, r1: ((k * 7919) % 97) / 97, r2: ((k * 104729) % 89) / 89, r3: ((k * 1299709) % 83) / 83 });
    }
    const w = this.windFor;
    for (const s of this.wind) {
      if (!w) {
        s.mesh.visible = false;
        continue;
      }
      const p = (nowS * (1.6 + s.r3 * 0.9) + s.r1) % 1; // 0 = xa cửa, 1 = tới cửa
      const f = 1 - p;
      const side = new Vector3(-w.gate.inward.z, 0, w.gate.inward.x);
      const lateral = (s.r2 - 0.5) * 1.9 * Math.pow(f, 1.1);
      const dist = 0.3 + 1.9 * Math.pow(f, 1.4);
      const y = TILE_TOP + 0.12 + s.r3 * 0.62 * (0.4 + 0.6 * f);
      const center = w.gate.pos.clone().addScaledVector(w.gate.inward, dist).addScaledVector(side, lateral);
      center.y = y;
      const len = 0.22 + 0.4 * p;
      s.mesh.position.copy(center);
      s.mesh.lookAt(center.clone().add(w.gate.inward));
      s.mesh.scale.set(0.016, 0.016, len);
      s.mat.opacity = Math.sin(Math.PI * p) * 0.75 * w.strength;
      s.mesh.visible = s.mat.opacity > 0.02;
    }
  }

  /** Ghim: đế nỉ kem, kim bạc dựng đứng, đầu tròn vàng; rơi xuống có nảy, hết hạn thì co lại. */
  private updatePins(pins: PinDesc[], nowMs: number): void {
    if (!this.level) return;
    const W = this.level.width;
    const H = this.level.height;
    while (this.pinPool.length < pins.length) {
      const g = this.wallGroup();
      g.visible = false;
      this.dynamicGroup.add(g);
      this.pinPool.push(g);
    }
    const FALL = 250 / 450; // 250 ms đầu (PIN_DROP_MS = 450 trong game.ts) là rơi; phần đầu của tiến độ là rơi, phần sau là bẹp xuống và nảy lại
    const alive = new Set<string>();
    this.pinPool.forEach((g, i) => {
      const d = pins[i];
      if (!d) {
        g.visible = false;
        return;
      }
      const p = cellToWorld(W, H, d.x, d.y);
      const key = `${d.x},${d.y}`;
      alive.add(key);
      const u = Math.min(1, Math.max(0, d.drop));
      let sy = 1;
      let fall = 0;
      if (u < FALL) {
        const f = u / FALL;
        fall = 3.6 * (1 - f * f); // rơi tự do: chậm lúc đầu, đập xuống với tốc độ lớn nhất
        sy = 1 + 0.16 * f * f; // kéo dài theo hướng rơi
      } else {
        const s = (u - FALL) / (1 - FALL);
        sy = 1 - 0.4 * Math.exp(-4 * s) * Math.cos(s * Math.PI * 2.5); // bẹp mạnh khi chạm đất rồi nảy tắt dần
        if (d.out === 0 && !this.pinLanded.has(key)) this.spawnImpact(p.x, p.z, key, nowMs);
      }
      if (u >= 1 && d.out === 0) this.pinLanded.add(key);
      g.visible = d.out < 0.995;
      g.position.set(p.x, TILE_TOP + fall, p.z);
      const wide = 1 + (1 - sy) * 0.7;
      g.scale.set(wide, sy, wide);
      g.scale.multiplyScalar(1 - d.out);
      g.rotation.y = (1 - Math.min(1, u / FALL)) * 1.6;
    });
    for (const k of [...this.pinLanded]) if (!alive.has(k)) this.pinLanded.delete(k);
  }

  /** Khối đập xuống sàn: sóng xung kích lan ra, mảnh vụn bắn tung, bàn rung và ô bị lún xuống một nhịp. */
  private spawnImpact(x: number, z: number, key: string, nowMs: number): void {
    this.pinLanded.add(key);
    let ring: Mesh;
    let mat: MeshBasicMaterial;
    const free = this.impacts.find((q) => nowMs - q.t0 > 600);
    if (free) {
      free.x = x;
      free.z = z;
      free.key = key;
      free.t0 = nowMs;
      ring = free.ring;
      mat = free.mat;
    } else {
      mat = new MeshBasicMaterial({ color: '#fff6dc', transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide });
      ring = new Mesh(new RingGeometry(0.34, 0.5, 40), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 6;
      this.dynamicGroup.add(ring);
      this.impacts.push({ x, z, key, t0: nowMs, ring, mat });
    }
    ring.position.set(x, TILE_TOP + 0.02, z);
    ring.visible = true;
    // mảnh vụn xám bắn ra theo vòng tròn, văng cao rồi rơi xuống nảy
    this.ensureShards();
    for (let k = 0; k < 26; k++) {
      const q = this.shards.find((c) => !c.on);
      if (!q) break;
      const drop = k % 3 === 0;
      const a = (k / 26) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 3 + Math.random() * 3.2;
      q.on = true;
      q.drop = drop;
      q.bounced = false;
      q.t0 = nowMs;
      q.delay = 0;
      q.drag = 4.5;
      q.life = 420 + Math.random() * 220;
      q.size = drop ? 0.03 + Math.random() * 0.03 : 0.07 + Math.random() * 0.09;
      q.p.set(x + Math.cos(a) * 0.4, TILE_TOP + 0.08, z + Math.sin(a) * 0.4);
      q.v.set(Math.cos(a) * sp, 2.2 + Math.random() * 2.6, Math.sin(a) * sp);
      q.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      q.mat.color.set('#cfd5de').lerp(WHITE, Math.random() * 0.4);
      q.mat.emissive.set('#8a919c');
      q.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      q.mesh.geometry = drop ? this.dropGeo : this.shardGeo;
      q.mesh.visible = false;
    }
  }

  private updateImpacts(nowMs: number): void {
    let busy = false;
    let sx = 0;
    let sy = 0;
    for (const q of this.impacts) {
      const e = (nowMs - q.t0) / 480;
      if (e >= 1) {
        if (q.ring.visible) {
          q.ring.visible = false;
          const t = this.tileMeshes.get(q.key);
          if (t) t.position.y = 0;
        }
        continue;
      }
      busy = true;
      const out = 1 - Math.pow(1 - e, 3);
      q.ring.scale.setScalar(0.5 + 3.4 * out);
      q.mat.opacity = 0.9 * (1 - e) * (1 - e);
      // rung bàn: nhát nẩy xuống rồi tắt dần
      const k = (1 - e) * (1 - e);
      sy += -0.07 * k * Math.cos(e * Math.PI * 4);
      sx += 0.035 * k * Math.sin(e * Math.PI * 9);
      const t = this.tileMeshes.get(q.key);
      if (t) t.position.y = -0.05 * k;
    }
    this.scene.position.set(sx, sy, 0);
    this.impactBusy = busy;
  }

  /** Vòng sáng nhấp nháy đánh dấu mục tiêu của booster đang chờ chọn. */
  private updateMarks(marks: MarkDesc[], nowS: number): void {
    if (!this.level) return;
    const W = this.level.width;
    const H = this.level.height;
    while (this.markPool.length < marks.length) {
      const m = new Mesh(new RingGeometry(0.22, 0.3, 36), new MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0.8, depthWrite: false, side: DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 6;
      m.visible = false;
      m.layers.enable(1);
      this.dynamicGroup.add(m);
      this.markPool.push(m);
    }
    this.markPool.forEach((m, i) => {
      const d = marks[i];
      if (!d) {
        m.visible = false;
        return;
      }
      const p = cellToWorld(W, H, d.x, d.y);
      const ph = 0.5 + 0.5 * Math.sin(nowS * 6 + (d.x + d.y) * 0.7);
      const big = d.kind === 'ball';
      m.visible = true;
      m.position.set(p.x, TILE_TOP + (big ? BALL.h + 0.05 : 0.015), p.z); // vòng quanh đỉnh khối để nhìn từ trên vẫn thấy
      m.scale.setScalar(big ? 1.7 + 0.18 * ph : 0.8 + 0.2 * ph);
      (m.material as MeshBasicMaterial).opacity = ((big ? 0.95 : 0.55) + (big ? 0.05 : 0.4) * ph) * this.focusAmount;
      (m.material as MeshBasicMaterial).color.set(big ? '#ffe45a' : '#ffd23f');
    });
  }

  /**
   * Bom thạch: quả cầu thạch hồng bóng có nắp kim loại và ngòi cong đang cháy; rơi xuống kèm bóng đổ trên sàn, chạm đất thì nảy bẹp một nhịp,
   * rồi nổ: chớp sáng, hai vòng sóng xung kích, các tia sáng toả ra, mảnh thạch văng (spawnBlast) và một vệt thạch loang trên sàn.
   */
  private updateBomb(b: BombDesc | null): void {
    if (!this.level) return;
    if (!this.bombFx) {
      const group = new Group();
      const body = new Group();
      const sphereMat = jellyMaterial('#ff4f86', 0.92);
      sphereMat.emissive = new Color('#ff2a6a');
      sphereMat.emissiveIntensity = 0.12;
      const sphere = new Mesh(new SphereGeometry(0.27, 28, 20), sphereMat);
      sphere.castShadow = true;
      // lõi sáng bên trong thạch
      const inner = new Mesh(new SphereGeometry(0.17, 18, 14), new MeshStandardMaterial({ color: '#ffd1e0', emissive: '#ff7aa8', emissiveIntensity: 0.6, roughness: 0.4 }));
      // nắp kim loại trên đỉnh và vành
      const metal = new MeshStandardMaterial({ color: '#8d97ad', metalness: 0.85, roughness: 0.3 });
      const cap = new Mesh(new CylinderGeometry(0.085, 0.1, 0.07, 16), metal);
      cap.position.y = 0.27;
      const collar = new Mesh(new TorusGeometry(0.1, 0.022, 8, 20), metal);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.245;
      // ngòi cong
      const fusePath = new CatmullRomCurve3([new Vector3(0, 0.3, 0), new Vector3(0.05, 0.4, 0), new Vector3(0.14, 0.44, 0), new Vector3(0.2, 0.4, 0)]);
      const fuse = new Mesh(new TubeGeometry(fusePath, 14, 0.016, 8, false), new MeshStandardMaterial({ color: '#7a4a22', roughness: 0.9 }));
      // tia lửa: quầng sáng cộng màu ở đầu ngòi
      const spark = new Sprite(new SpriteMaterial({ map: this.glowTexture(), color: '#ffa012', transparent: true, depthWrite: false }));
      spark.position.set(0.21, 0.41, 0);
      spark.scale.setScalar(0.3);
      // chấm sáng phản chiếu
      const shine = new Mesh(new SphereGeometry(1, 12, 8), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false }));
      shine.scale.set(0.09, 0.05, 0.05);
      shine.position.set(-0.12, 0.14, 0.2);
      shine.rotation.z = 0.7;
      body.add(sphere, inner, cap, collar, fuse, spark, shine);
      body.userData.base = 1.45; // quả bom to hơn cho dễ nhìn từ trên xuống

      const shadowMat = new MeshBasicMaterial({ color: '#000000', map: this.puddleTexture(), transparent: true, opacity: 0, depthWrite: false });
      const shadow = new Mesh(new PlaneGeometry(1, 1), shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.012;
      shadow.renderOrder = 1;

      const splatMat = new MeshBasicMaterial({ color: '#ff4f86', map: this.puddleTexture(), transparent: true, opacity: 0, depthWrite: false });
      const splat = new Mesh(new PlaneGeometry(1, 1), splatMat);
      splat.rotation.x = -Math.PI / 2;
      splat.position.y = 0.02;
      splat.renderOrder = 1;

      const flash = new Sprite(new SpriteMaterial({ map: this.glowTexture(), color: '#ffb02e', transparent: true, depthWrite: false, opacity: 0 }));
      flash.position.y = 0.3;
      flash.renderOrder = 8;

      const rings: { mesh: Mesh; mat: MeshBasicMaterial }[] = [];
      for (const col of ['#ff9f1c', '#ff3d7f']) {
        const mat = new MeshBasicMaterial({ color: col, map: this.softRingTexture(), transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
        const mesh = new Mesh(new PlaneGeometry(1, 1), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.05;
        mesh.renderOrder = 7;
        rings.push({ mesh, mat });
        group.add(mesh);
      }

      // tia sáng toả ra theo mặt sàn: dải mảnh dài, sáng ở đầu
      const streaks: { mesh: Mesh; mat: MeshBasicMaterial; a: number; len: number }[] = [];
      for (let k = 0; k < 12; k++) {
        const mat = new MeshBasicMaterial({ color: k % 2 ? '#ffb300' : '#ff5c8a', map: this.glowTexture(), transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
        const mesh = new Mesh(new PlaneGeometry(1, 1), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.09;
        mesh.renderOrder = 8;
        streaks.push({ mesh, mat, a: (k / 12) * Math.PI * 2 + (k % 2) * 0.13, len: 0.55 + 0.35 * ((k * 5) % 4) / 3 });
        group.add(mesh);
      }
      group.add(shadow, splat, body, flash);
      group.visible = false;
      this.dynamicGroup.add(group);
      this.bombFx = { group, body, sphere, sphereMat, spark, shadow, shadowMat, flash, rings, streaks, splat, splatMat, blasted: false };
    }
    const f = this.bombFx;
    if (!b) {
      f.group.visible = false;
      f.blasted = false;
      return;
    }
    const W = this.level.width;
    const H = this.level.height;
    const p = cellToWorld(W, H, b.x, b.y);
    f.group.visible = true;
    f.group.position.set(p.x, TILE_TOP, p.z);
    const nowS = performance.now() / 1000;
    if (b.t < BOMB_DROP_S) {
      // rơi: hơi kéo dài theo chiều rơi, xoay chậm, ngòi cháy chập chờn; bóng đổ nhỏ dần rồi đậm lên khi tới gần sàn
      const u = b.t / BOMB_DROP_S;
      f.blasted = false;
      f.spark.visible = true;
      f.body.visible = true;
      f.body.position.y = 0.39 + Math.pow(1 - u, 2) * 2.6;
      f.body.rotation.set(0, u * 4, Math.sin(u * 6) * 0.15);
      f.body.scale.set(1.45 * (1 - 0.08 * (1 - u)), 1.45 * (1 + 0.12 * (1 - u)), 1.45 * (1 - 0.08 * (1 - u)));
      f.sphereMat.emissiveIntensity = 0.12 + 0.1 * Math.sin(nowS * 30);
      f.spark.scale.setScalar(0.26 + 0.1 * Math.sin(nowS * 40));
      f.shadow.visible = true;
      f.shadow.scale.setScalar(0.35 + 0.65 * u);
      f.shadowMat.opacity = 0.5 * u;
      for (const r of f.rings) r.mesh.visible = false;
      for (const st of f.streaks) st.mesh.visible = false;
      f.splat.visible = false;
      f.flash.visible = false;
    } else {
      const t = b.t - BOMB_DROP_S;
      const u = Math.min(1, t / BOMB_BLAST_S);
      if (!f.blasted) {
        f.blasted = true;
        this.spawnBlast(p.x, p.z, performance.now());
      }
      // chạm đất: bẹp rồi phình lên ngay trước khi nổ (đầu 0.1s), sau đó biến mất trong chớp sáng
      const pre = Math.min(1, t / 0.1);
      f.body.visible = t < 0.1;
      f.body.position.y = 0.39;
      f.body.rotation.set(0, 0, 0);
      f.body.scale.set(1.45 * (1 + 0.25 * Math.sin(pre * Math.PI * 0.5)), 1.45 * (1 - 0.2 * Math.sin(pre * Math.PI * 0.5) + 0.65 * pre * pre), 1.45 * (1 + 0.25 * Math.sin(pre * Math.PI * 0.5)));
      f.sphereMat.emissiveIntensity = 0.12 + 1.6 * pre;
      f.spark.visible = false;
      f.shadowMat.opacity = 0.5 * (1 - Math.min(1, t / 0.15));
      // chớp sáng
      const fu = Math.min(1, t / 0.22);
      f.flash.visible = fu < 1;
      (f.flash.material as SpriteMaterial).opacity = (1 - fu) * 0.85;
      f.flash.scale.setScalar(0.7 + 2.2 * Math.sqrt(fu));
      // hai vòng sóng xung kích: vòng vàng đi nhanh, vòng hồng đi sau và chậm hơn
      f.rings.forEach((r, i) => {
        const ru = Math.max(0, Math.min(1, (t - i * 0.07) / (0.42 + i * 0.1)));
        r.mesh.visible = ru > 0 && ru < 1;
        const e = 1 - Math.pow(1 - ru, 3);
        r.mesh.scale.setScalar(0.5 + (3.4 - i * 0.5) * e);
        r.mat.opacity = (1 - ru) * (i ? 0.7 : 0.95);
      });
      // tia sáng toả ra rồi tắt
      const su = Math.min(1, t / 0.4);
      f.streaks.forEach((st) => {
        st.mesh.visible = su < 1;
        const e = 1 - Math.pow(1 - su, 2.4);
        const d = 0.25 + 1.5 * e;
        st.mesh.position.set(Math.cos(st.a) * d, 0.09, Math.sin(st.a) * d);
        st.mesh.rotation.set(-Math.PI / 2, 0, -st.a);
        st.mesh.scale.set(st.len * (0.5 + 0.8 * (1 - su)), 0.1 * (1 - su) + 0.02, 1);
        st.mat.opacity = (1 - su) * 0.9;
      });
      // vệt thạch loang trên sàn: nở ra nhanh rồi từ từ mờ
      f.splat.visible = true;
      f.splat.scale.setScalar(0.7 + 1.5 * (1 - Math.pow(1 - Math.min(1, t / 0.3), 3)));
      f.splatMat.opacity = 0.75 * (1 - u * u);
    }
  }

  private portalAnim: { disc: Mesh; ring: Mesh; speed: number; phase: number }[] = [];
  private arrowTex: CanvasTexture | null = null;
  private swirlTex: CanvasTexture | null = null;

  private arrowTexture(): CanvasTexture {
    if (this.arrowTex) return this.arrowTex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const c = cv.getContext('2d')!;
    // nền băng chuyền xanh dương bo góc
    c.beginPath();
    c.roundRect(14, 14, 228, 228, 44);
    const g = c.createLinearGradient(0, 14, 0, 242);
    g.addColorStop(0, '#5fa8ff');
    g.addColorStop(1, '#2f6fd6');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 10;
    c.strokeStyle = '#1b4aa0';
    c.stroke();
    // ba chevron trắng chỉ lên
    c.lineJoin = 'round';
    c.lineCap = 'round';
    for (const [dy, a] of [[62, 0.5], [18, 0.75], [-26, 1]] as const) {
      c.beginPath();
      c.moveTo(70, 168 + dy);
      c.lineTo(128, 112 + dy);
      c.lineTo(186, 168 + dy);
      c.lineWidth = 30;
      c.strokeStyle = `rgba(27,74,160,${a})`;
      c.stroke();
      c.lineWidth = 18;
      c.strokeStyle = `rgba(255,255,255,${a})`;
      c.stroke();
    }
    this.arrowTex = new CanvasTexture(c.canvas);
    this.arrowTex.colorSpace = SRGBColorSpace;
    this.arrowTex.anisotropy = 4;
    return this.arrowTex;
  }

  private swirlTexture(): CanvasTexture {
    if (this.swirlTex) return this.swirlTex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const c = cv.getContext('2d')!;
    c.translate(128, 128);
    // xoáy: các cung trắng cuộn vào tâm, mờ dần ra rìa
    for (let k = 0; k < 4; k++) {
      c.save();
      c.rotate((k / 4) * Math.PI * 2);
      c.beginPath();
      for (let t = 0; t <= 1; t += 0.04) {
        const r = 14 + 100 * t;
        const a = t * 3.6;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.lineWidth = 16;
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.stroke();
      c.restore();
    }
    const m = c.createRadialGradient(0, 0, 0, 0, 0, 128);
    m.addColorStop(0, 'rgba(255,255,255,1)');
    m.addColorStop(0.8, 'rgba(255,255,255,0.1)');
    m.addColorStop(1, 'rgba(255,255,255,0)');
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = m;
    c.fillRect(-128, -128, 256, 256);
    this.swirlTex = new CanvasTexture(c.canvas);
    this.swirlTex.colorSpace = SRGBColorSpace;
    return this.swirlTex;
  }

  /** Ô đặc biệt trên sàn: ô dính (vũng mật ong), ô mũi tên (băng chuyền), cổng dịch chuyển (xoáy sáng có vành). */
  private buildSpecials(level: Level): void {
    const W = level.width;
    const H = level.height;
    this.portalAnim = [];
    const top = TILE_TOP + 0.045;
    for (const q of level.sticky ?? []) {
      const p = cellToWorld(W, H, q.x, q.y);
      const g = new Group();
      g.position.set(p.x, TILE_TOP, p.z);
      // tấm mật ong phủ kín cả ô vuông: đáy cam đậm bo góc, lớp thạch vàng phồng lên bên trên, mép nhấp nhô nhẹ
      const base = new Mesh(new RoundedBoxGeometry(0.98, 0.06, 0.98, 3, 0.1), new MeshStandardMaterial({ color: '#e5870a', roughness: 0.5 }));
      base.position.y = 0.02;
      const blob = new Mesh(new RoundedBoxGeometry(0.9, 0.12, 0.9, 4, 0.14), jellyMaterial('#ffb42e', 0.95));
      blob.position.y = 0.08;
      blob.castShadow = false;
      g.add(base, blob);
      for (const [x, z, r] of [[-0.24, 0.2, 0.07], [0.26, -0.16, 0.05], [0.04, 0.3, 0.04], [-0.2, -0.26, 0.045], [0.3, 0.22, 0.035]] as const) {
        const bub = new Mesh(new SphereGeometry(r, 10, 8), new MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.85, depthWrite: false }));
        bub.position.set(x, 0.145, z);
        g.add(bub);
      }
      this.staticGroup.add(g);
    }
    for (const q of level.arrows ?? []) {
      const p = cellToWorld(W, H, q.x, q.y);
      const holder = new Group();
      holder.position.set(p.x, top, p.z);
      holder.rotation.y = q.dir === 'up' ? 0 : q.dir === 'right' ? -Math.PI / 2 : q.dir === 'down' ? Math.PI : Math.PI / 2;
      const m = new Mesh(new PlaneGeometry(0.92, 0.92), new MeshBasicMaterial({ map: this.arrowTexture(), transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 1;
      holder.add(m);
      this.staticGroup.add(holder);
    }
    (level.portals ?? []).forEach((pair, i) => {
      const col = ['#a05cff', '#19c7e8', '#ff9f1c'][i % 3];
      for (const [end, sgn] of [[pair.a, 1], [pair.b, -1]] as const) {
        const p = cellToWorld(W, H, end.x, end.y);
        const g = new Group();
        g.position.set(p.x, top, p.z);
        const base = new Mesh(new PlaneGeometry(0.95, 0.95), new MeshBasicMaterial({ color: col, map: this.puddleTexture(), transparent: true, opacity: 0.55, depthWrite: false }));
        base.rotation.x = -Math.PI / 2;
        base.renderOrder = 1;
        const disc = new Mesh(new PlaneGeometry(0.8, 0.8), new MeshBasicMaterial({ color: col, map: this.swirlTexture(), transparent: true, opacity: 0.95, depthWrite: false }));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.012;
        disc.renderOrder = 2;
        const ring = new Mesh(new TorusGeometry(0.4, 0.045, 10, 36), new MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.35 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.03;
        g.add(base, disc, ring);
        this.staticGroup.add(g);
        this.portalAnim.push({ disc, ring, speed: 1.6 * sgn, phase: i + (sgn > 0 ? 0 : 1.7) });
      }
    });
  }

  /** Cổng dịch chuyển xoáy liên tục và vành thở nhẹ. */
  private updateSpecials(nowS: number): void {
    for (const a of this.portalAnim) {
      a.disc.rotation.z = nowS * a.speed;
      const s = 1 + 0.05 * Math.sin(nowS * 3 + a.phase);
      a.ring.scale.set(s, s, s);
    }
  }

  private ensureGhost(): { group: Group; mat: MeshStandardMaterial } {
    if (!this.ghost) {
      const mat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, transparent: true, opacity: 0.45, depthWrite: false });
      const group = new Group();
      group.add(new Mesh(this.ballGeo, mat));
      group.renderOrder = 6;
      this.dynamicGroup.add(group);
      this.ghost = { group, mat };
    }
    return this.ghost;
  }

  private updateDots(line: SceneDesc['line'], amt = 1): void {
    if (!this.level) return;
    const W = this.level.width;
    const H = this.level.height;
    let n = 0;
    if (line) {
      // đường chấm theo từng đoạn thẳng (một đoạn khi không có mũi tên/cổng); đoạn dịch chuyển không vẽ chấm
      const pts = line.path && line.path.length > 1 ? line.path : [line.from, line.to];
      const skip = new Set(line.jumps ?? []);
      for (let sgi = 0; sgi < pts.length - 1; sgi++) {
        if (skip.has(sgi)) continue;
        const a = cellToWorld(W, H, pts[sgi].x, pts[sgi].y);
        const b = cellToWorld(W, H, pts[sgi + 1].x, pts[sgi + 1].y);
        const len = a.distanceTo(b);
        const count = pts.length > 2 ? Math.max(1, Math.round(len / 0.3)) : Math.max(0, Math.floor(len / 0.3) - 1);
        for (let i = pts.length > 2 ? 0 : 1; i < (pts.length > 2 ? count : count + 1); i++) {
          let dot = this.dots[n];
          if (!dot) {
            dot = new Mesh(this.dotGeo, new MeshBasicMaterial({ color: '#4a2a5a', transparent: true, opacity: 0.55 }));
            dot.renderOrder = 3;
            this.dynamicGroup.add(dot);
            this.dots.push(dot);
          }
          const t = (i * 0.3) / len;
          dot.position.set(a.x + (b.x - a.x) * t, TILE_TOP + 0.09, a.z + (b.z - a.z) * t);
          (dot.material as MeshBasicMaterial).opacity = 0.55 * amt;
          dot.visible = true;
          n++;
        }
      }
    }
    for (let i = n; i < this.dots.length; i++) this.dots[i].visible = false;
  }
}

/** Dựng một khối thạch: lõi sáng bên trong, vỏ thạch bán trong suốt bóng ướt, vài bọt khí và vệt sáng phản chiếu. */
let axisTex: CanvasTexture | null = null;

/** Hình mũi tên hai đầu (nằm ngang) trên mặt trên thạch một trục: trắng viền xanh đậm. */
function axisTexture(): CanvasTexture {
  if (axisTex) return axisTex;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const c = cv.getContext('2d')!;
  c.translate(128, 128);
  c.beginPath();
  c.moveTo(-108, 0);
  c.lineTo(-52, -52);
  c.lineTo(-52, -20);
  c.lineTo(52, -20);
  c.lineTo(52, -52);
  c.lineTo(108, 0);
  c.lineTo(52, 52);
  c.lineTo(52, 20);
  c.lineTo(-52, 20);
  c.lineTo(-52, 52);
  c.closePath();
  c.lineJoin = 'round';
  c.lineWidth = 16;
  c.strokeStyle = 'rgba(32,79,143,0.9)';
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.fill();
  axisTex = new CanvasTexture(cv);
  axisTex.colorSpace = SRGBColorSpace;
  axisTex.anisotropy = 4;
  return axisTex;
}

function makeBall(color: string, geo: BufferGeometry, axis?: 'h' | 'v', hidden?: boolean): BallObj {
  const hex = COLOR_HEX[color] ?? '#888888';
  const group = new Group();
  const body = jellyMaterial(hex, 0.78);
  const mesh = new Mesh(geo, body);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  const core = new MeshStandardMaterial({ color: new Color(hex).lerp(WHITE, 0.25), emissive: hex, emissiveIntensity: 0.3, roughness: 0.4 });
  const coreMesh = new Mesh(new RoundedBoxGeometry(BALL.w * 0.62, BALL.h * 0.6, BALL.w * 0.62, 4, 0.16), core);
  coreMesh.position.y = -0.04;
  group.add(coreMesh, mesh);
  // bọt khí nhỏ trong thạch
  const bubble = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false });
  for (const [x, y, z, r] of [[-0.22, 0.14, 0.2, 0.05], [0.24, -0.12, -0.18, 0.04], [0.1, 0.24, -0.24, 0.035], [-0.3, -0.2, -0.1, 0.03]] as const) {
    const bm = new Mesh(new SphereGeometry(r, 10, 8), bubble);
    bm.position.set(x, y, z);
    bm.renderOrder = 3;
    group.add(bm);
  }
  // vệt sáng phản chiếu trên mặt trên (góc trên trái)
  const shine = new Mesh(new SphereGeometry(1, 16, 10), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
  shine.scale.set(0.22, 0.02, 0.1);
  shine.position.set(-0.2, BALL.h / 2 + 0.005, -0.18);
  shine.rotation.y = 0.5;
  shine.renderOrder = 4;
  group.add(shine);
  // thạch một trục: mũi tên hai đầu in trên mặt trên, chỉ ra trục trượt (ngang hoặc dọc)
  if (axis) {
    const arrow = new Mesh(new PlaneGeometry(0.62, 0.62), new MeshBasicMaterial({ map: axisTexture(), transparent: true, depthWrite: false }));
    arrow.rotation.x = -Math.PI / 2;
    arrow.renderOrder = 5;
    const holder = new Group();
    holder.add(arrow);
    holder.rotation.y = axis === 'v' ? Math.PI / 2 : 0;
    holder.position.y = BALL.h / 2 + 0.012;
    group.add(holder);
  }
  // thạch ẩn: dấu ? trắng viền tối phủ lên mặt trên, mờ đi khi lộ màu
  let q: Mesh | undefined;
  if (hidden) {
    q = new Mesh(new PlaneGeometry(0.6, 0.6), new MeshBasicMaterial({ map: questionTexture(), transparent: true, depthWrite: false }));
    q.rotation.x = -Math.PI / 2;
    q.position.y = BALL.h / 2 + 0.014;
    q.renderOrder = 5;
    group.add(q);
  }
  return { hex, q, group, body, core, mesh, un: noUnravel() };
}

let questionTex: CanvasTexture | null = null;

/** Dấu ? trắng viền xanh đậm cho thạch ẩn. */
function questionTexture(): CanvasTexture {
  if (questionTex) return questionTex;
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const c = cv.getContext('2d')!;
  c.font = '110px "Lilita One", system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = 16;
  c.strokeStyle = 'rgba(32,79,143,0.95)';
  c.strokeText('?', 64, 70);
  c.fillStyle = '#ffffff';
  c.fillText('?', 64, 70);
  questionTex = new CanvasTexture(cv);
  questionTex.colorSpace = SRGBColorSpace;
  return questionTex;
}

let snapRenderer: WebGLRenderer | null = null;
const snapCache = new Map<string, HTMLCanvasElement>();

/**
 * Ảnh chụp một khối len 3D (nền trong suốt), dùng làm hình minh hoạ ở popup. Vẽ một lần cho mỗi màu rồi nhớ lại.
 * Trả về null nếu không có WebGL.
 */
export function ballSnapshot(color: string, size = 256): HTMLCanvasElement | null {
  const key = `${color}@${size}`;
  const hit = snapCache.get(key);
  if (hit) return hit;
  try {
    if (!snapRenderer) {
      const cv = document.createElement('canvas');
      snapRenderer = new WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
      snapRenderer.setClearColor(0x000000, 0);
    }
    snapRenderer.setSize(size, size, false);
    const sc = new Scene();
    sc.add(new HemisphereLight(0xeef4ff, 0xa28fc0, 1.7));
    const light = new DirectionalLight(0xfff0dc, 2.6);
    light.position.set(-3, 5, 4);
    sc.add(light);
    const geo = new RoundedBoxGeometry(BALL.w, BALL.h, BALL.w, 6, 0.27);
    const ball = makeBall(color, geo);
    ball.group.rotation.y = -0.55;
    sc.add(ball.group);
    const cam = new PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0.9, 2.1, 2.3);
    cam.lookAt(0, -0.02, 0);
    snapRenderer.render(sc, cam);
    const out = document.createElement('canvas');
    out.width = out.height = size;
    out.getContext('2d')!.drawImage(snapRenderer.domElement, 0, 0);
    disposeTree(ball.group);
    geo.dispose();
    snapCache.set(key, out);
    return out;
  } catch {
    return null;
  }
}

const iconCache = new Map<string, HTMLCanvasElement>();

/**
 * Icon booster 3D tối giản: vài khối hình học đơn giản, màu phẳng, ánh sáng mềm, không viền. Vẽ một lần cho mỗi booster rồi nhớ lại.
 * Ý tưởng: Block = khối xám có dấu + vàng; Bomb = quả thạch có bốn mũi tên bắn ra; Magnet = khối thạch bị hút vào cửa đỏ;
 * Wild Jar = cửa cầu vồng. Null nếu không có WebGL.
 */
export function boosterIconSnapshot(key: 'pin' | 'bomb' | 'magnet' | 'basket', size = 256): HTMLCanvasElement | null {
  const ck = `${key}@${size}`;
  const hit = iconCache.get(ck);
  if (hit) return hit;
  try {
    if (!snapRenderer) {
      const cv = document.createElement('canvas');
      snapRenderer = new WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
      snapRenderer.setClearColor(0x000000, 0);
    }
    snapRenderer.setPixelRatio(1);
    snapRenderer.setSize(size, size, false);
    const sc = new Scene();
    sc.add(new HemisphereLight(0xffffff, 0x9fb4e0, 1.5));
    const dl = new DirectionalLight(0xffffff, 2.2);
    dl.position.set(-2, 4, 5);
    sc.add(dl);
    const mat = (c: string, rough = 0.45): MeshStandardMaterial => new MeshStandardMaterial({ color: c, roughness: rough });
    const gloss = (c: string): MeshPhysicalMaterial => new MeshPhysicalMaterial({ color: c, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 });
    const g = new Group();
    const add = (geo: BufferGeometry, m: Material, x = 0, y = 0, z = 0): Mesh => {
      const o = new Mesh(geo, m);
      o.position.set(x, y, z);
      g.add(o);
      return o;
    };
    const rbox = (w: number, h: number, d: number, r: number): BufferGeometry => new RoundedBoxGeometry(w, h, d, 4, r);
    const tri = (r: number, depth: number): BufferGeometry => {
      const sh = new Shape();
      sh.moveTo(0, r);
      sh.lineTo(r * 0.87, -r * 0.5);
      sh.lineTo(-r * 0.87, -r * 0.5);
      sh.closePath();
      return new ExtrudeGeometry(sh, { depth, bevelEnabled: false });
    };
    if (key === 'pin') {
      add(new BoxGeometry(1.5, 1.5, 1.5), mat('#bcc3ce', 0.55));
      add(new BoxGeometry(0.95, 0.27, 0.1), mat('#ffc93c', 0.35), 0, 0, 0.78);
      add(new BoxGeometry(0.27, 0.95, 0.1), mat('#ffc93c', 0.35), 0, 0, 0.78);
      g.rotation.set(0.42, -0.5, 0);
    } else if (key === 'bomb') {
      add(new SphereGeometry(0.62, 40, 28), gloss('#ff5c9a'));
      const ring = add(new TorusGeometry(0.88, 0.05, 12, 48), mat('#ffd1e3', 0.3));
      ring.rotation.x = 0;
      for (const [x, y, rz] of [[0, 1.18, 0], [0, -1.18, Math.PI], [1.18, 0, -Math.PI / 2], [-1.18, 0, Math.PI / 2]] as const) {
        const c = add(new ConeGeometry(0.26, 0.55, 20), gloss('#ff8ab8'), x, y, 0);
        c.rotation.z = rz;
      }
      g.rotation.set(0.25, -0.3, 0);
    } else if (key === 'magnet') {
      const door = add(rbox(1.15, 1.9, 0.45, 0.1), gloss('#e8365c'), 0.75, 0, -0.1);
      door.rotation.y = 0;
      const t = add(tri(0.32, 0.06), mat('#ffffff', 0.4), 0.75, 0.15, 0.13);
      t.rotation.z = 0;
      add(rbox(0.85, 0.85, 0.85, 0.28), gloss('#ffc93c'), -0.75, -0.25, 0.1);
      for (const [y, w] of [[0.35, 0.7], [-0.25, 0.9], [-0.85, 0.7]] as const) add(rbox(w, 0.09, 0.09, 0.04), mat('#ffffff', 0.4), -1.55 - w * 0.1, y, 0.1);
      g.position.x = 0.1;
      g.scale.setScalar(0.82);
      g.rotation.set(0.28, -0.25, 0);
    } else {
      add(rbox(1.9, 1.9, 0.45, 0.1), mat('#ffffff', 0.5), 0, 0, -0.05);
      const cols = ['#ff4d6a', '#ff9a3c', '#ffd93b', '#4fd04a', '#2fb9e8', '#8a63ff'];
      cols.forEach((c, i) => add(new BoxGeometry(0.26, 1.7, 0.1), mat(c, 0.35), -0.65 + i * 0.26, 0, 0.2));
      const t = add(tri(0.38, 0.06), mat('#ffffff', 0.4), 0, 0.05, 0.28);
      t.rotation.z = 0;
      g.rotation.set(0.28, -0.3, 0);
    }
    sc.add(g);
    const cam = new PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0, 0.2, 5.6);
    cam.lookAt(0, 0, 0);
    snapRenderer.render(sc, cam);
    const out = document.createElement('canvas');
    out.width = out.height = size;
    out.getContext('2d')!.drawImage(snapRenderer.domElement, 0, 0);
    disposeTree(g);
    iconCache.set(ck, out);
    return out;
  } catch {
    return null;
  }
}
