// Sinh level: ngẫu nhiên theo seed -> chạy solver -> lọc theo thang độ khó.

import { adjacentGate, boardCells, gateCell, validateLevel, type Dir, type Level, type Pos, type TrailClock } from './rules';
import { shapeMask, type ShapeDef } from './shapes';
import { SolverLimit, featuresUsed, solve as rawSolve, type BoosterKey, type Move, type SolveOptions } from './solver';

/** Giới hạn số nút của solver khi sinh level: vượt thì bỏ ứng viên. */
const GEN_NODE_CAP = 150000;
const solve = (level: Level, opts: SolveOptions = {}): ReturnType<typeof rawSolve> => rawSolve(level, { maxNodes: GEN_NODE_CAP, ...opts });

export interface LevelSpec {
  width: number;
  height: number;
  balls: number;
  /** Số màu khác nhau (mặc định mỗi khối một màu). Ít hơn số khối thì các khối chia nhau màu (và cửa tương ứng): dùng cho màn thạch ẩn để màu của khối ẩn không suy ra ngay được. */
  colors?: number;
  /** Số khối là thạch một trục (chọn ngẫu nhiên trục ngang/dọc). */
  oneAxis?: number;
  /** Số ô dính, số ô mũi tên, số CẶP cổng dịch chuyển, số thạch ẩn đặt vào bàn. */
  sticky?: number;
  arrows?: number;
  portals?: number;
  hidden?: number;
  /** Số thạch đóng băng, số cổng đóng băng (khoá 1 khối thoát), số cổng theo nhịp (chẵn/lẻ ngẫu nhiên). */
  frozen?: number;
  locks?: number;
  rhythm?: number;
  /** [ít nhất, nhiều nhất] số khối đá. */
  walls: [number, number];
  trailLife: number;
  trailClock?: TrailClock;
  /** Khoảng số lượt tối thiểu (theo solver) mà level phải có. */
  minMoves: number;
  maxMoves: number;
  /** Số lượt dư cộng vào lượt tối thiểu để ra số lượt tối đa của level. */
  slack: number;
  /**
   * 'brake': level phải *cần* dừng nhờ vệt mới thắng được trong số lượt cho phép.
   * 'undo': level phải cần hoàn tác.
   */
  teach?: 'brake' | 'undo';
  /** Hình dạng bàn (ghi đè width/height). Không khai báo = hình chữ nhật width x height. */
  shape?: ShapeDef;
  /** Yêu cầu bắt buộc (đo bằng solver) để level thuộc về một bài học. */
  require?: {
    /** Phải dùng vệt làm phanh mới thắng được trong số lượt cho phép. */
    brake?: boolean;
    /** Phải hoàn tác mới thắng được. */
    undo?: boolean;
    /** Booster này (1 cái) giúp ngắn hơn: lời giải có nó dùng booster và ít lượt hơn lời giải không có. Level luôn giải được KHÔNG cần booster. */
    boosterHelps?: BoosterKey;
    /** Hoàn tác giúp ích: lời giải ngắn nhất tận dụng hoàn tác và không có hoàn tác thì phải dài hơn (hoặc vô giải). Nhẹ hơn `undo`. */
    undoHelps?: boolean;
    /** Ô đặc biệt này thật sự giúp ích: bỏ nó đi thì giải dài hơn hoặc vô giải. */
    featureHelps?: 'sticky' | 'arrows' | 'portals';
    /** Khoá/nhịp của cổng thật sự làm lời giải dài hơn (tốn thêm một lần giải: chỉ bật cho level giới thiệu). */
    gateMatters?: boolean;
    /** Giới hạn một trục thật sự làm level dài hơn: bỏ giới hạn thì giải được ngắn hơn. */
    axisMatters?: boolean;
    /** Dùng vệt làm phanh giúp ích: cấm phanh thì lời giải dài hơn (hoặc vô giải). Nhẹ hơn `brake`. */
    brakeHelps?: boolean;
    /** Vệt thật sự ảnh hưởng: không có vệt (trailLife 0) thì giải được ngắn hơn. */
    trailMatters?: boolean;
  };
  /** Hạn chế: level không được cần phanh vệt / hoàn tác (để các level đầu chỉ dạy một ý). */
  forbid?: { brake?: boolean; undo?: boolean };
  /** Số lượt tối thiểu tối đa cho phép (khống chế level quá dài). Mặc định không giới hạn ngoài maxMoves. */
  maxMinMoves?: number;
  /** Số khối đá tối thiểu cách xa mọi khối (để bàn lớn không bị quá thưa). */
  coverage?: number;
}

