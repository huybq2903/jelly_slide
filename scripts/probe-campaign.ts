// Thử sinh từng level của kịch bản: in ra thành công/thất bại và thời gian. Chạy: npx tsx scripts/probe-campaign.ts [từ] [đến]
import { CAMPAIGN } from '../src/core/campaign';
import { generateLevels } from '../src/core/generator';

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 30);
for (let i = from - 1; i < to; i++) {
  const e = CAMPAIGN[i];
  const t0 = Date.now();
  let g = null;
  let used = 0;
  for (let k = 0; k < 4 && !g; k++) {
    [g] = generateLevels(e.spec, 1, e.seed + k * 1000, 4000);
    used = k;
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(g ? `L${i + 1} [${e.tier}] OK (seed+${used * 1000}) min=${g.minMoves} max=${g.level.maxMoves} needs=${JSON.stringify(g.needs)} ${dt}s` : `L${i + 1} [${e.tier}] FAIL ${dt}s — ${e.concept}`);
}
