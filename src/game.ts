// Jelly Slide — game thạch. Lõi luật ở src/core, phần vẽ ở src/render.ts;
// file này nối trạng thái, vuốt, hoạt ảnh và hợp đồng FalconGame.

import { armWild, createState, gateCell, gateKey, gateOpen, isEmptyCell, isPinnable, trailLeft, magnetGate, placeBomb, placePin, slide, status, undo, undoDir, useMagnet, type BoosterMove, type BoosterResult, type Dir, type MoveResult, type Pos, type State } from './core/rules';
import { BOOSTERS, UNLOCK_GIFT, add as addBooster, countOf, defOf, isGranted, logUse, spend, unlockLevel, unlocksAt, watchAdFor, type BoosterKey } from './boosters';
import { drawBoosterIcon, drawBoosterSlot, drawCoin, type BoosterSlotState } from './booster-art';
import { drawBrokenHeart } from './heart';
import { Confetti } from './confetti';
import { LOGO_IMPACT_MS, LOGO_LETTER_HITS_MS, drawLogo, logoFlash } from './logo';
import { ImpactFx } from './impactfx';
import { configureAudio, duckMusic, play, refreshMusic, renderAllStats, renderMusicStats, renderStats, resumeAudio, suspendAudio, unlockAudio } from './sfx';
import { cssBox, cssText, drawCssPopup, type CssPopupSpec } from './css-ui';
import { createFalconEvents, type FalconGame } from './falcon-game';
import { LEVELS } from './levels';
import { buildTutorial, type TutStep } from './tutorial';
import { featureProgress, type Feature } from './features';
import * as K from './ui-kit';
import { loadFonts } from './fonts';
import { IDENTITY, anticipationPose, impactPose, slideEase, type Pose } from './motion';
import { BOMB_DROP_S, BoardScene, ballSnapshot, type BallDesc, type GateDesc, type MarkDesc, type PinDesc, type SceneDesc, type TrailDesc } from './scene3d';
import { createSettings } from './settings';
import { theme } from './ui-kit';
import * as R from './render';

export const LEVEL_COUNT = LEVELS.length;

const canvas = document.getElementById('game') as HTMLCanvasElement; // lớp giao diện 2D (trên cùng, nhận chạm)
const ctx = canvas.getContext('2d')!;
const bgCanvas = document.getElementById('bg') as HTMLCanvasElement; // nền chần bông, vẽ một lần mỗi khi đổi kích thước
const bgCtx = bgCanvas.getContext('2d')!;
const sceneCanvas = document.getElementById('scene') as HTMLCanvasElement; // bàn chơi 3D (WebGL)

/** Cảnh 3D của bàn chơi. null nếu thiết bị không có WebGL (khi đó chỉ thấy nền và giao diện). */
let scene: BoardScene | null = null;
try {
  scene = new BoardScene(sceneCanvas);
} catch (e) {
  console.error('WebGL không khả dụng:', e);
}
const events = createFalconEvents();

/** Nhạc, âm thanh, rung của người chơi, nhớ qua các lần mở (cùng cách đặt khoá với falcon-game.ts). */
const settings = createSettings(
  (() => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  })(),
  `${import.meta.env.VITE_FALCON_GAME_ID ?? 'dev'}_settings`,
);

// Âm thanh theo cài đặt Sound/Music của người chơi; trình duyệt chỉ cho phát sau lần chạm đầu tiên nên mở khoá ở mọi lần chạm.
configureAudio({ sound: () => settings.get('sound'), music: () => settings.get('music') });
window.addEventListener('pointerdown', unlockAudio, true);

/** Rung ngắn khi có phản hồi (nếu thiết bị hỗ trợ và người chơi bật rung). */
function buzz(pattern: number | number[]): void {
  if (!settings.get('haptic')) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* thiết bị không cho rung */
  }
}

/** Khoảng cách chuẩn giữa các khối giao diện: thanh trên, bàn chơi, thanh dưới. */
const GAP = 16;
/** Chiều cao phần nội dung của thanh trên (Level, mascot, Moves). */
const TOP_CONTENT = 128;
/** Chiều cao thanh dưới. Các nút booster và cài đặt nằm chính trên đường kẻ vàng ở mép trên của thanh này. */
const BOTTOM_BAR_H = 72;
/** Các nút (cả vành vàng) nhô lên trên mép thanh dưới bao nhiêu px; bàn chơi chừa chỗ cho phần này. */
const BTN_OVER = 31;
/** Chiều cao thật của thanh trên = nội dung + vùng an toàn phía trên của thiết bị (tai thỏ), cập nhật bởi measureInsets. */
let TOP_BAR_H = TOP_CONTENT;
let safeTop = 0;

/** Đo vùng an toàn phía trên qua CSS env(). Phía dưới không cần: phần thanh dưới dưới các nút đã đủ cao. */
function measureInsets(): void {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px)';
  document.body.appendChild(probe);
  safeTop = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  TOP_BAR_H = TOP_CONTENT + safeTop;
}
const DISSOLVE_MS = 650;
const GROW_MS = 320; // vệt mới mọc ra
const LOOSEN_MS = 520; // vệt đặc chuyển sang đan lỏng
const ease01 = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};
let trailMem = new Map<string, { born: number; loose: number | null }>();
/** Có chuyển tiếp của vệt đang chạy: cần vẽ tiếp khung sau. */
let trailBusy = false;
/** Nhún trước khi phóng (ms). */
/** Chỉ để thử: ?slowmo=6 làm hoạt ảnh chậm 6 lần để chụp từng khung. */
const SLOW = Math.max(1, Number(new URLSearchParams(location.search).get('slowmo')) || 1);
const ANTIC_MS = 55 * SLOW;
const UNRAVEL_MS = 300 * SLOW; // thời gian khối tan thành sợi khi vào cửa

const DELTA: Record<Dir, Pos> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Một ô thân rắn: ô vệt của khối đang bị hút ra, theo thứ tự khối đã đi qua. */
interface SnakeCell extends Pos {
  turn: number;
  /** Số lượt vệt còn chặn lúc trước khi bị kéo đi (quyết định dạng đan dày hay lỏng). */
  left: number;
}

interface Anim {
  id: string;
  color: string;
  pts: Pos[];
  t0: number;
  /** Tổng thời gian hoạt ảnh (khối trượt + vệt bị kéo vào giỏ). */
  dur: number;
  /** Thời gian khối trượt; sau đó khối ẩn đi. */
  moveDur: number;
  exit: boolean;
  /** Cửa đang hút (`${cạnh}${chỉ số}`), rỗng nếu không thoát. */
  gateKey?: string;
  /** Hướng từ ô cuối tới cửa đang hút (khác hướng vuốt khi khối rẽ vào cửa ở cạnh khác). */
  exitDir?: { x: number; y: number };
  /** Thời gian nhún trước khi phóng (ms), nằm trước moveDur. 0 với hoàn tác. */
  antic: number;
  /** Hướng đi (dx, dy tính theo ô). */
  dirV: Pos;
  /** Chỉ có khi khối dừng vì vật cản: độ mạnh cú va và khối khác bị đụng (nếu có). */
  impact?: { amp: number; bumpId: string | null; /** Ô vệt bị đâm: nảy lại (độ mạnh và độ trễ ms). */ bumpCells?: { x: number; y: number; amp: number; delay: number }[]; /** Thạch liền kề thạch bị đâm: nảy theo sau. */ bumpExtra?: { id: string; amp: number; delay: number }[] };
  /** Chỉ có khi khối bị hút ra: vệt của nó bị kéo vào giỏ như con rắn. */
  snake?: { cells: SnakeCell[]; side: Dir; pullStart: number; pullDur: number };
  /** Lượt của cú trượt đang diễn ra (null với hoàn tác và booster): vệt của nó hiện dần theo đường đi. */
  turn: number | null;
  /** Nam châm: khối vọt lên theo cung cao chừng này (ô) khi bay xuyên vật cản. */
  arc?: number;
  /** Nam châm: khối bị hút, vận tốc tăng dần cho tới khi vào cổng. */
  accel?: boolean;
  /** Chỉ số các đoạn của `pts` là dịch chuyển qua cổng: khối co lại ở ô vào rồi hiện ra ở ô ra, không bay ngang bàn. */
  jumps?: number[];
}

let index = 0;
let state: State = createState(LEVELS[0].level);
let paused = false;
let ended = false;
let anim: Anim | null = null;
/** `tight`: vệt còn mới (cao, đặc) hay đã lỏng. `show`: mốc (ms) vệt xuất hiện nếu nó vừa được tạo trong cú trượt thoát (0 = đã có sẵn). */
let dissolves: { x: number; y: number; seed: number; t0: number; color: string; ref: Pos | null; b0: number; b1: number; tight: boolean; show: number }[] = [];
/** Ô của phần sợi chỉ đứt: giữ nguyên cả đợt hết hạn để đường chỉ không bị dựng lại giữa chừng (đoạn đã tan sẽ hiện lại). */
let threadDying: { color: string; x: number; y: number; seed: number; b1: number }[] = [];
const UNPICK_STEP_MS = 95; // mỗi ô vệt bắt đầu gỡ muộn hơn ô xa hơn một nhịp
/** Hiệu ứng nảy sau va chạm: 'hit' cho khối đâm vào vật cản, 'bump' cho khối bị khối khác đâm vào. */
let impacts: { id: string; dx: number; dy: number; t0: number; amp: number; kind: 'hit' | 'bump' }[] = [];
let drag: { id: string; sx: number; sy: number; dir: Dir | null } | null = null;
let shake: { id: string; t0: number } | null = null;

// ---------- Booster ----------
/** Booster đang chờ người chơi chọn mục tiêu. */
let armed: BoosterKey | null = null;
/** Bom đang rơi và nổ: chặn thao tác cho tới khi xong. Trạng thái chỉ đổi vào lúc nổ. */
let fx: { kind: 'bomb'; x: number; y: number; t0: number; result: Extract<BoosterResult, { ok: true }>; applied: boolean } | null = null;
/** Khối bị bom đẩy: bay từ ô cũ sang ô mới trong PUSH_MS dù trạng thái đã ở ô mới. */
const pushAnims = new Map<string, { from: Pos; to: Pos; t0: number }>();
const PUSH_MS = 280;
const PIN_DROP_MS = 450;
const PIN_OUT_MS = 380;
const pinMem = new Map<string, number>();
let pinDying: { x: number; y: number; t0: number }[] = [];
let pinBusy = false;
let toast: { text: string; until: number } | null = null;
let newQueue: BoosterKey[] = [];
/** Mechanic sắp được giới thiệu bằng popup ở level này (hiện sau các popup booster mới). */
let pendingMech: string | null = null;
const mechSeenKey = `${import.meta.env.VITE_FALCON_GAME_ID ?? 'dev'}_mechseen`;
function mechSeen(k: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(mechSeenKey) ?? '[]') as string[]).includes(k);
  } catch {
    return false;
  }
}
function markMechSeen(k: string): void {
  try {
    const a = new Set<string>(JSON.parse(localStorage.getItem(mechSeenKey) ?? '[]'));
    a.add(k);
    localStorage.setItem(mechSeenKey, JSON.stringify([...a]));
  } catch {
    /* không lưu được thì lần sau popup hiện lại */
  }
}

// ---------- Hướng dẫn cưỡng bức ----------
// Các level dạy thao tác/booster: chỉ cho đúng một thao tác mỗi bước, bàn tay chỉ vào chỗ cần làm, phần còn lại tối đi như lúc chọn mục tiêu booster.
let tut: { steps: TutStep[]; i: number } | null = null;
/** Mức tập trung 0..1 của hướng dẫn (chạy dần về đích), bước đang hiển thị (giữ lại khi tắt dần) và mốc bắt đầu hoạt ảnh bàn tay. */
let tutAmt = 0;
let tutShow: TutStep | null = null;
let tutT0 = 0;
let tutNudgeT = -1e9;
const tutDoneKey = `${import.meta.env.VITE_FALCON_GAME_ID ?? 'dev'}_tutdone`;
function tutDoneSet(): Set<number> {
  try {
    return new Set<number>(JSON.parse(localStorage.getItem(tutDoneKey) ?? '[]'));
  } catch {
    return new Set();
  }
}
function tutMarkDone(i: number): void {
  try {
    const d = tutDoneSet();
    d.add(i);
    localStorage.setItem(tutDoneKey, JSON.stringify([...d]));
  } catch {
    /* không lưu được thì lần sau hướng dẫn hiện lại */
  }
}
const tutCur = (): TutStep | null => (tut ? tut.steps[tut.i] ?? null : null);
/** Bước đã xong: sang bước kế, hết bước thì ghi nhận đã học. */
function tutAdvance(kind: TutStep['kind'], key?: BoosterKey): void {
  const st = tutCur();
  if (!tut || !st || st.kind !== kind || (st.kind === 'booster' && st.key !== key)) return;
  tut.i++;
  play('tutorialStep');
  tutT0 = performance.now();
  if (tut.i >= tut.steps.length) {
    tutMarkDone(index);
    tut = null;
  }
}
/** Người chơi làm sai bước: khung chữ nảy một nhịp. */
function tutNudge(): void {
  tutNudgeT = performance.now();
  invalidate();
}
/** Luồng sáng của Chọn giỏ: bay từ nút booster tới cổng được chọn, tới nơi thì cổng chớp sáng và đổi sang cầu vồng. */
/** Cú cắn của cửa vừa nuốt khối: giữ riêng để chạy hết dù hoạt ảnh thoát đã kết thúc. */
let gateKick: { key: string; t0: number } | null = null;
let wildFx: { key: string; side: Dir; index: number; depth?: number; slotIdx: number; t0: number } | null = null;
const WILD_FLY_MS = 520;
const WILD_BURST_MS = 400;
const easeOutBack = (u: number): number => 1 + 2.70158 * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2);
let raf = 0;
/** Biểu cảm của mascot: phản ứng ngắn khi khối vào giỏ; thắng/thua thì giữ tới khi sang level khác. */
let endedAt = 0;
// ---------- Luồng thua ----------
// Hết lượt: chữ "Out of Moves" bay từ trên xuống giữa màn (outback nhẹ), giữ, thụt lại (inback nhẹ) rồi bay xuống dưới; sau đó popup "Continue" mời thêm
// 5 lượt (một lần mỗi level). Huỷ, hoặc hết lượt lần nữa thì mới tính thua: popup "Fail" với trái tim vỡ và nút Restart.
const REVIVE_MOVES = 5;

/** Các "tính năng mới" theo level mở khoá (mechanic và booster) cho thanh tiến trình ở popup thắng. Thêm mechanic mới vào đây khi làm xong. */
/** Mô tả các mechanic để hiện ở popup giới thiệu. Thêm mechanic mới vào đây (cùng `introduces` trong kịch bản). */
const MECHANICS: Record<string, { name: string; desc: string }> = {
  axis: { name: 'Thạch một trục', desc: 'Thạch này chỉ trượt theo mũi tên của nó.' },
  hidden: { name: 'Thạch ẩn', desc: 'Màu của nó được giấu cho tới khi nó di chuyển.' },
  arrows: { name: 'Ô mũi tên', desc: 'Thạch đi qua sẽ rẽ theo mũi tên.' },
  portals: { name: 'Cổng dịch chuyển', desc: 'Vào cổng này, ra ở cổng kia.' },
  sticky: { name: 'Ô dính', desc: 'Thạch chạm vào là dừng lại ngay.' },
  frozen: { name: 'Thạch đóng băng', desc: 'Đâm một thạch khác vào để làm vỡ băng.' },
  lock: { name: 'Cổng đóng băng', desc: 'Chỉ mở sau khi có thạch ra ở cổng khác.' },
  rhythm: { name: 'Cổng theo nhịp', desc: 'Chỉ mở ở lượt lẻ hoặc lượt chẵn.' },
};
const FEATURES: Feature[] = [
  { level: 6, kind: 'mechanic', key: 'axis', name: MECHANICS.axis.name },
  { level: 22, kind: 'mechanic', key: 'hidden', name: MECHANICS.hidden.name },
  { level: 26, kind: 'mechanic', key: 'arrows', name: MECHANICS.arrows.name },
  { level: 31, kind: 'mechanic', key: 'portals', name: MECHANICS.portals.name },
  { level: 36, kind: 'mechanic', key: 'sticky', name: MECHANICS.sticky.name },
  // (giai đoạn 2, chưa có level) { level: 51, kind: 'mechanic', key: 'frozen', name: MECHANICS.frozen.name },
  // (giai đoạn 2, chưa có level) { level: 56, kind: 'mechanic', key: 'lock', name: MECHANICS.lock.name },
  // (giai đoạn 2, chưa có level) { level: 61, kind: 'mechanic', key: 'rhythm', name: MECHANICS.rhythm.name },
  ...BOOSTERS.map((b): Feature => ({ level: b.unlock, kind: 'booster', key: b.key, name: b.name })),
];
const OOM_DELAY_MS = 250; // chờ khối vào giỏ/hoạt ảnh xong rồi chữ mới bay vào
const OOM_IN_MS = 300;
const OOM_HOLD_MS = 700;
const OOM_OUT_MS = 270;
let loseBanner: { t0: number } | null = null;
// ---------- Luồng thắng ----------
// Nhịp: chữ vào (chồng lên nhau) → logo co lại lấy đà → phồng → ĐẬP xuống (haptic) → giữ ngắn → logo thu nhỏ → popup Next Level, lúc đó pháo giấy
// mới bắn từ hai góc dưới (trái, phải, rồi loạt vọng). Chạm màn hình sau cú đập là bỏ qua tới popup.
const WIN_DELAY_MS = 380; // chờ khối vào giỏ xong
const WIN_RIGHT_MS = 160; // pháo phải sau pháo trái (tính từ lúc popup thắng hiện)
const WIN_EXIT_START_MS = LOGO_IMPACT_MS + 300; // giữ 0.3s sau cú đập rồi thu logo
const WIN_EXIT_MS = 280;
const WIN_TOTAL_MS = WIN_EXIT_START_MS + WIN_EXIT_MS;
// ---------- Chủ đề màu theo độ khó ----------
// Màn thường xanh, màn khó đỏ, màn siêu khó tím: nền và HUD xoay sắc độ dần (không đổi ngay) khi vào level.
const THEME_HUE = { easy: 0, medium: 0, hard: 142, super: 58 } as const;
let themeTarget = 0;
let themeBgHue = 0; // sắc độ đã dùng để vẽ nền lần gần nhất
let winShow: { t0: number; bursts: number; letters: number } | null = null;
/** Lớp phụ để làm mờ cả logo một lần lúc kết thúc. */
let logoLayer: HTMLCanvasElement | null = null;
/** Pháo giấy của popup thắng: bắn trái, phải rồi loạt vọng, tính từ lúc popup hiện. */
let winConfetti: { t0: number; bursts: number } | null = null;
const confetti = new Confetti();
const impactFx = new ImpactFx();
/** Đã dùng lượt mời thêm trong level này chưa. */
let revived = false;
let sized = '';
/** Khoá của khung nhìn đã dựng (kích thước, thanh trên/dưới); đổi thì dựng lại camera. */
let viewKey = '';

scene?.setLevel(state.level);

const cellKey = (p: Pos) => `${p.x},${p.y}`;
const colorOf = (id: string) => state.level.balls.find((b) => b.id === id)?.color ?? 'pink';

/** Màu của khối đã để lại vệt tạo ở lượt `turn` (tra qua lịch sử cú trượt của từng khối). */
/** Khoá của cửa ở cạnh `side` chứa ô `at` (cửa mà khối đứng ở ô đó bị hút vào). */
function gateKeyAt(level: State['level'], side: Dir, at: Pos): string {
  const g = level.gates.find((q) => q.side === side && gateCell(level, q).x === at.x && gateCell(level, q).y === at.y);
  return g ? gateKey(g) : '';
}

function colorForTurn(s: State, turn: number): string {
  for (const [id, recs] of Object.entries(s.history)) {
    if (recs.some((r) => r.turn === turn)) return s.level.balls.find((b) => b.id === id)?.color ?? 'pink';
  }
  return 'pink';
}

// ---------- Trạng thái hiển thị của vệt ----------

interface VisibleTrail extends Pos {
  turn: number;
  /** Số lượt vệt còn chặn. */
  left: number;
}