export interface GeneratedLevel {
  level: Level;
  minMoves: number;
  trailStops: number;
  undos: number;
  /** Các ý bắt buộc đo được (khi giải KHÔNG dùng booster): phanh vệt, hoàn tác. */
  needs: { brake: boolean; undo: boolean };
  /** Booster giúp ngắn hơn (nếu spec yêu cầu) và lời giải mẫu có dùng nó, để dựng hướng dẫn. */
  helps?: BoosterKey;
  boosterSolution?: Move[];
}

const COLORS = ['pink', 'teal', 'gold', 'violet'];
const SIDES: Dir[] = ['up', 'down', 'left', 'right'];

/** PRNG mulberry32: cùng seed cho cùng dãy số. */
export function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Level ứng viên cho bàn có hình dạng: đặt khối, đá, cửa ở các ô thuộc bàn; cửa ở các mép của hình. */
function candidateShaped(spec: LevelSpec, rand: () => number): Level {
  const int = (n: number) => Math.floor(rand() * n);
  const sm = shapeMask(spec.shape!);
  const base: Level = { width: sm.width, height: sm.height, ...(sm.mask ? { mask: sm.mask } : {}), walls: [], balls: [], gates: [], maxMoves: spec.maxMoves, trailLife: spec.trailLife, ...(spec.trailClock ? { trailClock: spec.trailClock } : {}) };
  const cells = boardCells(base);
  const used = new Set<string>();
  const freeCell = () => {
    for (;;) {
      const c = cells[int(cells.length)];
      if (!used.has(`${c.x},${c.y}`)) {
        used.add(`${c.x},${c.y}`);
        return { x: c.x, y: c.y };
      }
    }
  };
  const wallCount = spec.walls[0] + int(spec.walls[1] - spec.walls[0] + 1);
  const walls = Array.from({ length: wallCount }, freeCell);
  const balls = Array.from({ length: spec.balls }, (_, i) => ({ id: String.fromCharCode(65 + i), color: COLORS[i % (spec.colors ?? COLORS.length)], ...freeCell() }));
  // mọi vị trí cửa hợp lệ: ô chơi được có láng giềng theo hướng cửa là ngoài bàn, đổi sang (cạnh bao, chỉ số, độ sâu)
  const slotsAll: { side: Dir; index: number; depth: number }[] = [];
  for (const c of cells) {
    for (const side of SIDES) {
      const d = side === 'up' ? { x: 0, y: -1 } : side === 'down' ? { x: 0, y: 1 } : side === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 };
      const nx = c.x + d.x;
      const ny = c.y + d.y;
      if (nx >= 0 && nx < base.width && ny >= 0 && ny < base.height && (sm.mask ? sm.mask[ny][nx] === '#' : true)) continue;
      slotsAll.push(side === 'up' ? { side, index: c.x, depth: c.y } : side === 'down' ? { side, index: c.x, depth: base.height - 1 - c.y } : side === 'left' ? { side, index: c.y, depth: c.x } : { side, index: c.y, depth: base.width - 1 - c.x });
    }
  }
  const taken = new Set<string>();
  // mỗi MÀU một cửa (hai khối cùng màu dùng chung cửa của màu đó)
  const distinct = [...new Set(balls.map((b) => b.color))];
  const gates = distinct.map((color) => {
    for (let guard = 0; guard < 500; guard++) {
      const sl = slotsAll[int(slotsAll.length)];
      const k = `${sl.side}${sl.index}d${sl.depth}`;
      if (!taken.has(k)) {
        taken.add(k);
        return { color, side: sl.side, index: sl.index, ...(sl.depth ? { depth: sl.depth } : {}) };
      }
    }
    throw new Error('không đặt được cửa');
  });
  return { ...base, walls, balls, gates };
}

