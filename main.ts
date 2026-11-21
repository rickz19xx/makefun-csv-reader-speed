// The harness runs `node /bot/main.ts` (node22/26). It reads every case from /input/cases.json (a JSON array of
// {id, input}), answers each one alone with solve.js, and writes /output/answers.json: a JSON array of the answers,
// one per case and in the cases' order. Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for
// /input and /output.

import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off, set before solve.js is imported so all of its work runs under it (the rules: the house
// baseline runs with --no-incremental-marking, and an entry may tune V8's flags too).
setFlagsFromString('--no-incremental-marking');

/**
 * solve.js, imported by its URL (a .js module carries no types) and typed by its contract. answer() is run()'s answer
 * as its JSON text (run() is answer() read back), so a case is answered once and written as it stands.
 */
const { answer, warm } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  answer: (input: unknown) => string;
  warm: (bytes: number, reps: number) => number;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// cases.json carries its non-ASCII as plain UTF-8 and escapes only quotes, backslashes and line breaks, so reading and
// writing its bytes as one-byte chars (latin1) keeps every byte of every answer while the reader moves half the memory
// a UTF-16 copy would. solve.js works the same either way: it drops a leading U+FEFF in both of its forms.
const cases = JSON.parse(readFileSync(INPUT_DIR + '/cases.json', 'latin1')) as { id: string; input: unknown }[];

// The reader's own paths are exercised once on synthetic text so that no case pays for the first-time JIT work;
// nothing of any case's answer is kept.
const [wb, wr] = (process.env.MAKEFUN_WARM ?? '65536,1').split(',').map(Number);
if (wb > 0) warm(wb, wr);

// The answers are written as they are read: '[' + answer ',' answer ... + ']', which is the array of the answers.
const fd = openSync(OUTPUT_DIR + '/answers.json', 'w');
writeSync(fd, '[');
for (let i = 0; i < cases.length; i++) {
  if (i > 0) writeSync(fd, ',');
  writeSync(fd, answer(cases[i].input), null, 'latin1');
}
writeSync(fd, ']');
closeSync(fd);
