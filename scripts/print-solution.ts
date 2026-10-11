// In lời giải của một level dưới dạng chuỗi cho `?play=`: `npx tsx scripts/print-solution.ts 13`
import { solve } from '../src/core/solver';
import { LEVELS } from '../src/levels';

const n = Number(process.argv[2]);
const sol = solve(LEVELS[n - 1].level);
console.log(sol ? sol.moves.map((m) => (m.kind === 'undo' ? `${m.id}:undo` : `${m.id}:${m.dir}`)).join(',') : 'không có lời giải');