export function candidate(spec: LevelSpec, rand: () => number): Level {
  if (spec.shape) return candidateShaped(spec, rand);
  const int = (n: number) => Math.floor(rand() * n);
  const used = new Set<string>();
  const freeCell = () => {
    for (;;) {
      const x = int(spec.width);
      const y = int(spec.height);
      if (!used.has(`${x},${y}`)) {
        used.add(`${x},${y}`);
        return { x, y };
      }
    }
  };
  const wallCount = spec.walls[0] + int(spec.walls[1] - spec.walls[0] + 1);
  const walls = Array.from({ length: wallCount }, freeCell);
  const balls = Array.from({ length: spec.balls }, (_, i) => ({ id: String.fromCharCode(65 + i), color: COLORS[i % (spec.colors ?? COLORS.length)], ...freeCell() }));
  const slots = new Set<string>();
  const gates = [...new Set(balls.map((b) => b.color))].map((color) => {
    for (;;) {
      const side = SIDES[int(4)];
      const index = int(side === 'left' || side === 'right' ? spec.height : spec.width);
      if (!slots.has(`${side}${index}`)) {
        slots.add(`${side}${index}`);
        return { color, side, index };
      }
    }
  });
  return { width: spec.width, height: spec.height, walls, balls, gates, maxMoves: spec.maxMoves, trailLife: spec.trailLife, ...(spec.trailClock ? { trailClock: spec.trailClock } : {}) };
}

/** Gán trục cho `n` khối đầu (đã xáo ngẫu nhiên theo `rand`): thạch một trục. */
function withAxis(level: Level, n: number, rand: () => number): Level {
  if (n <= 0) return level;
  const order = level.balls.map((_, i) => i).sort(() => rand() - 0.5);
  const pick = new Set(order.slice(0, n));
  return { ...level, balls: level.balls.map((b, i) => (pick.has(i) ? { ...b, axis: rand() < 0.5 ? ('h' as const) : ('v' as const) } : b)) };
}

/** Đặt ô dính, ô mũi tên, cổng dịch chuyển và thạch ẩn vào các ô trống của level (không đè đá, khối, hay nhau). */
function withFeatures(level: Level, spec: LevelSpec, rand: () => number): Level {
  const nS = spec.sticky ?? 0;
  const nA = spec.arrows ?? 0;
  const nP = spec.portals ?? 0;
  const nH = spec.hidden ?? 0;
  const nF = spec.frozen ?? 0;
  const nL = spec.locks ?? 0;
  const nR = spec.rhythm ?? 0;
  if (!nS && !nA && !nP && !nH && !nF && !nL && !nR) return level;
  const used = new Set<string>([...level.walls, ...level.balls].map((q) => `${q.x},${q.y}`));
  const free = boardCells(level).filter((c) => !used.has(`${c.x},${c.y}`));
  const take = (): Pos => {
    const i = Math.floor(rand() * free.length);
    return free.splice(i, 1)[0];
  };
  if (free.length < nS + nA + 2 * nP) return level;
  const out: Level = { ...level };
  if (nS) out.sticky = Array.from({ length: nS }, take);
  if (nA) out.arrows = Array.from({ length: nA }, () => ({ ...take(), dir: SIDES[Math.floor(rand() * 4)] }));
  if (nP) out.portals = Array.from({ length: nP }, () => ({ a: take(), b: take() }));
  if (nH) {
    const order = level.balls.map((_, i) => i).sort(() => rand() - 0.5);
    const pick = new Set(order.slice(0, Math.min(nH, level.balls.length - 1)));
    out.balls = level.balls.map((b, i) => (pick.has(i) ? { ...b, hidden: true } : b));
  }
  if (nF) {
    const order = level.balls.map((_, i) => i).sort(() => rand() - 0.5);
    const pick = new Set(order.slice(0, Math.min(nF, level.balls.length - 1)));
    out.balls = out.balls.map((b, i) => (pick.has(i) ? { ...b, frozen: true } : b));
  }
  if (nL || nR) {
    const order = level.gates.map((_, i) => i).sort(() => rand() - 0.5);
    const locked = new Set(order.slice(0, Math.min(nL, level.gates.length - 1)));
    const rhy = new Set(order.filter((i) => !locked.has(i)).slice(0, nR));
    out.gates = level.gates.map((g, i) => ({ ...g, ...(locked.has(i) ? { lock: 1 } : {}), ...(rhy.has(i) ? { rhythm: rand() < 0.5 ? ('even' as const) : ('odd' as const) } : {}) }));
  }
  return out;
}

