// So sánh hai đồng hồ vệt bằng solver: 'turn' (mọi nước đi làm vệt già đi) và 'owner' (chỉ khi khối chủ đi).
// Chạy: npx tsx scripts/exp-clock.ts
import { generateLevels, specForLevel, type LevelSpec } from '../src/core/generator';
import { solve } from '../src/core/solver';
import type { Level, TrailClock } from '../src/core/rules';

const CLASSES: [string, number][] = [
  ['dễ (1 khối)', 0],
  ['vừa (2 khối)', 12],
  ['khó (2-3 khối)', 26],
];
const PER_CLASS = 12;

for (const [label, idx] of CLASSES) {
  console.log(`\n== ${label} ==`);
  for (const clock of ['turn', 'owner'] as TrailClock[]) {
    const spec: LevelSpec = { ...specForLevel(idx), trailClock: clock, teach: undefined };
    const t0 = Date.now();
    const found = generateLevels(spec, PER_CLASS, 4242 + idx, 6000);
    const n = found.length;
    const avg = (f: (g: (typeof found)[number]) => number): number => (n ? found.reduce((a, g) => a + f(g), 0) / n : 0);
    // "cần vệt làm phanh": không giải được nếu cấm mọi cú dừng nhờ vệt
    const needBrake = found.filter((g) => !solve(g.level as Level, { noTrailStops: true })).length;
    // "cần hoàn tác": không giải được nếu cấm hoàn tác
    const needUndo = found.filter((g) => !solve(g.level as Level, { undo: false })).length;
    console.log(
      `${clock.padEnd(5)} sinh được ${n}/${PER_CLASS}, lượt tối thiểu TB ${avg((g) => g.minMoves).toFixed(2)}, ` +
        `phanh vệt/level ${avg((g) => g.trailStops).toFixed(2)}, cần phanh ${needBrake}/${n}, cần hoàn tác ${needUndo}/${n}, ` +
        `${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
  }
}
