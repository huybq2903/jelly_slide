// Sinh bộ level cố định từ kịch bản CAMPAIGN: `npm run gen:levels`. Cùng seed nên chạy lại ra cùng kết quả.
// Mỗi mục ghi kèm lời giải của solver (dùng cho hướng dẫn cưỡng bức) và các ý bắt buộc đo được.
import { writeFileSync } from 'node:fs';
import { CAMPAIGN } from '../src/core/campaign';
import { generateLevels } from '../src/core/generator';
import { solve } from '../src/core/solver';

const entries = [];
for (let i = 0; i < CAMPAIGN.length; i++) {
  const e = CAMPAIGN[i];
  let g = null;
  if (e.fixed) {
    const sol0 = solve(e.fixed);
    if (!sol0) throw new Error(`Level vẽ tay ${i + 1} không có lời giải`);
    g = { level: e.fixed, minMoves: sol0.moves.length, needs: { brake: false, undo: false }, boosterSolution: e.unlocks ? solve(e.fixed, { boosters: { [e.unlocks]: 1 } })?.moves : undefined, helps: e.unlocks } as unknown as ReturnType<typeof generateLevels>[number];
  }
  for (let k = 0; k < 6 && !g; k++) [g] = generateLevels(e.spec, 1, e.seed + k * 1000, 6000);
  if (!g) throw new Error(`Không sinh được level ${i + 1}: ${e.concept}`);
  // lời giải mẫu: có booster giúp thì dùng lời giải có booster (cho hướng dẫn), không thì lời giải thường
  const sol = g.boosterSolution ? { moves: g.boosterSolution } : solve(g.level);
  if (!sol) throw new Error(`Level ${i + 1} không có lời giải`);
  entries.push({
    minMoves: g.minMoves,
    tier: e.tier,
    concept: e.concept,
    needs: g.needs,
    ...(g.helps ? { helps: g.helps } : {}),
    ...(e.unlocks ? { unlocks: e.unlocks } : {}),
    ...(e.introduces ? { introduces: e.introduces } : {}),
    ...(e.tutorial ? { tutorial: e.tutorial } : {}),
    solution: sol.moves,
    level: g.level,
  });
  console.log(`level ${i + 1} [${e.tier}]: ${g.level.balls.length} khối, tối thiểu ${g.minMoves}, tối đa ${g.level.maxMoves}, cần ${JSON.stringify(g.needs)}`);
}
writeFileSync(new URL('../src/levels.json', import.meta.url), JSON.stringify(entries, null, 1) + '\n');