/** Vệt còn hiệu lực ở nước đi kế tiếp, mỗi ô lấy vệt mới nhất. */
function visibleTrails(s: State): VisibleTrail[] {
  const byCell = new Map<string, VisibleTrail>();
  for (const t of s.trails) {
    const left = trailLeft(s, t); // số nước đi nữa vệt còn chặn, theo đồng hồ của level ('turn' hoặc 'owner')
    if (left <= 0) continue;
    const k = cellKey(t);
    const prev = byCell.get(k);
    if (!prev || t.turn > prev.turn) byCell.set(k, { x: t.x, y: t.y, turn: t.turn, left });
  }
  return [...byCell.values()];
}

/** `skip`: các ô vệt biến mất nhưng đã có hoạt ảnh riêng (bị kéo vào giỏ), không cần hiệu ứng xổ chỉ. */
/** Khối thoát qua cửa: mọi vệt của nó (cũ lẫn vệt `extra` của cú trượt vừa rồi) vỡ thành MỘT chuỗi, từ ô xa cửa nhất về phía cửa. */
interface ExitChain {
  door: Pos;
  extra?: typeof dissolves;
}
const EXIT_STEP_MS = 40;

function setState(next: State, skip?: Set<string>, delayMs = 0, chain?: ExitChain): void {
  const after = new Set(visibleTrails(next).map(cellKey));
  // Vệt hết hạn được gỡ chỉ: ô xa khối nhất bắt đầu trước, lần lượt về phía khối đang giữ sợi.
  const batch: typeof dissolves = [];
  for (const t of visibleTrails(state)) {
    if (after.has(cellKey(t)) || skip?.has(cellKey(t))) continue;
    const color = colorForTurn(state, t.turn);
    const id = Object.keys(next.balls).find((bid) => state.level.balls.find((b) => b.id === bid)?.color === color);
    batch.push({ x: t.x, y: t.y, seed: t.turn, t0: performance.now() + delayMs, color, ref: id ? { ...next.balls[id] } : null, b0: 0, b1: 0, tight: t.left >= 2 || state.level.trailLife === 1, show: 0 });
  }
  if (chain?.extra) batch.push(...chain.extra.map((d) => ({ ...d, t0: performance.now() + delayMs })));
  const byColor = new Map<string, typeof batch>();
  for (const d of batch) byColor.set(d.color, [...(byColor.get(d.color) ?? []), d]);
  for (const list of byColor.values()) {
    const door = chain?.door;
    const dist = (d: (typeof batch)[number]): number => (door ? Math.hypot(d.x - door.x, d.y - door.y) : d.ref ? Math.hypot(d.x - d.ref.x, d.y - d.ref.y) : 0);
    const step = chain ? EXIT_STEP_MS * SLOW : UNPICK_STEP_MS;
    list.sort((a, b) => dist(b) - dist(a));
    const b0 = list[0].t0;
    const b1 = b0 + (list.length - 1) * step + DISSOLVE_MS;
    list.forEach((d, rank) => dissolves.push({ ...d, t0: d.t0 + rank * step, b0, b1 }));
    // vài tiếng "bụp" rải đều theo chuỗi vỡ (không phải mỗi ô một tiếng)
    const nowMs = performance.now();
    const stride = Math.max(1, Math.ceil(list.length / 6));
    for (let r = 0; r < list.length; r += stride) play('pop', Math.random(), Math.max(0, (list[r].t0 + r * step - nowMs) / 1000));
    for (const d of list) if (!chain?.extra?.some((e) => e.x === d.x && e.y === d.y && e.seed === d.seed)) threadDying.push({ color: d.color, x: d.x, y: d.y, seed: d.seed, b1 });
  }
  state = next;
}

// ---------- Vòng đời level ----------

/**
 * Vào level `i`. `instant`: bỏ hiệu ứng mở màn và vẽ ngay khung đầu (preview, thumbnail, kiểm tra của IDE chụp ngay sau khi gọi nên không thể
 * chờ bàn bay vào); tutorial và popup mở khoá vẫn hiện bình thường sau đó.
 */
function startLevel(i: number, instant = false, slide = false): void {
  index = Math.max(0, Math.min(LEVEL_COUNT - 1, Math.floor(i)));
  state = createState(LEVELS[index].level);
  scene?.setLevel(state.level);
  viewKey = '';
  impacts = [];
  anim = null;
  gateKick = null;
  dissolves = [];
  threadDying = [];
  trailMem = new Map();
  armed = null;
  fx = null;
  wildFx = null;
  {
    const steps = import.meta.env.DEV && new URLSearchParams(location.search).has('play') || (!import.meta.env.DEV && tutDoneSet().has(index)) ? null : buildTutorial(LEVELS[index]);
    tut = steps ? { steps, i: 0 } : null;
    tutT0 = performance.now();
  }
  pushAnims.clear();
  hideAmt.clear();
  iceAmt.clear();
  badgeAmt.clear();
  pinMem.clear();
  pinDying = [];
  toast = null;
  drag = null;
  shake = null;
  window.clearTimeout(modalTimer);
  modal = null;
  menu = { open: false, t0: -1e9, a0: 0 };
  ended = false;
  revived = false;
  loseBanner = null;
  winShow = null;
  winConfetti = null;
  confetti.clear();
  impactFx.clear();
  // slide: chuyển màn kiểu trượt (bàn cũ đã bay sang trái): chỉ bàn mới bay vào từ bên phải, HUD đứng yên, không có nhịp trống đầu
  introSlide = slide;
  boardExit = null;
  magnetFx = null;
  introT0 = instant ? performance.now() - 10000 : slide ? performance.now() - INTRO_BOARD_START_MS : performance.now();
  // số Level/Moves của level mới đặt thẳng, không nảy (chỉ nảy khi đổi giữa lúc chơi)
  statMem.level = { v: index + 1, t0: -1e9 };
  statMem.moves = { v: Math.max(0, state.level.maxMoves - state.turn), t0: -1e9 };
  themeTarget = THEME_HUE[LEVELS[index].tier ?? 'easy'];
  duckMusic(false);
  if (!instant) play('intro', 0, 0.1);
  sceneCanvas.style.transform = instant ? '' : 'translateX(110%)'; // bàn chờ ngoài màn hình bên phải cho tới khi bay vào
  invalidate();
  // Booster vừa mở khoá ở level này: chúc mừng và tặng, sau khi người chơi đã thấy bàn.
  newQueue = unlocksAt(index + 1);
  const intro = LEVELS[index].introduces;
  pendingMech = intro && !(import.meta.env.DEV && new URLSearchParams(location.search).has('play')) && (import.meta.env.DEV || !mechSeen(intro)) ? intro : null;
  if (newQueue.length || pendingMech) window.setTimeout(showNextNew, instant ? 0 : 560 * SLOW); // ngay sau khi bàn bay vào xong
  // Bàn đã sẵn sàng: lớp studio bắt đầu tính giờ ở đây (cả lúc chơi lại).
  const tier = LEVELS[index].tier;
  const difficulty = tier === 'easy' ? 'easy' : tier === 'medium' ? 'normal' : 'hard';
  events.emit('levelStart', { index, difficulty, levelId: `L${index + 1}` });
  if (instant) {
    // vẽ đồng bộ để ảnh chụp ngay sau lệnh gọi đã có đủ bàn và HUD
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    frame();
  }
}

function finishIfOver(): void {
  if (ended) return;
  const st = status(state);
  if (st === 'playing') return;
  ended = true;
  armed = null;
  endedAt = performance.now();
  duckMusic(true); // hạ nhạc nền cho phần trình diễn thắng/thua
  invalidate();
  if (st === 'won') {
    buzz([20, 40, 20]);
    events.emit('win');
    // Thắng là sang màn kế luôn (không logo, pháo giấy hay popup thắng): chờ khối vào hẳn cổng rồi trượt bàn mới vào.
    modalTimer = window.setTimeout(() => slideToLevel(index + 1 < LEVEL_COUNT ? index + 1 : 0), WIN_DELAY_MS + 250);
    return;
  }
  buzz(60);
  // Hết lượt: chữ "Out of Moves" bay vào rồi bay đi, sau đó popup mời thêm lượt (nếu chưa dùng) hoặc popup thua.
  loseBanner = { t0: endedAt + OOM_DELAY_MS };
  play('outOfMoves', 0, (OOM_DELAY_MS + OOM_IN_MS * 0.7) / 1000); // vang lên lúc chữ gần chạm giữa màn
  modalTimer = window.setTimeout(() => {
    loseBanner = null;
    if (revived) finalLose();
    else openModal('continue');
  }, OOM_DELAY_MS + OOM_IN_MS + OOM_HOLD_MS + OOM_OUT_MS);
}

/** Kết thúc màn trình diễn thắng (hết giờ hoặc người chơi chạm bỏ qua): hiện popup Next Level ngay. Pháo giấy còn rơi tiếp. */
function skipWin(): void {
  window.clearTimeout(modalTimer);
  if (!winShow) return;
  winShow = null;
  openModal('win');
  play('fanfare');
  winConfetti = { t0: performance.now(), bursts: 0 };
}

/** Thua hẳn (huỷ lời mời hoặc hết lượt lần nữa): báo cho lớp studio và hiện popup thua. */
function finalLose(): void {
  events.emit('lose', { canRevive: false });
  openModal('fail');
  play('fail');
}

/** Nhận thêm lượt từ lời mời: level chạy tiếp từ đúng trạng thái đang đứng. */
function reviveWithMoves(): void {
  revived = true;
  play('revive');
  duckMusic(false);
  state = { ...state, level: { ...state.level, maxMoves: state.level.maxMoves + REVIVE_MOVES } };
  ended = false;
  invalidate();
}

// ---------- Mở màn ----------
// Bắt đầu level: chỉ có nền; bàn chơi bay từ bên phải vào; xong thì HUD trên bay xuống cùng HUD dưới bay lên.
let introT0 = -1e9;
let introSlide = false;
/** Hoạt ảnh nam châm: hiện ở cổng, tia hút nối tới khối được chọn, rồi khối bay vào cổng. */
let magnetFx: { t0: number; id: string; gate: { side: Dir; index: number; depth?: number }; from: Pos; launchAt: number; endAt: number } | null = null;
const MAGNET_PRE_MS = 800;
/** Bàn cũ đang bay sang trái khi thắng màn 1–3 (trước khi vào màn kế). */
let boardExit: { t0: number } | null = null;
const BOARD_EXIT_MS = 300;
const INTRO_HUD_DELAY_MS = 100; // trống 100ms (chỉ có nền) rồi HUD bay vào
const INTRO_HUD_MS = 220;
const INTRO_BOARD_MS = 280;
const INTRO_BOARD_START_MS = INTRO_HUD_DELAY_MS + INTRO_HUD_MS / 2; // bàn bay vào giữa lúc HUD đang bay
/** easeOutBack: vọt qua đích một chút rồi về. */
const easeOutBackIntro = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  const c1 = 0.8; // nhẹ (chuẩn là 1.70158): vọt qua đích khoảng 3%
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
function introAmts(now: number): { board: number; hud: number } {
  const t = (now - introT0) / SLOW;
  return { board: easeOutBackIntro((t - INTRO_BOARD_START_MS) / INTRO_BOARD_MS), hud: introSlide ? 1 : easeOutBackIntro((t - INTRO_HUD_DELAY_MS) / INTRO_HUD_MS) };
}
const introActive = (now = performance.now()): boolean => (now - introT0) / SLOW < Math.max(INTRO_HUD_DELAY_MS + INTRO_HUD_MS, INTRO_BOARD_START_MS + INTRO_BOARD_MS);

function canAct(): boolean {
  return !paused && !introActive() && !newQueue.length && !pendingMech && !boardExit && !magnetFx && !anim && !fx && !wildFx && !modal && !menu.open && !ended && status(state) === 'playing';
}

// ---------- Booster: bật, chọn mục tiêu, thực hiện ----------
// Booster không tính lượt và không làm vệt cũ già đi (xem core/rules.ts). Hiệu ứng chạy đè lên trạng thái đã/đang đổi.

function onBoosterTap(key: BoosterKey): void {
  if (paused || anim || fx || modal || ended || status(state) !== 'playing') return;
  const ts = tutCur();
  if (ts && !(ts.kind === 'booster' && ts.key === key)) return tutNudge();
  if (index + 1 < unlockLevel(key)) return deny(`Mở khoá ở màn ${unlockLevel(key)}`);
  if (armed === key) {
    armed = null;
    invalidate();
    return;
  }
  armed = null;
  if (countOf(key) <= 0 && tutCur()?.kind !== 'booster') return openModal('buy', key);
  if (!hasTarget(key)) return deny(NO_TARGET[key]);
  armed = key;
  play('arm');
  invalidate();
}

const NO_TARGET: Record<BoosterKey, string> = {
  pin: 'Không còn ô trống để đặt khối',
  bomb: 'Không còn ô trống để thả bom',
  magnet: 'Không có thạch nào thẳng hàng với cổng',
  basket: 'Không có cổng để chọn',
};

/** Booster này có mục tiêu hợp lệ trên bàn hiện tại không. */
function hasTarget(key: BoosterKey): boolean {
  if (key === 'basket') return state.level.gates.length > 0;
  if (key === 'magnet') return Object.keys(state.balls).some((id) => magnetGate(state, id));
  for (let yy = 0; yy < state.level.height; yy++) for (let xx = 0; xx < state.level.width; xx++) if (key === 'pin' ? isPinnable(state, xx, yy) : isEmptyCell(state, xx, yy)) return true;
  return false;
}

/** Đang hướng dẫn booster: mục tiêu người chơi chọn có đúng mục tiêu của bước không (không hướng dẫn thì luôn đúng). */
function tutTargetOk(t: { x?: number; y?: number; id?: string; gate?: { side: Dir; index: number; depth?: number } }): boolean {
  const ts = tutCur();
  if (!ts) return true;
  if (ts.kind !== 'booster') return false;
  const m = ts.move;
  if (m.kind === 'pin' || m.kind === 'bomb') return t.x === m.x && t.y === m.y;
  if (m.kind === 'magnet') return t.id === m.id;
  if (m.kind === 'basket') return !!t.gate && gateKey(t.gate) === gateKey(m);
  return false;
}

function consume(key: BoosterKey): void {
  const free = tutCur()?.kind === 'booster'; // lần dùng trong hướng dẫn miễn phí: không trừ kho
  tutAdvance('booster', key);
  if (!free) {
    spend(key);
    logUse(key);
  }
  armed = null;
  invalidate();
}

function onArmedTap(x: number, y: number): void {
  if (!armed || !canAct()) return;
  if (armed === 'pin' || armed === 'bomb') {
    const c = scene?.pick(x, y);
    if (!c) return;
    if (armed === 'pin' ? !isPinnable(state, c.x, c.y) : !isEmptyCell(state, c.x, c.y)) return deny(armed === 'pin' && isEmptyCell(state, c.x, c.y) ? 'Không đặt khối lên ô cổng' : 'Cần một ô trống');
    if (!tutTargetOk({ x: c.x, y: c.y })) return tutNudge();
    if (armed === 'pin') {
      const r = placePin(state, c.x, c.y);
      if (!r.ok) return;
      consume('pin');
      play('pinDrop');
      setState(r.state);
      buzz(14);
    } else {
      const r = placeBomb(state, c.x, c.y);
      if (!r.ok) return;
      consume('bomb');
      play('bombWhistle');
      fx = { kind: 'bomb', x: c.x, y: c.y, t0: performance.now(), result: r, applied: false };
      buzz(10);
    }
  } else if (armed === 'magnet') {
    const id = scene?.pickBall(x, y, Object.entries(state.balls).map(([bid, p]) => ({ id: bid, x: p.x, y: p.y })));
    if (!id) return;
    if (!magnetGate(state, id)) return deny('Chưa thẳng hàng với cổng');
    if (!tutTargetOk({ id })) return tutNudge();
    const r = useMagnet(state, id);
    if (!r.ok) return;
    consume('magnet');
    play('magnet');
    buzz([20, 40, 20]);
    // Nam châm hiện ra ở cổng, tia hút nối tới khối được chọn (xuyên qua mọi vật cản), rồi khối mới bị hút vào cổng.
    const mv = r.moved[0];
    const gdef = state.level.gates.find((q) => gateKeyAt(state.level, mv.exit!, mv.to) === gateKey(q));
    if (!gdef) return launchExit(state, r.state, mv, 'magnet', performance.now());
    const t0 = performance.now();
    magnetFx = { t0, id, gate: { side: gdef.side, index: gdef.index, depth: gdef.depth }, from: { ...mv.from }, launchAt: t0 + MAGNET_PRE_MS * SLOW, endAt: Infinity };
    const after = r.state;
    const myFx = magnetFx;
    window.setTimeout(() => {
      if (!magnetFx || magnetFx !== myFx) return; // đã chơi lại / sang màn khác trong lúc chờ
      launchExit(state, after, mv, 'magnet', performance.now());
      magnetFx.endAt = performance.now() + (anim ? anim.moveDur * 0.98 : 400) + 450;
    }, MAGNET_PRE_MS * SLOW);
  } else if (armed === 'basket') {
    const gt = scene?.pickGate(x, y, cellPx() * 0.8);
    if (!gt) return;
    if (!tutTargetOk({ gate: gt })) return tutNudge();
    const r = armWild(state, gt.side, gt.index, gt.depth ?? 0);
    if (!r.ok) return deny('Cổng này đã là cổng cầu vồng');
    consume('basket');
    play('rainbow');
    wildFx = { key: gateKey(gt), side: gt.side, index: gt.index, depth: gt.depth, slotIdx: BOOSTERS.findIndex((q) => q.key === 'basket'), t0: performance.now() };
    setState(r.state);
    buzz(14);
  }
  invalidate();
}

/** Khối bị booster đưa tới giỏ rồi thoát: dùng hoạt ảnh hút của cú vuốt (khối tan thành sợi, vệt kéo vào giỏ). */
function launchExit(prev: State, next: State, m: BoosterMove, mode: 'magnet' | 'push', t0: number): void {
  const side = m.exit!;
  const d = DELTA[side];
  const door = { x: m.to.x + d.x * 0.5, y: m.to.y + d.y * 0.5 };
  let pts: Pos[];
  if (mode === 'magnet') {
    pts = [{ ...m.from }];
    const sx = Math.sign(m.to.x - m.from.x);
    const sy = Math.sign(m.to.y - m.from.y);
    let q = { ...m.from };
    while (q.x !== m.to.x || q.y !== m.to.y) {
      q = { x: q.x + sx, y: q.y + sy };
      pts.push({ ...q });
    }
    pts.push(door);
  } else pts = [{ ...m.from }, { ...m.to }, door];
  const moveDur = SLOW * (mode === 'magnet' ? Math.min(480, 220 + 40 * (pts.length - 1)) : Math.min(340, 140 + 60 * (pts.length - 1)));
  const dirV = { x: Math.sign(m.to.x - m.from.x) || d.x, y: Math.sign(m.to.y - m.from.y) || d.y };
  const hit = mode === 'magnet' ? 0.96 : 0.8; // lúc khối chạm cổng (nam châm: vận tốc tăng dần nên tới sát cuối)
  setState(next, undefined, moveDur * (hit + 0.1), { door }); // vệt của khối vỡ thành một chuỗi hướng về cửa lúc khối chui vào cửa
  anim = {
    id: m.id,
    color: colorOf(m.id),
    pts,
    t0,
    antic: 0,
    moveDur,
    dur: moveDur + UNRAVEL_MS,
    exit: true,
    exitDir: { ...d },
    gateKey: gateKeyAt(next.level, side, m.to),
    dirV,
    turn: null,
    arc: mode === 'magnet' ? 0.3 : 0,
    accel: mode === 'magnet',
  };
  play('gate', 0, (moveDur * hit) / 1000);
  gateKick = { key: anim.gateKey!, t0: t0 + moveDur * hit + 0.25 * (moveDur * (1 - hit) + UNRAVEL_MS) };
  invalidate();
}

/** Bom nổ: các khối bị đẩy bay sang ô mới; khối bị đẩy vào giỏ thì thoát. */
function applyBomb(now: number): void {
  if (!fx) return;
  const r = fx.result;
  fx.applied = true;
  play('bombBoom');
  const prev = state;
  for (const m of r.moved) if (!m.exit) pushAnims.set(m.id, { from: m.from, to: m.to, t0: now });
  const exiting = r.moved.find((m) => m.exit);
  if (exiting) launchExit(prev, r.state, exiting, 'push', now);
  else setState(r.state);
  buzz([20, 30]);
  invalidate();
}