/** Bản của level không có khoá/nhịp của cổng (để so độ dài lời giải). */
function stripGates(level: Level, which: 'lock' | 'rhythm'): Level {
  return { ...level, gates: level.gates.map((g) => {
    const { [which]: _r, ...rest } = g;
    return rest;
  }) };
}

/** Bản của level không có ô đặc biệt (để so độ dài lời giải). */
function stripFeatures(level: Level, which: 'sticky' | 'arrows' | 'portals'): Level {
  const { [which]: _removed, ...rest } = level;
  return rest as Level;
}

/** Bản của level không có giới hạn một trục (để so độ dài lời giải). */
function stripAxis(level: Level): Level {
  return { ...level, balls: level.balls.map((b) => ({ id: b.id, color: b.color, x: b.x, y: b.y })) };
}

/**
 * Sinh tối đa `count` level khác nhau từ `seed`, thử tối đa `maxAttempts` ứng viên.
 * Có thể trả ít hơn `count` nếu hết lượt thử.
 */
export function generateLevels(spec: LevelSpec, count: number, seed: number, maxAttempts = 2000): GeneratedLevel[] {
  const rand = rng(seed);
  const found: GeneratedLevel[] = [];
  const seen = new Set<string>();
  for (let n = 0; n < maxAttempts && found.length < count; n++) {
    try {
      const cand = withFeatures(withAxis(candidate(spec, rand), spec.oneAxis ?? 0, rand), spec, rand);
      // Giỏ chỉ hút khối sau một cú vuốt, nên khối đứng sẵn cạnh giỏ cùng màu sẽ không tự thoát: bỏ.
      if (cand.balls.some((b) => adjacentGate(cand, b.id, b.x, b.y))) continue;
      if (spec.shape && validateLevel(cand).length) continue;
      const help = spec.require?.boosterHelps;
      let sol = solve(cand);
      if (!sol || sol.length < spec.minMoves || (spec.maxMinMoves !== undefined && sol.length > spec.maxMinMoves)) continue;
      const level: Level = { ...cand, maxMoves: sol.length + spec.slack };
      sol = solve(level) ?? sol;
      // mọi level giải được không cần booster; booster (nếu spec nêu) chỉ giúp ngắn hơn
      let boosterSol: ReturnType<typeof solve> = null;
      if (help) {
        boosterSol = solve(level, { boosters: { [help]: 1 } });
        if (!boosterSol || !boosterSol.boosters[help] || boosterSol.length >= sol.length) continue;
      }
      // level có ô đặc biệt: lời giải ngắn nhất phải thật sự dùng đến TỪNG loại có mặt; thạch một trục thì giới hạn trục phải làm lời giải dài hơn
      const present = (['sticky', 'arrows', 'portals'] as const).filter((f) => level[f]?.length);
      if (present.length) {
        const used = featuresUsed(level, sol.moves);
        if (!present.every((f) => used.has(f))) continue;
      }
      // thạch đóng băng phải thật sự được dùng (lời giải có cú làm vỡ băng); khoá/nhịp của cổng phải làm lời giải dài hơn
      if (level.balls.some((b) => b.frozen) && !featuresUsed(level, sol.moves).has('frozen')) continue;
      let gateOk = true;
      for (const gf of ['lock', 'rhythm'] as const) {
        if (!spec.require?.gateMatters || !level.gates.some((g) => g[gf])) continue;
        const free = solve(stripGates(level, gf));
        if (!free || free.length >= sol.length) gateOk = false;
      }
      if (!gateOk) continue;
      if (level.balls.some((b) => b.axis) && !spec.require?.axisMatters) {
        const free = solve(stripAxis(level));
        if (!free || free.length >= sol.length) continue;
      }
      if (spec.require?.featureHelps) {
        const free = solve(stripFeatures(level, spec.require.featureHelps));
        if (free && free.length <= sol.length) continue; // ô đặc biệt phải thật sự làm khác đi lời giải
      }
      if (spec.require?.axisMatters) {
        const free = solve(stripAxis(level));
        if (!free || free.length >= sol.length) continue; // giới hạn một trục phải làm level dài hơn
      }
      const needBrake = !solve(level, { noTrailStops: true });
      const needUndo = !solve(level, { undo: false });
      if (spec.teach === 'brake' && !needBrake) continue;
      if (spec.teach === 'undo' && !needUndo) continue;
      if (spec.require?.undoHelps) {
        const alt = solve(cand, { undo: false });
        if (!(sol.undos > 0 && (!alt || alt.length > sol.length))) continue;
      }
      if (spec.require?.trailMatters) {
        const free = solve({ ...cand, trailLife: 0 });
        if (free && free.length >= sol.length) continue;
      }
      if (spec.require?.brakeHelps) {
        const alt = solve(cand, { noTrailStops: true });
        if (!(sol.trailStops > 0 && (!alt || alt.length > sol.length))) continue;
      }
      if (spec.require?.brake && !needBrake) continue;
      if (spec.require?.undo && !needUndo) continue;
      if (spec.forbid?.brake && needBrake) continue;
      if (spec.forbid?.undo && needUndo) continue;
      const key = JSON.stringify(level);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ level, minMoves: sol.length, trailStops: sol.trailStops, undos: sol.undos, needs: { brake: needBrake, undo: needUndo }, ...(help ? { helps: help, boosterSolution: boosterSol!.moves } : {}) });
    } catch (e) {
      if (e instanceof SolverLimit) continue;
      throw e;
    }
  }
  return found;
}

/** Thang học theo mục 7.1 của tài liệu. `index` là chỉ số level, đánh số từ 0. */
export function specForLevel(index: number): LevelSpec {
  const level = index + 1;
  const board = { width: 5, height: 5 };
  if (level > 25 && level % 10 === 0) {
    return { ...board, balls: 3, walls: [3, 5], trailLife: 2, minMoves: 6, maxMoves: 9, slack: 2 + (Math.floor(level / 10) % 2) };
  }
  if (level <= 10) {
    return { ...board, balls: 1, walls: [1, 3], trailLife: 2, minMoves: level <= 3 ? 1 : 2, maxMoves: level <= 3 ? 2 : 4, slack: level <= 5 ? 3 : 2 };
  }
  if (level <= 25) {
    return { ...board, balls: 2, walls: [2, 4], trailLife: 2, minMoves: 4, maxMoves: 7, slack: 2, teach: level <= 18 ? 'brake' : 'undo' };
  }
  return { ...board, balls: 2, walls: [3, 5], trailLife: 2, minMoves: 5, maxMoves: 8, slack: 1 + (level % 2), teach: 'brake' };
}
