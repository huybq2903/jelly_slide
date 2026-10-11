// Thí nghiệm: xoá vệt của khối vừa bị hút ra (clearTrailsOnExit: true, mặc định của game) khác gì giữ vệt (false)?
// Chạy: npx tsx scripts/exp-clear-trails.ts
import { candidate, rng, type LevelSpec } from '../src/core/generator';
import { adjacentGate, type Level } from '../src/core/rules';
import { solve } from '../src/core/solver';

interface Row { len: number; brakeNeeded: boolean }

function measure(level: Level): Row | null {
  const sol = solve(level);
  if (!sol) return null;
  // "cần phanh": với số lượt cho phép = tối thiểu + 2, cấm dừng nhờ vệt thì không thắng nổi
  const withSlack = { ...level, maxMoves: sol.length + 2 };
  return { len: sol.length, brakeNeeded: solve(withSlack, { noTrailStops: true }) === null };
}

function run(name: string, spec: LevelSpec, n: number, seed: number): void {
  const rand = rng(seed);
  let total = 0;
  const off: (Row | null)[] = [];
  const on: (Row | null)[] = [];
  while (total < n) {
    const cand = candidate(spec, rand);
    if (cand.balls.some((b) => adjacentGate(cand, b.id, b.x, b.y))) continue;
    total++;
    off.push(measure({ ...cand, clearTrailsOnExit: false }));
    on.push(measure({ ...cand, clearTrailsOnExit: true }));
  }
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(0) + '%' : '-');
  const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '-');
  const solvOff = off.filter(Boolean) as Row[];
  const solvOn = on.filter(Boolean) as Row[];
  const both = off.map((o, i) => [o, on[i]] as const).filter(([o, c]) => o && c) as [Row, Row][];
  const interesting = (rs: Row[]) => rs.filter((r) => r.len >= 5 && r.len <= 8).length;
  console.log(`\n== ${name} (${total} level ngẫu nhiên, tối đa ${spec.maxMoves} lượt) ==`);
  console.log(`giải được:             giữ vệt ${pct(solvOff.length, total)} (${solvOff.length}) | xoá vệt ${pct(solvOn.length, total)} (${solvOn.length})`);
  console.log(`lượt tối thiểu TB:     giữ ${mean(solvOff.map((r) => r.len))} | xoá ${mean(solvOn.map((r) => r.len))}`);
  console.log(`cùng giải được ${both.length} level: xoá ngắn hơn ${both.filter(([o, c]) => c.len < o.len).length}, dài hơn ${both.filter(([o, c]) => c.len > o.len).length}, bằng ${both.filter(([o, c]) => c.len === o.len).length}`);
  console.log(`cần dừng nhờ vệt:      giữ ${pct(solvOff.filter((r) => r.brakeNeeded).length, solvOff.length)} | xoá ${pct(solvOn.filter((r) => r.brakeNeeded).length, solvOn.length)}  (trong số level giải được)`);
  console.log(`level 5–8 lượt:        giữ ${interesting(solvOff)} | xoá ${interesting(solvOn)}  (trên ${total} level)`);
  console.log(`vừa 5–8 lượt vừa cần phanh: giữ ${solvOff.filter((r) => r.len >= 5 && r.len <= 8 && r.brakeNeeded).length} | xoá ${solvOn.filter((r) => r.len >= 5 && r.len <= 8 && r.brakeNeeded).length}`);
}

const board = { width: 5, height: 5 };
run('2 khối', { ...board, balls: 2, walls: [2, 4], trailLife: 2, minMoves: 1, maxMoves: 9, slack: 2 }, 500, 42);
run('3 khối', { ...board, balls: 3, walls: [3, 5], trailLife: 2, minMoves: 1, maxMoves: 9, slack: 2 }, 150, 43);