// ---------- Hành động ----------

/** Các điểm (toạ độ ô, có thể lẻ) mà khối đi qua cho một cú trượt, kể cả đoạn lao vào giỏ khi thoát. */
function pathOf(prev: State, id: string, dir: Dir, res: Extract<MoveResult, { ok: true }>): Pos[] {
  if (res.path) {
    // level có mũi tên/cổng dịch chuyển: đường đi do luật trả về (không còn thẳng)
    const pts = res.path.map((p) => ({ ...p }));
    if (res.exit) pts.push({ x: res.to!.x + DELTA[res.exit].x * 0.5, y: res.to!.y + DELTA[res.exit].y * 0.5 });
    return pts;
  }
  const d = DELTA[dir];
  const from = prev.balls[id];
  const end = res.to!;
  const pts: Pos[] = [{ ...from }];
  let p = { ...from };
  while (p.x !== end.x || p.y !== end.y) {
    p = { x: p.x + d.x, y: p.y + d.y };
    pts.push({ ...p });
  }
  // Dừng sát giỏ cùng màu: bị hút thẳng vào giỏ.
  if (res.exit) pts.push({ x: end.x + DELTA[res.exit].x * 0.5, y: end.y + DELTA[res.exit].y * 0.5 });
  return pts;
}

/** Thân rắn: vệt còn sống của khối `id` (các cú trượt trước) cộng các ô cú trượt này đi qua, theo thứ tự đi. */
function snakeCells(prev: State, id: string, pts: Pos[], turn: number): SnakeCell[] {
  const life = prev.level.trailLife;
  const own = new Set((prev.history[id] ?? []).map((r) => r.turn));
  const cells: SnakeCell[] = [];
  for (const t of prev.trails) {
    if (own.has(t.turn) && trailLeft(prev, t) > 0) cells.push({ x: t.x, y: t.y, turn: t.turn, left: trailLeft(prev, t) });
  }
  for (const p of pts) if (Number.isInteger(p.x) && Number.isInteger(p.y)) cells.push({ x: p.x, y: p.y, turn, left: life });
  // Mỗi ô giữ lần xuất hiện cuối cùng (vệt mới nhất).
  const last = new Map<string, number>();
  cells.forEach((c, i) => last.set(cellKey(c), i));
  return cells.filter((c, i) => last.get(cellKey(c)) === i);
}

function tryMove(id: string, dir: Dir): void {
  if (!canAct()) return;
  const ts = tutCur();
  if (ts && !((ts.kind === 'slide' || ts.kind === 'undo') && ts.id === id && ts.dir === dir)) return tutNudge();
  // Kéo ngược theo vệt vừa đi = hoàn tác khối này (hướng này luôn bị vệt chặn nên không lẫn với cú trượt).
  if (dir === undoDir(state, id) && !slide(state, id, dir).ok) return doUndo(id); // sau cổng dịch chuyển hướng kéo ngược có thể trùng một cú trượt hợp lệ: ưu tiên cú trượt
  const prevOutCount = state.out.length;
  const r = slide(state, id, dir);
  if (!r.ok && (r.reason === 'frozen' || r.reason === 'axis')) {
    // thạch đóng băng / thạch một trục bị vuốt sai: không đi, nhún dẹp theo hướng vuốt như đập vào tường (không rung ngang) và nhắc luật
    const bv = DELTA[dir];
    impacts = impacts.filter((im) => im.id !== id);
    impacts.push({ id, dx: bv.x, dy: bv.y, t0: performance.now(), amp: 0.7, kind: 'hit' });
    buzz(10);
    play('bump', 0.5);
    deny(r.reason === 'frozen' ? 'Đóng băng! Hãy đâm một thạch khác vào nó' : 'Thạch này chỉ trượt theo mũi tên của nó');
    invalidate();
    return;
  }
  if (!r.ok) {
    // Bị chắn ngay: không rung ngang nữa mà đập vào vật cản như lúc trượt tới tường (ép dẹp rồi nảy lại); nếu vật cản là một khối thạch khác thì cả hai cùng rung rinh.
    const bv = DELTA[dir];
    const bf = state.balls[id];
    const other = bf ? Object.entries(state.balls).find(([bid, q]) => bid !== id && q.x === bf.x + bv.x && q.y === bf.y + bv.y)?.[0] : undefined;
    const tNow = performance.now();
    impacts = impacts.filter((im) => im.id !== id && im.id !== other);
    impacts.push({ id, dx: bv.x, dy: bv.y, t0: tNow, amp: other ? 0.85 : 0.75, kind: 'hit' });
    if (bf) {
      const hx = bf.x + bv.x;
      const hy = bf.y + bv.y;
      if (other) impacts.push({ id: other, dx: bv.x, dy: bv.y, t0: tNow, amp: 0.8, kind: 'bump' });
      else if (state.trails.some((t) => t.x === hx && t.y === hy && trailLeft(state, t) > 0)) impacts.push({ id: `trail:${hx},${hy}`, dx: bv.x, dy: bv.y, t0: tNow, amp: 0.8, kind: 'bump' });
      const rp = ripple(state, hx, hy, id, bf, 0.75);
      for (const b of rp.balls) impacts.push({ id: b.id, dx: bv.x, dy: bv.y, t0: tNow + b.delay, amp: b.amp * 0.85, kind: 'bump' });
      for (const c of rp.cells) impacts.push({ id: `trail:${c.x},${c.y}`, dx: bv.x, dy: bv.y, t0: tNow + c.delay, amp: c.amp * 0.85, kind: 'bump' });
    }
    buzz(8);
    play(other ? 'bumpBall' : 'bump', 0.6);
    invalidate();
    return;
  }
  const dv = DELTA[dir];
  const pts = pathOf(state, id, dir, r);
  const moveDur = SLOW * Math.min(330, 100 + 42 * (pts.length - 1)); // nhanh: một ô ~140ms, băng ngang cả bàn ~330ms
  // Cú trượt thoát vẫn để lại vệt dọc đường đi (hiện ra khi khối đi tới); vệt đó cùng các vệt cũ của khối vỡ thành một chuỗi hướng về cửa lúc khối chui vào cửa.
  let exitChain: ExitChain | undefined;
  if (r.exit && r.to) {
    const cells = pts.filter((q) => Number.isInteger(q.x) && Number.isInteger(q.y));
    const t0 = performance.now();
    const segs = Math.max(1, pts.length - 1);
    const extra = cells.map((q, i) => {
      const u = Math.pow(i / segs, 1 / 1.7); // slideEase: ô thứ i được trải tới lúc này
      return { x: q.x, y: q.y, seed: r.state.turn * 100 + i, t0: 0, color: colorOf(id), ref: null, b0: 0, b1: 0, tight: true, show: t0 + ANTIC_MS + moveDur * u };
    });
    exitChain = { door: { x: r.to.x + DELTA[r.exit].x * 0.5, y: r.to.y + DELTA[r.exit].y * 0.5 }, extra };
  }
  // Va chạm: cú va mạnh theo quãng đường và loại vật cản; nếu khối khác chặn thì nó cũng rung theo.
  let impact: Anim['impact'];
  if (!r.exit && r.stop && r.to) {
    const amp = Math.min(1, (r.stop === 'trail' ? 0.45 : r.stop === 'sticky' ? 0.3 : 0.6) + 0.12 * (pts.length - 1));
    let bumpId: string | null = null;
    if (r.stop === 'ball') {
      const nx = r.to.x + dv.x;
      const ny = r.to.y + dv.y;
      bumpId = Object.entries(state.balls).find(([bid, p]) => bid !== id && p.x === nx && p.y === ny)?.[0] ?? null;
    }
    // Ô bị đâm (thạch hoặc vệt) nảy mạnh nhất; mọi thạch và vệt sát nó nảy theo sau yếu hơn.
    let bumpCells: { x: number; y: number; amp: number; delay: number }[] = [];
    let hx = r.to.x + dv.x;
    let hy = r.to.y + dv.y;
    if (r.stop === 'trail') {
      if (state.trails.some((t) => t.x === hx && t.y === hy && trailLeft(state, t) > 0)) bumpCells.push({ x: hx, y: hy, amp: Math.min(1, amp * 1.5), delay: 0 });
    }
    const rp = r.stop === 'trail' || r.stop === 'ball' ? ripple(state, hx, hy, id, r.to, amp) : { balls: [], cells: [] };
    bumpCells = bumpCells.concat(rp.cells);
    const bumpExtra = rp.balls;
    impact = { amp, bumpId, bumpCells, bumpExtra };
  }
  impacts = impacts.filter((im) => im.id !== id);
  setState(r.state, undefined, r.exit ? ANTIC_MS + moveDur * 0.9 : 0, exitChain); // khối thoát: mọi vệt của nó vỡ thành một chuỗi hướng về cửa
  tutAdvance('slide');
  if (r.thawed) play('pop', 0.9, (ANTIC_MS + moveDur) / 1000);
  // dừng sát cổng cùng màu nhưng cổng đang đóng: nhắc lý do
  if (!r.exit && r.to) {
    const col = colorOf(id);
    const shut = state.level.gates.find((q) => q.color === col && (() => { const cc = gateCell(state.level, q); return cc.x === r.to!.x && cc.y === r.to!.y; })());
    if (shut) {
      if (shut.lock && prevOutCount < shut.lock) showToast(`Cổng đóng băng: cần thêm ${shut.lock - prevOutCount} thạch ra trước`);
      else if (shut.rhythm) showToast(`Cổng này mở ở lượt ${shut.rhythm === 'even' ? 'chẵn' : 'lẻ'}`);
    }
  }
  buzz(r.exit ? 18 : 10);
  play('slide', Math.min(1, (pts.length - 1) / 6));
  if (r.exit) play('gate', 0, (ANTIC_MS + moveDur * 0.9) / 1000);
  else if (impact) play(impact.bumpId ? 'bumpBall' : r.stop === 'trail' || r.stop === 'sticky' ? 'bumpSoft' : 'bump', impact.amp, (ANTIC_MS + moveDur) / 1000);
  anim = {
    id,
    color: colorOf(id),
    pts,
    t0: performance.now(),
    antic: ANTIC_MS,
    moveDur,
    dur: r.exit ? ANTIC_MS + moveDur + UNRAVEL_MS : ANTIC_MS + moveDur,
    exit: !!r.exit,
    exitDir: r.exit ? { ...DELTA[r.exit] } : undefined,
    gateKey: r.exit && r.to ? gateKeyAt(r.state.level, r.exit, r.to) : '',
    dirV: dv,
    impact,
    turn: r.state.turn,
    jumps: r.jumps,
  };
  if (r.exit && anim.gateKey) gateKick = { key: anim.gateKey, t0: anim.t0 + ANTIC_MS + moveDur * 0.8 + 0.25 * (moveDur * 0.2 + UNRAVEL_MS) };
  invalidate();
}

/** Đường đi của một cú trượt, đảo chiều (từ ô cuối về ô xuất phát), cùng chỉ số các đoạn dịch chuyển đã đảo; null nếu cú trượt đi thẳng. */
function reversedPath(rec: { path?: Pos[]; jumps?: number[] }): { path: Pos[]; jumps: number[] } | null {
  if (!rec.path || rec.path.length < 2) return null;
  const n = rec.path.length;
  return { path: [...rec.path].reverse().map((p) => ({ ...p })), jumps: (rec.jumps ?? []).map((i) => n - 2 - i) };
}

function doUndo(id: string): void {
  if (!canAct() || !undoDir(state, id)) return;
  const cur = state.balls[id];
  const rec = state.history[id].at(-1);
  const r = undo(state, id);
  if (!r.ok) return;
  setState(r.state);
  tutAdvance('undo');
  play('undo');
  buzz(8);
  const back = r.state.balls[id];
  const dvU = { x: Math.sign(back.x - cur.x), y: Math.sign(back.y - cur.y) };
  // về tới ô xuất phát thì khối rung rinh như vừa đập vào vật cản (ép dẹp rồi nảy lại)
  // cú trượt có ô mũi tên / cổng dịch chuyển: đi ngược đúng đường cũ (qua cổng này sang cổng kia) rồi mới về ô xuất phát
  const rev = rec ? reversedPath(rec) : null;
  const pts = rev ? rev.path : [{ ...cur }, { ...back }];
  const moveDur = rev ? SLOW * Math.min(520, 170 + 55 * (pts.length - 1)) : 170;
  anim = { id, color: colorOf(id), pts, t0: performance.now(), dur: moveDur, moveDur, antic: 0, dirV: dvU, exit: false, turn: null, jumps: rev?.jumps, impact: { amp: 0.7, bumpId: null } };
  invalidate();
}

// ---------- UI của game: popup và nút chơi lại ----------
// Header, popup thắng/thua do game tự vẽ theo phong cách thạch bóng. Bố cục (ribbon tên level,
// tiêu đề, hình minh hoạ, nút lớn) lấy từ template của studio làm mẫu; không dùng chính template.

type ModalKind = 'win' | 'fail' | 'continue' | 'new' | 'buy' | 'mechanic';
/** `lv`/`last`: số level và "đây là level cuối" tại lúc mở popup, để popup đang mờ dần không đổi chữ khi `index` đã sang level kế. */
type ModalState = { kind: ModalKind; t0: number; key?: BoosterKey; mech?: string; busy?: boolean; note?: string; lv: number; last: boolean };
let modal: ModalState | null = null;
let modalTimer = 0;
/** Popup vừa đóng: vẫn vẽ mờ dần và thu nhỏ nhẹ trong MODAL_OUT_MS thay vì biến mất ngay. */
let modalOut: { m: ModalState; t0: number } | null = null;
const MODAL_OUT_MS = 220;
/** Vùng bấm của các nút popup, tính lại mỗi lần vẽ (toạ độ màn hình). */
let modalButtons: { id: 'primary' | 'secondary'; x: number; y: number; w: number; h: number }[] = [];
let modalCard = { x: 0, y: 0, w: 0, h: 0 };

function openModal(kind: ModalKind, key?: BoosterKey, mech?: string): void {
  menu = { open: false, t0: -1e9, a0: 0 };
  armed = null;
  modalOut = null;
  modal = { kind, t0: performance.now(), key, mech, lv: index + 1, last: index + 1 >= LEVEL_COUNT };
  if (kind !== 'win' && kind !== 'fail') play('popupOpen'); // popup thắng/thua có tiếng riêng
  drag = null;
  invalidate();
}

/** Sang màn `i` bằng chuyển cảnh trượt: bàn cũ bay sang trái, bàn mới bay vào từ bên phải (dùng cho mọi lần sang màn / chơi lại giữa lúc chơi). */
function slideToLevel(i: number): void {
  if (boardExit) return;
  window.clearTimeout(modalTimer);
  boardExit = { t0: performance.now() };
  drag = null;
  invalidate();
  modalTimer = window.setTimeout(() => startLevel(i, false, true), BOARD_EXIT_MS);
}

function closeModal(): void {
  if (modal) play('popupClose');
  if (modal) modalOut = { m: modal, t0: performance.now() };
  modal = null;
  invalidate();
}

/** Bấm nút chơi lại: chơi lại ngay, không hỏi xác nhận (chưa đi nước nào cũng chơi lại và chạy lại hiệu ứng mở màn). */
function requestRestart(): void {
  if (paused || anim || modal || introActive() || boardExit || newQueue.length || pendingMech) return;
  slideToLevel(index); // kể cả chưa đi nước nào: chơi lại bằng chuyển cảnh trượt
}

function modalAction(id: 'primary' | 'secondary'): void {
  const m = modal;
  if (!m) return;
  if (m.kind === 'new' && m.key) {
    if (!isGranted(m.key)) addBooster(m.key, UNLOCK_GIFT, true);
    closeModal();
    if (newQueue.length || pendingMech) window.setTimeout(showNextNew, 350);
    return;
  }
  if (m.kind === 'mechanic') {
    if (m.mech) markMechSeen(m.mech);
    closeModal();
    return;
  }
  if (m.kind === 'buy' && m.key) {
    if (id === 'secondary') return closeModal();
    if (m.busy) return;
    const key = m.key;
    m.busy = true;
    m.note = undefined;
    void watchAdFor(key).then((ok) => {
      if (!modal || modal.kind !== 'buy') return;
      if (ok) {
        closeModal();
        showToast(`+1 ${defOf(key).name}`);
      } else {
        modal.busy = false;
        modal.note = 'Hiện chưa có video.';
      }
      invalidate();
    });
    invalidate();
    return;
  }
  if (m.kind === 'continue') {
    closeModal();
    if (id === 'primary') reviveWithMoves();
    else modalTimer = window.setTimeout(finalLose, 220); // popup mờ đi rồi mới hiện popup thua
    return;
  }
  closeModal();
  if (m.kind === 'win') slideToLevel(index + 1 < LEVEL_COUNT ? index + 1 : 0);
  else slideToLevel(index);
}

function showNextNew(): void {
  const key = newQueue[0];
  if (!key && !pendingMech) return;
  if (modal || paused || anim || fx) return void window.setTimeout(showNextNew, 500);
  if (key) {
    newQueue.shift();
    openModal('new', key);
    return;
  }
  const m = pendingMech!;
  pendingMech = null;
  openModal('mechanic', undefined, m);
}

/** Báo không làm được: tiếng từ chối cộng dòng thông báo. */
function deny(text: string): void {
  play('denied');
  showToast(text);
}

function showToast(text: string): void {
  toast = { text, until: performance.now() + 1700 };
  invalidate();
}

// ---------- Menu cài đặt ----------
// Logic lấy từ nút setting của template header: bấm bánh răng thì mở/đóng menu (bánh răng xoay một vòng, màn hình tối
// đi), bốn nút bay ra dọc theo mép phải lệch nhịp nhau: nhạc, âm thanh, rung (bật/tắt) và chơi lại. Bấm ra ngoài thì
// đóng menu mà không chạm vào bàn chơi. Chơi lại đóng menu rồi chơi lại ngay.

/** `a0` = độ mở lúc bắt đầu chuyển (0..1), để đóng/mở giữa chừng không bị giật. */
let menu = { open: false, t0: -1e9, a0: 0 };
const MENU_ORDER = ['music', 'sound', 'haptic', 'retry'] as const;
type MenuItem = (typeof MENU_ORDER)[number];

function menuAmount(now: number): number {
  const k = Math.max(0, Math.min(1, (now - menu.t0) / (menu.open ? 520 : 320))); // chậm: nút từ từ trồi ra từng cái một
  const e = 1 - Math.pow(1 - k, 3);
  return menu.a0 + ((menu.open ? 1 : 0) - menu.a0) * e;
}

function setMenu(open: boolean): void {
  if (menu.open === open) return;
  const now = performance.now();
  menu = { open, t0: now, a0: menuAmount(now) };
  drag = null;
  invalidate();
}

/** Tâm ô thứ i (0..4) trên thanh dưới: bốn ô booster rồi tới nút cài đặt. */
const slotX = (w: number, i: number): number => (w / 5) * (i + 0.5);
const slotY = (h: number): number => h - BOTTOM_BAR_H + 4; // đường kẻ vàng của thanh dưới cắt ngang qua các nút

/** Nút cài đặt: nút tròn xanh dương ở góc phải thanh dưới. */
/** Biểu tượng "lượt đi": một mũi tên trắng viền xanh chỉ sang phải, chếch lên một chút. `x` là mép trái, `cy` là tâm dọc, `s` là cỡ (rộng = 1.4 s). */
function drawMovesIcon(c: CanvasRenderingContext2D, x: number, cy: number, s: number): void {
  c.save();
  c.translate(x + 0.7 * s, cy); // tâm mũi tên
  c.rotate(-0.5); // chếch lên khoảng 29°
  const l = -0.7 * s;
  c.beginPath();
  c.moveTo(l, -0.17 * s);
  c.lineTo(l + 0.75 * s, -0.17 * s);
  c.lineTo(l + 0.75 * s, -0.45 * s);
  c.lineTo(l + 1.4 * s, 0);
  c.lineTo(l + 0.75 * s, 0.45 * s);
  c.lineTo(l + 0.75 * s, 0.17 * s);
  c.lineTo(l, 0.17 * s);
  c.closePath();
  c.lineJoin = 'round';
  c.lineWidth = 4;
  c.strokeStyle = K.th('#204f8f');
  c.stroke();
  const g = c.createLinearGradient(0, -0.45 * s, 0, 0.45 * s);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, K.th('#cfe0ff'));
  c.fillStyle = g;
  c.fill();
  c.restore();
}

/** Nhãn độ khó của level trên HUD: `hot` là số ngọn lửa. Level thường không có nhãn. */
interface TierTag {
  label: string;
  hot: number;
  top: string;
  bot: string;
  border: string;
}

function tierTag(tier: 'easy' | 'medium' | 'hard' | 'super' | undefined): TierTag | null {
  // nền nhãn theo màu chủ đạo của màn: khó = đỏ, siêu khó = tím
  if (tier === 'hard') return { label: 'KHÓ', hot: 1, top: '#ff6b6b', bot: '#d42a35', border: '#6b0f18' };
  if (tier === 'super') return { label: 'SIÊU KHÓ', hot: 2, top: '#b07cff', bot: '#6d32c8', border: '#2c1068' };
  return null;
}

const TAG_FS = 11;
const TAG_H = 19;
const flameW = 8;

function tierTagWidth(t: TierTag): number {
  ctx.font = K.font(TAG_FS);
  return 10 + t.hot * (flameW + 2) + ctx.measureText(t.label).width + 8;
}

/** Ngọn lửa nhỏ có chân ở (x, y), cao `h`: thân phồng ở đáy, một nhánh nhỏ bên trái và ngọn chính hơi nghiêng phải. */
function drawFlame(c: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  c.beginPath();
  c.moveTo(x, y);
  c.bezierCurveTo(x - 0.45 * h, y, x - 0.5 * h, y - 0.35 * h, x - 0.32 * h, y - 0.55 * h); // sườn trái lên nhánh nhỏ
  c.bezierCurveTo(x - 0.28 * h, y - 0.4 * h, x - 0.16 * h, y - 0.36 * h, x - 0.1 * h, y - 0.45 * h); // khuyết giữa hai ngọn
  c.bezierCurveTo(x - 0.04 * h, y - 0.62 * h, x + 0.1 * h, y - 0.82 * h, x + 0.12 * h, y - h); // lên ngọn chính
  c.bezierCurveTo(x + 0.3 * h, y - 0.78 * h, x + 0.5 * h, y - 0.45 * h, x + 0.42 * h, y - 0.2 * h); // sườn phải xuống
  c.bezierCurveTo(x + 0.38 * h, y - 0.04 * h, x + 0.2 * h, y, x, y);
  c.closePath();
}

/** Vẽ nhãn độ khó: viên thuốc bo tròn có viền tối, nền chuyển màu, các ngọn lửa trắng-vàng rồi chữ trắng viền; góc trái trên tại (x, cy - TAG_H/2). */
function drawTierTag(c: CanvasRenderingContext2D, x: number, cy: number, t: TierTag): void {
  const w = tierTagWidth(t);
  const y = cy - TAG_H / 2;
  cssBox(c, { x, y, w, h: TAG_H, rx: TAG_H / 2, ry: TAG_H / 2 }, {
    stops: [[0, t.top], [1, t.bot]],
    border: { w: 2, color: t.border },
    // viền sáng mảnh để nhãn tách khỏi nền cùng tông, rồi bóng đổ
    outer: [{ dy: 0, spread: 2, blur: 0, color: 'rgba(255,255,255,.7)' }, { dy: 4, spread: 0, blur: 0, color: 'rgba(0,0,0,.28)' }],
    inset: [{ dy: 2, spread: 0, color: 'rgba(255,255,255,.35)' }],
  });
  let fx = x + 10 + flameW / 2;
  for (let i = 0; i < t.hot; i++) {
    c.save();
    c.fillStyle = '#ffe27a';
    c.strokeStyle = t.border;
    c.lineWidth = 1.6;
    drawFlame(c, fx, cy + 5, 11);
    c.fill();
    c.stroke();
    c.restore();
    fx += flameW + 2;
  }
  K.strokedText(c, t.label, x + 10 + t.hot * (flameW + 2) + (w - 10 - t.hot * (flameW + 2) - 8) / 2, cy + 1, TAG_FS, '#ffffff', t.border, 'center', 0.5);
}

function gearButton(w: number, h: number): { cx: number; cy: number; r: number } {
  return { cx: slotX(w, 4), cy: slotY(h), r: 27 };
}

/** Các nút của menu xếp dọc phía trên bánh răng. */
function menuItemPos(w: number, h: number, i: number): { x: number; y: number } {
  const g = gearButton(w, h);
  return { x: g.cx, y: g.cy - 66 * (i + 1) };
}

function pressMenuItem(item: MenuItem): void {
  if (item === 'retry') {
    setMenu(false);
    requestRestart();
    return;
  }
  const on = settings.toggle(item);
  if (item === 'music') refreshMusic();
  if (item === 'sound' && on) play('tap');
  if (item === 'haptic' && on) buzz(15); // báo bằng một cái rung khi vừa bật
  invalidate();
}

function drawMenu(now: number, w: number, h: number): void {
  const a = menuAmount(now);
  const g = gearButton(w, h);
  if (a > 0.001) {
    ctx.fillStyle = `rgba(6,12,44,${0.68 * a})`;
    ctx.fillRect(0, 0, w, h);
  }
  MENU_ORDER.forEach((item, i) => {
    const p = Math.max(0, Math.min(1, (a - i * 0.1) / 0.6)); // lệch nhịp từng nút
    if (p <= 0) return;
    const e = 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2); // bay vào có nảy nhẹ
    const pos = menuItemPos(w, h, i);
    const px = g.cx + (pos.x - g.cx) * e; // nút nổi lên từ bánh răng
    const py = g.cy + (pos.y - g.cy) * e;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 1.5);
    if (item === 'retry') R.drawRestartIcon(ctx, px, py, g.r - 3, true, pressOf('menu:retry'));
    else R.drawToggleButton(ctx, px, py, g.r - 3, item, settings.get(item), pressOf(`menu:${item}`));
    ctx.restore();
  });
  R.drawGearIcon(ctx, g.cx, g.cy, g.r, a * Math.PI * 2, !paused && !modal, pressOf('gear'));
}

// ---------- Bố cục ----------

/** Vùng màn hình dành cho bàn chơi: giữa thanh trên và thanh dưới, cách mỗi bên một khoảng GAP. */
function boardRect(w: number, h: number): { x: number; y: number; w: number; h: number } {
  const y0 = TOP_BAR_H + GAP;
  const y1 = h - BOTTOM_BAR_H - BTN_OVER - GAP;
  return { x: 6, y: y0, w: w - 12, h: y1 - y0 };
}

/** Số px của một ô theo chiều ngang trên màn hình (dùng làm ngưỡng kéo). */
function cellPx(): number {
  const a = scene?.cellScreen(0, 0);
  const b = scene?.cellScreen(1, 0);
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 60;
}

// ---------- Vẽ ----------

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/**
 * Vệt của khối vừa bị hút ra bị kéo vào giỏ như con rắn: các ô giữ nguyên khoảng cách và chạy dọc
 * đúng tuyến khối đã đi (kể cả chỗ rẽ) rồi nhỏ dần ở miệng giỏ. Trả về mô tả các tấm vệt cho cảnh 3D.
 */
function snakeDescs(a: Anim, elapsed: number, reached: Set<string>): TrailDesc[] {
  const sn = a.snake!;
  const n = sn.cells.length;
  const life = state.level.trailLife;
  const p = Math.max(0, Math.min(1, (elapsed - sn.pullStart) / sn.pullDur));
  const D = (n + 1) * Math.pow(p, 1.5);
  const d = DELTA[sn.side];
  const out: TrailDesc[] = [];
  sn.cells.forEach((cell, i) => {
    if (p === 0 && cell.turn === a.turn && !reached.has(cellKey(cell))) return; // chưa tới
    const r = i + D;
    let x: number;
    let y: number;
    let sc = 1;
    if (r <= n - 1) {
      const lo = Math.floor(r);
      const hi = Math.min(n - 1, lo + 1);
      const t = r - lo;
      x = sn.cells[lo].x + (sn.cells[hi].x - sn.cells[lo].x) * t;
      y = sn.cells[lo].y + (sn.cells[hi].y - sn.cells[lo].y) * t;
    } else {
      const over = r - (n - 1);
      const last = sn.cells[n - 1];
      x = last.x + d.x * over;
      y = last.y + d.y * over;
      sc = Math.max(0, 1 - over);
    }
    if (sc < 0.03) return;
    out.push({ x, y, color: a.color, kind: cell.left >= 2 || life === 1 ? 'tight' : 'loose', scale: sc, alpha: Math.min(1, sc * 1.4), seed: cell.turn, dissolve: 0, suck: { x: d.x, y: d.y }, grow: 1, loosen: cell.left >= 2 || life === 1 ? 0 : 1 });
  });
  return out;
}

/** Mức đóng băng của thạch (1 = còn bị băng bọc, chạy nhanh về 0 khi băng vỡ). Level không có thạch đóng băng thì luôn 0. */
const iceAmt = new Map<string, number>();
function iceOf(id: string): number {
  if (!state.level.balls.find((b) => b.id === id)?.frozen) return 0;
  const target = state.frozen?.includes(id) ? 1 : 0;
  let v = iceAmt.get(id);
  if (v === undefined) v = target;
  const next = v + (target - v) * (1 - Math.exp(-uiDt / 70));
  const nv = Math.abs(target - next) < 0.01 ? target : next;
  iceAmt.set(id, nv);
  if (nv !== target) uiBusy = true;
  return nv;
}

/** Mức che màu của thạch ẩn (1 = đang ẩn, chạy dần về 0 sau lần vuốt đầu tiên của nó). Level không có thạch ẩn thì luôn 0. */
const hideAmt = new Map<string, number>();
function hideOf(id: string): number {
  if (!state.level.balls.find((b) => b.id === id)?.hidden) return 0;
  const target = (state.moves?.[id] ?? 0) > 0 ? 0 : 1;
  let v = hideAmt.get(id);
  if (v === undefined) v = target;
  const next = v + (target - v) * (1 - Math.exp(-uiDt / 120));
  const nv = Math.abs(target - next) < 0.01 ? target : next;
  hideAmt.set(id, nv);
  if (nv !== target) uiBusy = true;
  return nv;
}

/**
 * Sóng nảy lan từ ô bị đâm (hx, hy): mọi thứ đứng sát nó (bốn hướng), thạch hay vệt, đều nảy theo sau một nhịp và yếu hơn.
 * Thạch và vệt hành xử như nhau: thạch bị đâm làm cả thạch lẫn vệt bên cạnh nảy, vệt bị đâm cũng vậy. Bỏ qua ô khối đang đâm (`moverPos`).
 */
function ripple(st: State, hx: number, hy: number, moverId: string, moverPos: Pos, amp: number): { balls: { id: string; amp: number; delay: number }[]; cells: { x: number; y: number; amp: number; delay: number }[] } {
  const balls: { id: string; amp: number; delay: number }[] = [];
  const cells: { x: number; y: number; amp: number; delay: number }[] = [];
  for (const d of [DELTA.up, DELTA.down, DELTA.left, DELTA.right]) {
    const nx = hx + d.x;
    const ny = hy + d.y;
    if (nx === moverPos.x && ny === moverPos.y) continue;
    const bid = Object.entries(st.balls).find(([id, p]) => id !== moverId && p.x === nx && p.y === ny)?.[0];
    if (bid) balls.push({ id: bid, amp: amp * 0.8, delay: 70 });
    else if (st.trails.some((t) => t.x === nx && t.y === ny && trailLeft(st, t) > 0)) cells.push({ x: nx, y: ny, amp: amp * 0.8, delay: 70 });
  }
  return { balls, cells };
}

/** Nảy của ô vệt bị khối đâm vào: dao động lò xo như khối bị đụng (chưa tới lúc `t0` thì đứng yên). */
function trailPose(x: number, y: number, now: number): Pose | undefined {
  const im = impacts.find((q) => q.id === `trail:${x},${y}`);
  if (!im || now < im.t0) return undefined;
  return impactPose(-im.dx, -im.dy, now - im.t0, im.amp);
}

/** Mô tả cảnh 3D ở thời điểm `now`: khối, vệt, giỏ, khối mờ báo điểm dừng và đường chấm (toạ độ tính bằng ô). */
function buildSceneDesc(now: number): SceneDesc {
  const level = state.level;

  // vị trí hoạt ảnh hiện tại: nhún lấy đà, rồi trượt tăng tốc dần (như bị đẩy đi)
  let animPos: { x: number; y: number; scale: number; alpha: number; f: number; pose: Pose; unravel: number } | null = null;
  if (anim) {
    const elapsed = now - anim.t0;
    const segs = anim.pts.length - 1;
    if (elapsed < anim.antic) {
      animPos = { x: anim.pts[0].x, y: anim.pts[0].y, scale: 1, alpha: 1, f: 0, pose: anticipationPose(anim.dirV.x, anim.dirV.y, elapsed / anim.antic), unravel: 0 };
    } else {
      const u = Math.min(1, (elapsed - anim.antic) / anim.moveDur);
      const f = (anim.accel ? Math.pow(u, 2.3) : anim.turn === null ? ease(u) : slideEase(u)) * segs;
      const i = Math.min(segs - 1, Math.floor(f));
      const t = f - i;
      const a = anim.pts[i];
      const b = anim.pts[i + 1];
      // Khối bị hút ra: tới gần cửa thì mất kết cấu, tách thành các sợi len bị hút vào cửa (xem unravel trong shader).
      const unravel = anim.exit ? Math.min(1, Math.max(0, (elapsed - anim.antic - anim.moveDur * (anim.accel ? 0.96 : 0.8)) / (anim.moveDur * (anim.accel ? 0.04 : 0.2) + UNRAVEL_MS))) : 0;
      animPos = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, scale: 1, alpha: unravel >= 1 ? 0 : 1, f, pose: IDENTITY, unravel };
      if (anim.jumps?.includes(i)) {
        // qua cổng dịch chuyển: co nhỏ dần ở ô vào, rồi lớn lên ở ô ra (không bay ngang bàn)
        const k = Math.max(0, Math.min(1, t));
        animPos.x = k < 0.5 ? a.x : b.x;
        animPos.y = k < 0.5 ? a.y : b.y;
        animPos.scale = Math.abs(2 * k - 1);
      }
    }
  }

  // ô đang có khối đứng hoặc đang đi qua: vệt ở đó bị khối che nên không vẽ (tránh khối chui vào trong vệt)
  const occupied = new Set(Object.entries(state.balls).filter(([id]) => !(anim && anim.id === id)).map(([, p]) => cellKey(p)));
  if (animPos) occupied.add(cellKey({ x: Math.round(animPos.x), y: Math.round(animPos.y) }));

  // vệt (vệt của cú trượt đang chạy chỉ hiện tới chỗ khối đã qua)
  const reached = new Set<string>();
  if (anim && animPos) anim.pts.forEach((p, i) => i <= animPos!.f + 0.5 && reached.add(cellKey(p)));
  const trails: TrailDesc[] = [];
  const seen = new Set<string>();
  trailBusy = false;
  for (const t of visibleTrails(state)) {
    if (anim && anim.turn === t.turn && !reached.has(cellKey(t))) continue;
    if (occupied.has(cellKey(t))) continue;
    const kind = t.left >= 2 || level.trailLife === 1 ? 'tight' : 'loose';
    // nhớ lúc ô vệt xuất hiện và lúc nó chuyển sang đan lỏng để các chuyển tiếp chạy theo thời gian
    const mk = `${t.x},${t.y},${t.turn}`;
    seen.add(mk);
    let mem = trailMem.get(mk);
    if (!mem) trailMem.set(mk, (mem = { born: now, loose: kind === 'loose' ? -1e9 : null }));
    if (kind === 'loose' && mem.loose === null) mem.loose = now;
    const grow = ease01((now - mem.born) / (GROW_MS * SLOW));
    const loosen = kind === 'loose' && mem.loose !== null ? ease01((now - mem.loose) / (LOOSEN_MS * SLOW)) : 0;
    if (grow < 1 || (kind === 'loose' && loosen < 1)) trailBusy = true;
    const tc = colorForTurn(state, t.turn);
    const bid = Object.keys(state.balls).find((id) => colorOf(id) === tc);
    const bp = bid ? (anim && anim.id === bid && animPos ? animPos : state.balls[bid]) : null;
    const bl = bp ? Math.hypot(bp.x - t.x, bp.y - t.y) : 0;
    const toward = bp && bl > 1e-6 ? { x: (bp.x - t.x) / bl, y: (bp.y - t.y) / bl } : undefined;
    trails.push({ x: t.x, y: t.y, color: tc, kind, scale: 1, alpha: 1, seed: t.turn, dissolve: 0, toward, grow, loosen, pose: trailPose(t.x, t.y, now) });
  }
  for (const k of [...trailMem.keys()]) if (!seen.has(k)) trailMem.delete(k); // ô vệt mất đi rồi xuất hiện lại thì mọc lại từ đầu
  if (anim?.snake) {
    // ô vệt nằm sát khối đang chạy bị khối che nên bỏ qua (không thì tấm đan trùm lên khối)
    const near = (t: TrailDesc): boolean => !!animPos && Math.hypot(t.x - animPos.x, t.y - animPos.y) < 0.8;
    trails.push(...snakeDescs(anim, now - anim.t0, reached).filter((t) => !near(t)));
  }
  dissolves = dissolves.filter((d) => now - d.t0 < DISSOLVE_MS);
  for (const d of dissolves) {
    if (d.show && now < d.show) continue; // vệt của cú trượt thoát chưa được khối trải tới
    const len = d.ref ? Math.hypot(d.ref.x - d.x, d.ref.y - d.y) : 0;
    const toward = d.ref && len > 1e-6 ? { x: (d.ref.x - d.x) / len, y: (d.ref.y - d.y) / len } : undefined;
    const grow = d.show ? ease01((now - d.show) / (GROW_MS * SLOW)) : 1;
    trails.push({ x: d.x, y: d.y, color: d.color, kind: d.tight ? 'tight' : 'loose', scale: 1, alpha: 1, seed: d.seed, dissolve: Math.max(0, (now - d.t0) / DISSOLVE_MS), toward, expiring: true, grow, loosen: d.tight ? 0 : 1 });
  }

  // xem trước điểm dừng khi đang kéo
  let glowGate = '';
  let ghost: SceneDesc['ghost'] = null;
  let line: SceneDesc['line'] = null;
  if (drag?.dir && canAct()) {
    const back = undoDir(state, drag.id) === drag.dir && !slide(state, drag.id, drag.dir).ok ? state.history[drag.id].at(-1)!.from : null;
    const r = back ? null : slide(state, drag.id, drag.dir);
    if (back) {
      // kéo ngược theo vệt: khối sẽ quay về ô xuất phát (tốn 1 lượt, vệt tan)
      ghost = { x: back.x, y: back.y, color: colorOf(drag.id) };
      const rev = reversedPath(state.history[drag.id].at(-1)!);
      line = rev ? { from: state.balls[drag.id], to: back, path: rev.path, jumps: rev.jumps } : { from: state.balls[drag.id], to: back };
    } else if (r?.ok && r.to) {
      const from = state.balls[drag.id];
      if (r.exit) {
        // dừng sát giỏ cùng màu: giỏ sáng lên, khối sẽ bị hút ra
        glowGate = gateKeyAt(state.level, r.exit, r.to);
      } else {
        ghost = { x: r.to.x, y: r.to.y, color: colorOf(drag.id) };
      }
      line = { from, to: r.to, path: r.path, jumps: r.jumps };
    }
  }

  // giỏ chỉ hiện ✓ sau khi khối (và vệt của nó) đã vào hẳn
  // cửa hiện ✓ khi MỌI khối cùng màu với nó đã vào hẳn (mỗi màu một cửa, có thể nhận nhiều khối)
  const outIds = new Set(state.out.filter((id) => !(anim?.exit && anim.id === id)));
  const doneColors = new Set(level.gates.map((g) => g.color).filter((c) => level.balls.filter((b) => b.color === c).every((b) => outIds.has(b.id))));
  // cửa đang hút: tăng dần khi khối tới gần, tắt dần khi vệt cuối cùng vào hết
  let suck = 0;
  if (anim?.exit && anim.gateKey) {
    const el = now - anim.t0;
    suck = Math.min(1, Math.max(0, (el - anim.antic - anim.moveDur * 0.3) / 160)) * Math.min(1, Math.max(0, (anim.dur - el) / 200));
  }
  // Mốc cửa cắn: đúng lúc khối chui đủ sâu (unravel > 0.25), cùng thời điểm cửa bắn tung (xem scene3d.updateSuck).
  const kickOf = (t: number, key: string): number | undefined => {
    if (!gateKick || gateKick.key !== key) return undefined;
    const k = (t - gateKick.t0) / SLOW;
    return k >= 0 && k < 1500 ? k : undefined; // vẫn chạy tiếp sau khi hoạt ảnh thoát kết thúc
  };
  const gates: GateDesc[] = level.gates.map((g) => ({
    side: g.side,
    index: g.index,
    depth: g.depth,
    done: doneColors.has(g.color),
    glow: armed === 'basket', // khi kéo không còn làm cửa sáng lên, chỉ có đường chấm; chỉ sáng ở chế độ chọn giỏ của booster
    wild: state.wild.some((q) => gateKey(q) === gateKey(g)) && !(wildFx && wildFx.key === gateKey(g) && now < wildFx.t0 + WILD_FLY_MS * SLOW),
    flash: wildFx && wildFx.key === gateKey(g) ? wildFlash(now - (wildFx.t0 + WILD_FLY_MS * SLOW)) : 0,
    suck: anim?.gateKey === gateKey(g) ? suck : 0,
    kick: kickOf(now, gateKey(g)),
  }));

  impacts = impacts.filter((im) => now - im.t0 < 800);
  const poseOf = (id: string): Pose => {
    const im = impacts.find((x) => x.id === id);
    if (!im || now < im.t0) return IDENTITY;
    // khối bị đụng thì mặt chạm nằm ở phía ngược với hướng khối kia đâm vào
    return im.kind === 'hit' ? impactPose(im.dx, im.dy, now - im.t0, im.amp) : impactPose(-im.dx, -im.dy, now - im.t0, im.amp);
  };
  const balls: BallDesc[] = [];
  for (const [id, pos] of Object.entries(state.balls)) {
    if (anim && anim.id === id) continue;
    let shakeX = 0;
    if (shake && shake.id === id) {
      const t = (now - shake.t0) / 260;
      if (t < 1) shakeX = Math.sin(t * Math.PI * 6) * 0.07 * (1 - t);
      else shake = null;
    }
    const pose = poseOf(id);
    let bx = pos.x;
    let by = pos.y;
    let blift = drag?.id === id && drag.dir ? 0.06 : 0;
    const pa = pushAnims.get(id);
    if (pa) {
      const u = (now - pa.t0) / (PUSH_MS * SLOW);
      if (u >= 1) pushAnims.delete(id);
      else {
        const k = easeOutBack(Math.max(0, u));
        bx = pa.from.x + (pa.to.x - pa.from.x) * k;
        by = pa.from.y + (pa.to.y - pa.from.y) * k;
        blift += Math.sin(Math.PI * Math.max(0, u)) * 0.28;
      }
    }
    const w = idleWobble(id, now);
    balls.push({ id, x: bx, y: by, scale: 1, alpha: 1, lift: blift, ox: pose.ox + shakeX, oy: pose.oy, sx: pose.sx * w.sx, sy: pose.sy * w.sy, sz: pose.sz * w.sz, unravel: 0, pull: { x: 0, y: 0 } });
  }
  if (anim && animPos) {
    const pose = animPos.pose;
    balls.push({ id: anim.id, x: animPos.x, y: animPos.y, scale: animPos.scale, alpha: animPos.alpha, lift: 0.04 + (anim.arc ? Math.sin(Math.PI * Math.min(1, animPos.f / Math.max(1, anim.pts.length - 1))) * anim.arc : 0), ox: pose.ox, oy: pose.oy, sx: pose.sx, sy: pose.sy, sz: pose.sz, unravel: animPos.unravel, pull: anim.exit && anim.exitDir ? { x: anim.exitDir.x * 0.9, y: anim.exitDir.y * 0.9 } : { x: 0, y: 0 } });
  }
  // sợi chỉ nối mỗi khối với vệt của nó (cùng màu): đi từ khối qua các ô vệt, vệt mới nhất trước, ô gần nhất trước
  const threads: SceneDesc['threads'] = [];
  for (const b of balls) {
    if (b.unravel > 0 || b.alpha < 0.5) continue;
    const color = colorOf(b.id);
    threadDying = threadDying.filter((d) => now < d.b1);
    const dyingCells: TrailDesc[] = threadDying
      .filter((d) => d.color === color)
      .map((d) => ({ x: d.x, y: d.y, color, kind: 'loose', scale: 1, alpha: 1, seed: d.seed, dissolve: 0, expiring: true, grow: 1, loosen: 1 }));
    const mine = [...trails.filter((t) => t.color === color && !t.expiring && t.scale > 0.5), ...dyingCells];
    if (!mine.length) continue;
    const pts: { x: number; y: number; tight: boolean; dying?: boolean }[] = [{ x: b.x + b.ox, y: b.y + b.oy, tight: true }];
    const rest = [...mine].sort((p, q) => q.seed - p.seed);
    let cur = pts[0];
    while (rest.length) {
      const turn = rest[0].seed;
      let best = 0;
      for (let k = 1; k < rest.length && rest[k].seed === turn; k++) {
        if (Math.hypot(rest[k].x - cur.x, rest[k].y - cur.y) < Math.hypot(rest[best].x - cur.x, rest[best].y - cur.y)) best = k;
      }
      const t = rest.splice(best, 1)[0];
      cur = { x: t.x, y: t.y, tight: t.kind === 'tight', dying: !!t.expiring };
      pts.push(cur);
    }
    // phần chỉ trên các ô hết hạn đứt ra và tuột cùng lúc với các mũi đan của chúng
    const batchD = dissolves.find((d) => d.color === color);
    const unravel = batchD ? Math.min(1, Math.max(0, (now - batchD.b0) / (batchD.b1 - batchD.b0))) : 0;
    threads.push({ color, unravel, pts });
  }
  // ghim đang cắm (và ghim vừa hết hạn đang co lại)
  const pins: PinDesc[] = [];
  const seenPins = new Set<string>();
  pinBusy = false;
  for (const q of state.pins) {
    const key = `${q.x},${q.y},${q.turn}`;
    seenPins.add(key);
    let born = pinMem.get(key);
    if (born === undefined) pinMem.set(key, (born = now));
    const drop = Math.min(1, (now - born) / (PIN_DROP_MS * SLOW));
    if (drop < 1) pinBusy = true;
    pins.push({ x: q.x, y: q.y, drop, out: 0 });
  }
  for (const k of [...pinMem.keys()]) if (!seenPins.has(k)) pinMem.delete(k);
  pinDying = pinDying.filter((d) => now - d.t0 < PIN_OUT_MS * SLOW);
  for (const d of pinDying) pins.push({ x: d.x, y: d.y, drop: 1, out: (now - d.t0) / (PIN_OUT_MS * SLOW) });
  // đánh dấu mục tiêu hợp lệ của booster đang chờ chọn
  const marks: MarkDesc[] = [];
  if (armShow && !fx) {
    if (armShow === 'pin' || armShow === 'bomb') {
      for (let yy = 0; yy < state.level.height; yy++) for (let xx = 0; xx < state.level.width; xx++) if (armShow === 'pin' ? isPinnable(state, xx, yy) : isEmptyCell(state, xx, yy)) marks.push({ x: xx, y: yy, kind: 'cell' });
    } else if (armShow === 'magnet') {
      for (const [bid, bp] of Object.entries(state.balls)) if (magnetGate(state, bid)) marks.push({ x: bp.x, y: bp.y, kind: 'ball' });
    }
  }
  // hướng dẫn: chỉ còn đúng mục tiêu của bước
  const tsm = tutCur();
  if (tsm && tsm.kind === 'booster' && armShow === tsm.key) {
    const mv = tsm.move;
    const keep = marks.filter((q) => (mv.kind === 'pin' || mv.kind === 'bomb' ? q.x === mv.x && q.y === mv.y : mv.kind === 'magnet' ? q.x === state.balls[mv.id]?.x && q.y === state.balls[mv.id]?.y : false));
    marks.length = 0;
    marks.push(...keep);
  }
  // chế độ tập trung: các đối tượng được chọn vẽ lại sáng trên lớp tối; phần còn lại xám đi
  let focus: SceneDesc['focus'] = null;
  if (armShow && armAmt > 0.002 && !fx) {
    focus = {
      amount: Math.max(armAmt, tutAmt),
      cells: armShow === 'pin' || armShow === 'bomb' ? marks.map((q) => `${q.x},${q.y}`) : [],
      balls: armShow === 'magnet' ? marks.map((q) => Object.entries(state.balls).find(([, p]) => p.x === q.x && p.y === q.y)?.[0] ?? '').filter(Boolean) : [],
      gates: armShow === 'basket' ? (tsm && tsm.kind === 'booster' && tsm.move.kind === 'basket' ? [gateKey(tsm.move)] : state.level.gates.map((q) => gateKey(q))) : [],
    };
  } else if (tutShow && tutAmt > 0.002 && !fx && !anim) {
    const ts = tutShow;
    focus = {
      amount: tutAmt,
      cells: [],
      balls: ts.kind === 'slide' || ts.kind === 'undo' ? [ts.id] : [],
      gates: ts.kind === 'slide' && ts.gate ? [ts.gate] : [],
    };
  }
  const bomb = fx ? { x: fx.x, y: fx.y, t: (now - fx.t0) / 1000 / SLOW } : null;
  // Khi kéo chỉ xem trước đường đi (đường chấm); không còn khối mờ báo vị trí cuối.
  for (const b of balls) {
    b.hide = hideOf(b.id);
    b.ice = iceOf(b.id);
  }
  // điểm hoàn tác: ô mỗi khối sẽ quay về nếu kéo ngược theo vệt (ẩn khi đang di chuyển / kéo / chọn booster)
  const undoMarks: NonNullable<SceneDesc['undoMarks']> = [];
  if (canAct() && !anim && !armShow && !drag?.dir) {
    for (const id of Object.keys(state.balls)) {
      if (!undoDir(state, id)) continue;
      const tcur = tutCur();
      if (tcur && (tcur.kind !== 'undo' || tcur.id !== id)) continue; // đang hướng dẫn: chỉ hiện điểm gốc ở bước lùi lại, và chỉ của khối đó
      const to = state.history[id].at(-1)!.from;
      const hot = !!tcur && tcur.kind === 'undo';
      undoMarks.push({ x: to.x, y: to.y, color: colorOf(id), hot });
    }
  }
  return { balls, trails, gates, pins, marks, bomb, focus, threads, ghost: null, undoMarks, line };
}

function draw(now: number): void {
  updateArm(now);
  // xoay sắc độ dần tới chủ đề của level (≈ 0.45s); nền vẽ lại khi sắc độ đổi đủ nhiều
  if (Math.abs(themeTarget - theme.hue) > 0.05) {
    theme.hue += (themeTarget - theme.hue) * (1 - Math.exp(-uiDt / 150));
    if (Math.abs(themeTarget - theme.hue) <= 0.05) theme.hue = themeTarget;
    uiBusy = true;
  }
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const sizeKey = `${w}x${h}@${dpr}`;
  if (sizeKey !== sized) {
    sized = sizeKey;
    for (const cv of [canvas, bgCanvas]) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.drawBackground(bgCtx, w, h);
    themeBgHue = theme.hue;
    scene?.setSize(w, h, dpr);
    viewKey = '';
  } else if (Math.abs(theme.hue - themeBgHue) >= 0.4 || (theme.hue === themeTarget && theme.hue !== themeBgHue)) {
    R.drawBackground(bgCtx, w, h);
    themeBgHue = theme.hue;
  }
  // Camera 3D dựng lại khi đổi kích thước, đổi level hoặc đổi chiều cao hai thanh.
  const vk = `${sizeKey}|${TOP_BAR_H}|${BOTTOM_BAR_H}`;
  if (vk !== viewKey) {
    viewKey = vk;
    scene?.setView(boardRect(w, h), { w, h });
  }
  scene?.render(buildSceneDesc(now));

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const level = state.level;
  if (!scene) {
    // thiết bị không có WebGL: báo rõ thay vì để màn hình trống
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = K.font(22);
    ctx.fillText('3D graphics (WebGL) are not', w / 2, h / 2 - 16);
    ctx.fillText('supported on this device.', w / 2, h / 2 + 16);
  }

  // HUD trên: chỉ có chữ "Level N" và một khung nhỏ bên dưới chứa "Moves N" (không còn thanh trên, mascot hay panel).
  // Thanh dưới: các ô booster rồi nút cài đặt, chia đều theo chiều ngang.
  const remaining = Math.max(0, level.maxMoves - state.turn);
  const lvPop = statPop('level', index + 1, now);
  // chế độ chọn booster: nền đã được cảnh 3D làm tối; các phần HUD vẽ ở lớp 2D nên được làm mờ theo cùng mức thay vì phủ thêm tấm tối
  const dimAmt = Math.max(armAmt, tutAmt);
  const hudA = 1 - 0.9 * dimAmt;
  const intro = introAmts(now);
  if (boardExit) {
    const u = Math.min(1, (now - boardExit.t0) / BOARD_EXIT_MS);
    sceneCanvas.style.transform = `translateX(${(-110 * u * u * u).toFixed(2)}%)`; // easeInCubic: bàn cũ bay sang trái
  } else sceneCanvas.style.transform = Math.abs(1 - intro.board) < 0.0005 ? '' : `translateX(${((1 - intro.board) * 110).toFixed(2)}%)`;
  const topOff = (1 - intro.hud) * (TOP_BAR_H + 50);
  const bottomOff = (1 - intro.hud) * (BOTTOM_BAR_H + BTN_OVER + 70);
  ctx.save();
  ctx.translate(0, -topOff);
  ctx.save();
  ctx.globalAlpha = hudA;
  // "Level N" cùng nhãn độ khó (Hard / Very Hard) cạnh bên: cả nhóm căn giữa màn hình nên không tràn ở màn hẹp
  const lvText = `Màn ${index + 1}`;
  const tag = tierTag(LEVELS[index]?.tier);
  ctx.save();
  ctx.translate(w / 2, safeTop + 24);
  ctx.scale(lvPop, lvPop);
  K.strokedText(ctx, lvText, 0, 0, 24, '#ffffff', K.th('#204f8f'), 'center', 0.5);
  ctx.restore();
  // nhãn độ khó nằm ngay dưới chữ Level; có nhãn thì viên thuốc lượt đi lùi xuống một hàng
  const tagRow = tag ? 22 : 0;
  if (tag) drawTierTag(ctx, w / 2 - tierTagWidth(tag) / 2, safeTop + 47, tag);
  const mw = 112;
  const mh = 48;
  const mx = w / 2 - mw / 2;
  const my = safeTop + 44 + tagRow;
  cssBox(ctx, { x: mx, y: my, w: mw, h: mh, rx: 20, ry: 20 }, {
    stops: [[0, K.th('#6da4ff')], [1, K.th('#3f80d8')]],
    border: { w: 3, color: K.th('#204f8f') },
    outer: [{ dy: 4, spread: 0, blur: 0, color: K.th('#163c70') }],
    inset: [{ dy: 3, spread: 0, color: 'rgba(255,255,255,.3)' }],
  });
  // biểu tượng "lượt đi" (mũi tên) đứng trước số lượt còn lại; cả cụm căn giữa viên thuốc
  const mvPop = statPop('moves', remaining, now);
  const mvText = String(remaining);
  ctx.font = K.font(30);
  const numW = ctx.measureText(mvText).width;
  const icoS = 24;
  const icoW = icoS * 1.4;
  const gap = 7;
  const gx = w / 2 - (icoW + gap + numW) / 2;
  const mcy = my + mh / 2;
  drawMovesIcon(ctx, gx, mcy, icoS);
  ctx.save();
  ctx.translate(gx + icoW + gap + numW / 2, mcy + 1);
  ctx.scale(mvPop, mvPop);
  K.strokedText(ctx, mvText, 0, 0, 30, remaining <= 1 ? '#ff6b6b' : '#ffffff', remaining <= 1 ? '#6b0f1a' : K.th('#204f8f'), 'center', 0.5);
  ctx.restore();
  ctx.restore();
  ctx.restore();
  ctx.restore();
  ctx.save();
  ctx.translate(0, bottomOff);
  K.bottomBar(ctx, w, h, BOTTOM_BAR_H, dimAmt * 0.9);
  ctx.save();
  ctx.globalAlpha = hudA;
  // nút đang được dùng không vẽ ở đây: nó được vẽ lên lớp nằm trên lớp tối (drawArmedOverlay), vẫn là chính nút này
  BOOSTERS.forEach((b, i) => {
    if (armShow !== b.key && !(tutShow?.kind === 'booster' && tutShow.key === b.key && tutAmt > 0.002)) drawBoosterSlot(ctx, slotX(w, i), slotY(h), 27, b.key, slotState(b.key, now));
  });
  ctx.restore();
  ctx.restore();
  const br = boardRect(w, h);
  const pill = (text: string, cy: number, bg: string, alpha = 1): void => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = K.font(17);
    const tw = Math.min(w - 24, ctx.measureText(text).width + 44);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(w / 2 - tw / 2, cy - 19, tw, 38, 19);
    ctx.fill();
    K.strokedText(ctx, text, w / 2, cy, 17, '#ffffff', '#102a6c');
    ctx.restore();
  };
  if (toast && now < toast.until) pill(toast.text, br.y + 30, 'rgba(10,25,80,0.88)', Math.max(0, Math.min(1, (now - (toast.until - 1700)) / 160, (toast.until - now) / 260)));
  ctx.save();
  ctx.translate(0, bottomOff);
  ctx.globalAlpha = hudA;
  drawMenu(now, w, h);
  ctx.restore();
  drawArmedOverlay(now, w, h); // sau cùng nên cả bánh răng cũng bị tối đi
  drawTutorial(now, w, h);
  drawMagnetFx(now, w, h);
  drawWildStream(now, w, h);
  drawGateBadges(now, w, h);
  drawOutOfMoves(now, w, h);
  drawWinShow(now, w, h);
  impactFx.draw(ctx, now); // sóng xung kích + tia sao của cú đập (sống thêm một chút cả khi logo đã thu)
  drawModal(now, w, h);
  tickWinConfetti(now, w, h);
  confetti.draw(ctx, now, h); // pháo giấy vẽ trên cả popup thắng
}

function drawModal(now: number, w: number, h: number): void {
  modalButtons = [];
  const closing = !modal && modalOut && now - modalOut.t0 < MODAL_OUT_MS ? modalOut : null;
  const cur = modal ?? closing?.m ?? null;
  if (!cur) return;
  const fade = modal || !closing ? 1 : 1 - ease01((now - closing.t0) / MODAL_OUT_MS);
  if (cur.kind === 'new' || cur.kind === 'buy') drawBoosterModal(now, w, h, cur, fade);
  else drawResultModal(now, w, h, cur, fade);
  if (!modal) modalButtons = []; // popup đang đóng không nhận bấm
}

/** Khung chung của mọi popup: nền tối, hiệu ứng nảy ra / thu vào, rồi vẽ popup theo thiết kế CSS (css-ui.ts) và ghi vùng bấm. */
function drawModalFrame(now: number, w: number, h: number, m: ModalState, fade: number, spec: CssPopupSpec): void {
  const t = Math.min(1, (now - m.t0) / 280);
  const pop = (1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)) * (0.94 + 0.06 * fade);
  const cx = w / 2;
  const cy = h / 2;
  ctx.save();
  ctx.fillStyle = `rgba(2,6,16,${0.86 * Math.min(1, t * 2) * fade})`;
  ctx.fillRect(0, 0, w, h);
  ctx.translate(cx, cy);
  ctx.scale(pop, pop);
  ctx.globalAlpha = Math.min(1, t * 2.5) * fade;
  const r = drawCssPopup(ctx, w, spec);
  ctx.restore();
  modalCard = { x: cx + r.popup.x, y: cy + r.popup.y, w: r.popup.w, h: r.popup.h };
  modalButtons.push({ id: 'primary', x: cx + r.play.x, y: cy + r.play.y, w: r.play.w, h: r.play.h });
  if (r.close) modalButtons.push({ id: 'secondary', x: cx + r.close.x, y: cy + r.close.y, w: r.close.w, h: r.close.h });
}

const FEATURE_BAR_H = 66;

/** Ổ khoá: thân bo góc có số tuỳ chọn, quai khoá phía trên. `s` là chiều rộng thân. */
function drawPadlock(c: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string, label?: string): void {
  c.save();
  c.lineCap = 'round';
  c.lineWidth = s * 0.14;
  c.strokeStyle = '#234a73';
  c.beginPath();
  c.arc(cx, cy - s * 0.06, s * 0.24, Math.PI, 0);
  c.lineTo(cx + s * 0.24, cy + s * 0.04);
  c.moveTo(cx - s * 0.24, cy - s * 0.06);
  c.lineTo(cx - s * 0.24, cy + s * 0.04);
  c.stroke();
  c.lineWidth = s * 0.07;
  c.strokeStyle = '#e8f4ff';
  c.stroke();
  c.beginPath();
  c.roundRect(cx - s * 0.36, cy + s * 0.0, s * 0.72, s * 0.5, s * 0.12);
  c.fillStyle = color;
  c.fill();
  c.lineWidth = s * 0.06;
  c.strokeStyle = '#234a73';
  c.stroke();
  if (label) K.strokedText(c, label, cx, cy + s * 0.26, s * 0.4, '#ffffff', '#234a73', 'center', 0.5);
  c.restore();
}

/** Mặt trời (cổng đang mở) hoặc trăng khuyết (cổng đang đóng), bán kính `r`. */
function drawSunMoon(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, open: boolean): void {
  c.save();
  if (open) {
    c.strokeStyle = '#ff9d1c';
    c.lineWidth = Math.max(2, r * 0.2);
    c.lineCap = 'round';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7);
      c.lineTo(cx + Math.cos(a) * r * 1.0, cy + Math.sin(a) * r * 1.0);
      c.stroke();
    }
    const g = c.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r * 0.6);
    g.addColorStop(0, '#fff3a0');
    g.addColorStop(1, '#ffc21f');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = Math.max(1.5, r * 0.1);
    c.strokeStyle = '#b8650a';
    c.stroke();
  } else {
    c.fillStyle = '#c8d4ee';
    c.beginPath();
    c.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(cx + r * 0.3, cy - r * 0.16, r * 0.52, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();
}

/** Tween huy hiệu cổng (khoá/nhịp) theo khoá cổng: 0..1. */
const badgeAmt = new Map<string, number>();

/** Huy hiệu trên cổng: cổng đóng băng hiện ổ khoá kèm số khối còn phải thoát; cổng theo nhịp hiện mặt trời (đang mở cho lượt sau) hoặc trăng (đóng). */
function drawGateBadges(now: number, w: number, h: number): void {
  if (!scene) return;
  const lvl = state.level;
  for (const g of lvl.gates) {
    if (!g.lock && !g.rhythm) continue;
    const key = gateKey(g);
    const sp = scene.gateScreen(g.side, g.index, g.depth);
    if (!sp) continue;
    const remain = g.lock ? Math.max(0, g.lock - state.out.length) : 0;
    const isOut = state.balls && Object.keys(state.balls).length === 0;
    let target = 1;
    if (g.lock && !g.rhythm && remain === 0) target = 0; // mở hẳn: ổ khoá tan đi
    if (isOut) target = 0;
    let v = badgeAmt.get(key);
    if (v === undefined) v = target;
    v += (target - v) * (1 - Math.exp(-uiDt / 110));
    if (Math.abs(target - v) < 0.01) v = target;
    else uiBusy = true;
    badgeAmt.set(key, v);
    if (v < 0.02) continue;
    // huy hiệu nằm trên thân cổng (hơi nhích ra ngoài), không tràn khỏi màn hình
    const off = { up: [0, -4], down: [0, 4], left: [-4, 0], right: [4, 0] }[g.side];
    const px = sp.x + off[0];
    const py = sp.y + off[1];
    ctx.save();
    ctx.globalAlpha = v * (1 - 0.9 * Math.max(armAmt, tutAmt));
    ctx.translate(px, py);
    ctx.scale(0.8 + 0.2 * v, 0.8 + 0.2 * v);
    ctx.fillStyle = 'rgba(14,40,80,.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = g.rhythm ? '#ffc21f' : '#8fd3ff';
    ctx.stroke();
    if (g.rhythm) {
      const open = gateOpen(state, g, state.turn + 1);
      drawSunMoon(ctx, 0, 0, 12, open);
      // chữ nhỏ chỉ lượt chẵn/lẻ ở dưới huy hiệu
      K.strokedText(ctx, g.rhythm === 'even' ? 'CHẴN' : 'LẺ', 0, 27, 11, '#ffffff', '#16345f', 'center', 0.5);
    } else drawPadlock(ctx, 0, -2, 22, '#6fc3f0', String(remain));
    ctx.restore();
  }
}


/** Mũi tên hai đầu (↔) trắng viền xanh đậm, dùng làm hình minh hoạ của thạch một trục. */
function drawAxisArrow(c: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  c.save();
  c.translate(cx, cy);
  c.beginPath();
  c.moveTo(-0.5 * s, 0);
  c.lineTo(-0.24 * s, -0.24 * s);
  c.lineTo(-0.24 * s, -0.09 * s);
  c.lineTo(0.24 * s, -0.09 * s);
  c.lineTo(0.24 * s, -0.24 * s);
  c.lineTo(0.5 * s, 0);
  c.lineTo(0.24 * s, 0.24 * s);
  c.lineTo(0.24 * s, 0.09 * s);
  c.lineTo(-0.24 * s, 0.09 * s);
  c.lineTo(-0.24 * s, 0.24 * s);
  c.closePath();
  c.lineJoin = 'round';
  c.lineWidth = Math.max(2, s * 0.09);
  c.strokeStyle = '#204f8f';
  c.stroke();
  c.fillStyle = '#ffffff';
  c.fill();
  c.restore();
}

/** Hình minh hoạ của một tính năng trong huy hiệu tròn: booster dùng biểu tượng của nó, mechanic có hình riêng. */
function drawFeatureIcon(c: CanvasRenderingContext2D, f: Feature, cx: number, cy: number, s: number): void {
  if (f.kind === 'booster') {
    drawBoosterIcon(c, f.key as BoosterKey, cx, cy, s);
    return;
  }
  if (f.key === 'axis') {
    // khối thạch hồng vuông bo góc có vệt sáng, mũi tên hai đầu in ngang qua mặt
    const bs = s * 0.92;
    c.beginPath();
    c.roundRect(cx - bs / 2, cy - bs / 2, bs, bs, bs * 0.28);
    const g = c.createLinearGradient(0, cy - bs / 2, 0, cy + bs / 2);
    g.addColorStop(0, '#ffa6bd');
    g.addColorStop(1, '#e8305e');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = Math.max(2, s * 0.07);
    c.strokeStyle = '#7d1238';
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.5)';
    c.beginPath();
    c.ellipse(cx - bs * 0.2, cy - bs * 0.3, bs * 0.18, bs * 0.08, -0.4, 0, Math.PI * 2);
    c.fill();
    drawAxisArrow(c, cx, cy + bs * 0.04, bs * 0.78);
    return;
  }
  if (f.key === 'hidden') {
    // thạch xám vuông bo góc với dấu ?
    const bs = s * 0.92;
    c.beginPath();
    c.roundRect(cx - bs / 2, cy - bs / 2, bs, bs, bs * 0.28);
    const g = c.createLinearGradient(0, cy - bs / 2, 0, cy + bs / 2);
    g.addColorStop(0, '#d5dcea');
    g.addColorStop(1, '#8e9ab2');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = Math.max(2, s * 0.07);
    c.strokeStyle = '#46526e';
    c.stroke();
    K.strokedText(c, '?', cx, cy + bs * 0.04, bs * 0.7, '#ffffff', '#204f8f', 'center', 0.5);
    return;
  }
  if (f.key === 'arrows') {
    // ô băng chuyền xanh với ba chevron chỉ lên
    const bs = s * 0.92;
    c.beginPath();
    c.roundRect(cx - bs / 2, cy - bs / 2, bs, bs, bs * 0.24);
    const g = c.createLinearGradient(0, cy - bs / 2, 0, cy + bs / 2);
    g.addColorStop(0, '#5fa8ff');
    g.addColorStop(1, '#2f6fd6');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = Math.max(2, s * 0.07);
    c.strokeStyle = '#1b4aa0';
    c.stroke();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const dy of [0.22, 0, -0.22]) {
      c.beginPath();
      c.moveTo(cx - bs * 0.24, cy + bs * (dy + 0.1));
      c.lineTo(cx, cy + bs * (dy - 0.08));
      c.lineTo(cx + bs * 0.24, cy + bs * (dy + 0.1));
      c.lineWidth = bs * 0.13;
      c.strokeStyle = '#ffffff';
      c.stroke();
    }
    return;
  }
  if (f.key === 'portals') {
    // vòng xoáy tím có vành
    const r = s * 0.5;
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, '#f2e6ff');
    g.addColorStop(1, '#a05cff');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = Math.max(3, s * 0.1);
    c.strokeStyle = '#6a2fc8';
    c.stroke();
    c.strokeStyle = '#ffffff';
    c.lineWidth = Math.max(2, s * 0.07);
    c.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      for (let t = 0; t <= 1; t += 0.1) {
        const rr = r * (0.2 + 0.62 * t);
        const a = t * 3.2 + (k * Math.PI * 2) / 3;
        c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      c.stroke();
    }
    return;
  }
  if (f.key === 'frozen') {
    // thạch hồng trong khối băng xanh nhạt với bông tuyết
    const bs = s * 0.92;
    c.beginPath();
    c.roundRect(cx - bs / 2, cy - bs / 2, bs, bs, bs * 0.24);
    const g = c.createLinearGradient(0, cy - bs / 2, 0, cy + bs / 2);
    g.addColorStop(0, '#eaf8ff');
    g.addColorStop(1, '#9fd4f5');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = Math.max(2, s * 0.07);
    c.strokeStyle = '#4d8fbf';
    c.stroke();
    c.beginPath();
    c.roundRect(cx - bs * 0.27, cy - bs * 0.27, bs * 0.54, bs * 0.54, bs * 0.14);
    c.fillStyle = '#ff6f9f';
    c.fill();
    c.strokeStyle = '#ffffff';
    c.lineWidth = Math.max(2, s * 0.05);
    c.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * bs * 0.4, cy + Math.sin(a) * bs * 0.4);
      c.lineTo(cx - Math.cos(a) * bs * 0.4, cy - Math.sin(a) * bs * 0.4);
      c.stroke();
    }
    return;
  }
  if (f.key === 'lock') {
    drawPadlock(c, cx, cy, s * 0.95, '#6fc3f0');
    return;
  }
  if (f.key === 'rhythm') {
    drawSunMoon(c, cx, cy, s * 0.5, true);
    return;
  }
  if (f.key === 'sticky') {
    // tấm mật ong vuông bo góc phủ kín ô, với bọt
    const bs = s * 0.96;
    c.beginPath();
    c.roundRect(cx - bs / 2, cy - bs / 2 + bs * 0.04, bs, bs, bs * 0.24);
    c.fillStyle = '#e5870a';
    c.fill();
    c.beginPath();
    c.roundRect(cx - bs / 2, cy - bs / 2, bs, bs, bs * 0.24);
    const g = c.createLinearGradient(0, cy - bs / 2, 0, cy + bs / 2);
    g.addColorStop(0, '#ffe08a');
    g.addColorStop(1, '#ffa81f');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = Math.max(2, s * 0.06);
    c.strokeStyle = '#a85a00';
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.75)';
    for (const [bx, by, br] of [[-0.22, -0.2, 0.09], [0.2, 0.12, 0.06], [-0.05, 0.26, 0.045]] as const) {
      c.beginPath();
      c.arc(cx + bs * bx, cy + bs * by, bs * br, 0, Math.PI * 2);
      c.fill();
    }
    return;
  }
  c.fillStyle = '#ffffff';
  c.font = K.font(s);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('?', cx, cy);
}

/**
 * Thanh tiến trình "New Feature" (như hình mẫu): nhãn bên trên, thanh xanh lá trong khung nâu viền cam có chữ phần trăm, huy hiệu tròn ở đầu phải
 * chứa hình minh hoạ của tính năng sắp tới. `shown` là mức đang hiển thị 0..1; `ready` (đã đầy) thì huy hiệu nhấp nháy nhẹ.
 */
function drawFeatureBar(c: CanvasRenderingContext2D, x: number, y: number, w: number, shown: number, f: Feature, now: number, ready: boolean): void {
  K.strokedText(c, 'Tính năng mới', x + 10, y + 10, 19, '#ffffff', '#6b3a1c', 'left', 0.5);
  const bh = 26;
  const by = y + 24;
  const bx = x + 6;
  const bw = w - 12 - 30; // chừa chỗ cho huy hiệu
  // khung: nâu, viền cam
  cssBox(c, { x: bx, y: by, w: bw, h: bh, rx: bh / 2, ry: bh / 2 }, {
    stops: [[0, '#8a4a22'], [1, '#6b3a1c']],
    border: { w: 3, color: '#f08a2a' },
  });
  // phần đã đầy: xanh lá, đầu tròn
  const iw = bw - 8;
  const fw = Math.max(0, iw * Math.max(0, Math.min(1, shown)));
  if (fw > 1) {
    c.save();
    c.beginPath();
    c.roundRect(bx + 4, by + 4, fw, bh - 8, (bh - 8) / 2);
    c.clip();
    const g = c.createLinearGradient(0, by + 4, 0, by + bh - 4);
    g.addColorStop(0, '#9af26a');
    g.addColorStop(0.5, '#44c030');
    g.addColorStop(1, '#2b9a22');
    c.fillStyle = g;
    c.fillRect(bx + 4, by + 4, Math.max(fw, bh - 8), bh - 8);
    c.fillStyle = 'rgba(255,255,255,.3)';
    c.fillRect(bx + 4, by + 5, fw, 4);
    c.restore();
  }
  K.strokedText(c, `${Math.round(shown * 100)}%`, bx + bw / 2, by + bh / 2 + 1, 16, '#ffffff', '#20591a', 'center', 0.5);
  // huy hiệu tròn ở đầu phải: viền cam, nền nâu, hình minh hoạ
  const r = 29;
  const cx = x + w - r - 2;
  const cy = by + bh / 2;
  const pulse = ready ? 1 + 0.06 * Math.sin(now / 160) : 1;
  c.save();
  c.translate(cx, cy);
  c.scale(pulse, pulse);
  c.fillStyle = '#c8681a';
  c.beginPath();
  c.arc(0, 2, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#f08a2a';
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#6b3a1c';
  c.beginPath();
  c.arc(0, 0, r - 5, 0, Math.PI * 2);
  c.fill();
  drawFeatureIcon(c, f, 0, 0, r * (f.kind === 'booster' ? 0.82 : 1.2));
  c.restore();
}

function drawResultModal(now: number, w: number, h: number, modal: ModalState, fade: number): void {
  if (modal.kind === 'mechanic') return drawMechanicModal(now, w, h, modal, fade);
  if (modal.kind === 'continue') return drawContinueModal(now, w, h, modal, fade);
  if (modal.kind === 'fail') return drawFailModal(now, w, h, modal, fade);
  const label = !modal.last ? 'Màn tiếp' : 'Chơi lại';
  drawModalFrame(now, w, h, modal, fade, {
    title: `Màn ${modal.lv}`,
    panelTitle: 'Hoàn thành!',
    button: { label, press: pressOf('modal:primary') },
    compact: true,
    content: (c, x, y, pw, draw) => {
      // popup thắng: một đồng xu vàng, rồi thanh tiến trình tới tính năng mới kế tiếp (nếu còn)
      const prog = featureProgress(FEATURES, modal.lv);
      const side = pw * (prog ? 0.3 : 0.4);
      if (draw) drawCoin(c, x + pw / 2, y + side / 2, side / 2);
      if (!prog) return side + 6;
      if (draw) {
        // thanh chạy từ mức trước lên mức mới sau khi popup đã hiện xong
        const u = Math.max(0, Math.min(1, (now - modal.t0 - 450) / 700));
        const shown = prog.pctBefore + (prog.pct - prog.pctBefore) * (1 - Math.pow(1 - u, 3));
        drawFeatureBar(c, x, y + side + 12, pw, shown, prog.next, now, u >= 1 && prog.pct >= 1);
      }
      return side + 12 + FEATURE_BAR_H + 4;
    },
  });
}

/** Popup giới thiệu mechanic mới: tên, hình minh hoạ lớn và một đoạn mô tả; nút "Got it". Không ép nước đi nào. */
function drawMechanicModal(now: number, w: number, h: number, modal: ModalState, fade: number): void {
  const info = modal.mech ? MECHANICS[modal.mech] : undefined;
  const feat = FEATURES.find((f) => f.kind === 'mechanic' && f.key === modal.mech);
  drawModalFrame(now, w, h, modal, fade, {
    title: 'Cơ chế mới!',
    panelTitle: info?.name ?? '',
    button: { label: 'Đã hiểu', press: pressOf('modal:primary') },
    compact: true,
    content: (c, x, y, pw, draw) => {
      // cùng công thức bố cục với popup booster: hình, khoảng cách, rồi các dòng mô tả cách đều
      const slot = pw * 0.24;
      c.save();
      c.font = K.font(16);
      const lines = wrapLines(info?.desc ?? '', pw);
      c.restore();
      const lineH = 21;
      if (draw) {
        if (feat) drawFeatureIcon(c, feat, x + pw / 2, y + slot / 2 + 2, slot * 1.0);
        c.fillStyle = '#265799';
        c.font = K.font(16);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        lines.forEach((ln, i) => c.fillText(ln, x + pw / 2, y + slot + 12 + lineH / 2 + i * lineH));
      }
      return slot + 6 + 12 + lines.length * lineH;
    },
  });
}

/** Popup mời thêm lượt: "+5 Moves", nút Continue; X (hoặc huỷ) là bỏ cuộc. */
function drawContinueModal(now: number, w: number, h: number, modal: ModalState, fade: number): void {
  drawModalFrame(now, w, h, modal, fade, {
    title: 'Chơi tiếp?',
    panelTitle: '',
    button: { label: 'Nhận mình gà', press: pressOf('modal:primary') },
    close: { press: pressOf('modal:secondary') },
    compact: true,
    content: (c, x, y, pw, draw) => {
      const hgt = pw * 0.42;
      if (draw) {
        // viền mảnh và bóng nhẹ (đổ rất ngắn, mờ)
        const big = hgt * 0.78;
        cssText(c, `+${REVIVE_MOVES}`, x + pw / 2, y + hgt * 0.42, big, '#ffd93b', { w: big * 0.045, color: '#a85a00' }, { dy: big * 0.02, color: 'rgba(138,67,0,.45)' });
        const small = hgt * 0.34;
        cssText(c, 'Lượt', x + pw / 2, y + hgt * 0.9, small, '#ffffff', { w: small * 0.07, color: '#2c67c0' }, { dy: small * 0.03, color: 'rgba(32,79,143,.4)' });
      }
      return hgt + 6;
    },
  });
}

/** Popup thua: chỉ tiêu đề Fail, trái tim vỡ ở giữa và nút Restart. */
function drawFailModal(now: number, w: number, h: number, modal: ModalState, fade: number): void {
  drawModalFrame(now, w, h, modal, fade, {
    title: 'Thua',
    panelTitle: '',
    button: { label: 'Chơi lại', press: pressOf('modal:primary') },
    compact: true,
    content: (c, x, y, pw, draw) => {
      const side = pw * 0.62;
      if (draw) drawBrokenHeart(c, x + pw / 2, y + side / 2 + 4, side);
      return side + 10;
    },
  });
}

/** Pháo giấy của popup thắng: hai đợt, trái trước rồi 160ms sau phải. */
function tickWinConfetti(now: number, w: number, h: number): void {
  if (!winConfetti) return;
  const t = now - winConfetti.t0;
  if (winConfetti.bursts < 1) {
    confetti.burst(-1, w, h, now, 130);
    play('confettiPop');
    winConfetti.bursts = 1;
  }
  if (winConfetti.bursts < 2 && t >= WIN_RIGHT_MS) {
    confetti.burst(1, w, h, now, 130);
    play('confettiPop');
    winConfetti.bursts = 2;
  }
  if (winConfetti.bursts >= 2) {
    winConfetti = null; // chỉ hai đợt: trái rồi phải
    return;
  }
  invalidate();
}

/** Màn trình diễn khi thắng: nền tối nhẹ, logo Jelly Slide hiện từng chữ, đập xuống; cuối cùng logo thu nhỏ và mờ đi (pháo giấy dành cho lúc popup hiện). */
function drawWinShow(now: number, w: number, h: number): void {
  if (!winShow) return;
  const t = now - winShow.t0;
  if (t < 0) return;
  // cú đập của logo: sóng xung kích + tia sao, tiếng thịch và rung haptic (pháo giấy dành cho lúc popup hiện)
  const logoW = Math.min(w * 0.74, 380);
  // mỗi chữ chạm đáy là một nốt trên thang ngũ cung
  while (winShow.letters < LOGO_LETTER_HITS_MS.length && t >= LOGO_LETTER_HITS_MS[winShow.letters]) {
    play('letter', winShow.letters);
    winShow.letters++;
  }
  if (winShow.bursts < 1 && t >= LOGO_IMPACT_MS) {
    impactFx.trigger(w / 2, h * 0.38, logoW, logoW * 0.75, now);
    play('slam');
    buzz(30);
    winShow.bursts = 1;
  }
  const exit = Math.max(0, Math.min(1, (t - WIN_EXIT_START_MS) / WIN_EXIT_MS));
  const dim = Math.min(1, t / 300) * (1 - exit);
  ctx.save();
  ctx.fillStyle = `rgba(2,6,16,${0.42 * dim})`;
  ctx.fillRect(0, 0, w, h);
  const flash = logoFlash(t);
  if (exit <= 0 && flash <= 0) drawLogo(ctx, w / 2, h * 0.38, logoW, t, exit);
  else {
    // mờ dần: vẽ logo vào lớp phụ rồi làm mờ cả lớp, để các nét viền chồng nhau không lộ ra như bóng ma
    if (!logoLayer || logoLayer.width !== canvas.width || logoLayer.height !== canvas.height) {
      logoLayer = document.createElement('canvas');
      logoLayer.width = canvas.width;
      logoLayer.height = canvas.height;
    }
    const lc = logoLayer.getContext('2d')!;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, logoLayer.width, logoLayer.height);
    lc.setTransform(ctx.getTransform());
    drawLogo(lc, w / 2, h * 0.38, logoW, t, exit);
    if (flash > 0) {
      // chớp sáng: phủ trắng lên đúng phần có chữ (source-atop)
      lc.save();
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.globalCompositeOperation = 'source-atop';
      lc.fillStyle = `rgba(255,255,255,${flash})`;
      lc.fillRect(0, 0, logoLayer.width, logoLayer.height);
      lc.restore();
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1 - exit;
    ctx.drawImage(logoLayer, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

const backOutK = (t: number, k: number): number => 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2);
const backInK = (t: number, k: number): number => (k + 1) * t * t * t - k * t * t;

/** Chữ "Out of Moves": từ trên cao xuống giữa màn (outback nhẹ), giữ, thụt lại (inback nhẹ) rồi bay xuống dưới; nền tối nhẹ chạy theo. */
function drawOutOfMoves(now: number, w: number, h: number): void {
  if (!loseBanner) return;
  const t = now - loseBanner.t0;
  const total = OOM_IN_MS + OOM_HOLD_MS + OOM_OUT_MS;
  if (t < 0 || t > total) return;
  const yTop = -60;
  const yMid = h * 0.42;
  const yBot = h + 80;
  let y = yMid;
  let dim = 1;
  if (t < OOM_IN_MS) {
    const u = t / OOM_IN_MS;
    y = yTop + (yMid - yTop) * backOutK(u, 0.8);
    dim = u;
  } else if (t >= OOM_IN_MS + OOM_HOLD_MS) {
    const u = (t - OOM_IN_MS - OOM_HOLD_MS) / OOM_OUT_MS;
    y = yMid + (yBot - yMid) * backInK(u, 0.8);
    dim = 1 - u;
  }
  ctx.save();
  ctx.fillStyle = `rgba(2,6,16,${0.5 * dim})`;
  ctx.fillRect(0, 0, w, h);
  const size = Math.min(60, w * 0.12);
  // khung dài vắt ngang cả màn hình, chạy cùng chữ: nền đỏ có hai đường viền tối ở mép trên và dưới
  const bh = size * 2.2;
  const by = y - bh / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#6b0f1d';
  ctx.fillRect(-20, by, w + 40, bh);
  ctx.restore();
  const g = ctx.createLinearGradient(0, by, 0, by + bh);
  g.addColorStop(0, '#f0485f');
  g.addColorStop(1, '#bd1630');
  ctx.fillStyle = g;
  ctx.fillRect(-20, by + 5, w + 40, bh - 10);
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fillRect(-20, by + 5, w + 40, 3);
  K.strokedText(ctx, 'Hết lượt', w / 2, y + 1, size, '#ffffff', '#6b0f1d', 'center', 0.55);
  ctx.restore();
}

/** Mức tập trung 0..1 của chế độ chọn mục tiêu, chạy dần về đích để mọi thứ hiện/tắt bằng alpha. `armShow` giữ booster đang hiển thị khi tắt dần. */
let armAmt = 0;
let armShow: BoosterKey | null = null;
let armT = 0;
/** Mốc chuyển tiếp của HUD: mức khoá của từng nút, lần đổi số lượng gần nhất, lần đổi con số Level/Moves gần nhất. */
const slotLockMem: Partial<Record<BoosterKey, number>> = {};
const badgeMem: Partial<Record<BoosterKey, { count: number; t0: number }>> = {};
const statMem: Partial<Record<'level' | 'moves', { v: number; t0: number }>> = {};
let uiDt = 16;
/** Mức bấm xuống 0..1 của từng nút (khoá theo id), chạy dần về đích; `pressedId` là nút đang giữ. */
const pressAmt = new Map<string, number>();
let pressedId: string | null = null;
const pressOf = (id: string): number => pressAmt.get(id) ?? 0;
function press(id: string | null): void {
  pressedId = id;
  invalidate();
}
function updatePress(dt: number): void {
  const ids = new Set<string>(pressAmt.keys());
  if (pressedId) ids.add(pressedId);
  for (const id of ids) {
    const target = pressedId === id ? 1 : 0;
    let v = pressAmt.get(id) ?? 0;
    v += (target - v) * (1 - Math.exp(-dt / 45));
    if (Math.abs(target - v) < 0.01) {
      if (target === 0) {
        pressAmt.delete(id);
        continue;
      }
      v = 1;
    } else uiBusy = true;
    pressAmt.set(id, v);
  }
}
/** Còn chuyển tiếp HUD đang chạy: cần vẽ tiếp khung sau. */
let uiBusy = false;

function slotState(key: BoosterKey, now: number): BoosterSlotState {
  const target = index + 1 < unlockLevel(key) ? 1 : 0;
  let lk = slotLockMem[key];
  if (lk === undefined) lk = target;
  else {
    lk += (target - lk) * (1 - Math.exp(-uiDt / 110));
    if (Math.abs(target - lk) < 0.004) lk = target;
    else uiBusy = true;
  }
  slotLockMem[key] = lk;
  const count = countOf(key);
  let bm = badgeMem[key];
  if (!bm) badgeMem[key] = bm = { count, t0: -1e9 };
  else if (bm.count !== count) {
    bm.count = count;
    bm.t0 = now;
  }
  const u = (now - bm.t0) / 340;
  let pop = 1;
  if (u < 1) {
    pop = 1 + 0.55 * Math.sin(Math.PI * u) * (1 - 0.35 * u);
    uiBusy = true;
  }
  return { lock: lk, unlock: unlockLevel(key), count, arm: armShow === key ? armAmt : 0, pop, press: pressOf(`slot:${key}`), t: now / 1000 };
}

/** Hệ số nảy của con số trên panel Level/Moves khi giá trị đổi. */
function statPop(key: 'level' | 'moves', v: number, now: number): number {
  let m = statMem[key];
  if (!m) statMem[key] = m = { v, t0: -1e9 };
  else if (m.v !== v) {
    m.v = v;
    m.t0 = now;
  }
  const u = (now - m.t0) / 340;
  if (u >= 1) return 1;
  uiBusy = true;
  return 1 + 0.4 * Math.sin(Math.PI * u) * (1 - 0.3 * u);
}

function updateArm(now: number): void {
  uiBusy = false;
  const target = armed ? 1 : 0;
  if (armed) armShow = armed;
  const dt = armT ? Math.min(64, now - armT) : 16;
  uiDt = dt;
  updatePress(dt);
  armT = now;
  armAmt += (target - armAmt) * (1 - Math.exp(-dt / 85));
  if (Math.abs(target - armAmt) < 0.004) armAmt = target;
  if (armAmt === 0 && !armed) armShow = null;
  // hướng dẫn: bật khi bước đang chờ người chơi (không có hoạt ảnh/popup/mở màn), tắt dần khi đang chạy hoạt ảnh
  const st = tutCur();
  if (st) tutShow = st;
  const want = st && !newQueue.length && !pendingMech && !modal && !menu.open && !paused && !ended && !introActive(now) && !anim && !fx && !wildFx ? 1 : 0;
  tutAmt += (want - tutAmt) * (1 - Math.exp(-dt / 85));
  if (Math.abs(want - tutAmt) < 0.004) tutAmt = want;
  if (tutAmt === 0 && !st) tutShow = null;
}

/** Bàn tay chỉ: hình bàn tay trắng viền xanh, đầu ngón trỏ ở (x, y). `press` 0..1 làm tay chúi xuống như đang ấn. */
function drawHand(x: number, y: number, alpha: number, press: number): void {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  const sc = 1 - 0.1 * press;
  ctx.scale(sc, sc);
  ctx.rotate(-0.18);
  // đầu ngón trỏ ở (0,0); ngón trỏ chìa thẳng ra, ba ngón gập lại nằm thấp hơn, bàn tay bên dưới, ngón cái khép vào lòng bàn tay
  const shapes: [number, number, number, number, number][] = [
    [-7, 0, 15, 62, 7.5], // ngón trỏ chìa thẳng ra, thon và ngắn
    [8, 36, 14, 28, 7], // ngón giữa gập
    [20, 40, 13, 26, 6.5], // ngón áp út gập
    [31, 46, 12, 22, 6], // ngón út gập
    [-17, 48, 62, 42, 19], // bàn tay
  ];
  const path = (): void => {
    ctx.beginPath();
    for (const [rx, ry, rw, rh, rr] of shapes) ctx.roundRect(rx, ry, rw, rh, rr);
    ctx.moveTo(9, 70); // ngón cái: khép vào lòng bàn tay, gần như nằm trọn trong viền bàn tay
    ctx.ellipse(-4, 70, 13, 8, -0.25, 0, Math.PI * 2);
  };
  ctx.shadowColor = 'rgba(0,20,70,.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#204f8f';
  path();
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#ffffff';
  path();
  ctx.fill();
  // nếp giữa các ngón
  ctx.strokeStyle = '#b9ccef';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const lx of [8, 20, 31]) {
    ctx.moveTo(lx, 52);
    ctx.lineTo(lx, 64);
  }
  ctx.stroke();
  ctx.restore();
}

/** Nam châm ở cổng: nảy ra, rung nhẹ khi hút; tia chấm vàng chạy từ khối được chọn về cổng (vẽ đè lên mọi vật cản) rồi mờ đi sau khi khối vào cổng. */
function drawMagnetFx(now: number, w: number, h: number): void {
  const m = magnetFx;
  if (!m || !scene) return;
  if (now > m.endAt + 250) {
    magnetFx = null;
    invalidate();
    return;
  }
  const gp = scene.gateScreen(m.gate.side, m.gate.index, m.gate.depth);
  const jp = scene.cellScreen(m.from.x, m.from.y);
  if (!gp) return;
  const t = now - m.t0;
  const out = m.endAt === Infinity ? 0 : Math.min(1, Math.max(0, (now - m.endAt) / 250));
  const pop = easeOutBackIntro(t / 260);
  const beamOn = m.endAt === Infinity ? Math.min(1, Math.max(0, (t - 150) / 250)) : now < m.endAt - 450 ? 1 : Math.max(0, 1 - (now - (m.endAt - 450)) / 250);
  const u = cellPx();
  ctx.save();
  ctx.globalAlpha = 1 - out;
  if (jp && beamOn > 0.01) {
    // luồng gió hút: các vệt gió trắng chạy từ khối về phía nam châm, càng lúc càng nhanh (như bị hút)
    const dx = gp.x - jp.x;
    const dy = gp.y - jp.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const boost = 1 + 2.2 * Math.min(1, t / 1400);
    const LANES = 7;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(160,210,255,.9)';
    ctx.shadowBlur = 8;
    for (let k = 0; k < LANES; k++) {
      const lane = (k - (LANES - 1) / 2) * 0.1 * u;
      const speed = (0.0007 + 0.00018 * ((k * 5) % 4)) * boost;
      const s0 = (((k * 0.37 + t * speed) % 1) + 1) % 1;
      const tail = 0.16 + 0.05 * (k % 3);
      const a0 = Math.max(0, s0 - tail);
      const env = Math.sin(Math.PI * s0);
      const sway = (r: number): number => Math.sin(r * 7 + k * 1.7 + t / 160) * 0.05 * u;
      ctx.beginPath();
      const STEPS = 6;
      for (let q = 0; q <= STEPS; q++) {
        const r = a0 + ((s0 - a0) * q) / STEPS;
        const off = lane + sway(r);
        const px = jp.x + dx * r + nx * off;
        const py = jp.y + dy * r + ny * off;
        if (q === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(255,255,255,${(0.85 * env * beamOn).toFixed(3)})`;
      ctx.lineWidth = 2 + (k % 3);
      ctx.stroke();
    }
    ctx.restore();
    // vòng hút thu nhỏ dần về phía nam châm
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 2; k++) {
      const r = ((t / 520 + k * 0.5) % 1);
      ctx.globalAlpha *= 1;
      ctx.save();
      ctx.globalAlpha = (1 - out) * beamOn * Math.sin(Math.PI * r) * 0.8;
      ctx.beginPath();
      ctx.arc(gp.x, gp.y, u * (0.95 - 0.7 * r), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  // nam châm: to dần bằng easeOutBack, rung nhẹ trong lúc hút
  const jitter = beamOn > 0.05 && out === 0 ? Math.sin(now / 28) * 1.6 : 0;
  // nam châm nằm ngay trên cửa; cửa sát mép màn hình thì dịch vào vừa đủ để không bị cắt
  const half = u * 0.5;
  const mx = Math.min(w - half - 4, Math.max(half + 4, gp.x));
  const my = Math.min(h - half - 4, Math.max(half + 4, gp.y));
  ctx.translate(mx + jitter, my);
  ctx.scale(Math.max(0, pop), Math.max(0, pop));
  drawBoosterIcon(ctx, 'magnet', 0, 0, u * 0.5);
  ctx.restore();
}

/** Khung chữ hướng dẫn ở đầu màn hình và bàn tay chỉ (cú vuốt, kéo ngược hoặc chạm). Mọi thứ hiện/tắt theo `tutAmt`. */
function drawTutorial(now: number, w: number, h: number): void {
  const st = tutShow;
  const A = tutAmt;
  if (!st || A <= 0.002 || !scene) return;
  // booster: nút của bước được vẽ lại sáng trên lớp tối (như lúc chọn mục tiêu)
  const slotIdx = st.kind === 'booster' ? BOOSTERS.findIndex((q) => q.key === st.key) : -1;
  if (st.kind === 'booster') drawBoosterSlot(ctx, slotX(w, slotIdx), slotY(h), 27, st.key, slotState(st.key, now));
  const isArmed = st.kind === 'booster' && armed === st.key;
  // chữ hướng dẫn (đã có biểu ngữ riêng khi booster đang chờ chọn mục tiêu)
  const textA = A * (1 - armAmt);
  if (textA > 0.002) {
    const text = st.kind === 'booster' ? `Chạm ${defOf(st.key).name}!` : st.text;
    const nudge = Math.max(0, 1 - (now - tutNudgeT) / 380);
    const pop = 1 + 0.12 * Math.sin(nudge * Math.PI * 3) * nudge;
    ctx.save();
    ctx.globalAlpha = textA;
    let tutSize = 30;
    ctx.font = K.font(tutSize);
    let lines = wrapLines(text, w - 48);
    if (lines.length > 2) {
      tutSize = 25;
      ctx.font = K.font(tutSize);
      lines = wrapLines(text, w - 48);
    }
    const cy = Math.max(safeTop + 62, TOP_BAR_H * 0.5 + 14);
    ctx.translate(w / 2, cy);
    ctx.scale(pop, pop);
    lines.forEach((ln, i) => K.strokedText(ctx, ln, 0, (i - (lines.length - 1) / 2) * (tutSize + 6), tutSize, '#ffffff', '#204f8f', 'center', 0.5));
    ctx.restore();
  }
  // bàn tay
  const period = 1700;
  const u = ((now - tutT0) % period) / period;
  const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const seg = (a: number, b: number): number => Math.max(0, Math.min(1, (u - a) / (b - a)));
  let from: { x: number; y: number } | null = null;
  let to: { x: number; y: number } | null = null;
  let tap = false;
  if (st.kind === 'slide' || st.kind === 'undo') {
    const c0 = scene.cellScreen(st.from.x, st.from.y);
    const dv = DELTA[st.dir];
    const c1 = scene.cellScreen(st.from.x + dv.x, st.from.y + dv.y);
    if (c0 && c1) {
      from = { x: c0.x, y: c0.y - 8 };
      to = { x: c0.x + (c1.x - c0.x) * 1.8, y: c0.y - 8 + (c1.y - c0.y) * 1.8 };
    }
  } else {
    tap = true;
    const mv = st.move;
    const sp = { x: slotX(w, slotIdx), y: slotY(h) };
    if (!isArmed) to = sp;
    else if (mv.kind === 'pin' || mv.kind === 'bomb') to = scene.cellScreen(mv.x, mv.y);
    else if (mv.kind === 'magnet') {
      const bp = state.balls[mv.id];
      to = bp ? scene.cellScreen(bp.x, bp.y) : null;
    } else if (mv.kind === 'basket') to = scene.gateScreen(mv.side, mv.index, mv.depth);
  }
  if (tap && to) {
    // chạm: tay từ dưới-phải trượt tới, ấn xuống, rồi toả một vòng sóng
    const a = ease(seg(0, 0.3));
    const pr = seg(0.3, 0.42) * (1 - seg(0.55, 0.68));
    const fade = Math.min(1, seg(0, 0.15) * 4) * (1 - seg(0.8, 1));
    drawHand(to.x + (1 - a) * 46, to.y + (1 - a) * 60, A * fade, pr);
    const rp = seg(0.42, 0.85);
    if (rp > 0 && rp < 1) {
      ctx.save();
      ctx.globalAlpha = A * (1 - rp) * 0.9;
      ctx.strokeStyle = '#ffd93b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(to.x, to.y, 10 + 34 * rp, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  } else if (from && to) {
    // vuốt: tay chạm xuống ở khối, kéo theo hướng cần vuốt (vạch chấm báo đường), rồi nhả và mờ đi
    const a = ease(seg(0.12, 0.62));
    const fade = Math.min(1, seg(0, 0.12) * 3) * (1 - seg(0.78, 0.95));
    const hx = from.x + (to.x - from.x) * a;
    const hy = from.y + (to.y - from.y) * a;
    ctx.save();
    ctx.globalAlpha = A * fade * 0.9;
    ctx.strokeStyle = '#ffd93b';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.setLineDash([1, 14]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.restore();
    drawHand(hx, hy, A * fade, seg(0.05, 0.12) * (1 - seg(0.7, 0.78)) * 0.6 + 0.4 * (a > 0 && a < 1 ? 1 : 0));
  }
}

/**
 * Booster đang chờ chọn mục tiêu: HUD (thanh trên, thanh dưới, bánh răng) tối đi, riêng nút booster đang dùng được vẽ lại sáng
 * lên trên cùng; đầu màn hình hiện biểu tượng, tên và dòng hướng dẫn. Bàn chơi do cảnh 3D tự làm tối và vẽ lại các mục tiêu hợp lệ
 * (xem FocusDesc). Mọi thứ hiện/tắt theo `armAmt`.
 */
function drawArmedOverlay(now: number, w: number, h: number): void {
  const key = armShow;
  const A = armAmt;
  if (!key) return;
  const def = defOf(key);
  const slotIdx = BOOSTERS.findIndex((q) => q.key === key);

  // chính nút booster đang dùng, vẽ MỘT lần ở lớp nằm trên lớp tối (không đổi kiểu, chỉ có quầng sáng)
  drawBoosterSlot(ctx, slotX(w, slotIdx), slotY(h), 27, key, slotState(key, now));
  if (A <= 0.002) return;

  // đầu màn hình: biểu tượng booster, tên và dòng hướng dẫn
  ctx.save();
  ctx.globalAlpha = A;
  const pulse = 0.5 + 0.5 * Math.sin(now / 260);
  const cy = Math.max(safeTop + 62, TOP_BAR_H * 0.5 + 14);
  const iconX = 66;
  const glow = ctx.createRadialGradient(iconX, cy, 10, iconX, cy, 78);
  glow.addColorStop(0, `rgba(255,224,110,${0.45 + 0.25 * pulse})`);
  glow.addColorStop(1, 'rgba(255,224,110,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(iconX, cy, 78, 0, Math.PI * 2);
  ctx.fill();
  drawBoosterIcon(ctx, key, iconX, cy, 52);
  const tx = iconX + 70;
  K.strokedText(ctx, `${def.name}!`, tx, cy - 26, 34, '#ffd93b', '#8a4300', 'left');
  ctx.font = K.font(18);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  wrapLines(def.hint, w - tx - 16).forEach((ln, i) => ctx.fillText(ln, tx, cy + 6 + i * 22));
  ctx.restore();
}

function wrapLines(text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const t = cur ? `${cur} ${word}` : word;
    if (cur && ctx.measureText(t).width > maxW) {
      lines.push(cur);
      cur = word;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Popup booster: "New Booster!" khi mở khoá (tặng quà) hoặc "hết hàng" để xem quảng cáo nhận thêm. */
function drawBoosterModal(now: number, w: number, h: number, m: ModalState, fade: number): void {
  if (!m.key) return;
  const key = m.key;
  const def = defOf(key);
  const isNew = m.kind === 'new';
  drawModalFrame(now, w, h, m, fade, {
    title: isNew ? 'Vật phẩm mới!' : 'Mua vật phẩm',
    panelTitle: def.name,
    compact: true,
    bigPanelTitle: !isNew,
    button: { label: isNew ? 'Tiếp tục' : m.busy ? 'Đang tải…' : 'Nhận mình gà +1', press: pressOf('modal:primary') },
    close: isNew ? undefined : { press: pressOf('modal:secondary') },
    content: (c, x, y, pw, draw) => {
      const slot = pw * 0.24;
      c.save();
      c.font = K.font(16);
      const lines = wrapLines(isNew ? def.desc : m.note ?? def.desc, pw);
      c.restore();
      const lineH = isNew ? 21 : 20;
      const gap = isNew ? 12 : 16; // popup giới thiệu: cùng nhịp với popup cơ chế mới
      if (draw) {
        // chỉ biểu tượng gốc, không có ô/khung xanh phía sau
        drawBoosterIcon(c, key, x + pw / 2, y + slot / 2, slot * 0.58);
        c.fillStyle = m.note && !isNew ? '#a01a22' : '#265799';
        c.font = K.font(16);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        lines.forEach((ln, i) => c.fillText(ln, x + pw / 2, y + slot + gap + lineH / 2 + i * lineH));
      }
      return slot + (isNew ? 6 : 5) + gap + lines.length * lineH;
    },
  });
}

/** Độ chớp sáng của cổng: dâng nhanh lúc luồng sáng tới (t = 0) rồi tắt dần. */
function wildFlash(t: number): number {
  const ms = t / SLOW;
  if (ms < 0) return 0;
  return ms < 70 ? ms / 70 : Math.max(0, 1 - (ms - 70) / 330);
}

/** Luồng sáng cầu vồng bay cong từ nút Chọn giỏ vào cổng, rồi nổ ra vài tia sáng ở cổng. */
function drawWildStream(now: number, w: number, h: number): void {
  const fxw = wildFx;
  if (!fxw || !scene) return;
  const g = scene.gateScreen(fxw.side, fxw.index, fxw.depth);
  if (!g) return;
  const p0 = { x: slotX(w, fxw.slotIdx), y: slotY(h) };
  const c = { x: (p0.x + g.x) / 2 - (g.x - p0.x) * 0.1, y: Math.min(p0.y, g.y) - 150 };
  const at = (u: number): { x: number; y: number } => ({
    x: (1 - u) * (1 - u) * p0.x + 2 * (1 - u) * u * c.x + u * u * g.x,
    y: (1 - u) * (1 - u) * p0.y + 2 * (1 - u) * u * c.y + u * u * g.y,
  });
  const el = (now - fxw.t0) / SLOW;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (el < WILD_FLY_MS) {
    const raw = el / WILD_FLY_MS;
    const u = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2; // chậm - nhanh - chậm
    // vệt đuôi: vài chấm tròn phẳng nhiều màu (không dùng gradient từng chấm cho nhẹ), nhỏ dần và mờ dần về phía đuôi
    const N = 6;
    for (let k = N; k >= 0; k--) {
      const uu = Math.max(0, u - k * 0.055);
      const q = at(uu);
      const f = 1 - k / (N + 1);
      const r = 5 + 11 * f * f;
      ctx.globalAlpha = Math.pow(f, 1.3) * 0.55 * Math.min(1, el / 80);
      ctx.fillStyle = `hsl(${(uu * 420 + k * 40) % 360},100%,62%)`;
      ctx.beginPath();
      ctx.arc(q.x, q.y, r * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    const hd = at(u);
    const hg = ctx.createRadialGradient(hd.x, hd.y, 0, hd.x, hd.y, 22);
    hg.addColorStop(0, 'rgba(255,255,255,1)');
    hg.addColorStop(0.4, 'rgba(255,240,170,0.8)');
    hg.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hd.x, hd.y, 22, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // tới cổng: vòng sáng nở ra và các tia sáng bắn toả
    const b = Math.min(1, (el - WILD_FLY_MS) / WILD_BURST_MS);
    const e = 1 - Math.pow(1 - b, 3);
    ctx.globalAlpha = (1 - b) * 0.9;
    ctx.strokeStyle = '#fff3b0';
    ctx.lineWidth = 5 * (1 - b) + 1;
    ctx.beginPath();
    ctx.arc(g.x, g.y, 14 + 56 * e, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const d = 18 + 60 * e * (0.7 + 0.3 * ((k * 5) % 3) / 2);
      const q = { x: g.x + Math.cos(a) * d, y: g.y + Math.sin(a) * d };
      ctx.globalAlpha = (1 - b) * 0.95;
      ctx.fillStyle = `hsl(${(k * 60) % 360},95%,64%)`;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 4.5 * (1 - b) + 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Thạch rung nhẹ khi đứng yên: nhún lên xuống và lắc ngang hơi lệch pha, mỗi khối một pha riêng. Tắt khi người dùng chọn giảm chuyển động. */
const WOBBLE_ON = !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
function idleWobble(id: string, now: number): { sx: number; sy: number; sz: number } {
  if (!WOBBLE_ON) return { sx: 1, sy: 1, sz: 1 };
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 628;
  const ph = h / 100;
  const t = now / 1000;
  const a = 0.022 * Math.sin(t * 2.6 + ph);
  const b = 0.012 * Math.sin(t * 3.4 + ph * 1.7);
  return { sx: 1 - a * 0.6 + b, sy: 1 + a, sz: 1 - a * 0.6 - b };
}
let wobbleTimer = 0;

function frame(): void {
  raf = 0;
  const now = performance.now();
  if (wildFx && now - wildFx.t0 > (WILD_FLY_MS + WILD_BURST_MS) * SLOW) wildFx = null;
  if (fx) {
    const el = now - fx.t0;
    if (!fx.applied && el >= BOMB_DROP_S * 1000 * SLOW) applyBomb(now);
    if (fx.applied && el >= (BOMB_DROP_S + 0.6) * 1000 * SLOW) {
      fx = null;
      if (!anim) finishIfOver();
    }
  }
  if (anim && now >= anim.t0 + anim.dur) {
    const done = anim;
    anim = null;
    if (done.impact) {
      impacts.push({ id: done.id, dx: done.dirV.x, dy: done.dirV.y, t0: now, amp: done.impact.amp, kind: 'hit' });
      for (const be of done.impact.bumpExtra ?? []) impacts.push({ id: be.id, dx: done.dirV.x, dy: done.dirV.y, t0: now + be.delay, amp: be.amp, kind: 'bump' });
      for (const bc of done.impact.bumpCells ?? []) impacts.push({ id: `trail:${bc.x},${bc.y}`, dx: done.dirV.x, dy: done.dirV.y, t0: now + bc.delay, amp: bc.amp, kind: 'bump' });
      if (done.impact.bumpId) impacts.push({ id: done.impact.bumpId, dx: done.dirV.x, dy: done.dirV.y, t0: now, amp: done.impact.amp * 0.9, kind: 'bump' });
    }
    draw(now);
    finishIfOver();
  } else {
    draw(now);
  }
  if (introActive(now) || anim || fx || wildFx || armed || armAmt !== 0 || tutAmt !== 0 || tutCur() || uiBusy || (modalOut && now - modalOut.t0 < MODAL_OUT_MS) || pushAnims.size || pinBusy || pinDying.length || (toast && now < toast.until) || dissolves.length || trailBusy || scene?.animating() || shake || drag || (modal && (modal.kind === 'win' || now - modal.t0 < 400)) || now - menu.t0 < 700 || impacts.length > 0 || (ended && now - endedAt < 1200) || loseBanner || winShow || boardExit || magnetFx || confetti.active || impactFx.active) invalidate();
  else if (WOBBLE_ON && !wobbleTimer && !modal && !document.hidden && state && status(state) === 'playing') {
    // chỉ còn thạch rung nhẹ: vẽ khoảng 24 khung/giây cho nhẹ máy
    wobbleTimer = window.setTimeout(() => {
      wobbleTimer = 0;
      invalidate();
    }, 41);
  }
}

function invalidate(): void {
  if (!raf) raf = requestAnimationFrame(frame);
}

// ---------- Nhập liệu ----------

function pointer(e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

/**
 * Một nút của HUD hoặc popup tại một điểm: `id` để so sánh lúc nhả chuột, `act` là việc làm khi bấm trọn vẹn. Giống nút bình thường:
 * chỉ gọi `act` khi nhả chuột đúng trên chính nút đã nhấn xuống, nhấn rồi kéo ra ngoài nhả thì không làm gì.
 */
interface HudButton {
  id: string;
  act: () => void;
}

function buttonAt(x: number, y: number): HudButton | null {
  if (introActive()) return null;
  if ((newQueue.length || pendingMech) && !modal) return null; // popup giới thiệu sắp hiện: chưa nhận thao tác nào
  if ((loseBanner || winShow) && !modal) return null; // chữ "Out of Moves" / logo thắng đang chạy: chưa nhận bấm
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (modal) {
    if (performance.now() - modal.t0 < 170) return null; // chờ popup hiện ra rồi mới nhận bấm
    const hit = modalButtons.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    return hit ? { id: `modal:${hit.id}`, act: () => modalAction(hit.id) } : null;
  }
  if (armed) {
    // HUD đã tối: chỉ nút booster đang dùng (bấm lại để huỷ) là nút
    const key = armed;
    const si = BOOSTERS.findIndex((_, i) => Math.hypot(x - slotX(w, i), y - slotY(h)) <= 36);
    return si >= 0 && BOOSTERS[si].key === key ? { id: `slot:${key}`, act: () => onBoosterTap(key) } : null;
  }
  const tst = tutCur();
  if (tst) {
    // hướng dẫn: chỉ nút booster của bước hiện tại là bấm được
    if (tst.kind !== 'booster') return null;
    const ti = BOOSTERS.findIndex((_, i) => Math.hypot(x - slotX(w, i), y - slotY(h)) <= 36);
    return ti >= 0 && BOOSTERS[ti].key === tst.key ? { id: `slot:${tst.key}`, act: () => onBoosterTap(tst.key) } : null;
  }
  const gb = gearButton(w, h);
  const onGear = Math.hypot(x - gb.cx, y - gb.cy) <= gb.r + 6;
  if (menu.open) {
    const item = MENU_ORDER.find((_, i) => {
      const q = menuItemPos(w, h, i);
      return Math.hypot(x - q.x, y - q.y) <= gb.r + 6;
    });
    if (item) return { id: `menu:${item}`, act: () => { if (menuAmount(performance.now()) > 0.6) pressMenuItem(item); } };
    return onGear ? { id: 'gear', act: () => setMenu(false) } : null;
  }
  if (onGear) return { id: 'gear', act: () => { if (!paused) setMenu(true); } };
  const slot = BOOSTERS.findIndex((_, i) => Math.hypot(x - slotX(w, i), y - slotY(h)) <= 33);
  if (slot >= 0) {
    const key = BOOSTERS[slot].key;
    return { id: `slot:${key}`, act: () => onBoosterTap(key) };
  }
  return null;
}

/** Nút đang được nhấn giữ (chờ nhả chuột để biết có bấm trọn vẹn không). */
let pendingBtn: HudButton | null = null;

canvas.addEventListener('pointerdown', (e) => {
  // chạm sau cú đập của màn trình diễn thắng: bỏ qua tới popup
  if (winShow && performance.now() - winShow.t0 >= LOGO_IMPACT_MS) return skipWin();
  const { x, y } = pointer(e);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const btn = buttonAt(x, y);
  if (btn) {
    pendingBtn = btn;
    press(btn.id);
    play('tap');
    return;
  }
  if (modal) return; // popup chặn bàn chơi
  if (menu.open) {
    setMenu(false); // bấm ra ngoài menu: đóng, không chạm vào bàn chơi
    return;
  }
  if (armed) {
    // HUD đã tối: chỉ bàn chơi nhận chạm, các nút khác không làm gì
    if (BOOSTERS.some((_, i) => Math.hypot(x - slotX(w, i), y - slotY(h)) <= 36)) return;
    onArmedTap(x, y);
    return;
  }
  if (!canAct()) return;
  const pickedId = scene?.pickBall(x, y, Object.entries(state.balls).map(([bid, p]) => ({ id: bid, x: p.x, y: p.y })));
  if (!pickedId) return;
  const tp = tutCur();
  if (tp && !((tp.kind === 'slide' || tp.kind === 'undo') && tp.id === pickedId)) return tutNudge();
  drag = { id: pickedId, sx: x, sy: y, dir: null };
  canvas.setPointerCapture(e.pointerId);
  invalidate();
});

canvas.addEventListener('pointermove', (e) => {
  if (pendingBtn) {
    // kéo ra khỏi nút thì nút nhả lên (chưa huỷ: kéo về lại thì nút lún xuống tiếp)
    const { x, y } = pointer(e);
    const over = buttonAt(x, y);
    press(over && over.id === pendingBtn.id ? pendingBtn.id : null);
    return;
  }
  if (!drag) return;
  const { x, y } = pointer(e);
  const dx = x - drag.sx;
  const dy = y - drag.sy;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < cellPx() * 0.3) drag.dir = null;
  else drag.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  invalidate();
});

function endDrag(commit: boolean): void {
  const d = drag;
  drag = null;
  if (commit && d?.dir) tryMove(d.id, d.dir);
  invalidate();
}

/** Nhả chuột: gọi nút chỉ khi nhả đúng trên nút đã nhấn xuống. */
function releaseButton(e: PointerEvent | null): void {
  const pb = pendingBtn;
  pendingBtn = null;
  press(null);
  if (!pb || !e) return;
  const { x, y } = pointer(e);
  const over = buttonAt(x, y);
  if (over && over.id === pb.id) {
    play('release');
    over.act();
  }
}
canvas.addEventListener('pointerup', () => endDrag(true));
window.addEventListener('pointerup', (e) => releaseButton(e));
window.addEventListener('pointercancel', () => releaseButton(null));
canvas.addEventListener('pointercancel', () => endDrag(false));

window.addEventListener('resize', () => {
  measureInsets();
  invalidate();
});
measureInsets();

if (import.meta.env.DEV) {
  // Chỉ để kiểm tra bằng mắt: `?level=13&play=A:down,B:right,A:undo` tự chạy chuỗi nước đi.
  const steps = (new URLSearchParams(location.search).get('play') ?? '').split(',').filter(Boolean);
  const run = (): void => {
    if (!steps.length) return;
    if (anim) {
      anim = null; // bỏ qua hoạt ảnh để chạy nhanh
      finishIfOver();
    }
    const [id, dir] = steps.shift()!.split(':');
    if (dir === 'undo') doUndo(id);
    else tryMove(id, dir as Dir);
    setTimeout(run, 50);
  };
  if (steps.length) setTimeout(run, 800);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'r') requestRestart();
    else if (e.key === 'n') startLevel(index + 1);
  });
}

/** What the studio layer attaches to. See falcon-game.ts for every member. */
/**
 * Đang bị chụp/kiểm tra tự động (trình duyệt headless của IDE: preview, thumbnail, verification) hoặc trang đang ẩn: không chờ hiệu ứng mở màn,
 * vì ảnh chụp ngay sau `startLevel` sẽ chỉ thấy nền. Người chơi thật (kể cả khi shell gọi `startLevel` để chuyển level) vẫn thấy hiệu ứng bay vào.
 */
const captureMode = (): boolean => navigator.webdriver === true || document.visibilityState === 'hidden';

export const game: FalconGame = {
  getLevelCount: () => LEVEL_COUNT,
  startLevel: (i) => startLevel(i, captureMode()),
  on: events.on,
  pause: () => { paused = true; drag = null; suspendAudio(); },
  resume: () => { paused = false; resumeAudio(); invalidate(); },
  getProgress: () => Math.round((state.out.length / state.level.balls.length) * 100),
  // Nút nhạc/âm thanh/rung trong menu cài đặt; lớp studio (nếu có) cũng đọc và đặt qua đây.
  audio: {
    set: (key, on) => {
      settings.set(key, on);
      if (key === 'music') refreshMusic();
      invalidate();
    },
    get: (key) => settings.get(key),
  },
};

// Font chữ nhúng sẵn; tải xong thì vẽ lại để chữ đổi từ font dự phòng sang Nunito.
void loadFonts().then(() => invalidate());


// Chỉ bản dev: cho script kiểm tra biết toạ độ màn hình của tâm một ô (để mô phỏng kéo thả).
if (import.meta.env.DEV) {
  // Chỉ bản dev: đặt số lượng một booster để thử trạng thái hết hàng.
  (window as unknown as { __setBooster?: (k: BoosterKey, n: number) => void }).__setBooster = (k, n) => {
    const cur = countOf(k);
    if (n > cur) addBooster(k, n - cur);
    else for (let i = cur; i > n; i--) spend(k);
    invalidate();
  };
}
if (import.meta.env.DEV) {
  // Chỉ bản dev: nạp một level tuỳ ý (thử hình dạng bàn) thay cho level hiện tại: window.__loadLevel(level).
  (window as unknown as { __loadLevel?: (l: State['level']) => void }).__loadLevel = (l) => {
    LEVELS[index] = { minMoves: 0, level: l };
    startLevel(index);
  };
}
if (import.meta.env.DEV) (window as unknown as { __audio?: { play: typeof play; renderStats: typeof renderStats; renderAll: typeof renderAllStats; renderMusic: typeof renderMusicStats } }).__audio = { play, renderStats, renderAll: renderAllStats, renderMusic: renderMusicStats };
if (import.meta.env.DEV) (window as unknown as { __stats?: () => unknown }).__stats = () => scene?.stats();
if (import.meta.env.DEV) (window as unknown as { __dropCell?: (x: number, y: number) => { x: number; y: number } | null }).__dropCell = (x, y) => scene?.cellScreen(x, y) ?? null;
